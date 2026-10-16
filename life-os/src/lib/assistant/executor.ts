import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { isAutoApproved } from "./policy";
import { consumeToolCall, RateLimitError } from "./rate-limit";
import type { ToolContext, ToolDef, UndoSpec } from "./registry";
import { getTool } from "./tools";
import { runUndo } from "./undo";

export type ExecResult =
  | { status: "ok"; result: unknown; summary: string; activityId: string }
  | { status: "pending_approval"; approvalId: string; summary: string }
  | { status: "error"; error: string };

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

async function log(ctx: ToolContext, tool: ToolDef, summary: string, input: unknown, out: { result?: unknown; undo?: UndoSpec; ok: boolean; error?: string; approvalId?: string }) {
  return db.activityLog.create({
    data: {
      actor: ctx.actor,
      actionType: tool.actionType,
      summary,
      input: json(input),
      result: out.result === undefined ? undefined : json(out.result),
      undo: out.undo ? json(out.undo) : undefined,
      ok: out.ok,
      error: out.error,
      approvalId: out.approvalId,
    },
  });
}

/** Runs a tool by name: validate → rate limit → approval gate → execute → activity log. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ExecResult> {
  const tool = getTool(name);
  if (!tool) return { status: "error", error: `Unknown tool: ${name}` };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) return { status: "error", error: `Invalid input: ${z.prettifyError(parsed.error)}` };
  const input = parsed.data;
  try {
    await consumeToolCall();
  } catch (e) {
    if (e instanceof RateLimitError) return { status: "error", error: e.message };
    throw e;
  }
  let summary: string;
  let need: Awaited<ReturnType<NonNullable<ToolDef["approval"]>>> = null;
  try {
    // Both may look records up (and throw "not found"); report that back to the model as a tool error.
    summary = await tool.summarize(input);
    if (tool.kind === "write" && tool.approval) need = await tool.approval(input);
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  if (need) {
    if (!(await isAutoApproved(need.key, { emailCategory: need.emailCategory }))) {
      const approval = await db.pendingApproval.create({
        data: { actionType: tool.name, payload: json(input), summary, risk: need.key, conversationId: ctx.conversationId ?? null, toolUseId: ctx.toolUseId ?? null, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
      });
      return { status: "pending_approval", approvalId: approval.id, summary };
    }
  }
  return runNow(tool, input, summary, ctx);
}

async function runNow(tool: ToolDef, input: unknown, summary: string, ctx: ToolContext, approvalId?: string): Promise<ExecResult> {
  try {
    const out = await tool.run(input, ctx);
    const finalSummary = out.summary ?? summary;
    // Reads are not logged (noise); every write is.
    if (tool.kind === "read") return { status: "ok", result: out.result, summary: finalSummary, activityId: "" };
    const entry = await log(ctx, tool, finalSummary, input, { result: out.result, undo: out.undo, ok: true, approvalId });
    return { status: "ok", result: out.result, summary: finalSummary, activityId: entry.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (tool.kind === "write") await log(ctx, tool, summary, input, { ok: false, error, approvalId });
    return { status: "error", error };
  }
}

export async function approve(approvalId: string): Promise<ExecResult> {
  // Claim atomically so a double-tap can't execute twice.
  const claimed = await db.pendingApproval.updateMany({ where: { id: approvalId, status: "PENDING" }, data: { status: "APPROVED", decidedAt: new Date() } });
  if (claimed.count === 0) return { status: "error", error: "This request was already handled." };
  const a = await db.pendingApproval.findUniqueOrThrow({ where: { id: approvalId } });
  const tool = getTool(a.actionType);
  if (!tool) return { status: "error", error: `Unknown tool ${a.actionType}` };
  const parsed = tool.schema.safeParse(a.payload);
  if (!parsed.success) {
    await db.pendingApproval.update({ where: { id: a.id }, data: { status: "FAILED", error: "Stored payload no longer valid" } });
    return { status: "error", error: "Stored payload no longer valid" };
  }
  const r = await runNow(tool, parsed.data, a.summary, { actor: "ASSISTANT", conversationId: a.conversationId }, a.id);
  await db.pendingApproval.update({ where: { id: a.id }, data: r.status === "ok" ? { result: json(r.result) } : { status: "FAILED", error: r.status === "error" ? r.error : null } });
  if (a.conversationId) await notifyConversation(a.conversationId, r.status === "ok" ? `Grayden approved: ${a.summary}. Result: ${JSON.stringify(r.result).slice(0, 500)}` : `Approved but failed: ${a.summary}. Error: ${r.status === "error" ? r.error : ""}`);
  return r;
}

export async function reject(approvalId: string, reason?: string) {
  const claimed = await db.pendingApproval.updateMany({ where: { id: approvalId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date(), error: reason ?? null } });
  if (claimed.count === 0) return false;
  const a = await db.pendingApproval.findUniqueOrThrow({ where: { id: approvalId } });
  await db.activityLog.create({ data: { actor: "USER", actionType: "approval.reject", summary: `Rejected: ${a.summary}`, approvalId: a.id } });
  if (a.conversationId) await notifyConversation(a.conversationId, `Grayden rejected: ${a.summary}${reason ? ` (reason: ${reason})` : ""}. Do not retry unless asked.`);
  return true;
}

/** Approval outcomes reach the model on its next turn as a notice in the transcript (append-only). */
async function notifyConversation(conversationId: string, text: string) {
  await db.chatMessage.create({ data: { conversationId, role: "USER", content: [{ type: "text", text: `[System notice] ${text}` }] } });
}

export async function undoActivity(activityId: string) {
  const entry = await db.activityLog.findUnique({ where: { id: activityId } });
  if (!entry) throw new Error("Activity not found");
  if (entry.undoneAt) throw new Error("Already undone");
  const spec = entry.undo as UndoSpec | null;
  if (!spec) throw new Error("This action can't be undone");
  await runUndo(spec);
  await db.activityLog.update({ where: { id: activityId }, data: { undoneAt: new Date() } });
  await db.activityLog.create({ data: { actor: "USER", actionType: "activity.undo", summary: `Undid: ${entry.summary}` } });
}

export async function expireOldApprovals(now: Date = new Date()) {
  const r = await db.pendingApproval.updateMany({ where: { status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  return r.count;
}

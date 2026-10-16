import { beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { loadHistory, runTurn, visibleText, type AgentEvent, type ModelFn } from "@/lib/assistant/agent";
import { approve } from "@/lib/assistant/executor";
import { resetMockCalendar } from "@/lib/integrations/google/calendar";
import { mockSentMessages, resetMockGmail } from "@/lib/integrations/google/gmail";
import { syncAndTriage } from "@/lib/services/mail";
import { resetDb } from "../../setup/db";

type Block = Anthropic.Beta.BetaContentBlock;
const usage = { input_tokens: 10, output_tokens: 5 };
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Block;
const toolUse = (id: string, name: string, input: object) => ({ type: "tool_use", id, name, input }) as unknown as Block;

/** Scripted model: returns queued responses in order and records what it was sent. */
function scripted(responses: Block[][]) {
  const calls: Anthropic.Beta.BetaMessageParam[][] = [];
  const fn: ModelFn = async ({ messages }, onText) => {
    calls.push(messages);
    const content = responses.shift() ?? [text("(no more script)")];
    for (const b of content) if (b.type === "text") onText(b.text);
    return { content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", usage, model: "scripted" };
  };
  return { fn, calls };
}

beforeEach(async () => {
  await resetDb();
  resetMockGmail();
  resetMockCalendar();
});

describe("agent loop", () => {
  it("runs tools, feeds results back, and persists an append-only transcript", async () => {
    const s = scripted([[text("Creating it."), toolUse("tu1", "task_create", { title: "Call Linda", priority: 1 })], [text("Done: added Call Linda.")]]);
    const events: AgentEvent[] = [];
    const { conversationId } = await runTurn({ text: "add a task to call Linda", emit: (e) => events.push(e), model: s.fn });
    expect(await db.task.count({ where: { title: "Call Linda" } })).toBe(1);
    expect(events.some((e) => e.type === "tool" && e.status === "ok")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done" });
    // Second model call saw the tool_result right after the tool_use.
    const second = s.calls[1] ?? [];
    expect(second.at(-2)?.role).toBe("assistant");
    const results = second.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0]?.tool_use_id).toBe("tu1");
    // User turn carries a context block plus the text; UI hides the context.
    const firstUser = await db.chatMessage.findFirstOrThrow({ where: { conversationId, role: "USER" }, orderBy: { createdAt: "asc" } });
    expect(visibleText(firstUser.content)).toBe("add a task to call Linda");
    expect(JSON.stringify(firstUser.content)).toContain("<context>");
    expect(await db.chatMessage.count({ where: { conversationId } })).toBe(4);
  });

  it("gated actions return pending_approval; approval executes and notifies the conversation", async () => {
    await syncAndTriage();
    const thread = await db.emailThread.findFirstOrThrow({ where: { subject: { contains: "Ocotillo" } } });
    const s = scripted([[toolUse("tu1", "email_send_reply", { threadId: thread.id, body: "Hi Jen, Tuesday works!" })], [text("It's waiting in Approvals.")]]);
    const events: AgentEvent[] = [];
    const { conversationId } = await runTurn({ text: "reply to Jen", emit: (e) => events.push(e), model: s.fn });
    const pend = events.find((e) => e.type === "tool" && e.status === "pending_approval");
    expect(pend).toBeTruthy();
    expect(mockSentMessages().length).toBe(0);
    await approve((pend as { approvalId: string }).approvalId);
    expect(mockSentMessages().length).toBe(1);
    const history = await loadHistory(conversationId);
    const notice = history.at(-1);
    expect(JSON.stringify(notice?.content)).toContain("[System notice] Grayden approved");
  });

  it("returns tool errors to the model instead of crashing", async () => {
    const s = scripted([[toolUse("tu1", "task_complete", { taskId: "missing" })], [text("Couldn't find it.")]]);
    const events: AgentEvent[] = [];
    await runTurn({ text: "complete it", emit: (e) => events.push(e), model: s.fn });
    expect(events.some((e) => e.type === "tool" && e.status === "error")).toBe(true);
    const result = (s.calls[1]?.at(-1)?.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(result?.is_error).toBe(true);
  });

  it("keeps tool_use/tool_result adjacent even if a notice was written in between", async () => {
    const conv = await db.conversation.create({ data: {} });
    const add = (role: "USER" | "ASSISTANT", content: unknown) => db.chatMessage.create({ data: { conversationId: conv.id, role, content: content as object } });
    await add("USER", [{ type: "text", text: "hi" }]);
    await add("ASSISTANT", [{ type: "tool_use", id: "a", name: "task_list", input: {} }]);
    await add("USER", [{ type: "text", text: "[System notice] approved X" }]);
    await add("USER", [{ type: "tool_result", tool_use_id: "a", content: "[]" }]);
    const h = await loadHistory(conv.id);
    expect(JSON.stringify(h[2]?.content)).toContain("tool_result");
    expect(JSON.stringify(h[3]?.content)).toContain("[System notice]");
  });

  it("offline mock model handles common phrasings end-to-end", async () => {
    const events: AgentEvent[] = [];
    await runTurn({ text: "add task order resin filters tomorrow !2", emit: (e) => events.push(e) });
    expect(await db.task.count({ where: { title: "order resin filters" } })).toBe(1);
    const events2: AgentEvent[] = [];
    await runTurn({ text: "how's the business doing?", emit: (e) => events2.push(e) });
    expect(events2.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toContain("month-to-date");
  });
});

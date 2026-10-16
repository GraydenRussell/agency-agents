import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { aiConfigured, assertBudget, getClient, models, recordUsage, SpendCapExceededError } from "@/lib/ai/client";
import { getSetting } from "@/lib/services/settings";
import { truncate } from "@/lib/utils";
import { memoryBlock, SYSTEM_PROMPT, turnContext } from "./context";
import { executeTool } from "./executor";
import { mockModel } from "./mock-model";
import { toAnthropicTool } from "./registry";
import { TOOLS } from "./tools";

type Block = Anthropic.Beta.BetaContentBlock;
type Param = Anthropic.Beta.BetaMessageParam;
export type ModelResponse = { content: Block[]; stop_reason: string | null; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }; model: string };
export type ModelFn = (req: { system: Anthropic.Beta.BetaTextBlockParam[]; messages: Param[] }, onText: (d: string) => void) => Promise<ModelResponse>;

export type AgentEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; status: "running" | "ok" | "error" | "pending_approval"; summary?: string; approvalId?: string; error?: string; activityId?: string }
  | { type: "notice"; message: string }
  | { type: "done"; costUsd: number }
  | { type: "error"; message: string };

const MAX_ITERATIONS = 12;
const SERVER_TOOLS: Anthropic.Beta.BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", city: "Chandler", region: "Arizona", country: "US", timezone: "America/Phoenix" } }];

function clientTools(): Anthropic.Beta.BetaToolUnion[] {
  // eager_input_streaming streams large tool inputs; every input is re-validated with Zod in executeTool.
  return TOOLS.map((t) => ({ ...toAnthropicTool(t), eager_input_streaming: true }) as Anthropic.Beta.BetaToolUnion);
}

/** Real model: streaming, adaptive thinking (always on for Opus 5.5), server-side refusal fallback. */
export const anthropicModel: ModelFn = async ({ system, messages }, onText) => {
  const effort = await getSetting("ai.effort");
  const model = models.main();
  const stream = getClient().beta.messages.stream({
    model,
    max_tokens: 32_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort },
    cache_control: { type: "ephemeral" },
    system,
    tools: [...clientTools(), ...SERVER_TOOLS],
    messages,
  });
  stream.on("text", onText);
  const m = await stream.finalMessage();
  return { content: m.content, stop_reason: m.stop_reason, usage: m.usage, model: m.model };
};

/**
 * History as stored (verbatim API content). Approval notices that landed between an assistant
 * tool_use message and its tool_result are moved after the results so pairs stay adjacent.
 */
export async function loadHistory(conversationId: string): Promise<Param[]> {
  const rows = await db.chatMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const out: Param[] = [];
  const held: Param[] = [];
  let awaitingResults = false;
  for (const r of rows) {
    const content = r.content as unknown as Param["content"];
    const isNotice = r.role === "USER" && Array.isArray(content) && content.length === 1 && (content[0] as { type: string; text?: string }).type === "text" && String((content[0] as { text?: string }).text).startsWith("[System notice]");
    if (awaitingResults && isNotice) {
      held.push({ role: "user", content });
      continue;
    }
    out.push({ role: r.role === "USER" ? "user" : "assistant", content });
    if (r.role === "ASSISTANT") awaitingResults = Array.isArray(content) && content.some((b) => (b as { type: string }).type === "tool_use");
    else if (!isNotice) {
      awaitingResults = false;
      out.push(...held.splice(0));
    }
  }
  out.push(...held);
  return out;
}

async function persist(conversationId: string, role: "USER" | "ASSISTANT", content: unknown, usage?: { input: number; output: number; cost: number }) {
  await db.chatMessage.create({ data: { conversationId, role, content: JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue, inputTokens: usage?.input, outputTokens: usage?.output, costUsd: usage?.cost } });
}

export async function runTurn(opts: { conversationId?: string | null; text: string; emit: (e: AgentEvent) => void; model?: ModelFn }): Promise<{ conversationId: string }> {
  const { emit } = opts;
  const model = opts.model ?? (aiConfigured() ? anthropicModel : mockModel);
  const isReal = model === anthropicModel;

  const conversation = opts.conversationId
    ? await db.conversation.findUniqueOrThrow({ where: { id: opts.conversationId } })
    : await db.conversation.create({ data: { title: truncate(opts.text.replace(/\s+/g, " ").trim(), 60) } });
  emit({ type: "conversation", id: conversation.id });
  await persist(conversation.id, "USER", [
    { type: "text", text: await turnContext() },
    { type: "text", text: opts.text },
  ]);
  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT },
    { type: "text", text: await memoryBlock(), cache_control: { type: "ephemeral" } },
  ];
  let total = 0;
  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (isReal) await assertBudget();
      const messages = await loadHistory(conversation.id);
      const res = await model({ system, messages }, (d) => emit({ type: "text", delta: d }));
      const cost = isReal ? await recordUsage(res.model, "assistant", res.usage) : 0;
      total += cost;
      await persist(conversation.id, "ASSISTANT", res.content, { input: res.usage.input_tokens, output: res.usage.output_tokens, cost });

      if (res.stop_reason === "pause_turn") continue; // server tool (web search) still working
      if (res.stop_reason === "refusal") {
        emit({ type: "notice", message: "The model declined this request." });
        break;
      }
      const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) break;
      if (res.stop_reason === "max_tokens") {
        emit({ type: "notice", message: "Response was cut off before the tool call finished; try again." });
        break;
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        emit({ type: "tool", id: tu.id, name: tu.name, status: "running" });
        const r = await executeTool(tu.name, tu.input, { actor: "ASSISTANT", conversationId: conversation.id, toolUseId: tu.id });
        if (r.status === "ok") {
          emit({ type: "tool", id: tu.id, name: tu.name, status: "ok", summary: r.summary, activityId: r.activityId || undefined });
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(r.result ?? null).slice(0, 60_000) });
        } else if (r.status === "pending_approval") {
          emit({ type: "tool", id: tu.id, name: tu.name, status: "pending_approval", summary: r.summary, approvalId: r.approvalId });
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ status: "pending_approval", approvalId: r.approvalId, note: "Queued in Grayden's Approvals. NOT executed yet. You'll get a [System notice] when he decides." }) });
        } else {
          emit({ type: "tool", id: tu.id, name: tu.name, status: "error", error: r.error });
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: r.error });
        }
      }
      await persist(conversation.id, "USER", results);
    }
    emit({ type: "done", costUsd: total });
  } catch (e) {
    const message =
      e instanceof SpendCapExceededError ? e.message : e instanceof Anthropic.RateLimitError ? "Anthropic rate limit hit; try again in a minute." : e instanceof Anthropic.APIError ? `Anthropic API error ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : "Unexpected error";
    console.error("[assistant]", e);
    emit({ type: "error", message });
  }
  return { conversationId: conversation.id };
}

/** Text shown in the transcript for a stored message (hides context blocks and tool plumbing). */
export function visibleText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .filter((b): b is { type: "text"; text: string } => (b as { type?: string }).type === "text")
    .map((b) => b.text)
    .filter((t) => !t.startsWith("<context>"))
    .join("\n")
    .trim();
}

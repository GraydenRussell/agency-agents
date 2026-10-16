import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { parseCapture } from "@/lib/capture/parse";
import { searchMail } from "@/lib/services/mail";
import { today } from "@/lib/time";
import type { ModelFn } from "./agent";

/**
 * Offline stand-in for Claude (mock mode / no API key). It recognizes a few phrasings and emits
 * real tool_use blocks so the whole pipeline — tools, approvals, activity log, UI — works
 * end-to-end without network access. It is intentionally simple and says so.
 */
type Block = Anthropic.Beta.BetaContentBlock;
let counter = 0;
const id = () => `toolu_mock_${Date.now().toString(36)}_${counter++}`;
const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as Block;
const tool = (name: string, input: Record<string, unknown>): Block => ({ type: "tool_use", id: id(), name, input, caller: { type: "direct" } }) as unknown as Block;
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

const HELP = `I'm running in **offline demo mode** (no Anthropic API key, or INTEGRATION_MODE=mock), so I only understand a few phrasings:
- "add task call Linda tomorrow 3pm !1"
- "remind me to move the truck at 5pm"
- "what's on my calendar today?"
- "plan my day"
- "how's the business doing?"
- "reply to Jennifer saying Tuesday 9am works"
- "remember I prefer meetings after 10am"
Add ANTHROPIC_API_KEY and set INTEGRATION_MODE=live for the full assistant.`;

function lastUserText(messages: Anthropic.Beta.BetaMessageParam[]): { kind: "text"; text: string } | { kind: "results"; results: Anthropic.Beta.BetaToolResultBlockParam[] } {
  const last = messages[messages.length - 1];
  if (!last || !Array.isArray(last.content)) return { kind: "text", text: typeof last?.content === "string" ? last.content : "" };
  const results = last.content.filter((b): b is Anthropic.Beta.BetaToolResultBlockParam => b.type === "tool_result");
  if (results.length) return { kind: "results", results };
  const texts = last.content.filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === "text").map((b) => b.text).filter((t) => !t.startsWith("<context>"));
  return { kind: "text", text: texts.join("\n") };
}

function describeResults(results: Anthropic.Beta.BetaToolResultBlockParam[]): string {
  return results
    .map((r) => {
      const raw = typeof r.content === "string" ? r.content : "";
      if (r.is_error) return `That didn't work: ${raw}`;
      if (raw.includes('"pending_approval"')) return "Queued for your approval: tap **Approve** on the card (or open Approvals).";
      try {
        const v = JSON.parse(raw) as unknown;
        if (Array.isArray(v)) return v.length ? `Here's what I found:\n${v.slice(0, 8).map((x) => `- ${(x as { title?: string; subject?: string }).title ?? (x as { subject?: string }).subject ?? JSON.stringify(x).slice(0, 80)}`).join("\n")}` : "Nothing found.";
        if (v && typeof v === "object" && "revenue" in v) {
          const b = v as { revenue: { today: number; mtd: number }; jobs: { today: unknown[] }; leads: { new24h: number } };
          return `Business: $${b.revenue.today.toLocaleString()} today, $${b.revenue.mtd.toLocaleString()} month-to-date, ${b.jobs.today.length} jobs today, ${b.leads.new24h} new leads in 24h.`;
        }
        if (v && typeof v === "object" && "openTasks" in v) {
          const p = v as { openTasks: Array<{ title: string }>; events: unknown[]; freeSlots: unknown[] };
          return `You have ${p.openTasks.length} open tasks, ${p.events.length} events, and ${p.freeSlots.length} free slots. Top candidates:\n${p.openTasks.slice(0, 3).map((t) => `- ${t.title}`).join("\n")}`;
        }
      } catch {
        /* fall through */
      }
      return "Done.";
    })
    .join("\n\n");
}

export const mockModel: ModelFn = async ({ messages }, onText) => {
  const last = lastUserText(messages);
  const respond = (content: Block[]) => {
    for (const b of content) if (b.type === "text") onText(b.text);
    return { content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", usage, model: "mock" };
  };
  if (last.kind === "results") return respond([text(describeResults(last.results))]);

  const t = last.text.trim();
  const lower = t.toLowerCase();
  if (/^\[system notice\]/i.test(t)) return respond([text("Noted.")]);

  let m: RegExpExecArray | null;
  if ((m = /^(?:add|create|new)\s+(?:a\s+)?task:?\s+(.+)$/i.exec(t))) {
    const p = parseCapture(m[1] ?? "");
    return respond([text("Adding that task. "), tool("task_create", { title: p.title, priority: p.priority, area: p.area, due: p.at?.toISOString() })]);
  }
  if (/^remind me/i.test(t)) {
    const p = parseCapture(t);
    return respond([text("Scheduling the reminder. "), tool("reminder_schedule", { title: p.title, at: (p.at ?? new Date(Date.now() + 3_600_000)).toISOString() })]);
  }
  if ((m = /^reply to (\w+)(?: saying|:)\s+(.+)$/i.exec(t))) {
    const [thread] = await searchMail(m[1] ?? "", 1);
    if (!thread) return respond([text(`I couldn't find an email from ${m[1]}.`)]);
    return respond([text(`Here's the reply I'd send to ${thread.fromName ?? thread.fromEmail}. It needs your approval. `), tool("email_send_reply", { threadId: thread.id, body: `${m[2]}\n\nThanks,\nGrayden` })]);
  }
  if (/calendar|schedule today|what'?s on/.test(lower)) return respond([tool("calendar_list_events", { from: today() })]);
  if (/plan my (day|today)/.test(lower)) return respond([tool("plan_day", {})]);
  if (/business|revenue|jobs|leads/.test(lower)) return respond([tool("business_numbers", {})]);
  if ((m = /^remember (?:that )?(.+)$/i.exec(t))) return respond([tool("memory_write", { key: `fact.note-${Date.now().toString(36)}`, value: m[1] ?? "", kind: "FACT" })]);
  return respond([text(HELP)]);
};

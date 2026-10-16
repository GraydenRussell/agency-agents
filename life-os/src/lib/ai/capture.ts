import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseCapture, type ParsedCapture } from "@/lib/capture/parse";
import { localMinutes, minutesToLabel, today } from "@/lib/time";
import { aiConfigured, assertBudget, getClient, models, recordUsage } from "./client";

const Schema = z.object({
  kind: z.enum(["task", "note", "journal", "reminder", "event"]),
  title: z.string(),
  body: z.string().nullable(),
  priority: z.number().int().min(1).max(4).nullable(),
  area: z.enum(["BUSINESS", "PERSONAL", "HEALTH", "MONEY", "LEARNING"]).nullable(),
  tags: z.array(z.string()),
  start: z.string().nullable().describe("ISO 8601 with -07:00 offset, or null"),
  end: z.string().nullable().describe("ISO 8601 with -07:00 offset, or null"),
});

/** Classifies free-form capture text with the model; falls back to the rule parser offline/on error. */
export async function aiParseCapture(text: string, now: Date = new Date()): Promise<ParsedCapture & { source: "ai" | "rules" }> {
  const rules = parseCapture(text, now);
  if (!aiConfigured()) return { ...rules, source: "rules" };
  try {
    await assertBudget();
    const model = models.fast();
    const r = await getClient().messages.parse({
      model,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      system: "File a quick-capture note for Grayden (window-cleaning business owner, Chandler AZ, timezone America/Phoenix = UTC-7, no DST). Decide: task (to-do), event (scheduled block, often with a time range or people), reminder (ping at a time), note (reference info), journal (reflection about his day). Title: short imperative or noun phrase without the date words. Priority 1 urgent … 4 low, null if unclear. Area BUSINESS for window cleaning/clients/crew/marketing.",
      messages: [{ role: "user", content: `Now: ${today(now)} ${minutesToLabel(localMinutes(now))} Phoenix.\nCapture: ${text}` }],
    });
    await recordUsage(model, "capture", r.usage);
    const p = r.parsed_output;
    if (!p) return { ...rules, source: "rules" };
    return { kind: p.kind, title: p.title || rules.title, body: p.body ?? (p.kind === "journal" ? text : undefined), priority: p.priority ?? undefined, area: p.area ?? undefined, tags: p.tags, at: p.start ? new Date(p.start) : undefined, end: p.end ? new Date(p.end) : undefined, confidence: "high", source: "ai" };
  } catch (e) {
    console.error("[capture.ai]", e);
    return { ...rules, source: "rules" };
  }
}

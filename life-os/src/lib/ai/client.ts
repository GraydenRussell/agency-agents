import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { isMock } from "@/lib/integrations/mode";
import { getSetting } from "@/lib/services/settings";
import { today } from "@/lib/time";

/** USD per million tokens. Source: Anthropic pricing (cached 2026-10). Unknown models use Opus pricing. */
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

export function costUsd(model: string, u: Usage): number {
  const p = PRICING[model] ?? PRICING["claude-opus-5-5"];
  if (!p) return 0;
  return (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000;
}

export class SpendCapExceededError extends Error {
  constructor(readonly spent: number, readonly cap: number) {
    super(`Daily AI spend cap reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}). Raise it in Settings or wait until tomorrow.`);
    this.name = "SpendCapExceededError";
  }
}

export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AiUnavailableError";
  }
}

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && !isMock();
}

export function getClient(): Anthropic {
  if (!aiConfigured()) throw new AiUnavailableError(isMock() ? "AI is disabled in mock mode" : "ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return client;
}

export const models = {
  main: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  fast: () => process.env.ANTHROPIC_FAST_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
};

export async function spentToday(): Promise<number> {
  const r = await db.apiUsage.aggregate({ where: { date: today() }, _sum: { costUsd: true } });
  return r._sum.costUsd ?? 0;
}

/** Throws before a model call when today's spend has reached the cap. */
export async function assertBudget(): Promise<void> {
  const [spent, cap] = await Promise.all([spentToday(), getSetting("ai.dailySpendCapUsd")]);
  if (spent >= cap) throw new SpendCapExceededError(spent, cap);
}

export async function recordUsage(model: string, purpose: string, usage: Usage): Promise<number> {
  const cost = costUsd(model, usage);
  await db.apiUsage.create({
    data: {
      date: today(),
      model,
      purpose,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      costUsd: cost,
    },
  });
  return cost;
}

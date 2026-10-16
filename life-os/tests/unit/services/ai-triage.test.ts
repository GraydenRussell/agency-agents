import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class Anthropic {
    static APIError = APIError;
    messages = { parse, create: vi.fn() };
  }
  return { default: Anthropic, APIError };
});

import { db } from "@/lib/db";
import { triageBatch } from "@/lib/ai/triage";
import { setSetting } from "@/lib/services/settings";
import { resetDb } from "../../setup/db";

const item = { id: "t1", subject: "Quote?", fromName: "Jen", fromEmail: "jen@x.com", labels: [], body: "Can you quote my windows?", lastFromMe: false };

beforeEach(async () => {
  await resetDb();
  process.env.INTEGRATION_MODE = "live";
  process.env.ANTHROPIC_API_KEY = "test-key";
  parse.mockReset();
});
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
  delete process.env.ANTHROPIC_API_KEY;
});

describe("AI triage", () => {
  it("maps model output and records usage/cost", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      parsed_output: { results: [{ id: "t1", category: "LEAD", priority: 88, summary: "Wants a window quote.", needs_reply: true }] },
    });
    const [r] = await triageBatch([item]);
    expect(r).toMatchObject({ category: "LEAD", priority: 88, needsReply: true, source: "ai" });
    const call = parse.mock.calls[0]?.[0] as { model: string; output_config: { effort: string } };
    expect(call.model).toBe("claude-opus-5-5");
    expect(call.output_config.effort).toBe("low");
    const usage = await db.apiUsage.findFirstOrThrow();
    expect(usage.costUsd).toBeCloseTo((1000 * 4 + 200 * 20) / 1e6);
  });

  it("falls back to rules when the daily spend cap is reached", async () => {
    await setSetting("ai.dailySpendCapUsd", 0);
    const [r] = await triageBatch([item]);
    expect(r?.source).toBe("rules");
    expect(parse).not.toHaveBeenCalled();
  });

  it("falls back to rules on refusal or missing parse", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: null });
    const [r] = await triageBatch([item]);
    expect(r?.source).toBe("rules");
  });
});

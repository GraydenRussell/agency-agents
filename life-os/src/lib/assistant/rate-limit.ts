import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/services/settings";
import { today } from "@/lib/time";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

async function bump(key: string, windowStart: Date): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  return rows[0]?.count ?? 1;
}

/** Atomically counts a tool call against per-minute and per-day limits; throws when exceeded. */
export async function consumeToolCall(now: Date = new Date()): Promise<void> {
  const [perMin, perDay] = await Promise.all([getSetting("ai.maxToolCallsPerMinute"), getSetting("ai.maxToolCallsPerDay")]);
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const m = await bump(`tools:min:${minute.toISOString()}`, minute);
  const d = await bump(`tools:day:${today(now)}`, minute);
  if (m > perMin) throw new RateLimitError(`Tool-call rate limit reached (${perMin}/minute). Try again in a minute.`);
  if (d > perDay) throw new RateLimitError(`Daily tool-call limit reached (${perDay}/day). Raise it in Settings.`);
}

/** Housekeeping: drop minute buckets older than a day. */
export async function pruneRateLimits(now: Date = new Date()) {
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "tools:min:" }, windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
}

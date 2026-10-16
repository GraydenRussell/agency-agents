import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Typed settings stored as JSON in the Setting table. Every key has a schema + default, so
 * reading never fails (a corrupt value falls back to the default).
 */
export const SETTINGS = {
  "ai.dailySpendCapUsd": { schema: z.number().min(0).max(1000), default: 5 },
  "ai.maxToolCallsPerMinute": { schema: z.number().int().min(1).max(500), default: 30 },
  "ai.maxToolCallsPerDay": { schema: z.number().int().min(1).max(20_000), default: 500 },
  "ai.effort": { schema: z.enum(["low", "medium", "high", "xhigh"]), default: "medium" as const },
  /** Per action type: true = execute without asking. Everything defaults to false (ask). */
  "approvals.autoApprove": { schema: z.record(z.string(), z.boolean()), default: {} as Record<string, boolean> },
  /** Email categories whose AI-drafted replies may be auto-sent (only if email.send is also auto-approved). */
  "approvals.autoSendCategories": { schema: z.array(z.string()), default: [] as string[] },
  "notifications.quietHours": { schema: z.object({ start: z.string(), end: z.string() }), default: { start: "21:30", end: "06:00" } },
  "notifications.briefChannels": { schema: z.array(z.enum(["SMS", "EMAIL", "PUSH"])), default: ["EMAIL"] as Array<"SMS" | "EMAIL" | "PUSH"> },
  "notifications.highPriorityThreshold": { schema: z.number().int().min(0).max(100), default: 80 },
  "business.quickLinks": {
    schema: z.array(z.object({ label: z.string(), url: z.string().url() })),
    default: [] as Array<{ label: string; url: string }>,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await db.setting.findUnique({ where: { key } });
  const def = SETTINGS[key];
  if (!row) return def.default as SettingValue<K>;
  const parsed = def.schema.safeParse(row.value);
  return (parsed.success ? parsed.data : def.default) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
  const v = SETTINGS[key].schema.parse(value) as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

export async function getAllSettings() {
  const entries = await Promise.all((Object.keys(SETTINGS) as SettingKey[]).map(async (k) => [k, await getSetting(k)] as const));
  return Object.fromEntries(entries) as { [K in SettingKey]: SettingValue<K> };
}

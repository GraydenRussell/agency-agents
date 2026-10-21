import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_PRICING, pricingRulesSchema } from "@/lib/business/pricing";

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
  /** Quote builder prices (Business → Quotes → Pricing). */
  "business.pricing": { schema: pricingRulesSchema, default: DEFAULT_PRICING },
  /** Cities you serve; leads outside them score lower. */
  "business.serviceArea": { schema: z.array(z.string().min(1)).max(50), default: ["Chandler", "Gilbert", "Mesa", "Tempe", "Queen Creek", "Sun Lakes", "Ahwatukee", "San Tan Valley", "Phoenix", "Scottsdale"] },
  /** Months between cleanings when a customer has no interval of their own. */
  "business.rebookDefaultMonths": { schema: z.number().int().min(1).max(36), default: 6 },
  /** Google "ask for reviews" short link (Business Profile → Ask for reviews), used in review-request texts. */
  "business.reviewLink": { schema: z.union([z.string().url(), z.literal("")]), default: "" },
  /** What a referrer gets once the person they sent completes a job. */
  "business.referralReward": { schema: z.object({ amount: z.number().min(0).max(10_000), kind: z.enum(["credit", "cash", "gift card"]) }), default: { amount: 25, kind: "credit" as const } },
  /** Your Rapid Window Cleaning dashboard, shown on Business → Dashboard. */
  "business.dashboardUrl": { schema: z.union([z.string().url().startsWith("https://"), z.literal("")]), default: "https://rapid-window-dashboard.vercel.app" },
  /** Monthly revenue goal for the KPIs board and briefs. */
  "business.monthlyRevenueGoal": { schema: z.number().min(0).max(10_000_000), default: 30_000 },
  /** NWS alert ids I've already been told about (so each warning alerts once). */
  "weather.notifiedAlerts": { schema: z.array(z.string()).max(100), default: [] as string[] },
  /** Where the truck starts and ends the day (route view). */
  "business.homeBase": { schema: z.object({ label: z.string().max(120), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), default: { label: "Home base (Chandler)", lat: 33.3062, lng: -111.8413 } },
  /** Nudge me when a new lead has had no reply for this long. */
  "leads.nudgeMinutes": { schema: z.number().int().min(5).max(24 * 60), default: 15 },
  /** Shown on quote PDFs and customer messages. */
  "business.profile": {
    schema: z.object({ name: z.string().min(1).max(120), legalName: z.string().max(120), city: z.string().max(120), phone: z.string().max(40), email: z.string().max(200), website: z.string().max(200) }),
    default: { name: "Rapid Window Cleaning", legalName: "AZ Rapid Washers LLC", city: "Chandler, AZ", phone: "", email: "", website: "" },
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

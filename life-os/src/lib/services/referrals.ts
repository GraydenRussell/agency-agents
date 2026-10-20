import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { channelStatus, notify } from "@/lib/notify";
import { getSetting } from "@/lib/services/settings";
import type { ReferralStatus } from "@/generated/prisma/client";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Exact (case/punctuation-insensitive) name match, else a unique first+last-initial match. Null if ambiguous. */
export function matchReferrer<T extends { id: string; name: string }>(text: string, customers: T[]): T | null {
  const t = norm(text);
  if (!t) return null;
  const exact = customers.filter((c) => norm(c.name) === t);
  if (exact.length === 1) return exact[0]!;
  const [first, last] = t.split(" ");
  if (!first) return null;
  const loose = customers.filter((c) => {
    const [cf, cl] = norm(c.name).split(" ");
    return cf === first && (!last || (cl ?? "").startsWith(last[0]!));
  });
  return loose.length === 1 ? loose[0]! : null;
}

export const referralInput = z.object({
  referrerId: z.string().min(1, "Pick who referred them"),
  referredName: z.string().trim().min(1, "Who did they refer?").max(200),
  referredCustomerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  reward: z.coerce.number().min(0).max(10_000).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createReferral(input: z.input<typeof referralInput>) {
  const v = referralInput.parse(input);
  const def = await getSetting("business.referralReward");
  if (v.leadId) {
    const existing = await db.referral.findUnique({ where: { leadId: v.leadId } });
    if (existing) return existing;
  }
  return db.referral.create({ data: { referrerId: v.referrerId, referredName: v.referredName, referredCustomerId: v.referredCustomerId ?? null, leadId: v.leadId ?? null, reward: v.reward ?? def.amount, rewardKind: def.kind, notes: v.notes ?? null } });
}

/** REFERRAL leads whose "referred by" names one customer become referrals automatically. */
export async function referralsFromLeads(): Promise<number> {
  const leads = await db.lead.findMany({ where: { source: "REFERRAL", sourceDetail: { not: null }, referral: null } });
  if (!leads.length) return 0;
  const customers = await db.customer.findMany({ select: { id: true, name: true } });
  let n = 0;
  for (const l of leads) {
    const ref = matchReferrer(l.sourceDetail!, customers);
    if (!ref || ref.id === l.customerId) continue;
    await createReferral({ referrerId: ref.id, referredName: l.name, referredCustomerId: l.customerId, leadId: l.id });
    n++;
  }
  return n;
}

/**
 * A referral is earned once the person referred becomes a paying customer: a completed job after
 * the referral was made, or their lead marked won. Tells me what I owe.
 */
export async function markEarnedReferrals(now: Date = new Date()): Promise<number> {
  const pending = await db.referral.findMany({ where: { status: "PENDING" }, include: { lead: { include: { quotes: true } }, referrer: true, referredCustomer: { include: { jobs: true } } } });
  let earned = 0;
  for (const r of pending) {
    const customerId = r.referredCustomerId ?? r.lead?.customerId ?? r.lead?.quotes.find((q) => q.status === "ACCEPTED")?.customerId ?? null;
    const jobs = customerId ? (r.referredCustomer?.id === customerId ? r.referredCustomer.jobs : await db.job.findMany({ where: { customerId } })) : [];
    const completed = jobs.some((j) => j.status === "COMPLETED" && (j.completedAt ?? j.scheduledStart ?? new Date(0)) >= r.createdAt);
    if (!completed && r.lead?.status !== "WON") continue;
    await db.referral.update({ where: { id: r.id }, data: { status: "EARNED", earnedAt: now, referredCustomerId: customerId } });
    earned++;
    const st = channelStatus();
    await notify({ title: `Referral reward earned: ${r.referrer.name}`, body: `${r.referredName} booked. You owe ${r.referrer.name} a $${r.reward} ${r.rewardKind}.`, url: "/business/referrals", channels: st.PUSH.ready ? ["PUSH"] : ["EMAIL"], tag: `referral-${r.id}` }, now);
  }
  return earned;
}

export async function setReferralStatus(id: string, status: ReferralStatus) {
  const r = await db.referral.findUniqueOrThrow({ where: { id } });
  if (status === "PAID" && r.status === "PENDING") throw new Error("This referral hasn't turned into a job yet");
  return db.referral.update({ where: { id }, data: { status, paidAt: status === "PAID" ? new Date() : status === "EARNED" ? null : r.paidAt, earnedAt: status === "EARNED" && !r.earnedAt ? new Date() : r.earnedAt } });
}

/** Pure: totals + leaderboard. */
export function referralStats(rows: Array<{ referrerId: string; referrerName: string; status: ReferralStatus; reward: number }>) {
  const live = rows.filter((r) => r.status !== "VOID");
  const owed = live.filter((r) => r.status === "EARNED");
  const by = new Map<string, { name: string; sent: number; converted: number; paid: number }>();
  for (const r of live) {
    const e = by.get(r.referrerId) ?? { name: r.referrerName, sent: 0, converted: 0, paid: 0 };
    e.sent++;
    if (r.status === "EARNED" || r.status === "PAID") e.converted++;
    if (r.status === "PAID") e.paid += r.reward;
    by.set(r.referrerId, e);
  }
  return {
    total: live.length,
    converted: live.filter((r) => r.status === "EARNED" || r.status === "PAID").length,
    owedCount: owed.length,
    owedAmount: owed.reduce((s, r) => s + r.reward, 0),
    paidAmount: live.filter((r) => r.status === "PAID").reduce((s, r) => s + r.reward, 0),
    leaders: [...by.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.converted - a.converted || b.sent - a.sent).slice(0, 10),
  };
}

export async function listReferrals() {
  const rows = await db.referral.findMany({ orderBy: { createdAt: "desc" }, include: { referrer: { select: { id: true, name: true } }, referredCustomer: { select: { id: true, name: true } }, lead: { select: { id: true, status: true } } } });
  return { rows, stats: referralStats(rows.map((r) => ({ referrerId: r.referrerId, referrerName: r.referrer.name, status: r.status, reward: r.reward }))) };
}

/** Hourly: new referral leads → referrals, then check which ones turned into jobs. */
export async function referralWatch(now: Date = new Date()): Promise<string> {
  const created = await referralsFromLeads();
  const earned = await markEarnedReferrals(now);
  return `${created} new from leads, ${earned} earned`;
}

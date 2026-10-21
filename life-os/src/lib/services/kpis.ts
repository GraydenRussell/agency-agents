import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { change, computeKpis, monthPace, periodRange, previousPeriod, sameElapsed, samePeriodLastYear, toDate, type Kpis, type PeriodKind, type Range } from "@/lib/business/kpis";
import { fetchMetaSpend, metaAdsConfigured } from "@/lib/integrations/meta";
import { getSetting } from "@/lib/services/settings";
import { addDays, endOfLocalDay, startOfLocalDay, today as todayLocal } from "@/lib/time";

export type KpiBoard = {
  kind: PeriodKind;
  range: Range;
  current: Kpis;
  previous: Kpis;
  lastYear: Kpis;
  deltas: Record<keyof Kpis, { vsPrevious: number | null; vsLastYear: number | null }>;
  trend: Array<{ label: string; revenue: number; jobs: number }>;
  goal: { monthly: number; monthToDate: number; projected: number; day: number; days: number };
  spendSources: string[];
};

const LABEL_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Current period vs the previous one and vs the same period last year. Periods still in progress are
 * compared over the same number of elapsed days, so a Tuesday isn't measured against a full week.
 */
export async function kpiBoard(kind: PeriodKind = "month", today: string = todayLocal()): Promise<KpiBoard> {
  const full = periodRange(kind, today);
  const cur = toDate(full, today);
  const prevFull = previousPeriod(kind, full);
  const lyFull = samePeriodLastYear(kind, full);
  const prev = sameElapsed(prevFull, full, today);
  const ly = sameElapsed(lyFull, full, today);
  const trendRanges: Range[] = [];
  let r = full;
  for (let i = 0; i < (kind === "year" ? 3 : kind === "month" ? 12 : 10); i++) {
    trendRanges.unshift(r);
    r = previousPeriod(kind, r);
  }
  const from = [trendRanges[0]!.start, ly.start].sort()[0]!;
  const fromD = startOfLocalDay(from), toD = endOfLocalDay(today);
  const [jobs, leads, quotes, spend, goalMonthly] = await Promise.all([
    db.job.findMany({ where: { status: "COMPLETED", OR: [{ completedAt: { gte: fromD, lt: toD } }, { completedAt: null, scheduledStart: { gte: fromD, lt: toD } }] }, select: { status: true, total: true, completedAt: true, scheduledStart: true, scheduledEnd: true } }),
    db.lead.findMany({ where: { receivedAt: { gte: fromD, lt: toD } }, select: { receivedAt: true } }),
    db.quote.findMany({ where: { decidedAt: { gte: fromD, lt: toD } }, select: { status: true, decidedAt: true } }),
    db.adSpend.findMany({ where: { date: { gte: from, lte: today } }, select: { date: true, amount: true, source: true } }),
    getSetting("business.monthlyRevenueGoal"),
  ]);
  const data = { jobs, leads, quotes, spend };
  const current = computeKpis(data, cur), previous = computeKpis(data, prev), lastYear = computeKpis(data, ly);
  const deltas = Object.fromEntries((Object.keys(current) as Array<keyof Kpis>).map((k) => [k, { vsPrevious: change(current[k], previous[k]), vsLastYear: change(current[k], lastYear[k]) }])) as KpiBoard["deltas"];
  const label = (x: Range) => (kind === "year" ? x.start.slice(0, 4) : kind === "month" ? LABEL_MON[Number(x.start.slice(5, 7)) - 1]! : `${LABEL_MON[Number(x.start.slice(5, 7)) - 1]} ${Number(x.start.slice(8))}`);
  const trend = trendRanges.map((x) => {
    const k = computeKpis(data, toDate(x, today));
    return { label: label(x), revenue: k.revenue, jobs: k.jobs };
  });
  const mtd = computeKpis(data, toDate(periodRange("month", today), today)).revenue;
  return { kind, range: full, current, previous, lastYear, deltas, trend, goal: { monthly: goalMonthly, monthToDate: mtd, ...monthPace(mtd, today) }, spendSources: [...new Set(spend.map((s) => s.source))] };
}

/** Pull the last `days` of Meta ad spend (re-pulls recent days; Meta revises spend for ~a week). */
export async function syncAdSpend(days = 35, today: string = todayLocal()): Promise<string> {
  if (!metaAdsConfigured()) return "skipped: Meta ads not connected";
  const rows = await fetchMetaSpend(addDays(today, -days), today);
  for (const r of rows) await db.adSpend.upsert({ where: { date_source: { date: r.date, source: "META" } }, create: { date: r.date, source: "META", amount: r.amount }, update: { amount: r.amount } });
  return `${rows.length} days of Meta spend`;
}

export const adSpendInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  source: z.enum(["GOOGLE_ADS", "DOOR_HANGERS", "NEXTDOOR", "OTHER"]),
  amount: z.coerce.number().min(0, "Amount can't be negative").max(100_000),
  note: z.string().max(200).optional().nullable(),
});

/** Spend Meta doesn't report (Google Ads, door hangers…), entered by hand. Adds to that day's total. */
export async function addAdSpend(input: z.input<typeof adSpendInput>) {
  const v = adSpendInput.parse(input);
  const existing = await db.adSpend.findUnique({ where: { date_source: { date: v.date, source: v.source } } });
  return db.adSpend.upsert({ where: { date_source: { date: v.date, source: v.source } }, create: { ...v, note: v.note ?? null }, update: { amount: (existing?.amount ?? 0) + v.amount, note: v.note ?? existing?.note ?? null } });
}

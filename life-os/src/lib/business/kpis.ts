import { addDays, localDateOf, monthRange, parseLocalDate, weekRange, type LocalDate } from "@/lib/time";

/** Pure KPI math for the board. Periods are Phoenix-local, Monday weeks. */

export type PeriodKind = "week" | "month" | "year";
export type Range = { start: LocalDate; end: LocalDate };

export function periodRange(kind: PeriodKind, on: LocalDate): Range {
  if (kind === "week") return weekRange(on);
  if (kind === "month") return monthRange(on);
  const { y } = parseLocalDate(on);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** The period before `r` of the same kind. */
export function previousPeriod(kind: PeriodKind, r: Range): Range {
  return periodRange(kind, addDays(r.start, -1));
}

/** Same period one year earlier (week: the ISO week ~52 weeks back). */
export function samePeriodLastYear(kind: PeriodKind, r: Range): Range {
  if (kind === "week") return weekRange(addDays(r.start, -364));
  const { y, m } = parseLocalDate(r.start);
  return periodRange(kind, `${y - 1}-${String(m).padStart(2, "0")}-01`);
}

/** Only the part of `r` that has happened so far (for fair comparisons mid-period). */
export function toDate(r: Range, today: LocalDate): Range {
  return { start: r.start, end: r.end < today ? r.end : today };
}

/** Same number of elapsed days from the start of another range. */
export function sameElapsed(r: Range, cur: Range, today: LocalDate): Range {
  const elapsed = Math.round((Date.parse(`${(cur.end < today ? cur.end : today)}T00:00:00Z`) - Date.parse(`${cur.start}T00:00:00Z`)) / 86_400_000);
  const end = addDays(r.start, elapsed);
  return { start: r.start, end: end < r.end ? end : r.end };
}

export type KpiJob = { status: string; total: number; completedAt: Date | null; scheduledStart: Date | null; scheduledEnd: Date | null };
export type KpiInputs = { jobs: KpiJob[]; leads: Array<{ receivedAt: Date }>; quotes: Array<{ status: string; decidedAt: Date | null }>; spend: Array<{ date: string; amount: number }> };

export type Kpis = {
  revenue: number;
  jobs: number;
  avgTicket: number | null;
  hours: number;
  revenuePerHour: number | null;
  jobsPerWeek: number;
  leads: number;
  spend: number;
  costPerLead: number | null;
  quotesWon: number;
  quotesDecided: number;
  closeRate: number | null;
};

const inRange = (d: Date | null, r: Range) => {
  if (!d) return false;
  const k = localDateOf(d);
  return k >= r.start && k <= r.end;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeKpis(data: KpiInputs, r: Range): Kpis {
  const done = data.jobs.filter((j) => j.status === "COMPLETED" && inRange(j.completedAt ?? j.scheduledStart, r));
  const revenue = round2(done.reduce((s, j) => s + j.total, 0));
  // On-site time from the scheduled window (Housecall Pro); jobs without one don't count toward hours.
  const hours = round2(done.reduce((s, j) => s + (j.scheduledStart && j.scheduledEnd && j.scheduledEnd > j.scheduledStart ? Math.min(12, (j.scheduledEnd.getTime() - j.scheduledStart.getTime()) / 3_600_000) : 0), 0));
  const days = Math.max(1, Math.round((Date.parse(`${r.end}T00:00:00Z`) - Date.parse(`${r.start}T00:00:00Z`)) / 86_400_000) + 1);
  const leads = data.leads.filter((l) => inRange(l.receivedAt, r)).length;
  const spend = round2(data.spend.filter((s) => s.date >= r.start && s.date <= r.end).reduce((t, s) => t + s.amount, 0));
  const decided = data.quotes.filter((q) => (q.status === "ACCEPTED" || q.status === "DECLINED") && inRange(q.decidedAt, r));
  const won = decided.filter((q) => q.status === "ACCEPTED").length;
  return {
    revenue,
    jobs: done.length,
    avgTicket: done.length ? round2(revenue / done.length) : null,
    hours,
    revenuePerHour: hours > 0 ? round2(revenue / hours) : null,
    jobsPerWeek: round2((done.length / days) * 7),
    leads,
    spend,
    costPerLead: leads && spend ? round2(spend / leads) : null,
    quotesWon: won,
    quotesDecided: decided.length,
    closeRate: decided.length ? won / decided.length : null,
  };
}

/** % change, or null when there's nothing to compare against. */
export function change(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

/** Month pace: projected month total from month-to-date. */
export function monthPace(revenueToDate: number, today: LocalDate): { projected: number; day: number; days: number } {
  const { d } = parseLocalDate(today);
  const days = Number(monthRange(today).end.slice(8));
  return { projected: round2((revenueToDate / Math.max(1, d)) * days), day: d, days };
}

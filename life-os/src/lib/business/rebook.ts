/**
 * Pure re-booking rules. A customer is due `interval` months after their last completed job,
 * unless they already have upcoming work, opted out, were texted in the last 30 days, or are snoozed.
 */

export type RebookBucket = "overdue" | "due" | "soon";

/** YYYY-MM-DD + n months, clamped to month end (Jan 31 + 1 → Feb 28). */
/** Whole months between two local dates (rounded). */
export const monthsBetween = (a: string, b: string) => Math.round(days(a, b) / 30.44);

export function addMonthsLocal(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export type RebookInput = {
  lastCleaned: string | null; // local date of last completed job
  intervalMonths: number;
  hasUpcomingJob: boolean;
  optOut: boolean;
  snoozedUntil: string | null;
  textedAt: string | null; // local date of the last re-book text
};

/** Bucket by due date: overdue (past due), due (within 14 days), soon (within 45 days); null = not due/suppressed. */
export function rebookStatus(c: RebookInput, today: string): { dueDate: string; bucket: RebookBucket; daysUntil: number } | null {
  if (!c.lastCleaned || c.optOut || c.hasUpcomingJob) return null;
  if (c.snoozedUntil && c.snoozedUntil > today) return null;
  if (c.textedAt && days(c.textedAt, today) < 30) return null;
  const dueDate = addMonthsLocal(c.lastCleaned, c.intervalMonths);
  const daysUntil = days(today, dueDate);
  if (daysUntil > 45) return null;
  return { dueDate, daysUntil, bucket: daysUntil < 0 ? "overdue" : daysUntil <= 14 ? "due" : "soon" };
}

/** `monthsSince` is the real time since the last cleaning, not the interval. */
export function rebookText(o: { name: string; lastCleanedLabel: string; monthsSince: number; business: string; signer?: string }): string {
  const first = o.name.split(/\s+/)[0] ?? o.name;
  const m = Math.max(1, o.monthsSince);
  const span = m > 12 && m < 18 ? "over a year" : `about ${m === 12 ? "a year" : m === 1 ? "a month" : m >= 18 ? `${Math.round(m / 12)} years` : `${m} months`}`;
  return `Hi ${first}, it's ${o.signer ?? "Grayden"} with ${o.business}! It's been ${span} since we cleaned your windows (${o.lastCleanedLabel}). Want me to get you on the schedule for your next cleaning? I have openings next week. Reply with a day that works!`;
}

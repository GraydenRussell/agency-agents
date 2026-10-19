import "server-only";
import { db } from "@/lib/db";
import { monthsBetween, rebookStatus, rebookText, type RebookBucket } from "@/lib/business/rebook";
import { notify, channelStatus } from "@/lib/notify";
import { textCustomer, toE164 } from "@/lib/notify/customer";
import { getSetting } from "@/lib/services/settings";
import { addDays, formatLocalDate, localDateOf, parseLocalDate, today as todayLocal } from "@/lib/time";

export type RebookRow = {
  customerId: string;
  name: string;
  phone: string | null;
  city: string | null;
  lastCleaned: string;
  lastTotal: number;
  lifetimeValue: number;
  intervalMonths: number;
  dueDate: string;
  daysUntil: number;
  bucket: RebookBucket;
  canText: boolean;
  draft: string;
};

const label = (d: string) => `${formatLocalDate(d)}, ${parseLocalDate(d).y}`;

/** Customers due (or nearly due) for their next cleaning, most overdue first. */
export async function rebookList(today: string = todayLocal()): Promise<RebookRow[]> {
  const [def, business] = await Promise.all([getSetting("business.rebookDefaultMonths"), getSetting("business.profile")]);
  const customers = await db.customer.findMany({ where: { rebookOptOut: false }, include: { jobs: { select: { status: true, total: true, completedAt: true, scheduledStart: true } } } });
  const now = new Date();
  const rows: RebookRow[] = [];
  for (const c of customers) {
    const done = c.jobs.filter((j) => j.status === "COMPLETED").map((j) => ({ at: j.completedAt ?? j.scheduledStart, total: j.total })).filter((j): j is { at: Date; total: number } => Boolean(j.at)).sort((a, b) => b.at.getTime() - a.at.getTime());
    const last = done[0];
    if (!last) continue;
    // Booked work (even earlier today, not yet marked done) counts until it's a week stale.
    const upcoming = c.jobs.some((j) => (j.status === "SCHEDULED" || j.status === "IN_PROGRESS" || j.status === "UNSCHEDULED") && (!j.scheduledStart || j.scheduledStart.getTime() > now.getTime() - 7 * 86_400_000));
    const interval = c.rebookMonths ?? def;
    const lastCleaned = localDateOf(last.at);
    const s = rebookStatus({ lastCleaned, intervalMonths: interval, hasUpcomingJob: upcoming, optOut: c.rebookOptOut, snoozedUntil: c.rebookSnoozedUntil, textedAt: c.rebookTextedAt ? localDateOf(c.rebookTextedAt) : null }, today);
    if (!s) continue;
    rows.push({ customerId: c.id, name: c.name, phone: c.phone, city: c.city, lastCleaned, lastTotal: last.total, lifetimeValue: done.reduce((t, j) => t + j.total, 0), intervalMonths: interval, ...s, canText: Boolean(toE164(c.phone)), draft: rebookText({ name: c.name, lastCleanedLabel: label(lastCleaned), monthsSince: monthsBetween(lastCleaned, today), business: business.name }) });
  }
  return rows.sort((a, b) => a.daysUntil - b.daysUntil || b.lifetimeValue - a.lifetimeValue);
}

/** Sends the re-book text. Callers must hold my approval (Send button or the Approvals queue). */
export async function sendRebookText(customerId: string, body?: string) {
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!c.phone || !toE164(c.phone)) throw new Error(`${c.name} has no textable phone number`);
  const text = body?.trim() || (await rebookList()).find((r) => r.customerId === customerId)?.draft;
  if (!text) throw new Error(`${c.name} isn't due for a re-book right now`);
  const r = await textCustomer(c.phone, text);
  await db.customer.update({ where: { id: customerId }, data: { rebookTextedAt: new Date() } });
  return { name: c.name, to: r.to };
}

export async function snoozeRebook(customerId: string, days = 30) {
  return db.customer.update({ where: { id: customerId }, data: { rebookSnoozedUntil: addDays(todayLocal(), days) } });
}

export async function setRebookOptOut(customerId: string, optOut: boolean) {
  return db.customer.update({ where: { id: customerId }, data: { rebookOptOut: optOut } });
}

/** Monday morning: "N customers are due for a cleaning" (only when there are some). */
export async function rebookDigest(now: Date = new Date()): Promise<string> {
  const due = (await rebookList(todayLocal(now))).filter((r) => r.bucket !== "soon");
  if (!due.length) return "no customers due";
  const value = due.reduce((s, r) => s + r.lastTotal, 0);
  const st = channelStatus();
  await notify({ title: `${due.length} customer${due.length > 1 ? "s" : ""} due for a cleaning`, body: `${due.slice(0, 5).map((r) => r.name).join(", ")}${due.length > 5 ? "…" : ""}. About $${Math.round(value).toLocaleString("en-US")} of repeat work, with texts drafted.`, url: "/business/rebook", channels: st.PUSH.ready ? ["PUSH"] : ["EMAIL"], tag: "rebook" }, now);
  return `${due.length} due`;
}

import "server-only";
import { db } from "@/lib/db";
import { approve, reject } from "@/lib/assistant/executor";
import { waitingMinutes } from "@/lib/business/leads";
import { checklist } from "@/lib/setup/checklist";
import { logHabit, habitsWithStatus } from "@/lib/services/habits";
import { setLeadStatus } from "@/lib/services/leads";
import { markBillPaid, upcomingBills } from "@/lib/services/money";
import { dueFollowUps, logInteraction } from "@/lib/services/people";
import { rebookList, snoozeRebook } from "@/lib/services/rebook";
import { setReferralStatus } from "@/lib/services/referrals";
import { skipReviewRequest } from "@/lib/services/reviews";
import { getSetting } from "@/lib/services/settings";
import { setTaskStatus, updateTask } from "@/lib/services/tasks";
import { setQuoteStatus } from "@/lib/services/quotes";
import { weatherPlan } from "@/lib/services/weather-plan";
import { addDays, atLocalMinutes, endOfLocalDay, formatLocalDate, localDateOf, today as todayLocal } from "@/lib/time";
import { formatUsd } from "@/lib/utils";

/**
 * "Do Now": every open loop across Life OS in one ranked list, each with the one-tap actions that
 * close it. Outward-facing actions (texts, emails) are never one-tap here; they link to the page
 * where you read the message first.
 */
export type Urgency = "now" | "today" | "week" | "later";
export type DoArea = "approvals" | "leads" | "tasks" | "quotes" | "rebook" | "reviews" | "money" | "weather" | "people" | "inbox" | "habits" | "setup";
export type DoAction = { op: string; label: string; primary?: boolean };
export type DoItem = { key: string; area: DoArea; urgency: Urgency; title: string; detail?: string; href?: string; actions: DoAction[] };

const RANK: Record<Urgency, number> = { now: 0, today: 1, week: 2, later: 3 };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[do-now]", e);
    return fallback;
  }
}

export async function doNowItems(now: Date = new Date()): Promise<DoItem[]> {
  const t = todayLocal(now);
  const items: DoItem[] = [];
  const nudge = await getSetting("leads.nudgeMinutes");

  const [approvals, leads, tasks, quotes, rebooks, reviews, reviewReqs, referrals, weather, bills, people, emails, habits, owed] = await Promise.all([
    safe(() => db.pendingApproval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 20 }), []),
    safe(() => db.lead.findMany({ where: { status: "NEW", firstResponseAt: null }, orderBy: { receivedAt: "asc" }, take: 20 }), []),
    safe(() => db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, OR: [{ dueAt: { lt: endOfLocalDay(t) } }, { top3Date: t }] }, orderBy: [{ priority: "asc" }, { dueAt: "asc" }], take: 30 }), []),
    safe(() => db.quote.findMany({ where: { status: "SENT", sentAt: { lt: new Date(now.getTime() - 3 * 86_400_000) }, validUntil: { gte: t } }, orderBy: { sentAt: "asc" }, take: 10 }), []),
    safe(() => rebookList(t), []),
    safe(() => db.review.findMany({ where: { replyText: null }, orderBy: { reviewedAt: "desc" }, take: 10 }), []),
    safe(() => db.reviewRequest.findMany({ where: { status: "PENDING", approvalId: null }, take: 10 }), []),
    safe(() => db.referral.findMany({ where: { status: "EARNED" }, include: { referrer: { select: { name: true } } }, take: 10 }), []),
    safe(async () => (await weatherPlan(t)).days.slice(0, 3), []),
    safe(() => upcomingBills(3, t), []),
    safe(() => dueFollowUps(t), []),
    safe(async () => db.emailThread.findMany({ where: { inInbox: true, needsReply: true, priority: { gte: await getSetting("notifications.highPriorityThreshold") } }, orderBy: { priority: "desc" }, take: 5 }), []),
    safe(() => habitsWithStatus(t), []),
    safe(() => db.job.findMany({ where: { status: "COMPLETED", balanceDue: { gt: 0 }, completedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }, include: { customer: { select: { id: true, name: true } } }, orderBy: { completedAt: "asc" }, take: 10 }), []),
  ]);

  for (const a of approvals) items.push({ key: `approval:${a.id}`, area: "approvals", urgency: "now", title: a.summary, detail: "The assistant is waiting for your OK", href: "/approvals", actions: [{ op: "approve", label: "Approve", primary: true }, { op: "reject", label: "Reject" }] });

  for (const l of leads) {
    const mins = waitingMinutes(l, now) ?? 0;
    items.push({ key: `lead:${l.id}`, area: "leads", urgency: mins >= nudge ? "now" : "today", title: `Reply to ${l.name}`, detail: `New lead, waiting ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h`}${l.score != null ? ` · score ${l.score}` : ""}`, href: `/business/leads/${l.id}`, actions: [{ op: "called", label: "I called them" }] });
  }

  for (const k of tasks) {
    const due = k.dueAt ? localDateOf(k.dueAt) : null;
    const overdue = due != null && due < t;
    items.push({ key: `task:${k.id}`, area: "tasks", urgency: overdue || k.priority === 1 ? "now" : "today", title: k.title, detail: overdue ? `Overdue since ${formatLocalDate(due!)}` : k.top3Date === t ? "Top 3 today" : "Due today", href: "/tasks", actions: [{ op: "done", label: "Done", primary: true }, { op: "tomorrow", label: "Tomorrow" }] });
  }

  for (const q of quotes) items.push({ key: `quote:${q.id}`, area: "quotes", urgency: "today", title: `Follow up on quote #${q.number} (${q.name})`, detail: `${formatUsd(q.total)} · sent ${formatLocalDate(localDateOf(q.sentAt!))}, no answer yet`, href: `/business/quotes/${q.id}`, actions: [{ op: "won", label: "Won" }, { op: "lost", label: "Lost" }] });

  for (const r of rebooks.filter((x) => x.bucket !== "soon").slice(0, 8)) items.push({ key: `rebook:${r.customerId}`, area: "rebook", urgency: "week", title: `Re-book ${r.name}`, detail: `${r.daysUntil < 0 ? `${-r.daysUntil} days overdue` : "due now"} · last ${formatUsd(r.lastTotal)}`, href: "/business/rebook", actions: [{ op: "snooze", label: "Snooze 30d" }] });

  for (const r of reviews) items.push({ key: `review:${r.id}`, area: "reviews", urgency: r.rating <= 3 ? "today" : "week", title: `Reply to ${r.author}'s ${r.rating}★ review`, detail: r.comment ? `“${r.comment.slice(0, 90)}${r.comment.length > 90 ? "…" : ""}”` : "Rating only · a reply is drafted", href: "/business/reviews", actions: [] });

  for (const r of reviewReqs) items.push({ key: `reviewreq:${r.id}`, area: "reviews", urgency: "week", title: `Ask ${r.name} for a Google review`, detail: "Job finished; the text is ready", href: "/business/reviews", actions: [{ op: "skip", label: "Skip" }] });

  for (const r of referrals) items.push({ key: `referral:${r.id}`, area: "money", urgency: "week", title: `Pay ${r.referrer.name}'s referral reward`, detail: `${formatUsd(r.reward)} ${r.rewardKind} for sending ${r.referredName}`, href: "/business/referrals", actions: [{ op: "paid", label: "Paid", primary: true }] });

  for (const d of weather) {
    if (!d.jobs.length || !d.risks.some((x) => x.level === "danger")) continue;
    items.push({ key: `weather:${d.date}`, area: "weather", urgency: d.date === t ? "now" : "today", title: `Weather risk on ${d.date === t ? "today's" : formatLocalDate(d.date, { weekday: true }) + "'s"} jobs`, detail: `${d.risks.map((x) => x.text).join(" · ")}${d.suggestion ? ` · best day to move: ${formatLocalDate(d.suggestion, { weekday: true })}` : ""}`, href: "/business/weather", actions: [] });
  }

  for (const b of bills.filter((x) => !x.autopay)) items.push({ key: `bill:${b.id}:${b.due.slice(0, 7)}`, area: "money", urgency: b.due < t ? "now" : b.due === t ? "today" : "week", title: `Pay ${b.name}`, detail: `${formatUsd(b.amount, { cents: true })} ${b.due < t ? `overdue since ${formatLocalDate(b.due)}` : `due ${b.due === t ? "today" : formatLocalDate(b.due, { weekday: true })}`}`, href: "/money", actions: [{ op: "paid", label: "Paid", primary: true }] });

  for (const j of owed) items.push({ key: `owed:${j.id}`, area: "money", urgency: "week", title: `Collect ${formatUsd(j.balanceDue)} from ${j.customer?.name ?? j.title}`, detail: `Job finished ${formatLocalDate(localDateOf(j.completedAt!))}, still unpaid`, href: j.customer ? `/business/customers/${j.customer.id}` : "/business/customers", actions: [] });

  for (const p of people) items.push({ key: `person:${p.id}`, area: "people", urgency: "week", title: `Check in with ${p.name}`, detail: p.lastContactedAt ? `Last talked ${formatLocalDate(localDateOf(p.lastContactedAt))}` : "Follow-up due", href: "/people", actions: [{ op: "contacted", label: "Done", primary: true }] });

  for (const e of emails) items.push({ key: `email:${e.id}`, area: "inbox", urgency: "today", title: `Reply: ${e.subject}`, detail: `${e.fromName ?? e.fromEmail}${e.summary ? ` · ${e.summary}` : ""}`, href: `/inbox?thread=${e.id}`, actions: [] });

  for (const h of habits.filter((x) => x.cadence === "DAILY" && x.todayValue < x.target).slice(0, 6)) items.push({ key: `habit:${h.id}`, area: "habits", urgency: "today", title: h.name, detail: h.streak ? `${h.streak}-day streak on the line` : "Habit", href: "/routines", actions: [{ op: "done", label: "Done", primary: true }] });

  for (const s of checklist(process.env).filter((x) => x.required && x.status !== "ready")) items.push({ key: `setup:${s.id}`, area: "setup", urgency: "later", title: `Set up ${s.name}`, detail: s.missing.length ? `Needs ${s.missing.join(", ")}` : s.problems.join("; "), href: "/setup", actions: [] });

  return items.sort((a, b) => RANK[a.urgency] - RANK[b.urgency]);
}

export function doNowCounts(items: DoItem[]) {
  return { now: items.filter((i) => i.urgency === "now").length, today: items.filter((i) => i.urgency === "today").length, week: items.filter((i) => i.urgency === "week").length, later: items.filter((i) => i.urgency === "later").length, total: items.length };
}

/** Runs one quick action. Returns a short confirmation for the toast. */
export async function doNowAction(key: string, op: string): Promise<string> {
  const [kind, id, extra] = key.split(":");
  if (!kind || !id) throw new Error("Unknown item");
  const t = todayLocal();
  switch (`${kind}.${op}`) {
    case "approval.approve": {
      const r = await approve(id);
      if (r.status === "error") throw new Error(r.error);
      return r.status === "ok" ? r.summary : "Approved";
    }
    case "approval.reject":
      await reject(id, "Rejected from Do Now");
      return "Rejected";
    case "lead.called":
      await setLeadStatus(id, "CONTACTED");
      return "Marked contacted";
    case "task.done":
      await setTaskStatus(id, "DONE");
      return "Done";
    case "task.tomorrow":
      await updateTask(id, { dueAt: atLocalMinutes(addDays(t, 1), 17 * 60) });
      return "Moved to tomorrow";
    case "quote.won":
      await setQuoteStatus(id, "ACCEPTED");
      return "Quote won";
    case "quote.lost":
      await setQuoteStatus(id, "DECLINED");
      return "Quote marked lost";
    case "rebook.snooze":
      await snoozeRebook(id, 30);
      return "Snoozed 30 days";
    case "reviewreq.skip":
      await skipReviewRequest(id);
      return "Skipped";
    case "referral.paid":
      await setReferralStatus(id, "PAID");
      return "Reward marked paid";
    case "bill.paid":
      await markBillPaid(id, extra ?? t.slice(0, 7));
      return "Bill marked paid";
    case "person.contacted":
      await logInteraction(id, { channel: "other", summary: "Checked in (from Do Now)" });
      return "Logged";
    case "habit.done":
      await logHabit(id, 1, t);
      return "Nice";
    default:
      throw new Error(`Can't do “${op}” on this item`);
  }
}


import "server-only";
import { db } from "@/lib/db";
import { draftReviewReply } from "@/lib/ai/review";
import { inSendWindow, monthlyReviewStats, reviewRequestText } from "@/lib/business/reviews";
import { fetchGbpReviews, gbpConfigured, postGbpReply } from "@/lib/integrations/gbp";
import { channelStatus, notify } from "@/lib/notify";
import { textCustomer, toE164 } from "@/lib/notify/customer";
import { getSetting } from "@/lib/services/settings";
import { localMinutes, today } from "@/lib/time";

const ASK_AGAIN_DAYS = 180;

/**
 * Completed jobs from the last 3 days (at least an hour old) get one review request each.
 * Skipped up front: no textable phone, or the customer was already asked in the last 180 days.
 */
export async function queueReviewRequests(now: Date = new Date()): Promise<number> {
  const jobs = await db.job.findMany({
    where: { status: "COMPLETED", completedAt: { gte: new Date(now.getTime() - 3 * 86_400_000), lte: new Date(now.getTime() - 3_600_000) } },
    include: { customer: true },
  });
  const existing = new Set((await db.reviewRequest.findMany({ where: { jobId: { in: jobs.map((j) => j.id) } }, select: { jobId: true } })).map((r) => r.jobId));
  let queued = 0;
  for (const j of jobs) {
    if (existing.has(j.id)) continue;
    const c = j.customer;
    const name = c?.name ?? j.title;
    let skipReason: string | null = null;
    if (!c || !toE164(c.phone)) skipReason = "No textable phone number";
    else if (await db.reviewRequest.findFirst({ where: { customerId: c.id, status: "SENT", sentAt: { gte: new Date(now.getTime() - ASK_AGAIN_DAYS * 86_400_000) } } })) skipReason = `Already asked in the last ${ASK_AGAIN_DAYS} days`;
    await db.reviewRequest.create({ data: { jobId: j.id, customerId: c?.id ?? null, name, phone: c?.phone ?? null, status: skipReason ? "SKIPPED" : "PENDING", skipReason } });
    if (!skipReason) queued++;
  }
  return queued;
}

/**
 * Pending requests go through the `review_request_send` tool, so they wait in Approvals unless
 * you switched on auto-approve for review requests. Only during the day (9 AM–7 PM Phoenix).
 */
export async function dispatchReviewRequests(now: Date = new Date()): Promise<string> {
  const link = await getSetting("business.reviewLink");
  if (!link) return "no review link set";
  if (!inSendWindow(Math.floor(localMinutes(now) / 60))) return "outside sending hours";
  const { executeTool } = await import("@/lib/assistant/executor");
  const pending = await db.reviewRequest.findMany({ where: { status: "PENDING", approvalId: null }, take: 20 });
  let asked = 0, sent = 0;
  for (const r of pending) {
    const out = await executeTool("review_request_send", { requestId: r.id }, { actor: "AUTOMATION" });
    if (out.status === "pending_approval") {
      asked++;
      await db.reviewRequest.update({ where: { id: r.id }, data: { approvalId: out.approvalId } });
    } else if (out.status === "ok") sent++;
    else await db.reviewRequest.update({ where: { id: r.id }, data: { status: "FAILED", error: out.error } });
  }
  return `${asked} waiting for approval, ${sent} sent`;
}

export async function reviewRequestMessage(name: string) {
  const [link, business] = await Promise.all([getSetting("business.reviewLink"), getSetting("business.profile")]);
  if (!link) throw new Error("Add your Google review link first (Business → Reviews)");
  return reviewRequestText({ name, business: business.name, link });
}

/** Sends one request. Callers must hold my approval (Send button or the Approvals queue). */
export async function sendReviewRequest(id: string, body?: string) {
  const r = await db.reviewRequest.findUniqueOrThrow({ where: { id } });
  if (r.status === "SENT") throw new Error(`Already sent to ${r.name}`);
  if (!r.phone) throw new Error(`${r.name} has no phone number`);
  try {
    const sent = await textCustomer(r.phone, body?.trim() || (await reviewRequestMessage(r.name)));
    await db.reviewRequest.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    return { name: r.name, to: sent.to };
  } catch (e) {
    await db.reviewRequest.update({ where: { id }, data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) } });
    throw e;
  }
}

export async function skipReviewRequest(id: string) {
  const r = await db.reviewRequest.update({ where: { id }, data: { status: "SKIPPED", skipReason: "Skipped by you" } });
  if (r.approvalId) {
    const { reject } = await import("@/lib/assistant/executor");
    await reject(r.approvalId, "Skipped from the Reviews page");
  }
  return r;
}

/** Pull reviews; new ones get a drafted reply and an alert (1–3★ are flagged). Records today's totals. */
export async function syncReviews(now: Date = new Date()): Promise<string> {
  if (!gbpConfigured()) return "skipped: Google reviews not connected";
  const page = await fetchGbpReviews();
  const business = (await getSetting("business.profile")).name;
  let added = 0;
  for (const r of page.reviews) {
    const existing = await db.review.findUnique({ where: { externalId: r.externalId } });
    if (existing) {
      await db.review.update({ where: { id: existing.id }, data: { rating: r.rating, comment: r.comment, replyText: r.replyText, repliedAt: r.repliedAt } });
      continue;
    }
    const draft = r.replyText ? null : await draftReviewReply(r, business);
    const created = await db.review.create({ data: { ...r, draftReply: draft?.text ?? null, draftBy: draft?.by ?? null } });
    added++;
    // Only alert about recent, unanswered reviews (a first sync imports history quietly).
    if (!r.replyText && r.reviewedAt.getTime() > now.getTime() - 14 * 86_400_000) {
      const st = channelStatus();
      await notify({ title: r.rating <= 3 ? `⚠️ ${r.rating}★ review from ${r.author}` : `New ${r.rating}★ review from ${r.author}`, body: `${r.comment ? `“${r.comment.slice(0, 160)}”` : "(rating only)"}${created.draftReply ? "\nA reply is drafted for you." : ""}`, url: "/business/reviews", channels: st.PUSH.ready ? ["PUSH"] : ["EMAIL"], urgent: false, tag: `review-${created.id}` }, now);
      await db.review.update({ where: { id: created.id }, data: { notifiedAt: now } });
    }
  }
  if (page.total > 0) await db.reviewSnapshot.upsert({ where: { date: today(now) }, create: { date: today(now), count: page.total, average: page.average }, update: { count: page.total, average: page.average } });
  return `${added} new reviews (${page.total} total, ${page.average.toFixed(1)}★)`;
}

/** Posts the reply publicly on Google. Callers must hold my approval. */
export async function postReviewReply(id: string, text: string) {
  const r = await db.review.findUniqueOrThrow({ where: { id } });
  const body = text.trim();
  if (!body) throw new Error("The reply is empty");
  await postGbpReply(r.externalId, body);
  await db.review.update({ where: { id }, data: { replyText: body, repliedAt: new Date(), draftReply: body } });
  return { author: r.author, rating: r.rating };
}

export async function redraftReviewReply(id: string) {
  const r = await db.review.findUniqueOrThrow({ where: { id } });
  const d = await draftReviewReply(r, (await getSetting("business.profile")).name);
  return db.review.update({ where: { id }, data: { draftReply: d.text, draftBy: d.by } });
}

export async function reviewsOverview(now: Date = new Date()) {
  const months = [...Array(12)].map((_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
    return d.toISOString().slice(0, 7);
  });
  const [reviews, snapshots, requests, sent30] = await Promise.all([
    db.review.findMany({ orderBy: { reviewedAt: "desc" }, take: 200 }),
    db.reviewSnapshot.findMany({ orderBy: { date: "asc" }, take: 400 }),
    db.reviewRequest.findMany({ where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.reviewRequest.count({ where: { status: "SENT", sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
  ]);
  const latest = snapshots.at(-1) ?? null;
  const monthAgo = [...snapshots].reverse().find((s) => s.date <= new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)) ?? null;
  return {
    total: latest?.count ?? reviews.length,
    average: latest?.average ?? (reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null),
    gained30: latest && monthAgo ? latest.count - monthAgo.count : reviews.filter((r) => r.reviewedAt.getTime() > now.getTime() - 30 * 86_400_000).length,
    sent30,
    unreplied: reviews.filter((r) => !r.replyText),
    replied: reviews.filter((r) => r.replyText),
    monthly: monthlyReviewStats(reviews, months),
    requests,
  };
}

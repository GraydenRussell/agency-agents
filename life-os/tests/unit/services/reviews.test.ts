import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approve, executeTool } from "@/lib/assistant/executor";
import { inSendWindow, monthlyReviewStats, reviewRequestText, templateReviewReply } from "@/lib/business/reviews";
import { mapGbpReview, resetMockGbp } from "@/lib/integrations/gbp";
import { mockOutbox } from "@/lib/notify";
import { dispatchReviewRequests, postReviewReply, queueReviewRequests, reviewsOverview, skipReviewRequest, syncReviews } from "@/lib/services/reviews";
import { setSetting } from "@/lib/services/settings";
import { resetDb } from "../../setup/db";

const NOON = new Date("2026-10-19T19:00:00Z"); // 12:00 Phoenix
const EVENING = new Date("2026-10-20T03:00:00Z"); // 20:00 Phoenix

beforeEach(async () => {
  await resetDb();
  resetMockGbp();
  mockOutbox().length = 0;
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" });
});

async function finishedJob(name: string, phone: string | null, hoursAgo: number, now = NOON) {
  const c = await db.customer.create({ data: { name, phone, tags: [] } });
  const j = await db.job.create({ data: { title: "Windows", customerId: c.id, status: "COMPLETED", total: 300, completedAt: new Date(now.getTime() - hoursAgo * 3_600_000) } });
  return { c, j };
}

describe("review helpers", () => {
  it("drafts template replies by rating and builds the request text", () => {
    expect(templateReviewReply({ author: "Priya Patel", rating: 5, comment: "Great" }, "Rapid Window Cleaning")).toMatch(/^Thank you Priya! .*– Grayden$/);
    expect(templateReviewReply({ author: "A Google user", rating: 2, comment: "Late" }, "Rapid Window Cleaning")).toMatch(/^Hi, thank you for the honest feedback.*make it right/);
    expect(reviewRequestText({ name: "Tom Becker", business: "Rapid Window Cleaning", link: "https://g.page/r/abc/review" })).toBe("Hi Tom, thanks for choosing Rapid Window Cleaning! If you're happy with your windows, would you mind leaving us a quick Google review? It really helps a small local business: https://g.page/r/abc/review – Grayden");
    expect([inSendWindow(8), inSendWindow(9), inSendWindow(18), inSendWindow(19)]).toEqual([false, true, true, false]);
  });
  it("maps Google's review shape and computes monthly stats", () => {
    expect(mapGbpReview({ reviewId: "x", reviewer: { displayName: "Ann" }, starRating: "FOUR", comment: "Nice (Translated by Google) Bonito", createTime: "2026-10-01T00:00:00Z" })).toMatchObject({ externalId: "x", author: "Ann", rating: 4, comment: "Nice", replyText: null });
    expect(mapGbpReview({ reviewId: "y", starRating: "STAR_RATING_UNSPECIFIED", createTime: "2026-10-01T00:00:00Z" })).toBeNull();
    expect(monthlyReviewStats([{ rating: 5, reviewedAt: new Date("2026-10-02") }, { rating: 4, reviewedAt: new Date("2026-10-20") }, { rating: 3, reviewedAt: new Date("2026-08-01") }], ["2026-08", "2026-09", "2026-10"])).toEqual([{ month: "2026-08", count: 1, average: 3 }, { month: "2026-09", count: 0, average: null }, { month: "2026-10", count: 2, average: 4.5 }]);
  });
});

describe("Google reviews sync + replies", () => {
  it("imports reviews, drafts replies for unanswered ones, alerts on recent ones, and snapshots totals", async () => {
    expect(await syncReviews()).toBe("5 new reviews (87 total, 4.8★)");
    const unreplied = await db.review.findMany({ where: { replyText: null }, orderBy: { reviewedAt: "desc" } });
    expect(unreplied.map((r) => r.author)).toEqual(["Priya Patel", "Mark Delgado"]);
    expect(unreplied.every((r) => r.draftReply && r.draftBy === "template")).toBe(true);
    const titles = mockOutbox().map((m) => m.title);
    expect(titles).toContain("New 5★ review from Priya Patel");
    expect(titles).toContain("⚠️ 3★ review from Mark Delgado");
    expect(titles.some((t) => t.includes("Sun Lakes"))).toBe(false); // already replied
    expect(await db.reviewSnapshot.count()).toBe(1);
    expect(await syncReviews()).toMatch(/^0 new reviews/);
  });

  it("posts a reply and the next sync keeps it", async () => {
    await syncReviews();
    const mark = await db.review.findFirstOrThrow({ where: { author: "Mark Delgado" } });
    expect(await postReviewReply(mark.id, "Sorry Mark, that's on us.")).toEqual({ author: "Mark Delgado", rating: 3 });
    await syncReviews();
    expect(await db.review.findUniqueOrThrow({ where: { id: mark.id } })).toMatchObject({ replyText: "Sorry Mark, that's on us.", repliedAt: expect.any(Date) });
    const o = await reviewsOverview();
    expect(o.unreplied.map((r) => r.author)).toEqual(["Priya Patel"]);
    expect(o.total).toBe(87);
  });

  it("the assistant's review_reply waits for approval", async () => {
    await syncReviews();
    const priya = await db.review.findFirstOrThrow({ where: { author: "Priya Patel" } });
    const r = await executeTool("review_reply", { reviewId: priya.id, text: "Thanks Priya!" }, { actor: "ASSISTANT" });
    expect(r.status).toBe("pending_approval");
    expect(await db.pendingApproval.findFirstOrThrow()).toMatchObject({ risk: "review.reply" });
    expect((await db.review.findUniqueOrThrow({ where: { id: priya.id } })).replyText).toBeNull();
  });
});

describe("review requests", () => {
  it("queues one per finished job, skipping no-phone and recently-asked customers", async () => {
    const tom = await finishedJob("Tom Becker", "480-555-1222", 2);
    await finishedJob("No Phone Nancy", null, 2);
    await finishedJob("Too Fresh Fred", "480-555-1000", 0.5); // under an hour ago
    const asked = await finishedJob("Asked Already Amy", "480-555-1001", 3);
    await db.reviewRequest.create({ data: { jobId: "old-job", customerId: asked.c.id, name: "Asked Already Amy", phone: "480-555-1001", status: "SENT", sentAt: new Date(NOON.getTime() - 10 * 86_400_000) } });

    expect(await queueReviewRequests(NOON)).toBe(1);
    expect(await queueReviewRequests(NOON)).toBe(0); // idempotent
    const rows = await db.reviewRequest.findMany({ where: { jobId: { not: "old-job" } }, orderBy: { name: "asc" } });
    expect(rows.map((r) => [r.name, r.status, r.skipReason])).toEqual([
      ["Asked Already Amy", "SKIPPED", "Already asked in the last 180 days"],
      ["No Phone Nancy", "SKIPPED", "No textable phone number"],
      ["Tom Becker", "PENDING", null],
    ]);
    expect(rows.find((r) => r.jobId === tom.j.id)?.customerId).toBe(tom.c.id);
  });

  it("dispatch needs a review link and daytime, then waits in Approvals; approving sends the text", async () => {
    await finishedJob("Tom Becker", "480-555-1222", 2);
    await queueReviewRequests(NOON);
    expect(await dispatchReviewRequests(NOON)).toBe("no review link set");
    await setSetting("business.reviewLink", "https://g.page/r/rapid/review");
    expect(await dispatchReviewRequests(EVENING)).toBe("outside sending hours");
    expect(await dispatchReviewRequests(NOON)).toBe("1 waiting for approval, 0 sent");
    expect(mockOutbox()).toHaveLength(0);
    const req = await db.reviewRequest.findFirstOrThrow({ where: { status: "PENDING" } });
    expect(req.approvalId).toBeTruthy();
    expect(await dispatchReviewRequests(NOON)).toBe("0 waiting for approval, 0 sent"); // not asked twice
    await approve(req.approvalId!);
    expect(await db.reviewRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "SENT" });
    expect(mockOutbox().at(-1)?.body).toContain("https://g.page/r/rapid/review");
  });

  it("auto-approve sends right away; skipping rejects the pending approval", async () => {
    await setSetting("business.reviewLink", "https://g.page/r/rapid/review");
    await finishedJob("Auto Andy", "480-555-1300", 2);
    await setSetting("approvals.autoApprove", { "review.request": true });
    await queueReviewRequests(NOON);
    expect(await dispatchReviewRequests(NOON)).toBe("0 waiting for approval, 1 sent");

    await setSetting("approvals.autoApprove", {});
    await finishedJob("Skip Sam", "480-555-1301", 2);
    await queueReviewRequests(NOON);
    await dispatchReviewRequests(NOON);
    const sam = await db.reviewRequest.findFirstOrThrow({ where: { name: "Skip Sam" } });
    await skipReviewRequest(sam.id);
    expect(await db.pendingApproval.findUniqueOrThrow({ where: { id: sam.approvalId! } })).toMatchObject({ status: "REJECTED" });
  });
});

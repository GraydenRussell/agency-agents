import "server-only";
import { z } from "zod";
import { BUSINESS_SCOPE, googleAccount, googleFetch } from "./google/oauth";
import { isMock } from "./mode";

/**
 * Google Business Profile reviews (My Business API v4: accounts.locations.reviews). Needs the
 * business.manage scope on your Google connection and Google's approval for the Business Profile
 * APIs on your Cloud project. Docs: developers.google.com/my-business/content/review-data
 */
const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as const;

const reviewSchema = z.object({
  reviewId: z.string(),
  reviewer: z.object({ displayName: z.string().optional() }).partial().optional(),
  starRating: z.enum(["STAR_RATING_UNSPECIFIED", "ONE", "TWO", "THREE", "FOUR", "FIVE"]).optional(),
  comment: z.string().optional(),
  createTime: z.string(),
  reviewReply: z.object({ comment: z.string(), updateTime: z.string().optional() }).optional(),
});

export type GbpReview = { externalId: string; author: string; rating: number; comment: string | null; reviewedAt: Date; replyText: string | null; repliedAt: Date | null };
export type GbpReviewPage = { reviews: GbpReview[]; total: number; average: number };

export function mapGbpReview(r: z.infer<typeof reviewSchema>): GbpReview | null {
  const rating = r.starRating && r.starRating !== "STAR_RATING_UNSPECIFIED" ? STARS[r.starRating] : null;
  if (!rating) return null;
  return { externalId: r.reviewId, author: r.reviewer?.displayName?.trim() || "A Google user", rating, comment: r.comment?.replace(/\(Translated by Google\)[\s\S]*$/, "").trim() || null, reviewedAt: new Date(r.createTime), replyText: r.reviewReply?.comment ?? null, repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null };
}

export const gbpConfigured = () => isMock() || Boolean(process.env.GBP_ACCOUNT_ID && process.env.GBP_LOCATION_ID);

const base = () => `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(process.env.GBP_ACCOUNT_ID ?? "")}/locations/${encodeURIComponent(process.env.GBP_LOCATION_ID ?? "")}`;

async function assertReady() {
  if (!process.env.GBP_ACCOUNT_ID || !process.env.GBP_LOCATION_ID) throw new Error("Set GBP_ACCOUNT_ID and GBP_LOCATION_ID to connect Google reviews");
  const a = await googleAccount();
  if (!a) throw new Error("Connect Google first (Settings)");
  if (!a.scopes.includes(BUSINESS_SCOPE)) throw new Error("Reconnect Google so Life OS can read your Business Profile reviews (new permission)");
}

// ───────────── mock ─────────────
const g = globalThis as unknown as { __gbpReplies?: Map<string, string> };
const mockReplies = () => (g.__gbpReplies ??= new Map());
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
function mockReviews(): GbpReviewPage {
  const rows: GbpReview[] = [
    { externalId: "rv1", author: "Priya Patel", rating: 5, comment: "Grayden and Tyce were on time, friendly, and our windows have never looked this good. They even cleaned the tracks!", reviewedAt: daysAgo(1), replyText: null, repliedAt: null },
    { externalId: "rv2", author: "Mark Delgado", rating: 3, comment: "Windows look good but they showed up an hour later than the window we were given.", reviewedAt: daysAgo(2), replyText: null, repliedAt: null },
    { externalId: "rv3", author: "Sun Lakes HOA", rating: 5, comment: "Reliable every quarter. Highly recommend for commercial work.", reviewedAt: daysAgo(9), replyText: "Thank you! We love working with your team every quarter.", repliedAt: daysAgo(8) },
    { externalId: "rv4", author: "Linda Park", rating: 5, comment: null, reviewedAt: daysAgo(20), replyText: "Thanks so much, Linda!", repliedAt: daysAgo(19) },
    { externalId: "rv5", author: "Chris W.", rating: 4, comment: "Great job on the hard water spots. Pricing was fair.", reviewedAt: daysAgo(41), replyText: "Appreciate it, Chris! Those back sliders were a challenge.", repliedAt: daysAgo(40) },
  ];
  for (const r of rows) if (mockReplies().has(r.externalId)) Object.assign(r, { replyText: mockReplies().get(r.externalId), repliedAt: new Date() });
  return { reviews: rows, total: 87, average: 4.8 };
}
export const resetMockGbp = () => mockReplies().clear();

// ───────────── API ─────────────
export async function fetchGbpReviews(maxPages = 4): Promise<GbpReviewPage> {
  if (isMock()) return mockReviews();
  await assertReady();
  const out: GbpReview[] = [];
  let token: string | undefined;
  let total = 0, average = 0;
  for (let i = 0; i < maxPages; i++) {
    const url = new URL(`${base()}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (token) url.searchParams.set("pageToken", token);
    const res = await googleFetch(url.toString());
    if (res.status === 403) throw new Error("Google refused the Business Profile API (is your Cloud project approved for it?)");
    if (!res.ok) throw new Error(`Business Profile reviews returned ${res.status}`);
    const body = z.object({ reviews: z.array(z.unknown()).default([]), averageRating: z.number().optional(), totalReviewCount: z.number().optional(), nextPageToken: z.string().optional() }).parse(await res.json());
    total = body.totalReviewCount ?? total;
    average = body.averageRating ?? average;
    for (const raw of body.reviews) {
      const p = reviewSchema.safeParse(raw);
      const m = p.success ? mapGbpReview(p.data) : null;
      if (m) out.push(m);
    }
    token = body.nextPageToken;
    if (!token) break;
  }
  return { reviews: out, total, average };
}

/** Public: posts (or replaces) your reply on Google. Callers must hold my approval. */
export async function postGbpReply(externalId: string, comment: string): Promise<void> {
  if (isMock()) {
    mockReplies().set(externalId, comment);
    return;
  }
  await assertReady();
  const res = await googleFetch(`${base()}/reviews/${encodeURIComponent(externalId)}/reply`, { method: "PUT", json: { comment } });
  if (!res.ok) throw new Error(`Google didn't accept the reply (${res.status})`);
}

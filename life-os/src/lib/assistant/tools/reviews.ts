import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import * as reviews from "@/lib/services/reviews";
import { defineTool } from "../registry";

export const reviewTools = [
  defineTool({
    name: "review_list",
    description: "Recent Google reviews for Rapid Window Cleaning with rating, text, whether it has a reply, and the drafted reply. Also returns the overall rating and review count.",
    schema: z.object({ unrepliedOnly: z.boolean().optional() }),
    actionType: "review.list",
    kind: "read",
    summarize: () => "List reviews",
    run: async (i) => {
      const o = await reviews.reviewsOverview();
      const list = (i.unrepliedOnly ? o.unreplied : [...o.unreplied, ...o.replied]).slice(0, 20);
      return { result: { total: o.total, average: o.average, gainedLast30Days: o.gained30, reviews: list.map((r) => ({ id: r.id, author: r.author, rating: r.rating, comment: r.comment, date: r.reviewedAt.toISOString().slice(0, 10), reply: r.replyText, draftReply: r.draftReply })) } };
    },
  }),
  defineTool({
    name: "review_reply",
    description: "Post a public reply to a Google review. Use the drafted reply unless Grayden asked for changes. Always waits for Grayden's approval unless he turned on auto-approve for review replies.",
    schema: z.object({ reviewId: z.string(), text: z.string().min(1).max(1500) }),
    actionType: "review.reply",
    kind: "write",
    approval: () => ({ key: "review.reply" }),
    summarize: async (i) => {
      const r = await db.review.findUnique({ where: { id: i.reviewId } });
      if (!r) throw new Error(`No review with id ${i.reviewId}`);
      return `Reply publicly to ${r.author}'s ${r.rating}★ Google review: “${i.text.slice(0, 160)}${i.text.length > 160 ? "…" : ""}”`;
    },
    run: async (i) => {
      const r = await reviews.postReviewReply(i.reviewId, i.text);
      return { result: r, summary: `Replied to ${r.author}'s ${r.rating}★ review on Google` };
    },
  }),
  defineTool({
    name: "review_request_send",
    description: "Text a customer after a completed job asking for a Google review (link from Settings). Normally queued automatically after each completed job; waits for Grayden's approval unless review requests are set to auto-approve.",
    schema: z.object({ requestId: z.string() }),
    actionType: "review.request",
    kind: "write",
    approval: () => ({ key: "review.request" }),
    summarize: async (i) => {
      const r = await db.reviewRequest.findUnique({ where: { id: i.requestId } });
      if (!r) throw new Error(`No review request with id ${i.requestId}`);
      return `Text ${r.name} (${r.phone ?? "no phone"}) asking for a Google review`;
    },
    run: async (i) => {
      const r = await reviews.sendReviewRequest(i.requestId);
      return { result: r, summary: `Asked ${r.name} for a Google review (${r.to})` };
    },
  }),
];

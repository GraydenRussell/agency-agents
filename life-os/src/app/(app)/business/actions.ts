"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { pricingRulesSchema, type PricingRules } from "@/lib/business/pricing";
import * as customers from "@/lib/services/customers";
import * as leads from "@/lib/services/leads";
import * as quotes from "@/lib/services/quotes";
import * as rebook from "@/lib/services/rebook";
import * as reviews from "@/lib/services/reviews";
import * as referrals from "@/lib/services/referrals";
import * as kpis from "@/lib/services/kpis";
import { rescheduleTask } from "@/lib/services/weather-plan";
import { approve } from "@/lib/assistant/executor";
import { setSetting, type SettingValue } from "@/lib/services/settings";

const refresh = () => revalidatePath("/business", "layout");

export async function syncHousecallAction() {
  return runAction(async () => {
    const r = await customers.syncHousecallPro();
    refresh();
    return `Synced ${r.customers.created + r.customers.updated} customers and ${r.jobs.created + r.jobs.updated} jobs (${r.customers.created} new customers)`;
  });
}
export async function createCustomerAction(input: customers.CustomerInput) {
  return runAction(async () => {
    const c = await customers.createCustomer(input);
    refresh();
    return c.id;
  });
}
export async function updateCustomerAction(id: string, input: Partial<customers.CustomerInput>) {
  return runAction(async () => {
    await customers.updateCustomer(id, input);
    refresh();
    return undefined;
  });
}

export async function createQuoteAction(input: quotes.QuoteInput) {
  return runAction(async () => {
    const q = await quotes.createQuote(input);
    refresh();
    return q.id;
  });
}
export async function updateQuoteAction(id: string, input: Partial<quotes.QuoteInput>) {
  return runAction(async () => {
    const q = await quotes.updateQuote(id, input);
    refresh();
    return q.id;
  });
}
export async function setQuoteStatusAction(id: string, status: "ACCEPTED" | "DECLINED" | "DRAFT") {
  return runAction(async () => {
    const q = await quotes.setQuoteStatus(id, status);
    await db.activityLog.create({ data: { actor: "USER", actionType: "quote.status", summary: `Marked quote #${q.number} ${status.toLowerCase()}`, input: { quoteId: id, status } } });
    refresh();
    return undefined;
  });
}
/** Pressing Send after reviewing the message is the approval (same rule as inbox replies). */
export async function sendQuoteAction(id: string, via: quotes.QuoteChannel[], custom: { sms?: string; email?: string } = {}) {
  return runAction(async () => {
    const r = await quotes.sendQuote(id, via, custom);
    const summary = `Sent quote #${r.number} (${quotes.usd(r.total)}) by ${r.sent.map((s) => `${s.channel === "SMS" ? "text" : "email"} to ${s.to}`).join(" and ")}`;
    await db.activityLog.create({ data: { actor: "USER", actionType: "quote.send", summary, input: { quoteId: id, via }, result: r } });
    refresh();
    return summary;
  });
}
export async function savePricingAction(rules: PricingRules) {
  return runAction(async () => {
    await setSetting("business.pricing", pricingRulesSchema.parse(rules));
    refresh();
    return undefined;
  });
}
export async function saveBusinessProfileAction(profile: SettingValue<"business.profile">) {
  return runAction(async () => {
    await setSetting("business.profile", profile);
    refresh();
    return undefined;
  });
}

export async function createLeadAction(input: Parameters<typeof leads.createManualLead>[0]) {
  return runAction(async () => {
    const l = await leads.createManualLead(input);
    refresh();
    return l.id;
  });
}
export async function setLeadStatusAction(id: string, status: "NEW" | "CONTACTED" | "QUOTED" | "WON" | "LOST") {
  return runAction(async () => {
    const l = await leads.setLeadStatus(id, status);
    await db.activityLog.create({ data: { actor: "USER", actionType: "lead.status", summary: `Marked lead ${l.name} ${status.toLowerCase()}`, input: { leadId: id, status } } });
    refresh();
    return undefined;
  });
}
export async function rescoreLeadAction(id: string) {
  return runAction(async () => {
    const l = await leads.scoreLead(id);
    refresh();
    return l.score ?? 0;
  });
}
/** Pressing Send after reading the reply is the approval (same rule as inbox replies). */
export async function replyLeadAction(id: string, via: leads.LeadChannel, body: string) {
  return runAction(async () => {
    const r = await leads.replyToLead(id, via, body);
    const summary = `Replied to ${r.name} by ${r.via === "SMS" ? "text" : "email"} (${r.to})`;
    await db.activityLog.create({ data: { actor: "USER", actionType: "lead.reply", summary, input: { leadId: id, via, body } } });
    refresh();
    return summary;
  });
}

/** Pressing Send after reading the text is the approval. */
export async function sendRebookAction(customerId: string, body: string) {
  return runAction(async () => {
    const r = await rebook.sendRebookText(customerId, body);
    const summary = `Sent re-book text to ${r.name} (${r.to})`;
    await db.activityLog.create({ data: { actor: "USER", actionType: "rebook.text", summary, input: { customerId, body } } });
    refresh();
    return summary;
  });
}
export async function snoozeRebookAction(customerId: string, days: number) {
  return runAction(async () => {
    await rebook.snoozeRebook(customerId, days);
    refresh();
    return undefined;
  });
}
export async function rebookOptOutAction(customerId: string, optOut: boolean) {
  return runAction(async () => {
    await rebook.setRebookOptOut(customerId, optOut);
    refresh();
    return undefined;
  });
}

export async function saveReviewLinkAction(link: string) {
  return runAction(async () => {
    const v = link.trim();
    if (v && !/^https:\/\//.test(v)) throw new Error("Paste the full https:// link from Business Profile → Ask for reviews");
    await setSetting("business.reviewLink", v);
    refresh();
    return undefined;
  });
}
/** Send = approval. If the request is already waiting in Approvals, approve that one so it isn't left dangling. */
export async function sendReviewRequestAction(id: string) {
  return runAction(async () => {
    const r = await db.reviewRequest.findUniqueOrThrow({ where: { id } });
    if (r.approvalId) {
      const out = await approve(r.approvalId);
      if (out.status !== "ok") throw new Error(out.status === "error" ? out.error : "Couldn't send");
      refresh();
      return out.summary;
    }
    const sent = await reviews.sendReviewRequest(id);
    const summary = `Asked ${sent.name} for a Google review (${sent.to})`;
    await db.activityLog.create({ data: { actor: "USER", actionType: "review.request", summary, input: { requestId: id } } });
    refresh();
    return summary;
  });
}
export async function skipReviewRequestAction(id: string) {
  return runAction(async () => {
    await reviews.skipReviewRequest(id);
    refresh();
    return undefined;
  });
}
/** Posting publicly after reading the reply is the approval. */
export async function postReviewReplyAction(id: string, text: string) {
  return runAction(async () => {
    const r = await reviews.postReviewReply(id, text);
    const summary = `Replied to ${r.author}'s ${r.rating}★ review on Google`;
    await db.activityLog.create({ data: { actor: "USER", actionType: "review.reply", summary, input: { reviewId: id, text } } });
    refresh();
    return summary;
  });
}
export async function redraftReviewAction(id: string) {
  return runAction(async () => {
    const r = await reviews.redraftReviewReply(id);
    refresh();
    return r.draftReply ?? "";
  });
}
export async function syncReviewsAction() {
  return runAction(async () => {
    const out = await reviews.syncReviews();
    refresh();
    return out;
  });
}

export async function createReferralAction(input: { referrerId: string; referredName: string; notes?: string }) {
  return runAction(async () => {
    const r = await referrals.createReferral(input);
    await db.activityLog.create({ data: { actor: "USER", actionType: "referral.add", summary: `Recorded referral → ${r.referredName}`, input } });
    refresh();
    return r.id;
  });
}
export async function setReferralStatusAction(id: string, status: "PENDING" | "EARNED" | "PAID" | "VOID") {
  return runAction(async () => {
    const r = await referrals.setReferralStatus(id, status);
    await db.activityLog.create({ data: { actor: "USER", actionType: "referral.status", summary: `Referral → ${r.referredName} marked ${status.toLowerCase()}`, input: { id, status } } });
    refresh();
    return undefined;
  });
}
export async function saveReferralRewardAction(amount: number, kind: "credit" | "cash" | "gift card") {
  return runAction(async () => {
    await setSetting("business.referralReward", { amount, kind });
    refresh();
    return undefined;
  });
}

export async function saveDashboardUrlAction(url: string) {
  return runAction(async () => {
    const v = url.trim().replace(/\/$/, "");
    if (v && !/^https:\/\/[^\s]+$/.test(v)) throw new Error("Use the full https:// address of your dashboard");
    await setSetting("business.dashboardUrl", v);
    refresh();
    return undefined;
  });
}

export async function addAdSpendAction(input: { date: string; source: "GOOGLE_ADS" | "DOOR_HANGERS" | "NEXTDOOR" | "OTHER"; amount: number; note?: string }) {
  return runAction(async () => {
    await kpis.addAdSpend(input);
    refresh();
    return undefined;
  });
}
export async function saveRevenueGoalAction(goal: number) {
  return runAction(async () => {
    await setSetting("business.monthlyRevenueGoal", goal);
    refresh();
    return undefined;
  });
}
export async function syncAdSpendAction() {
  return runAction(async () => {
    const out = await kpis.syncAdSpend();
    refresh();
    return out;
  });
}

export async function rescheduleTaskAction(jobId: string, toDate: string | null) {
  return runAction(async () => {
    const t = await rescheduleTask(jobId, toDate);
    revalidatePath("/tasks");
    return t.title;
  });
}

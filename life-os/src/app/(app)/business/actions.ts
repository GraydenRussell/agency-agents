"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { pricingRulesSchema, type PricingRules } from "@/lib/business/pricing";
import * as customers from "@/lib/services/customers";
import * as leads from "@/lib/services/leads";
import * as quotes from "@/lib/services/quotes";
import * as rebook from "@/lib/services/rebook";
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

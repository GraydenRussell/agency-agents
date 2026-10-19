import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { scoreLeadWithAi } from "@/lib/ai/lead";
import { looksLikeSpam, normalizeLeadFields, waitingMinutes, type LeadFields } from "@/lib/business/leads";
import { notify, channelStatus, type ChannelName } from "@/lib/notify";
import { emailCustomer, textCustomer, toE164 } from "@/lib/notify/customer";
import { getSetting } from "@/lib/services/settings";
import { formatWait } from "./lead-format";
import type { Lead, LeadSource, LeadStatus, Prisma } from "@/generated/prisma/client";

export type IngestResult = { status: "created"; lead: Lead } | { status: "merged"; lead: Lead } | { status: "duplicate"; lead: Lead } | { status: "spam" };

const digits = (p: string | null) => (p ? p.replace(/\D/g, "").slice(-10) : "");

/**
 * One way in for every source. Dedupes by (source, externalId), and folds a second message from the
 * same phone/email within 24h into the open lead instead of creating another. Links to an existing
 * customer by phone or email. Scoring and the "new lead" alert happen in `processNewLead`.
 */
export async function ingestLead(opts: { source: LeadSource; raw: Record<string, unknown>; externalId?: string | null; sourceDetail?: string | null; receivedAt?: Date }): Promise<IngestResult> {
  if (opts.externalId) {
    const existing = await db.lead.findUnique({ where: { source_externalId: { source: opts.source, externalId: opts.externalId } } });
    if (existing) return { status: "duplicate", lead: existing };
  }
  const f = normalizeLeadFields(opts.raw);
  if (looksLikeSpam(opts.raw, f)) return { status: "spam" };

  const since = new Date(Date.now() - 24 * 3_600_000);
  const phone10 = digits(f.phone);
  const recent = await db.lead.findMany({ where: { receivedAt: { gte: since }, status: { in: ["NEW", "CONTACTED"] }, OR: [...(f.email ? [{ email: f.email }] : []), ...(phone10 ? [{ phone: { contains: phone10.slice(-4) } }] : [])] } });
  const same = recent.find((l) => (f.email && l.email === f.email) || (phone10 && digits(l.phone) === phone10));
  if (same) {
    const lead = await db.lead.update({ where: { id: same.id }, data: { message: [same.message, f.message].filter(Boolean).join("\n\n---\n\n").slice(0, 8000) || null, phone: same.phone ?? f.phone, email: same.email ?? f.email, address: same.address ?? f.address } });
    return { status: "merged", lead };
  }

  const customers = phone10 || f.email ? await db.customer.findMany({ where: { OR: [...(f.email ? [{ email: { equals: f.email, mode: "insensitive" as const } }] : []), ...(phone10 ? [{ phone: { contains: phone10.slice(-4) } }] : [])] }, select: { id: true, phone: true, email: true } }) : [];
  const customer = customers.find((c) => (f.email && c.email?.toLowerCase() === f.email) || (phone10 && digits(c.phone) === phone10));
  const lead = await db.lead.create({ data: { source: opts.source, externalId: opts.externalId ?? null, sourceDetail: opts.sourceDetail ?? null, ...f, customerId: customer?.id ?? null, receivedAt: opts.receivedAt ?? new Date() } });
  return { status: "created", lead };
}

/** Score + draft a reply, then alert me. Safe to call twice (only scores unscored leads). */
export async function processNewLead(id: string): Promise<Lead> {
  let lead = await db.lead.findUniqueOrThrow({ where: { id } });
  if (lead.score == null) lead = await scoreLead(id);
  if (!lead.alertedAt) {
    const src = SOURCE_LABEL[lead.source];
    await notify({
      title: `New lead: ${lead.name}`,
      body: `${src}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ""} · score ${lead.score ?? "?"}${lead.scoreReason ? ` · ${lead.scoreReason}` : ""}${lead.message ? `\n“${lead.message.slice(0, 140)}”` : ""}`,
      url: `/business/leads/${lead.id}`,
      channels: alertChannels(),
      tag: `lead-${lead.id}`,
    });
    lead = await db.lead.update({ where: { id }, data: { alertedAt: new Date() } });
  }
  return lead;
}

export async function scoreLead(id: string): Promise<Lead> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id } });
  const [serviceArea, business] = await Promise.all([getSetting("business.serviceArea"), getSetting("business.profile")]);
  const s = await scoreLeadWithAi({ ...lead, source: lead.source }, { serviceArea, business });
  return db.lead.update({ where: { id }, data: { score: s.score, scoreReason: s.reason, scoredBy: s.by, draftReply: lead.firstResponseAt ? lead.draftReply : s.reply } });
}

function alertChannels(): ChannelName[] {
  const st = channelStatus();
  return st.PUSH.ready ? ["PUSH", ...(st.SMS.ready ? (["SMS"] as const) : [])] : st.SMS.ready ? ["SMS"] : ["EMAIL"];
}

export const SOURCE_LABEL: Record<LeadSource, string> = { WEBSITE: "Website form", META: "Meta lead ad", EMAIL: "Email", PHONE: "Phone call", REFERRAL: "Referral", OTHER: "Other" };

// ───────────── reads ─────────────

export type LeadFilter = LeadStatus | "OPEN" | "ALL";

export async function listLeads(filter: LeadFilter = "OPEN", take = 200) {
  const where: Prisma.LeadWhereInput = filter === "ALL" ? {} : filter === "OPEN" ? { status: { in: ["NEW", "CONTACTED", "QUOTED"] } } : { status: filter };
  const rows = await db.lead.findMany({ where, orderBy: [{ receivedAt: "desc" }], take });
  // New + unanswered first (longest wait first), then by score.
  const now = new Date();
  return rows.sort((a, b) => {
    const wa = waitingMinutes(a, now), wb = waitingMinutes(b, now);
    if ((wa != null) !== (wb != null)) return wa != null ? -1 : 1;
    if (wa != null && wb != null) return wb - wa;
    return b.receivedAt.getTime() - a.receivedAt.getTime();
  });
}

export async function leadCounts() {
  const nudge = await getSetting("leads.nudgeMinutes");
  const open = await db.lead.findMany({ where: { status: "NEW", firstResponseAt: null }, select: { receivedAt: true } });
  const late = open.filter((l) => Date.now() - l.receivedAt.getTime() >= nudge * 60_000).length;
  return { unanswered: open.length, late, nudgeMinutes: nudge };
}

export async function getLead(id: string) {
  return db.lead.findUnique({ where: { id }, include: { customer: true, quotes: { orderBy: { createdAt: "desc" } } } });
}

// ───────────── writes ─────────────

export const manualLeadInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.union([z.string().trim().email("That email doesn't look right"), z.literal("")]).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
  source: z.enum(["PHONE", "REFERRAL", "OTHER", "WEBSITE", "EMAIL", "META"]).default("PHONE"),
  sourceDetail: z.string().max(200).optional().nullable(),
});

/** A lead I'm entering myself (phone call, referral). Not deduped against spam rules. */
export async function createManualLead(input: z.input<typeof manualLeadInput>) {
  const v = manualLeadInput.parse(input);
  const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
  // A phone call means I'm already talking to them; anything else still needs a first reply.
  const talking = v.source === "PHONE" ? { status: "CONTACTED" as const, firstResponseAt: new Date() } : {};
  const lead = await db.lead.create({ data: { source: v.source, sourceDetail: blank(v.sourceDetail), name: v.name, phone: blank(v.phone), email: blank(v.email)?.toLowerCase() ?? null, address: blank(v.address), message: blank(v.message), alertedAt: new Date(), ...talking } });
  return scoreLead(lead.id);
}

export async function setLeadStatus(id: string, status: LeadStatus) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id } });
  const responded = status !== "NEW" && !lead.firstResponseAt ? { firstResponseAt: new Date() } : {};
  return db.lead.update({ where: { id }, data: { status, ...responded } });
}

export type LeadChannel = "SMS" | "EMAIL";

export function leadReach(l: Pick<Lead, "phone" | "email">): LeadChannel[] {
  return [...(toE164(l.phone) ? ["SMS" as const] : []), ...(l.email ? ["EMAIL" as const] : [])];
}

/** Sends my reply. Callers must already hold my approval (Send button, or the Approvals queue). */
export async function replyToLead(id: string, via: LeadChannel, body: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id } });
  const text = body.trim();
  if (!text) throw new Error("The reply is empty");
  if (!leadReach(lead).includes(via)) throw new Error(via === "SMS" ? "This lead has no textable phone number" : "This lead has no email address");
  const business = await getSetting("business.profile");
  const r = via === "SMS" ? await textCustomer(lead.phone!, text) : await emailCustomer({ to: lead.email!, name: lead.name, subject: `Your window cleaning quote request – ${business.name}`, body: text });
  await db.lead.update({ where: { id }, data: { firstResponseAt: lead.firstResponseAt ?? new Date(), status: lead.status === "NEW" ? "CONTACTED" : lead.status, draftReply: text } });
  return { to: r.to, via, name: lead.name };
}

// ───────────── automation ─────────────

/** Nudges at 1×, 4×, and 16× the threshold (15 min, 1 h, 4 h by default), then stop. */
export const nudgeThresholds = (nudgeMinutes: number) => [nudgeMinutes, nudgeMinutes * 4, nudgeMinutes * 16];

/**
 * Every 5 minutes: pull new LEAD-category emails into the inbox, then nudge me about leads still
 * waiting for a first reply. Quiet hours hold back SMS/push; a nudge that wasn't delivered isn't
 * counted, so it fires when quiet hours end.
 */
export async function leadWatch(now: Date = new Date()): Promise<string> {
  const pulled = await leadsFromEmail();
  const steps = nudgeThresholds(await getSetting("leads.nudgeMinutes"));
  const waiting = await db.lead.findMany({ where: { status: "NEW", firstResponseAt: null, nudgeCount: { lt: steps.length }, receivedAt: { lte: new Date(now.getTime() - steps[0]! * 60_000) } } });
  let sent = 0;
  for (const l of waiting) {
    const mins = waitingMinutes(l, now) ?? 0;
    if (mins < steps[l.nudgeCount]!) continue;
    const results = await notify({ title: `⏱ ${l.name} has waited ${formatWait(mins)}`, body: `${SOURCE_LABEL[l.source]} lead, score ${l.score ?? "?"}. A draft reply is ready: tap to review and send.`, url: `/business/leads/${l.id}`, channels: alertChannels(), tag: `lead-${l.id}` }, now);
    if (results.some((r) => r.ok)) {
      sent++;
      await db.lead.update({ where: { id: l.id }, data: { nudgeCount: { increment: 1 }, lastNudgedAt: now } });
    }
  }
  return `pulled ${pulled} email leads, nudged ${sent}/${waiting.length} waiting`;
}

export { formatWait } from "./lead-format";

/** Email threads the triage marked as LEAD (not from me) become leads once. */
export async function leadsFromEmail(): Promise<number> {
  const threads = await db.emailThread.findMany({ where: { category: "LEAD", inInbox: true }, include: { messages: { orderBy: { date: "asc" }, take: 3 } }, orderBy: { lastMessageAt: "desc" }, take: 25 });
  let created = 0;
  for (const t of threads) {
    const first = t.messages.find((m) => !m.isFromMe);
    if (!first) continue;
    const fields: Record<string, unknown> = { name: t.fromName ?? first.fromName ?? first.fromEmail, email: first.fromEmail, message: `${t.subject}\n\n${first.bodyText.slice(0, 3000)}` };
    const phone = first.bodyText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0];
    if (phone) fields.phone = phone;
    const r = await ingestLead({ source: "EMAIL", externalId: t.id, sourceDetail: t.fromEmail, raw: fields, receivedAt: first.date });
    if (r.status === "created") {
      created++;
      await processNewLead(r.lead.id);
    }
  }
  return created;
}

export type { LeadFields };

import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { hmac, safeEqual } from "@/lib/crypto";
import { priceQuote, quoteInputsSchema, type QuoteInputs, type QuoteLine } from "@/lib/business/pricing";
import { renderQuotePdf } from "@/lib/business/quote-pdf";
import { emailCustomer, textCustomer, toE164 } from "@/lib/notify/customer";
import { getSetting } from "@/lib/services/settings";
import { addDays, formatLocalDate, localDateOf, parseLocalDate, today } from "@/lib/time";
import type { Prisma, Quote } from "@/generated/prisma/client";
import { formatUsd } from "@/lib/utils";

/** Whole dollars when exact, cents otherwise ($430 / $430.10). */
export const usd = (n: number) => formatUsd(n, { cents: Math.round(n * 100) % 100 !== 0 });

export const quoteInput = z.object({
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Customer name is required").max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.union([z.string().trim().email("That email doesn't look right"), z.literal("")]).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().max(3000).optional().nullable(),
  inputs: quoteInputsSchema,
  /** Also add this person to Customers (only when no customer is linked). */
  saveCustomer: z.boolean().optional(),
});
export type QuoteInput = z.input<typeof quoteInput>;

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export type QuoteView = Omit<Quote, "lines" | "inputs"> & { lines: QuoteLine[]; inputs: QuoteInputs };
const view = (q: Quote): QuoteView => ({ ...q, lines: q.lines as unknown as QuoteLine[], inputs: quoteInputsSchema.parse(q.inputs) });

export async function createQuote(raw: QuoteInput): Promise<QuoteView> {
  const input = quoteInput.parse(raw);
  const rules = await getSetting("business.pricing");
  const priced = priceQuote(input.inputs, rules);
  if (priced.total <= 0) throw new Error("Add at least one item to quote");
  let customerId = input.customerId ?? null;
  if (customerId && !(await db.customer.findUnique({ where: { id: customerId } }))) throw new Error("That customer no longer exists");
  if (!customerId && input.saveCustomer) {
    const c = await db.customer.create({ data: { name: input.name, phone: blank(input.phone), email: blank(input.email), address: blank(input.address), source: "MANUAL", tags: [] } });
    customerId = c.id;
  }
  const leadId = input.leadId ?? null;
  if (leadId && !(await db.lead.findUnique({ where: { id: leadId } }))) throw new Error("That lead no longer exists");
  const q = await db.quote.create({
    data: { leadId, customerId, name: input.name, phone: blank(input.phone), email: blank(input.email), address: blank(input.address), notes: blank(input.notes), inputs: json(input.inputs), lines: json(priced.lines), subtotal: priced.subtotal, total: priced.total, validUntil: addDays(today(), rules.validDays) },
  });
  if (leadId) await db.lead.updateMany({ where: { id: leadId, status: { in: ["NEW", "CONTACTED"] } }, data: { status: "QUOTED", ...(customerId ? { customerId } : {}) } });
  return view(q);
}

/** Edits reprice with the current rules. Accepted/declined quotes are final. */
export async function updateQuote(id: string, raw: Partial<QuoteInput>): Promise<QuoteView> {
  const q = await db.quote.findUniqueOrThrow({ where: { id } });
  if (q.status === "ACCEPTED" || q.status === "DECLINED") throw new Error(`Quote #${q.number} is ${q.status.toLowerCase()}; make a new one instead`);
  const input = quoteInput.partial().parse(raw);
  const data: Prisma.QuoteUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  for (const k of ["phone", "email", "address", "notes"] as const) if (input[k] !== undefined) data[k] = blank(input[k]);
  if (input.inputs) {
    const rules = await getSetting("business.pricing");
    const priced = priceQuote(input.inputs, rules);
    if (priced.total <= 0) throw new Error("Add at least one item to quote");
    Object.assign(data, { inputs: json(input.inputs), lines: json(priced.lines), subtotal: priced.subtotal, total: priced.total });
  }
  return view(await db.quote.update({ where: { id }, data }));
}

/** Winning/losing a quote carries over to the lead it came from. */
export async function setQuoteStatus(id: string, status: "ACCEPTED" | "DECLINED" | "DRAFT"): Promise<QuoteView> {
  const q = await db.quote.update({ where: { id }, data: { status, decidedAt: status === "DRAFT" ? null : new Date() } });
  if (q.leadId) await db.lead.update({ where: { id: q.leadId }, data: { status: status === "ACCEPTED" ? "WON" : status === "DECLINED" ? "LOST" : "QUOTED" } });
  return view(q);
}

export async function getQuote(id: string): Promise<QuoteView | null> {
  const q = await db.quote.findUnique({ where: { id } });
  return q ? view(q) : null;
}

export async function getQuoteByNumber(number: number): Promise<QuoteView | null> {
  const q = await db.quote.findUnique({ where: { number } });
  return q ? view(q) : null;
}

export async function listQuotes(opts: { status?: Quote["status"] | "OPEN"; take?: number } = {}): Promise<QuoteView[]> {
  const where: Prisma.QuoteWhereInput = opts.status === "OPEN" ? { status: { in: ["DRAFT", "SENT"] } } : opts.status ? { status: opts.status } : {};
  return (await db.quote.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.take ?? 200 })).map(view);
}

/** Pure: open pipeline value and close rate over decided quotes. */
export function quoteStats(quotes: Array<Pick<Quote, "status" | "total">>) {
  const open = quotes.filter((q) => q.status === "DRAFT" || q.status === "SENT");
  const won = quotes.filter((q) => q.status === "ACCEPTED");
  const decided = won.length + quotes.filter((q) => q.status === "DECLINED").length;
  return { openCount: open.length, openValue: open.reduce((s, q) => s + q.total, 0), wonValue: won.reduce((s, q) => s + q.total, 0), closeRate: decided ? won.length / decided : null };
}

export const isExpired = (q: Pick<Quote, "validUntil" | "status">, on: string = today()) => (q.status === "DRAFT" || q.status === "SENT") && q.validUntil < on;

// ───────────── customer link (public, signed) ─────────────

function linkSecret(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not set");
  return k;
}
/** `<quoteId>.<sig>`: unguessable, needs no login, dies when the quote is deleted. */
export function quoteToken(id: string): string {
  return `${id}.${hmac(linkSecret(), `quote-link:${id}`).slice(0, 32)}`;
}
export function verifyQuoteToken(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return safeEqual(sig, hmac(linkSecret(), `quote-link:${id}`).slice(0, 32)) ? id : null;
}
export const quoteUrl = (id: string) => `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/q/${quoteToken(id)}`;

export async function quotePdf(q: QuoteView): Promise<Uint8Array> {
  const business = await getSetting("business.profile");
  const created = localDateOf(q.createdAt);
  const year = (s: string) => parseLocalDate(s).y;
  return renderQuotePdf({
    number: q.number,
    date: `${formatLocalDate(created)}, ${year(created)}`,
    validUntil: `${formatLocalDate(q.validUntil)}, ${year(q.validUntil)}`,
    customer: { name: q.name, address: q.address, phone: q.phone, email: q.email },
    lines: q.lines,
    total: q.total,
    notes: q.notes,
    business,
  });
}

// ───────────── sending ─────────────

export type QuoteChannel = "SMS" | "EMAIL";

export async function quoteMessage(q: Pick<QuoteView, "id" | "name" | "number" | "total" | "validUntil">): Promise<{ sms: string; subject: string; email: string }> {
  const b = await getSetting("business.profile");
  const first = q.name.split(/\s+/)[0] ?? q.name;
  const link = quoteUrl(q.id);
  const valid = formatLocalDate(q.validUntil);
  return {
    sms: `Hi ${first}, here's your ${b.name} quote #${q.number}: ${usd(q.total)}. View it here: ${link} (good through ${valid}). Reply YES to get on the schedule!`,
    subject: `Your ${b.name} quote #${q.number} (${usd(q.total)})`,
    email: `Hi ${first},\n\nThanks for reaching out! Your quote #${q.number} for ${usd(q.total)} is attached (also viewable here: ${link}). It's good through ${valid}.\n\nJust reply to this email or text us to get on the schedule.\n\nThanks,\n${b.name}${b.phone ? `\n${b.phone}` : ""}`,
  };
}

/** Which channels can actually reach this customer. */
export function quoteReach(q: Pick<Quote, "phone" | "email">): QuoteChannel[] {
  return [...(toE164(q.phone) ? ["SMS" as const] : []), ...(q.email ? ["EMAIL" as const] : [])];
}

/** Delivers the quote. Callers must already hold the user's approval (Send button or Approvals queue). */
export async function sendQuote(id: string, via: QuoteChannel[], custom?: { sms?: string; email?: string }) {
  const q = await getQuote(id);
  if (!q) throw new Error("Quote not found");
  if (q.status === "ACCEPTED" || q.status === "DECLINED") throw new Error(`Quote #${q.number} is already ${q.status.toLowerCase()}`);
  const channels = [...new Set(via)];
  if (!channels.length) throw new Error("Pick text, email, or both");
  const reach = quoteReach(q);
  for (const c of channels) if (!reach.includes(c)) throw new Error(c === "SMS" ? `Quote #${q.number} has no textable phone number` : `Quote #${q.number} has no email address`);
  const msg = await quoteMessage(q);
  const sent: Array<{ channel: QuoteChannel; to: string }> = [];
  if (channels.includes("SMS")) sent.push({ channel: "SMS", ...(await textCustomer(q.phone!, custom?.sms?.trim() || msg.sms)) });
  if (channels.includes("EMAIL")) {
    const pdf = await quotePdf(q);
    sent.push({ channel: "EMAIL", ...(await emailCustomer({ to: q.email!, name: q.name, subject: msg.subject, body: custom?.email?.trim() || msg.email, attachments: [{ filename: `Quote-${q.number}.pdf`, contentType: "application/pdf", data: pdf }] })) });
  }
  await db.quote.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), sentVia: [...new Set([...q.sentVia, ...channels])] } });
  return { number: q.number, total: q.total, sent };
}

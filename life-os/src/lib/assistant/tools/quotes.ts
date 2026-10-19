import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { quoteInputsSchema } from "@/lib/business/pricing";
import { listCustomers } from "@/lib/services/customers";
import * as quotes from "@/lib/services/quotes";
import { formatUsd } from "@/lib/utils";
import { defineTool } from "../registry";

const brief = (q: quotes.QuoteView) => ({ id: q.id, number: q.number, customer: q.name, total: q.total, status: q.status, validUntil: q.validUntil, canText: quotes.quoteReach(q).includes("SMS"), canEmail: quotes.quoteReach(q).includes("EMAIL"), lines: q.lines.map((l) => `${l.label}: ${l.qty} → ${formatUsd(l.amount, { cents: true })}`) });

export const quoteTools = [
  defineTool({
    name: "customer_search",
    description: "Find Rapid Window Cleaning customers (synced from Housecall Pro or added by hand) by name, street, city, email, or phone. Returns ids, contact info, lifetime value, last cleaned, money owed.",
    schema: z.object({ query: z.string().min(1) }),
    actionType: "customer.search",
    kind: "read",
    summarize: (i) => `Search customers for "${i.query}"`,
    run: async (i) => ({ result: (await listCustomers({ q: i.query, take: 10 })).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, city: c.city, lifetimeValue: c.lifetimeValue, lastCleaned: c.lastCompletedAt?.toISOString().slice(0, 10) ?? null, owed: c.balanceDue })) }),
  }),
  defineTool({
    name: "quote_create",
    description: "Draft a window-cleaning quote priced by Grayden's pricing rules. Counts: panes (outside), insidePanes, screens, tracks, hardWaterPanes, solarScreens; stories 1-3; optional discountPct. Pass customerId from customer_search when the customer exists. Creates a DRAFT only; nothing is sent.",
    schema: z.object({ customerId: z.string().optional(), name: z.string().min(1), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), notes: z.string().optional(), inputs: quoteInputsSchema }),
    actionType: "quote.create",
    kind: "write",
    summarize: (i) => `Draft a quote for ${i.name}`,
    run: async (i) => {
      let base: { phone?: string | null; email?: string | null; address?: string | null } = {};
      if (i.customerId) base = (await db.customer.findUnique({ where: { id: i.customerId } })) ?? {};
      const q = await quotes.createQuote({ ...i, phone: i.phone ?? base.phone, email: i.email ?? base.email, address: i.address ?? base.address });
      return { result: brief(q), summary: `Drafted quote #${q.number} for ${q.name}: ${formatUsd(q.total)}`, undo: { actionType: "quote.delete", payload: { id: q.id } } };
    },
  }),
  defineTool({
    name: "quote_send",
    description: "Send a drafted quote to the customer by text (summary + link to the branded PDF) and/or email (PDF attached). Always waits for Grayden's approval unless he turned on auto-approve for quotes.",
    schema: z.object({ quoteId: z.string(), via: z.array(z.enum(["SMS", "EMAIL"])).min(1) }),
    actionType: "quote.send",
    kind: "write",
    approval: () => ({ key: "quote.send" }),
    summarize: async (i) => {
      const q = await quotes.getQuote(i.quoteId);
      if (!q) throw new Error(`No quote with id ${i.quoteId}`);
      const to = i.via.map((v) => (v === "SMS" ? `text to ${q.phone ?? "(no phone)"}` : `email to ${q.email ?? "(no email)"}`)).join(" and ");
      return `Send quote #${q.number} (${formatUsd(q.total)}) to ${q.name} by ${to}`;
    },
    run: async (i) => {
      const r = await quotes.sendQuote(i.quoteId, i.via);
      return { result: r, summary: `Sent quote #${r.number} (${formatUsd(r.total)}) by ${r.sent.map((s) => `${s.channel === "SMS" ? "text" : "email"} to ${s.to}`).join(" and ")}` };
    },
  }),
];

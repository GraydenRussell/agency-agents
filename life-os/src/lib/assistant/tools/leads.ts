import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { waitingMinutes } from "@/lib/business/leads";
import * as leads from "@/lib/services/leads";
import { defineTool } from "../registry";

export const leadTools = [
  defineTool({
    name: "lead_list",
    description: "List leads in the Rapid Window Cleaning lead inbox (website forms, Meta lead ads, email, phone). Default: open leads, unanswered first. Includes score, reason, minutes waiting, and the drafted first reply.",
    schema: z.object({ status: z.enum(["OPEN", "NEW", "CONTACTED", "QUOTED", "WON", "LOST", "ALL"]).optional(), limit: z.number().int().min(1).max(50).optional() }),
    actionType: "lead.list",
    kind: "read",
    summarize: () => "List leads",
    run: async (i) => ({
      result: (await leads.listLeads(i.status ?? "OPEN", i.limit ?? 15)).map((l) => ({ id: l.id, name: l.name, source: leads.SOURCE_LABEL[l.source], status: l.status, score: l.score, reason: l.scoreReason, waitingMinutes: waitingMinutes(l), phone: l.phone, email: l.email, message: l.message?.slice(0, 500) ?? null, draftReply: l.draftReply })),
    }),
  }),
  defineTool({
    name: "lead_reply",
    description: "Send a first reply to a lead by text (SMS) or email. Use the lead's draftReply unless Grayden asked for changes. Always waits for Grayden's approval unless he turned on auto-approve for lead replies.",
    schema: z.object({ leadId: z.string(), via: z.enum(["SMS", "EMAIL"]), body: z.string().min(1).max(1500) }),
    actionType: "lead.reply",
    kind: "write",
    approval: () => ({ key: "lead.reply" }),
    summarize: async (i) => {
      const l = await db.lead.findUnique({ where: { id: i.leadId } });
      if (!l) throw new Error(`No lead with id ${i.leadId}`);
      return `${i.via === "SMS" ? `Text ${l.phone ?? "(no phone)"}` : `Email ${l.email ?? "(no email)"}`} (${l.name}): “${i.body.slice(0, 160)}${i.body.length > 160 ? "…" : ""}”`;
    },
    run: async (i) => {
      const r = await leads.replyToLead(i.leadId, i.via, i.body);
      return { result: r, summary: `Replied to ${r.name} by ${r.via === "SMS" ? "text" : "email"} (${r.to})` };
    },
  }),
];

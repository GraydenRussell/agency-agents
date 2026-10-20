import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { createReferral, listReferrals, matchReferrer } from "@/lib/services/referrals";
import { defineTool } from "../registry";

export const referralTools = [
  defineTool({
    name: "referral_list",
    description: "Referrals: who referred whom, status (pending / earned = reward owed / paid), reward amounts, and the top referrers.",
    schema: z.object({}),
    actionType: "referral.list",
    kind: "read",
    summarize: () => "List referrals",
    run: async () => {
      const { rows, stats } = await listReferrals();
      return { result: { ...stats, referrals: rows.slice(0, 30).map((r) => ({ id: r.id, referrer: r.referrer.name, referred: r.referredName, status: r.status, reward: r.reward, kind: r.rewardKind })) } };
    },
  }),
  defineTool({
    name: "referral_add",
    description: "Record that an existing customer referred someone. referrerName must match a customer (use customer_search if unsure). The reward is earned automatically once the referred person completes a job.",
    schema: z.object({ referrerName: z.string().min(1), referredName: z.string().min(1), notes: z.string().optional() }),
    actionType: "referral.add",
    kind: "write",
    summarize: (i) => `Record referral: ${i.referrerName} → ${i.referredName}`,
    run: async (i) => {
      const ref = matchReferrer(i.referrerName, await db.customer.findMany({ select: { id: true, name: true } }));
      if (!ref) throw new Error(`No single customer matches "${i.referrerName}". Search customers and use their exact name.`);
      const r = await createReferral({ referrerId: ref.id, referredName: i.referredName, notes: i.notes });
      return { result: { id: r.id, referrer: ref.name, referred: r.referredName, reward: r.reward }, summary: `Recorded referral: ${ref.name} → ${r.referredName} ($${r.reward} ${r.rewardKind} when they book)`, undo: { actionType: "referral.delete", payload: { id: r.id } } };
    },
  }),
];

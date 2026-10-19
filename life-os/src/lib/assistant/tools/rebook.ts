import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { rebookList, sendRebookText } from "@/lib/services/rebook";
import { defineTool } from "../registry";

export const rebookTools = [
  defineTool({
    name: "rebook_list",
    description: "Customers due (or nearly due) for their next window cleaning, based on their last completed job and their re-book interval. Includes a drafted re-book text.",
    schema: z.object({}),
    actionType: "rebook.list",
    kind: "read",
    summarize: () => "List customers due for re-booking",
    run: async () => ({ result: (await rebookList()).map((r) => ({ customerId: r.customerId, name: r.name, lastCleaned: r.lastCleaned, dueDate: r.dueDate, bucket: r.bucket, lastTotal: r.lastTotal, canText: r.canText, draft: r.draft })) }),
  }),
  defineTool({
    name: "rebook_text",
    description: "Text a customer to re-book their next cleaning (uses the drafted text unless a body is given). Always waits for Grayden's approval unless he turned on auto-approve for re-book texts.",
    schema: z.object({ customerId: z.string(), body: z.string().max(1200).optional() }),
    actionType: "rebook.text",
    kind: "write",
    approval: () => ({ key: "rebook.text" }),
    summarize: async (i) => {
      const c = await db.customer.findUnique({ where: { id: i.customerId } });
      if (!c) throw new Error(`No customer with id ${i.customerId}`);
      return `Text ${c.name} (${c.phone ?? "no phone"}) to re-book${i.body ? `: “${i.body.slice(0, 140)}”` : ""}`;
    },
    run: async (i) => {
      const r = await sendRebookText(i.customerId, i.body);
      return { result: r, summary: `Sent re-book text to ${r.name} (${r.to})` };
    },
  }),
];

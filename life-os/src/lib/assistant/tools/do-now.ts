import "server-only";
import { z } from "zod";
import { doNowCounts, doNowItems } from "@/lib/services/do-now";
import { defineTool } from "../registry";

export const doNowTools = [
  defineTool({
    name: "do_now_list",
    description: "Everything that currently needs Grayden across Life OS, ranked: right now / today / this week / setup. Covers waiting approvals, unanswered leads, overdue and Top 3 tasks, quotes to follow up, re-books, reviews to answer, review requests, referral rewards owed, weather risks on job days, bills due, money owed, people to check in with, important emails, and habits. Use it for 'what do I need to do', 'what's on my plate', or to plan the day.",
    schema: z.object({}),
    actionType: "donow.list",
    kind: "read",
    summarize: () => "List what needs doing",
    run: async () => {
      const items = await doNowItems();
      return { result: { counts: doNowCounts(items), items: items.slice(0, 40).map((i) => ({ urgency: i.urgency, area: i.area, title: i.title, detail: i.detail })) } };
    },
  }),
];

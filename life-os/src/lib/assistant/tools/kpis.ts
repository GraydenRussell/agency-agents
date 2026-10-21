import "server-only";
import { z } from "zod";
import { kpiBoard } from "@/lib/services/kpis";
import { defineTool } from "../registry";

export const kpiTools = [
  defineTool({
    name: "kpi_summary",
    description: "Rapid Window Cleaning KPIs for this week/month/year so far: revenue, jobs, average ticket, revenue per hour, jobs per week, leads, ad spend, cost per lead, quote close rate. Each with % change vs the previous period and vs the same period last year (same number of elapsed days), plus month-to-date vs the monthly revenue goal.",
    schema: z.object({ period: z.enum(["week", "month", "year"]).optional() }),
    actionType: "kpi.summary",
    kind: "read",
    summarize: (i) => `KPI summary (${i.period ?? "month"})`,
    run: async (i) => {
      const b = await kpiBoard(i.period ?? "month");
      return { result: { period: b.kind, from: b.range.start, to: b.range.end, current: b.current, previous: b.previous, lastYear: b.lastYear, changes: b.deltas, goal: b.goal } };
    },
  }),
];

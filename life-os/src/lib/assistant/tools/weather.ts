import "server-only";
import { z } from "zod";
import { weatherPlan } from "@/lib/services/weather-plan";
import { defineTool } from "../registry";

export const weatherTools = [
  defineTool({
    name: "weather_jobs",
    description: "Next 8 days of Chandler weather vs booked window-cleaning jobs: highs, rain/storm chance, gusts, NWS warnings (dust storms, severe storms, extreme heat), which job days are risky, and the suggested day to move them.",
    schema: z.object({}),
    actionType: "weather.jobs",
    kind: "read",
    summarize: () => "Check weather against booked jobs",
    run: async () => {
      const p = await weatherPlan();
      return { result: { error: p.error, alerts: p.alerts.map((a) => a.headline), days: p.days.map((d) => ({ date: d.date, highF: d.weather?.highF, rainPct: d.weather?.precipPct, gustMph: d.weather?.gustMph, risks: d.risks.map((r) => `${r.level}: ${r.text}`), jobs: d.jobs.map((j) => j.customer ?? j.title), moveTo: d.suggestion })) } };
    },
  }),
];

import "server-only";
import { z } from "zod";
import { routeDay } from "@/lib/services/routes";
import { defineTool } from "../registry";

export const routeTools = [
  defineTool({
    name: "route_day",
    description: "A day's job route: stops in booked order with drive minutes between them, total drive time/miles, the best possible visiting order, and inefficiency flags (backtracking, too much driving, long legs, idle gaps). Date YYYY-MM-DD, default today.",
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    actionType: "route.day",
    kind: "read",
    summarize: (i) => `Route for ${i.date ?? "today"}`,
    run: async (i) => {
      const r = await routeDay(i.date);
      return { result: { date: r.date, stops: r.stops.map((s) => ({ name: s.label, start: s.start?.toISOString() ?? null, driveInMinutes: s.driveIn })), unmapped: r.unmapped.map((u) => u.label), driveMinutes: r.driveMinutes, driveMiles: r.driveMiles, bestOrder: r.bestOrder, bestMinutes: r.bestMinutes, flags: r.flags.map((f) => f.text), driveTimes: r.source === "google" ? "Google traffic-aware" : "estimated from distance", directions: r.directionsUrl } };
    },
  }),
];

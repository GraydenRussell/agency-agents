import "server-only";
import { z } from "zod";
import { addDays, atLocalMinutes, today } from "@/lib/time";
import { isMock } from "./mode";

/** Contract for GET {ADMIN_DASH_URL}/api/life-os/summary (see PLAN.md §6 and docs/admin-dashboard-endpoint.md). */
export const businessSummarySchema = z.object({
  asOf: z.string(),
  revenue: z.object({ today: z.number(), wtd: z.number(), mtd: z.number(), lastMonth: z.number(), currency: z.string().default("USD") }),
  jobs: z.object({
    today: z.array(z.object({ id: z.string(), customer: z.string(), address: z.string().nullish(), start: z.string(), end: z.string().nullish(), total: z.number().nullish(), status: z.string().nullish() })),
    scheduledThisWeek: z.number(),
    completedThisWeek: z.number(),
  }),
  leads: z.object({ new24h: z.number(), open: z.number(), recent: z.array(z.object({ id: z.string(), name: z.string(), source: z.string().nullish(), createdAt: z.string(), status: z.string().nullish() })) }),
  dailyBrief: z.object({ markdown: z.string(), generatedAt: z.string() }).nullish(),
  links: z.object({ dashboard: z.string().nullish(), jobs: z.string().nullish(), leads: z.string().nullish() }).partial().nullish(),
});
export type BusinessSummary = z.infer<typeof businessSummarySchema>;

export class BusinessNotConfiguredError extends Error {
  constructor() {
    super("Admin dashboard isn't connected (set ADMIN_DASH_URL and LIFE_OS_API_TOKEN).");
    this.name = "BusinessNotConfiguredError";
  }
}

export function mockBusinessSummary(): BusinessSummary {
  const t = today();
  const at = (m: number) => atLocalMinutes(t, m).toISOString();
  return {
    asOf: new Date().toISOString(),
    revenue: { today: 1180, wtd: 6420, mtd: 18940, lastMonth: 31250, currency: "USD" },
    jobs: {
      today: [
        { id: "j1", customer: "Patel residence", address: "Ocotillo, Chandler", start: at(8 * 60), end: at(10 * 60), total: 385, status: "scheduled" },
        { id: "j2", customer: "Sun Lakes HOA clubhouse", address: "Sun Lakes", start: at(10 * 60 + 30), end: at(13 * 60), total: 520, status: "scheduled" },
        { id: "j3", customer: "Nguyen residence", address: "Gilbert", start: at(14 * 60), end: at(15 * 60 + 30), total: 275, status: "scheduled" },
      ],
      scheduledThisWeek: 21,
      completedThisWeek: 9,
    },
    leads: {
      new24h: 3,
      open: 11,
      recent: [
        { id: "l1", name: "Jennifer Alvarez", source: "Website", createdAt: addDays(t, 0), status: "new" },
        { id: "l2", name: "Tom Becker", source: "Google Business Profile", createdAt: addDays(t, 0), status: "new" },
        { id: "l3", name: "Mesa Verde HOA", source: "Referral", createdAt: addDays(t, -3), status: "quoted" },
      ],
    },
    dailyBrief: null,
    links: { dashboard: null, jobs: null, leads: null },
  };
}

export function businessConfigured(): boolean {
  return isMock() || Boolean(process.env.ADMIN_DASH_URL && process.env.LIFE_OS_API_TOKEN);
}

export async function getBusinessSummary(): Promise<BusinessSummary> {
  if (isMock()) return mockBusinessSummary();
  const base = process.env.ADMIN_DASH_URL;
  const token = process.env.LIFE_OS_API_TOKEN;
  if (!base || !token) throw new BusinessNotConfiguredError();
  const res = await fetch(`${base.replace(/\/$/, "")}/api/life-os/summary`, { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 300 }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Admin dashboard returned ${res.status}`);
  return businessSummarySchema.parse(await res.json());
}

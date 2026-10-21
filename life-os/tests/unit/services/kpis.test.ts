import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { change, computeKpis, monthPace, periodRange, previousPeriod, sameElapsed, samePeriodLastYear, toDate } from "@/lib/business/kpis";
import { addAdSpend, kpiBoard, syncAdSpend } from "@/lib/services/kpis";
import { setSetting } from "@/lib/services/settings";
import { atLocalMinutes } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);

const at = (date: string, h = 9) => atLocalMinutes(date, h * 60);
const job = (date: string, total: number, hours = 2) => ({ status: "COMPLETED", total, completedAt: at(date, 9 + hours), scheduledStart: at(date, 9), scheduledEnd: at(date, 9 + hours) });

describe("periods", () => {
  it("computes week / month / year ranges and their comparisons", () => {
    expect(periodRange("week", "2026-10-21")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Monday weeks
    expect(periodRange("month", "2026-10-21")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(periodRange("year", "2026-10-21")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(previousPeriod("month", periodRange("month", "2026-03-10"))).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousPeriod("week", periodRange("week", "2026-10-21"))).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(samePeriodLastYear("month", periodRange("month", "2026-10-21"))).toEqual({ start: "2025-10-01", end: "2025-10-31" });
    expect(samePeriodLastYear("week", periodRange("week", "2026-10-21"))).toEqual({ start: "2025-10-20", end: "2025-10-26" });
  });
  it("compares in-progress periods over the same elapsed days", () => {
    const cur = periodRange("month", "2026-10-21");
    expect(toDate(cur, "2026-10-21")).toEqual({ start: "2026-10-01", end: "2026-10-21" });
    expect(sameElapsed(previousPeriod("month", cur), cur, "2026-10-21")).toEqual({ start: "2026-09-01", end: "2026-09-21" });
    expect(sameElapsed({ start: "2026-02-01", end: "2026-02-28" }, { start: "2026-03-01", end: "2026-03-31" }, "2026-03-31")).toEqual({ start: "2026-02-01", end: "2026-02-28" }); // clamps
  });
});

describe("KPI math", () => {
  it("revenue, ticket, per-hour, jobs/week, cost per lead, close rate", () => {
    const k = computeKpis({
      jobs: [job("2026-10-02", 300, 2), job("2026-10-09", 500, 3), { ...job("2026-10-10", 999), status: "SCHEDULED" }, job("2026-09-30", 400)],
      leads: [{ receivedAt: at("2026-10-03") }, { receivedAt: at("2026-10-04") }, { receivedAt: at("2026-09-01") }],
      quotes: [{ status: "ACCEPTED", decidedAt: at("2026-10-05") }, { status: "DECLINED", decidedAt: at("2026-10-06") }, { status: "ACCEPTED", decidedAt: at("2026-10-07") }, { status: "SENT", decidedAt: null }],
      spend: [{ date: "2026-10-01", amount: 50 }, { date: "2026-10-15", amount: 30 }, { date: "2026-09-30", amount: 999 }],
    }, { start: "2026-10-01", end: "2026-10-14" });
    expect(k).toEqual({ revenue: 800, jobs: 2, avgTicket: 400, hours: 5, revenuePerHour: 160, jobsPerWeek: 1, leads: 2, spend: 50, costPerLead: 25, quotesWon: 2, quotesDecided: 3, closeRate: 2 / 3 });
    expect(computeKpis({ jobs: [], leads: [], quotes: [], spend: [] }, { start: "2026-10-01", end: "2026-10-07" })).toMatchObject({ revenue: 0, avgTicket: null, revenuePerHour: null, costPerLead: null, closeRate: null });
  });
  it("change and month pace", () => {
    expect(change(150, 100)).toBe(0.5);
    expect(change(50, 100)).toBe(-0.5);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
    expect(monthPace(10_000, "2026-10-10")).toEqual({ projected: 31_000, day: 10, days: 31 });
  });
});

describe("KPI board + ad spend", () => {
  it("builds the month board with deltas, trend, and goal pacing", async () => {
    const c = await db.customer.create({ data: { name: "A", tags: [] } });
    const mk = (d: string, total: number) => db.job.create({ data: { title: "x", customerId: c.id, status: "COMPLETED", total, completedAt: at(d, 11), scheduledStart: at(d, 9), scheduledEnd: at(d, 11) } });
    await mk("2026-10-05", 600);
    await mk("2026-10-12", 400);
    await mk("2026-09-08", 500);
    await mk("2025-10-07", 250);
    await db.lead.create({ data: { source: "META", name: "L", receivedAt: at("2026-10-06") } });
    await addAdSpend({ date: "2026-10-06", source: "GOOGLE_ADS", amount: 40 });
    await addAdSpend({ date: "2026-10-06", source: "GOOGLE_ADS", amount: 20 }); // adds up
    await setSetting("business.monthlyRevenueGoal", 31_000);

    const b = await kpiBoard("month", "2026-10-15");
    expect(b.current).toMatchObject({ revenue: 1000, jobs: 2, avgTicket: 500, revenuePerHour: 250, leads: 1, spend: 60, costPerLead: 60 });
    expect(b.previous.revenue).toBe(500); // Sep 1–15
    expect(b.lastYear.revenue).toBe(250); // Oct 1–15, 2025
    expect(b.deltas.revenue).toEqual({ vsPrevious: 1, vsLastYear: 3 });
    expect(b.trend).toHaveLength(12);
    expect(b.trend.at(-1)).toEqual({ label: "Oct", revenue: 1000, jobs: 2 });
    expect(b.goal).toMatchObject({ monthly: 31_000, monthToDate: 1000, projected: 2066.67, day: 15, days: 31 });
  });

  it("syncs Meta spend idempotently (mock)", async () => {
    expect(await syncAdSpend(3, "2026-10-15")).toBe("4 days of Meta spend");
    await syncAdSpend(3, "2026-10-15");
    expect(await db.adSpend.count({ where: { source: "META" } })).toBe(4);
    await expect(addAdSpend({ date: "bad", source: "OTHER", amount: 1 })).rejects.toThrow(/Pick a date/);
  });
});

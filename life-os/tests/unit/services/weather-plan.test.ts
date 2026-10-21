import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { dayRisks, isBadDay, suggestDay } from "@/lib/business/weather-risk";
import { getNwsAlerts, getOutlook } from "@/lib/integrations/outlook";
import { mockOutbox } from "@/lib/notify";
import { setSetting } from "@/lib/services/settings";
import { rescheduleTask, weatherPlan, weatherWatch } from "@/lib/services/weather-plan";
import { addDays, atLocalMinutes, isoWeekday, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  mockOutbox().length = 0;
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" });
});
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
});

const day = (o: Partial<{ highF: number; precipPct: number; gustMph: number; code: number }>) => ({ date: "2026-07-15", highF: 95, precipPct: 0, gustMph: 10, code: 0, ...o });

describe("risk rules", () => {
  it("flags heat, storms, dust, and wind by thresholds", () => {
    expect(dayRisks(day({}), [], "2026-07-15")).toEqual([]);
    expect(dayRisks(day({ highF: 112 }), [], "2026-07-15")).toEqual([{ kind: "heat", level: "danger", text: "112°F: finish exterior work by ~11 AM or move it" }]);
    expect(dayRisks(day({ highF: 106 }), [], "2026-07-15")[0]?.level).toBe("caution");
    expect(dayRisks(day({ code: 95, precipPct: 70 }), [], "2026-07-15")[0]).toMatchObject({ kind: "storm", level: "danger" });
    expect(dayRisks(day({ precipPct: 65 }), [], "2026-07-15")[0]).toMatchObject({ kind: "storm", level: "caution" });
    expect(dayRisks(day({ gustMph: 45 }), [], "2026-07-15")[0]).toMatchObject({ kind: "dust", level: "danger" });
    expect(dayRisks(day({ gustMph: 32 }), [], "2026-07-15")[0]).toMatchObject({ kind: "wind", level: "caution" });
  });
  it("maps NWS alerts onto the days they cover and keeps the worse level", () => {
    const dust = { id: "a", event: "Dust Storm Warning", headline: "x", onset: new Date("2026-07-15T15:00:00-07:00"), ends: new Date("2026-07-15T20:00:00-07:00") };
    const watch = { id: "b", event: "Extreme Heat Watch", headline: "x", onset: new Date("2026-07-14T10:00:00-07:00"), ends: new Date("2026-07-16T20:00:00-07:00") };
    expect(dayRisks(undefined, [dust], "2026-07-15")).toEqual([{ kind: "dust", level: "danger", text: "NWS Dust Storm Warning" }]);
    expect(dayRisks(undefined, [dust], "2026-07-16")).toEqual([]);
    expect(dayRisks(day({ highF: 113 }), [watch], "2026-07-15")).toEqual([{ kind: "heat", level: "danger", text: "113°F: finish exterior work by ~11 AM or move it" }]);
    expect(dayRisks(undefined, [{ ...watch, event: "Special Weather Statement" }], "2026-07-15")).toEqual([]);
  });
  it("suggests the soonest clear, light day (no Sundays)", () => {
    const caution = [{ kind: "heat" as const, level: "caution" as const, text: "" }];
    const danger = [{ kind: "storm" as const, level: "danger" as const, text: "" }];
    const days = [
      { date: "2026-07-14", risks: danger, jobCount: 3 }, // Tue (from)
      { date: "2026-07-15", risks: danger, jobCount: 0 },
      { date: "2026-07-16", risks: caution, jobCount: 0 },
      { date: "2026-07-17", risks: [], jobCount: 4 },
      { date: "2026-07-18", risks: [], jobCount: 1 },
      { date: "2026-07-19", risks: [], jobCount: 0 }, // Sunday
    ];
    expect(suggestDay("2026-07-14", days, isoWeekday)).toBe("2026-07-18");
    expect(suggestDay("2026-07-14", days.slice(0, 2), isoWeekday)).toBeNull();
    expect(isBadDay(danger)).toBe(true);
  });
});

describe("live adapters (stubbed network)", () => {
  it("parses Open-Meteo daily and NWS alerts", async () => {
    process.env.INTEGRATION_MODE = "live";
    const f = vi.fn(async (url: URL | string) => {
      const u = String(url);
      if (u.includes("open-meteo")) return Response.json({ daily: { time: ["2026-07-15"], temperature_2m_max: [111.2], precipitation_probability_max: [null], wind_gusts_10m_max: [22], weather_code: [1] } });
      return Response.json({ features: [{ properties: { id: "urn:1", event: "Dust Storm Warning", severity: "Severe", headline: "Dust Storm Warning until 6 PM", onset: "2026-07-15T15:00:00-07:00", ends: "2026-07-15T18:00:00-07:00" } }] });
    });
    expect(await getOutlook(1, f as unknown as typeof fetch)).toEqual([{ date: "2026-07-15", highF: 111.2, precipPct: 0, gustMph: 22, code: 1 }]);
    const alerts = await getNwsAlerts(f as unknown as typeof fetch);
    expect(alerts[0]).toMatchObject({ id: "urn:1", event: "Dust Storm Warning", headline: "Dust Storm Warning until 6 PM" });
    expect(new Headers((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get("user-agent")).toMatch(/^LifeOS/);
  });
});

describe("weather plan", () => {
  async function bookedJob(dayOffset: number, name: string) {
    const c = await db.customer.create({ data: { name, phone: "480-555-0100", tags: [] } });
    return db.job.create({ data: { title: "Windows", customerId: c.id, status: "SCHEDULED", total: 300, scheduledStart: atLocalMinutes(addDays(today(), dayOffset), 9 * 60), scheduledEnd: atLocalMinutes(addDays(today(), dayOffset), 11 * 60) } });
  }

  it("lays out 8 days, flags the mock heat + storm days, and suggests where to move jobs", async () => {
    await bookedJob(2, "Hot Day Hank");
    await bookedJob(1, "Fine Day Fran");
    const { days, error } = await weatherPlan();
    expect(error).toBeNull();
    expect(days).toHaveLength(8);
    const hot = days[2]!;
    expect(hot.jobs.map((j) => j.customer)).toEqual(["Hot Day Hank"]);
    expect(hot.risks.map((r) => [r.kind, r.level])).toEqual([["heat", "danger"]]); // NWS warning + 112°F collapse to one
    expect(hot.suggestion).not.toBeNull();
    expect([2, 3]).not.toContain(days.findIndex((d) => d.date === hot.suggestion)); // not the heat or storm day
    expect(days[3]!.risks.map((r) => r.kind).sort()).toEqual(["dust", "storm"]);
    expect(days[1]!.suggestion).toBeNull();
  });

  it("alerts once per NWS warning on a job day, and the 4 PM digest lists risky days", async () => {
    await bookedJob(2, "Hot Day Hank");
    expect(await weatherWatch()).toBe("1 new warnings");
    expect(await weatherWatch()).toBe("0 new warnings");
    expect(mockOutbox().filter((m) => m.title.startsWith("⚠️ Extreme Heat Warning")).length).toBe(1);
    expect(await weatherWatch(new Date(), { digest: true })).toBe("0 new warnings; digest for 1 days");
    expect(mockOutbox().some((m) => m.title === "Weather heads-up: 1 job day")).toBe(true);
  });

  it("creates a call task instead of editing Housecall Pro", async () => {
    const j = await bookedJob(2, "Hot Day Hank");
    const t = await rescheduleTask(j.id, addDays(today(), 4));
    expect(t.title).toMatch(/^Call Hot Day Hank about moving their .+ cleaning to .+ \(weather\)$/);
    expect(t).toMatchObject({ priority: 1, area: "BUSINESS" });
    expect(t.notes).toContain("480-555-0100");
  });
});

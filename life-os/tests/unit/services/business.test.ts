import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businessSummarySchema, getBusinessSummary, mockBusinessSummary } from "@/lib/integrations/business";
import { businessView, monthPace, quickLinks } from "@/lib/services/business";
import { setSetting } from "@/lib/services/settings";
import { getToday } from "@/lib/services/today";
import { resetMockCalendar } from "@/lib/integrations/google/calendar";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  resetMockCalendar();
});
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
  delete process.env.ADMIN_DASH_URL;
  delete process.env.LIFE_OS_API_TOKEN;
  vi.unstubAllGlobals();
});

describe("business", () => {
  it("mock data satisfies the admin-dashboard contract", () => {
    expect(businessSummarySchema.safeParse(mockBusinessSummary()).success).toBe(true);
  });

  it("computes month pacing", () => {
    expect(monthPace(15_000, 30_000, "2026-10-15")).toMatchObject({ dayOfMonth: 15, daysInMonth: 31 });
    expect(Math.round(monthPace(15_000, 30_000, "2026-10-15").projected)).toBe(31_000);
    expect(monthPace(1000, 0, "2026-02-14").pctOfLast).toBeNull();
  });

  it("calls the admin dashboard with the bearer token and validates the response", async () => {
    process.env.INTEGRATION_MODE = "live";
    process.env.ADMIN_DASH_URL = "https://dash.example.com/";
    process.env.LIFE_OS_API_TOKEN = "tok";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
      return Response.json(mockBusinessSummary());
    });
    vi.stubGlobal("fetch", fetchMock);
    const s = await getBusinessSummary();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://dash.example.com/api/life-os/summary");
    expect(s.revenue.mtd).toBeGreaterThan(0);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ nope: true })));
    expect((await businessView()).state).toBe("error");
  });

  it("reports not configured in live mode without env", async () => {
    process.env.INTEGRATION_MODE = "live";
    expect((await businessView()).state).toBe("not_configured");
  });

  it("quick links default, can be customized, and include the dashboard", async () => {
    expect((await quickLinks()).map((l) => l.label)).toContain("Housecall Pro");
    await setSetting("business.quickLinks", [{ label: "GBP", url: "https://business.google.com/u/0/dashboard/l/123" }]);
    process.env.ADMIN_DASH_URL = "https://dash.example.com";
    expect((await quickLinks()).map((l) => l.label)).toEqual(["Rapid Window dashboard", "GBP"]);
    delete process.env.ADMIN_DASH_URL;
    expect((await quickLinks())[0]).toEqual({ label: "Rapid Window dashboard", url: "https://rapid-window-dashboard.vercel.app" });
  });

  it("today's timeline includes jobs from the dashboard", async () => {
    const d = await getToday();
    expect(d.timeline.filter((i) => i.kind === "job").map((i) => i.title)).toContain("Job: Patel residence");
    expect(d.business?.jobs.today.length).toBe(3);
  });
});

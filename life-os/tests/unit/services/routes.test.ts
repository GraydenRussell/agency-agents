import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { bestOrder, directionsUrl, estimateLeg, haversineMiles, routeFlags, routeMinutes, type Stop } from "@/lib/business/route";
import { driveMatrix } from "@/lib/integrations/maps";
import { syncHousecallPro } from "@/lib/services/customers";
import { routeDay, weekRoutes } from "@/lib/services/routes";
import { addDays, atLocalMinutes, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
  delete process.env.GOOGLE_MAPS_API_KEY;
});

const CHANDLER = { lat: 33.3062, lng: -111.8413 };
const GILBERT = { lat: 33.3528, lng: -111.789 };

describe("route math", () => {
  it("distances and drive estimates", () => {
    expect(haversineMiles(CHANDLER, GILBERT)).toBeCloseTo(4.4, 1);
    expect(estimateLeg(CHANDLER, GILBERT)).toEqual({ miles: 5.7, minutes: 15 });
    expect(estimateLeg(CHANDLER, CHANDLER)).toEqual({ miles: 0, minutes: 0 });
  });
  it("finds the best order (exact for small days) and totals round trips", () => {
    // 0 = base; 1 far east, 2 near, 3 farther east: best is 2 → 1 → 3 or its reverse
    const m = [
      [0, 20, 5, 30],
      [20, 0, 15, 10],
      [5, 15, 0, 25],
      [30, 10, 25, 0],
    ];
    expect(routeMinutes([1, 2, 3], m)).toBe(20 + 15 + 25 + 30);
    const best = bestOrder(3, m);
    expect(routeMinutes(best, m)).toBe(5 + 15 + 10 + 30);
    expect(bestOrder(0, m)).toEqual([]);
    // 10 stops on a line: heuristic path should visit them in sequence
    const pts = Array.from({ length: 11 }, (_, i) => i);
    const line = pts.map((a) => pts.map((b) => Math.abs(a - b) * 5));
    expect(routeMinutes(bestOrder(10, line), line)).toBe(100);
  });
  it("flags reorder savings, heavy driving, long legs, and idle gaps", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 21, 15) + h * 3_600_000);
    const stops: Stop[] = [
      { id: "a", label: "A", lat: 0, lng: 0, start: at(0), end: at(1) },
      { id: "b", label: "B", lat: 0, lng: 0, start: at(1.5), end: at(2.5) },
      { id: "c", label: "C", lat: 0, lng: 0, start: at(5), end: at(6) },
    ];
    const flags = routeFlags({ stops, legs: [10, 35, 20, 10], scheduledMinutes: 75, bestMinutes: 50, bestLabels: ["B", "A", "C"] });
    expect(flags.map((f) => f.kind)).toEqual(["reorder", "long_leg", "gap"]);
    expect(flags[0]?.text).toBe("Visiting in this order saves ~25 min: B → A → C");
    expect(flags[2]?.text).toBe("130 min idle between B and C");
    const heavy = routeFlags({ stops: stops.slice(0, 2), legs: [60, 60, 60], scheduledMinutes: 180, bestMinutes: 180, bestLabels: [] });
    expect(heavy.map((f) => f.kind)).toContain("drive_share");
  });
  it("builds a Google Maps multi-stop link", () => {
    const u = new URL(directionsUrl(CHANDLER, [GILBERT, CHANDLER]));
    expect(u.searchParams.get("origin")).toBe("33.3062,-111.8413");
    expect(u.searchParams.get("waypoints")).toBe("33.3528,-111.789|33.3062,-111.8413");
  });
});

describe("drive matrix", () => {
  it("uses Google's matrix when a key is set, else the estimate", async () => {
    expect((await driveMatrix([CHANDLER, GILBERT])).source).toBe("estimate");
    process.env.INTEGRATION_MODE = "live";
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const f = vi.fn(async () => Response.json([{ originIndex: 0, destinationIndex: 1, duration: "720s", distanceMeters: 8047, condition: "ROUTE_EXISTS" }, { originIndex: 1, destinationIndex: 0, duration: "780s", distanceMeters: 8100, condition: "ROUTE_EXISTS" }]));
    const m = await driveMatrix([CHANDLER, GILBERT], undefined, f as unknown as typeof fetch);
    expect(m.source).toBe("google");
    expect(m.minutes[0]![1]).toBe(15); // 12 min + 3 to park
    expect(m.miles[0]![1]).toBe(5);
    const bad = vi.fn(async () => new Response("no", { status: 403 }));
    expect((await driveMatrix([CHANDLER, GILBERT], undefined, bad as unknown as typeof fetch)).source).toBe("estimate");
  });
});

describe("route day", () => {
  it("routes today's Housecall Pro jobs in booked order with legs, best order, and a directions link", async () => {
    await syncHousecallPro();
    const r = await routeDay();
    expect(r.stops.map((s) => s.label)).toEqual(["Priya Patel", "Sun Lakes HOA", "Minh Nguyen"]);
    expect(r.stops.every((s) => s.driveIn > 0)).toBe(true);
    expect(r.driveMinutes).toBe(r.stops.reduce((t, s) => t + s.driveIn, 0) + r.backHome.minutes);
    expect(r.bestMinutes).toBeLessThanOrEqual(r.driveMinutes);
    expect(r.directionsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(r.source).toBe("estimate");
  });

  it("lists jobs without coordinates separately and summarizes the week", async () => {
    const c = await db.customer.create({ data: { name: "No Pin Pete", tags: [] } });
    await db.job.create({ data: { title: "x", customerId: c.id, status: "SCHEDULED", total: 200, address: "Somewhere, Mesa", scheduledStart: atLocalMinutes(addDays(today(), 1), 9 * 60) } });
    const r = await routeDay(addDays(today(), 1));
    expect(r.unmapped).toEqual([{ id: expect.any(String), label: "No Pin Pete", address: "Somewhere, Mesa" }]);
    expect(r.stops).toEqual([]);
    expect(r.directionsUrl).toBeNull();
    const w = await weekRoutes();
    expect(w).toHaveLength(7);
    expect(w[1]).toMatchObject({ jobs: 1, driveMinutes: 0 });
  });
});

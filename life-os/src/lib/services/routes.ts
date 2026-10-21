import "server-only";
import { db } from "@/lib/db";
import { bestOrder, directionsUrl, routeFlags, routeMinutes, type RouteFlag, type Stop } from "@/lib/business/route";
import { driveMatrix } from "@/lib/integrations/maps";
import { getSetting } from "@/lib/services/settings";
import { addDays, endOfLocalDay, startOfLocalDay, today as todayLocal } from "@/lib/time";

export type RouteStop = Stop & { address: string | null; total: number; driveIn: number; milesIn: number };
export type RouteDay = {
  date: string;
  base: { label: string; lat: number; lng: number };
  stops: RouteStop[];
  unmapped: Array<{ id: string; label: string; address: string | null }>;
  driveMinutes: number;
  driveMiles: number;
  backHome: { minutes: number; miles: number };
  bestMinutes: number;
  bestOrder: string[];
  flags: RouteFlag[];
  source: "google" | "estimate";
  directionsUrl: string | null;
};

async function jobsOn(date: string) {
  return db.job.findMany({
    where: { status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] }, scheduledStart: { gte: startOfLocalDay(date), lt: endOfLocalDay(date) } },
    include: { customer: { select: { name: true, lat: true, lng: true, address: true } } },
    orderBy: { scheduledStart: "asc" },
  });
}

/** The day's route in booked order, with drive legs, the best possible order, and what's inefficient. */
export async function routeDay(date: string = todayLocal()): Promise<RouteDay> {
  const base = await getSetting("business.homeBase");
  const jobs = await jobsOn(date);
  const mapped: Array<Stop & { address: string | null; total: number }> = [];
  const unmapped: RouteDay["unmapped"] = [];
  for (const j of jobs) {
    const lat = j.lat ?? j.customer?.lat ?? null, lng = j.lng ?? j.customer?.lng ?? null;
    const label = j.customer?.name ?? j.title;
    if (lat == null || lng == null) unmapped.push({ id: j.id, label, address: j.address ?? j.customer?.address ?? null });
    else mapped.push({ id: j.id, label, lat, lng, start: j.scheduledStart, end: j.scheduledEnd, address: j.address ?? j.customer?.address ?? null, total: j.total });
  }
  const points = [base, ...mapped];
  const m = await driveMatrix(points, mapped[0]?.start ?? undefined);
  const order = mapped.map((_, i) => i + 1);
  const legs = order.map((idx, k) => m.minutes[k === 0 ? 0 : order[k - 1]!]![idx]!);
  const backHome = mapped.length ? { minutes: m.minutes[mapped.length]![0]!, miles: m.miles[mapped.length]![0]! } : { minutes: 0, miles: 0 };
  const scheduled = routeMinutes(order, m.minutes);
  const best = bestOrder(mapped.length, m.minutes);
  const bestMinutes = routeMinutes(best, m.minutes);
  const stops: RouteStop[] = mapped.map((s, k) => ({ ...s, driveIn: legs[k]!, milesIn: m.miles[k === 0 ? 0 : k]![k + 1]! }));
  const driveMiles = Math.round((stops.reduce((t, s) => t + s.milesIn, 0) + backHome.miles) * 10) / 10;
  return {
    date,
    base,
    stops,
    unmapped,
    driveMinutes: scheduled,
    driveMiles,
    backHome,
    bestMinutes,
    bestOrder: best.map((i) => mapped[i - 1]!.label),
    flags: routeFlags({ stops: mapped, legs: [...legs, backHome.minutes], scheduledMinutes: scheduled, bestMinutes, bestLabels: best.map((i) => mapped[i - 1]!.label) }),
    source: m.source,
    directionsUrl: mapped.length ? directionsUrl(base, mapped) : null,
  };
}

/** Drive summary for the next 7 days (estimates only, so this stays cheap). */
export async function weekRoutes(today: string = todayLocal()) {
  const out: Array<{ date: string; jobs: number; driveMinutes: number; flags: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = await routeDay(addDays(today, i));
    out.push({ date: d.date, jobs: d.stops.length + d.unmapped.length, driveMinutes: d.driveMinutes, flags: d.flags.length });
  }
  return out;
}

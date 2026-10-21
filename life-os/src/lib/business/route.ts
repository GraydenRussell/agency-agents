/**
 * Pure route math for a day of jobs. Drive times come from Google (when configured) or from this
 * estimate: straight-line miles × 1.3 road factor at ~28 mph average East Valley surface-street speed,
 * plus 3 minutes to park and unload.
 */
export type Point = { lat: number; lng: number };
export type Stop = Point & { id: string; label: string; start: Date | null; end: Date | null };

const R_MILES = 3958.8;
export function haversineMiles(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const ROAD_FACTOR = 1.3;
export const AVG_MPH = 28;
export function estimateLeg(a: Point, b: Point): { miles: number; minutes: number } {
  const miles = haversineMiles(a, b) * ROAD_FACTOR;
  return { miles: Math.round(miles * 10) / 10, minutes: miles < 0.05 ? 0 : Math.round((miles / AVG_MPH) * 60 + 3) };
}

export type Matrix = number[][]; // minutes, [from][to]; index 0 = home base

/** Total minutes for base → order… → base. */
export function routeMinutes(order: number[], m: Matrix): number {
  let t = 0, prev = 0;
  for (const i of order) {
    t += m[prev]![i]!;
    prev = i;
  }
  return t + (order.length ? m[prev]![0]! : 0);
}

/** Best visiting order (stops 1..n). Exact for ≤8 stops, nearest-neighbour + 2-opt beyond. */
export function bestOrder(n: number, m: Matrix): number[] {
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  if (n <= 1) return ids;
  if (n <= 8) {
    let best = ids, bestT = routeMinutes(ids, m);
    const permute = (arr: number[], k: number) => {
      if (k === arr.length) {
        const t = routeMinutes(arr, m);
        if (t < bestT) { bestT = t; best = [...arr]; }
        return;
      }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i]!, arr[k]!];
        permute(arr, k + 1);
        [arr[k], arr[i]] = [arr[i]!, arr[k]!];
      }
    };
    permute([...ids], 0);
    return best;
  }
  const left = new Set(ids), order: number[] = [];
  let cur = 0;
  while (left.size) {
    const next = [...left].sort((a, b) => m[cur]![a]! - m[cur]![b]!)[0]!;
    order.push(next);
    left.delete(next);
    cur = next;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++)
      for (let j = i + 1; j < order.length; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (routeMinutes(cand, m) < routeMinutes(order, m)) { order.splice(0, order.length, ...cand); improved = true; }
      }
  }
  return order;
}

export type RouteFlag = { kind: "reorder" | "drive_share" | "long_leg" | "gap"; text: string };

/**
 * Why a day is inefficient: a better order saves 15+ min, driving is over 30% of the working day,
 * a single leg over 30 min, or 90+ idle minutes between jobs (after driving).
 */
export function routeFlags(o: { stops: Stop[]; legs: number[]; scheduledMinutes: number; bestMinutes: number; bestLabels: string[] }): RouteFlag[] {
  const out: RouteFlag[] = [];
  const saved = o.scheduledMinutes - o.bestMinutes;
  if (o.stops.length >= 3 && saved >= 15) out.push({ kind: "reorder", text: `Visiting in this order saves ~${saved} min: ${o.bestLabels.join(" → ")}` });
  const onSite = o.stops.reduce((s, x) => s + (x.start && x.end && x.end > x.start ? (x.end.getTime() - x.start.getTime()) / 60_000 : 90), 0);
  const share = o.scheduledMinutes / Math.max(1, o.scheduledMinutes + onSite);
  if (o.stops.length >= 2 && share > 0.3) out.push({ kind: "drive_share", text: `${Math.round(share * 100)}% of the day is driving (${o.scheduledMinutes} min)` });
  o.legs.forEach((min, i) => {
    if (min > 30 && i > 0 && i < o.legs.length - 1) out.push({ kind: "long_leg", text: `${min} min drive from ${o.stops[i - 1]!.label} to ${o.stops[i]!.label}` });
  });
  for (let i = 1; i < o.stops.length; i++) {
    const a = o.stops[i - 1]!, b = o.stops[i]!;
    if (!a.end || !b.start) continue;
    const idle = (b.start.getTime() - a.end.getTime()) / 60_000 - (o.legs[i] ?? 0);
    if (idle >= 90) out.push({ kind: "gap", text: `${Math.round(idle)} min idle between ${a.label} and ${b.label}` });
  }
  return out;
}

/** Google Maps multi-stop directions link (opens the app on a phone). */
export function directionsUrl(base: Point, stops: Point[]): string {
  const p = (x: Point) => `${x.lat},${x.lng}`;
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", p(base));
  u.searchParams.set("destination", p(base));
  if (stops.length) u.searchParams.set("waypoints", stops.map(p).join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

import "server-only";
import { z } from "zod";
import { estimateLeg, type Point } from "@/lib/business/route";
import { isMock } from "./mode";

/**
 * Drive-time matrix. Google Routes API computeRouteMatrix (traffic-aware) when GOOGLE_MAPS_API_KEY is
 * set; otherwise the distance estimate. Docs: developers.google.com/maps/documentation/routes/compute_route_matrix
 */
export const mapsConfigured = () => !isMock() && Boolean(process.env.GOOGLE_MAPS_API_KEY);

export type MatrixResult = { minutes: number[][]; miles: number[][]; source: "google" | "estimate" };

export function estimateMatrix(points: Point[]): MatrixResult {
  const legs = points.map((a) => points.map((b) => estimateLeg(a, b)));
  return { minutes: legs.map((r) => r.map((l) => l.minutes)), miles: legs.map((r) => r.map((l) => l.miles)), source: "estimate" };
}

const elementSchema = z.object({ originIndex: z.number().default(0), destinationIndex: z.number().default(0), duration: z.string().optional(), distanceMeters: z.number().optional(), condition: z.string().optional() });

export async function driveMatrix(points: Point[], departAt?: Date, f: typeof fetch = fetch): Promise<MatrixResult> {
  if (!mapsConfigured() || points.length < 2 || points.length > 25) return estimateMatrix(points);
  try {
    const wp = (p: Point) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
    const res = await f("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GOOGLE_MAPS_API_KEY!, "x-goog-fieldmask": "originIndex,destinationIndex,duration,distanceMeters,condition" },
      body: JSON.stringify({ origins: points.map(wp), destinations: points.map(wp), travelMode: "DRIVE", routingPreference: departAt && departAt > new Date() ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE", ...(departAt && departAt > new Date() ? { departureTime: departAt.toISOString() } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}`);
    const est = estimateMatrix(points);
    const rows = z.array(elementSchema).parse(await res.json());
    for (const e of rows) {
      if (e.condition && e.condition !== "ROUTE_EXISTS") continue;
      if (e.duration) est.minutes[e.originIndex]![e.destinationIndex]! = Math.round(Number(e.duration.replace("s", "")) / 60) + (e.originIndex === e.destinationIndex ? 0 : 3);
      if (e.distanceMeters != null) est.miles[e.originIndex]![e.destinationIndex]! = Math.round((e.distanceMeters / 1609.34) * 10) / 10;
    }
    return { ...est, source: "google" };
  } catch (e) {
    console.error("[maps.matrix]", e);
    return estimateMatrix(points);
  }
}

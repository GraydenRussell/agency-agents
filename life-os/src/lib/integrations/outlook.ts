import "server-only";
import { z } from "zod";
import { addDays, today } from "@/lib/time";
import { isMock } from "./mode";

/**
 * Multi-day field outlook: Open-Meteo daily forecast + National Weather Service active alerts
 * (Dust Storm, Severe Thunderstorm, Extreme Heat, Flash Flood…). Both free, no key; NWS asks for a
 * User-Agent with contact info.
 */
export type DayForecast = { date: string; highF: number; precipPct: number; gustMph: number; code: number };
export type NwsAlert = { id: string; event: string; severity: string; headline: string; onset: Date | null; ends: Date | null };

const LAT = () => Number(process.env.WEATHER_LAT ?? 33.3062);
const LON = () => Number(process.env.WEATHER_LON ?? -111.8413);

const dailySchema = z.object({ daily: z.object({ time: z.array(z.string()), temperature_2m_max: z.array(z.number()), precipitation_probability_max: z.array(z.number().nullable()), wind_gusts_10m_max: z.array(z.number().nullable()), weather_code: z.array(z.number()) }) });

export function mockOutlook(start = today()): DayForecast[] {
  return Array.from({ length: 8 }, (_, i) => {
    const date = addDays(start, i);
    if (i === 2) return { date, highF: 112, precipPct: 5, gustMph: 18, code: 0 };
    if (i === 3) return { date, highF: 101, precipPct: 70, gustMph: 45, code: 95 };
    return { date, highF: 96 - (i % 3), precipPct: 10, gustMph: 15, code: 1 };
  });
}

export async function getOutlook(days = 8, f: typeof fetch = fetch): Promise<DayForecast[]> {
  if (isMock()) return mockOutlook();
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(LAT()));
  url.searchParams.set("longitude", String(LON()));
  url.searchParams.set("daily", "temperature_2m_max,precipitation_probability_max,wind_gusts_10m_max,weather_code");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "America/Phoenix");
  url.searchParams.set("forecast_days", String(days));
  const res = await f(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const d = dailySchema.parse(await res.json()).daily;
  return d.time.map((date, i) => ({ date, highF: d.temperature_2m_max[i] ?? 0, precipPct: d.precipitation_probability_max[i] ?? 0, gustMph: d.wind_gusts_10m_max[i] ?? 0, code: d.weather_code[i] ?? 0 }));
}

const alertsSchema = z.object({ features: z.array(z.object({ id: z.string().optional(), properties: z.object({ id: z.string().optional(), event: z.string(), severity: z.string().optional(), headline: z.string().nullable().optional(), onset: z.string().nullable().optional(), effective: z.string().nullable().optional(), ends: z.string().nullable().optional(), expires: z.string().nullable().optional() }) })).default([]) });

export function mockAlerts(start = today()): NwsAlert[] {
  const onset = new Date(`${addDays(start, 2)}T10:00:00-07:00`);
  return [{ id: "mock-heat", event: "Extreme Heat Warning", severity: "Severe", headline: "Extreme Heat Warning in effect for the Phoenix metro", onset, ends: new Date(onset.getTime() + 10 * 3_600_000) }];
}

export async function getNwsAlerts(f: typeof fetch = fetch): Promise<NwsAlert[]> {
  if (isMock()) return mockAlerts();
  const res = await f(`https://api.weather.gov/alerts/active?point=${LAT().toFixed(4)},${LON().toFixed(4)}`, { headers: { "user-agent": `LifeOS (${process.env.ALLOWED_EMAIL ?? "owner"})`, accept: "application/geo+json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`weather.gov returned ${res.status}`);
  return alertsSchema.parse(await res.json()).features.map((ft) => {
    const p = ft.properties;
    const d = (s?: string | null) => (s ? new Date(s) : null);
    return { id: p.id ?? ft.id ?? `${p.event}-${p.onset}`, event: p.event, severity: p.severity ?? "Unknown", headline: p.headline ?? p.event, onset: d(p.onset ?? p.effective), ends: d(p.ends ?? p.expires) };
  });
}

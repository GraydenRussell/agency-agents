import "server-only";
import { z } from "zod";
import { isMock } from "./mode";

export type WeatherHour = { time: string; tempF: number; precipPct: number; windMph: number; code: number };
export type Weather = {
  current: { tempF: number; feelsF: number; windMph: number; code: number; label: string };
  today: { highF: number; lowF: number; precipPct: number; uv: number; windMaxMph: number; sunrise: string; sunset: string };
  hours: WeatherHour[];
  advice: string[];
  source: "open-meteo" | "mock";
  fetchedAt: string;
};

// WMO weather interpretation codes → short labels.
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorms";
  return "Mixed";
}

/**
 * Field-work advice for window cleaning in the Phoenix area. Pure, exported for tests.
 * Thresholds: water-fed poles get unwieldy in sustained wind; >105°F makes water flash-dry
 * (spotting) and is a crew heat-safety issue; rain/dust storms mean reschedule.
 */
export function fieldAdvice(w: Pick<Weather, "today" | "hours">): string[] {
  const out: string[] = [];
  const work = w.hours.filter((h) => {
    const hr = Number(h.time.slice(11, 13));
    return hr >= 6 && hr <= 17;
  });
  const hottest = Math.max(w.today.highF, ...work.map((h) => h.tempF));
  if (hottest >= 110) out.push(`Extreme heat (${Math.round(hottest)}°F): wrap outdoor jobs by 11 AM, water + shade breaks every 30 min.`);
  else if (hottest >= 100) out.push(`Hot (${Math.round(hottest)}°F): start exterior work early; water dries fast, so work in the shade side first.`);
  const windy = work.filter((h) => h.windMph >= 20);
  if (windy.length >= 2 || w.today.windMaxMph >= 25) out.push(`Gusty (up to ${Math.round(w.today.windMaxMph)} mph): avoid tall water-fed pole work and ladders above 2nd story.`);
  const wet = work.filter((h) => h.precipPct >= 40);
  if (wet.length > 0) {
    const first = wet[0]?.time.slice(11, 16) ?? "";
    out.push(`Rain likely from ~${first}: consider moving exterior jobs and notify customers.`);
  }
  if (w.today.uv >= 9) out.push(`UV ${Math.round(w.today.uv)}: sunscreen + hats for the crew.`);
  if (out.length === 0) out.push("Good conditions for exterior work.");
  return out;
}

const apiSchema = z.object({
  current: z.object({ temperature_2m: z.number(), apparent_temperature: z.number(), weather_code: z.number(), wind_speed_10m: z.number() }),
  hourly: z.object({ time: z.array(z.string()), temperature_2m: z.array(z.number()), precipitation_probability: z.array(z.number().nullable()), wind_speed_10m: z.array(z.number()), weather_code: z.array(z.number()) }),
  daily: z.object({
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
    uv_index_max: z.array(z.number().nullable()),
    wind_speed_10m_max: z.array(z.number()),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
  }),
});

export function mockWeather(): Weather {
  const hours: WeatherHour[] = Array.from({ length: 18 }, (_, i) => {
    const h = 6 + i;
    const temp = 78 + Math.round(18 * Math.sin(((h - 6) / 16) * Math.PI));
    return { time: `2026-10-16T${String(h).padStart(2, "0")}:00`, tempF: temp, precipPct: h >= 16 && h <= 18 ? 20 : 0, windMph: h >= 14 ? 14 : 6, code: h >= 15 ? 2 : 0 };
  });
  const base = { today: { highF: 96, lowF: 71, precipPct: 20, uv: 7, windMaxMph: 16, sunrise: "06:31", sunset: "17:52" }, hours };
  return { current: { tempF: 84, feelsF: 83, windMph: 7, code: 1, label: weatherLabel(1) }, ...base, advice: fieldAdvice(base), source: "mock", fetchedAt: new Date().toISOString() };
}

export async function getWeather(lat = Number(process.env.WEATHER_LAT ?? 33.3062), lon = Number(process.env.WEATHER_LON ?? -111.8413)): Promise<Weather> {
  if (isMock()) return mockWeather();
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "America/Phoenix",
    forecast_days: "1",
  }).toString();
  const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const data = apiSchema.parse(await res.json());
  const hours: WeatherHour[] = data.hourly.time.map((time, i) => ({
    time,
    tempF: data.hourly.temperature_2m[i] ?? 0,
    precipPct: data.hourly.precipitation_probability[i] ?? 0,
    windMph: data.hourly.wind_speed_10m[i] ?? 0,
    code: data.hourly.weather_code[i] ?? 0,
  }));
  const today = {
    highF: data.daily.temperature_2m_max[0] ?? 0,
    lowF: data.daily.temperature_2m_min[0] ?? 0,
    precipPct: data.daily.precipitation_probability_max[0] ?? 0,
    uv: data.daily.uv_index_max[0] ?? 0,
    windMaxMph: data.daily.wind_speed_10m_max[0] ?? 0,
    sunrise: (data.daily.sunrise[0] ?? "").slice(11, 16),
    sunset: (data.daily.sunset[0] ?? "").slice(11, 16),
  };
  return {
    current: { tempF: data.current.temperature_2m, feelsF: data.current.apparent_temperature, windMph: data.current.wind_speed_10m, code: data.current.weather_code, label: weatherLabel(data.current.weather_code) },
    today,
    hours: hours.filter((h) => Number(h.time.slice(11, 13)) >= 5),
    advice: fieldAdvice({ today, hours }),
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
  };
}

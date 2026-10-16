import { describe, expect, it } from "vitest";
import { fieldAdvice, mockWeather, weatherLabel } from "./weather";

const hour = (h: number, o: Partial<{ tempF: number; precipPct: number; windMph: number }> = {}) => ({
  time: `2026-07-10T${String(h).padStart(2, "0")}:00`,
  tempF: o.tempF ?? 90,
  precipPct: o.precipPct ?? 0,
  windMph: o.windMph ?? 5,
  code: 0,
});
const day = { highF: 95, lowF: 75, precipPct: 0, uv: 6, windMaxMph: 10, sunrise: "05:30", sunset: "19:40" };

describe("fieldAdvice", () => {
  it("says conditions are good when nothing is extreme", () => {
    expect(fieldAdvice({ today: day, hours: [hour(9), hour(12)] })).toEqual(["Good conditions for exterior work."]);
  });
  it("flags extreme heat, wind, rain, and UV", () => {
    const advice = fieldAdvice({
      today: { ...day, highF: 114, uv: 11, windMaxMph: 30 },
      hours: [hour(10, { windMph: 22 }), hour(14, { windMph: 25, precipPct: 60 })],
    });
    expect(advice.join(" ")).toMatch(/Extreme heat/);
    expect(advice.join(" ")).toMatch(/Gusty/);
    expect(advice.join(" ")).toMatch(/Rain likely from ~14:00/);
    expect(advice.join(" ")).toMatch(/UV 11/);
  });
  it("ignores night-time wind", () => {
    expect(fieldAdvice({ today: day, hours: [hour(22, { windMph: 30 }), hour(23, { windMph: 30 })] })).toEqual(["Good conditions for exterior work."]);
  });
});

describe("weather helpers", () => {
  it("labels WMO codes", () => {
    expect(weatherLabel(0)).toBe("Clear");
    expect(weatherLabel(63)).toBe("Rain");
    expect(weatherLabel(95)).toBe("Thunderstorms");
  });
  it("mock weather is self-consistent", () => {
    const w = mockWeather();
    expect(w.source).toBe("mock");
    expect(w.advice.length).toBeGreaterThan(0);
  });
});

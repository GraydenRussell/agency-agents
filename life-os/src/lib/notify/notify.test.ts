import { describe, expect, it } from "vitest";
import { inQuietHours, smsText } from "./index";

describe("notify helpers", () => {
  it("quiet hours handle windows that cross midnight", () => {
    const q = { start: "21:30", end: "06:00" };
    expect(inQuietHours(new Date("2026-10-16T05:00:00Z"), q)).toBe(true); // 10:00 PM Phoenix
    expect(inQuietHours(new Date("2026-10-16T12:30:00Z"), q)).toBe(true); // 5:30 AM
    expect(inQuietHours(new Date("2026-10-16T13:00:00Z"), q)).toBe(false); // 6:00 AM
    expect(inQuietHours(new Date("2026-10-16T19:00:00Z"), { start: "12:00", end: "13:00" })).toBe(true); // noon window
  });
  it("trims SMS and keeps the link", () => {
    process.env.APP_URL = "https://life.example.com";
    const s = smsText({ title: "Brief", body: "x".repeat(500), url: "/today" }, 160);
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith("https://life.example.com/today")).toBe(true);
  });
});

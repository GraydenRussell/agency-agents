import { describe, expect, it } from "vitest";
import {
  addDays,
  atLocalMinutes,
  daysBetween,
  endOfLocalDay,
  formatLocalDate,
  isoWeekday,
  localDateOf,
  localMinutes,
  minutesToLabel,
  monthRange,
  relativeDayLabel,
  startOfLocalDay,
  weekRange,
} from "./time";

describe("Phoenix time helpers", () => {
  it("maps UTC instants to Phoenix local dates (UTC-7, no DST)", () => {
    // 2026-10-16 05:30 UTC is 2026-10-15 22:30 in Phoenix.
    expect(localDateOf(new Date("2026-10-16T05:30:00Z"))).toBe("2026-10-15");
    expect(localDateOf(new Date("2026-10-16T07:00:00Z"))).toBe("2026-10-16");
    // July (DST elsewhere) still -7.
    expect(localDateOf(new Date("2026-07-01T06:59:00Z"))).toBe("2026-06-30");
  });

  it("computes local day boundaries", () => {
    expect(startOfLocalDay("2026-10-16").toISOString()).toBe("2026-10-16T07:00:00.000Z");
    expect(endOfLocalDay("2026-10-16").toISOString()).toBe("2026-10-17T07:00:00.000Z");
    expect(atLocalMinutes("2026-10-16", 6 * 60).toISOString()).toBe("2026-10-16T13:00:00.000Z");
    expect(localMinutes(new Date("2026-10-16T13:00:00Z"))).toBe(360);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-16", "2026-10-23")).toBe(7);
  });

  it("knows weekdays, weeks, and months", () => {
    expect(isoWeekday("2026-10-16")).toBe(5); // Friday
    expect(isoWeekday("2026-10-18")).toBe(7); // Sunday
    expect(weekRange("2026-10-16")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
    expect(monthRange("2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("formats labels", () => {
    expect(minutesToLabel(0)).toBe("12 AM");
    expect(minutesToLabel(6 * 60 + 30)).toBe("6:30 AM");
    expect(minutesToLabel(21 * 60)).toBe("9 PM");
    expect(formatLocalDate("2026-10-16", { weekday: true })).toBe("Fri, Oct 16");
    const now = new Date("2026-10-16T15:00:00Z");
    expect(relativeDayLabel("2026-10-16", now)).toBe("Today");
    expect(relativeDayLabel("2026-10-17", now)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-10-15", now)).toBe("Yesterday");
  });
});

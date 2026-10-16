import { describe, expect, it } from "vitest";
import { parseCapture } from "./parse";

// Friday 2026-10-16, 9:00 AM Phoenix (16:00 UTC)
const NOW = new Date("2026-10-16T16:00:00Z");
const iso = (d?: Date) => d?.toISOString();

describe("parseCapture", () => {
  it("defaults to a task with the raw title", () => {
    const p = parseCapture("Order new squeegee rubbers", NOW);
    expect(p).toMatchObject({ kind: "task", title: "Order new squeegee rubbers", tags: [] });
    expect(p.at).toBeUndefined();
  });

  it("extracts priority, area, date and time", () => {
    const p = parseCapture("call Linda tomorrow 3pm !1 #business", NOW);
    expect(p.kind).toBe("task");
    expect(p.title).toBe("call Linda");
    expect(p.priority).toBe(1);
    expect(p.area).toBe("BUSINESS");
    expect(iso(p.at)).toBe("2026-10-17T22:00:00.000Z"); // 3 PM Phoenix
  });

  it("uses bang shorthand for priority and keeps unknown tags", () => {
    const p = parseCapture("fix gutter !!! #house", NOW);
    expect(p.priority).toBe(1);
    expect(p.tags).toEqual(["house"]);
  });

  it("resolves weekdays to the next occurrence", () => {
    expect(iso(parseCapture("invoice follow ups monday", NOW).at)).toBe("2026-10-20T00:00:00.000Z"); // Mon 5 PM
    expect(iso(parseCapture("team huddle fri at 7am", NOW).at)).toBe("2026-10-23T14:00:00.000Z"); // next Fri
    expect(parseCapture("pay bill due friday", NOW).title).toBe("pay bill");
  });

  it("parses month-day and numeric dates, rolling into next year when past", () => {
    expect(iso(parseCapture("renew license nov 3", NOW).at)).toBe("2026-11-04T00:00:00.000Z");
    expect(iso(parseCapture("file taxes 4/15", NOW).at)).toBe("2027-04-16T00:00:00.000Z");
  });

  it("treats time ranges as events", () => {
    const p = parseCapture("lunch with Tyce fri 12-1pm", NOW);
    expect(p.kind).toBe("event");
    expect(p.title).toBe("lunch with Tyce");
    expect(iso(p.at)).toBe("2026-10-23T19:00:00.000Z");
    expect(iso(p.end)).toBe("2026-10-23T20:00:00.000Z");
  });

  it("handles reminders with relative times", () => {
    const p = parseCapture("remind me to move the truck in 2 hours", NOW);
    expect(p.kind).toBe("reminder");
    expect(p.title).toBe("move the truck");
    expect(iso(p.at)).toBe("2026-10-16T18:00:00.000Z");
  });

  it("rolls a bare past time to tomorrow", () => {
    expect(iso(parseCapture("stretch 6am", NOW).at)).toBe("2026-10-17T13:00:00.000Z");
  });

  it("supports explicit prefixes", () => {
    expect(parseCapture("note: Pricing idea\nBundle screens", NOW)).toMatchObject({ kind: "note", title: "Pricing idea", body: "Bundle screens" });
    expect(parseCapture("j: great day in the field", NOW)).toMatchObject({ kind: "journal", body: "great day in the field" });
    expect(parseCapture("event: Crew meeting tomorrow at 7", NOW).kind).toBe("event");
  });

  it("assumes PM for bare small hours and AM ranges crossing noon", () => {
    expect(iso(parseCapture("call supplier at 2", NOW).at)).toBe("2026-10-16T21:00:00.000Z");
    const p = parseCapture("training 11-1pm tomorrow", NOW);
    expect(iso(p.at)).toBe("2026-10-17T18:00:00.000Z");
    expect(iso(p.end)).toBe("2026-10-17T20:00:00.000Z");
  });
});

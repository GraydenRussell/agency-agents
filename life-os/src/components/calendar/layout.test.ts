import { describe, expect, it } from "vitest";
import { HOUR_PX, layoutDay, offsetToMinutes, snap } from "./layout";

describe("layoutDay", () => {
  it("puts non-overlapping events in one column", () => {
    const r = layoutDay([
      { item: "a", startMin: 60, endMin: 120 },
      { item: "b", startMin: 120, endMin: 180 },
    ]);
    expect(r.map((p) => [p.item, p.col, p.cols])).toEqual([["a", 0, 1], ["b", 0, 1]]);
  });
  it("packs overlaps into columns per cluster", () => {
    const r = layoutDay([
      { item: "a", startMin: 60, endMin: 180 },
      { item: "b", startMin: 90, endMin: 120 },
      { item: "c", startMin: 130, endMin: 150 },
      { item: "d", startMin: 300, endMin: 360 },
    ]);
    const by = Object.fromEntries(r.map((p) => [p.item, [p.col, p.cols]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2], d: [0, 1] });
  });
  it("gives zero-length events a minimum height", () => {
    expect(layoutDay([{ item: "x", startMin: 60, endMin: 60 }])[0]?.endMin).toBe(75);
  });
});

describe("snapping", () => {
  it("snaps to 15 minutes and clamps", () => {
    expect(snap(52)).toBe(45);
    expect(offsetToMinutes(HOUR_PX * 2.6)).toBe(150);
    expect(offsetToMinutes(-10)).toBe(0);
    expect(offsetToMinutes(HOUR_PX * 30)).toBe(24 * 60 - 15);
  });
});

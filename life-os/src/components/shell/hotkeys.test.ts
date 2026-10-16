import { describe, expect, it } from "vitest";
import { matchCombo } from "./hotkeys";

describe("matchCombo", () => {
  it("matches single keys only without a pending chord", () => {
    expect(matchCombo("c", "c", null)).toBe("match");
    expect(matchCombo("c", "c", "g")).toBeNull();
    expect(matchCombo("mod+k", "mod+k", null)).toBe("match");
  });
  it("handles two-step chords", () => {
    expect(matchCombo("g t", "g", null)).toBe("prefix");
    expect(matchCombo("g t", "t", "g")).toBe("match");
    expect(matchCombo("g t", "x", "g")).toBeNull();
  });
});

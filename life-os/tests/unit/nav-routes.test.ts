import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV } from "@/lib/nav";

// Guards against page folders silently missing from the repo (a repo-wide .gitignore once hid /notes).
describe("navigation", () => {
  it("every sidebar entry has a page in the app", () => {
    const missing = NAV.filter((n) => !existsSync(join(process.cwd(), "src/app/(app)", n.href, "page.tsx"))).map((n) => n.href);
    expect(missing).toEqual([]);
  });

  it("chord keys are unique", () => {
    const chords = NAV.map((n) => n.chord).filter(Boolean);
    expect(new Set(chords).size).toBe(chords.length);
  });
});

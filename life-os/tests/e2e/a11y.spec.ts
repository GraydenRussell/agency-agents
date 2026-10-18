import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

const PAGES = ["/today", "/tasks", "/calendar", "/inbox", "/assistant", "/goals", "/routines", "/notes", "/health", "/money", "/people", "/projects", "/business", "/business/customers", "/approvals", "/activity", "/settings", "/setup"];

test.describe("accessibility (axe, serious + critical)", () => {
  test.skip(({ isMobile }) => isMobile, "run once on desktop");
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await gotoReady(page, path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
});

test("PWA: manifest, icons, offline page, and service worker are served", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const manifest = (await m.json()) as { name: string; icons: Array<{ src: string }> };
  expect(manifest.name).toBe("Life OS");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/offline")).ok()).toBe(true);
  const res = await request.get("/today");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
});

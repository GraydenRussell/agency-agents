import { expect, test } from "@playwright/test";

const PAGES = ["/today", "/tasks", "/tasks?view=board", "/goals", "/routines", "/calendar", "/calendar?view=month", "/inbox", "/notes", "/settings"];

test.describe("no horizontal overflow on phones", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
      expect(sw, `page is ${sw - vw}px wider than the screen`).toBeLessThanOrEqual(vw);
    });
  }
});

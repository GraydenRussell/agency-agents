import { expect, test } from "@playwright/test";

// Pages must arrive fully rendered and visible in the first HTML response: no content parked in
// hidden streamed boundaries waiting for a reveal script (which slow or old browsers may not run in time).
const PAGES = ["/today", "/tasks", "/tasks?view=board", "/calendar", "/notes", "/people", "/projects", "/settings"];

test.describe("server-rendered without JavaScript", () => {
  test.skip(({ isMobile }) => isMobile, "run once on desktop");
  test.use({ javaScriptEnabled: false });
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(await page.locator("div[hidden][id^='S:']").count(), "content left in a hidden streamed boundary").toBe(0);
    });
  }
});

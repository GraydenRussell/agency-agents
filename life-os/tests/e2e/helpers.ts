import type { Page } from "@playwright/test";

/** Navigate and wait until React has hydrated (event handlers and hotkeys attached). */
export async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

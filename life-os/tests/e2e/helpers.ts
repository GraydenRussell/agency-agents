import type { Page } from "@playwright/test";

/** Navigate and wait until React has hydrated (event handlers and hotkeys attached). */
export async function gotoReady(page: Page, path: string) {
  const res = await page.goto(path);
  if (res && res.status() !== 200) throw new Error(`${path} returned ${res.status()}`);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

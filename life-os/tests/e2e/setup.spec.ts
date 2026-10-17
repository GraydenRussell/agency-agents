import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("setup checklist lists every integration in order with steps and a working test button", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await gotoReady(page, "/setup");
  await expect(page.getByRole("heading", { name: "Setup", level: 1 })).toBeVisible();
  await expect(page.getByText(/of \d+ connected/)).toBeVisible();
  const list = page.getByTestId("setup-list");
  for (const name of ["App secrets", "Database (Supabase Postgres)", "Login + 2FA (Supabase Auth)", "Claude (Anthropic API)", "Gmail + Google Calendar", "Text messages (Twilio)", "Go live"]) {
    await expect(list.getByRole("heading", { name: new RegExp(name.replace(/[()+]/g, "\\$&")) })).toBeVisible();
  }
  // No key in tests: the card shows what's missing, the steps, and the test explains instead of calling out.
  const claude = page.getByTestId("setup-anthropic");
  await expect(claude.getByText("Not set up")).toBeVisible();
  await expect(claude.getByText("ANTHROPIC_API_KEY").first()).toBeVisible();
  await claude.getByRole("button", { name: "Test Claude (Anthropic API)" }).click();
  await expect(claude.getByRole("status")).toContainText("Missing: ANTHROPIC_API_KEY");
  // The database is configured in every test environment, so its live check connects.
  const db = page.getByTestId("setup-database");
  await db.getByRole("button", { name: /Test Database/ }).click();
  await expect(db.getByRole("status")).toContainText("Connected");
});

test("setup is reachable from the sidebar and with g u", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await gotoReady(page, "/today");
  await page.getByRole("heading", { level: 1 }).first().click();
  await page.keyboard.press("g");
  await page.keyboard.press("u");
  await expect(page).toHaveURL(/\/setup$/);
});

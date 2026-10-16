import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "desktop flow");

test("generate the daily brief from Today", async ({ page }) => {
  await page.goto("/today");
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(page.getByText(/Daily brief .* saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("One suggestion", { exact: true }).first()).toBeVisible();
});

test("settings: send a test notification and run a job", async ({ page }) => {
  await page.goto("/settings");
  const notifications = page.locator("#notifications");
  await notifications.getByRole("button", { name: "Test" }).first().click();
  await expect(page.getByText(/Test sent via/)).toBeVisible();
  const automations = page.locator("#automations");
  await automations.locator("li").filter({ hasText: "Maintenance" }).getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText(/expired \d+ approvals/).first()).toBeVisible();
});

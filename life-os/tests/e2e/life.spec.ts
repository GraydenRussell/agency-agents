import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "desktop flows");

test("health: log water and a workout; charts render", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByRole("img", { name: /Hours of sleep per night/ })).toBeVisible();
  await page.getByRole("button", { name: "16 oz" }).click();
  await expect(page.getByText("16 oz", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Minutes", { exact: true }).fill("35");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("Workout logged")).toBeVisible();
  await expect(page.getByTestId("workout-list").getByText(/35 min/)).toBeVisible();
});

test("money: add an expense and mark a bill paid", async ({ page }) => {
  await page.goto("/money");
  await page.getByLabel("Merchant", { exact: true }).fill("Home Depot");
  await page.getByLabel("Amount", { exact: true }).fill("42.18");
  await page.getByLabel("Merchant", { exact: true }).locator("xpath=ancestor::form").getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Expense added")).toBeVisible();
  await expect(page.getByTestId("tx-list").getByText("Home Depot")).toBeVisible();
  const unpaid = page.getByTestId("bill-list").locator("li").filter({ has: page.getByRole("button", { name: "Paid" }) }).first();
  await unpaid.getByRole("button", { name: "Paid" }).click();
  await expect(page.getByText("Marked paid")).toBeVisible();
});

test("people: add a person and log a touchpoint", async ({ page }) => {
  await page.goto("/people");
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Rick Ortega");
  await page.getByLabel("Company", { exact: true }).fill("Chandler Fashion Center");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("person-card").filter({ hasText: "Rick Ortega" }).click();
  await page.getByLabel("Interaction summary").fill("Confirmed Saturday access at 6:30");
  await page.getByRole("button", { name: "Log interaction" }).click();
  await expect(page.getByText("Logged")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Confirmed Saturday access at 6:30")).toBeVisible();
});

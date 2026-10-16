import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "desktop flows");

// Streamed HTML can briefly hold a hidden copy of a form; only ever target the visible one.
const visible = { visible: true } as const;

test("health: log water and a workout; charts render", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByRole("img", { name: /Hours of sleep per night/ })).toBeVisible();
  await page.getByRole("button", { name: "16 oz" }).click();
  await expect(page.getByText("16 oz", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Minutes", { exact: true }).filter(visible).fill("35");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("Workout logged")).toBeVisible();
  await expect(page.getByTestId("workout-list").getByText(/35 min/).first()).toBeVisible();
});

test("money: add an expense and mark a bill paid", async ({ page }) => {
  await page.goto("/money");
  await page.getByLabel("Merchant", { exact: true }).filter(visible).fill("Home Depot");
  await page.getByLabel("Amount", { exact: true }).filter(visible).fill("42.18");
  await page.getByLabel("Merchant", { exact: true }).filter(visible).locator("xpath=ancestor::form").getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Expense added")).toBeVisible();
  await expect(page.getByTestId("tx-list").getByText("Home Depot").first()).toBeVisible();
  // Add a bill of our own so the test doesn't depend on seed bills still being unpaid.
  const bill = `Pool service ${Date.now().toString(36)}`;
  await page.getByLabel("Bill name", { exact: true }).filter(visible).fill(bill);
  await page.getByLabel("Bill amount", { exact: true }).filter(visible).fill("95");
  await page.getByRole("button", { name: "Bill" }).filter(visible).click();
  await expect(page.getByText("Bill added")).toBeVisible();
  const row = page.getByTestId("bill-list").locator("li").filter({ hasText: bill });
  await row.getByRole("button", { name: "Paid" }).click();
  await expect(page.getByText("Marked paid")).toBeVisible();
});

test("people: add a person and log a touchpoint", async ({ page }) => {
  // Unique per run so repeated runs against the same database don't collide.
  const name = `Rick Ortega ${Date.now().toString(36)}`;
  await page.goto("/people");
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Name", { exact: true }).filter(visible).fill(name);
  await page.getByLabel("Company", { exact: true }).filter(visible).fill("Chandler Fashion Center");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("person-card").filter({ hasText: name }).click();
  await page.getByLabel("Interaction summary").fill("Confirmed Saturday access at 6:30");
  await page.getByRole("button", { name: "Log interaction" }).click();
  await expect(page.getByText("Logged", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Confirmed Saturday access at 6:30")).toBeVisible();
});

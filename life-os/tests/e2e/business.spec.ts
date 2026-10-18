import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("business hub shows KPIs, jobs, leads, and quick links", async ({ page }) => {
  await page.goto("/business");
  await expect(page.getByText("Revenue today")).toBeVisible();
  await expect(page.getByTestId("jobs-today").getByText("Patel residence")).toBeVisible();
  await expect(page.getByText("Month pace")).toBeVisible();
  await expect(page.getByRole("link", { name: /Housecall Pro/ })).toHaveAttribute("href", /housecallpro/);
});

test("quick links can be edited in settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await page.goto("/settings");
  const card = page.locator("#business");
  await card.getByRole("button", { name: "Add link" }).click();
  await card.getByLabel("Link label").last().fill("Jobber reviews");
  await card.getByLabel("Link URL").last().fill("https://example.com/reviews");
  await card.getByRole("button", { name: "Save links" }).click();
  await expect(page.getByText("Quick links saved")).toBeVisible();
  await page.goto("/business");
  await expect(page.getByRole("link", { name: /Jobber reviews/ })).toBeVisible();
});

test("Housecall Pro sync fills customers; detail page shows jobs and saves notes", async ({ page, isMobile }) => {
  await gotoReady(page, "/business/customers");
  await expect(page.getByRole("link", { name: "Customers" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  const table = page.getByTestId("customers-table");
  await expect(table.getByRole("link", { name: "Priya Patel" })).toBeVisible();

  await page.getByLabel("Search customers").fill("gilbert");
  await page.getByRole("search").getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=gilbert/);
  await expect(table.getByRole("link", { name: "Minh Nguyen" })).toBeVisible();
  await expect(table.getByRole("link", { name: "Priya Patel" })).toHaveCount(0);

  await table.getByRole("link", { name: "Minh Nguyen" }).click();
  await expect(page.getByRole("heading", { name: "Minh Nguyen" })).toBeVisible();
  await expect(page.getByTestId("customer-jobs").getByText("completed")).toBeVisible();
  if (!isMobile) {
    const note = `Side gate sticks ${Date.now()}`;
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await page.getByLabel("Notes").fill(note);
    await page.getByLabel("Re-book every").focus(); // blur saves
    await expect(page.getByText("Notes saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Notes")).toHaveValue(note);
  }
});

test("customers can be added by hand", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  const name = `Walk-in ${Date.now()}`;
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("City").fill("Mesa");
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Added by hand")).toBeVisible();
});

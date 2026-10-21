import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("KPIs board: all metrics, period switch, goal and spend entry", async ({ page, isMobile }) => {
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  await gotoReady(page, "/business/kpis");
  const grid = page.getByTestId("kpi-grid");
  for (const label of ["Revenue", "Jobs done", "Average ticket", "Revenue / hour", "Jobs / week", "Leads", "Cost per lead", "Quote close rate"]) await expect(grid.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("Revenue vs goal this month")).toBeVisible();
  await page.getByRole("link", { name: "Year", exact: true }).click();
  await expect(page).toHaveURL(/period=year/);
  await expect(page.getByText("Revenue by year")).toBeVisible();
  if (isMobile) return;
  await page.getByLabel("Monthly revenue goal ($)").fill("32000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Goal saved")).toBeVisible();
  await page.getByLabel("Amount ($)").fill("75");
  await page.getByRole("button", { name: "Add spend" }).click();
  await expect(page.getByText("Spend added")).toBeVisible();
  await page.getByLabel("Monthly revenue goal ($)").fill("30000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
});

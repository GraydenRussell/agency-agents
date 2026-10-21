import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("route: today's stops in order with drive legs, map, week strip, and Google Maps link", async ({ page }) => {
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  await gotoReady(page, "/business/route");
  const stops = page.getByTestId("route-stops");
  await expect(stops.getByText("Priya Patel")).toBeVisible();
  await expect(stops.getByText("Sun Lakes HOA")).toBeVisible();
  await expect(stops.getByText("Minh Nguyen")).toBeVisible();
  await expect(stops.getByText(/back to ⌂/)).toBeVisible();
  await expect(page.getByTestId("route-map")).toBeVisible();
  await expect(page.getByRole("link", { name: "Google Maps" })).toHaveAttribute("href", /google\.com\/maps\/dir\/.*waypoints=/);
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByTestId("route-stops").getByText("Linda Park")).toBeVisible();
});

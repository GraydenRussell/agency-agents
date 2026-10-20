import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("Rapid Dashboard is its own section (sidebar + g d), embeds the dashboard, and the link can be changed", async ({ page, isMobile }) => {
  if (!isMobile) {
    await gotoReady(page, "/today");
    await page.getByRole("link", { name: "Rapid Dashboard" }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await gotoReady(page, "/business/dashboard"); // old address redirects
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
  const frame = page.getByTitle("Rapid Window Cleaning dashboard");
  await expect(frame).toHaveAttribute("src", "https://rapid-window-dashboard.vercel.app");
  await expect(page.getByRole("link", { name: /Open in new tab/ })).toHaveAttribute("href", "https://rapid-window-dashboard.vercel.app");
  if (isMobile) return;
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("Dashboard address").fill("https://rapid-window-dashboard.vercel.app/admin/");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Dashboard link saved")).toBeVisible();
  await expect(frame).toHaveAttribute("src", "https://rapid-window-dashboard.vercel.app/admin");
  // put it back for other runs
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("Dashboard address").fill("https://rapid-window-dashboard.vercel.app");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(frame).toHaveAttribute("src", "https://rapid-window-dashboard.vercel.app");
});

test("referrals page records a referral", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  const who = `Neighbor ${Date.now()}`;
  await gotoReady(page, "/business/referrals");
  await page.getByRole("button", { name: "Referral" }).click();
  await page.getByLabel("Referred by (customer)").selectOption({ label: "Priya Patel" });
  await page.getByLabel("Who they referred").fill(who);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Referral recorded")).toBeVisible();
  const row = page.getByTestId("referrals-all").locator("li").filter({ hasText: who });
  await expect(row.getByText("waiting to book")).toBeVisible();
  await row.getByRole("button", { name: /They booked/ }).click();
  await expect(page.getByTestId("referrals-owed").getByText(who)).toBeVisible();
  await page.getByTestId("referrals-owed").locator("li").filter({ hasText: who }).getByRole("button", { name: /Mark reward paid/ }).click();
  await expect(row.getByText("paid", { exact: true })).toBeVisible();
});

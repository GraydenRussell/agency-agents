import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c10000000049454e44ae426082", "hex");

test("expenses: snap a receipt, confirm, see it listed; add a vehicle and a trip; export CSV", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow (mobile layout covered by responsive + a11y)");
  const vendor = `Home Depot ${Date.now()}`;
  await gotoReady(page, "/business/expenses");
  await page.getByLabel("Receipt photo").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/Receipt saved\. Fill in the details\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "View receipt" })).toBeVisible();
  await page.getByLabel("Vendor").fill(vendor);
  await page.getByLabel("Amount ($)").fill("64.18");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Expense saved")).toBeVisible();
  const row = page.getByTestId("expense-list").locator("li").filter({ hasText: vendor });
  await expect(row.getByText("$64.18")).toBeVisible();
  await expect(row.getByRole("link", { name: new RegExp(`Receipt for ${vendor}`) })).toBeVisible();

  await page.getByLabel("Add vehicle").fill(`Truck ${Date.now()}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Vehicle added")).toBeVisible();
  await page.getByLabel("Miles").fill("14.2");
  await page.getByLabel("Purpose").fill("Supply run");
  await page.getByRole("button", { name: "Log trip" }).click();
  await expect(page.getByText("Logged 14.2 mi")).toBeVisible();
  await expect(page.getByTestId("trip-list").getByText("Supply run").first()).toBeVisible();

  const csv = await page.request.get(await page.getByRole("link", { name: /expenses CSV/ }).getAttribute("href") ?? "");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(vendor);
});

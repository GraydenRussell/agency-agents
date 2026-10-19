import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("re-book: due customers with drafted texts; sending takes them off the list", async ({ page, isMobile }) => {
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  await gotoReady(page, "/business/rebook");
  await expect(page.getByRole("heading", { name: "Re-book" })).toBeVisible();
  if (isMobile) return; // both projects share a database; the send flow runs on desktop
  const tom = page.getByTestId("rebook-row").filter({ hasText: "Tom Becker" });
  await expect(tom.getByText(/days overdue/)).toBeVisible();
  await tom.getByRole("button", { name: "Text" }).click();
  await expect(tom.getByLabel("Text to Tom Becker")).toHaveValue(/^Hi Tom, it's Grayden with Rapid Window Cleaning!/);
  await tom.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Sent re-book text to Tom Becker/)).toBeVisible();
  await expect(page.getByTestId("rebook-row").filter({ hasText: "Tom Becker" })).toHaveCount(0);
  await page.getByRole("button", { name: "Snooze Jennifer Alvarez 30 days" }).click();
  await expect(page.getByText("Jennifer Alvarez snoozed 30 days")).toBeVisible();
});

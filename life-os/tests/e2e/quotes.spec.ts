import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("build a quote, see the live price, send it, and mark it won", async ({ page, isMobile }) => {
  const name = `Quote Test ${Date.now()}${isMobile ? " m" : ""}`;
  await gotoReady(page, "/business/quotes/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Mobile (for texting)").fill("480-555-1222");
  await page.getByLabel("Email").fill("tom@example.com");
  await page.getByLabel(/Panes, outside/).fill("32");
  await page.getByLabel(/Panes, inside too/).fill("32");
  await page.getByLabel(/^Screens/).fill("18");
  await page.getByLabel("Stories").selectOption("2");
  await expect(page.getByTestId("quote-total")).toHaveText("$430.10");
  await page.getByRole("button", { name: "Save quote" }).click();

  await expect(page.getByRole("heading", { name: /Quote #\d+/ })).toBeVisible();
  await expect(page.getByTestId("quote-detail-total")).toHaveText("$430.10");
  const pdf = await page.request.get(await page.getByRole("link", { name: "Preview PDF" }).getAttribute("href") ?? "");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.getByRole("button", { name: "Send to customer" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Text message")).toHaveValue(/Hi Quote, here's your Rapid Window Cleaning quote #\d+: \$430\.10/);
  await dialog.getByRole("checkbox", { name: "Send by email" }).click();
  await expect(dialog.getByLabel("Email message")).toBeVisible();
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Sent quote #\d+ \(\$430\.10\) by text to \+14805551222 and email to tom@example.com/)).toBeVisible();
  await expect(page.getByText(/sent .* by text \+ email/)).toBeVisible();

  await page.getByRole("button", { name: "Won" }).click();
  await expect(page.getByText(/won$/).first()).toBeVisible();
  await gotoReady(page, "/business/quotes?status=ACCEPTED");
  await expect(page.getByTestId("quotes-list").getByText(name)).toBeVisible();
  await gotoReady(page, "/activity");
  await expect(page.getByText(/Sent quote #\d+/).first()).toBeVisible();
});

test("pricing changes apply to new quotes", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await gotoReady(page, "/business/quotes/pricing");
  await page.getByLabel(/Per pane, outside/).fill("7");
  await page.getByRole("button", { name: "Save pricing" }).click();
  await expect(page.getByText("Pricing saved")).toBeVisible();
  await gotoReady(page, "/business/quotes/new");
  await page.getByLabel(/Panes, outside/).fill("40");
  await expect(page.getByTestId("quote-total")).toHaveText("$280");
  await page.getByLabel(/Panes, outside/).fill("5");
  await expect(page.getByTestId("quote-total")).toHaveText("$150");
  await expect(page.getByText("Your $150 minimum applies.")).toBeVisible();
  // put the default back for other runs
  await gotoReady(page, "/business/quotes/pricing");
  await page.getByLabel(/Per pane, outside/).fill("6");
  await page.getByRole("button", { name: "Save pricing" }).click();
  await expect(page.getByText("Pricing saved")).toBeVisible();
});

test("customer page starts a prefilled quote", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  await page.getByTestId("customers-table").getByRole("link", { name: "Linda Park" }).click();
  await page.getByRole("link", { name: "New quote" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Linda Park");
  await expect(page.getByLabel("Service address")).toHaveValue(/Queen Creek Rd/);
});

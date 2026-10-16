import { expect, test } from "@playwright/test";

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

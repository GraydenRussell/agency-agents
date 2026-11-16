import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("Do Now: ranked list from across Life OS with one-tap actions and the ask box", async ({ page, isMobile }) => {
  await gotoReady(page, "/now");
  await expect(page.getByRole("heading", { name: "Do Now" })).toBeVisible();
  // Seeded lead nobody answers in the test suite (others reply to Jennifer)
  await expect(page.getByRole("link", { name: "Reply to Ashley Romero", exact: true })).toBeVisible();
  await expect(page.getByTestId("do-later").getByText(/^Set up /).first()).toBeVisible();
  if (isMobile) return;
  const today = page.getByTestId("do-today");
  const habit = today.locator("li").filter({ has: page.getByRole("button", { name: /^Done:/ }) }).first();
  const title = (await habit.locator("a, span.font-medium").first().textContent())?.trim() ?? "";
  await habit.getByRole("button", { name: /^Done:/ }).click();
  await expect(page.getByText(/^(Done|Nice|Logged|Bill marked paid)$/).first()).toBeVisible();
  await expect(today.getByText(title, { exact: true })).toHaveCount(0);

  await page.getByLabel("Ask Life OS to do anything").fill("What do I need to get done today?");
  await page.getByRole("button", { name: "Do it" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByText("What do I need to get done today?")).toBeVisible();
});

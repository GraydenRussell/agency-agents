import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("reviews: rating, a low review flagged with a drafted reply, post it, save the review link", async ({ page, isMobile }) => {
  await gotoReady(page, "/business/reviews");
  await expect(page.getByRole("heading", { name: "Reviews", exact: true })).toBeVisible();
  await expect(page.getByText("4.8", { exact: false }).first()).toBeVisible();
  const need = page.getByTestId("reviews-unreplied");
  await expect(need.getByText("Priya Patel", { exact: true })).toBeVisible(); // nobody replies to Priya in these tests
  if (isMobile) return; // shared database: the posting flow (which answers Mark) runs once
  await expect(need.getByText("Mark Delgado", { exact: true })).toBeVisible();
  await expect(need.getByText("needs care")).toBeVisible();
  const box = page.getByLabel("Reply to Mark Delgado (public on Google)");
  await expect(box).toHaveValue(/thank you for the honest feedback/);
  await need.locator("li").filter({ hasText: "Mark Delgado" }).getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByText("Replied to Mark Delgado's 3★ review on Google")).toBeVisible();
  await expect(need.getByText("Mark Delgado", { exact: true })).toHaveCount(0);

  await page.getByLabel("Your Google review link").fill("https://g.page/r/rapid-test/review");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByText("Review link saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your Google review link")).toHaveValue("https://g.page/r/rapid-test/review");
});

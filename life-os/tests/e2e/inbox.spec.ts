import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "desktop flow; mobile covered by shell tests");

test("needs-reply queue shows triaged leads; draft and send a reply", async ({ page }) => {
  await page.goto("/inbox");
  const list = page.getByTestId("thread-list");
  await expect(list.getByText("Quote request - 2 story home in Ocotillo", { exact: true }).first()).toBeVisible();
  await expect(list.getByText("Lead").first()).toBeVisible();
  await expect(list.getByText("URGENT: verify your account")).toHaveCount(0);

  await list.getByText("Quote request - 2 story home in Ocotillo", { exact: true }).first().click();
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByLabel("Reply body")).toHaveValue(/Hi Jennifer/);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Sent to jen.alvarez@example.com/)).toBeVisible();
  await page.goto("/inbox");
  await expect(page.getByTestId("thread-list").getByText("Quote request - 2 story home in Ocotillo", { exact: true })).toHaveCount(0);
});

test("archive with undo from the inbox view", async ({ page }) => {
  await page.goto("/inbox?view=inbox");
  await page.getByTestId("thread-list").getByText(/10 ways to grow your service business/).first().click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived")).toBeVisible();
  await expect(page.getByTestId("thread-list").getByText(/10 ways to grow your service business/)).toHaveCount(0);
});

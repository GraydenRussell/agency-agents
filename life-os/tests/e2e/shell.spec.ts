import { expect, test } from "@playwright/test";

test("root redirects to Today and the shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("command palette opens with Cmd/Ctrl+K and navigates", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcuts are a desktop affordance");
  await page.goto("/today");
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByPlaceholder("Type a command, search, or capture…");
  await expect(input).toBeVisible();
  await input.fill("Settings");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
});

test("g-chord navigation works", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcuts are a desktop affordance");
  await page.goto("/today");
  await page.getByRole("heading", { level: 1 }).first().click(); // focus the page without hitting a control
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/tasks$/);
});

test("mobile bottom navigation is visible on phones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/today");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
});

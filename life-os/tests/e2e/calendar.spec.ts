import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "calendar drag flows are desktop");

test("week view shows synced (mock) Google events and routine blocks", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("button", { name: /Crew huddle/ }).first()).toBeVisible();
  await expect(page.getByText("Deep work: business").first()).toBeVisible();
});

test("create an event from the dialog", async ({ page }) => {
  await page.goto("/calendar?view=day");
  await page.getByRole("button", { name: "Event", exact: true }).click();
  await page.getByLabel("Title").fill("Quote walkthrough: Sun Lakes");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Event created")).toBeVisible();
  await expect(page.getByRole("button", { name: /Quote walkthrough: Sun Lakes/ })).toBeVisible();
});

test("drag a task from the tray onto the calendar to time-block it", async ({ page }) => {
  await page.goto("/calendar?view=day");
  const task = page.getByTestId("tray-task").first();
  const title = (await task.textContent())?.replace(/\d+m$/, "").trim() ?? "";
  const column = page.locator("[data-testid^=day-column-]").first();
  await column.scrollIntoViewIfNeeded();
  const from = await task.boundingBox();
  const to = await column.boundingBox();
  // The column is taller than its scroll container; aim inside the visible part.
  const viewport = await column.locator("xpath=../..").boundingBox();
  if (!from || !to || !viewport) throw new Error("missing boxes");
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, viewport.y + 120, { steps: 12 });
  await page.waitForTimeout(150); // let dnd-kit settle on the drop target
  await page.mouse.up();
  await expect(page.getByText(/Time-blocked for/)).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first()).toBeVisible();
});

test("month view and settings connect state (mock)", async ({ page }) => {
  await page.goto("/calendar?view=month");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/\+\d more|Crew huddle/).first()).toBeVisible({ timeout: 10_000 });
  await page.goto("/settings");
  await page.getByRole("link", { name: /Connect Google|Reconnect/ }).click();
  await page.waitForURL(/connected=google/);
  await expect(page.getByText(/Connected as grayden@sample.test/)).toBeVisible({ timeout: 10_000 });
});

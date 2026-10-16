import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("quick capture creates a task that appears on the Tasks page", async ({ page, isMobile }) => {
  await page.goto("/today");
  if (isMobile) await page.getByRole("button", { name: "Quick capture" }).click();
  else await page.getByRole("button", { name: /Capture anything/ }).first().click();
  const box = page.getByLabel("Capture text");
  await box.fill(`Buy ladder stabilizer ${isMobile ? "m" : "d"} tomorrow 10am !2 #business`);
  await expect(page.getByText("P2 · High")).toBeVisible();
  await box.press("Enter");
  await expect(page.getByText("Task added")).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByText(`Buy ladder stabilizer ${isMobile ? "m" : "d"}`, { exact: true }).first()).toBeVisible();
});

test("completing a Top 3 task updates Today with undo", async ({ page }) => {
  await page.goto("/today");
  const row = page.getByTestId("task-row").filter({ hasText: "Approve Meta ad creative" }).first();
  await row.getByRole("checkbox").click();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.reload();
  await expect(page.getByTestId("task-row").filter({ hasText: "Approve Meta ad creative" }).first().getByRole("checkbox")).not.toBeChecked();
});

test("task sheet edits persist", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByTestId("task-row").filter({ hasText: "Book dentist appointment" }).getByText("Book dentist appointment").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Title")).toHaveValue("Book dentist appointment");
  await sheet.locator("select").nth(1).selectOption("1");
  await expect(sheet.getByText("Saving…")).toHaveCount(0, { timeout: 5000 });
  await sheet.getByPlaceholder("Add a subtask").fill("Find in-network dentist");
  await sheet.getByRole("button", { name: "Add subtask" }).click();
  await expect(sheet.getByText("Find in-network dentist")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("task-row").filter({ hasText: "Book dentist appointment" }).getByText("P1", { exact: true }).first()).toBeVisible();
});

test("kanban drag moves a card to Doing", async ({ page, isMobile }) => {
  test.skip(isMobile, "drag tested on desktop");
  await page.goto("/tasks?view=board");
  const card = page.getByRole("region", { name: "To do" }).getByText("Read: The E-Myth Revisited");
  const doing = page.getByRole("region", { name: "Doing" });
  await card.scrollIntoViewIfNeeded();
  const from = await card.boundingBox();
  const to = await doing.boundingBox();
  if (!from || !to) throw new Error("no boxes");
  await page.mouse.move(from.x + 20, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, Math.max(to.y, 0) + 60, { steps: 15 });
  await page.waitForTimeout(150); // let dnd-kit settle on the drop target
  await page.mouse.up();
  await expect(doing.getByText("Read: The E-Myth Revisited")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Doing" }).getByText("Read: The E-Myth Revisited")).toBeVisible();
});

test("goals: create a weekly goal", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await page.goto("/goals");
  await page.getByRole("button", { name: "Week goal" }).click();
  await page.getByLabel("Title").fill("Ship Life OS phase 2");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Goal created")).toBeVisible();
  await expect(page.getByText("Ship Life OS phase 2")).toBeVisible();
});

test("notes: create, autosave, and find via search", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await page.goto("/notes");
  await page.getByRole("button", { name: "New note" }).click();
  await expect(page).toHaveURL(/\/notes\/.+/);
  await page.getByLabel("Note title").fill("Gutter add-on pricing");
  await page.getByLabel("Note body").fill("Charge $1.50 per linear foot for gutter brightening.");
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });
  await page.goto("/notes?q=brightening");
  await expect(page.getByText("Gutter add-on pricing")).toBeVisible();
});

test("habit check-in increments", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await page.goto("/today");
  await page.getByRole("button", { name: "Log Water" }).click();
  await expect(page.getByText("1/8 glasses")).toBeVisible();
});

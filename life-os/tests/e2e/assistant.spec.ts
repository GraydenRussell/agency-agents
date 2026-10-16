import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "desktop flow");

test("assistant creates a task via a tool and logs it with undo", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByLabel("Message the assistant").fill("add task order resin filters tomorrow !2");
  await page.getByLabel("Message the assistant").press("Enter");
  await expect(page.getByTestId("assistant-message").last()).toContainText("Done");
  await page.goto("/tasks");
  await expect(page.getByText("order resin filters", { exact: true })).toBeVisible();
  await page.goto("/activity");
  const row = page.getByTestId("activity-list").locator("li").filter({ hasText: 'Create task "order resin filters"' });
  await row.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Undone", { exact: true }).first()).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByText("order resin filters", { exact: true })).toHaveCount(0);
});

test("sending email via the assistant waits for one-tap approval", async ({ page }) => {
  await page.goto("/inbox"); // ensure mock Gmail is synced
  await page.goto("/assistant");
  await page.getByLabel("Message the assistant").fill("reply to Linda saying Yes, the price includes the clubhouse skylights");
  await page.getByLabel("Message the assistant").press("Enter");
  const card = page.getByTestId("approval-card");
  await expect(card).toContainText("includes the clubhouse skylights");
  await page.goto("/approvals");
  await expect(page.getByTestId("approval-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Done: Sent reply to linda@mesaverdehoa.org/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("approval-item")).toHaveCount(0);
  await expect(page.getByText("approved").first()).toBeVisible();
});

test("assistant panel opens with Cmd/Ctrl+J and remembers the conversation", async ({ page }) => {
  await page.goto("/today");
  await page.waitForLoadState("networkidle"); // hotkeys attach after hydration
  await page.getByRole("heading", { level: 1 }).first().click(); // focus the page without hitting a control
  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Assistant" })).toBeVisible();
  await expect(page.getByRole("dialog").getByTestId("assistant-message").first()).toBeVisible({ timeout: 10_000 });
});

test("settings: auto-approve toggles default off; memory can be added", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "Send email replies" })).not.toBeChecked();
  await page.getByLabel("Memory key").fill("preference.crew-calls");
  await page.getByLabel("Memory value").fill("Call the crew before 7am, never text.");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByText("Call the crew before 7am, never text.")).toBeVisible();
});

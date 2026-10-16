import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "desktop flow");

test("sync GitHub (mock), set a next step, add a manual project", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "Sync GitHub" }).click();
  await expect(page.getByText(/Synced \d+ repos/)).toBeVisible();
  const card = page.getByTestId("project-card").filter({ hasText: "Rapid-Windows-dash" });
  await expect(card.getByText("ready")).toBeVisible();
  const next = card.getByPlaceholder("What's the next move?");
  await next.fill("Ship /api/life-os/summary");
  await next.press("Enter");
  await expect(page.getByText("Next step saved")).toBeVisible();

  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByLabel("Name").fill("Crew scheduling app");
  await page.getByLabel("Stack").fill("Next.js, Supabase");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("project-card").filter({ hasText: "Crew scheduling app" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("project-card").filter({ hasText: "Rapid-Windows-dash" }).getByPlaceholder("What's the next move?")).toHaveValue("Ship /api/life-os/summary");
});

import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("lead inbox: waiting badge, drafted reply, send, and quote from the lead", async ({ page, isMobile }) => {
  await gotoReady(page, "/business/leads");
  await expect(page.getByRole("link", { name: /Leads/ }).first()).toHaveAttribute("aria-current", "page");
  const list = page.getByTestId("leads-list");
  await expect(list.getByText("Jennifer Alvarez")).toBeVisible();
  await expect(list.getByText("Mesa Verde HOA")).toBeVisible();
  // Ashley hasn't been answered (the desktop run below answers Jennifer, and both runs share a database)
  await expect(list.getByRole("link", { name: /Ashley Romero/ }).getByText(/^waiting \d+/)).toBeVisible();

  if (isMobile) return; // the send/quote flow runs once (desktop); mobile checks layout above
  await expect(list.getByRole("link", { name: /Jennifer Alvarez/ }).getByText(/^waiting \d+/)).toBeVisible();
  await list.getByRole("link", { name: /Jennifer Alvarez/ }).click();
  await expect(page.getByRole("heading", { name: "Jennifer Alvarez" })).toBeVisible();
  await expect(page.getByTestId("lead-message")).toContainText("open house");
  const reply = page.getByLabel("Reply message");
  await expect(reply).toHaveValue(/^Hi Jennifer, this is Grayden/);
  await reply.fill("Hi Jennifer! Grayden here from Rapid Window Cleaning. Thursday 9am work for the walk-through?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Replied to Jennifer Alvarez by text \(\+14805550185\)/)).toBeVisible();
  await expect(page.getByText(/first reply/)).toBeVisible();

  await page.getByRole("link", { name: "Make a quote" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Jennifer Alvarez");
  await page.getByLabel(/Panes, outside/).fill("30");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByRole("heading", { name: /Quote #\d+/ })).toBeVisible();
  await gotoReady(page, "/business/leads?status=QUOTED");
  await expect(page.getByTestId("leads-list").getByText("Jennifer Alvarez")).toBeVisible();
});

test("website form webhook creates a scored lead; a bad key is refused", async ({ request, page, isMobile }) => {
  test.skip(isMobile, "API flow");
  const name = `Webform ${Date.now()}`;
  const denied = await request.post("/api/leads/webhook", { data: { name, phone: "4805550100" }, headers: { authorization: "Bearer wrong-secret-0000000" } });
  expect(denied.status()).toBe(401);
  const ok = await request.post("/api/leads/webhook?form=E2E", { data: { name, phone: "4805550100", city: "Mesa", message: "Office building, 3 story, quarterly" }, headers: { authorization: "Bearer e2e-lead-webhook-secret-123" } });
  expect(ok.status()).toBe(201);
  await expect(async () => {
    await gotoReady(page, "/business/leads");
    await expect(page.getByTestId("leads-list").getByRole("link", { name: new RegExp(name) })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.getByTestId("leads-list").getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByText(/sounds commercial or recurring/)).toBeVisible();
});

test("add a phone lead by hand", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop flow");
  const name = `Caller ${Date.now()}`;
  await gotoReady(page, "/business/leads");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone").fill("480-555-0177");
  await page.getByLabel("What they need").fill("Hard water on the back sliders, Chandler");
  await page.getByRole("button", { name: "Add lead", exact: true }).last().click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("contacted", { exact: true })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

test("weather: 8-day outlook with risks on job days and a call task to move a job", async ({ page, isMobile }) => {
  await gotoReady(page, "/business/customers");
  await page.getByRole("button", { name: "Sync Housecall Pro" }).click();
  await expect(page.getByText(/Synced \d+ customers/)).toBeVisible();
  await gotoReady(page, "/business/weather");
  await expect(page.getByTestId("weather-day")).toHaveCount(8);
  await expect(page.getByText("Extreme Heat Warning in effect for the Phoenix metro")).toBeVisible();
  await expect(page.getByText(/112°F: finish exterior work/)).toBeVisible();
  await expect(page.getByText(/Thunderstorms likely/)).toBeVisible();
  if (isMobile) return;
  // Mock schedule: Ocotillo Lakes Office Park is booked 2 days out, the 112°F day
  const call = page.getByRole("button", { name: /Add a task to call Ocotillo Lakes Office Park/ });
  await expect(call).toBeVisible();
  await call.click();
  await expect(page.getByText(/Task added: Call Ocotillo Lakes Office Park about moving/)).toBeVisible();
});

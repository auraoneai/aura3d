import { expect, test } from "@playwright/test";

test("cartoon channel route loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
});


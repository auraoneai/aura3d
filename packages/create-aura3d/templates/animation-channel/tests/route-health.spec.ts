import { expect, test } from "@playwright/test";

test("animation channel route loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
});


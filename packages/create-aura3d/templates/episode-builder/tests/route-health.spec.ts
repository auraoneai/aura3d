import { expect, test } from "@playwright/test";

test("episode builder route loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
});


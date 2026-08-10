import { expect, test } from "@playwright/test";

test("episode builder route loads", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_TEMPLATE__));
  await expect(page.locator("canvas")).toBeVisible();
});

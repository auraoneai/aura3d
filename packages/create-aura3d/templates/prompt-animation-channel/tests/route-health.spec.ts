import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test("animation channel route loads", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_TEMPLATE__));
  await expect(page.locator("canvas")).toBeVisible();
});

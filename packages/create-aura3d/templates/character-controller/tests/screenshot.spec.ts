import { expect, test } from "@playwright/test";

test("captures the character controller preview", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: unknown }).__AURA3D_CHARACTER_CONTROLLER_PROOF__));
  const hud = page.locator("#character-controller-hud");
  await expect(hud).toContainText("Character Controller");
  await page.screenshot({ path: "test-results/character-controller-preview.png" });
});

import { expect, test } from "@playwright/test";

test("captures the arena shooter preview", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ARENA_SHOOTER__?: unknown }).__AURA3D_ARENA_SHOOTER__));
  const hud = page.locator("#hud .hud__panel--status");
  await expect(hud).toContainText("Arena Shooter");
  await page.screenshot({ path: "test-results/arena-shooter-preview.png" });
});

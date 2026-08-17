import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("captures first load, combat, and reset screenshots", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 60_000 }).toBe("true");
  mkdirSync(resolve("tests/reports"), { recursive: true });

  const first = await page.screenshot({ fullPage: false });
  writeFileSync(resolve("tests/reports/first-load.png"), first);

  await page.keyboard.press("KeyJ");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");
  const combat = await page.screenshot({ fullPage: false });
  writeFileSync(resolve("tests/reports/mid-combat.png"), combat);

  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(120);
  const afterShot = await page.screenshot({ fullPage: false });
  writeFileSync(resolve("tests/reports/after-kill.png"), afterShot);

  await page.keyboard.press("KeyT");
  await page.waitForTimeout(160);
  const reset = await page.screenshot({ fullPage: false });
  writeFileSync(resolve("tests/reports/reset.png"), reset);

  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(180);
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(180);
  await page.keyboard.press("KeyJ");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(420);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2800);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  const win = await page.screenshot({ fullPage: false });
  writeFileSync(resolve("tests/reports/win.png"), win);

  await page.keyboard.press("KeyT");
  await page.waitForTimeout(200);
  const afterWinReset = await page.screenshot({ fullPage: false });
  writeFileSync(resolve("tests/reports/reset-after-win.png"), afterWinReset);

  expect(first.byteLength).toBeGreaterThan(1000);
  expect(combat.byteLength).toBeGreaterThan(1000);
  expect(afterShot.byteLength).toBeGreaterThan(1000);
  expect(reset.byteLength).toBeGreaterThan(1000);
  expect(win.byteLength).toBeGreaterThan(1000);
  expect(afterWinReset.byteLength).toBeGreaterThan(1000);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({
    firstLoad: first.byteLength,
    midCombat: combat.byteLength,
    afterShot: afterShot.byteLength,
    reset: reset.byteLength,
    win: win.byteLength,
    afterWinReset: afterWinReset.byteLength
  }, null, 2)}\n`);
});

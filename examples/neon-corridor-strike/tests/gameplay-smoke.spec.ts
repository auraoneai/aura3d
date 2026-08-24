import { expect, test } from "@playwright/test";

test.setTimeout(300_000);

test("move, look, fire, pickup, and reset change FPS state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 60_000 }).toBe("true");

  const initial = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(initial?.status).toBe("playing");

  await page.locator("canvas").click();
  await page.waitForTimeout(80);
  const locked = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(locked?.pointerLockRequested ?? 0).toBeGreaterThanOrEqual(1);

  await page.mouse.move(640, 360);
  await page.mouse.move(720, 300);
  const looked = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(Math.abs((looked?.yaw ?? 0) - (initial?.yaw ?? 0)) + Math.abs((looked?.pitch ?? 0) - (initial?.pitch ?? 0))).toBeGreaterThan(0);

  const startZ = looked?.z ?? 0;
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyS");
  const moved = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(Math.abs((moved?.z ?? 0) - startZ)).toBeGreaterThan(0.15);

  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(120);
  const fired = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(fired?.shotsFired ?? 0).toBeGreaterThan((initial?.shotsFired ?? 0));
  expect(fired?.ammo ?? 99).toBeLessThan(12);

  await page.keyboard.press("KeyR");
  // This package-local first-compile harness pins the live authored window.
  // The faster monorepo playable regression separately pins completion.
  await expect.poll(async () => (await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__))?.reloading, { timeout: 3_000 }).toBe(true);
  const reloading = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(reloading?.ammo).toBe(fired?.ammo);
  await page.keyboard.press("KeyT");
  await expect.poll(async () => (await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__))?.ammo).toBe(12);

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2200);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(200);
  const combat = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect((combat?.hits ?? 0) + (combat?.kills ?? 0) + (combat?.pickups ?? 0)).toBeGreaterThan(0);

  await page.keyboard.press("KeyT");
  await page.waitForTimeout(160);
  const reset = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(reset?.resets ?? 0).toBeGreaterThan(0);
  expect(reset?.ammo).toBe(12);
  expect(reset?.hp).toBe(100);
  expect(reset?.status).toBe("playing");

  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(180);
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(180);
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(200);
  await page.keyboard.down("KeyD");
  // Reach the authored x=1.9 ammo lane. Stopping at the first detectable
  // lateral movement can leave the player behind the center-lane props.
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__))?.x ?? 0), { timeout: 25_000 }).toBeGreaterThan(1.75);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyW");
  await expect.poll(async () => (await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__))?.pickups ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.keyboard.up("KeyW");
  const picked = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(picked?.pickups ?? 0).toBeGreaterThan(0);

  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await expect.poll(async () => (await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__))?.z ?? 99, { timeout: 90_000 }).toBeLessThan(-7.75);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await expect.poll(async () => (await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__))?.status, { timeout: 5_000 }).toBe("won");
  const won = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(won?.status).toBe("won");

  await page.keyboard.press("KeyT");
  await page.waitForTimeout(200);
  const afterWinReset = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  expect(afterWinReset?.status).toBe("playing");
  expect(afterWinReset?.hp).toBe(100);
});

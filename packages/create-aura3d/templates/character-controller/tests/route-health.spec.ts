import { expect, test } from "@playwright/test";

test("character controller route exposes a live locomotion proof", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: unknown }).__AURA3D_CHARACTER_CONTROLLER_PROOF__));

  // idle at rest
  const idle = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
  expect(idle!.state).toBe("idle");

  // holding a movement key accelerates into walk/run
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(600);
  const moving = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string; speed: number; clipWeights: { weight: number }[] } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
  await page.keyboard.up("KeyD");

  expect(moving!.speed).toBeGreaterThan(0.1);
  expect(["walk", "run"]).toContain(moving!.state);
  const sum = moving!.clipWeights.reduce((acc, w) => acc + w.weight, 0);
  expect(sum).toBeGreaterThan(0.9);
  expect(sum).toBeLessThan(1.1);
  expect(errors).toEqual([]);
});

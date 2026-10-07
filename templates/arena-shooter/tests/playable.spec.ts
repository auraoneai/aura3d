import { expect, test } from "@playwright/test";

// Gameplay assertions drive the real input surface: WASD moves, Space fires
// bolts (boltsLive > 0), the wave spawner lands drones, and R resets after
// the shield is spent.
test("arena shooter is playable: move, fire, waves, reset", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ARENA_SHOOTER__?: unknown }).__AURA3D_ARENA_SHOOTER__));

  const readProof = () => page.evaluate(() => (window as unknown as {
    __AURA3D_ARENA_SHOOTER__?: {
      status: string; score: number; wave: number; shield: number; kills: number;
      dronesAlive: number; dronesQueued: number; boltsLive: number;
      ship: { position: readonly number[] };
    };
  }).__AURA3D_ARENA_SHOOTER__);

  const initial = await readProof();
  expect(["playing", "wave-cleared"]).toContain(initial!.status);

  // WASD moves the ship.
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyD");
  const moved = await readProof();
  expect(moved!.ship.position[0]).toBeGreaterThan(initial!.ship.position[0] + 0.05);

  // Space fires a live bolt.
  await page.keyboard.down("Space");
  await page.waitForFunction(
    () => ((window as unknown as { __AURA3D_ARENA_SHOOTER__?: { boltsLive: number } }).__AURA3D_ARENA_SHOOTER__?.boltsLive ?? 0) > 0,
    { timeout: 5_000 }
  );
  await page.keyboard.up("Space");

  // The wave spawner keeps landing drones until the wave is exhausted.
  await page.waitForFunction(
    () => ((window as unknown as { __AURA3D_ARENA_SHOOTER__?: { dronesAlive: number } }).__AURA3D_ARENA_SHOOTER__?.dronesAlive ?? 0) > 0,
    { timeout: 30_000 }
  );

  // Reset restores score/shield and restarts wave 1.
  const scored = await readProof();
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(300);
  const reset = await readProof();
  expect(reset!.status).not.toBe("game-over");
  expect(reset!.shield).toBe(5);
  expect(reset!.score).toBe(0);
  expect(reset!.kills).toBe(0);
  expect(reset!.wave).toBe(1);
  expect(scored!.wave).toBeGreaterThanOrEqual(1);

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
});

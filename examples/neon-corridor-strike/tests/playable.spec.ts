import { expect, test, type Page } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/playable.spec.ts: inputs
// are consumed per presented frame, so every assertion waits on the
// published snapshot itself rather than a wall-clock settle. Fire uses
// KeyJ and look uses unlocked mouse deltas on purpose — pointer-lock
// engagement in headless Chromium is UNVERIFIED, so the spec asserts the
// lock *request* counter and never depends on lock being granted.
// LOOK_SENS in src/rules.ts is 0.0024 rad/px on raw pointer dx/dy (E5);
// the aim helper inverts exactly that mapping from live snapshot values.
const LOOK_SENS = 0.0024;

test("neon corridor boots framed, looks, moves, fires, clears, and resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  // Boot + framed snapshot.
  const initial = await corridorState(page);
  expect(initial.look.id).toBe("neon-arcade");
  expect(initial.status).toBe("playing");
  expect(initial.targetsAlive).toBe(5);
  expect(initial.typedAssets).toEqual(
    expect.arrayContaining(["quaterniusWallModular", "quaterniusCubeCrate", "kenneyCraftMiner"])
  );
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  // HUD + crosshair are visible and carry the corridor status lines.
  const hud = page.locator("#neon-corridor-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Neon Corridor Strike");
  await expect(page.locator("#neon-crosshair")).toBeVisible();

  // Mouse-look turns at full E5 sensitivity: a 200 px sweep must clear
  // 0.3 rad (the trashed 96x-dampened pipeline capped at ~0.0024 rad).
  const yawBefore = (await corridorState(page)).player.yaw;
  await page.mouse.move(640, 400);
  await page.waitForTimeout(120);
  const yawSettled = (await corridorState(page)).player.yaw;
  await page.mouse.move(840, 400);
  await page.waitForFunction(
    (yaw) =>
      Math.abs(
        ((window as unknown as { __aura3dGameSnapshot?: { readonly player?: { readonly yaw?: number } } }).__aura3dGameSnapshot?.player?.yaw ?? yaw) - yaw
      ) >= 0.3,
    yawSettled,
    { timeout: 30_000 }
  );
  expect(Math.abs(yawBefore)).toBeLessThan(0.3);

  // WASD locomotion: holding W advances down the corridor (-Z).
  const zBefore = (await corridorState(page)).player.z;
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (z) =>
      ((window as unknown as { __aura3dGameSnapshot?: { readonly player?: { readonly z?: number } } }).__aura3dGameSnapshot?.player?.z ?? z) < z - 0.3,
    zBefore,
    { timeout: 30_000 }
  );
  await page.keyboard.up("KeyW");

  // Clicking the canvas requests pointer lock (grant is browser-owned).
  await page.locator("#app canvas").first().click();
  await page.waitForFunction(
    () =>
      ((window as unknown as { __aura3dGameSnapshot?: { readonly pointerLockRequested?: number } }).__aura3dGameSnapshot
        ?.pointerLockRequested ?? 0) >= 1,
    undefined,
    { timeout: 30_000 }
  );

  // Fire registers a real hitscan hit on the dead-ahead sentry.
  const shotsBefore = (await corridorState(page)).shotsFired;
  await aimAtFirstAlive(page);
  await fireOnce(page);
  const afterShot = await corridorState(page);
  expect(afterShot.shotsFired).toBeGreaterThan(shotsBefore);
  expect(afterShot.ammo).toBeLessThan(12);
  expect(afterShot.hits).toBeGreaterThan(0);

  // Clear the corridor: aim from live snapshot geometry, fire until won.
  for (let guard = 0; guard < 40; guard += 1) {
    const state = await corridorState(page);
    if (state.won) break;
    await aimAtFirstAlive(page);
    await fireOnce(page);
  }
  const cleared = await corridorState(page);
  expect(cleared.won).toBe(true);
  expect(cleared.status).toBe("won");
  expect(cleared.kills).toBe(5);

  // R resets to the baseline run.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => ((window as unknown as { __aura3dGameSnapshot?: { readonly resets?: number } }).__aura3dGameSnapshot?.resets ?? 0) >= 1,
    undefined,
    { timeout: 30_000 }
  );
  const reset = await corridorState(page);
  expect(reset.targetsAlive).toBe(5);
  expect(reset.ammo).toBe(12);
  expect(reset.won).toBe(false);
  expect(reset.events).toEqual(expect.arrayContaining([expect.stringContaining("reset")]));
});

async function aimAtFirstAlive(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await corridorState(page);
    const target = state.targets.find((candidate) => candidate.alive);
    if (!target) return;
    const dx = target.position[0] - state.player.x;
    const dy = target.position[1] - state.player.y;
    const dz = target.position[2] - state.player.z;
    const length = Math.hypot(dx, dy, dz);
    const yawNeeded = Math.atan2(-dx, -dz);
    const pitchNeeded = Math.asin(dy / length);
    const pxX = (state.player.yaw - yawNeeded) / LOOK_SENS;
    const pxY = (state.player.pitch - pitchNeeded) / LOOK_SENS;
    if (Math.abs(pxX) < 3 && Math.abs(pxY) < 3) return;
    await page.mouse.move(640, 400);
    await page.waitForTimeout(60);
    const settled = await corridorState(page);
    const moveX = 640 + (settled.player.yaw - yawNeeded) / LOOK_SENS;
    const moveY = 400 + (settled.player.pitch - pitchNeeded) / LOOK_SENS;
    await page.mouse.move(moveX, moveY);
    await page.waitForTimeout(90);
  }
}

async function fireOnce(page: Page): Promise<void> {
  const shots = (await corridorState(page)).shotsFired;
  await page.keyboard.press("KeyJ", { delay: 90 });
  await page.waitForFunction(
    (before) =>
      ((window as unknown as { __aura3dGameSnapshot?: { readonly shotsFired?: number } }).__aura3dGameSnapshot?.shotsFired ?? before) >
      before,
    shots,
    { timeout: 30_000 }
  );
  // Respect the rules-module fire cooldown before the next attempt.
  await page.waitForTimeout(220);
}

async function corridorState(page: Page): Promise<{
  readonly framed: boolean;
  readonly status: string;
  readonly player: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number };
  readonly shotsFired: number;
  readonly hits: number;
  readonly kills: number;
  readonly targetsAlive: number;
  readonly targets: readonly {
    readonly id: string;
    readonly alive: boolean;
    readonly hp: number;
    readonly position: readonly [number, number, number];
  }[];
  readonly ammo: number;
  readonly won: boolean;
  readonly resets: number;
  readonly pointerLockRequested: number;
  readonly events: readonly string[];
  readonly look: { readonly id: string };
  readonly typedAssets: readonly string[];
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __aura3dGameSnapshot?: {
        readonly framed: boolean;
        readonly status: string;
        readonly player: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number };
        readonly shotsFired: number;
        readonly hits: number;
        readonly kills: number;
        readonly targetsAlive: number;
        readonly targets: readonly {
          readonly id: string;
          readonly alive: boolean;
          readonly hp: number;
          readonly position: readonly [number, number, number];
        }[];
        readonly ammo: number;
        readonly won: boolean;
        readonly resets: number;
        readonly pointerLockRequested: number;
        readonly events: readonly string[];
        readonly look: { readonly id: string };
        readonly typedAssets: readonly string[];
      };
    }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

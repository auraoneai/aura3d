import { expect, test } from "@playwright/test";

// Modeled on templates/racing-starter/tests/playable.spec.ts and
// apps/showcase-blockfall-reactor/tests/playable.spec.ts: assertions wait
// on the published snapshot itself rather than a wall-clock settle.
test.setTimeout(420_000);

type TurboState = {
  readonly framed: boolean;
  readonly state: string;
  readonly status: string;
  readonly frame: number;
  readonly speed: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly progress: number;
  readonly heading: number;
  readonly racePosition: number;
  readonly opponentProgress: number;
  readonly groundClearance: readonly {
    readonly id: string;
    readonly clearance: number;
    readonly groundY: number;
    readonly wheelY: number;
    readonly grounded: boolean;
    readonly hit: boolean;
  }[];
  readonly wheelRadius: number;
  readonly groundedWheels: number;
  readonly events: readonly string[];
  readonly look: { readonly id: string };
};

async function turboState(page: import("@playwright/test").Page): Promise<TurboState> {
  return page.evaluate(() => {
    const state = (window as unknown as { __aura3dGameSnapshot?: TurboState }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

test("turbo drift boots framed, wheels sit on the surface, drives, steers, races the rival, and resets", async ({ page }) => {
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  const initial = await turboState(page);
  expect(initial.look.id).toBe("golden-hour");
  expect(initial.checkpointCount).toBe(6);
  expect(initial.groundClearance).toHaveLength(4);

  // The owner-visible grounding defect, asserted on real sampled values:
  // every grounded wheel's centre sits one wheel radius above the ground
  // sampled under it (never below the surface beyond epsilon).
  expect(initial.groundedWheels).toBeGreaterThan(0);
  for (const wheel of initial.groundClearance) {
    // Clearance is only meaningful where a real triangle was sampled.
    if (wheel.hit) {
      expect(wheel.clearance, `${wheel.id} clearance`).toBeGreaterThanOrEqual(initial.wheelRadius - 0.02);
    }
    if (wheel.grounded) {
      expect(Math.abs(wheel.clearance - initial.wheelRadius), `${wheel.id} seated`).toBeLessThanOrEqual(0.02);
    }
  }

  // HUD element is visible and carries the race line.
  const hud = page.locator("#turbo-drift-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Turbo Drift Circuit");

  // Countdown releases into racing.
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string } }).__aura3dGameSnapshot?.state === "racing",
    undefined,
    { timeout: 30_000 }
  );

  // The rival moves independently from its own racing state.
  await page.waitForFunction(
    (start) => ((window as unknown as { __aura3dGameSnapshot?: { readonly opponentProgress?: number } }).__aura3dGameSnapshot?.opponentProgress ?? 0) > start,
    initial.opponentProgress,
    { timeout: 60_000 }
  );

  // Accelerate: speed and progress advance.
  const beforeDrive = await turboState(page);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (start) => ((window as unknown as { __aura3dGameSnapshot?: { readonly speed?: number } }).__aura3dGameSnapshot?.speed ?? 0) > start + 0.5,
    beforeDrive.speed,
    { timeout: 60_000 }
  );
  const accelerated = await turboState(page);
  expect(accelerated.progress).not.toBe(beforeDrive.progress);
  // Clearance still holds at speed wherever the mesh was hit.
  for (const wheel of accelerated.groundClearance) {
    if (wheel.hit) {
      expect(wheel.clearance, `${wheel.id} clearance at speed`).toBeGreaterThanOrEqual(accelerated.wheelRadius - 0.02);
    }
  }

  // Steering changes heading.
  await page.keyboard.down("KeyA");
  await page.waitForFunction(
    (start) => ((window as unknown as { __aura3dGameSnapshot?: { readonly heading?: number } }).__aura3dGameSnapshot?.heading ?? start) !== start,
    accelerated.heading,
    { timeout: 60_000 }
  );
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");

  // Reset returns to the countdown with a zeroed gate count.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string } }).__aura3dGameSnapshot?.state === "countdown",
    undefined,
    { timeout: 30_000 }
  );
  const reset = await turboState(page);
  expect(reset.checkpoint).toBe(0);
  expect(reset.events.some((event) => event.includes("reset"))).toBe(true);
  expect(reset.racePosition).toBeGreaterThanOrEqual(1);
});

// A full lap under held throttle increments the lap counter (the kit's
// ordered checkpoints gate the wrap). This is the slowest assertion in the
// file, so it rides the 420 s test budget with snapshot polling only.
test("turbo drift lap increments after a full circuit", async ({ page }) => {
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string } }).__aura3dGameSnapshot?.state === "racing",
    undefined,
    { timeout: 60_000 }
  );
  const start = await turboState(page);
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (lap) => ((window as unknown as { __aura3dGameSnapshot?: { readonly lap?: number } }).__aura3dGameSnapshot?.lap ?? lap) > lap,
    start.lap,
    { timeout: 300_000 }
  ).finally(() => page.keyboard.up("KeyW"));
  const lapped = await turboState(page);
  expect(lapped.lap).toBe(start.lap + 1);
  expect(lapped.events.some((event) => event.startsWith("lap"))).toBe(true);
});

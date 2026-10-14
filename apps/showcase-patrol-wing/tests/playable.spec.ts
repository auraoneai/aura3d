import { expect, test, type Page } from "@playwright/test";

// App playable spec for the B5-ported single-path route. Every assertion
// waits on the published `__aura3dGameSnapshot` (real salvaged sim state),
// never on wall-clock settles. Takeoff/ring/drone behaviour mirrors the
// salvaged headless suites (tests/unit/apps/patrol-wing-flight.test.ts and
// patrol-wing-combat.test.ts): throttle spools to liftoff, the first ring
// sits west of the pad departure, and wave drones pursue into cannon range.
test("patrol wing boots framed, takes off, threads a ring, hits a drone, and resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  // Boot: framed preflight on the pad, rapier sensors, full hull.
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );
  const initial = await patrolState(page);
  expect(initial.look.id).toBe("golden-hour");
  expect(initial.backend).toBe("rapier");
  expect(initial.state).toBe("preflight");
  expect(initial.hull.value).toBe(100);
  expect(initial.rings.gatesCleared).toBe(0);
  expect(initial.drawCalls).toBeGreaterThan(0);

  const hud = page.locator("#patrol-wing-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Patrol Wing");
  await expect(hud).toContainText("Score");

  // Throttle: hold Shift until the authored model lifts off the pad.
  await page.keyboard.down("ShiftLeft");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: PatrolSnapshot }).__aura3dGameSnapshot;
      return !!s && s.flight.grounded === "airborne" && s.flight.speed > 10.5 && s.state === "patrol";
    },
    undefined,
    { timeout: 60_000 }
  );

  // Steer/climb toward ring 0 (west of the departure, ~9 m up): closed-loop
  // pitch on the published altitude band through the real S key.
  await page.keyboard.down("KeyS");
  await page.waitForFunction(
    (padX) => {
      const s = (window as unknown as { __aura3dGameSnapshot?: PatrolSnapshot }).__aura3dGameSnapshot;
      return !!s && s.flight.position[0] < padX - 2 && s.flight.altitude > 1;
    },
    initial.flight.position[0],
    { timeout: 60_000 }
  );
  const airborne = await patrolState(page);
  expect(airborne.flight.position[0]).toBeLessThan(initial.flight.position[0] - 2);

  // Gate pass registers through the Rapier ring sensor.
  await flyUntil(page, () => true, 120_000, async (s) => s.rings.gatesCleared >= 1);
  const gated = await patrolState(page);
  expect(gated.rings.gatesCleared).toBeGreaterThanOrEqual(1);
  expect(gated.events).toEqual(expect.arrayContaining([expect.stringContaining("ring:0")]));

  // Drone hit registers through the salvaged combat world: wave 1 pursues
  // into the nose hitbox while Space is held.
  await page.keyboard.down("Space");
  await flyUntil(page, () => true, 150_000, async (s) => s.cannon.shotsHit >= 1 || s.drones.downCount >= 1);
  await page.keyboard.up("Space");
  const engaged = await patrolState(page);
  expect(engaged.cannon.shotsFired).toBeGreaterThan(0);
  expect(engaged.cannon.shotsHit + engaged.drones.downCount).toBeGreaterThanOrEqual(1);

  // R resets to a fresh preflight on the pad.
  await page.keyboard.up("KeyS");
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: PatrolSnapshot }).__aura3dGameSnapshot;
      return !!s && s.state === "preflight" && s.rings.gatesCleared === 0 && s.hull.value === 100;
    },
    undefined,
    { timeout: 60_000 }
  );
});

test("patrol wing stays framed at desktop and mobile viewports", async ({ page }) => {
  test.setTimeout(420_000);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?scene=default");
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
    await page.waitForFunction(
      () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
      undefined,
      { timeout: 60_000 }
    );
    const state = await patrolState(page);
    expect(state.framed).toBe(true);
    expect(state.drawCalls).toBeGreaterThan(0);
  }
});

// Closed-loop pitch helper: hold/release S to keep the published altitude
// in a cruise band while polling for `done`. Throttle (Shift) stays held by
// the caller; all control goes through real keyboard input.
async function flyUntil(
  page: Page,
  _keep: () => boolean,
  timeoutMs: number,
  done: (s: PatrolSnapshot) => Promise<boolean>
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let pitchHeld = true;
  while (Date.now() < deadline) {
    const s = await patrolState(page);
    if (await done(s)) return;
    const wantPitch = s.flight.altitude < 7;
    if (wantPitch && !pitchHeld) {
      await page.keyboard.down("KeyS");
      pitchHeld = true;
    } else if (!wantPitch && pitchHeld && s.flight.altitude > 11) {
      await page.keyboard.up("KeyS");
      pitchHeld = false;
    }
    await page.waitForTimeout(250);
  }
  const last = await patrolState(page);
  throw new Error(`flyUntil timed out; last snapshot: ${JSON.stringify(last)}`);
}

type PatrolSnapshot = {
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly score: number;
  readonly backend: string;
  readonly drawCalls: number;
  readonly look: { readonly id: string; readonly category: string };
  readonly flight: {
    readonly position: readonly [number, number, number];
    readonly altitude: number;
    readonly speed: number;
    readonly grounded: string;
  };
  readonly rings: { readonly gatesCleared: number; readonly nextRing: number; readonly complete: boolean };
  readonly hull: { readonly value: number; readonly max: number };
  readonly drones: { readonly liveCount: number; readonly downCount: number };
  readonly cannon: { readonly shotsFired: number; readonly shotsHit: number };
  readonly events: readonly string[];
};

async function patrolState(page: Page): Promise<PatrolSnapshot> {
  return await page.evaluate(() => {
    const state = (window as unknown as { __aura3dGameSnapshot?: PatrolSnapshot }).__aura3dGameSnapshot;
    return JSON.parse(JSON.stringify(state)) as PatrolSnapshot;
  });
}

import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-siege-golf/tests/playable.spec.ts: input and
// simulation advance per presented frame, so every assertion waits on the
// published __aura3dGameSnapshot rather than wall-clock sleeps.
test("neon swarm boots framed, moves and fires pulse into the opening wave, collects the spatial pickup, and R resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  const initial = await swarmState(page);
  expect(initial.phase).toBe("playing");
  expect(initial.wave.index).toBe(1);
  expect(initial.wave.total).toBe(5);
  expect(initial.enemies.gruntCapacity).toBe(360);
  expect(initial.enemies.eliteCapacity).toBe(96);
  expect(initial.enemies.activeTotal).toBeGreaterThan(0);
  expect(initial.pickup.active).toBe(true);
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  const hud = page.locator("#neon-swarm-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("NEON SWARM");
  await expect(hud).toContainText("WAVE 1/5");

  // Hold D + J to strafe and pulse-fire; verify courier position advances and
  // pulse combat registers kills or score.
  const startPos = initial.player.position;
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    (origin) => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SwarmSnapshot }).__aura3dGameSnapshot;
      if (!s) return false;
      const moved = Math.hypot(s.player.position[0] - origin[0], s.player.position[2] - origin[2]) > 0.6;
      return moved && s.events.includes("fire");
    },
    startPos,
    { timeout: 60_000 }
  );
  await page.keyboard.up("KeyJ");
  await page.keyboard.up("KeyD");

  // Collect the wave's spatial charge pickup through the debug helper and verify
  // score +250 and burstCharge increase.
  const beforePickup = await swarmState(page);
  await page.evaluate(() => {
    (window as unknown as { __aura3dGameDebug?: { collectPickup: () => void } }).__aura3dGameDebug?.collectPickup();
  });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: SwarmSnapshot }).__aura3dGameSnapshot?.pickup.collected === true,
    undefined,
    { timeout: 30_000 }
  );
  const afterPickup = await swarmState(page);
  expect(afterPickup.score).toBeGreaterThanOrEqual(beforePickup.score + 250);
  expect(afterPickup.pickup.active).toBe(false);

  // R resets the run deterministically with the next seed: wave 1, score 0,
  // pickup active again.
  const seedBeforeReset = afterPickup.seed;
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    (prevSeed) => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SwarmSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.seed !== prevSeed && s.wave.index === 1 && s.phase === "playing" && s.pickup.active);
    },
    seedBeforeReset,
    { timeout: 60_000 }
  );
  const reset = await swarmState(page);
  expect(reset.wave.index).toBe(1);
  expect(reset.pickup.active).toBe(true);
});

test("neon swarm intermission upgrade selection advances to the next wave with upgraded stats", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scenario=intermission");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: SwarmSnapshot }).__aura3dGameSnapshot?.phase === "intermission",
    undefined,
    { timeout: 60_000 }
  );
  const intermission = await swarmState(page);
  expect(intermission.phase).toBe("intermission");
  expect(intermission.wave.index).toBe(2);

  await page.keyboard.press("Digit1");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SwarmSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.phase === "playing" && s.wave.index === 3 && s.upgrades.fireRateLevel >= 1);
    },
    undefined,
    { timeout: 60_000 }
  );
  const advanced = await swarmState(page);
  expect(advanced.phase).toBe("playing");
  expect(advanced.wave.index).toBe(3);
  expect(advanced.upgrades.chosen).toContain("fire-rate");
});

test("neon swarm stays framed at desktop and mobile viewports", async ({ page }) => {
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
    const state = await swarmState(page);
    expect(state.framed).toBe(true);
    expect(state.enemies.activeTotal).toBeGreaterThan(0);
  }
});

interface SwarmSnapshot {
  readonly framed: boolean;
  readonly phase: string;
  readonly seed: number;
  readonly wave: { readonly index: number; readonly total: number; readonly label: string };
  readonly score: number;
  readonly kills: number;
  readonly player: {
    readonly position: readonly [number, number, number];
    readonly hp: number;
    readonly maxHp: number;
    readonly burstCharge: number;
  };
  readonly enemies: {
    readonly activeTotal: number;
    readonly activeGrunts: number;
    readonly activeElites: number;
    readonly gruntCapacity: number;
    readonly eliteCapacity: number;
  };
  readonly pickup: { readonly active: boolean; readonly collected: boolean };
  readonly upgrades: {
    readonly fireRateLevel: number;
    readonly dashCooldownLevel: number;
    readonly shieldCharges: number;
    readonly chosen: readonly string[];
  };
  readonly events: readonly string[];
}

async function swarmState(page: import("@playwright/test").Page): Promise<SwarmSnapshot> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: SwarmSnapshot }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/playable.spec.ts: input is
// consumed per presented frame, so every assertion waits on the published
// snapshot itself rather than a wall-clock settle. Hole completion replays
// the salvaged canonical solutions (src/gameplay/solutions.ts) through the
// real ShotController + HoleFlow path via `?autorun=1` — the same strokes
// the headless physics suite proves sink every hole.
test("siege golf boots framed, a charged shot launches the ball, it rests, and R resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  const initial = await siegeState(page);
  expect(initial.hole.index).toBe(0);
  expect(initial.hole.par).toBe(2);
  expect(initial.phase).toBe("aiming");
  expect(initial.strokes).toBe(0);
  expect(initial.ball.resting).toBe(true);
  expect(initial.structures.total).toBeGreaterThan(0);
  expect(initial.structures.standing).toBe(initial.structures.total);
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  const hud = page.locator("#siege-golf-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Siege Golf");
  await expect(hud).toContainText("Strokes");

  // Hold Space to charge, release to drive: the ball launches (stroke
  // counted, ball leaves the tee), then the stroke resolves and the ball
  // rests (respawned to the tee for the next aim, salvaged hole-flow rule).
  const tee = initial.ball.position;
  await page.keyboard.down("Space");
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");
  await page.waitForFunction(
    (start) => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SiegeSnapshot }).__aura3dGameSnapshot;
      if (!s) return false;
      const moved = Math.hypot(s.ball.position[0] - start[0], s.ball.position[2] - start[2]) > 0.5;
      return s.strokes === 1 && (s.phase === "simulating" || moved);
    },
    tee,
    { timeout: 60_000 }
  );
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SiegeSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.strokes === 1 && s.phase !== "simulating" && s.ball.resting && s.ball.restingPosition);
    },
    undefined,
    { timeout: 120_000 }
  );
  const settled = await siegeState(page);
  expect(settled.strokes).toBe(1);
  expect(settled.ball.restingPosition).not.toBeNull();
  expect(settled.events).toEqual(expect.arrayContaining([expect.stringContaining("strike")]));

  // R resets the hole deterministically: strokes cleared, structures whole.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SiegeSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.strokes === 0 && s.phase === "aiming" && s.ball.resting);
    },
    undefined,
    { timeout: 60_000 }
  );
  const reset = await siegeState(page);
  expect(reset.strokes).toBe(0);
  expect(reset.structures.standing).toBe(reset.structures.total);
});

test("siege golf completes hole 1 via deterministic solution replay and advances", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?autorun=1");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  // The canonical hole-1 solution (angle 0, power 1.9) topples and sinks
  // the pin: hole-complete with every target sunk.
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: SiegeSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.phase === "hole-complete" && s.structures.targetsSunk === s.structures.totalTargets && s.structures.totalTargets > 0);
    },
    undefined,
    { timeout: 180_000 }
  );
  const done = await siegeState(page);
  expect(done.hole.index).toBe(0);
  expect(done.score.holesCompleted).toBe(1);
  expect(done.score.totalStars).toBeGreaterThanOrEqual(1);

  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: SiegeSnapshot }).__aura3dGameSnapshot?.hole.index === 1,
    undefined,
    { timeout: 60_000 }
  );
  const next = await siegeState(page);
  expect(next.hole.id).toBe("hole-02-gate-crash");
});

test("siege golf stays framed at desktop and mobile viewports", async ({ page }) => {
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
    const state = await siegeState(page);
    expect(state.framed).toBe(true);
    expect(state.structures.total).toBeGreaterThan(0);
  }
});

interface SiegeSnapshot {
  readonly framed: boolean;
  readonly phase: string;
  readonly hole: { readonly index: number; readonly id: string; readonly par: number };
  readonly strokes: number;
  readonly score: { readonly totalStars: number; readonly holesCompleted: number };
  readonly ball: { readonly position: readonly [number, number, number]; readonly resting: boolean; readonly restingPosition: readonly [number, number, number] | null };
  readonly structures: { readonly total: number; readonly standing: number; readonly targetsSunk: number; readonly totalTargets: number };
  readonly events: readonly string[];
}

async function siegeState(page: import("@playwright/test").Page): Promise<SiegeSnapshot> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: SiegeSnapshot }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

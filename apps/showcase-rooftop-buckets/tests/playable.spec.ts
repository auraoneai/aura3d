import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/playable.spec.ts: key
// presses are consumed per presented frame, so every assertion waits on the
// published snapshot itself rather than a wall-clock settle. The deterministic
// make is the salvaged rapier-hoop suite's own arc: free-throw spot (the
// boot spot) at its sweet power 0.60, aim pitch 0 — here reached by holding
// Space ~375 ms through the route's 1.6/s charge ramp. Browser frame timing
// jitters the exact release power, so makes are retried, never assumed.
const SWEET_HOLD_MS = 375;

test("rooftop buckets boots framed, launches, scores, advances a heat, and resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  // Boot + framed snapshot at the free-throw spot, heat 1, ball parked.
  const initial = await bucketsState(page);
  expect(initial.look.id).toBe("golden-hour");
  expect(initial.state).toBe("playing");
  expect(initial.heat).toBe(1);
  expect(initial.spot.id).toBe(2);
  expect(initial.ball.inFlight).toBe(false);
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  // HUD element is visible and carries the score line.
  const hud = page.locator("#rooftop-buckets-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Rooftop Buckets");
  await expect(hud).toContainText("Score");

  // A sweet-power hold launches the ball and the possession records a shot.
  await shootSweet(page);
  await page.waitForFunction(
    () => ((window as unknown as { __aura3dGameSnapshot?: { readonly shots?: number } }).__aura3dGameSnapshot?.shots ?? 0) >= 1,
    undefined,
    { timeout: 60_000 }
  );

  // Baskets register through the real solver + sensor: retry the same
  // deterministic arc until the salvaged scoring records a make.
  await shootUntil(page, (s) => s.makes >= 1, 10);
  const made = await bucketsState(page);
  expect(made.makes).toBeGreaterThanOrEqual(1);
  expect(made.score).toBeGreaterThan(0);

  // Heat 1 clears at 6 points (three 2-pt free throws) and the salvaged
  // loop auto-advances to heat 2 with a fresh per-heat score.
  await shootUntil(page, (s) => s.heat >= 2 || s.state === "game-over", 20);
  const advanced = await bucketsState(page);
  expect(advanced.heat).toBe(2);
  expect(advanced.state).toBe("playing");

  // R resets the whole session to heat 1.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: { readonly heat?: number; readonly score?: number } }).__aura3dGameSnapshot;
      return s?.heat === 1 && s?.score === 0;
    },
    undefined,
    { timeout: 60_000 }
  );
  const reset = await bucketsState(page);
  expect(reset.makes).toBe(0);
  expect(reset.spot.id).toBe(2);
});

// Ported from the Blockfall playable framing core: the fixed broadcast rig
// reaches `framed` at both the desktop and mobile viewports.
test("rooftop buckets stays framed at desktop and mobile viewports", async ({ page }) => {
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
    const state = await bucketsState(page);
    expect(state.framed).toBe(true);
    expect(state.drawCalls).toBeGreaterThan(0);
  }
});

type BucketsState = {
  readonly framed: boolean;
  readonly state: string;
  readonly heat: number;
  readonly score: number;
  readonly shots: number;
  readonly makes: number;
  readonly spot: { readonly id: number };
  readonly ball: { readonly inFlight: boolean };
  readonly look: { readonly id: string };
  readonly drawCalls: number;
};

async function bucketsState(page: import("@playwright/test").Page): Promise<BucketsState> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: BucketsState }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

async function shootSweet(page: import("@playwright/test").Page): Promise<void> {
  // Wait for a live possession before charging.
  await page.waitForFunction(
    () => {
      const s = (window as unknown as {
        __aura3dGameSnapshot?: { readonly state?: string; readonly ball?: { readonly inFlight?: boolean } };
      }).__aura3dGameSnapshot;
      return s?.state === "playing" && s?.ball?.inFlight === false;
    },
    undefined,
    { timeout: 60_000 }
  );
  const before = (await bucketsState(page)).shots;
  await page.keyboard.down("Space");
  await page.waitForTimeout(SWEET_HOLD_MS);
  await page.keyboard.up("Space");
  // The launch itself: the ball leaves the spot before the possession ends.
  await page.waitForFunction(
    (shotsBefore) => {
      const s = (window as unknown as {
        __aura3dGameSnapshot?: { readonly shots?: number; readonly ball?: { readonly inFlight?: boolean } };
      }).__aura3dGameSnapshot;
      return s?.ball?.inFlight === true || (s?.shots ?? 0) > shotsBefore;
    },
    before,
    { timeout: 30_000 }
  );
  await page.waitForFunction(
    (shotsBefore) => ((window as unknown as { __aura3dGameSnapshot?: { readonly shots?: number } }).__aura3dGameSnapshot?.shots ?? 0) > shotsBefore,
    before,
    { timeout: 60_000 }
  );
}

async function shootUntil(
  page: import("@playwright/test").Page,
  done: (s: BucketsState) => boolean,
  maxAttempts: number
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (done(await bucketsState(page))) return;
    await shootSweet(page);
  }
  expect(done(await bucketsState(page)), `condition not met after ${maxAttempts} sweet-power attempts`).toBe(true);
}

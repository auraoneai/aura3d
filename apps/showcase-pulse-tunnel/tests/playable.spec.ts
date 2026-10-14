import { expect, test } from "@playwright/test";

interface PulseSnapshot {
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly run: {
    readonly state: string;
    readonly sectionId: string;
    readonly beat: number;
    readonly elapsed: number;
    readonly shields: number;
    readonly passed: number;
    readonly passedOnBeat: number;
    readonly grazes: number;
    readonly collisions: number;
  };
  readonly player: {
    readonly lane: number;
    readonly x: number;
    readonly y: number;
    readonly airborne: boolean;
    readonly sliding: boolean;
  };
  readonly style: {
    readonly score: number;
    readonly multiplier: number;
    readonly distance: number;
  };
}

async function pulseState(page: import("@playwright/test").Page): Promise<PulseSnapshot> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: PulseSnapshot }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

test("pulse tunnel boots framed, starts a run, switches lanes, jumps, and R resets", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  const initial = await pulseState(page);
  expect(initial.framed).toBe(true);
  expect(initial.run.state).toBe("ready");
  expect(initial.run.shields).toBe(3);
  expect(initial.player.lane).toBe(1);

  const hud = page.locator("#pulse-tunnel-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Pulse Tunnel");

  // Start the run with Enter, then switch lanes and jump.
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: PulseSnapshot }).__aura3dGameSnapshot?.run.state === "running",
    undefined,
    { timeout: 30_000 }
  );

  await page.keyboard.press("KeyD");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: PulseSnapshot }).__aura3dGameSnapshot?.player.lane === 2,
    undefined,
    { timeout: 30_000 }
  );

  await page.keyboard.press("KeyW");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: PulseSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && (s.player.airborne || s.player.y > 0.05));
    },
    undefined,
    { timeout: 30_000 }
  );

  // R resets the run deterministically back to ready with 3 shields and center lane.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: PulseSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.run.state === "ready" && s.run.shields === 3 && s.player.lane === 1);
    },
    undefined,
    { timeout: 30_000 }
  );
});

test("pulse tunnel advances score and gates in autorun mode", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/?autorun=1");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: PulseSnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.run.state === "running" && s.style.score > 10 && s.run.passed >= 1);
    },
    undefined,
    { timeout: 60_000 }
  );
  const active = await pulseState(page);
  expect(active.run.state).toBe("running");
  expect(active.style.score).toBeGreaterThan(10);
  expect(active.run.passed).toBeGreaterThanOrEqual(1);
});

test("pulse tunnel stays framed at desktop and mobile viewports", async ({ page }) => {
  test.setTimeout(240_000);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?scene=default");
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
    await page.waitForFunction(
      () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
      undefined,
      { timeout: 60_000 }
    );
    const state = await pulseState(page);
    expect(state.framed).toBe(true);
    expect(state.run.shields).toBe(3);
  }
});

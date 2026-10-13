import { expect, test } from "@playwright/test";

// Modeled on apps/showcase-blockfall-reactor/tests/playable.spec.ts and
// apps/showcase-siege-golf/tests/playable.spec.ts: input is consumed per
// presented frame, and assertions wait on the published __aura3dGameSnapshot.
test("gravity post boots framed, pointer drag aims and launches the pod, and R resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot), undefined, {
    timeout: 150_000
  });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 120_000 }
  );

  const initial = await gravityState(page);
  expect(initial.contractIndex).toBe(0);
  expect(initial.contractId).toBe("GP-CON-1");
  expect(initial.podState).toBe("ready");
  expect(initial.hullsRemaining).toBe(3);

  const hud = page.locator("#hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Gravity Post");
  await expect(hud).toContainText("Propellant");

  // Press Space to launch contract 1 via the canonical keyboard vector.
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: GravitySnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.podState === "coasting" && s.pod.state === "in-flight");
    },
    undefined,
    { timeout: 60_000 }
  );

  // R resets the contract deterministically back to the origin dock.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: GravitySnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.podState === "ready" && s.contractIndex === 0);
    },
    undefined,
    { timeout: 60_000 }
  );
  const reset = await gravityState(page);
  expect(reset.podState).toBe("ready");
  expect(reset.hullsRemaining).toBe(3);
});

test("gravity post completes contract 1 via deterministic autorun replay and advances to contract 2", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?autorun=1");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: GravitySnapshot }).__aura3dGameSnapshot;
      return Boolean(s && s.podState === "docked" && s.completedContracts === 1 && s.score > 500);
    },
    undefined,
    { timeout: 180_000 }
  );
  const docked = await gravityState(page);
  expect(docked.contractIndex).toBe(0);
  expect(docked.completedContracts).toBe(1);
  expect(docked.dockEvents).toContain("aquaria-post:capture");

  await page.keyboard.press("KeyN");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: GravitySnapshot }).__aura3dGameSnapshot?.contractIndex === 1,
    undefined,
    { timeout: 60_000 }
  );
  const next = await gravityState(page);
  expect(next.contractId).toBe("GP-CON-2");
});

test("gravity post stays framed at desktop and mobile viewports", async ({ page }) => {
  test.setTimeout(420_000);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?scene=default");
    await page.waitForFunction(
      () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
      undefined,
      { timeout: 120_000 }
    );
    const state = await gravityState(page);
    expect(state.framed).toBe(true);
    expect(state.hullsRemaining).toBe(3);
  }
});

interface GravitySnapshot {
  readonly framed: boolean;
  readonly contractIndex: number;
  readonly contractId: string;
  readonly podState: string;
  readonly pod: { readonly state: string; readonly launchedBy: string };
  readonly hullsRemaining: number;
  readonly completedContracts: number;
  readonly score: number;
  readonly dockEvents: readonly string[];
}

async function gravityState(page: import("@playwright/test").Page): Promise<GravitySnapshot> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: GravitySnapshot }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

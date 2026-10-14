import { expect, test } from "@playwright/test";

// App playable spec for the B4-ported single-path route. Every assertion
// waits on the published `__aura3dGameSnapshot` (real salvaged sim state),
// never on wall-clock settles. Serve/flipper/drain behaviour mirrors the
// salvaged headless suite (tests/unit/apps/vault-breakers-table.test.ts):
// a charged serve enters play and an unplayed ball drains.
test("vault breakers boots framed, flips, serves, drains, and resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  // Boot: framed attract table on the rapier backend, three balls in reserve.
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );
  const initial = await vaultState(page);
  expect(initial.look.id).toBe("neon-arcade");
  expect(initial.backend).toBe("rapier");
  expect(initial.state).toBe("attract");
  expect(initial.score).toBe(0);
  expect(initial.ballsLeft).toBe(3);
  expect(initial.table.drawCalls).toBeGreaterThan(0);

  const hud = page.locator("#vault-breakers-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Vault Breakers");
  await expect(hud).toContainText("Score");

  // Flipper input registers on the salvaged FlipperController counter.
  await page.keyboard.down("KeyA");
  await page.waitForFunction(
    (before) => ((window as unknown as { __aura3dGameSnapshot?: { readonly flipperActivations?: number } }).__aura3dGameSnapshot?.flipperActivations ?? 0) > before,
    initial.flipperActivations,
    { timeout: 60_000 }
  );
  await page.keyboard.up("KeyA");

  // Hold Space to charge, release to serve: the ball enters play.
  await page.keyboard.down("Space");
  await page.waitForTimeout(900);
  await page.keyboard.up("Space");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string; readonly ball?: { readonly activeBalls?: number } } }).__aura3dGameSnapshot;
      return s?.state === "play" && (s?.ball?.activeBalls ?? 0) >= 1;
    },
    undefined,
    { timeout: 60_000 }
  );
  const served = await vaultState(page);
  expect(served.events).toEqual(expect.arrayContaining([expect.stringContaining("serve")]));

  // An unplayed ball drains: the drain counter rises and a ball is spent.
  await page.waitForFunction(
    (start) => {
      const s = (window as unknown as { __aura3dGameSnapshot?: { readonly drains?: number; readonly ballsLeft?: number; readonly state?: string } }).__aura3dGameSnapshot;
      return (s?.drains ?? 0) > start.drains || (s?.ballsLeft ?? 99) < start.ballsLeft || s?.state === "await-serve" || s?.state === "game-over";
    },
    { drains: served.drains, ballsLeft: served.ballsLeft },
    { timeout: 180_000 }
  );

  // R resets to a fresh attract table.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: { readonly state?: string; readonly score?: number; readonly ballsLeft?: number } }).__aura3dGameSnapshot;
      return s?.state === "attract" && s?.score === 0 && s?.ballsLeft === 3;
    },
    undefined,
    { timeout: 60_000 }
  );
});

test("vault breakers stays framed at desktop and mobile viewports", async ({ page }) => {
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
    const state = await vaultState(page);
    expect(state.framed).toBe(true);
    expect(state.table.drawCalls).toBeGreaterThan(0);
  }
});

async function vaultState(page: import("@playwright/test").Page): Promise<{
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly score: number;
  readonly ballsLeft: number;
  readonly drains: number;
  readonly flipperActivations: number;
  readonly bumperHits: number;
  readonly backend: string;
  readonly events: readonly string[];
  readonly look: { readonly id: string };
  readonly ball: { readonly inPlay: boolean; readonly activeBalls: number };
  readonly table: { readonly phase: string; readonly poseHash: string; readonly drawCalls: number };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __aura3dGameSnapshot?: {
        readonly framed: boolean;
        readonly state: string;
        readonly frame: number;
        readonly score: number;
        readonly ballsLeft: number;
        readonly drains: number;
        readonly flipperActivations: number;
        readonly bumperHits: number;
        readonly backend: string;
        readonly events: readonly string[];
        readonly look: { readonly id: string };
        readonly ball: { readonly inPlay: boolean; readonly activeBalls: number };
        readonly table: { readonly phase: string; readonly poseHash: string; readonly drawCalls: number };
      };
    }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

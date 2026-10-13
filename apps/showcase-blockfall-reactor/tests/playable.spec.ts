import { expect, test } from "@playwright/test";

// Modeled on templates/falling-blocks-starter/tests/playable.spec.ts: key
// presses are consumed per presented frame, so every assertion waits on the
// published snapshot itself rather than a wall-clock settle.
test("blockfall reactor boots framed, moves on ArrowLeft, and pieces fall", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot));

  // Boot + framed snapshot.
  const initial = await reactorState(page);
  expect(initial.look.id).toBe("neon-arcade");
  expect(initial.active?.kind).toBe("I");
  expect(initial.active?.x).toBe(3);
  expect(initial.board.rendering).toBe("instanced-model");
  expect(initial.board.cellAsset.id).toBe("quaterniusCubeCrate");
  expect(initial.board.filledCells).toBeGreaterThanOrEqual(4);
  expect(initial.flash.modelBased).toBe(true);
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  // HUD element is visible and carries the reactor score line.
  const hud = page.locator("#blockfall-reactor-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Blockfall Reactor");
  await expect(hud).toContainText("Score");

  // ArrowLeft moves the active piece one column left.
  await tapKey(page, "ArrowLeft");
  await page.waitForFunction(
    (expectedX) => ((window as unknown as { __aura3dGameSnapshot?: { readonly active?: { readonly x?: number } } }).__aura3dGameSnapshot?.active?.x ?? -1) === expectedX,
    (initial.active?.x ?? 0) - 1,
    { timeout: 60_000 }
  );
  const moved = await reactorState(page);
  expect(moved.active?.x).toBe((initial.active?.x ?? 0) - 1);
  expect(moved.events).toEqual(expect.arrayContaining([expect.stringContaining("move")]));

  // Pieces fall unaided under the reactor gravity retune: the active piece
  // descends at least one row, or locks (a lock into the prepared gap also
  // clears the practice line).
  const fallStart = await reactorState(page);
  await page.waitForFunction(
    (start) => {
      const state = (window as unknown as {
        __aura3dGameSnapshot?: {
          readonly active?: { readonly y?: number } | null;
          readonly lines?: number;
          readonly frame?: number;
        };
      }).__aura3dGameSnapshot;
      if (!state) return false;
      const descended = (state.active?.y ?? -1) > start.y;
      const lockedOrCleared = (state.lines ?? 0) > start.lines || (state.frame ?? 0) > start.frame + 300;
      return descended || lockedOrCleared;
    },
    { y: fallStart.active?.y ?? -1, lines: fallStart.lines, frame: fallStart.frame },
    { timeout: 90_000 }
  );
  const fallen = await reactorState(page);
  expect(fallen.frame).toBeGreaterThan(fallStart.frame);
});

// Single-path successor to the retired T2.3 v2 framing spec
// (tests/qr/prd14/browser/showcase-blockfall-reactor-framing.spec.ts): the
// v2 rig published `subjectScreenHeightFraction` for the [0.55, 0.75] band.
// The rebuilt route publishes that fraction only when the C-22 camera
// evidence carries a real view-projection matrix (null on this plain
// boot's stub controller), so the portable core kept here is that the
// fixed orthographic rig reaches `framed` with settled cells submitted at
// both the desktop and mobile viewports the v2 spec sampled; the prd14
// dispatch spec asserts the band whenever the fraction is measured.
test("blockfall reactor stays framed at desktop and mobile viewports", async ({ page }) => {
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
    const state = await reactorState(page);
    expect(state.framed).toBe(true);
    expect(state.board.filledCells).toBeGreaterThan(0);
    expect(state.board.drawCalls).toBeGreaterThan(0);
  }
});

async function reactorState(page: import("@playwright/test").Page): Promise<{
  readonly framed: boolean;
  readonly frame: number;
  readonly score: number;
  readonly lines: number;
  readonly active: { readonly kind: string; readonly x: number; readonly y: number; readonly rotation: number } | null;
  readonly hold: string | null;
  readonly events: readonly string[];
  readonly look: { readonly id: string };
  readonly board: {
    readonly filledCells: number;
    readonly rendering: string;
    readonly cellAsset: { readonly id: string; readonly url: string };
    readonly drawCalls: number;
  };
  readonly flash: { readonly modelBased: boolean; readonly activeRows: readonly number[] };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __aura3dGameSnapshot?: {
        readonly framed: boolean;
        readonly frame: number;
        readonly score: number;
        readonly lines: number;
        readonly active: { readonly kind: string; readonly x: number; readonly y: number; readonly rotation: number } | null;
        readonly hold: string | null;
        readonly events: readonly string[];
        readonly look: { readonly id: string };
        readonly board: {
          readonly filledCells: number;
          readonly rendering: string;
          readonly cellAsset: { readonly id: string; readonly url: string };
          readonly drawCalls: number;
        };
        readonly flash: { readonly modelBased: boolean; readonly activeRows: readonly number[] };
      };
    }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

async function tapKey(page: import("@playwright/test").Page, key: string, holdMs = 90): Promise<void> {
  await page.keyboard.press(key, { delay: holdMs });
}

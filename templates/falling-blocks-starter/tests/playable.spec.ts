import { expect, test } from "@playwright/test";

test("falling-blocks starter responds to keyboard input and clears a line", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: unknown }).__AURA3D_FALLING_BLOCKS_STARTER__));

  const initial = await fallingState(page);
  expect(initial.look.id).toBe("neon-arcade");
  expect(initial.active?.kind).toBe("I");
  expect(initial.active?.x).toBe(3);
  expect(initial.board.rendering).toBe("instanced-model");
  expect(initial.board.cellAsset.id).toBe("blockCell");
  expect(initial.board.filledCells).toBeGreaterThanOrEqual(4);
  expect(initial.flash.modelBased).toBe(true);

  // Key presses are consumed per presented frame; on software-GL runners a
  // frame can take seconds, so a fixed wall-clock settle can miss or race the
  // input. Tap, then wait on the published state itself.
  await tapKey(page, "ArrowRight");
  await page.waitForFunction(
    (expectedX) => ((window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly active?: { readonly x?: number } } }).__AURA3D_FALLING_BLOCKS_STARTER__?.active?.x ?? -1) === expectedX,
    (initial.active?.x ?? 0) + 1, { timeout: 60_000 });
  const moved = await fallingState(page);
  expect(moved.active?.x).toBe((initial.active?.x ?? 0) + 1);

  // Reset returns the active piece to spawn (x=3); wait on that real change
  // rather than a state that was already true before the key landed.
  await tapKey(page, "KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly active?: { readonly x?: number } } }).__AURA3D_FALLING_BLOCKS_STARTER__?.active?.x === 3,
    undefined, { timeout: 60_000 });
  await tapKey(page, "ArrowUp");
  await page.waitForFunction(
    (rotation) => ((window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly active?: { readonly rotation?: number } } }).__AURA3D_FALLING_BLOCKS_STARTER__?.active?.rotation ?? -1) !== rotation,
    initial.active?.rotation, { timeout: 60_000 });
  const rotated = await fallingState(page);
  expect(rotated.active?.rotation).not.toBe(initial.active?.rotation);

  await tapKey(page, "KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly active?: { readonly rotation?: number } } }).__AURA3D_FALLING_BLOCKS_STARTER__?.active?.rotation === 0,
    undefined, { timeout: 60_000 });
  await tapKey(page, "KeyC");
  await page.waitForFunction(
    () => (window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly hold?: string | null } }).__AURA3D_FALLING_BLOCKS_STARTER__?.hold === "I",
    undefined, { timeout: 60_000 });
  const held = await fallingState(page);
  expect(held.hold).toBe("I");
  expect(held.events).toEqual(expect.arrayContaining(["hold:I"]));

  await tapKey(page, "KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly hold?: string | null } }).__AURA3D_FALLING_BLOCKS_STARTER__?.hold === null
      || (window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly hold?: string | null } }).__AURA3D_FALLING_BLOCKS_STARTER__?.hold === undefined,
    undefined, { timeout: 60_000 });
  await tapKey(page, "Space");
  await page.waitForFunction(
    () => ((window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly lines?: number } }).__AURA3D_FALLING_BLOCKS_STARTER__?.lines ?? 0) >= 1,
    undefined, { timeout: 60_000 });
  const cleared = await fallingState(page);
  expect(cleared.lines).toBe(1);
  expect(cleared.score).toBeGreaterThanOrEqual(100);
  expect(cleared.events).toEqual(expect.arrayContaining(["hard-drop:I", "line-clear"]));

  await tapKey(page, "KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: { readonly lines?: number } }).__AURA3D_FALLING_BLOCKS_STARTER__?.lines === 0,
    undefined, { timeout: 60_000 });
  const reset = await fallingState(page);
  expect(reset.lines).toBe(0);
  expect(reset.active?.kind).toBe("I");
  expect(reset.events.some((event) => event.includes("reset"))).toBe(true);
});

async function fallingState(page: import("@playwright/test").Page): Promise<{
  readonly score: number;
  readonly lines: number;
  readonly active: { readonly kind: string; readonly x: number; readonly rotation: number } | null;
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
      readonly __AURA3D_FALLING_BLOCKS_STARTER__?: {
        readonly score: number;
        readonly lines: number;
        readonly active: { readonly kind: string; readonly x: number; readonly rotation: number } | null;
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
    }).__AURA3D_FALLING_BLOCKS_STARTER__;
    if (!state) throw new Error("Missing __AURA3D_FALLING_BLOCKS_STARTER__ state.");
    return state;
  });
}

async function tapKey(page: import("@playwright/test").Page, key: string, holdMs = 90): Promise<void> {
  await page.keyboard.press(key, { delay: holdMs });
}

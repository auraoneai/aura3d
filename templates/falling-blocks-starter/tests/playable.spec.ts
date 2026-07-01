import { expect, test } from "@playwright/test";

test("falling-blocks starter responds to keyboard input and clears a line", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: unknown }).__AURA3D_FALLING_BLOCKS_STARTER__));

  const initial = await fallingState(page);
  expect(initial.active?.kind).toBe("I");
  expect(initial.active?.x).toBe(3);
  expect(initial.lineClearProof.lines).toBe(1);
  expect(initial.lineClearProof.events).toContain("line-clear");

  await tapKey(page, "ArrowRight");
  await page.waitForTimeout(120);
  const moved = await fallingState(page);
  expect(moved.active?.x).toBe((initial.active?.x ?? 0) + 1);

  await tapKey(page, "KeyR");
  await page.waitForTimeout(120);
  await tapKey(page, "ArrowUp");
  await page.waitForTimeout(120);
  const rotated = await fallingState(page);
  expect(rotated.active?.rotation).not.toBe(initial.active?.rotation);

  await tapKey(page, "KeyR");
  await page.waitForTimeout(120);
  await tapKey(page, "KeyC");
  await page.waitForTimeout(120);
  const held = await fallingState(page);
  expect(held.hold).toBe("I");
  expect(held.events).toEqual(expect.arrayContaining(["hold:I"]));

  await tapKey(page, "KeyR");
  await page.waitForTimeout(120);
  await tapKey(page, "Space");
  await page.waitForTimeout(160);
  const cleared = await fallingState(page);
  expect(cleared.lines).toBe(1);
  expect(cleared.score).toBeGreaterThanOrEqual(100);
  expect(cleared.events).toEqual(expect.arrayContaining(["hard-drop:I", "line-clear"]));

  await tapKey(page, "KeyR");
  await page.waitForTimeout(120);
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
  readonly lineClearProof: {
    readonly lines: number;
    readonly events: readonly string[];
  };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __AURA3D_FALLING_BLOCKS_STARTER__?: {
        readonly score: number;
        readonly lines: number;
        readonly active: { readonly kind: string; readonly x: number; readonly rotation: number } | null;
        readonly hold: string | null;
        readonly events: readonly string[];
        readonly lineClearProof: {
          readonly lines: number;
          readonly events: readonly string[];
        };
      };
    }).__AURA3D_FALLING_BLOCKS_STARTER__;
    if (!state) throw new Error("Missing __AURA3D_FALLING_BLOCKS_STARTER__ state.");
    return state;
  });
}

async function tapKey(page: import("@playwright/test").Page, key: string, holdMs = 90): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

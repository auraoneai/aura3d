import { expect, test } from "@playwright/test";

// Single-path playable spec for the rebuilt Skyline Runner: drives the
// platformer kit through real keyboard input and asserts on the published
// __aura3dGameSnapshot.
test("skyline runner boots framed, moves and faces travel, jumps, and resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );

  const initial = await skylineState(page);
  expect(initial.state).toBe("playing");
  expect(initial.look.id).toBe("polar-night");
  expect(initial.character.assetId).toBe("showcaseKenneyOobiPlatformerHero");
  expect(initial.completion.completed).toBe(false);

  const hud = page.locator("#panel");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Skyline Runner");

  // Hold D to run right along the launch platform; hero faces +x (yaw +PI/2).
  const startX = initial.player.x;
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    (x) => ((window as unknown as { __aura3dGameSnapshot?: { readonly player?: { readonly x?: number } } }).__aura3dGameSnapshot?.player?.x ?? x) > x + 0.4,
    startX,
    { timeout: 60_000 }
  );
  await page.keyboard.up("KeyD");
  const moved = await skylineState(page);
  expect(moved.player.x).toBeGreaterThan(startX);
  expect(moved.player.facing).toBe(1);
  expect(moved.player.yaw).toBeCloseTo(Math.PI / 2, 2);

  // Jump rises above the grounded y coordinate.
  const groundedY = moved.player.y;
  await page.keyboard.press("Space");
  await page.waitForFunction(
    (y) => ((window as unknown as { __aura3dGameSnapshot?: { readonly player?: { readonly y?: number } } }).__aura3dGameSnapshot?.player?.y ?? y) > y + 0.15,
    groundedY,
    { timeout: 60_000 }
  );

  // Reset returns to the start uncompleted.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => ((window as unknown as { __aura3dGameSnapshot?: { readonly events?: readonly string[] } }).__aura3dGameSnapshot?.events ?? []).some((e) => e.startsWith("reset")),
    undefined,
    { timeout: 60_000 }
  );
  const reset = await skylineState(page);
  expect(reset.state).toBe("playing");
  expect(reset.completion.completed).toBe(false);
});

async function skylineState(page: import("@playwright/test").Page): Promise<{
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly score: number;
  readonly deaths: number;
  readonly player: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly grounded: boolean; readonly facing: number; readonly yaw: number };
  readonly completion: { readonly completed: boolean; readonly finalTime: number | null };
  readonly character: { readonly assetId: string; readonly clip: string; readonly locomotionState: string };
  readonly events: readonly string[];
  readonly look: { readonly id: string };
  readonly drawCalls: number;
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as { readonly __aura3dGameSnapshot?: unknown }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state as never;
  });
}

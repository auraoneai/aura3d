import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

type MiniGameState = {
  readonly score: number;
  readonly events: readonly string[];
  readonly player: {
    readonly x: number;
    readonly y: number;
  };
};

function readMiniGameState(): MiniGameState | undefined {
  return (window as unknown as { readonly __AURA3D_MINI_GAME__?: MiniGameState }).__AURA3D_MINI_GAME__;
}

test("Aura3D mini game responds to keyboard input, scoring, and reset", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");

  const initial = await page.evaluate(readMiniGameState);
  expect(initial?.player.x).toBeLessThan(0.2);

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(650);
  await page.keyboard.up("ArrowRight");

  const moved = await page.evaluate(readMiniGameState);
  expect(moved?.player.x ?? 0).toBeGreaterThan((initial?.player.x ?? 0) + 1.2);

  await page.keyboard.press("Space");
  await page.waitForTimeout(180);
  const jumped = await page.evaluate(readMiniGameState);
  expect(jumped?.player.y ?? 0).toBeGreaterThan(moved?.player.y ?? 0);

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowRight");
  const progressed = await page.evaluate(readMiniGameState);
  expect(progressed?.score ?? 0).toBeGreaterThanOrEqual(50);
  expect(progressed?.events.length ?? 0).toBeGreaterThan(0);

  await page.keyboard.press("KeyR");
  await page.waitForTimeout(120);
  const reset = await page.evaluate(readMiniGameState);
  expect(reset?.player.x ?? 99).toBeLessThan(0.3);
  expect(reset?.events.some((event) => event.includes("reset"))).toBe(true);
});

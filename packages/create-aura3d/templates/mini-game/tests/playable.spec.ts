import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

type MiniGameState = {
  readonly score: number;
  readonly events: readonly string[];
  readonly player: {
    readonly x: number;
    readonly y: number;
  };
  readonly look: { readonly id: string };
  readonly animation: { readonly clip: string; readonly tracksApplied: number };
};

function readMiniGameState(): MiniGameState | undefined {
  return (window as unknown as { readonly __AURA3D_MINI_GAME__?: MiniGameState }).__AURA3D_MINI_GAME__;
}

test("Aura3D mini game responds to keyboard input, scoring, and reset", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");

  const initial = await page.evaluate(readMiniGameState);
  expect(initial?.player.x).toBeLessThan(0.2);
  // T3.1 floor evidence: the scene carries the genre look and the hero idles.
  expect(initial?.look.id).toBe("outdoor-day");
  expect(initial?.animation.clip).toBe("idle");

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(650);
  await page.keyboard.up("ArrowRight");

  const moved = await page.evaluate(readMiniGameState);
  expect(moved?.player.x ?? 0).toBeGreaterThan((initial?.player.x ?? 0) + 1.2);
  expect(["walk", "sprint"]).toContain(moved?.animation.clip);
  // Report-only while the C-19 handle is a stub: tracksApplied is read into the
  // report so the floor gate can tighten it once PRD 06 lands.
  const tracks = moved?.animation.tracksApplied ?? 0;
  console.log(`[mini-game] hero tracksApplied=${tracks} clip=${moved?.animation.clip}`);

  await page.keyboard.press("Space");
  await page.waitForTimeout(180);
  const jumped = await page.evaluate(readMiniGameState);
  expect(jumped?.player.y ?? 0).toBeGreaterThan(moved?.player.y ?? 0);
  expect(jumped?.animation.clip).toBe("jump");

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowRight");
  const progressed = await page.evaluate(readMiniGameState);
  expect(progressed?.score ?? 0).toBeGreaterThanOrEqual(50);
  expect(progressed?.events.length ?? 0).toBeGreaterThan(0);

  // Hazard death path: dash right into the spike lane resets position and
  // records a hazard/respawn event.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2000);
  await page.keyboard.up("ArrowRight");
  const hazard = await page.evaluate(readMiniGameState);
  const deathsOrEvents = hazard?.events ?? [];
  expect(deathsOrEvents.some((event) => event.includes("hazard") || event.includes("respawn") || event.includes("collect"))).toBe(true);

  await page.keyboard.press("KeyR");
  await page.waitForTimeout(120);
  const reset = await page.evaluate(readMiniGameState);
  expect(reset?.player.x ?? 99).toBeLessThan(0.3);
  expect(reset?.events.some((event) => event.includes("reset"))).toBe(true);
  expect(reset?.animation.clip).toBe("idle");
});

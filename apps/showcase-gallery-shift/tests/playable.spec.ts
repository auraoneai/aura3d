import { expect, test, type Page } from "@playwright/test";

// Gallery Shift playable proof on the salvaged vision core. Movement uses
// real held keys; the cone/caught/exit paths use the salvaged thief's
// documented `?debug=1` teleport (thief.ts) for deterministic placement —
// the same placements the salvaged unit suites pin (guard routes from
// FLOOR_1 spawns, pedestals p1/p2, north exit).
type Snap = {
  framed: boolean;
  state: string;
  detection: number;
  score: number;
  caught: number;
  escaped: number;
  lifted: string[];
  guards: { id: string; x: number; z: number; yaw: number }[];
  thief: { x: number; z: number };
  look: { id: string };
};

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => (window as unknown as { __aura3dGameSnapshot: Snap }).__aura3dGameSnapshot);
}

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined,
    { timeout: 60_000 }
  );
}

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(
    ([tx, tz]) => (window as unknown as { __aura3dGalleryDebug: { teleport: (a: number, b: number) => void } }).__aura3dGalleryDebug.teleport(tx!, tz!),
    [x, z]
  );
}

test("gallery shift boots framed and the thief moves on held keys", async ({ page }) => {
  test.setTimeout(420_000);
  await boot(page);
  const initial = await snap(page);
  expect(initial.look.id).toBe("interior-warm");
  expect(initial.state).toBe("playing");
  expect(initial.guards).toHaveLength(2);
  expect(initial.detection).toBe(0);

  const hud = page.locator("#gallery-shift-hud");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText("Gallery Shift");

  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction(
    (startX) => ((window as unknown as { __aura3dGameSnapshot: Snap }).__aura3dGameSnapshot.thief.x) < startX - 0.3,
    initial.thief.x,
    { timeout: 30_000 }
  );
  await page.keyboard.up("ArrowLeft");
});

test("entering a guard vision cone raises detection and ends caught", async ({ page }) => {
  test.setTimeout(420_000);
  await boot(page);
  // Keep placing the thief 3 m ahead of guard-1 (real cone + raycast LOS
  // from vision.ts); detection must rise off zero, then fill to caught.
  let sawDetectionRise = false;
  await expect.poll(async () => {
    const s = await snap(page);
    if (s.detection > 0.05) sawDetectionRise = true;
    if (s.state === "caught") return "caught";
    const guard = s.guards[0]!;
    await teleport(page, guard.x + Math.sin(guard.yaw) * 3, guard.z + Math.cos(guard.yaw) * 3);
    return s.state;
  }, { timeout: 120_000, intervals: [250] }).toBe("caught");
  expect(sawDetectionRise).toBe(true);
  const caught = await snap(page);
  expect(caught.caught).toBe(1);
  expect(caught.detection).toBe(1);

  // Reset restores play with the counter kept.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot: Snap }).__aura3dGameSnapshot.state === "playing",
    undefined,
    { timeout: 30_000 }
  );
  const reset = await snap(page);
  expect(reset.detection).toBe(0);
  expect(reset.caught).toBe(1);
  expect(reset.score).toBe(0);
});

test("lift both exhibits and escape through the exit", async ({ page }) => {
  test.setTimeout(420_000);
  await boot(page);
  // p2 first: at boot guard-2 faces south at (7.5,-5.5), so the p2 lift
  // spot north of it starts outside its cone. Hold E for the 1.2 s lift.
  for (const [id, x, z, expectedScore] of [
    ["p2", 6.5, -3.3, 600],
    ["p1", -6.5, -3.3, 1000]
  ] as const) {
    await teleport(page, x, z);
    await page.keyboard.down("KeyE");
    await page.waitForFunction(
      (pedestalId) => (window as unknown as { __aura3dGameSnapshot: Snap }).__aura3dGameSnapshot.lifted.includes(pedestalId!),
      id,
      { timeout: 60_000 }
    );
    await page.keyboard.up("KeyE");
    expect((await snap(page)).score).toBe(expectedScore);
  }
  await teleport(page, 0, -6.3);
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot: Snap }).__aura3dGameSnapshot.state === "won",
    undefined,
    { timeout: 60_000 }
  );
  const won = await snap(page);
  expect(won.escaped).toBe(1);
  expect(won.lifted).toEqual(["p2", "p1"]);
});

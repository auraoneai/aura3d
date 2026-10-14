import { expect, test } from "@playwright/test";

// Single-path playable spec for the B4 Bank Shot PORT. Keeps the substance
// of the retired 16-ball Rapier browser assertions (boot on rapier with 16
// live balls, aim changes, strike moves the cue ball, shot resolves through
// the salvaged RulesEngine, reset restores a hash-identical rack) against
// the new __aura3dGameSnapshot evidence surface.
type Snap = {
  framed: boolean; frame: number; state: string; look: { id: string };
  table: { rack: number; phase: string; score: number; ballsRemaining: number; potted: number[]; shotCount: number; backend: string };
  balls: { liveCount: number; ballsPocketed: number; maxAngularSpeed: number; cue: { x: number; z: number; speed: number } | null };
  aim: { aimAngle: number; charge: number; charging: boolean };
  currentShot: { inFlight: boolean };
  lastShotRecord: { firstContact: number | null; potted: number[]; hash: string } | null;
  poseHash: string; freshRackHash: string; drawCalls: number;
};

async function snap(page: import("@playwright/test").Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot;
    if (!s) throw new Error("Missing __aura3dGameSnapshot");
    return s;
  });
}

test("bank shot boots framed on rapier, aims, strikes, resolves and resets", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scene=default");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: { framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
    undefined, { timeout: 60_000 });

  const boot = await snap(page);
  expect(boot.table.backend).toBe("rapier");
  expect(boot.balls.liveCount).toBe(16);
  expect(boot.table.ballsRemaining).toBe(15);
  expect(boot.table.rack).toBe(1);
  expect(boot.state).toBe("aiming");
  expect(boot.poseHash).toBe(boot.freshRackHash);
  const cue0 = boot.balls.cue!;
  expect(cue0).not.toBeNull();

  // Aim: holding D rotates the aim angle.
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    (a0) => Math.abs(((window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot?.aim.aimAngle ?? a0) - a0) > 0.1,
    boot.aim.aimAngle, { timeout: 60_000 });
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyA");

  // Strike: hold Space to charge, release — cue ball must move.
  await page.keyboard.down("Space");
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");
  await page.waitForFunction(
    (c0) => {
      const cue = (window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot?.balls.cue;
      return cue !== null && cue !== undefined && Math.hypot(cue.x - c0.x, cue.z - c0.z) > 0.05;
    },
    cue0, { timeout: 60_000 });

  // Shot resolves through the rules engine (by rest or the frame cap).
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot;
      return s !== undefined && !s.currentShot.inFlight && s.table.shotCount === 1 && s.lastShotRecord !== null;
    },
    undefined, { timeout: 120_000 });
  const resolved = await snap(page);
  expect(resolved.lastShotRecord?.hash).toMatch(/^[0-9a-f]{8}$/);
  expect(["aiming", "ball-in-hand", "rack-won", "rack-lost"]).toContain(resolved.state);
  expect(resolved.balls.maxAngularSpeed).toBeGreaterThan(0);

  // Reset: rack 1, 16 live balls, hash-identical fresh rack.
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot;
      return s !== undefined && s.table.rack === 1 && s.table.score === 0 && s.balls.liveCount === 16 && s.poseHash === s.freshRackHash;
    },
    undefined, { timeout: 60_000 });
});

test("bank shot scenario fixtures resolve through the real rules engine", async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto("/?scenario=pocket");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot?.table.potted.includes(1) === true,
    undefined, { timeout: 60_000 });
  const pocketed = await snap(page);
  expect(pocketed.balls.ballsPocketed).toBeGreaterThanOrEqual(1);

  await page.goto("/?scenario=foul");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: Snap }).__aura3dGameSnapshot?.state === "ball-in-hand",
    undefined, { timeout: 60_000 });

  await page.goto("/?scenario=eight-finish");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 150_000 });
  await page.waitForFunction(
    () => (window as unknown as { __aura3dGameSnapshot?: Snap & { table: Snap["table"] & { sessionComplete?: boolean } } }).__aura3dGameSnapshot?.table.rack === 3,
    undefined, { timeout: 60_000 });
});

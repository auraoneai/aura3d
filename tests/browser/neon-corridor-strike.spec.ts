import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { writeCorridorRouteHealthReceipt } from "../../examples/neon-corridor-strike/tests/route-evidence";

test.setTimeout(180_000);

interface FpsEvidence {
  readonly status: string;
  readonly claimLabel: string;
  readonly hp: number;
  readonly ammo: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly kills: number;
  readonly pickups: number;
  readonly resets: number;
  readonly pointerLockRequested: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly lookTarget?: readonly number[];
  readonly z: number;
  readonly x?: number;
  readonly y?: number;
  readonly paused?: boolean;
  readonly typedAssets: readonly string[];
  readonly primitiveCount: number;
  readonly knownLimits: readonly string[];
  readonly rendererMode: string;
  readonly rendererFallback: string;
  readonly audioUnlocked?: boolean;
  readonly audioCuesPlayed?: number;
  readonly audioPaused?: boolean;
  readonly droneActive?: boolean;
  readonly enemyVisualY?: number;
  readonly enemyBodyY?: number;
  readonly reloading?: boolean;
  readonly weaponCooldown?: number;
  readonly dryFireActive?: boolean;
}

test("neon-corridor-strike is a playable prototype FPS", async ({ page }) => {
  const server = await startExampleDevServer();
  const reports = resolve("tests/reports/neon-corridor-strike");
  mkdirSync(reports, { recursive: true });
  try {
    page.on("pageerror", (error) => {
      throw error;
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");

    const read = () => page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: FpsEvidence }).__AURA3D_FPS_EVIDENCE__);
    const initial = await read();
    expect(initial?.claimLabel).toBe("prototype");
    expect(initial?.typedAssets).toEqual(expect.arrayContaining(["neonCorridorContainmentWorld", "neonContainmentWardenA", "neonContainmentWardenB", "neonContainmentPulseRifle", "ammoCrate", "medkit"]));
    expect(initial?.knownLimits.length).toBeGreaterThan(0);
    expect(initial?.enemyBodyY).toBeCloseTo(0.72, 6);
    expect(initial?.enemyVisualY).toBeCloseTo(-0.45, 6);
    expect(initial?.enemyBodyY).not.toBe(initial?.enemyVisualY);

    const firstLoad = await page.screenshot({ fullPage: false });
    writeFileSync(resolve(reports, "first-load.png"), firstLoad);

    await page.locator("canvas").click();
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(160);
    const fired = await read();
    expect(fired?.pointerLockRequested ?? 0).toBeGreaterThanOrEqual(1);
    expect(fired?.shotsFired ?? 0).toBeGreaterThan(0);
    expect(fired?.ammo ?? 99).toBeLessThan(12);
    expect((fired?.hits ?? 0) + (fired?.kills ?? 0)).toBeGreaterThan(0);
    writeFileSync(resolve(reports, "mid-combat.png"), await page.screenshot({ fullPage: false }));

    await page.mouse.move(640, 360);
    await page.mouse.move(760, 290);
    const afterLook = await read();
    expect(Math.abs((afterLook?.yaw ?? 0) - (initial?.yaw ?? 0)) + Math.abs((afterLook?.pitch ?? 0) - (initial?.pitch ?? 0))).toBeGreaterThan(0);
    expect(afterLook?.lookTarget).not.toEqual(initial?.lookTarget);
    expect(afterLook?.lookTarget?.[1]).not.toBe(initial?.lookTarget?.[1]);

    const startZ = afterLook?.z ?? 0;
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(650);
    await page.keyboard.up("KeyS");
    const moved = await read();
    expect(Math.abs((moved?.z ?? 0) - startZ)).toBeGreaterThan(0.3);
    expect(moved?.y).toBe(initial?.y);

    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(180);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(200);
    const combat = await read();
    expect(combat?.shotsFired ?? 0).toBeGreaterThan(fired?.shotsFired ?? 0);
    writeFileSync(resolve(reports, "after-kill.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyT");
    await page.waitForTimeout(280);
    const reset = await read();
    expect(reset?.resets ?? 0).toBeGreaterThan(0);
    expect(reset?.ammo).toBe(12);
    expect(reset?.hp).toBe(100);
    expect(reset?.status).toBe("playing");
    writeFileSync(resolve(reports, "reset.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(180);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(180);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(200);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(420);
    await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyW");
    const picked = await read();
    expect(picked?.pickups ?? 0).toBeGreaterThan(0);
    writeFileSync(resolve(reports, "pickup.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2400);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    // The sprint is a fixed sim-time run; poll so a loaded host cannot fail the
    // wall-clock read before the simulation has advanced to the exit sensor.
    await expect.poll(async () => (await read())?.status, { timeout: 20_000 }).toBe("won");
    writeFileSync(resolve(reports, "win.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyT");
    await page.waitForTimeout(200);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(850);
    await page.keyboard.up("KeyW");
    // Swarm death is sim-timed (6s guard then the corridor wakes); poll until
    // the run actually resolves instead of racing a fixed wall-clock window.
    await expect.poll(async () => (await read())?.status, { timeout: 30_000 }).toBe("lost");
    writeFileSync(resolve(reports, "death.png"), await page.screenshot({ fullPage: false }));

    await page.keyboard.press("KeyT");
    await page.waitForTimeout(200);
    const afterDeathReset = await read();
    expect(afterDeathReset?.status).toBe("playing");
    expect(afterDeathReset?.hp).toBe(100);
    writeFileSync(resolve(reports, "death-reset.png"), await page.screenshot({ fullPage: false }));

    // --- World-class feel extensions: pause freeze, reload window, dry fire, audio ---
    expect(afterDeathReset?.audioUnlocked).toBe(true);
    expect(afterDeathReset?.audioCuesPlayed ?? 0).toBeGreaterThan(0);

    // Pause actually freezes the sim: player state must not drift while paused.
    await page.keyboard.press("KeyP");
    await expect.poll(async () => (await read())?.paused, { timeout: 2_000 }).toBe(true);
    const pausedAt = await read();
    expect(pausedAt?.audioPaused).toBe(true);
    expect(pausedAt?.droneActive).toBe(false);
    await page.waitForTimeout(380);
    const stillPaused = await read();
    expect(stillPaused?.paused).toBe(true);
    expect(stillPaused?.x).toBe(pausedAt?.x);
    expect(stillPaused?.y).toBe(pausedAt?.y);
    expect(stillPaused?.z).toBe(pausedAt?.z);
    expect(stillPaused?.audioCuesPlayed).toBe(pausedAt?.audioCuesPlayed);
    await page.keyboard.press("KeyP");
    await expect.poll(async () => (await read())?.paused, { timeout: 2_000 }).toBe(false);
    await expect.poll(async () => (await read())?.audioPaused, { timeout: 2_000 }).toBe(false);

    // Empty the mag, then prove the deny click and the timed reload window.
    for (let i = 0; i < 12; i += 1) {
      const ammoBeforeShot = (await read())?.ammo ?? 0;
      await page.keyboard.down("KeyJ");
      await expect.poll(async () => (await read())?.ammo, { timeout: 2_000 }).toBe(ammoBeforeShot - 1);
      await page.keyboard.up("KeyJ");
      await expect.poll(async () => (await read())?.weaponCooldown ?? 1, { timeout: 2_000 }).toBe(0);
    }
    await expect.poll(async () => (await read())?.ammo, { timeout: 2_000 }).toBe(0);
    const cuesBeforeDry = (await read())?.audioCuesPlayed ?? 0;
    await page.keyboard.press("KeyJ");
    await expect.poll(async () => (await read())?.dryFireActive, { timeout: 1_000 }).toBe(true);
    const cuesAfterDry = await read();
    expect(cuesAfterDry?.audioCuesPlayed ?? 0).toBeGreaterThan(cuesBeforeDry);

    await page.keyboard.press("KeyR");
    await expect.poll(async () => (await read())?.reloading, { timeout: 1_000 }).toBe(true);
    await expect.poll(async () => (await read())?.ammo, { timeout: 3_000 }).toBe(12);
    const reloaded = await read();
    expect(reloaded?.reserve).toBe(12);
    expect(reloaded?.reloading).toBe(false);

    const receipt = writeCorridorRouteHealthReceipt({
      reportPath: resolve(reports, "route-health.json"),
      screenshotPath: resolve(reports, "first-load.png"),
      screenshotBytes: firstLoad,
      evidence: afterDeathReset,
      routeReady: true,
      primitiveCount: afterDeathReset?.primitiveCount,
      gameplayStatus: "passed"
    });
    expect(receipt.status).toBe("ready");
    expect(receipt.pass).toBe(true);
    expect(receipt.evidence.status).toBe("captured");
    expect(receipt.evidence.screenshot.sha256).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(receipt.source.hash).toMatch(/^sha256-[a-f0-9]{64}$/);
  } finally {
    await server.close();
  }
});

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { LAMPS } from "../../examples/neon-corridor-strike/src/game/props";
import { startExampleDevServer } from "./example-dev-server";

test.setTimeout(120_000);

interface PauseEvidence {
  readonly mountId: string;
  readonly status: string;
  readonly hp: number;
  readonly ammo: number;
  readonly reserve: number;
  readonly score: number;
  readonly kills: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly pickups: number;
  readonly paused: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly objective: string;
  readonly killed: readonly string[];
  readonly collected: readonly string[];
  readonly exitReached: boolean;
  readonly shotFxVisible: boolean;
  readonly shotClock: number;
  readonly shotExpiresInMs: number;
  readonly shotAgeMs: number;
  readonly reloadClock: number;
  readonly spawnGuard: number;
  readonly weaponCooldown: number;
  readonly weaponRecoil: number;
  readonly enemyBodyPositions: readonly (readonly number[])[];
  readonly propBodyPositions: readonly (readonly number[])[];
  readonly audioCuesPlayed: number;
  readonly audioPaused: boolean;
  readonly droneActive: boolean;
  readonly propsScatteredEvents: number;
}

test("neon-corridor-strike pause freezes every gameplay domain and reset restores on the same mount", async ({ page }) => {
  const server = await startExampleDevServer();
  const reportDir = resolve("tests/reports/neon-corridor-strike-pause-reset");
  mkdirSync(reportDir, { recursive: true });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/neon-corridor-strike/`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
    const read = () => page.evaluate(() => (window as unknown as { __AURA3D_FPS_EVIDENCE__?: PauseEvidence }).__AURA3D_FPS_EVIDENCE__);
    const initial = await read();
    expect(initial).toBeDefined();

    // A gesture unlocks audio; a shot and reload establish live presentation
    // and timers before the pause boundary.
    await page.locator("canvas").click();
    await page.keyboard.press("KeyJ");
    await expect.poll(async () => (await read())?.shotFxVisible).toBe(true);
    await page.keyboard.press("KeyR");
    await expect.poll(async () => (await read())?.reloadClock ?? 0).toBeGreaterThan(0);
    await page.keyboard.press("KeyP");
    await expect.poll(async () => (await read())?.paused).toBe(true);
    const pausedAt = await read();
    expect(pausedAt).toBeDefined();
    expect(pausedAt?.audioPaused).toBe(true);
    expect(pausedAt?.droneActive).toBe(false);
    expect(pausedAt?.shotFxVisible).toBe(true);

    await page.waitForTimeout(850);
    const stillPaused = await read();
    expect(stillPaused).toBeDefined();
    const frozenKeys = [
      "hp", "ammo", "reserve", "score", "kills", "shotsFired", "hits", "pickups",
      "x", "y", "z", "yaw", "pitch", "objective", "killed", "collected", "exitReached",
      "shotFxVisible", "shotClock", "shotExpiresInMs", "shotAgeMs", "reloadClock", "spawnGuard",
      "weaponCooldown", "weaponRecoil", "enemyBodyPositions", "propBodyPositions",
      "audioCuesPlayed", "propsScatteredEvents"
    ] as const;
    for (const key of frozenKeys) expect(stillPaused?.[key], key).toEqual(pausedAt?.[key]);

    // Reset is accepted while paused and restores the authored start contract
    // without replacing the Aura app/runtime mount.
    await page.keyboard.press("KeyT");
    await expect.poll(async () => (await read())?.paused).toBe(false);
    const reset = await read();
    expect(reset?.mountId).toBe(initial?.mountId);
    expect(reset).toMatchObject({
      status: "playing",
      hp: 100,
      ammo: 12,
      reserve: 24,
      score: 0,
      kills: 0,
      shotsFired: 0,
      hits: 0,
      pickups: 0,
      x: initial?.x,
      y: initial?.y,
      z: initial?.z,
      yaw: 0,
      pitch: 0,
      objective: "Clear the corridor or reach the exit",
      killed: [],
      collected: [],
      exitReached: false,
      shotFxVisible: false,
      shotClock: 0,
      shotExpiresInMs: -1,
      shotAgeMs: -1,
      reloadClock: 0,
      weaponCooldown: 0,
      weaponRecoil: 0,
      propsScatteredEvents: 0,
      audioPaused: false
    });
    expect(reset?.enemyBodyPositions).toEqual(initial?.enemyBodyPositions);
    // Deck props re-enter their original resting poses; spring bulbs can be at
    // a different phase on the first solver frame but must return to the same
    // authored x/z anchors and bounded hang band. The source-owned lamp law
    // may relocate a practical to remain clear of a hostile lane; this gate
    // deliberately checks the current authored anchors rather than fossilizing
    // an obsolete placement literal in browser evidence.
    expect(maxPoseDelta(reset?.propBodyPositions.slice(0, 6), initial?.propBodyPositions.slice(0, 6))).toBeLessThan(0.02);
    const resetLamps = reset?.propBodyPositions.slice(6) ?? [];
    expect(resetLamps).toHaveLength(2);
    for (const [index, lamp] of resetLamps.entries()) {
      const spec = LAMPS[index];
      expect(spec, `missing authored lamp specification ${index}`).toBeDefined();
      expect(Math.abs((lamp?.[0] ?? 99) - (spec?.anchor[0] ?? 0))).toBeLessThan(0.02);
      expect(Math.abs((lamp?.[2] ?? 99) - (spec?.anchor[2] ?? 0))).toBeLessThan(0.02);
      expect(lamp[1]).toBeGreaterThan(2.1);
      expect(lamp[1]).toBeLessThan(2.58);
    }

    writeFileSync(resolve(reportDir, "pause-reset.json"), `${JSON.stringify({
      schema: "aura3d-neon-corridor-pause-reset/1.0",
      pass: true,
      initial,
      pausedAt,
      stillPaused,
      reset
    }, null, 2)}\n`);
    writeFileSync(resolve(reportDir, "reset.png"), await page.screenshot({ fullPage: false }));
  } finally {
    await server.close();
  }
});

function maxPoseDelta(
  current: readonly (readonly number[])[] | undefined,
  initial: readonly (readonly number[])[] | undefined
): number {
  if (!current || !initial || current.length !== initial.length) return Number.POSITIVE_INFINITY;
  return Math.max(0, ...current.map((pose, index) => {
    const baseline = initial[index] ?? [];
    return Math.hypot(
      (pose[0] ?? 0) - (baseline[0] ?? 0),
      (pose[1] ?? 0) - (baseline[1] ?? 0),
      (pose[2] ?? 0) - (baseline[2] ?? 0)
    );
  }));
}

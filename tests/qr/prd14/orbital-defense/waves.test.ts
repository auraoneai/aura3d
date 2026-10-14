// tests/qr/prd14/orbital-defense/waves.test.ts — §14.4 wave-rules unit test.
import { describe, expect, it } from "vitest";
import {
  createWaveState, updateWaves, shieldIds, wrapAngle, polar, playerRadius
} from "../../../../apps/showcase-orbital-defense/src/gameplay/waves";

const NO_INPUT = { rotate: 0, fire: false, shield: false } as const;

function simulate(seconds: number, actions = NO_INPUT): ReturnType<typeof createWaveState> {
  const state = createWaveState();
  const steps = Math.round(seconds / 0.016);
  for (let i = 0; i < steps; i += 1) updateWaves(state, 0.016, actions);
  return state;
}

describe("orbital waves rules (§14.4)", () => {
  it("spawns on the ~1.8 s base cadence at wave 1", () => {
    const state = createWaveState();
    let t = 0;
    // Five enemies start active and the timer first fills the 6th slot
    // immediately (spawnTimer starts 0); the cadence governs the next
    // spawn: 1.8 − 1·0.11 ≈ 1.69 s to reach 7 active.
    while (state.enemies.filter((e) => e.active).length < 7 && t < 5) {
      updateWaves(state, 0.016, NO_INPUT);
      t += 0.016;
    }
    expect(t).toBeGreaterThan(1.5);
    expect(t).toBeLessThan(1.85);
  });

  it("cadence shortens as the wave climbs but never under 0.72 s", () => {
    const state = createWaveState();
    state.score = 450 * 10; // wave 11 → 1.8 − 1.21 = 0.59 → clamps 0.72
    updateWaves(state, 0.8, NO_INPUT); // burn the first timer
    expect(state.spawnTimer).toBeGreaterThanOrEqual(0.72 - 0.016);
  });

  it("exposes 5 shield segment ids", () => {
    expect(shieldIds).toHaveLength(5);
  });

  it("shield pulse damages enemies within 0.32 rad and radius < 3.25", () => {
    const state = createWaveState();
    const enemy = state.enemies[0]!;
    enemy.active = true;
    enemy.angle = state.player.angle + 0.05;
    enemy.radius = 3.1;
    state.player.shieldPulses.push({ angle: state.player.angle, ttl: 1.2 });
    updateWaves(state, 0.016, NO_INPUT);
    expect(enemy.active).toBe(false);
    expect(state.score).toBeGreaterThan(0);
  });

  it("enemy reaching radius ≤ 1.2 costs planet integrity", () => {
    const state = createWaveState();
    const enemy = state.enemies[0]!;
    enemy.active = true;
    enemy.radius = 1.2;
    enemy.speed = 0;
    const before = state.planetIntegrity;
    updateWaves(state, 0.016, NO_INPUT);
    expect(state.planetIntegrity).toBeLessThan(before);
  });

  it("wrapAngle folds into [-π, π)", () => {
    for (const a of [0.3, 1.7, -2.2, 0]) {
      expect(Math.abs(wrapAngle(a + Math.PI * 2) - wrapAngle(a))).toBeLessThan(1e-9);
    }
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(wrapAngle(-Math.PI * 5))).toBeLessThanOrEqual(Math.PI);
  });

  it("polar places the player ring at radius 2.65 in the orbit plane", () => {
    const [x, y, z] = polar(0, playerRadius, 0);
    expect(Math.hypot(x, y)).toBeCloseTo(2.65, 5);
    expect(z).toBe(0);
  });
});

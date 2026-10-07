// src/v2/scenarios/index.ts — ?scenario= fixtures (state only, T2.1).
import type { WaveState } from "../../gameplay/waves";

export const ORBITAL_SCENARIOS = ["wave-4", "shield-save", "low-integrity"] as const;
export type OrbitalScenario = (typeof ORBITAL_SCENARIOS)[number];

/** Apply a named scenario fixture to the live wave state. */
export function applyOrbitalScenario(name: string, state: WaveState): boolean {
  switch (name) {
    case "wave-4":
      state.score = 1400;
      state.wave = 4;
      for (const e of state.enemies) {
        e.active = true;
        e.health = 2;
        e.radius = 4.3 + e.lane * 0.22;
      }
      break;
    case "shield-save":
      state.player.heat = 30;
      state.player.shieldCooldown = 0;
      state.player.shieldPulses = [{ angle: state.player.angle, ttl: 1.2 }];
      for (const e of state.enemies.slice(0, 4)) {
        e.active = true;
        e.angle = state.player.angle + 0.05;
        e.radius = 3.1;
      }
      break;
    case "low-integrity":
      state.planetIntegrity = 24;
      for (const e of state.enemies.slice(0, 3)) {
        e.active = true;
        e.radius = 1.4;
      }
      break;
    default:
      return false;
  }
  (window as unknown as Record<string, unknown>).__ORBITAL_DEFENSE_SCENARIO__ = name;
  return true;
}

// apps/showcase-patrol-wing/src/v2/scenarios/index.ts — §7.2.1 scenarios.
// `?scenario=` presets drive REAL game paths only — the same takeoff,
// ring-run and combat-leg inputs the player/autopilot sends — never pose
// teleports or forged state, so captured frames equal playable frames.
export const PATROL_SCENARIOS = ["ring-run", "drone-hit", "low-hull"] as const;
export type PatrolScenario = (typeof PATROL_SCENARIOS)[number];

export interface PatrolScenarioActions {
  /** Real takeoff: full throttle until airborne, then settle at cruise. */
  launchSortie: () => void;
  /** Spawn the wave-0 intercept wedge through the real trigger path. */
  spawnWaveLeg: () => void;
  /** Fire the cannon once through the real tryFire path. */
  fireOnce: () => void;
  /** Set hull through the real damage path (positive = damage). */
  applyHullDamage: (fraction: number) => void;
}

export function applyPatrolScenario(name: string, actions: PatrolScenarioActions): boolean {
  switch (name) {
    case "ring-run":
      actions.launchSortie();
      return true;
    case "drone-hit":
      actions.launchSortie();
      actions.spawnWaveLeg();
      actions.fireOnce();
      return true;
    case "low-hull":
      actions.launchSortie();
      actions.applyHullDamage(0.82);
      return true;
    default:
      return false;
  }
}

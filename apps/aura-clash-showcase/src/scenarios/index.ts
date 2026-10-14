// apps/aura-clash-showcase/src/v2/scenarios/index.ts — ?scenario= fixtures.
// State-only setups (T2.1: scenarios set state, never read ?capture=).
export const AURA_CLASH_SCENARIOS = ["mid-round", "final-round", "ko"] as const;
export type AuraClashScenario = (typeof AURA_CLASH_SCENARIOS)[number];

export interface AuraClashScenarioTargets {
  /** Patch fighter health/meter via combat.setActor. */
  readonly setActor: (id: string, patch: { health?: number; meter?: number }) => void;
  /** Position the kinematic bodies directly. */
  readonly placeFighter: (id: "p1" | "p2", x: number) => void;
  readonly setRound: (round: number, timeLeft: number) => void;
}

/** Apply a named scenario fixture; returns true when recognised. */
export function applyAuraClashScenario(
  name: string,
  targets: AuraClashScenarioTargets
): boolean {
  switch (name) {
    case "mid-round":
      targets.setActor("p1", { health: 62, meter: 0.45 });
      targets.setActor("p2", { health: 78, meter: 0.2 });
      targets.placeFighter("p1", -0.6);
      targets.placeFighter("p2", 0.9);
      targets.setRound(1, 41);
      break;
    case "final-round":
      targets.setActor("p1", { health: 30, meter: 0.9 });
      targets.setActor("p2", { health: 44, meter: 0.6 });
      targets.placeFighter("p1", -1.1);
      targets.placeFighter("p2", 1.1);
      targets.setRound(3, 22);
      break;
    case "ko":
      targets.setActor("p2", { health: 1, meter: 0 });
      targets.placeFighter("p1", -0.4);
      targets.placeFighter("p2", 0.7);
      targets.setRound(2, 9);
      break;
    default:
      return false;
  }
  (window as unknown as Record<string, unknown>).__AURA_CLASH_SCENARIO__ = name;
  return true;
}

// apps/showcase-siege-golf/src/v2/scenarios/index.ts — ?scenario= hooks (T2.6).
// Each scenario reaches its state through the real hole-loading + canonical
// solution paths — no DOM or renderer pokes.
export interface SiegeScenarioHooks {
  readonly loadHole: (index: number) => void;
  readonly enableAutoplay: () => void;
}

export const SIEGE_SCENARIOS = ["finale", "charged", "tower"] as const;
export type SiegeScenario = (typeof SIEGE_SCENARIOS)[number];

export function applySiegeScenario(name: string | null, hooks: SiegeScenarioHooks): SiegeScenario | null {
  if (!name) return null;
  switch (name as SiegeScenario) {
    case "finale":
      hooks.loadHole(8);
      return "finale";
    case "tower":
      hooks.loadHole(6);
      return "tower";
    case "charged":
      // Autoplay strikes immediately at the canonical power — the capture
      // reads a mid-charge meter frame.
      hooks.enableAutoplay();
      return "charged";
    default:
      return null;
  }
}

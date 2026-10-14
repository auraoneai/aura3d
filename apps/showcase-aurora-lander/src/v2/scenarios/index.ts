// apps/showcase-aurora-lander/src/v2/scenarios/index.ts — ?scenario= hooks (T2.6).
// Each scenario reaches its state through the real site-loading / autopilot
// paths — no DOM or renderer pokes.
export interface AuroraScenarioHooks {
  readonly loadSite: (index: number) => void;
  /** Spawn the lander close above the pad (the human-playable approach). */
  readonly enableApproachSpawn: () => void;
  /** Turn on the deterministic descent autopilot. */
  readonly enableAutopilot: () => void;
}

export const AURORA_SCENARIOS = ["ridgeline", "storm", "touchdown"] as const;
export type AuroraScenario = (typeof AURORA_SCENARIOS)[number];

export function applyAuroraScenario(name: string | null, hooks: AuroraScenarioHooks): AuroraScenario | null {
  if (!name) return null;
  switch (name as AuroraScenario) {
    case "ridgeline":
      // Site 3: narrow pad, storm gusts, dense whiteout.
      hooks.loadSite(2);
      return "ridgeline";
    case "storm":
      // Site 2: telegraphed storm fronts over the canyon shelf.
      hooks.loadSite(1);
      return "storm";
    case "touchdown":
      // Close approach + autopilot — grades a real landing inside ~20 s so
      // lander.touchdown flips to "landed" with the pad in frame.
      hooks.enableApproachSpawn();
      hooks.enableAutopilot();
      hooks.loadSite(0);
      return "touchdown";
    default:
      return null;
  }
}

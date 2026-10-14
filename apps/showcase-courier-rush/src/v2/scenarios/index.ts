// apps/showcase-courier-rush/src/v2/scenarios/index.ts — deterministic
// fixtures (T2.1). Scenarios set state only — they enable the autopilot or
// step the real traffic/collision modules — no ?capture= reads, no DOM/HTML,
// no renderer pokes. `?scenario=<name>` selects one at boot; the same state
// is reachable from the play URL, so appliedLook stays identical.
export const COURIER_SCENARIOS = ["autopilot", "traffic", "strike"] as const;
export type CourierScenario = (typeof COURIER_SCENARIOS)[number];

export interface CourierScenarioContext {
  /** Turn the diagnostic autopilot on (drives the real dispatch loop). */
  readonly enableAutopilot: () => void;
  /** Advance the seeded traffic sim `frames` fixed steps (real module step). */
  readonly warmTraffic: (frames: number) => void;
  /** Place the van overlapping a lamp-pole collider so the next step fires a real strike. */
  readonly overlapStrikeCollider: () => void;
  readonly sync: () => void;
}

export function applyCourierScenario(name: string, ctx: CourierScenarioContext): CourierScenario | undefined {
  if (!COURIER_SCENARIOS.includes(name as CourierScenario)) return undefined;
  if (name === "autopilot") {
    ctx.enableAutopilot();
  } else if (name === "traffic") {
    ctx.warmTraffic(600);
  } else {
    ctx.overlapStrikeCollider();
  }
  ctx.sync();
  return name as CourierScenario;
}

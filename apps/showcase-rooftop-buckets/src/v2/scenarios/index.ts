// apps/showcase-rooftop-buckets/src/v2/scenarios/index.ts — deterministic
// fixtures (T2.1). Scenarios set state only: they release a shot through the
// real charge/launch/record path at fixed power+pitch — no ?capture= reads,
// no DOM/HTML, no renderer pokes. `?scenario=<name>` selects one at boot; the
// same state is reachable from the play URL, so appliedLook stays identical.
export const ROOFTOP_SCENARIOS = ["charged", "made", "brick"] as const;
export type RooftopScenario = (typeof ROOFTOP_SCENARIOS)[number];

export interface RooftopScenarioContext {
  /** Release at (power, pitch) through the real shot path. */
  readonly releaseAt: (power: number, pitch: number) => boolean;
  /** Charge to `p` on the real meter (no release). */
  readonly chargeTo: (p: number) => void;
  readonly sync: () => void;
}

export function applyRooftopScenario(name: string, ctx: RooftopScenarioContext): RooftopScenario | undefined {
  if (!ROOFTOP_SCENARIOS.includes(name as RooftopScenario)) return undefined;
  if (name === "charged") {
    ctx.chargeTo(0.7);
  } else if (name === "made") {
    // Free-throw sweet spot: the authored launch solver at sweetPower + neutral
    // pitch lands in the basket on the canonical rim collider.
    if (!ctx.releaseAt(0.6, 0)) throw new Error("rooftop v2 scenario could not release");
  } else {
    // 'brick': deliberate under-power flat shot — misses, stays a real flight.
    if (!ctx.releaseAt(0.3, -0.4)) throw new Error("rooftop v2 scenario could not release");
  }
  ctx.sync();
  return name as RooftopScenario;
}

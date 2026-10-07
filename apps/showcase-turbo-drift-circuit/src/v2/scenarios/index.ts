// apps/showcase-turbo-drift-circuit/src/v2/scenarios/index.ts — T2.1/T2.6.
// Deterministic scenario fixtures: `?scenario=<name>` sets SIM STATE ONLY
// (no ?capture= reads, no input replay). The T2.6 spec asserts appliedLook
// parity between the play URL and every scenario URL.
import type { GameRacingKit } from "@aura3d/engine";

export const TURBO_DRIFT_SCENARIOS = ["mid-race", "finish", "off-track"] as const;
export type TurboDriftScenario = typeof TURBO_DRIFT_SCENARIOS[number];

export interface TurboDriftScenarioContext {
  readonly racing: GameRacingKit;
  readonly opponent: {
    placeAtProgress(progress: number, offset?: number): unknown;
  };
}

/**
 * Apply a named fixture. `mid-race` places the hero deep into the lap at
 * speed so framing evidence has a live subject; `off-track` offsets the car
 * off the asphalt edge; `finish` places the car just short of the line.
 */
export function applyTurboDriftScenario(
  name: string,
  ctx: TurboDriftScenarioContext
): TurboDriftScenario | undefined {
  if (!(TURBO_DRIFT_SCENARIOS as readonly string[]).includes(name)) return undefined;
  switch (name as TurboDriftScenario) {
    case "mid-race":
      ctx.racing.placeAtProgress(0.62, 0);
      ctx.opponent.placeAtProgress(0.58, 0);
      break;
    case "off-track":
      ctx.racing.placeAtProgress(0.35, 0.95);
      break;
    case "finish":
      ctx.racing.placeAtProgress(0.985, 0);
      break;
  }
  return name as TurboDriftScenario;
}

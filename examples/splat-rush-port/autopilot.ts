/**
 * Closed-loop steering for the port (`?autopilot=1` and the browser spec): the same decision rule as the capture
 * tool's `steerPolicy` (tools/crayon-capture/splat-rush-lib.ts), reading the simulation instead of the page.
 * `tests/unit/splat-rush-port/policy-parity.test.ts` proves both choose the same dx for the same view.
 */
import { CONFIG, type Input, type SplatRushSim } from "./sim";

export interface AutopilotParams {
  maxDx: number;
  mistakeRows: readonly number[];
  aimOffset: number;
}
export const DEFAULT_AUTOPILOT: AutopilotParams = { maxDx: 14, mistakeRows: [], aimOffset: 0 };

export function steerDx(sim: SplatRushSim, params: AutopilotParams, rowsPassed: number): number {
  const o = sim.o;
  if (o.phase !== "playing") return 0;
  let row: typeof sim.gates = [];
  let bestZ = -Infinity;
  for (const g of sim.gates) {
    if (g.passed || g.z > 1) continue;
    if (g.z > bestZ + 1e-6) { bestZ = g.z; row = [g]; } else if (Math.abs(g.z - bestZ) <= 1e-6) row.push(g);
  }
  if (row.length === 0) return 0;
  let target = sim.ye;
  const matching = row.find((g) => g.colorIndex === o.playerColorIndex);
  const wrong = row.find((g) => g.colorIndex !== o.playerColorIndex);
  if (params.mistakeRows.indexOf(rowsPassed) >= 0 && wrong && !o.isRainbowActive) target = wrong.laneX;
  else if (o.isRainbowActive) {
    let best = row[0] as (typeof row)[number];
    for (const g of row) if (Math.abs(g.laneX - o.laneOffset) < Math.abs(best.laneX - o.laneOffset)) best = g;
    target = best.laneX;
  } else if (matching) target = matching.laneX + params.aimOffset;
  const gain = 0.012 * (CONFIG.STEER_SPEED / 6);
  return Math.round(Math.max(-params.maxDx, Math.min(params.maxDx, (target - sim.ye) / gain)));
}

/** Stateful driver: tracks the number of gate rows passed (rows whose gates all flipped to passed). */
export class Autopilot {
  private rows = 0;
  private seen = new Set<Gate>();
  constructor(readonly params: AutopilotParams = DEFAULT_AUTOPILOT) {}
  next(sim: SplatRushSim, stepIndex: number): Input {
    if (stepIndex === 0) return { start: true, down: false, up: false, dx: 0 };
    if (stepIndex === 1) return { start: false, down: true, up: false, dx: 0 };
    return { start: false, down: false, up: false, dx: steerDx(sim, this.params, this.rows) };
  }
  /** Call after each advance so row counting matches the capture harness (a frame in which any gate newly passed). */
  observe(sim: SplatRushSim): void {
    let fresh = false;
    for (const g of sim.gates) if (g.passed && !this.seen.has(g)) { this.seen.add(g); fresh = true; }
    if (fresh) this.rows++;
    if (this.seen.size > 256) for (const g of this.seen) if (!sim.gates.includes(g)) this.seen.delete(g);
  }
  get rowsPassed(): number { return this.rows; }
}
type Gate = SplatRushSim["gates"][number];

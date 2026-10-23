// Closed-loop controller used to produce the recorded reference input script (state in, RunInput out).
// It only reads the run state, so the same policy can drive the original game (through its
// `window.skybreakDemo.input(state)` hook) and this port; the recorded per-step inputs are then replayed open-loop.

import type { Run, RunInput } from "./sim.js";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** Steering is quantised so a recorded run-length script reproduces the closed-loop run bit-for-bit. */
export const STEER_QUANTUM = 1 / 32;
export const quantizeSteer = (x: number): number => Math.round(clamp(x, -1, 1) / STEER_QUANTUM) * STEER_QUANTUM;

export interface AutopilotParams {
  laneGain: number; yawGain: number; lookahead: number; boostBefore: number; boostAfter: number;
  nitroWindow: number; brakeSpeed: number;
}

export const DEFAULT_PARAMS: AutopilotParams = {
  laneGain: 0.35, yawGain: 2.2, lookahead: 90, boostBefore: 28, boostAfter: 8, nitroWindow: 0, brakeSpeed: 0
};

const LANES = [-7, -5.25, -3, 0, 3, 5.25, 7];

function chooseLane(run: Run, p: AutopilotParams): number {
  let best = 0;
  let bestCost = Infinity;
  for (const lane of LANES) {
    if (Math.abs(lane) > run.level.width - 2) continue;
    let cost = Math.abs(lane - run.l) * 0.5 + Math.abs(lane) * 0.2;
    for (const car of run.traffic) {
      const ahead = car.s - run.s;
      if (ahead < -6 || ahead > p.lookahead) continue;
      if (Math.abs(car.l - lane) < car.halfWid + 1.9) cost += 1000 / (Math.max(0, ahead) + 5);
    }
    if (cost < bestCost) { bestCost = cost; best = lane; }
  }
  return best;
}

/** True while the car should hold thrust: through ramps/gaps and kicker lineups so it clears them. */
function wantsThrust(run: Run, p: AutopilotParams): boolean {
  const level = run.level;
  for (const [a, b] of level.ramps) if (run.s > a - 6 && run.s < b + 4) return true;
  for (const [a, b] of level.gaps) if (run.s > a - 30 && run.s < b + 6 && !run.grounded) return true;
  for (const lineup of level.lineups) {
    const k = lineup.kicker;
    if (run.s > k.s - p.boostBefore && run.s < k.s + k.len + p.boostAfter) return true;
  }
  return !run.grounded && run.vy < 3 && run.h < 2.5;
}

export function autopilot(run: Run, p: AutopilotParams = DEFAULT_PARAMS): RunInput {
  const lane = chooseLane(run, p);
  const steer = run.grounded ? quantizeSteer((lane - run.l) * p.laneGain - run.theta * p.yawGain) : 0;
  return { throttle: 1, brake: 0, steer, thrust: wantsThrust(run, p), drift: false, nitro: false, roll: 0, spin: 0, flip: 0, recover: false };
}

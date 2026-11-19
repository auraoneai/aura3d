/**
 * Autoplay (`?autoplay=1`, alias `?autopilot=1`, toggled in play with O): the computer runs the Snake Way through the
 * game's normal input path. Every few steps it looks ahead by rolling copies of the pure sim forward with each
 * candidate tap (stay, lane left, lane right, jump, slide) and keeps the one that loses the fewest days, never falls and
 * banks the most spark and score; it surges through the Drowse. The rollouts copy the state, so the live run only ever sees ordinary key taps and
 * normal play stays deterministic. At the tail it takes the leap.
 */
import { roadGapAt, stepRun, STEP, type RunInput, type RunState } from "./sim";

/** Steps between decisions (a human-like ~10 taps per second at most). */
export const AUTOPLAY_DECIDE_STEPS = 6;
/** Look-ahead per candidate (s). */
export const AUTOPLAY_HORIZON = 1.1;

const CANDIDATES: readonly (readonly string[])[] = [[], ["ArrowLeft"], ["ArrowRight"], ["Space"], ["ArrowDown"]];
const NONE: RunInput = {};

const clone = (S: RunState): RunState => structuredClone(S) as RunState;

/** In a rollout, a reflex jump when a gap opens just ahead (the plan only chooses the first tap). */
function reflex(S: RunState): RunInput {
  if (!S.grounded || S.puff > 0) return NONE;
  const lead = Math.max(2, S.speed * 0.12);
  for (let d = 1; d <= lead; d += 1) if (roadGapAt(S.s + d)) return { taps: ["Space"] };
  return NONE;
}

function value(start: RunState, end: RunState): number {
  if (end.phase !== "run" && end.phase !== "leap") return -1e9;
  const daysLost = start.days - end.days;
  return -daysLost * 1000 - (end.stumble > 0 ? 400 : 0) + (end.score - start.score) + end.ki * 300 + (end.s - start.s) * 0.5;
}

/** Scores one candidate tap by rolling a copy of the run forward. */
export function rollout(S: RunState, taps: readonly string[], horizon = AUTOPLAY_HORIZON): number {
  const R = clone(S);
  const steps = Math.round(horizon / STEP);
  stepRun(R, taps.length ? { taps } : NONE, STEP);
  for (let i = 1; i < steps && R.phase === "run" && !R.atEnd; i++) stepRun(R, reflex(R), STEP);
  return value(S, R);
}

export interface Autoplay {
  /** Input for the next fixed step of the live run. */
  next(S: RunState): RunInput;
  reset(): void;
}

export function createAutoplay(): Autoplay {
  let wait = 0;
  return {
    reset() { wait = 0; },
    next(S) {
      if (S.phase !== "run") return NONE;
      if (S.atEnd) return S.endT > 0.8 ? { taps: ["Space"] } : NONE;
      if (S.puff > 0) return NONE; // the flight carries itself and lands back in a lane
      if (wait > 0) { wait--; return reflex(S); }
      wait = AUTOPLAY_DECIDE_STEPS - 1;
      let best = 0, bestV = -Infinity;
      CANDIDATES.forEach((taps, i) => {
        // small bias to staying put so the runner does not weave for nothing
        const v = rollout(S, taps) - (i === 0 ? 0 : 25);
        if (v > bestV) { bestV = v; best = i; }
      });
      // surge (Shift latches it): only through the Drowse, where only
      // speed gets the runner out before he falls asleep
      const wantSurge = S.drowse > 0.02;
      const taps = wantSurge !== S.auraLatch ? [...CANDIDATES[best]!, "ShiftLeft"] : CANDIDATES[best]!;
      return taps.length ? { taps } : reflex(S);
    }
  };
}

/** `?autoplay=1` or the legacy `?autopilot=1` (without a `?script=` replay). */
export function autoplayRequested(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.get("autoplay") === "1" || (p.get("autopilot") === "1" && !p.get("script"));
}

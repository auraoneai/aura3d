// Turn-taking (PRD 04 B03, PRD 03 section 3 TURN_TIMEOUT): a calm wait for
// the child or the caregiver.
//
// Pure and deterministic: time only advances through tick(dtMs). There is no
// "wrong answer" branch and no failure state. A wait ends with a tap, a
// parent confirm, or by itself when the time runs out; all three are equally
// good endings. A wait is always finite: an invalid or endless wait falls
// back to the default, and very long waits are capped.

export type TurnSource = "tap" | "parent";
export type TurnResolution = TurnSource | "timeout";

export interface TurnState {
  readonly active: boolean;
  readonly waitedMs: number;
  readonly resolvedBy: TurnResolution | null;
}

export interface TurnTaking {
  /** Begin (or restart) the wait. A wait of 0 ms ends at once by timeout. */
  start(): void;
  /** Advance the wait. Returns the resolution if the wait ended during this tick. */
  tick(dtMs: number): TurnResolution | null;
  /** Child tap or parent confirm. Returns true only if it ended an active wait. */
  respond(source: TurnSource): boolean;
  /** Stop waiting without a resolution (skip, all done, dispose). */
  cancel(): void;
  /** Time left before the wait ends by itself (0 when inactive). */
  remainingMs(): number;
  state(): TurnState;
}

/** The PRD's 4-6 s proposal; content and the parent setting may override it. */
export const DEFAULT_WAIT_MS = 5000;

/** Upper bound for any single wait, so silence always completes in a calm, short time. */
export const MAX_WAIT_MS = 30000;

/** Float tolerance so summed tick steps always reach the deadline. */
const EPSILON_MS = 1e-6;

/** Finite wait in 0..MAX_WAIT_MS; undefined, NaN or Infinity give the default. */
export function normalizeWaitMs(waitMs?: number): number {
  if (waitMs === undefined || !Number.isFinite(waitMs)) return DEFAULT_WAIT_MS;
  return Math.min(MAX_WAIT_MS, Math.max(0, waitMs));
}

export function createTurnTaking(waitMs: number = DEFAULT_WAIT_MS): TurnTaking {
  const limit = normalizeWaitMs(waitMs);
  let active = false;
  let waitedMs = 0;
  let resolvedBy: TurnResolution | null = null;

  function expire(): TurnResolution {
    active = false;
    waitedMs = limit;
    resolvedBy = "timeout";
    return "timeout";
  }

  return {
    start() {
      active = true;
      waitedMs = 0;
      resolvedBy = null;
      if (limit <= 0) expire();
    },
    tick(dtMs) {
      if (!active || !Number.isFinite(dtMs) || dtMs <= 0) return null;
      waitedMs += dtMs;
      if (waitedMs >= limit - EPSILON_MS) return expire();
      return null;
    },
    respond(source) {
      if (!active) return false;
      active = false;
      resolvedBy = source;
      return true;
    },
    cancel() {
      active = false;
    },
    remainingMs() {
      return active ? Math.max(0, limit - waitedMs) : 0;
    },
    state() {
      return { active, waitedMs, resolvedBy };
    }
  };
}

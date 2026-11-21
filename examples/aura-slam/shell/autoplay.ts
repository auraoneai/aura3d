import { createAutoplayHarness } from "@aura3d/engine/game";
import { MENU_COURTS } from "../ui/venues";

/**
 * Hands-free autoplay (owner addendum, 2026-11-18): `?autoplay=1` (standard), `?autopilot=1` (alias) and the original `?demo=1`
 * turn on the Auto demo player (shell/controller.ts) for the player side; the CPU keeps the other side. This module only
 * decides when the shell leaves the results card. It never touches the simulation: the next match goes through the menu's
 * normal Quick Match path (`menu.quickStart`), so autoplay cannot change sim results.
 */
/** The flag names and reader are the shared ones in `@aura3d/engine/game`. */
export { AUTOPLAY_FLAG_NAMES as AUTOPLAY_PARAMS, readAutoplayFlag as autoplayRequested } from "@aura3d/engine/game";

/** In-match toggle (P is pause and F fullscreen here). Only used while no keyboard action is bound to it. */
export const AUTOPLAY_TOGGLE_KEY = "KeyO";

/** How long the results card stays up before autoplay starts the next match. */
export const AUTOPLAY_RESULT_SECONDS = 3;

/** Venue tour order: the menu's courts (New York, London, Paris, then the destination arenas). */
export const AUTOPLAY_VENUES: readonly string[] = Object.freeze(MENU_COURTS.map((court) => court.venue));

export function nextAutoplayVenue(current: string | undefined, order: readonly string[] = AUTOPLAY_VENUES): string {
  if (order.length === 0) return current ?? "hard";
  const index = current === undefined ? -1 : order.indexOf(current);
  return order[(index + 1) % order.length]!;
}

export interface AutoplayNext { venue: string }

export interface AutoplayLoop {
  /** Seconds the current results card has been shown under autoplay. */
  readonly resultSeconds: number;
  /**
   * One fixed step. Returns the next match to start once the results card has been up for `resultSeconds` with autoplay
   * on; otherwise null. Turning autoplay off, or any mode other than `gameover`, resets the countdown.
   */
  step(state: { mode: string; venue?: string }, dt: number, enabled: boolean): AutoplayNext | null;
  reset(): void;
}

export function createAutoplayLoop(options: { resultSeconds?: number; venues?: readonly string[] } = {}): AutoplayLoop {
  const hold = options.resultSeconds ?? AUTOPLAY_RESULT_SECONDS;
  const venues = options.venues ?? AUTOPLAY_VENUES;
  let finished = false;
  let currentVenue: string | undefined;
  let nextMatch: AutoplayNext | null = null;
  const harness = createAutoplayHarness({
    isFinished: () => finished,
    restartDelay: hold,
    onRestart: () => {
      nextMatch = { venue: nextAutoplayVenue(currentVenue, venues) };
    }
  });
  return {
    get resultSeconds() { return harness.holdSeconds; },
    step(state, dt, enabled) {
      harness.enabled = enabled;
      finished = state.mode === "gameover";
      currentVenue = state.venue;
      nextMatch = null;
      harness.tick(dt);
      return nextMatch;
    },
    reset() { harness.reset(); }
  };
}

// Aura FC 3D — hands-free autoplay (`?autoplay=1`, alias `?autopilot=1`, legacy `?demo=1`).
//
// The computer plays both sides through the normal sim (CPU v CPU, the same AI and command path as every match), the
// full-time result holds on screen for AUTOPLAY_RESULT_HOLD_S, then the next fixture kicks off at the next venue, for
// ever. DOM-free so the loop is unit-tested against the real sim; modes.ts drives it from its frame tick.

import type { MatchConfig, VenueId } from "./types";
import { CLUB_ORDER, VENUE_ORDER } from "./content";

/** Seconds the full-time result stays up before the next autoplay fixture kicks off. */
export const AUTOPLAY_RESULT_HOLD_S = 3;

/** True for `?autoplay=1`, `?autopilot=1` (alias) or the older `?demo=1`. */
export function autoplayRequested(params: { get(name: string): string | null }): boolean {
  return params.get("autoplay") === "1" || params.get("autopilot") === "1" || params.get("demo") === "1";
}

/** The venue after `v` in the venue rotation (wraps). */
export function nextAutoplayVenue(v: VenueId): VenueId {
  const i = VENUE_ORDER.indexOf(v);
  return VENUE_ORDER[(i + 1) % VENUE_ORDER.length]!;
}

/** A CPU v CPU fixture: two club draws from the seeded mode RNG (the same draws the Demo button has always made). */
export function demoMatchConfig(rand: () => number, venue: VenueId): MatchConfig {
  const h = CLUB_ORDER[(rand() * 8) | 0]!;
  const a = CLUB_ORDER[(rand() * 8) | 0]!;
  return {
    mode: "quick", venue, homeClub: h, awayClub: a === h ? "iron" : a,
    userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false
  };
}

/** Full-time hold: `tick` counts seconds spent in the ended phase and returns true once, when the next fixture is due. */
export function createAutoplayLoop(holdS = AUTOPLAY_RESULT_HOLD_S) {
  let endedFor = 0;
  let fired = false;
  return {
    tick(dt: number, ended: boolean): boolean {
      if (!ended) { endedFor = 0; fired = false; return false; }
      endedFor += dt;
      if (fired || endedFor < holdS) return false;
      fired = true;
      return true;
    },
    reset() { endedFor = 0; fired = false; }
  };
}

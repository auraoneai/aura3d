/**
 * Hands-free play (`?autoplay=1`, alias `?autopilot=1`, legacy `?demo=1`): the computer plays the human side through the
 * same actions a player has, and the match loops forever (results ~3 s, then a rematch). main.ts calls these; nothing
 * here runs in normal play, so normal-play simulation is unchanged. tests/unit/aura-hoops/autoplay.test.ts pins them.
 */
import { passLaneOpen, type LaneBody } from "./rules";

/** Key that toggles the autopilot in game (also the top-bar AUTO button). */
export const AUTOPILOT_TOGGLE_CODE = "KeyP";
/** Seconds the results card stays up before an autoplay rematch. */
export const AUTOPLAY_RESULTS_SECONDS = 3;
/** Seconds without progress (see `stepAutoplayWatch`) after which autoplay re-checks the ball; under the 5 s stuck limit. */
export const AUTOPLAY_STALL_SECONDS = 4.5;
/** Seconds an autopilot handler waits after a catch before its next read (catch, look, go). */
export const AUTOPILOT_CATCH_READ = 0.4;
/** Horizontal ball / handler travel that counts as progress (a standing dribble does not). */
export const AUTOPLAY_PROGRESS_METERS = 0.6;

/** `?autoplay=1`, `?autopilot=1` or `?demo=1`. */
export function autoplayRequested(params: { get(name: string): string | null }): boolean {
  return params.get("autoplay") === "1" || params.get("autopilot") === "1" || params.get("demo") === "1";
}

/* ------------------------------------------------------------------ *
 *  Autopilot decisions (offense)                                      *
 * ------------------------------------------------------------------ */

export type AutopilotPlay = "pass" | "shoot" | "stand" | "drive";

/**
 * The handler's next read, from one roll in [0, 1): kick it out (only when a passing lane is open), pull up inside
 * `shootRange`, pound the rock for a beat, or drive the rim. Out of range it attacks instead of waiting, and it never
 * stands twice in a row (two standing beats in a row read as a stalled game). Labs always drive (Dunk Lab).
 */
export function chooseAutopilotPlay(o: { readonly roll: number; readonly dRim: number; readonly lab: boolean; readonly canPass: boolean; readonly shootRange?: number; readonly lastPlay?: string }): AutopilotPlay {
  if (o.lab) return "drive";
  if (o.roll < 0.28 && o.canPass) return "pass";
  if (o.roll < 0.58) return o.dRim < (o.shootRange ?? 6.4) ? "shoot" : "drive";
  if (o.roll < 0.8 && o.lastPlay !== "stand") return "stand";
  return "drive";
}

/** Release quality for an autopilot jumper from one roll: mostly green, now and then a little early or late. */
export function autopilotReleaseQuality(roll: number): number {
  return 0.58 + roll * 0.4;
}

/** An open teammate to pass to, chosen with one roll in [0, 1) among the mates with a clear lane, or undefined. */
export function pickOpenReceiver<T extends LaneBody>(from: LaneBody, mates: readonly T[], defenders: readonly LaneBody[], roll: number): T | undefined {
  const open = mates.filter((m) => passLaneOpen(from, m, defenders));
  return open.length > 0 ? open[Math.min(open.length - 1, Math.floor(roll * open.length))] : undefined;
}

/* ------------------------------------------------------------------ *
 *  Loop watch: results -> rematch, and a stall guard                  *
 * ------------------------------------------------------------------ */

export interface AutoplaySnapshot {
  readonly phase: string;
  readonly scoreHome: number;
  readonly scoreAway: number;
  readonly ballState: string;
  readonly holder: number;
  readonly ballX: number;
  readonly ballZ: number;
}

export interface AutoplayWatch {
  /** Seconds spent on the results card (phase "gameover"). */
  gameoverT: number;
  /** Seconds since the last progress. */
  stallT: number;
  /** Longest stall seen (for tests and evidence). */
  maxStall: number;
  key: string;
  markX: number;
  markZ: number;
}

export function createAutoplayWatch(): AutoplayWatch {
  return { gameoverT: 0, stallT: 0, maxStall: 0, key: "", markX: 0, markZ: 0 };
}

export type AutoplayAction = "restart" | "unstick" | null;

/**
 * One autoplay tick. "restart": the results card has been up `AUTOPLAY_RESULTS_SECONDS` (or play sits on the menu
 * phase), start the next match. "unstick": nothing has progressed for `AUTOPLAY_STALL_SECONDS` (no phase, score, ball
 * state or holder change, and the ball has not travelled `AUTOPLAY_PROGRESS_METERS`), re-check the ball.
 */
export function stepAutoplayWatch(w: AutoplayWatch, s: AutoplaySnapshot, dt: number): AutoplayAction {
  if (s.phase === "gameover") {
    w.gameoverT += dt;
    w.stallT = 0;
    if (w.gameoverT >= AUTOPLAY_RESULTS_SECONDS) { w.gameoverT = 0; w.key = ""; return "restart"; }
    return null;
  }
  w.gameoverT = 0;
  if (s.phase === "menu") return "restart";
  const key = `${s.phase}|${s.scoreHome}|${s.scoreAway}|${s.ballState}|${s.holder}`;
  if (key !== w.key || Math.hypot(s.ballX - w.markX, s.ballZ - w.markZ) >= AUTOPLAY_PROGRESS_METERS) {
    w.key = key; w.markX = s.ballX; w.markZ = s.ballZ; w.stallT = 0;
    return null;
  }
  w.stallT += dt;
  w.maxStall = Math.max(w.maxStall, w.stallT);
  if (w.stallT >= AUTOPLAY_STALL_SECONDS) { w.stallT = 0; w.key = ""; return "unstick"; }
  return null;
}

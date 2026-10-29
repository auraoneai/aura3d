/**
 * flow.ts — pure round, lab, tour and menu rules for Aura Links 3D.
 * No DOM and no engine imports, so each rule is unit tested on its own.
 */

import { PLAYER_NAME } from "./sim";
import type { CourseId, LabScore, LieKind, TourRound, TourState } from "./types";

/* ------------------------------------------------------------------ *
 *  Pickup                                                             *
 * ------------------------------------------------------------------ */

/** a hole is picked up and scored par + this once that many strokes are used without holing out */
export const PICKUP_OVER_PAR = 5;

/** true when the player has used par+5 strokes and the ball is still out */
export function shouldPickUp(strokes: number, par: number): boolean {
  return strokes >= par + PICKUP_OVER_PAR;
}

/** the score recorded for a picked-up hole */
export function pickupScore(par: number): number {
  return par + PICKUP_OVER_PAR;
}

/* ------------------------------------------------------------------ *
 *  Putting Lab                                                        *
 * ------------------------------------------------------------------ */

/** one Putting Lab attempt: a make adds a hit and grows the streak, a miss resets it; both count an attempt */
export function scorePuttingLab(lab: LabScore, holed: boolean): LabScore {
  if (holed) {
    const streak = lab.streak + 1;
    return { ...lab, attempts: lab.attempts + 1, hits: lab.hits + 1, streak, best: Math.max(lab.best, streak) };
  }
  return { ...lab, attempts: lab.attempts + 1, streak: 0 };
}

/* ------------------------------------------------------------------ *
 *  Pro Circuit                                                        *
 * ------------------------------------------------------------------ */

const TOUR_ROUNDS: readonly Exclude<TourRound, "champion">[] = ["r32", "r16", "qtr", "semi", "final"];
/** one course per round, in order */
export const TOUR_COURSES: readonly CourseId[] = ["stAuroras", "mapleHollow", "cinderRim", "cloudTerrace", "mareCourse"];

/** course played in the given round (round index into TOUR_COURSES) */
export function tourCourseFor(round: TourRound): CourseId {
  const i = TOUR_ROUNDS.indexOf(round as Exclude<TourRound, "champion">);
  return TOUR_COURSES[Math.max(0, Math.min(TOUR_COURSES.length - 1, i < 0 ? TOUR_COURSES.length - 1 : i))]!;
}

/** a circuit is over once the player misses a cut or takes the title */
export function tourFinished(tour: TourState | null): boolean {
  return !tour || !tour.playerAlive || tour.round === "champion";
}

export interface BracketRow {
  readonly name: string;
  readonly score: number;
  readonly advanced: boolean;
  readonly you: boolean;
}

/**
 * Rows for one round of the bracket: the leading `limit - 1` rivals plus the
 * player, who is always shown (pinned last when outside the top rows).
 */
export function bracketRows(
  results: TourState["results"],
  round: TourRound,
  limit = 8,
  playerName: string = PLAYER_NAME
): BracketRow[] {
  const cells = results.filter((r) => r.round === round);
  const you = cells.find((c) => c.name === playerName);
  const rivals = cells.filter((c) => c.name !== playerName).sort((a, b) => a.score - b.score);
  const rows: BracketRow[] = rivals.slice(0, you ? limit - 1 : limit).map((c) => ({ name: c.name, score: c.score, advanced: c.advanced, you: false }));
  if (you) {
    const at = rows.findIndex((r) => r.score > you.score);
    const row = { name: you.name, score: you.score, advanced: you.advanced, you: true };
    if (at < 0) rows.push(row);
    else rows.splice(at, 0, row);
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 *  Menu                                                               *
 * ------------------------------------------------------------------ */

export type PlayPhase = "menu" | "address" | "swing" | "flight" | "between" | "card" | "roundover";

/** Escape opens the menu in any phase except when it is already open or the hole card is on screen */
export function menuCanOpen(phase: PlayPhase): boolean {
  return phase !== "menu" && phase !== "card";
}

/* ------------------------------------------------------------------ *
 *  Camera mode                                                        *
 * ------------------------------------------------------------------ */

export type CamMode = "menu" | "address" | "aim" | "flight" | "green" | "celebrate" | "card";

/**
 * The camera branch for this frame, decided by the play phase alone (the
 * previous camera mode never feeds back, so the celebrate orbit cannot leak
 * into the next hole's address).
 */
export function cameraModeFor(input: {
  readonly phase: PlayPhase;
  readonly ballMoving: boolean;
  readonly strikeHold: boolean;
  readonly lie: LieKind;
}): Exclude<CamMode, "menu" | "card"> {
  const { phase, ballMoving, strikeHold, lie } = input;
  if (phase === "flight" && ballMoving && !strikeHold) return "flight";
  if (phase === "card" || phase === "roundover") return "celebrate";
  if (lie === "green" || lie === "fringe") return "green";
  if (phase === "swing" || strikeHold) return "address";
  return "aim";
}

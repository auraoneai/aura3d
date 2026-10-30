/**
 * GU47 WP-30 capture helpers (NR-22): the `?at=<metres>` district target and the named crops E-I's capture reads
 * (`window.__AURA_NINJA_RUNNER__.crops`, normalised 0..1, origin top-left). The chase camera keeps the runner in the
 * lower middle of the frame, so the crops are fixed rects; the river crop exists only while the river is in view.
 * Pure and DOM-free.
 */
import { COURSE_LENGTH } from "./course";

export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** `?at=` in metres, clamped inside the course (the last 40 m are the finish); null when absent or not a number. */
export function atDistance(params: URLSearchParams): number | null {
  if (!params.has("at")) return null;
  const v = Number(params.get("at"));
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(COURSE_LENGTH - 40, v));
}

const SKY: QaCrop = { name: "sky", x: 0, y: 0, w: 1, h: 0.28 };
const RUNNER: QaCrop = { name: "runner", x: 0.4, y: 0.42, w: 0.2, h: 0.4 };
const PATH: QaCrop = { name: "path", x: 0.25, y: 0.82, w: 0.5, h: 0.18 };
const RIDGE: QaCrop = { name: "ridge", x: 0, y: 0.28, w: 1, h: 0.16 };
const ROOF: QaCrop = { name: "roof", x: 0, y: 0.45, w: 0.3, h: 0.3 };
const RIVER: QaCrop = { name: "river", x: 0.6, y: 0.55, w: 0.4, h: 0.3 };

/** Crops for the frame at course distance `s`. */
export function qaCrops(s: number): QaCrop[] {
  const out = [SKY, RUNNER, PATH, RIDGE];
  if (s >= 470 && s < 1120) out.push(ROOF);
  if (s >= 1120 && s < 1510) out.push(RIVER);
  return out;
}

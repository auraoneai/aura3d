/**
 * GU47 WP-30 camera rows, pure and DOM-free (the world feeds the result to `app.camera.setPose`):
 *
 * - NR-18 intro: on the title card the camera hangs high over the village roofs (> 20 m above the runner) with a slow
 *   drift, and during the 3-2-1 it blends down onto today's chase pose, reaching it exactly when the run starts.
 * - NR-18 win: three shots at the Valley Gate (a profile of the runner, a low shot up at the gate, a high wide crane),
 *   cut on fixed times after the win.
 * - NR-18 lane roll: the chase rolls with the runner's sideways speed, at most 3 degrees.
 *
 * Reduced motion skips all three (the chase pose as today, no roll); so does `?look=original`. Gameplay never reads
 * any of this (PRD D8).
 */
import { groundFrame } from "./course";

export type Vec3 = [number, number, number];
export interface ShotPose { readonly eye: Vec3; readonly look: Vec3; readonly fov: number }

/** Height of the intro shot above the runner's ground (m); the acceptance asks for > 20 m on the title. */
export const INTRO_HEIGHT = 26;
/** Lane-change roll cap (degrees) and how fast it follows (halflife, s). */
export const ROLL_MAX_DEG = 3;
export const ROLL_HALFLIFE = 0.12;
/** Win sequence shot boundaries (s after the win). */
export const WIN_SHOTS = [0, 1.8, 3.6] as const;

const at = (s: number, e: number, t: number): Vec3 => { const f = groundFrame(s, e, t); return [f.x, f.y, f.z]; };
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Smootherstep: zero slope at both ends, so the blend leaves the title and lands on the chase without a kick. */
export const easeShot = (k: number): number => { const t = Math.max(0, Math.min(1, k)); return t * t * t * (t * (t * 6 - 15) + 10); };

/** The title-card shot over the roofs at course distance `s` (the runner idles at 0), drifting slowly with `time`. */
export function introPose(s: number, time: number): ShotPose {
  const drift = Math.sin(time * 0.12) * 5;
  return { eye: at(s + 14, 9 + drift, INTRO_HEIGHT), look: at(s + 46, -2, 2), fov: 50 };
}

/**
 * Intro blend: `k` = 0 on the title, rising through the countdown to 1 at the start. At 1 the result is the chase
 * pose itself (byte for byte), so the first running frame is today's chase.
 */
export function blendIntro(chase: ShotPose, s: number, time: number, k: number): ShotPose {
  if (k >= 1) return chase;
  const intro = introPose(s, time);
  const t = easeShot(k);
  return { eye: lerp(intro.eye, chase.eye, t), look: lerp(intro.look, chase.look, t), fov: intro.fov + (chase.fov - intro.fov) * t };
}

/** Which win shot plays `since` seconds after the win (0, 1 or 2). */
export function winShotIndex(since: number): 0 | 1 | 2 {
  return since < WIN_SHOTS[1] ? 0 : since < WIN_SHOTS[2] ? 1 : 2;
}

/** The win shot for a runner at `s`, lateral `x`, `since` seconds after crossing the gate line. */
export function winPose(s: number, x: number, since: number): ShotPose {
  const shot = winShotIndex(since);
  const local = since - WIN_SHOTS[shot];
  if (shot === 0) return { eye: at(s + 0.6 + local * 0.4, x + 5.2, 1.7), look: at(s, x, 1.2), fov: 42 };
  if (shot === 1) return { eye: at(s - 3.5, x - 1.4, 0.5), look: at(s + 26, 0, 8 + local * 0.6), fov: 55 };
  return { eye: at(s - 18 - local * 1.2, 0, 20 + local * 0.8), look: at(s + 30, 0, 3), fov: 52 };
}

/** Lane-change roll (radians) from the runner's sideways speed (m/s): leans into the turn, capped at 3 degrees. */
export function laneRoll(lateralSpeed: number): number {
  const max = (ROLL_MAX_DEG * Math.PI) / 180;
  if (!Number.isFinite(lateralSpeed) || lateralSpeed === 0) return 0;
  return Math.max(-max, Math.min(max, -lateralSpeed * 0.006));
}

/** Whether the GU47 camera shots run: the evening look without reduced motion. */
export function cinematicsOn(evening: boolean, reducedMotion: boolean): boolean {
  return evening && !reducedMotion;
}

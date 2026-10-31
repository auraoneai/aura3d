/**
 * GU47 WP-27 SSR-15: camera shots layered on the chase camera under the colour script.
 *
 * - Intro (first 4 s of a run): the camera starts far ahead and high (from the serpent's head, looking back at the
 *   runner) and eases into the chase position, with cinema bars that open as it lands.
 * - Stage-start push (1.2 s after crossing each stage boundary): the camera pushes in past the gate and settles back.
 * - Bank-following roll: the horizon tilts with the runner's lean (a third of it).
 * - Surge FOV kick: +8 deg when a surge starts, decaying over 0.6 s.
 * - Leap orbit: at the tail leap the camera swings round the runner (up to 70 deg).
 *
 * Reduced motion skips the push, the kick, the roll and the orbit, and cuts the intro (bars only). Presentation only:
 * reads `time`, `s`, `leg`, `speed`, `surge` and `phase`; the chase camera stays the one `setPose` per frame.
 */
import { STAGES, type RunState } from "../sim";
import { lookDistance } from "./colorScript";

export const INTRO_SECONDS = 4;
export const PUSH_SECONDS = 1.2;
export const PUSH_DEPTH = 0.28;
export const FOV_KICK_DEG = 8;
export const FOV_KICK_SECONDS = 0.6;
export const ROLL_SHARE = 1 / 3;
export const ORBIT_MAX = (70 * Math.PI) / 180;

export interface ShotInput {
  readonly S: Pick<RunState, "time" | "s" | "leg" | "speed" | "surge" | "phase">;
  readonly dt: number;
  /** Runner lean this frame (radians, art/motion.ts). */
  readonly lean: number;
  /** Seconds since the run left the `run` phase. */
  readonly outro: number;
  readonly reducedMotion: boolean;
  /**
   * GU47 phase 2: the title screen (no run started yet). The title holds the chase framing of 4.6.2 instead of the
   * intro's first pose (40 m ahead, 14 m up), which left the runner a small faded figure on every title frame.
   */
  readonly title?: boolean;
}

export interface Shot {
  /** 1 at the start of the intro, 0 once the chase camera has landed. */
  readonly intro: number;
  /** 0..1 cinema-bar height (fraction of the full 10% bar). */
  readonly bars: number;
  /** Multiplier on the chase distance (1 = none; < 1 pushes in). */
  readonly back: number;
  readonly fovAdd: number;
  /** Camera roll about its forward axis (radians). */
  readonly roll: number;
  /** Orbit of the camera about the runner's up axis (radians). */
  readonly orbit: number;
  /** Name of the active shot (QA hook and evidence). */
  readonly name: "intro" | "push" | "leap-orbit" | "chase";
}

export interface ShotDirector {
  step(input: ShotInput): Shot;
  readonly shot: Shot;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Seconds since the last stage boundary at speed `speed`, or Infinity on the first stage. */
export function secondsSinceStageStart(s: number, speed: number): number {
  let from = -1;
  for (let i = 1; i < STAGES.length; i++) if (s >= (STAGES[i] as { from: number }).from) from = (STAGES[i] as { from: number }).from;
  if (from < 0) return Number.POSITIVE_INFINITY;
  return (s - from) / Math.max(1, speed);
}

const CHASE: Shot = { intro: 0, bars: 0, back: 1, fovAdd: 0, roll: 0, orbit: 0, name: "chase" };

export function createShotDirector(): ShotDirector {
  let shot: Shot = CHASE;
  let kick = 0;
  let prevSurge: string | null = null;
  return {
    get shot() { return shot; },
    step({ S, dt, lean, outro, reducedMotion, title = false }) {
      const running = S.phase === "run" && !title;
      if (prevSurge !== null && running && S.surge !== "off" && prevSurge === "off") kick = 1;
      prevSurge = S.surge;
      kick = Math.max(0, kick - dt / FOV_KICK_SECONDS);

      const introT = running ? S.time / INTRO_SECONDS : 1;
      const intro = reducedMotion || introT >= 1 ? 0 : 1 - ease(Math.max(0, introT));
      const bars = introT >= 1 ? 0 : 1 - ease(Math.max(0, Math.min(1, (introT - 0.6) / 0.4)));

      const since = running ? secondsSinceStageStart(lookDistance(S.s, S.leg), S.speed) : Number.POSITIVE_INFINITY;
      const pushing = !reducedMotion && since < PUSH_SECONDS;
      const back = pushing ? 1 - PUSH_DEPTH * Math.sin((Math.PI * since) / PUSH_SECONDS) : 1;

      const orbit = !reducedMotion && S.phase === "leap" ? ORBIT_MAX * ease(Math.min(1, Math.max(0, outro) / 2)) : 0;
      const name: Shot["name"] = intro > 0 || bars > 0 ? "intro" : orbit > 0 ? "leap-orbit" : pushing ? "push" : "chase";
      shot = {
        intro, bars, back,
        fovAdd: reducedMotion ? 0 : FOV_KICK_DEG * kick * kick,
        roll: reducedMotion ? 0 : lean * ROLL_SHARE,
        orbit, name
      };
      return shot;
    }
  };
}

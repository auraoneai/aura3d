/**
 * IRON CROWN cinematics (GU47 WP-15 IC47-C1, the signature's "letterboxed intro and K.O. cinematics").
 *
 * Camera-only: the shots read the fighters' positions and the bout phase and never write gameplay state. They play
 * inside the existing phase windows (intro 1.35 s, K.O. 1.7 s, bout end), so round pacing and the sim stay as they
 * are (PRD D8). Shots:
 * - intro: a venue dolly, then a close-up on each fighter (three shots, skippable: any input ends the intro);
 * - K.O.: an orbit around the pair;
 * - bout end: a low hero shot on the winner.
 * Letterbox bars (LETTERBOX_BAR of the viewport each) frame every shot. Reduced motion: the same shots as static cuts
 * (no dolly, no orbit travel).
 *
 * Pure functions: tests drive them without an app.
 */
import type { AuraVec3 } from "@aura3d/engine";

export type CinematicPhase = "attract" | "intro" | "fight" | "ko" | "roundEnd" | "boutEnd";

export interface CinematicInput {
  readonly phase: CinematicPhase;
  /** Seconds since the phase began (camera clock). */
  readonly t: number;
  readonly p1: AuraVec3;
  readonly p2: AuraVec3;
  /** The bout winner's position at bout end, `null` on a draw. */
  readonly winner: AuraVec3 | null;
  readonly reducedMotion: boolean;
}

export interface CinematicShot {
  readonly name: "venue-dolly" | "p1-closeup" | "p2-closeup" | "ko-orbit" | "win-hero";
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fov: number;
}

/**
 * IC47-C2: the fight lens. fov 40 (the tight end of 40-45, so the pair stays large) with the lens lowered (lift 0.6 m above the rig, was 0.82) and aimed a
 * little higher (0.78 m, was 0.72), so the pair reads taller in frame. The FOV kick on dash and special is the feel
 * preset's punch (main.ts feel table: dash 1.1 deg, special 2.6 deg). Bounding-box share is measured in phase 2.
 */
export const FIGHT_LENS = { fov: 40, lift: 0.6, aim: 0.78 } as const;

/** Shot starts inside the 1.35 s intro (seconds). */
export const INTRO_SHOTS = { dolly: 0, p1: 0.55, p2: 0.95 } as const;
/** The intro's length today (main.ts phase machine); C1's acceptance caps it at 4.0 s. */
export const INTRO_SECONDS = 1.35;
/** K.O. orbit: radians per second and the radius around the pair. */
export const KO_ORBIT = { start: -0.55, rate: 0.5, radius: 5.4, height: 2.1 } as const;

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function closeUp(name: "p1-closeup" | "p2-closeup", subject: AuraVec3, side: 1 | -1): CinematicShot {
  // Three-quarter front, lens slightly below the face, looking up a little at the fighter.
  return {
    name,
    position: [subject[0] + side * 0.95, 1.35, subject[2] + 2.7],
    target: [subject[0], 1.42, subject[2]],
    fov: 34
  };
}

/** The cinematic shot for this frame, or `null` when the fighting rig frames the pair. */
export function cinematicShot(input: CinematicInput): CinematicShot | null {
  const mid: AuraVec3 = [(input.p1[0] + input.p2[0]) / 2, 0, (input.p1[2] + input.p2[2]) / 2];
  if (input.phase === "intro") {
    if (input.t < INTRO_SHOTS.p1) {
      const k = input.reducedMotion ? 1 : smooth(input.t / INTRO_SHOTS.p1);
      return {
        name: "venue-dolly",
        position: [mid[0], lerp(3.9, 2.5, k), lerp(12.5, 8.6, k)],
        target: [mid[0], lerp(1.9, 1.2, k), mid[2]],
        fov: 44
      };
    }
    // P1 fights from the left, so its close-up is framed from its outer (left) side; the rival's from the right.
    if (input.t < INTRO_SHOTS.p2) return closeUp("p1-closeup", input.p1, -1);
    return closeUp("p2-closeup", input.p2, 1);
  }
  if (input.phase === "ko") {
    const angle = KO_ORBIT.start + (input.reducedMotion ? 0 : input.t * KO_ORBIT.rate);
    return {
      name: "ko-orbit",
      position: [mid[0] + Math.sin(angle) * KO_ORBIT.radius, KO_ORBIT.height, mid[2] + Math.cos(angle) * KO_ORBIT.radius],
      target: [mid[0], 1.0, mid[2]],
      fov: 42
    };
  }
  if (input.phase === "boutEnd" && input.winner) {
    const w = input.winner;
    return { name: "win-hero", position: [w[0] + 0.6, 0.85, w[2] + 3.1], target: [w[0], 1.5, w[2]], fov: 36 };
  }
  return null;
}

/** Letterbox bars are shown while the camera performs (intro, K.O. and bout end). */
export function letterboxWanted(phase: CinematicPhase, hasWinner: boolean): boolean {
  return phase === "intro" || phase === "ko" || (phase === "boutEnd" && hasWinner);
}

/** The camera's phase clock: resets when the phase changes, else advances by dt. */
export function createCinematicClock() {
  let phase: CinematicPhase | null = null;
  let t = 0;
  return {
    tick(next: CinematicPhase, dt: number): number {
      if (next !== phase) {
        phase = next;
        t = 0;
      } else {
        t += Math.max(0, dt);
      }
      return t;
    }
  };
}

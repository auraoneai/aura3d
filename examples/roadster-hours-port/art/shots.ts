/**
 * GU47 WP-32 RH47-16: Saltwind Highway shot director (pure, unit tested). Three presentation shots on top of the chase
 * camera, none of which touches the sim (PRD D8):
 *
 * - Intro rail: 6 s per route behind the menu, letterboxed. The eye starts high over the sea ahead of the car and sweeps
 *   down and back to the chase position; any input (begin, key, tap) ends it on that frame.
 * - Finish: a trackside shot of the car for 2.5 s, then a slow orbit around it on the results screen.
 * - Kicker hang time: a FOV push while the car is airborne off a kicker, with 0.6x slow-motion (wall clock only: the
 *   fixed-step loop runs fewer steps per second, every step is the same, so replays stay byte-identical).
 *
 * Reduced motion (PRD §6.3): no rail and no bars (a cut to the chase camera), a static trackside finish without the orbit,
 * no FOV push and no slow-motion.
 */

export type ShotMode = "intro" | "play" | "finish";

export const INTRO_SECONDS = 6;
export const FINISH_TRACKSIDE_SECONDS = 2.5;
export const HANG_SLOWMO = 0.6;
export const HANG_FOV_PUSH = 6;
/** Letterbox bar height as a fraction of the viewport (each bar). */
export const BAR_FRACTION = 0.1;

type Vec3 = [number, number, number];

/** Road-frame placement the world runtime turns into world space (`roadPoint(level, s, l, h)`). */
export interface RoadPlacement { readonly s: number; readonly l: number; readonly h: number }

export interface ShotFrame {
  readonly mode: ShotMode;
  /** Eye and look target on the road frame when a shot owns the camera; null = the chase camera. */
  readonly eye: RoadPlacement | null;
  readonly look: RoadPlacement | null;
  /** Orbit: world-space angle around the car (radians) and radius, applied by the runtime instead of `eye`. */
  readonly orbit: { readonly angle: number; readonly radius: number; readonly height: number } | null;
  readonly fov: number | null;
  /** Letterbox amount 0..1 (bars slide in and out). */
  readonly bars: number;
  /** Wall-clock time scale for the fixed-step loop (1 = real time). */
  readonly timeScale: number;
  /** Degrees added to the chase FOV. */
  readonly fovPush: number;
  /** The chase camera should snap this frame (a shot just ended). */
  readonly cut: boolean;
}

export interface ShotDirector {
  startIntro(): void;
  /** Ends the intro now (any input). */
  skipIntro(): void;
  startFinish(): void;
  play(): void;
  setReducedMotion(on: boolean): void;
  step(dt: number, run: { readonly s: number; readonly l: number; readonly grounded: boolean }, events: readonly { readonly type: string; readonly [key: string]: unknown }[]): ShotFrame;
  readonly mode: ShotMode;
}

const smooth = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createShotDirector(options: { readonly reducedMotion?: boolean; readonly seaSide?: -1 | 1 } = {}): ShotDirector {
  let reduced = options.reducedMotion ?? false;
  const sea = options.seaSide ?? -1;
  let mode: ShotMode = "play";
  let t = 0;
  let pendingCut = false;
  let hang = false;
  let hangAmount = 0;
  let bars = 0;
  let finishS = 0, finishL = 0;

  return {
    get mode() { return mode; },
    startIntro() { if (reduced) { mode = "play"; pendingCut = true; return; } mode = "intro"; t = 0; },
    skipIntro() { if (mode === "intro") { mode = "play"; pendingCut = true; bars = 0; } },
    startFinish() { mode = "finish"; t = 0; finishS = Number.NaN; },
    play() { if (mode !== "play") pendingCut = true; mode = "play"; hang = false; hangAmount = 0; },
    setReducedMotion(on) { reduced = on; if (on && mode === "intro") { mode = "play"; pendingCut = true; bars = 0; } },
    step(dt, run, events) {
      const d = Math.max(0, dt);
      t += d;
      for (const e of events) {
        if (e.type === "launch" && e.kicker) hang = true;
        if (e.type === "land" || e.type === "recover" || e.type === "impact") hang = false;
      }
      if (run.grounded) hang = false;
      hangAmount += ((hang && !reduced && mode === "play" ? 1 : 0) - hangAmount) * Math.min(1, d * 6);
      if (mode === "intro" && t >= INTRO_SECONDS) { mode = "play"; pendingCut = true; }
      const wantBars = mode === "intro" && !reduced ? 1 : 0;
      bars += (wantBars - bars) * Math.min(1, d * 5);
      if (wantBars === 0 && bars < 0.01) bars = 0;
      const cut = pendingCut; pendingCut = false;
      const base = { bars, timeScale: lerp(1, HANG_SLOWMO, hangAmount), fovPush: HANG_FOV_PUSH * hangAmount, cut };
      if (mode === "intro") {
        const k = smooth(t / INTRO_SECONDS);
        return {
          ...base, mode,
          eye: { s: run.s + lerp(120, -8.5, k), l: lerp(sea * 26, 0, k), h: lerp(34, 3.2, k) },
          look: { s: run.s + lerp(160, 14, k), l: lerp(sea * 10, 0, k), h: lerp(4, 1.2, k) },
          orbit: null, fov: lerp(44, 58, k)
        };
      }
      if (mode === "finish") {
        if (Number.isNaN(finishS)) { finishS = run.s; finishL = run.l; }
        const look = { s: run.s, l: run.l, h: 0.8 };
        if (t < FINISH_TRACKSIDE_SECONDS || reduced) {
          return { ...base, mode, eye: { s: finishS + 14, l: finishL - sea * 8, h: 1.6 }, look, orbit: null, fov: 40 };
        }
        return { ...base, mode, eye: null, look, orbit: { angle: (t - FINISH_TRACKSIDE_SECONDS) * 0.28, radius: 9, height: 2.4 }, fov: 46 };
      }
      return { ...base, mode, eye: null, look: null, orbit: null, fov: null };
    }
  };
}

/** Orbit eye in world space around `centre` (the runtime's car position). */
export function orbitEye(centre: readonly number[], orbit: { readonly angle: number; readonly radius: number; readonly height: number }): Vec3 {
  return [centre[0]! + Math.sin(orbit.angle) * orbit.radius, centre[1]! + orbit.height, centre[2]! + Math.cos(orbit.angle) * orbit.radius];
}

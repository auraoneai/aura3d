/**
 * GU47 AO-C1: the title intro (three letterboxed shots of the hero against the low sun, then back to the chase camera) and
 * the 1.2 s letterboxed slow-mo on ramp launches and Rocket Send. Presentation only: slow-mo slows the clock the fixed-step
 * simulation is fed (the same steps run, later), so replays and reference hashes are unchanged. Reduced motion: no intro
 * (straight to the chase cut), no slow-mo (PRD §6.3).
 */

type V3 = [number, number, number];

export interface ApexShotPose {
  readonly position: V3;
  readonly target: V3;
  readonly fov: number;
  readonly duration: number;
  readonly blendIn: number;
}

/** The authored chase camera (main.ts): the intro returns here. */
export const APEX_CHASE_POSE = { position: [0, 3.6, 6.2] as V3, target: [0, 0.9, -6.0] as V3, fov: 58, near: 0.25, far: 550 } as const;

/**
 * Hero at about [0, 0.6, -1.15] in camera space, the sun dead ahead (-z). Shot 1: low front three-quarter, the car backlit by
 * the sun; shot 2: high and wide over the skyway into the sun and the towers; shot 3: low side pass along the parapet.
 * 1.3 + 1.2 + 1.1 s of shots plus blends end inside 4.5 s.
 */
export const APEX_TITLE_SHOTS: readonly ApexShotPose[] = [
  { position: [3.4, 0.75, -7.4], target: [0, 0.75, -1.2], fov: 46, duration: 1.3, blendIn: 0 },
  { position: [-6, 16, 12], target: [0, 4, -90], fov: 60, duration: 1.2, blendIn: 0.35 },
  { position: [-5.6, 1.1, 0.8], target: [0.4, 0.7, -2.4], fov: 50, duration: 1.1, blendIn: 0.3 }
];
export const APEX_TITLE_RETURN_BLEND = 0.45;

export function apexTitleDurationSeconds(): number {
  return APEX_TITLE_SHOTS.reduce((t, s) => t + s.duration, 0) + APEX_TITLE_RETURN_BLEND;
}

/** Shot list in the camera controller's sequence shape (rigs built by the caller's `static` factory). */
export function apexTitleSequence<R>(staticRig: (pose: { position: V3; target: V3; fov: number; near: number; far: number }) => R): {
  readonly id: string;
  readonly shots: readonly { readonly rig: R; readonly duration: number; readonly blendIn: number; readonly bars: boolean }[];
  readonly onEnd: "return";
} {
  return {
    id: "apex-title-intro",
    shots: APEX_TITLE_SHOTS.map((s) => ({
      rig: staticRig({ position: s.position, target: s.target, fov: s.fov, near: APEX_CHASE_POSE.near, far: APEX_CHASE_POSE.far }),
      duration: s.duration,
      blendIn: s.blendIn,
      bars: true
    })),
    onEnd: "return"
  };
}

export const SLOW_MO_SECONDS = 1.2;
export const SLOW_MO_SCALE = 0.35;

/** Slow-mo clock: `scale(now)` is the factor the simulation clock advances by (1 outside a slow-mo). */
export interface ApexSlowMo {
  trigger(nowMs: number): boolean;
  scale(nowMs: number): number;
  active(nowMs: number): boolean;
  readonly triggered: number;
}

export function createApexSlowMo(reducedMotion: boolean): ApexSlowMo {
  let startMs = -Infinity;
  let triggered = 0;
  const durationMs = SLOW_MO_SECONDS * 1000;
  return {
    trigger(nowMs: number): boolean {
      if (reducedMotion || !Number.isFinite(nowMs)) return false;
      if (nowMs - startMs < durationMs) return false; // one at a time
      startMs = nowMs;
      triggered++;
      return true;
    },
    scale(nowMs: number): number {
      const t = (nowMs - startMs) / durationMs;
      if (!(t >= 0 && t < 1)) return 1;
      // ease in over the first 15%, hold, ease out over the last 25%
      const k = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
      return 1 - (1 - SLOW_MO_SCALE) * Math.min(1, Math.max(0, k));
    },
    active(nowMs: number): boolean {
      const t = (nowMs - startMs) / durationMs;
      return t >= 0 && t < 1;
    },
    get triggered() {
      return triggered;
    }
  };
}

/**
 * GU47 WP-27 SSR-07: speed and moment post on the runtime post handles (E-C `app.post.setEffect` / `setEffectEnabled`).
 *
 * - Motion blur above 60 m/s, ramping to full at 100 m/s; High / Ultra tiers only (PRD §6.4, SSR-19).
 * - Chromatic aberration pulses (0.35 s decay) when a surge starts and when the runner enters a barrel-roll section.
 * - Depth of field only in the outro (fall, leap, game over) and on the results card, focused on the runner.
 * - Reduced motion turns all three off; reduced flash drops the aberration pulses (PRD §6.3).
 *
 * Presentation only: reads `speed`, `surge`, `phase` and `s` from the run state and never writes the simulation.
 * Effects are written only when their state moves, so a steady run costs no post writes. The first step disables the
 * authored nodes that are not needed yet (world.ts authors all three in colour-script mode).
 */
import { ROLL_SECTIONS, type RunState } from "../sim";
import { lookDistance } from "./colorScript";
import { HIGH_POST_TIERS, type LookAppLike } from "./lookRuntime";

export const MOTION_BLUR_FROM = 60;
export const MOTION_BLUR_FULL = 100;
export const CA_PULSE_SECONDS = 0.35;
export const CA_PEAK = 0.006;
/** DOF focus on the runner (the chase camera sits ~7-10 m behind) and a gentle fStop. */
export const DOF_FOCUS = 9;
export const DOF_FSTOP = 2.8;

export interface CinePostInput {
  readonly S: Pick<RunState, "speed" | "surge" | "phase" | "s" | "leg">;
  readonly dt: number;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  /** True while the results card shows. */
  readonly results?: boolean;
}

export interface CinePostState {
  /** 0..1 motion-blur strength last written (0 = disabled). */
  readonly motionBlur: number;
  /** Chromatic aberration intensity last written (0 = disabled). */
  readonly aberration: number;
  readonly depthOfField: boolean;
}

export interface CinePostDriver {
  step(input: CinePostInput): void;
  readonly state: CinePostState;
  /** Engine writes made by the last `step`. */
  readonly writes: number;
}

/** Index of the roll section containing outbound distance `s`, or -1. */
export function rollSectionAt(s: number): number {
  for (let i = 0; i < ROLL_SECTIONS.length; i++) {
    const r = ROLL_SECTIONS[i]!;
    if (s >= r.from && s < r.from + r.len) return i;
  }
  return -1;
}

/** Motion-blur strength for a speed (0 below 60, 1 at 100 and above). */
export const motionBlurAmount = (speed: number): number =>
  Math.max(0, Math.min(1, (speed - MOTION_BLUR_FROM) / (MOTION_BLUR_FULL - MOTION_BLUR_FROM)));

export function createCinePostDriver(app: Pick<LookAppLike, "post" | "quality">): CinePostDriver {
  let blurShown = -1;
  let caShown = -1;
  let dofShown: boolean | null = null;
  let pulse = 0;
  let prevSurge: string | null = null;
  let prevRoll = -2;
  let writes = 0;
  const post = app.post;
  const enable = (name: string, on: boolean): void => { post?.setEffectEnabled(name, on); writes++; };
  return {
    get writes() { return writes; },
    get state() { return { motionBlur: Math.max(0, blurShown), aberration: Math.max(0, caShown), depthOfField: dofShown === true }; },
    step({ S, dt, reducedMotion, reducedFlash, results = false }) {
      writes = 0;
      const running = S.phase === "run";
      const high = HIGH_POST_TIERS.has(app.quality?.tier ?? "high");

      /* motion blur: High-only, quantised to 1/10 so the post chain is not rebuilt every frame */
      const blur = !reducedMotion && high && running ? Math.round(motionBlurAmount(S.speed) * 10) / 10 : 0;
      if (blur !== blurShown) {
        if (blur > 0) { post?.setEffect("motionBlur", { intensity: 0.5 * blur, shutter: 0.5, maxBlur: 12 }); writes++; }
        if (blurShown < 0 || (blur > 0) !== (blurShown > 0)) enable("motionBlur", blur > 0);
        blurShown = blur;
      }

      /* chromatic aberration: a pulse on surge start and on roll entry */
      const roll = rollSectionAt(lookDistance(S.s, S.leg));
      if (prevSurge !== null && running) {
        if (S.surge !== "off" && prevSurge === "off") pulse = 1;
        if (roll >= 0 && roll !== prevRoll) pulse = 1;
      }
      prevSurge = S.surge;
      prevRoll = roll;
      pulse = Math.max(0, pulse - dt / CA_PULSE_SECONDS);
      const ca = reducedMotion || reducedFlash ? 0 : Math.round(pulse * pulse * CA_PEAK * 2e4) / 2e4;
      if (ca !== caShown) {
        if (ca > 0) { post?.setEffect("chromaticAberration", { intensity: ca }); writes++; }
        if (caShown < 0 || (ca > 0) !== (caShown > 0)) enable("chromaticAberration", ca > 0);
        caShown = ca;
      }

      /* depth of field: outro and results only */
      const dof = !reducedMotion && (results || (S.phase !== "run" && S.phase !== "menu"));
      if (dof !== dofShown) {
        if (dof) { post?.setEffect("depthOfField", { focusDistance: DOF_FOCUS, fStop: DOF_FSTOP, maxBlur: 6 }); writes++; }
        enable("depthOfField", dof);
        dofShown = dof;
      }
    }
  };
}

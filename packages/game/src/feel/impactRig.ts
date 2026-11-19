/**
 * Real-time hit-stop, camera trauma and FOV kick in one rig, built on `createHitStop` and `createCameraShake`.
 * Extracted from the 30 live games' shared feel kit (`apps/showcase-port-shared/feel.ts`) in 5.7.0.
 */
import { createCameraShake, createHitStop } from "../motion/impact";

/** Options for {@link createImpactRig}. */
export interface ImpactRigOptions {
  /**
   * Zero the shake offset, roll and FOV kick (hit-stop still applies). Defaults to the
   * `prefers-reduced-motion: reduce` media query, or false outside a browser.
   */
  readonly reducedMotion?: boolean;
}

/** One impact for {@link ImpactRig.trigger}. Every field is optional and defaults to 0. */
export interface ImpactRigTrigger {
  /** Hit-stop freeze in seconds (e.g. 0.045), capped at 0.14 s. */
  freezeSeconds?: number;
  /** Camera trauma added to the shake, 0..1 (values above 1 are clamped). */
  trauma?: number;
  /** FOV kick in degrees, accumulated and clamped to -8..10. */
  fovKickDeg?: number;
}

/** What {@link ImpactRig.step} returns for one rendered frame. */
export interface ImpactRigFrame {
  /** The simulation delta to use this frame: the real delta scaled by the hit-stop (0 while frozen). */
  readonly simDt: number;
  /** True while the hit-stop holds the simulation. */
  readonly frozen: boolean;
  /** Camera offset `[x, y, 0]` from the trauma shake (zeros under reduced motion). */
  readonly shakeOffset: readonly [number, number, number];
  /** Camera roll in radians from the trauma shake (0 under reduced motion). */
  readonly shakeRoll: number;
  /** FOV delta in degrees to add to the base FOV (0 under reduced motion). */
  readonly fovDeltaDeg: number;
}

/** A hit-stop, camera-trauma and FOV-kick rig driven by real frame time. */
export interface ImpactRig {
  /** Trigger a real-time hit-stop freeze, a trauma shake and an FOV kick. */
  trigger(options: ImpactRigTrigger): void;
  /**
   * Advance on the REAL frame `dt` (never the game-frozen `dt`, lessons-learned M2) and return the scaled `simDt`,
   * the camera shake offset and roll, and the FOV delta. `realDt` is clamped to 0..0.1 s.
   */
  step(realDt: number): ImpactRigFrame;
  /** Clear any hit-stop, shake and FOV kick (restart, scene change). */
  reset(): void;
}

/**
 * Create a hit-stop, camera trauma and FOV kick rig for 120/144 Hz-safe game feel. The freeze runs on real time, so a
 * frozen simulation always resumes; shake decays at 1.8/s with a 0.22 m offset and 0.04 rad roll cap.
 *
 * @example
 * const rig = createImpactRig();
 * rig.trigger({ freezeSeconds: 0.05, trauma: 0.6, fovKickDeg: 3 });
 * const f = rig.step(realDt); sim.step(f.simDt); camera.offset(f.shakeOffset); camera.fov(base + f.fovDeltaDeg);
 */
export function createImpactRig(options: ImpactRigOptions = {}): ImpactRig {
  const hitStop = createHitStop(0);
  const cameraShake = createCameraShake({ decayPerSecond: 1.8, maxOffset: 0.22, maxRoll: 0.04 });
  let fovKick = 0;
  const reduced = options.reducedMotion ?? (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

  return {
    trigger({ freezeSeconds = 0, trauma = 0, fovKickDeg = 0 }) {
      if (freezeSeconds > 0) hitStop.trigger(Math.min(freezeSeconds, 0.14) * 1000);
      if (!reduced && trauma > 0) cameraShake.add(Math.min(trauma, 1));
      if (!reduced && fovKickDeg !== 0) fovKick = Math.max(-8, Math.min(10, fovKick + fovKickDeg));
    },
    step(realDt: number) {
      const clampedDt = Math.min(Math.max(realDt, 0), 0.1);
      const wasActive = hitStop.active;
      hitStop.update(clampedDt);
      const scale = wasActive || hitStop.active ? hitStop.timeScale() : 1;
      const simDt = clampedDt * scale;
      const shake = cameraShake.update(clampedDt);
      fovKick *= Math.exp(-clampedDt * 9.5);
      if (Math.abs(fovKick) < 0.01) fovKick = 0;
      const shakeOffset: [number, number, number] = reduced ? [0, 0, 0] : [shake.x, shake.y, 0];
      return {
        simDt,
        frozen: (wasActive || hitStop.active) && clampedDt > 0,
        shakeOffset,
        shakeRoll: reduced ? 0 : shake.roll,
        fovDeltaDeg: reduced ? 0 : fovKick
      };
    },
    reset() {
      hitStop.update(10);
      cameraShake.update(10);
      fovKick = 0;
    }
  };
}

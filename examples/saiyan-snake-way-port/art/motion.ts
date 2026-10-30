/**
 * GU47 WP-27 SSR-14: runner body language under the colour script.
 *
 * - Lean into the road's bend and the lane change, capped at 12 degrees (half on reduced motion).
 * - The aura shell pulses with the orb-pickup pulse (`kiPulse`, 1 -> 0 over ~0.5 s).
 * - The rigged runner runs on the E-H mixer: `crossFadeTo` on clip changes, a masked upper-body `Hit_React` layer over
 *   the run on a stumble (no popped frame across the hit), `advance(dt)` every frame.
 *
 * Presentation only: reads `laneVel`, `speed`, `stumble`, `kiPulse` and the road frames; never writes the simulation.
 */

export const LEAN_MAX = (12 * Math.PI) / 180;
const G = 9.81;
/** Look-ahead used to estimate the road's yaw rate (metres). */
export const BEND_PROBE = 6;

/**
 * Lean (radians, positive = to the runner's right) from the lateral lane velocity (m/s), the road's yaw rate
 * (radians per metre, positive = bending right) and the speed (m/s).
 */
export function runnerLean(laneVel: number, curvature: number, speed: number, reducedMotion = false): number {
  const lane = laneVel * 0.012;
  const bank = 0.5 * Math.atan((speed * speed * curvature) / G);
  const cap = reducedMotion ? LEAN_MAX / 2 : LEAN_MAX;
  return Math.max(-cap, Math.min(cap, lane + bank));
}

/** Aura intensity multiplier from the pickup pulse (1 + 0.35 at a fresh pickup; 0.15 on reduced motion). */
export const auraPulse = (kiPulse: number, reducedMotion = false): number =>
  1 + (reducedMotion ? 0.15 : 0.35) * Math.max(0, Math.min(1, kiPulse));

/** The mixer surface of `TypedGLBActor` the animator drives (E-H). */
export interface MixerActorLike {
  crossFadeTo(clip: string, seconds: number, options?: { speed?: number; loop?: boolean }): unknown;
  playLayer(layer: string, clip: string, options?: { weight?: number; fadeIn?: number; mask?: { humanoid: "upper-body" }; speed?: number }): unknown;
  stopLayer(layer: string, fadeOut?: number): unknown;
  advance(dt: number): unknown;
}

export interface RunnerAnimatorFrame {
  /** Base clip for this frame (never the hit clip; the hit is a layer). */
  readonly clip: string;
  /** Playback rate of the base clip (the old clock's rate: 1.5 x speed / 32 while moving). */
  readonly rate: number;
  readonly stumble: number;
  readonly dt: number;
}

export interface RunnerAnimator {
  step(frame: RunnerAnimatorFrame): void;
  readonly clip: string | null;
  readonly hitLayer: boolean;
}

export const BASE_FADE = 0.15;
export const HIT_FADE_IN = 0.08;
export const HIT_FADE_OUT = 0.2;

/**
 * Drives the base clip and the hit layer. The mixer is stepped by `dt x rate` so the base clip keeps today's speed-scaled
 * cadence; the hit layer's own speed is `1 / rate` at the hit so it plays in real time.
 */
export function createRunnerAnimator(actor: MixerActorLike, hitClip: string): RunnerAnimator {
  let clip: string | null = null;
  let hit = false;
  return {
    get clip() { return clip; },
    get hitLayer() { return hit; },
    step({ clip: next, rate, stumble, dt }) {
      const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
      if (next !== clip) {
        actor.crossFadeTo(next, clip === null ? 0 : BASE_FADE);
        clip = next;
      }
      if (stumble > 0.3 && !hit) {
        actor.playLayer("hit", hitClip, { weight: 1, fadeIn: HIT_FADE_IN, mask: { humanoid: "upper-body" }, speed: 1 / r });
        hit = true;
      } else if (stumble <= 0.05 && hit) {
        actor.stopLayer("hit", HIT_FADE_OUT);
        hit = false;
      }
      actor.advance(dt * r);
    }
  };
}

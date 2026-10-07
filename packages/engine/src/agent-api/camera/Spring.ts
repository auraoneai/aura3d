/**
 * C-8 spring math (PRD-08 §6.3) — the canonical smoothing functions every
 * camera lane path uses. Engine-pure: no renderer, no DOM.
 *
 * - `springDamp(x, target, halflife, dt)` — exponential approach; at
 *   t = halflife the remaining gap is exactly 0.5.
 * - `springDampVec3` — component-wise form.
 * - `springStep(x, v, target, halflife, dt)` — critically damped spring with
 *   carried velocity (smoothdamp-style); at t = halflife the remaining gap
 *   is 0.597 (2·e^(−ln2) − ln2·e^(−ln2) = (2−ln2)/2).
 * - `smoothingToHalflife` — maps the legacy `responsePerSecond`
 *   (`k = −ln(1−s)·60` style rates) to a halflife so new rigs can reproduce
 *   the old smoothing exactly.
 */

import type { AuraVec3 } from "../index.js";

export interface AuraSpringState {
  x: number;
  v: number;
}

export interface AuraSpringVec3State {
  x: AuraVec3;
  v: AuraVec3;
}

/** Exponential damp: remaining gap halves every `halflife` seconds. */
export function springDamp(x: number, target: number, halflife: number, dt: number): number {
  if (halflife <= 0 || dt <= 0) return target;
  return target + (x - target) * Math.pow(2, -dt / halflife);
}

export function springDampVec3(x: AuraVec3, target: AuraVec3, halflife: number, dt: number): AuraVec3 {
  return [
    springDamp(x[0], target[0], halflife, dt),
    springDamp(x[1], target[1], halflife, dt),
    springDamp(x[2], target[2], halflife, dt)
  ];
}

/**
 * Critically damped spring step (Freya Holmér's spring). Returns updated
 * `{x, v}` so velocity carries across steps; callers keep the state.
 */
export function springStep(
  x: number,
  v: number,
  target: number,
  halflife: number,
  dt: number
): AuraSpringState {
  if (halflife <= 0 || dt <= 0) return { x: dt <= 0 ? x : target, v: 0 };
  const y = (2 * Math.LN2) / halflife;
  const j0 = x - target;
  const j1 = v + j0 * y;
  const e = Math.exp(-y * dt);
  return {
    x: target + (j0 + j1 * dt) * e,
    v: v * e - j1 * y * dt * e
  };
}

export function springStepVec3(
  x: AuraVec3,
  v: AuraVec3,
  target: AuraVec3,
  halflife: number,
  dt: number
): AuraSpringVec3State {
  const a = springStep(x[0], v[0], target[0], halflife, dt);
  const b = springStep(x[1], v[1], target[1], halflife, dt);
  const c = springStep(x[2], v[2], target[2], halflife, dt);
  return { x: [a.x, b.x, c.x], v: [a.v, b.v, c.v] };
}

/**
 * Maps a legacy smoothing constant to a halflife. Legacy rigs used
 * `responsePerSecond = −ln(1−s)·60` and `amount = 1−exp(−r·dt)`; the
 * equivalent halflife is `ln2 / r`. `smoothing` is the 0..<1 UI knob — e.g.
 * 0.045 → ≈0.251 s.
 */
export function smoothingToHalflife(smoothing: number): number {
  const s = Math.max(0, Math.min(0.999999, smoothing));
  const responsePerSecond = -Math.log(1 - s) * 60;
  if (responsePerSecond <= 0) return 0;
  return Math.LN2 / responsePerSecond;
}

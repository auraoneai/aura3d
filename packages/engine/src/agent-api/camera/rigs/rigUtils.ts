/**
 * Shared math for the §6.4 rigs: yaw extraction from subject forward, angular
 * springs, the scalar/curve distance and FOV option shapes, and the C-12
 * near-plane rule. All lane-local (rigs must not import the index barrel).
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraSubject } from "../../../contracts/camera.js";
import { springDamp } from "../Spring.js";

export const sub = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: AuraVec3, s: number): AuraVec3 => [a[0] * s, a[1] * s, a[2] * s];
export const mix3 = (a: AuraVec3, b: AuraVec3, t: number): AuraVec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
export const length3 = (v: AuraVec3): number => Math.hypot(v[0], v[1], v[2]);
export const normalize = (v: AuraVec3): AuraVec3 => {
  const l = length3(v);
  return l <= 1e-9 ? [0, 0, 1] : mul(v, 1 / l);
};

/** Yaw of a heading vector with the scene convention forward ≈ [sin,0,cos]. */
export function headingYaw(forward: AuraVec3): number {
  return Math.atan2(forward[0], forward[2]);
}

/** Direction of yaw θ on the XZ plane: [sin θ, 0, cos θ]. */
export function yawDir(yaw: number): AuraVec3 {
  return [Math.sin(yaw), 0, Math.cos(yaw)];
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Angle-aware spring damp (shortest arc). */
export function springAngle(current: number, target: number, halflife: number, dt: number): number {
  return current + wrapAngle(springDamp(0, wrapAngle(target - current), halflife, dt));
}

/** `distance`-shaped option: scalar or speed curve. */
export function resolvePerSpeed(
  opt: number | { readonly base: number; readonly perSpeed?: number; readonly max?: number } | undefined,
  fallback: number,
  speed: number
): number {
  if (opt === undefined) return fallback;
  if (typeof opt === "number") return opt;
  const v = opt.base + (opt.perSpeed ?? 0) * speed;
  return opt.max === undefined ? v : Math.min(v, opt.max);
}

/** C-12: near plane tracks arm distance for chase/fighting/altitude. */
export function nearForDistance(d: number): number {
  return Math.min(0.5, Math.max(0.05, 0.02 * d));
}

/** Subject bounds height (y extent), floor at a centimetre to keep divides safe. */
export function subjectHeight(s: AuraCameraSubject): number {
  return Math.max(s.bounds.max[1] - s.bounds.min[1], 1e-2);
}

/** Horizontal (x/z) half-extent of subject bounds. */
export function subjectHalfWidth(s: AuraCameraSubject): number {
  return Math.max(s.bounds.max[0] - s.bounds.min[0], s.bounds.max[2] - s.bounds.min[2]) / 2;
}

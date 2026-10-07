/** Shared helpers for the built-in C-22 camera layers (PRD-08 §6.5). */
import type { AuraVec3 } from "../../index.js";

export type LayerCtx = { readonly dt: number; readonly reducedMotion: boolean };

export const DEG = Math.PI / 180;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function sub(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function add(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function scale(a: AuraVec3, s: number): AuraVec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function cross(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
export function normalize(a: AuraVec3): AuraVec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l <= 1e-9 ? [0, 0, 1] : scale(a, 1 / l);
}
/** Rodrigues rotation of `v` around unit axis `k` by `angle` (radians). */
export function rotateAxis(v: AuraVec3, k: AuraVec3, angle: number): AuraVec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cx = cross(k, v);
  return [
    v[0] * c + cx[0] * s + k[0] * kv * (1 - c),
    v[1] * c + cx[1] * s + k[1] * kv * (1 - c),
    v[2] * c + cx[2] * s + k[2] * kv * (1 - c)
  ];
}

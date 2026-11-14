/**
 * `@aura3d/engine/sculpt` kernel module: Shared mesh types, vector math, deterministic hash/value noise, fBm, Catmull-Rom and Bezier curve helpers.
 * Re-exported unchanged through `proceduralKernel.ts`; split out of the 5.5.6 kernel with no behaviour change.
 */
import type { AuraSceneNode } from "../agent-api/nodes/types.js";

export type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }> & { readonly visible?: boolean };

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
export type V4 = readonly [number, number, number, number];

export interface RawMesh {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
  /** Optional per-vertex linear-space RGBA (`vertexCount * 4`). */
  readonly colors?: number[];
  /** True when `normals` carry exact analytic SDF gradients and should not be overwritten by facet recomputation. */
  readonly analyticNormals?: boolean;
}

export interface MultiMatSlot {
  readonly mesh: RawMesh;
  readonly materialIndex: number;
}

export interface TransformOpts {
  readonly pos?: V3;
  readonly rot?: V3;
  readonly scale?: number | V3;
}

// ---------------------------------------------------------------------------
// Vector & Deterministic Noise Helpers
// ---------------------------------------------------------------------------

export function add3(a: V3, b: V3): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: V3, b: V3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(v: V3, s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: V3, b: V3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function norm3(v: V3): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function lerp3(a: V3, b: V3, t: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

/** Deterministic integer hash in `[0, 1)`. */
export function hash01(seed: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x: number, y: number, z: number, seed = 1): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number =>
    hash01(
      Math.imul(ix + dx, 73856093) ^
      Math.imul(iy + dy, 19349663) ^
      Math.imul(iz + dz, 83492791) ^
      Math.imul(seed | 0, 2654435761)
    );
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ux;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ux;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ux;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** Deterministic 3-octave value FBM in `[0, 1]`. */
export function fbm3(x: number, y: number, z: number, seed = 1): number {
  return (
    noise3(x, y, z, seed) * 0.55 +
    noise3(x * 2.07, y * 2.07, z * 2.07, seed + 17) * 0.3 +
    noise3(x * 4.13, y * 4.13, z * 4.13, seed + 43) * 0.15
  );
}

/** Smooth 3D Catmull-Rom spline passing through `points`. */
export function catmullRomSpline3(
  points: readonly V3[],
  segmentsPerSpan = 8,
  closed = false
): V3[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [[...points[0]!]];
  const segs = Math.max(1, Math.floor(segmentsPerSpan));
  const n = points.length;
  const getPt = (idx: number): V3 => {
    if (closed) return points[((idx % n) + n) % n]!;
    if (idx < 0) {
      const p0 = points[0]!, p1 = points[1]!;
      return [2 * p0[0] - p1[0], 2 * p0[1] - p1[1], 2 * p0[2] - p1[2]];
    }
    if (idx >= n) {
      const pn = points[n - 1]!, pm = points[n - 2]!;
      return [2 * pn[0] - pm[0], 2 * pn[1] - pm[1], 2 * pn[2] - pm[2]];
    }
    return points[idx]!;
  };

  const spanCount = closed ? n : n - 1;
  const out: V3[] = [];
  for (let s = 0; s < spanCount; s += 1) {
    const p0 = getPt(s - 1);
    const p1 = getPt(s);
    const p2 = getPt(s + 1);
    const p3 = getPt(s + 2);
    const limit = !closed && s === spanCount - 1 ? segs : segs - 1;
    for (let i = 0; i <= limit; i += 1) {
      const t = i / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      const evalAxis = (k: 0 | 1 | 2): number =>
        0.5 * (
          2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
        );
      out.push([evalAxis(0), evalAxis(1), evalAxis(2)]);
    }
  }
  return out;
}

/** Smooth 2D cubic Bezier curve for lathe profiles, fenders, and eaves. */
export function bezierCurve2(
  p0: V2,
  p1: V2,
  p2: V2,
  p3: V2,
  segments = 12
): V2[] {
  const segs = Math.max(1, Math.floor(segments));
  const out: V2[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    out.push([
      b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
      b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]
    ]);
  }
  return out;
}

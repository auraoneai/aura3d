// PRD-07 P4-T5 — analytic ray/volume segment lengths for `effects.fogVolume`
// (§6.6): constant-density box or ellipsoid; the length of ray ∩ volume
// clipped to [0, d] is added to τ. Used by `a3dFogVolumesTau` in the chunk and
// by PRD 07 programs' CPU mirrors.

import type { Vec3 } from "./HeightFog";

/** ≤ 4 on Low/Medium, ≤ 8 on High+ (§6.6). */
export const A3D_MAX_FOG_VOLUMES = 8;

export interface Prd07FogVolume {
  readonly shape: "box" | "ellipsoid";
  readonly center: Vec3;
  readonly halfSize: Vec3;
  readonly density: number;
}

type Vec3Mut = [number, number, number];

/**
 * Ray ∩ axis-aligned box (slab test). Returns the [tEnter, tExit] interval of
 * `o + t·v` inside the box, or null when the ray misses.
 */
export function rayBoxSegment(origin: Vec3, dir: Vec3, center: Vec3, halfSize: Vec3): readonly [number, number] | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = origin[i] - center[i];
    const v = dir[i];
    const h = halfSize[i] || 1e-9;
    if (Math.abs(v) < 1e-9) {
      if (Math.abs(o) > h) return null;
      continue;
    }
    const t1 = (-h - o) / v;
    const t2 = (h - o) / v;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMax < tMin) return null;
  return [tMin, tMax];
}

/**
 * Ray ∩ ellipsoid: map to unit-sphere space (`x' = (x - c) / h`) and use the
 * quadratic ray/sphere solution. Returns [tEnter, tExit] in ray units.
 */
export function rayEllipsoidSegment(origin: Vec3, dir: Vec3, center: Vec3, halfSize: Vec3): readonly [number, number] | null {
  const o: Vec3Mut = [0, 0, 0];
  const v: Vec3Mut = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const h = halfSize[i] || 1e-9;
    o[i] = (origin[i] - center[i]) / h;
    v[i] = dir[i] / h;
  }
  const a = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (a < 1e-12) return null;
  const b = o[0] * v[0] + o[1] * v[1] + o[2] * v[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [(-b - root) / a, (-b + root) / a];
}

/** Ray ∩ volume segment length clipped to [0, maxT] (§6.6). */
export function rayVolumeSegmentLength(origin: Vec3, dir: Vec3, maxT: number, volume: Prd07FogVolume): number {
  const seg = volume.shape === "box"
    ? rayBoxSegment(origin, dir, volume.center, volume.halfSize)
    : rayEllipsoidSegment(origin, dir, volume.center, volume.halfSize);
  if (!seg) return 0;
  const enter = Math.max(seg[0], 0);
  const exit = Math.min(seg[1], maxT);
  return Math.max(0, exit - enter);
}

/** Σ segment·density over volumes — the additive τ term in `a3dFogAmount`. */
export function fogVolumesTau(origin: Vec3, dir: Vec3, distance: number, volumes: readonly Prd07FogVolume[]): number {
  let tau = 0;
  for (const volume of volumes) {
    tau += rayVolumeSegmentLength(origin, dir, distance, volume) * volume.density;
  }
  return tau;
}

/**
 * Pack volumes into the `u_fogVolumes[2 * A3D_MAX_FOG_VOLUMES]` layout:
 * slot i   = (center.xyz, shape)   shape: 0 box, 1 ellipsoid
 * slot i+1 = (halfSize.xyz, density)
 */
export function packFogVolumes(volumes: readonly Prd07FogVolume[]): Float32Array {
  const out = new Float32Array(2 * A3D_MAX_FOG_VOLUMES * 4);
  const count = Math.min(volumes.length, A3D_MAX_FOG_VOLUMES);
  for (let i = 0; i < count; i++) {
    const v = volumes[i];
    const a = i * 8;
    out[a] = v.center[0];
    out[a + 1] = v.center[1];
    out[a + 2] = v.center[2];
    out[a + 3] = v.shape === "ellipsoid" ? 1 : 0;
    out[a + 4] = v.halfSize[0];
    out[a + 5] = v.halfSize[1];
    out[a + 6] = v.halfSize[2];
    out[a + 7] = v.density;
  }
  return out;
}

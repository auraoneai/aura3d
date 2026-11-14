/**
 * `@aura3d/engine/sculpt` kernel module: smooth one-piece SDF hair masses.
 *
 * One continuous implicit surface per hairstyle: a scalp-hugging ellipsoid shell clipped by a sloped
 * front-to-back hairline (optionally lifted on one side for an undercut), smooth-unioned swept clumps
 * with rounded tips, and shallow longitudinal lock grooves. Reads as combed hair at gameplay distance
 * instead of a helmet or a fan of needle-like lock tubes. Built once per character; nothing runs per frame.
 */
import type { RawMesh, V3 } from "./kernelMath.js";
import { sculptOrganicSdfMesh, smaxCubic, sminCubic } from "./sdfSculpt.js";

/** One swept hair clump: a linearly tapered capsule from `a` (radius `ra`) to the tip `b` (radius `rb`). */
export interface SculptHairClump {
  readonly a: V3;
  readonly b: V3;
  readonly ra: number;
  readonly rb: number;
}

export interface SculptHairMassOptions {
  /**
   * Head pivot. The hairline ramp runs along Z from `headCenter.z - headRadius` (back) to
   * `headCenter.z + headRadius` (front, +Z faces forward); the undercut and groove azimuth are measured
   * around the vertical axis through `headCenter.x` / `headCenter.z`. Default bounds are derived from it.
   */
  readonly headCenter: V3;
  readonly headRadius: number;
  /** Scalp shell ellipsoid centre the hair hugs. Default: `headCenter`. */
  readonly scalpCenter?: V3;
  /** Scalp shell semi-axes (cranium plus hair thickness). Default: `headRadius * [1.05, 1.15, 1.15]`. */
  readonly scalpRadii?: V3;
  /** World-space Y of the hairline at the front of the head. */
  readonly hairlineFront: number;
  /** World-space Y of the hairline at the back of the head (usually lower than the front). */
  readonly hairlineBack: number;
  /** Cubic smooth-max radius rounding the hairline edge. Default `0.018`. */
  readonly hairlineSoftness?: number;
  /** Raises the hairline on one side (`side * (x - headCenter.x) > 0`), reaching `lift` at `headRadius` out. */
  readonly undercut?: { readonly side: 1 | -1; readonly lift: number };
  /** Swept clumps smooth-unioned onto the shell (crown volume, fringe, sweeps, tails). */
  readonly clumps?: readonly SculptHairClump[];
  /** Cubic smooth-min radius blending clumps into the mass. Default `0.03`. */
  readonly clumpBlend?: number;
  /** Amplitude of the longitudinal lock grooves (`0` disables them). Default `0.0024`. */
  readonly grooveDepth?: number;
  /** Number of grooves around the head. Default `9`. */
  readonly grooveCount?: number;
  /** Vertical twist frequency of the grooves (radians per world unit of Y). Default `18`. */
  readonly grooveTwist?: number;
  /** Sampling box. Default: scalp above the hairline plus every clump, padded for blends and grooves. */
  readonly boundsMin?: V3;
  readonly boundsMax?: V3;
  /** Surface-nets grid resolution (clamped to `8..72` per axis). Default `[32, 32, 36]`. */
  readonly resolution?: number | readonly [number, number, number];
  /** Taubin fairing passes. Default `6`. */
  readonly taubinIterations?: number;
  /** Iso re-projection weight after fairing. Default `0.94`. */
  readonly projectToIso?: number;
}

function sdEllipsoidXYZ(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number
): number {
  const px = x - cx;
  const py = y - cy;
  const pz = z - cz;
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return (k0 * (k0 - 1)) / Math.max(1e-6, k1);
}

/** Segment distance minus a linearly interpolated radius (rounder clump tips than the exact cone capsule). */
function sdLinearTaperCapsuleXYZ(x: number, y: number, z: number, c: SculptHairClump): number {
  const ax = c.a[0];
  const ay = c.a[1];
  const az = c.a[2];
  const pax = x - ax;
  const pay = y - ay;
  const paz = z - az;
  const bax = c.b[0] - ax;
  const bay = c.b[1] - ay;
  const baz = c.b[2] - az;
  const baba = Math.max(1e-6, bax * bax + bay * bay + baz * baz);
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / baba));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (c.ra + (c.rb - c.ra) * h);
}

function defaultHairBounds(
  scalpCenter: V3,
  scalpRadii: V3,
  minHairline: number,
  clumps: readonly SculptHairClump[],
  pad: number
): { readonly min: V3; readonly max: V3 } {
  const min = [scalpCenter[0] - scalpRadii[0], Math.max(scalpCenter[1] - scalpRadii[1], minHairline), scalpCenter[2] - scalpRadii[2]];
  const max = [scalpCenter[0] + scalpRadii[0], scalpCenter[1] + scalpRadii[1], scalpCenter[2] + scalpRadii[2]];
  for (const c of clumps) {
    const r = Math.max(c.ra, c.rb);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i]!, c.a[i]! - r, c.b[i]! - r);
      max[i] = Math.max(max[i]!, c.a[i]! + r, c.b[i]! + r);
    }
  }
  return {
    min: [min[0]! - pad, min[1]! - pad, min[2]! - pad],
    max: [max[0]! + pad, max[1]! + pad, max[2]! + pad]
  };
}

/**
 * Sculpts a smooth, watertight, one-piece hair mass for a stylized head (see module notes). Coordinates are
 * world/local mesh units; +Y is up and +Z faces forward. Pair it with a head mesh whose cranium sits just
 * inside `scalpRadii`, and memoize the result per character.
 */
export function sculptHairMassMesh(options: SculptHairMassOptions): RawMesh {
  const head = options.headCenter;
  const r = Math.max(1e-4, options.headRadius);
  const scalpCenter = options.scalpCenter ?? head;
  const scalpRadii = options.scalpRadii ?? ([r * 1.05, r * 1.15, r * 1.15] as const);
  const crx = Math.max(1e-4, scalpRadii[0]);
  const cry = Math.max(1e-4, scalpRadii[1]);
  const crz = Math.max(1e-4, scalpRadii[2]);
  const front = options.hairlineFront;
  const back = options.hairlineBack;
  const softness = options.hairlineSoftness ?? 0.018;
  const clumps = options.clumps ?? [];
  const clumpBlend = options.clumpBlend ?? 0.03;
  const grooveDepth = options.grooveDepth ?? 0.0024;
  const grooveCount = options.grooveCount ?? 9;
  const grooveTwist = options.grooveTwist ?? 18;
  const undercut = options.undercut;
  const hx = head[0];
  const hz = head[2];

  let boundsMin = options.boundsMin;
  let boundsMax = options.boundsMax;
  if (!boundsMin || !boundsMax) {
    const pad = clumpBlend / 6 + Math.abs(grooveDepth) + r * 0.05;
    const auto = defaultHairBounds(scalpCenter, [crx, cry, crz], Math.min(front, back) - softness, clumps, pad);
    boundsMin = boundsMin ?? auto.min;
    boundsMax = boundsMax ?? auto.max;
  }

  return sculptOrganicSdfMesh({
    boundsMin,
    boundsMax,
    resolution: options.resolution ?? [32, 32, 36],
    taubinIterations: options.taubinIterations ?? 6,
    projectToIso: options.projectToIso ?? 0.94,
    evaluate: (x, y, z) => {
      const shell = sdEllipsoidXYZ(x, y, z, scalpCenter[0], scalpCenter[1], scalpCenter[2], crx, cry, crz);
      const t = Math.max(-1, Math.min(1, (z - hz) / r)) * 0.5 + 0.5;
      let hairline = back + (front - back) * t;
      if (undercut) {
        hairline += undercut.lift * Math.max(0, Math.min(1, (undercut.side * (x - hx)) / r));
      }
      let d = smaxCubic(shell, hairline - y, softness);
      for (const c of clumps) {
        d = sminCubic(d, sdLinearTaperCapsuleXYZ(x, y, z, c), clumpBlend);
      }
      if (grooveDepth === 0) return d;
      // Shallow longitudinal lock grooves so the mass reads as combed clumps, not a helmet.
      const az = Math.atan2(x - hx, -(z - hz));
      return d + grooveDepth * Math.sin(az * grooveCount + y * grooveTwist);
    }
  });
}

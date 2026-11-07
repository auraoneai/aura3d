import { edgeNormals, finishGeometry } from "./finish.js";
import { assertFinite, assertInt, newBuffers, type ProceduralGeometry, type ProceduralVec2 } from "./types.js";

export interface LatheOptions {
  /** Profile polyline as [radius, y] pairs, ordered bottom to top for outward-facing normals. Radius 0 sits on the axis. */
  readonly profile: readonly ProceduralVec2[];
  /** Segments around the axis. Default 32. */
  readonly segments?: number;
  /** Start angle in radians. Default 0. */
  readonly phiStart?: number;
  /** Sweep angle in radians. Default 2 PI (full revolution). */
  readonly phiLength?: number;
  /** Turns sharper than this (radians) between profile edges stay hard edges. Default 0.9 (about 52 degrees). */
  readonly creaseAngle?: number;
  /** Reverse the profile order first; use when the profile is given top to bottom. */
  readonly flip?: boolean;
}

/**
 * Surface of revolution (three.js LatheGeometry equivalent) with analytic normals: smooth across gentle profile
 * turns, hard across sharp ones, correct poles on the axis, and UVs (u around, v along the profile length).
 * A profile that starts and ends on the axis (radius 0) produces a watertight solid.
 */
export function latheGeometry(options: LatheOptions): ProceduralGeometry {
  const segments = options.segments ?? 32;
  assertInt(segments, "lathe segments", 3);
  const profile = options.profile;
  if (!profile || profile.length < 2) throw new RangeError("procedural: lathe profile needs at least two points");
  for (const p of profile) {
    assertFinite(p[0], "lathe profile radius"); assertFinite(p[1], "lathe profile y");
    if (p[0] < 0) throw new RangeError("procedural: lathe profile radius must be >= 0");
  }
  const phiStart = options.phiStart ?? 0, phiLength = options.phiLength ?? Math.PI * 2;
  assertFinite(phiStart, "phiStart"); assertFinite(phiLength, "phiLength");
  const pts = options.flip ? [...profile].reverse() : profile;
  const normals2 = edgeNormals(pts, false, options.creaseAngle ?? 0.9);
  const lengths: number[] = [0];
  for (let k = 0; k < pts.length - 1; k += 1) lengths.push(lengths[k]! + Math.hypot(pts[k + 1]![0] - pts[k]![0], pts[k + 1]![1] - pts[k]![1]));
  const total = lengths[lengths.length - 1]!;
  const b = newBuffers();
  const ring = segments + 1;
  for (let k = 0; k < pts.length - 1; k += 1) {
    const base = b.positions.length / 3;
    for (const side of [0, 1] as const) {
      const p = pts[k + side]!;
      const n = side === 0 ? normals2[k]!.start : normals2[k]!.end;
      for (let j = 0; j <= segments; j += 1) {
        const phi = phiStart + (phiLength * j) / segments;
        const s = Math.sin(phi), c = Math.cos(phi);
        b.positions.push(p[0] * s, p[1], p[0] * c);
        b.normals.push(n[0] * s, n[1], n[0] * c);
        b.uvs.push(j / segments, total > 0 ? lengths[k + side]! / total : 0);
      }
    }
    for (let j = 0; j < segments; j += 1) {
      const a0 = base + j, a1 = base + j + 1, b0 = base + ring + j, b1 = base + ring + j + 1;
      const rA = pts[k]![0], rB = pts[k + 1]![0];
      if (rA > 0) b.indices.push(a0, a1, b0);
      if (rB > 0) b.indices.push(a1, b1, b0);
    }
  }
  return finishGeometry(b);
}

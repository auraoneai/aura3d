import { catmullRomCurve, sampleCurve, type ProceduralCurve3 } from "./curves.js";
import { edgeNormals, finishGeometry, normalize3 } from "./finish.js";
import { assertFinite, assertInt, newBuffers, type ProceduralGeometry, type ProceduralVec2, type ProceduralVec3 } from "./types.js";

export interface SweepOptions {
  /** A curve, or control points (threaded by a centripetal Catmull-Rom spline). */
  readonly path: ProceduralCurve3 | readonly ProceduralVec3[];
  /** Rings along the path (arc-length spaced). Default 64. Use 1 for a straight two-point path. */
  readonly steps?: number;
  /** Profile scale, constant or a function of path fraction t in [0, 1]. Default 1. */
  readonly radius?: number | ((t: number) => number);
  /** Counter-clockwise closed polygon in the (normal, binormal) plane, unit scale. Default: a circle of `radialSegments`. */
  readonly profile?: readonly ProceduralVec2[];
  /** Points of the default circular profile. Default 12. */
  readonly radialSegments?: number;
  /** Turns sharper than this (radians) between profile edges stay hard edges. Default 0.9. */
  readonly creaseAngle?: number;
  /** Close open paths with flat caps (fan from the profile centre; star-shaped profiles only). Default true. */
  readonly caps?: boolean;
  /** Extra twist of the profile about the path, total radians. Default 0. */
  readonly twist?: number;
}

function circleProfile(n: number): ProceduralVec2[] {
  return Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2), Math.sin((i / n) * Math.PI * 2)] as const);
}

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rotateAbout(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle), k = cross(axis, v), d = dot(axis, v) * (1 - c);
  return [v[0] * c + k[0] * s + axis[0] * d, v[1] * c + k[1] * s + axis[1] * d, v[2] * c + k[2] * s + axis[2] * d];
}

/**
 * Sweep a profile along a spline with rotation-minimising frames (no flipping, optional twist), variable radius,
 * smooth/hard profile normals, UVs (u around the profile, v along the path) and optional flat end caps.
 * Closed curves wrap the frames so the seam matches. Use it for pipes, ropes, rails, planks, roots and rings.
 */
export function sweepGeometry(options: SweepOptions): ProceduralGeometry {
  const curve: ProceduralCurve3 = Array.isArray(options.path) ? catmullRomCurve(options.path as readonly ProceduralVec3[]) : (options.path as ProceduralCurve3);
  const steps = options.steps ?? 64;
  assertInt(steps, "sweep steps", 1);
  const radialSegments = options.radialSegments ?? 12;
  assertInt(radialSegments, "sweep radialSegments", 3);
  const profile = options.profile ?? circleProfile(radialSegments);
  if (profile.length < 3) throw new RangeError("procedural: sweep profile needs at least three points");
  const twist = options.twist ?? 0;
  assertFinite(twist, "twist");
  const radiusAt = typeof options.radius === "function" ? options.radius : () => (options.radius as number | undefined) ?? 1;
  const samples = sampleCurve(curve, steps);
  const T = samples.tangents.map((t) => [t[0], t[1], t[2]] as V3);

  // Parallel transport of the normal.
  const ref: V3 = Math.abs(T[0]![1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const first = cross(cross(T[0]!, ref), T[0]!);
  const N: V3[] = [normalize3(first[0], first[1], first[2])];
  for (let i = 1; i <= steps; i += 1) {
    const p = N[i - 1]!, t = T[i]!;
    const d = dot(p, t);
    N.push(normalize3(p[0] - t[0] * d, p[1] - t[1] * d, p[2] - t[2] * d));
  }
  if (curve.closed) {
    const last = N[steps]!;
    const theta = Math.atan2(dot(cross(last, N[0]!), T[0]!), dot(last, N[0]!));
    for (let i = 1; i <= steps; i += 1) N[i] = rotateAbout(N[i]!, T[i]!, (theta * i) / steps);
  }
  if (twist !== 0) for (let i = 0; i <= steps; i += 1) N[i] = rotateAbout(N[i]!, T[i]!, (twist * i) / steps);
  const B = N.map((n, i) => cross(T[i]!, n));

  const edges = edgeNormals(profile, true, options.creaseAngle ?? 0.9);
  const perimeter: number[] = [0];
  for (let k = 0; k < profile.length; k += 1) {
    const a = profile[k]!, b2 = profile[(k + 1) % profile.length]!;
    perimeter.push(perimeter[k]! + Math.hypot(b2[0] - a[0], b2[1] - a[1]));
  }
  const perimeterTotal = perimeter[profile.length]!;
  const radii = Array.from({ length: steps + 1 }, (_, i) => radiusAt(i / steps));
  for (const r of radii) if (!(r >= 0) || !Number.isFinite(r)) throw new RangeError("procedural: sweep radius must be finite and >= 0");
  const slope = radii.map((_, i) => {
    const a = Math.max(0, i - 1), c = Math.min(steps, i + 1);
    const ds = samples.lengths[c]! - samples.lengths[a]!;
    return ds > 0 ? (radii[c]! - radii[a]!) / ds : 0;
  });

  const b = newBuffers();
  const m = profile.length;
  const ringAt = (i: number, p: ProceduralVec2): V3 => {
    const o = samples.points[i]!, r = radii[i]!;
    return [o[0] + (N[i]![0] * p[0] + B[i]![0] * p[1]) * r, o[1] + (N[i]![1] * p[0] + B[i]![1] * p[1]) * r, o[2] + (N[i]![2] * p[0] + B[i]![2] * p[1]) * r];
  };
  for (let k = 0; k < m; k += 1) {
    const base = b.positions.length / 3;
    for (const side of [0, 1] as const) {
      const p = profile[(k + side) % m]!;
      const n2 = side === 0 ? edges[k]!.start : edges[k]!.end;
      const v = (perimeter[k + side]! / perimeterTotal);
      for (let i = 0; i <= steps; i += 1) {
        const pos = ringAt(i, p);
        const nx = N[i]![0] * n2[0] + B[i]![0] * n2[1] - T[i]![0] * slope[i]!;
        const ny = N[i]![1] * n2[0] + B[i]![1] * n2[1] - T[i]![1] * slope[i]!;
        const nz = N[i]![2] * n2[0] + B[i]![2] * n2[1] - T[i]![2] * slope[i]!;
        b.positions.push(pos[0], pos[1], pos[2]);
        b.normals.push(...normalize3(nx, ny, nz));
        b.uvs.push(v, i / steps);
      }
    }
    const row = steps + 1;
    for (let i = 0; i < steps; i += 1) {
      const p00 = base + i, p10 = base + i + 1, p01 = base + row + i, p11 = base + row + i + 1;
      b.indices.push(p00, p01, p10, p01, p11, p10);
    }
  }
  if ((options.caps ?? true) && !curve.closed) {
    let cx = 0, cy = 0;
    for (const p of profile) { cx += p[0]; cy += p[1]; }
    const centre: ProceduralVec2 = [cx / m, cy / m];
    for (const end of [0, 1] as const) {
      const i = end === 0 ? 0 : steps;
      const dir = end === 0 ? -1 : 1;
      const base = b.positions.length / 3;
      const c3 = ringAt(i, centre);
      b.positions.push(c3[0], c3[1], c3[2]);
      b.normals.push(T[i]![0] * dir, T[i]![1] * dir, T[i]![2] * dir);
      b.uvs.push(0.5, 0.5);
      for (let k = 0; k < m; k += 1) {
        const p3 = ringAt(i, profile[k]!);
        b.positions.push(p3[0], p3[1], p3[2]);
        b.normals.push(T[i]![0] * dir, T[i]![1] * dir, T[i]![2] * dir);
        b.uvs.push(0.5 + profile[k]![0] * 0.5, 0.5 + profile[k]![1] * 0.5);
      }
      for (let k = 0; k < m; k += 1) {
        const a = base + 1 + k, c = base + 1 + ((k + 1) % m);
        if (end === 1) b.indices.push(base, a, c); else b.indices.push(base, c, a);
      }
    }
  }
  return finishGeometry(b);
}

/**
 * threejs-parity (§5.2, lane L2-02) — `LatheGeometry` verbatim port.
 *
 * The xy profile is revolved about +Y: vertex = (px·sin φ, py, px·cos φ).
 * Meridian normals are pre-computed (edge bisectors, first/last clamped),
 * then rotated with the profile. UVs = (i/segments, j/(points−1)).
 * Indices per quad: (a,b,d)(c,d,b).
 */

import type { ParityMesh } from "./Support";

export interface LatheParityParams {
  readonly points: readonly (readonly [number, number] | { readonly x: number; readonly y: number })[];
  readonly segments?: number;
  readonly phiStart?: number;
  readonly phiLength?: number;
}

export function latheParityMesh(params: LatheParityParams): ParityMesh {
  const points = params.points.map((p) => {
    if (Array.isArray(p)) {
      const arr = p as readonly number[];
      return { x: arr[0]!, y: arr[1]! };
    }
    const obj = p as { readonly x: number; readonly y: number };
    return { x: obj.x, y: obj.y };
  });
  const segments = Math.floor(params.segments ?? 12);
  const phiStart = params.phiStart ?? 0;
  const phiLength = Math.min(Math.max(params.phiLength ?? Math.PI * 2, 0), Math.PI * 2);

  if (points.length < 2) {
    throw new Error("Aura3D lathe requires a profile of at least two points.");
  }

  const indices: number[] = [];
  const vertices: number[] = [];
  const uvs: number[] = [];
  const initNormals: number[] = [];
  const normals: number[] = [];

  const inverseSegments = 1.0 / segments;

  // Pre-compute normals for the initial meridian.
  let prevNx = 0;
  let prevNy = 0;
  let prevNz = 0;
  for (let j = 0; j <= points.length - 1; j += 1) {
    if (j === 0) {
      const dx = points[j + 1]!.x - points[j]!.x;
      const dy = points[j + 1]!.y - points[j]!.y;
      let nx = dy;
      let ny = -dx;
      const nz = 0;
      prevNx = nx;
      prevNy = ny;
      prevNz = nz;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      initNormals.push(nx, ny, nz / l);
    } else if (j === points.length - 1) {
      initNormals.push(prevNx, prevNy, prevNz);
    } else {
      const dx = points[j + 1]!.x - points[j]!.x;
      const dy = points[j + 1]!.y - points[j]!.y;
      const curNx = dy;
      const curNy = -dx;
      const curNz = 0;
      let nx = curNx + prevNx;
      let ny = curNy + prevNy;
      let nz = curNz + prevNz;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      initNormals.push(nx, ny, nz);
      prevNx = curNx;
      prevNy = curNy;
      prevNz = curNz;
    }
  }

  for (let i = 0; i <= segments; i += 1) {
    const phi = phiStart + i * inverseSegments * phiLength;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    for (let j = 0; j <= points.length - 1; j += 1) {
      vertices.push(points[j]!.x * sin, points[j]!.y, points[j]!.x * cos);
      uvs.push(i / segments, j / (points.length - 1));
      normals.push(initNormals[3 * j]! * sin, initNormals[3 * j + 1]!, initNormals[3 * j]! * cos);
    }
  }

  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < points.length - 1; j += 1) {
      const base = j + i * points.length;
      const a = base;
      const b = base + points.length;
      const c = base + points.length + 1;
      const d = base + 1;
      indices.push(a, b, d);
      indices.push(c, d, b);
    }
  }

  return { positions: vertices, normals, uvs, indices };
}

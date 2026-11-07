import { defineAuraCustomGeometry } from "../RootGeometry.js";
import type { GeometryBuffers, ProceduralGeometry } from "./types.js";

/** Wrap plain buffers into a validated custom geometry spec (Float32 attributes, Uint32 indices, tight bounds). */
export function finishGeometry(buffers: GeometryBuffers, extra: { readonly colors?: number[] } = {}): ProceduralGeometry {
  const positions = Float32Array.from(buffers.positions);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      const v = positions[i + a]!;
      if (!Number.isFinite(v)) throw new RangeError("procedural: generated a non-finite position; check the input functions");
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
  }
  return defineAuraCustomGeometry({
    positions,
    normals: Float32Array.from(buffers.normals),
    uvs: Float32Array.from(buffers.uvs),
    ...(extra.colors ? { colors: Float32Array.from(extra.colors) } : {}),
    indices: Uint32Array.from(buffers.indices),
    bounds: { min, max }
  });
}

export function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return l < 1e-20 ? [0, 1, 0] : [x / l, y / l, z / l];
}

/**
 * Per-edge 2D outward normals for a profile polyline (outward = (dy, -dx), i.e. counter-clockwise polygons face out).
 * Returns for each edge the normals at its start and end; neighbouring edges share a smoothed normal when the turn
 * between them is below `creaseAngle` (radians), otherwise each keeps its own face normal (a hard edge).
 */
export function edgeNormals(
  points: ReadonlyArray<readonly [number, number]>,
  closed: boolean,
  creaseAngle: number
): Array<{ readonly start: readonly [number, number]; readonly end: readonly [number, number] }> {
  const edgeCount = closed ? points.length : points.length - 1;
  const face: Array<[number, number]> = [];
  for (let k = 0; k < edgeCount; k += 1) {
    const a = points[k]!, b = points[(k + 1) % points.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-12) throw new RangeError("procedural: profile contains a zero-length edge (duplicate consecutive points)");
    face.push([dy / l, -dx / l]);
  }
  const cos = Math.cos(creaseAngle);
  const blend = (p: [number, number], q: [number, number]): [number, number] => {
    if (p[0] * q[0] + p[1] * q[1] < cos) return p;
    const x = p[0] + q[0], y = p[1] + q[1];
    const l = Math.hypot(x, y);
    return l < 1e-12 ? p : [x / l, y / l];
  };
  return face.map((n, k) => {
    const prev = k > 0 ? face[k - 1]! : closed ? face[edgeCount - 1]! : undefined;
    const next = k < edgeCount - 1 ? face[k + 1]! : closed ? face[0]! : undefined;
    return { start: prev ? blend(n, prev) : n, end: next ? blend(n, next) : n };
  });
}

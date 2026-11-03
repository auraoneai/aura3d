import type { ParityMesh } from "./Support";

export type ConvexPointInput = readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };

export interface ConvexParityParams {
  readonly points: readonly ConvexPointInput[];
}

type Point = readonly [number, number, number];
interface Face {
  readonly corners: readonly [number, number, number];
  readonly normal: Point;
}

const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Point): number => Math.hypot(a[0], a[1], a[2]);

/**
 * Construct a triangulated, outward-facing convex boundary.  We begin with a
 * non-degenerate tetrahedron, then add each exterior point by replacing its
 * visible faces with triangles from their horizon.  The centroid of the seed
 * tetrahedron remains strictly inside every subsequent hull and fixes winding.
 * Duplicate and interior points do not introduce vertices into the surface.
 * Fewer than four distinct non-coplanar points produce an empty mesh.
 */
export function convexParityMesh(params: ConvexParityParams): ParityMesh {
  const points: Point[] = [];
  const seen = new Set<string>();
  for (const input of params.points) {
    const point: Point = Array.isArray(input)
      ? [input[0]!, input[1]!, input[2]!]
      : [(input as { x: number }).x, (input as { y: number }).y, (input as { z: number }).z];
    if (!point.every(Number.isFinite)) throw new RangeError("Convex geometry points must contain finite coordinates.");
    const key = `${point[0]},${point[1]},${point[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      points.push(point);
    }
  }
  const empty: ParityMesh = { positions: [], normals: [] };
  if (points.length < 4) return empty;

  const low = [...points[0]!] as [number, number, number];
  const high = [...low] as [number, number, number];
  const lowIndex = [0, 0, 0];
  const highIndex = [0, 0, 0];
  for (let i = 1; i < points.length; i += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = points[i]![axis]!;
      if (value < low[axis]!) { low[axis] = value; lowIndex[axis] = i; }
      if (value > high[axis]!) { high[axis] = value; highIndex[axis] = i; }
    }
  }
  const spans = high.map((v, i) => v - low[i]!);
  const axis = spans[1]! > spans[0]! ? (spans[2]! > spans[1]! ? 2 : 1) : (spans[2]! > spans[0]! ? 2 : 0);
  const extent = spans[axis]!;
  const magnitude = Math.max(...low.map(Math.abs), ...high.map(Math.abs));
  const epsilon = Math.max(extent * 1e-10, magnitude * Number.EPSILON * 64);
  const a = lowIndex[axis]!;
  const b = highIndex[axis]!;
  if (!(extent > epsilon)) return empty;

  const line = subtract(points[b]!, points[a]!);
  const lineLength = length(line);
  let c = -1;
  let lineDistance = 0;
  for (let i = 0; i < points.length; i += 1) {
    const distance = length(cross(line, subtract(points[i]!, points[a]!))) / lineLength;
    if (distance > lineDistance) { lineDistance = distance; c = i; }
  }
  if (c < 0 || lineDistance <= epsilon) return empty;
  const perpendicular = cross(line, subtract(points[c]!, points[a]!));
  const perpendicularLength = length(perpendicular);
  const planeNormal: Point = [perpendicular[0] / perpendicularLength, perpendicular[1] / perpendicularLength, perpendicular[2] / perpendicularLength];
  let d = -1;
  let planeDistance = 0;
  for (let i = 0; i < points.length; i += 1) {
    const distance = Math.abs(dot(planeNormal, subtract(points[i]!, points[a]!)));
    if (distance > planeDistance) { planeDistance = distance; d = i; }
  }
  if (d < 0 || planeDistance <= epsilon) return empty;

  const seed = [a, b, c, d];
  const interior: Point = [
    seed.reduce((sum, i) => sum + points[i]![0], 0) / 4,
    seed.reduce((sum, i) => sum + points[i]![1], 0) / 4,
    seed.reduce((sum, i) => sum + points[i]![2], 0) / 4
  ];
  const createFace = (first: number, second: number, third: number): Face | undefined => {
    let corners: [number, number, number] = [first, second, third];
    let n = cross(subtract(points[second]!, points[first]!), subtract(points[third]!, points[first]!));
    const nLength = length(n);
    if (!(nLength > epsilon * epsilon)) return undefined;
    n = [n[0] / nLength, n[1] / nLength, n[2] / nLength];
    if (dot(n, subtract(interior, points[first]!)) > 0) {
      corners = [first, third, second];
      n = [-n[0], -n[1], -n[2]];
    }
    return { corners, normal: n };
  };
  let faces: Face[] = [
    createFace(a, b, c)!, createFace(a, d, b)!, createFace(b, d, c)!, createFace(c, d, a)!
  ];
  const seedSet = new Set(seed);
  for (let i = 0; i < points.length; i += 1) {
    if (seedSet.has(i)) continue;
    const visible: Face[] = [];
    const kept: Face[] = [];
    for (const face of faces) {
      if (dot(face.normal, subtract(points[i]!, points[face.corners[0]]!)) > epsilon) visible.push(face);
      else kept.push(face);
    }
    if (visible.length === 0) continue;

    // An edge shared by two removed triangles is internal; edges seen once
    // form the boundary between visible and retained faces.
    const horizon = new Map<string, readonly [number, number] | null>();
    for (const face of visible) {
      for (let side = 0; side < 3; side += 1) {
        const from = face.corners[side]!;
        const to = face.corners[(side + 1) % 3]!;
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        if (horizon.has(key)) horizon.set(key, null);
        else horizon.set(key, [from, to]);
      }
    }
    for (const edge of horizon.values()) {
      if (edge === null) continue;
      const face = createFace(edge[0], edge[1], i);
      if (face) kept.push(face);
    }
    faces = kept;
  }
  const positions: number[] = [];
  const normals: number[] = [];
  for (const face of faces) {
    for (const corner of face.corners) {
      positions.push(...points[corner]!);
      normals.push(...face.normal);
    }
  }
  return { positions, normals };
}

/** Geometry generator for regular polyhedra and caller-supplied triangular bases. */
import type { ParityMesh } from "./Support";

export type PolyhedronVariant = "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron";

export interface PolyhedronParityParams {
  readonly radius?: number;
  readonly detail?: number;
  readonly variant?: PolyhedronVariant;
}

type Point = readonly [number, number, number];

const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (p: Point): number => Math.hypot(...p);
const normalize = (p: Point): Point => {
  const size = length(p);
  return size > 0 ? [p[0] / size, p[1] / size, p[2] / size] : [0, 0, 0];
};

/** Construct the vertices from regular-solid coordinate identities. */
function solidPoints(variant: PolyhedronVariant): Point[] {
  const p: Point[] = [];
  if (variant === "tetrahedron") return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  if (variant === "octahedron") return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const phi = (1 + Math.sqrt(5)) / 2;
  if (variant === "dodecahedron") {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) p.push([x, y, z]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      p.push([0, a / phi, b * phi], [a / phi, b * phi, 0], [a * phi, 0, b / phi]);
    }
  } else {
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      p.push([0, a, b * phi], [a, b * phi, 0], [a * phi, 0, b]);
    }
  }
  return p;
}

/**
 * Enumerate supporting planes of a small convex point set. Coplanar points
 * form one polygon, ordered around the plane, before fan triangulation.
 */
function convexFaces(points: readonly Point[]): number[] {
  const seen = new Set<string>();
  const triangles: number[] = [];
  const epsilon = 1e-8;
  for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
    for (let c = b + 1; c < points.length; c += 1) {
      let normal = cross(subtract(points[b]!, points[a]!), subtract(points[c]!, points[a]!));
      if (length(normal) < epsilon) continue;
      normal = normalize(normal);
      const distances = points.map((p) => dot(normal, subtract(p, points[a]!)));
      if (distances.some((d) => d > epsilon) && distances.some((d) => d < -epsilon)) continue;
      const face = distances.flatMap((d, index) => Math.abs(d) <= epsilon ? [index] : []);
      const key = face.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const center: Point = [
        face.reduce((sum, i) => sum + points[i]![0], 0) / face.length,
        face.reduce((sum, i) => sum + points[i]![1], 0) / face.length,
        face.reduce((sum, i) => sum + points[i]![2], 0) / face.length
      ];
      if (dot(normal, center) < 0) normal = [-normal[0], -normal[1], -normal[2]];
      const u = normalize(subtract(points[face[0]!]!, center));
      const v = cross(normal, u);
      face.sort((i, j) => {
        const pi = subtract(points[i]!, center);
        const pj = subtract(points[j]!, center);
        return Math.atan2(dot(pi, v), dot(pi, u)) - Math.atan2(dot(pj, v), dot(pj, u));
      });
      for (let i = 1; i + 1 < face.length; i += 1) triangles.push(face[0]!, face[i]!, face[i + 1]!);
    }
  }
  return triangles;
}

/** Project a triangular base onto a sphere after barycentric subdivision. */
export function polyhedronParityMeshFromBase(vertices: readonly number[], indices: readonly number[], radius = 1, detail = 0): ParityMesh {
  if (!Number.isFinite(radius) || !Number.isInteger(detail) || detail < 0) {
    throw new RangeError("Polyhedron radius must be finite and detail must be a nonnegative integer");
  }
  if (vertices.length % 3 !== 0 || indices.length % 3 !== 0 || vertices.some((n) => !Number.isFinite(n))) {
    throw new RangeError("Polyhedron base must contain finite XYZ vertices and triangle indices");
  }
  if (indices.some((i) => !Number.isInteger(i) || i < 0 || i * 3 + 2 >= vertices.length)) {
    throw new RangeError("Polyhedron base index is outside its vertex array");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const subdivisions = detail + 1;
  const read = (i: number): Point => [vertices[i * 3]!, vertices[i * 3 + 1]!, vertices[i * 3 + 2]!];
  const project = (p: Point): Point => {
    const unit = normalize(p);
    return [unit[0] * radius, unit[1] * radius, unit[2] * radius];
  };
  const emit = (a: Point, b: Point, c: Point): void => {
    const tri = [project(a), project(b), project(c)];
    const flat = normalize(cross(subtract(tri[1]!, tri[0]!), subtract(tri[2]!, tri[0]!)));
    const tex = tri.map((p) => {
      const h = Math.hypot(p[0], p[2]);
      return [0.5 + Math.atan2(p[2], p[0]) / (2 * Math.PI), 0.5 + Math.atan2(p[1], h) / Math.PI];
    });
    // A face crossing the longitude seam needs neighboring U coordinates in
    // the same repetition of the texture. At a pole use its neighbors' U.
    const nonPoles = tri.map((p, i) => Math.hypot(p[0], p[2]) > 1e-12 ? i : -1).filter((i) => i >= 0);
    if (nonPoles.length > 0) {
      let best: number[] = [];
      let bestWidth = Infinity;
      for (const anchorIndex of nonPoles) {
        const anchor = tex[anchorIndex]![0]!;
        const candidate = nonPoles.map((i) => tex[i]![0]! + Math.round(anchor - tex[i]![0]!));
        const width = Math.max(...candidate) - Math.min(...candidate);
        if (width < bestWidth) { bestWidth = width; best = candidate; }
      }
      nonPoles.forEach((i, j) => { tex[i]![0] = best[j]!; });
      const poleU = nonPoles.reduce((sum, i) => sum + tex[i]![0]!, 0) / nonPoles.length;
      for (let i = 0; i < 3; i += 1) if (!nonPoles.includes(i)) tex[i]![0] = poleU;
    }
    for (let i = 0; i < 3; i += 1) {
      const p = tri[i]!;
      const n = detail === 0 ? flat : normalize(p);
      positions.push(...p);
      normals.push(...n);
      uvs.push(tex[i]![0]!, tex[i]![1]!);
    }
  };
  for (let face = 0; face < indices.length; face += 3) {
    const a = read(indices[face]!);
    const b = read(indices[face + 1]!);
    const c = read(indices[face + 2]!);
    const point = (i: number, j: number): Point => {
      const x = i / subdivisions;
      const y = j / subdivisions;
      return [a[0] * (1 - x - y) + b[0] * x + c[0] * y, a[1] * (1 - x - y) + b[1] * x + c[1] * y, a[2] * (1 - x - y) + b[2] * x + c[2] * y];
    };
    for (let i = 0; i < subdivisions; i += 1) for (let j = 0; j < subdivisions - i; j += 1) {
      emit(point(i, j), point(i + 1, j), point(i, j + 1));
      if (i + j + 1 < subdivisions) emit(point(i + 1, j), point(i + 1, j + 1), point(i, j + 1));
    }
  }
  return { positions, normals, uvs };
}

export function polyhedronParityMesh(params: PolyhedronParityParams = {}): ParityMesh {
  const variant = params.variant ?? "icosahedron";
  if (!["tetrahedron", "octahedron", "icosahedron", "dodecahedron"].includes(variant)) throw new RangeError(`Unknown polyhedron variant: ${variant}`);
  const points = solidPoints(variant);
  return polyhedronParityMeshFromBase(points.flat(), convexFaces(points), params.radius ?? 1, params.detail ?? 0);
}

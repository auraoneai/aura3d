import type { ParityMesh } from "./Support";

/** A point on a parametric surface, in object space. */
export type SurfacePoint = readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };

export interface ParametricGeometryOptions {
  /** Evaluated on [0, 1]²; the first and last samples must agree on a closed axis. */
  readonly surface: (u: number, v: number) => SurfacePoint;
  readonly uSegments?: number;
  readonly vSegments?: number;
  /** Duplicate the periodic boundary for UVs while retaining matching positions and normals. */
  readonly closedU?: boolean;
  readonly closedV?: boolean;
}

const MAX_VERTICES = 1_048_576;
const DERIVATIVE_STEP = 1e-5;

type Point = [number, number, number];

function segmentCount(value: number | undefined, name: string): number {
  const count = value ?? 16;
  if (!Number.isInteger(count) || count < 1 || count > 1024) {
    throw new RangeError(`parametricGeometry: ${name} must be an integer between 1 and 1024`);
  }
  return count;
}

function asPoint(value: SurfacePoint): Point {
  if (value === null || typeof value !== "object") {
    throw new RangeError("parametricGeometry: surface must return a 3D point");
  }
  const point: Point = Array.isArray(value)
    ? [value[0] as number, value[1] as number, value[2] as number]
    : [(value as { x: number }).x, (value as { y: number }).y, (value as { z: number }).z];
  if (!point.every(Number.isFinite)) throw new RangeError("parametricGeometry: surface returned a non-finite point");
  return point;
}

function unitCross(a: Point, b: Point): Point {
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  if (!Number.isFinite(la) || !Number.isFinite(lb)) throw new RangeError("parametricGeometry: surface coordinate range is too large");
  if (la === 0 || lb === 0) return [0, 0, 0];
  const x: Point = [a[0] / la, a[1] / la, a[2] / la];
  const y: Point = [b[0] / lb, b[1] / lb, b[2] / lb];
  const cross: Point = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const length = Math.hypot(...cross);
  return length > 1e-12 ? [cross[0] / length, cross[1] / length, cross[2] / length] : [0, 0, 0];
}

/**
 * Sample a surface into an indexed triangle grid. UV seams are represented by
 * duplicate vertices, not by triangles spanning both ends of the UV domain.
 * Numerical derivatives give smooth normals; triangle normals are used at
 * isolated singularities such as the poles of a sphere.
 */
export function parametricGeometry(options: ParametricGeometryOptions): ParityMesh {
  if (!options || typeof options.surface !== "function") throw new TypeError("parametricGeometry: surface must be a function");
  const uSegments = segmentCount(options.uSegments, "uSegments");
  const vSegments = segmentCount(options.vSegments, "vSegments");
  if ((uSegments + 1) * (vSegments + 1) > MAX_VERTICES) {
    throw new RangeError("parametricGeometry: vertex limit exceeded");
  }
  const { surface, closedU = false, closedV = false } = options;
  const sample = (u: number, v: number): Point => asPoint(surface(u, v));
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const row = vSegments + 1;

  // Check against the sampled object's extent, not a fixed world-unit epsilon;
  // otherwise a small but clearly open surface could pass as a closed seam.
  const checkSeam = (axis: "u" | "v", divisions: number): void => {
    const points: Point[] = [];
    const pairs: [Point, Point][] = [];
    let scale = 0;
    for (let i = 0; i <= divisions; i += 1) {
      const t = i / divisions;
      const probes = [0, 0.25, 0.5, 0.75, 1].map((s) => axis === "u" ? sample(s, t) : sample(t, s));
      pairs.push([probes[0]!, probes[4]!]);
      for (const p of probes) {
        points.push(p);
        scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
      }
    }
    if (scale === 0) return;
    const min: Point = [Infinity, Infinity, Infinity];
    const max: Point = [-Infinity, -Infinity, -Infinity];
    for (const p of points) for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, p[k]! / scale);
      max[k] = Math.max(max[k]!, p[k]! / scale);
    }
    const extent = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const tolerance = extent * 1e-7 + Number.EPSILON * 16;
    for (const [a, b] of pairs) {
      if (Math.hypot(a[0] / scale - b[0] / scale, a[1] / scale - b[1] / scale, a[2] / scale - b[2] / scale) > tolerance) {
        throw new RangeError(`parametricGeometry: closed ${axis} boundary does not meet`);
      }
    }
  };
  if (closedU) checkSeam("u", vSegments);
  if (closedV) checkSeam("v", uSegments);

  const offset = (t: number, delta: number, closed: boolean): number => {
    if (!closed) return Math.max(0, Math.min(1, t + delta));
    return ((t + delta) % 1 + 1) % 1;
  };
  for (let i = 0; i <= uSegments; i += 1) {
    const u = i / uSegments;
    for (let j = 0; j <= vSegments; j += 1) {
      const v = j / vSegments;
      // Reuse the canonical periodic endpoint so seam positions are identical.
      const su = closedU && i === uSegments ? 0 : u;
      const sv = closedV && j === vSegments ? 0 : v;
      const p = sample(su, sv);
      positions.push(...p);
      uvs.push(u, v);
      const u0 = sample(offset(su, -DERIVATIVE_STEP, closedU), sv);
      const u1 = sample(offset(su, DERIVATIVE_STEP, closedU), sv);
      const v0 = sample(su, offset(sv, -DERIVATIVE_STEP, closedV));
      const v1 = sample(su, offset(sv, DERIVATIVE_STEP, closedV));
      normals.push(...unitCross([u1[0] - u0[0], u1[1] - u0[1], u1[2] - u0[2]], [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]));
    }
  }

  const fallback = new Array<number>(positions.length).fill(0);
  const addTriangle = (a: number, b: number, c: number): void => {
    const ax = positions[b * 3]! - positions[a * 3]!;
    const ay = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
    const az = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const bx = positions[c * 3]! - positions[a * 3]!;
    const by = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
    const bz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const [nx, ny, nz] = unitCross([ax, ay, az], [bx, by, bz]);
    // Collapsed quads, e.g. at a pole, do not produce invalid triangles.
    if (nx === 0 && ny === 0 && nz === 0) return;
    indices.push(a, b, c);
    for (const k of [a, b, c]) {
      fallback[k * 3] = fallback[k * 3]! + nx;
      fallback[k * 3 + 1] = fallback[k * 3 + 1]! + ny;
      fallback[k * 3 + 2] = fallback[k * 3 + 2]! + nz;
    }
  };
  for (let i = 0; i < uSegments; i += 1) {
    for (let j = 0; j < vSegments; j += 1) {
      const a = i * row + j;
      const b = a + row;
      addTriangle(a, b, a + 1);
      addTriangle(b, b + 1, a + 1);
    }
  }
  if (indices.length === 0) throw new RangeError("parametricGeometry: surface has no non-degenerate triangles");
  // For singular samples, sum all coincident face contributions (including the
  // other copy of a seam) before normalization.
  const singular = new Map<string, Point>();
  for (let i = 0; i < normals.length; i += 3) {
    if (Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) !== 0) continue;
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
    const sum = singular.get(key) ?? [0, 0, 0];
    sum[0] += fallback[i]!;
    sum[1] += fallback[i + 1]!;
    sum[2] += fallback[i + 2]!;
    singular.set(key, sum);
  }
  for (let i = 0; i < normals.length; i += 3) {
    if (Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) !== 0) continue;
    const sum = singular.get(`${positions[i]},${positions[i + 1]},${positions[i + 2]}`)!;
    const length = Math.hypot(...sum);
    if (length > 1e-15) {
      normals[i] = sum[0] / length;
      normals[i + 1] = sum[1] / length;
      normals[i + 2] = sum[2] / length;
    } else {
      throw new RangeError("parametricGeometry: cannot determine a normal at a degenerate sample");
    }
  }
  return { positions, normals, uvs, indices };
}

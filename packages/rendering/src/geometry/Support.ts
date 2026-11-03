/**
 * Geometry support routines for the native primitive builders.
 *
 * Provenance (reviewed 2026-11-02, WP-13/WP-29): the curve adapter, frame
 * transport and axis rotation were rewritten from the cited published methods
 * (chord-length arc tables, double-reflection rotation-minimizing frames,
 * Rodrigues' rotation formula), replacing portions of an earlier port.
 * Triangulation delegates to `@aura3d/math`'s independent polygon
 * triangulator; no earlier earcut-derived code remains in this file. See
 * docs/prds/aura3d-native-provenance-record.json.
 */
import {
  CatmullRomCurve3,
  Matrix4,
  Vector2,
  Vector3,
  earcut as mathEarcut,
  isClockWise as mathIsClockWise,
  shapeArea as mathShapeArea,
  triangulateShape as mathTriangulateShape,
} from "@aura3d/math";
import type { Curve, FrenetFrame } from "@aura3d/math";
import { Geometry } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";

export interface ParityMesh {
  readonly positions: number[];
  readonly normals?: number[];
  readonly uvs?: number[];
  readonly indices?: number[];
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
}
export interface ParityBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function computeParityBounds(positions: ArrayLike<number>): ParityBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const x = positions[i + axis]!;
      min[axis] = Math.min(min[axis]!, x);
      max[axis] = Math.max(max[axis]!, x);
    }
  }
  return { min, max };
}

/** Average triangle-space tangents at each vertex; degenerate UVs get a stable fallback. */
export function computeParityTangents(positions: ArrayLike<number>, uvs: ArrayLike<number>, indices: readonly number[]): Float32Array {
  const count = positions.length / 3;
  const accumulated = new Float64Array(count * 3);
  const contributionLengths = new Float64Array(count);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]!, b = indices[i + 1]!, c = indices[i + 2]!;
    const du1 = uvs[b * 2]! - uvs[a * 2]!, dv1 = uvs[b * 2 + 1]! - uvs[a * 2 + 1]!;
    const du2 = uvs[c * 2]! - uvs[a * 2]!, dv2 = uvs[c * 2 + 1]! - uvs[a * 2 + 1]!;
    const determinant = du1 * dv2 - du2 * dv1;
    if (Math.abs(determinant) < 1e-12) continue;
    const tangent = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const p = positions[a * 3 + axis]!;
      tangent[axis] = ((positions[b * 3 + axis]! - p) * dv2 - (positions[c * 3 + axis]! - p) * dv1) / determinant;
    }
    const contributionLength = Math.hypot(...tangent);
    for (const vertex of [a, b, c]) {
      for (let axis = 0; axis < 3; axis += 1) accumulated[vertex * 3 + axis]! += tangent[axis]!;
      contributionLengths[vertex]! += contributionLength;
    }
  }
  const result = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const x = accumulated[i * 3]!, y = accumulated[i * 3 + 1]!, z = accumulated[i * 3 + 2]!;
    const length = Math.hypot(x, y, z);
    // Compare cancellation against the contributing tangent magnitudes, not
    // against world units: uniformly scaling a mesh must not change its
    // tangent directions. A zero, cancelled or nonfinite sum keeps the same
    // deterministic fallback and handedness as before.
    const usable = Number.isFinite(length) && Number.isFinite(contributionLengths[i]!)
      && length > 0 && length > contributionLengths[i]! * 1e-12;
    result.set(usable ? [x / length, y / length, z / length, 1] : [1, 0, 0, 1], i * 4);
  }
  return result;
}

/** Calculate normalized, equally weighted triangle normals. */
export function computeVertexNormals(positions: ArrayLike<number>, indices?: readonly number[]): number[] {
  const normals = new Array<number>(positions.length).fill(0);
  const order = indices ?? Array.from({ length: Math.floor(positions.length / 3) }, (_, i) => i);
  for (let i = 0; i + 2 < order.length; i += 3) {
    const a = order[i]!, b = order[i + 1]!, c = order[i + 2]!;
    const ab = new Vector3(positions[b * 3]! - positions[a * 3]!, positions[b * 3 + 1]! - positions[a * 3 + 1]!, positions[b * 3 + 2]! - positions[a * 3 + 2]!);
    const ac = new Vector3(positions[c * 3]! - positions[a * 3]!, positions[c * 3 + 1]! - positions[a * 3 + 1]!, positions[c * 3 + 2]! - positions[a * 3 + 2]!);
    const n = ab.cross(ac).normalize();
    for (const vertex of [a, b, c]) {
      normals[vertex * 3]! += n.x;
      normals[vertex * 3 + 1]! += n.y;
      normals[vertex * 3 + 2]! += n.z;
    }
  }
  for (let i = 0; i + 2 < normals.length; i += 3) {
    const n = new Vector3(normals[i]!, normals[i + 1]!, normals[i + 2]!).normalize();
    normals[i] = n.x; normals[i + 1] = n.y; normals[i + 2] = n.z;
  }
  return normals;
}

export function parityMeshToGeometry(mesh: ParityMesh, topology: "triangles" | "lines" = "triangles"): Geometry {
  const count = mesh.positions.length / 3;
  if (count === 0) {
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    buffer.setAttribute(0, "position", [0, 0, 0]);
    return new Geometry(buffer, null, topology, { min: [0, 0, 0], max: [0, 0, 0] });
  }
  const order = mesh.indices ?? Array.from({ length: count }, (_, i) => i);
  const normals = mesh.normals ?? computeVertexNormals(mesh.positions, order);
  const hasUV = mesh.uvs?.length === count * 2;
  const vertices = new VertexBuffer(hasUV ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, count);
  const tangents = hasUV ? computeParityTangents(mesh.positions, mesh.uvs!, order) : undefined;
  for (let i = 0; i < count; i += 1) {
    vertices.setAttribute(i, "position", mesh.positions.slice(i * 3, i * 3 + 3));
    vertices.setAttribute(i, "normal", normals.slice(i * 3, i * 3 + 3));
    if (hasUV) {
      vertices.setAttribute(i, "uv", mesh.uvs!.slice(i * 2, i * 2 + 2));
      vertices.setAttribute(i, "tangent", Array.from(tangents!.slice(i * 4, i * 4 + 4)));
    }
  }
  const geometry = new Geometry(vertices, order.length ? new IndexBuffer(order, count) : null, topology, computeParityBounds(mesh.positions));
  if (mesh.groups) geometry.groups = mesh.groups.map((group) => ({ ...group }));
  return geometry;
}

export interface ResolvedShape2D { readonly shape: Vector2[]; readonly holes: Vector2[][] }
type Point2 = { readonly x: number; readonly y: number };
type Vec2Like = Point2 | readonly [number, number];
function points2(value: unknown): Vector2[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points: Vector2[] = [];
  for (const valuePoint of value) {
    const p = valuePoint as Vec2Like;
    const x = Array.isArray(p) ? p[0] : (p as Point2)?.x;
    const y = Array.isArray(p) ? p[1] : (p as Point2)?.y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    points.push(new Vector2(x, y));
  }
  return points;
}
export function resolveShape2D(input: unknown, curveSegments = 12): ResolvedShape2D {
  const direct = points2(input);
  if (direct) return { shape: direct, holes: [] };
  if (typeof input === "object" && input !== null) {
    const value = input as Record<string, unknown>;
    if (typeof value.extractPoints === "function") {
      const extracted = (value.extractPoints as (segments: number) => { shape: unknown; holes?: unknown[] })(curveSegments);
      const shape = points2(extracted.shape);
      if (!shape) throw new TypeError("Shape extraction returned invalid points.");
      return { shape, holes: (extracted.holes ?? []).map((hole) => {
        const result = points2(hole);
        if (!result) throw new TypeError("Shape extraction returned an invalid hole.");
        return result;
      }) };
    }
    for (const key of ["shape", "contour", "points", "outline"]) {
      const shape = points2(value[key]);
      if (shape) return { shape, holes: (Array.isArray(value.holes) ? value.holes : []).map((hole) => {
        const result = points2(hole);
        if (!result) throw new TypeError("Shape contains an invalid hole.");
        return result;
      }) };
    }
    if (typeof value.getPoints === "function") {
      const shape = points2((value.getPoints as () => unknown)());
      if (shape) return { shape, holes: [] };
    }
  }
  throw new TypeError("Aura3D shape/extrude requires a finite point outline or a Shape with extractPoints.");
}

function toMathPoints(points: readonly Point2[]): Vector2[] {
  return points.map(({ x, y }) => new Vector2(x, y));
}

export function shapeArea(contour: readonly Point2[]): number {
  return mathShapeArea(toMathPoints(contour));
}

export function isClockWise(points: readonly Point2[]): boolean {
  return mathIsClockWise(toMathPoints(points));
}

export function removeDupEndPts(points: { x: number; y: number }[]): void {
  if (points.length < 3) return;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.x === last.x && first.y === last.y) points.pop();
}

/**
 * Polygon triangulation using visible cuts. Each returned index addresses the
 * original input point; no synthetic vertices escape.
 * Intersecting contours, holes outside the outline and non-simple rings throw.
 * Work is bounded to 4,096 holes and 8,000,000 geometric predicates; valid
 * inputs exceeding either bound throw rather than return incomplete faces.
 */
export function earcut(data: ArrayLike<number>, holeIndices: readonly number[] | null | undefined, dim = 2): number[] {
  return mathEarcut(data, holeIndices ?? null, dim);
}

/** Indices address the contour followed by its holes, excluding closing duplicates. */
export function triangulateShape(contour: readonly Point2[], holes: readonly (readonly Point2[])[]): number[][] {
  return mathTriangulateShape(toMathPoints(contour), holes.map(toMathPoints));
}

type Triple = [number, number, number];
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const dot3 = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Triple, b: Triple): Triple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const triple = (v: Vector3): Triple => [v.x, v.y, v.z];
const vector = (v: Triple): Vector3 => new Vector3(v[0], v[1], v[2]);
function unit(v: Triple): Triple | undefined {
  const length = Math.hypot(v[0], v[1], v[2]);
  return Number.isFinite(length) && length > 1e-12 ? [v[0] / length, v[1] / length, v[2] / length] : undefined;
}
/** Reflect `v` in the plane through the origin whose normal is `n` (`n·n = nn`). */
function reflect(v: Triple, n: Triple, nn: number): Triple {
  const k = 2 * dot3(n, v) / nn;
  return [v[0] - k * n[0], v[1] - k * n[1], v[2] - k * n[2]];
}
/** Rotate `v` about unit axis `k` by `angle` (vector form of Rodrigues' rotation formula). */
function rotateAbout(v: Triple, k: Triple, angle: number): Triple {
  const c = Math.cos(angle), s = Math.sin(angle), along = dot3(k, v) * (1 - c), kv = cross3(k, v);
  return [v[0] * c + kv[0] * s + k[0] * along, v[1] * c + kv[1] * s + k[1] * along, v[2] * c + kv[2] * s + k[2] * along];
}

/** Rotation by `angle` about a unit `axis`, as a column-major matrix built from rotated basis vectors. */
export function rotationAxisMatrix(axis: Vector3, angle: number): Matrix4 {
  const k: Triple = [axis.x, axis.y, axis.z];
  const x = rotateAbout([1, 0, 0], k, angle), y = rotateAbout([0, 1, 0], k, angle), z = rotateAbout([0, 0, 1], k, angle);
  return new Matrix4([...x, 0, ...y, 0, ...z, 0, 0, 0, 0, 1]);
}

/** Parameter step used for finite-difference tangents. */
const TANGENT_STEP = 1e-4;

/**
 * Adapts a point sampler `t -> point` (t in [0, 1]) to the public Curve
 * contract.
 *
 * - Arc length is the cumulative chord length of `arcLengthDivisions` uniform
 *   parameter samples; arc-length fractions are inverted by interpolating that
 *   monotone table.
 * - Tangents are normalized finite differences of the sampler.
 * - Frames are rotation-minimizing frames computed with the double-reflection
 *   method (Wang, Juttler, Zheng and Liu, "Computation of Rotation Minimizing
 *   Frames", ACM Transactions on Graphics 27(1), 2008). On closed curves the
 *   residual twist between the last and first normal is spread linearly along
 *   the curve so the seam frames coincide.
 */
export class Curve3Adapter implements Curve<Vector3> {
  readonly arcLengthDivisions = 200;
  closed = false;
  isCatmullRomCurve3 = false;
  private table?: number[];
  constructor(private readonly sampler: (t: number) => Vector3) {}

  getPoint(t: number): Vector3 { return this.sampler(clamp(t, 0, 1)); }
  getPointAt(u: number): Vector3 { return this.getPoint(this.getUtoTmapping(u)); }
  getTangent(t: number): Vector3 {
    const at = clamp(t, 0, 1);
    // A closed curve wraps, so its seam gets a central rather than one-sided difference.
    const before = this.closed && at - TANGENT_STEP < 0 ? at - TANGENT_STEP + 1 : Math.max(0, at - TANGENT_STEP);
    const after = this.closed && at + TANGENT_STEP > 1 ? at + TANGENT_STEP - 1 : Math.min(1, at + TANGENT_STEP);
    const a = this.getPoint(before), b = this.getPoint(after);
    const direction = unit([b.x - a.x, b.y - a.y, b.z - a.z]);
    return direction ? vector(direction) : new Vector3(0, 0, 0);
  }
  getTangentAt(u: number): Vector3 { return this.getTangent(this.getUtoTmapping(u)); }
  getPoints(divisions = 5): Vector3[] {
    const count = Math.max(1, Math.floor(divisions));
    const points: Vector3[] = [];
    for (let i = 0; i <= count; i += 1) points.push(this.getPoint(i / count));
    return points;
  }
  getSpacedPoints(divisions = 5): Vector3[] {
    const count = Math.max(1, Math.floor(divisions));
    const points: Vector3[] = [];
    for (let i = 0; i <= count; i += 1) points.push(this.getPointAt(i / count));
    return points;
  }
  getLength(): number { const table = this.getLengths(); return table[table.length - 1]!; }
  getLengths(divisions = this.arcLengthDivisions): number[] {
    const count = Math.max(1, Math.floor(divisions));
    if (this.table && this.table.length === count + 1) return this.table;
    const table = new Array<number>(count + 1);
    table[0] = 0;
    let previous = this.getPoint(0);
    for (let i = 1; i <= count; i += 1) {
      const current = this.getPoint(i / count);
      table[i] = table[i - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
      previous = current;
    }
    this.table = table;
    return table;
  }
  updateArcLengths(): void { this.table = undefined; }
  getUtoTmapping(u: number): number {
    const fraction = clamp(u, 0, 1);
    const table = this.getLengths(), last = table.length - 1, total = table[last]!;
    if (!(total > 0)) return fraction;
    const target = fraction * total;
    // Find the last sample whose cumulative length does not exceed the target.
    let low = 0, high = last;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (table[middle]! <= target) low = middle; else high = middle;
    }
    const span = table[low + 1]! - table[low]!;
    const local = span > 0 ? clamp((target - table[low]!) / span, 0, 1) : 0;
    return (low + local) / last;
  }
  computeFrenetFrames(segments: number, closed = false): FrenetFrame {
    const count = Math.max(1, Math.floor(segments));
    const points: Triple[] = [], tangents: Triple[] = [];
    for (let i = 0; i <= count; i += 1) {
      points.push(triple(this.getPointAt(i / count)));
      const direction = unit(triple(this.getTangentAt(i / count)));
      tangents.push(direction ?? (i > 0 ? tangents[i - 1]! : [0, 0, 1]));
    }
    if (closed) {
      // The seam tangent of a closed curve is a central difference across t = 0 / 1.
      const a = this.getPoint(1 - TANGENT_STEP), b = this.getPoint(TANGENT_STEP);
      tangents[0] = unit([b.x - a.x, b.y - a.y, b.z - a.z]) ?? tangents[0]!;
      tangents[count] = tangents[0]!;
      points[count] = points[0]!;
    }
    // Initial normal: the coordinate axis least aligned with the first
    // tangent, made orthogonal to it (ties resolve x, then y, then z).
    const first = tangents[0]!;
    const axes: Triple[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let seed = axes[0]!;
    for (const axis of axes) if (Math.abs(dot3(first, axis)) < Math.abs(dot3(first, seed))) seed = axis;
    const along = dot3(seed, first);
    const normals: Triple[] = [unit([seed[0] - along * first[0], seed[1] - along * first[1], seed[2] - along * first[2]])!];
    for (let i = 0; i < count; i += 1) {
      const step: Triple = [points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1], points[i + 1]![2] - points[i]![2]];
      const stepSquared = dot3(step, step);
      let normal = normals[i]!, tangent = tangents[i]!;
      // First reflection maps the frame across the bisecting plane of the
      // chord; the second aligns the reflected tangent with the next tangent.
      if (stepSquared > 1e-24) {
        normal = reflect(normal, step, stepSquared);
        tangent = reflect(tangent, step, stepSquared);
      }
      const next = tangents[i + 1]!;
      const correction: Triple = [next[0] - tangent[0], next[1] - tangent[1], next[2] - tangent[2]];
      const correctionSquared = dot3(correction, correction);
      if (correctionSquared > 1e-24) normal = reflect(normal, correction, correctionSquared);
      // Remove rounding drift so each normal stays orthogonal to its tangent.
      const drift = dot3(normal, next);
      normals.push(unit([normal[0] - drift * next[0], normal[1] - drift * next[1], normal[2] - drift * next[2]]) ?? normals[i]!);
    }
    if (closed) {
      const start = normals[0]!, end = normals[count]!;
      const twist = Math.atan2(dot3(first, cross3(end, start)), clamp(dot3(end, start), -1, 1));
      for (let i = 1; i <= count; i += 1) normals[i] = unit(rotateAbout(normals[i]!, tangents[i]!, twist * i / count)) ?? normals[i]!;
    }
    return {
      tangents: tangents.map(vector),
      normals: normals.map(vector),
      binormals: tangents.map((tangent, i) => vector(unit(cross3(tangent, normals[i]!)) ?? [0, 0, 0]))
    };
  }
}
type Vec3Like = Vector3 | readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };
function toVector3(value: Vec3Like): Vector3 {
  if (Array.isArray(value)) return new Vector3(value[0], value[1], value[2]);
  const point = value as { readonly x: number; readonly y: number; readonly z: number };
  return new Vector3(point.x, point.y, point.z);
}
export function resolveCurve3(input: unknown): Curve<Vector3> {
  if (typeof input === "object" && input !== null && typeof (input as { getPoint?: unknown }).getPoint === "function") {
    const value = input as { getPoint(t: number): Vec3Like; getPointAt?: unknown; getSpacedPoints?: unknown; getUtoTmapping?: unknown; computeFrenetFrames?: unknown; closed?: boolean; isCatmullRomCurve3?: boolean };
    if (typeof value.getPointAt === "function" && typeof value.getSpacedPoints === "function" && typeof value.getUtoTmapping === "function" && typeof value.computeFrenetFrames === "function") return input as Curve<Vector3>;
    const adapter = new Curve3Adapter((t) => toVector3(value.getPoint(t)));
    adapter.closed = value.closed === true;
    adapter.isCatmullRomCurve3 = value.isCatmullRomCurve3 === true || input instanceof CatmullRomCurve3;
    return adapter;
  }
  if (Array.isArray(input) && input.length >= 2) {
    const curve = new CatmullRomCurve3(input.map((p) => toVector3(p as Vec3Like)));
    const adapter = new Curve3Adapter((t) => curve.getPoint(t));
    adapter.isCatmullRomCurve3 = true;
    return adapter;
  }
  throw new TypeError("Aura3D path requires a Curve, a point sampler, or at least two points.");
}

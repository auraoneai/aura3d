/**
 * Geometry support routines for the native primitive builders.
 *
 * Attribution: the curve adapter and axis-rotation helper retain portions of
 * an earlier three.js port. The previous triangulation code was based on
 * Mapbox earcut 3.0.2 (ISC). Provenance and applicable notices for the current
 * implementations remain under review until independent replacement is
 * verified.
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

/** Rodrigues rotation about a unit axis, in column-major storage. */
export function rotationAxisMatrix(axis: Vector3, angle: number): Matrix4 {
  const x = axis.x, y = axis.y, z = axis.z, c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return new Matrix4([
    c + x * x * t, y * x * t + z * s, z * x * t - y * s, 0,
    x * y * t - z * s, c + y * y * t, z * y * t + x * s, 0,
    x * z * t + y * s, y * z * t - x * s, c + z * z * t, 0,
    0, 0, 0, 1
  ]);
}
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** Adapts a point sampler to the public Curve contract. */
export class Curve3Adapter implements Curve<Vector3> {
  readonly arcLengthDivisions = 200;
  closed = false;
  isCatmullRomCurve3 = false;
  private cached?: number[];
  constructor(private readonly sampler: (t: number) => Vector3) {}
  getPoint(t: number): Vector3 { return this.sampler(clamp(t, 0, 1)); }
  getPointAt(u: number): Vector3 { return this.getPoint(this.getUtoTmapping(u)); }
  getTangent(t: number): Vector3 { return this.getPoint(clamp(t + 1e-4, 0, 1)).subtract(this.getPoint(clamp(t - 1e-4, 0, 1))).normalize(); }
  getTangentAt(u: number): Vector3 { return this.getTangent(this.getUtoTmapping(u)); }
  getPoints(divisions = 5): Vector3[] {
    const n = Math.max(1, Math.floor(divisions));
    return Array.from({ length: n + 1 }, (_, i) => this.getPoint(i / n));
  }
  getSpacedPoints(divisions = 5): Vector3[] {
    const n = Math.max(1, Math.floor(divisions));
    return Array.from({ length: n + 1 }, (_, i) => this.getPointAt(i / n));
  }
  getLength(): number { const lengths = this.getLengths(); return lengths[lengths.length - 1]!; }
  getLengths(divisions = this.arcLengthDivisions): number[] {
    const n = Math.max(1, Math.floor(divisions));
    if (this.cached?.length === n + 1) return this.cached;
    const lengths = [0];
    let previous = this.getPoint(0);
    for (let i = 1; i <= n; i += 1) {
      const current = this.getPoint(i / n);
      lengths.push(lengths[i - 1]! + current.distanceTo(previous));
      previous = current;
    }
    this.cached = lengths;
    return lengths;
  }
  updateArcLengths(): void { this.cached = undefined; }
  getUtoTmapping(u: number): number {
    const lengths = this.getLengths(), n = lengths.length - 1;
    const target = clamp(u, 0, 1) * lengths[n]!;
    if (lengths[n] === 0) return clamp(u, 0, 1);
    let lo = 0, hi = n;
    while (lo + 1 < hi) { const mid = Math.floor((lo + hi) / 2); if (lengths[mid]! < target) lo = mid; else hi = mid; }
    const span = lengths[hi]! - lengths[lo]!;
    return (lo + (span > 0 ? (target - lengths[lo]!) / span : 0)) / n;
  }
  computeFrenetFrames(segments: number, closed = false): FrenetFrame {
    const n = Math.max(1, Math.floor(segments));
    const tangents = Array.from({ length: n + 1 }, (_, i) => this.getTangentAt(i / n));
    for (let i = 0; i <= n; i += 1) if (tangents[i]!.length() < 1e-12) tangents[i] = i ? tangents[i - 1]! : new Vector3(0, 0, 1);
    if (closed) {
      // One-sided derivative estimates on a closed sampler disagree slightly
      // at the seam. Use their common direction before transporting the frame.
      const seam = tangents[0]!.add(tangents[n]!).normalize();
      if (seam.length() > 0) tangents[0] = seam;
      tangents[n] = tangents[0]!;
    }
    const first = tangents[0]!;
    const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
    axes.sort((a, b) => Math.abs(first.dot(a)) - Math.abs(first.dot(b)));
    const normal0 = first.cross(axes[0]!).cross(first).normalize();
    const normals = [normal0], binormals = [first.cross(normal0).normalize()];
    for (let i = 1; i <= n; i += 1) {
      const axis = tangents[i - 1]!.cross(tangents[i]!);
      const sine = axis.length(), cosine = clamp(tangents[i - 1]!.dot(tangents[i]!), -1, 1);
      let normal = normals[i - 1]!;
      if (sine > 1e-12) normal = normal.transformMatrix4(rotationAxisMatrix(axis.divideScalar(sine), Math.atan2(sine, cosine)));
      else if (cosine < 0) normal = normal.negate();
      normal = normal.subtract(tangents[i]!.multiplyScalar(normal.dot(tangents[i]!))).normalize();
      normals.push(normal);
      binormals.push(tangents[i]!.cross(normal).normalize());
    }
    if (closed) {
      const angle = Math.atan2(first.dot(normals[n]!.cross(normal0)), clamp(normals[n]!.dot(normal0), -1, 1));
      for (let i = 1; i <= n; i += 1) {
        normals[i] = normals[i]!.transformMatrix4(rotationAxisMatrix(tangents[i]!, angle * i / n)).normalize();
        binormals[i] = tangents[i]!.cross(normals[i]!).normalize();
      }
    }
    return { tangents, normals, binormals };
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

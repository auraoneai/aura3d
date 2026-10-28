/**
 * threejs-parity (docs/workflows/threejs-parity-gaps.md §5.2, lane L2) —
 * shared plumbing for the new primitive generators.
 *
 * Every generator emits a `ParityMesh`: raw `number[]` buffers in the exact
 * vertex order, index order and UV layout three.js 0.185.1 produces for the
 * same parameters, so the parity fixtures can diff buffers element-by-element.
 * `parityMeshToGeometry` packs the buffers into the engine `Geometry`
 * (P3N3T4T2 when UVs exist — tangents are computed for the textured material
 * contract — otherwise P3N3 / P3).
 *
 * Also hosts the two things L3 has not landed yet, coded against the frozen
 * contracts instead:
 *  - `Curve3Adapter` implements the frozen `Curve<Vector3>` interface
 *    (`M/Curves.ts`) over any `getPoint(t)` sampler, porting three's
 *    arc-length table + `computeFrenetFrames` parallel transport exactly.
 *    `resolveCurve3` accepts a frozen `Curve`, a `{ getPoint }` sampler, an
 *    M/CatmullRomCurve3/CubicBezierCurve3, or a plain point list.
 *  - `resolveShape2D` normalizes `params.shape` inputs (point lists,
 *    `{points,holes}`, `{extractPoints}` L3 `Shape` objects) into contour +
 *    holes; `triangulateShape` is a verbatim port of three's ShapeUtils over
 *    a verbatim port of the vendored mapbox earcut 3.0.2 (same indices).
 */

import { Geometry } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { CatmullRomCurve3 } from "@aura3d/math";
import { Matrix4 } from "@aura3d/math";
import { Vector2 } from "@aura3d/math";
import { Vector3 } from "@aura3d/math";
import type { Curve, FrenetFrame } from "@aura3d/math";

export interface ParityMesh {
  readonly positions: number[];
  readonly normals?: number[];
  readonly uvs?: number[];
  /** Omitted = non-indexed (vertices are already expanded in draw order). */
  readonly indices?: number[];
  /** Geometry groups (three's `addGroup`) — informational, carried to the spec. */
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
}

export interface ParityBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function computeParityBounds(positions: ArrayLike<number>): ParityBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < min[0]) min[0] = x;
    if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y;
    if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

/**
 * Per-vertex averaged UV-derivative tangents (vec4, w = +1). three does not
 * emit tangents; these exist solely so parity meshes ride the engine's
 * textured P3N3T4T2 format — they are never compared in the fixtures.
 */
export function computeParityTangents(positions: ArrayLike<number>, uvs: ArrayLike<number>, indices: readonly number[]): Float32Array {
  const count = positions.length / 3;
  const t = new Float32Array(count * 4);
  const tx = new Float32Array(count);
  const ty = new Float32Array(count);
  const tz = new Float32Array(count);
  for (let f = 0; f + 2 < indices.length; f += 3) {
    const ia = indices[f]!;
    const ib = indices[f + 1]!;
    const ic = indices[f + 2]!;
    const ax = positions[ia * 3]!;
    const ay = positions[ia * 3 + 1]!;
    const az = positions[ia * 3 + 2]!;
    const bx = positions[ib * 3]!;
    const by = positions[ib * 3 + 1]!;
    const bz = positions[ib * 3 + 2]!;
    const cx = positions[ic * 3]!;
    const cy = positions[ic * 3 + 1]!;
    const cz = positions[ic * 3 + 2]!;
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const du1 = uvs[ib * 2]! - uvs[ia * 2]!;
    const dv1 = uvs[ib * 2 + 1]! - uvs[ia * 2 + 1]!;
    const du2 = uvs[ic * 2]! - uvs[ia * 2]!;
    const dv2 = uvs[ic * 2 + 1]! - uvs[ia * 2 + 1]!;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    const sx = (e1x * dv2 - e2x * dv1) * r;
    const sy = (e1y * dv2 - e2y * dv1) * r;
    const sz = (e1z * dv2 - e2z * dv1) * r;
    for (const i of [ia, ib, ic]) {
      tx[i] = tx[i]! + sx;
      ty[i] = ty[i]! + sy;
      tz[i] = tz[i]! + sz;
    }
  }
  for (let i = 0; i < count; i += 1) {
    const len = Math.hypot(tx[i]!, ty[i]!, tz[i]!);
    if (len < 1e-12) {
      t[i * 4] = 1;
      t[i * 4 + 3] = 1;
      continue;
    }
    t[i * 4] = tx[i]! / len;
    t[i * 4 + 1] = ty[i]! / len;
    t[i * 4 + 2] = tz[i]! / len;
    t[i * 4 + 3] = 1;
  }
  return t;
}

/**
 * three's `BufferGeometry.computeVertexNormals`: indexed input accumulates
 * face normals per vertex then normalizes; non-indexed input writes the flat
 * face normal to all three vertices (ExtrudeGeometry / detail=0 Polyhedron).
 */
export function computeVertexNormals(positions: ArrayLike<number>, indices?: readonly number[]): number[] {
  const count = positions.length / 3;
  const normals = new Array<number>(positions.length).fill(0);
  const va = { x: 0, y: 0, z: 0 };
  const vb = { x: 0, y: 0, z: 0 };
  const vc = { x: 0, y: 0, z: 0 };
  const face = (a: typeof va, b: typeof vb, c: typeof vc): readonly [number, number, number] => {
    // three: cb = c - b; ab = a - b; cb × ab, normalized.
    const cbx = c.x - b.x;
    const cby = c.y - b.y;
    const cbz = c.z - b.z;
    const abx = a.x - b.x;
    const aby = a.y - b.y;
    const abz = a.z - b.z;
    let nx = cby * abz - cbz * aby;
    let ny = cbz * abx - cbx * abz;
    let nz = cbx * aby - cby * abx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    return [nx, ny, nz];
  };
  const read = (i: number, out: typeof va): void => {
    out.x = positions[i * 3]!;
    out.y = positions[i * 3 + 1]!;
    out.z = positions[i * 3 + 2]!;
  };
  if (indices && indices.length > 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i]!;
      const ib = indices[i + 1]!;
      const ic = indices[i + 2]!;
      read(ia, va);
      read(ib, vb);
      read(ic, vc);
      const n = face(va, vb, vc);
      for (const t of [ia, ib, ic]) {
        normals[t * 3] = normals[t * 3]! + n[0];
        normals[t * 3 + 1] = normals[t * 3 + 1]! + n[1];
        normals[t * 3 + 2] = normals[t * 3 + 2]! + n[2];
      }
    }
    for (let i = 0; i < count; i += 1) {
      const nx = normals[i * 3]!;
      const ny = normals[i * 3 + 1]!;
      const nz = normals[i * 3 + 2]!;
      const len = Math.hypot(nx, ny, nz);
      if (len > 0) {
        normals[i * 3] = nx / len;
        normals[i * 3 + 1] = ny / len;
        normals[i * 3 + 2] = nz / len;
      }
    }
  } else {
    for (let i = 0; i < count; i += 3) {
      read(i, va);
      read(i + 1, vb);
      read(i + 2, vc);
      const n = face(va, vb, vc);
      for (const t of [i, i + 1, i + 2]) {
        normals[t * 3] = n[0];
        normals[t * 3 + 1] = n[1];
        normals[t * 3 + 2] = n[2];
      }
    }
  }
  return normals;
}

/** Pack a `ParityMesh` into the engine `Geometry` (normals computed when absent). */
export function parityMeshToGeometry(mesh: ParityMesh, topology: "triangles" | "lines" = "triangles"): Geometry {
  const vertexCount = mesh.positions.length / 3;
  if (vertexCount === 0) {
    const empty = new VertexBuffer(VertexFormat.P3, 1);
    empty.setAttribute(0, "position", [0, 0, 0]);
    return new Geometry(empty, null, topology, { min: [0, 0, 0], max: [0, 0, 0] });
  }
  const normals = mesh.normals ?? computeVertexNormals(mesh.positions, mesh.indices);
  const textured = mesh.uvs !== undefined && mesh.uvs.length === vertexCount * 2;
  const format = textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3;
  const vertices = new VertexBuffer(format, vertexCount);
  const indexList = mesh.indices ?? Array.from({ length: vertexCount }, (_, i) => i);
  const tangents = textured ? computeParityTangents(mesh.positions, mesh.uvs ?? [], indexList) : undefined;
  for (let i = 0; i < vertexCount; i += 1) {
    vertices.setAttribute(i, "position", [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!]);
    vertices.setAttribute(i, "normal", [normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!]);
    if (textured) {
      vertices.setAttribute(i, "uv", [mesh.uvs![i * 2]!, mesh.uvs![i * 2 + 1]!]);
      vertices.setAttribute(i, "tangent", [tangents![i * 4]!, tangents![i * 4 + 1]!, tangents![i * 4 + 2]!, tangents![i * 4 + 3]!]);
    }
  }
  const bounds = computeParityBounds(mesh.positions);
  const indexBuffer = indexList.length > 0 ? new IndexBuffer(indexList, vertexCount) : null;
  return new Geometry(vertices, indexBuffer, topology, bounds);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape inputs (L3 `Shape` lands in parallel; code against the duck type)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedShape2D {
  readonly shape: Vector2[];
  readonly holes: Vector2[][];
}

type Vec2Like = Vector2 | { readonly x: number; readonly y: number } | readonly [number, number];

function toVector2(value: Vec2Like): Vector2 {
  if (value instanceof Vector2) return value;
  if (Array.isArray(value)) {
    const arr = value as readonly number[];
    return new Vector2(arr[0]!, arr[1]!);
  }
  const obj = value as { readonly x: number; readonly y: number };
  return new Vector2(obj.x, obj.y);
}

function isVec2Like(value: unknown): value is Vec2Like {
  if (value instanceof Vector2) return true;
  if (Array.isArray(value)) return value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
  return typeof value === "object" && value !== null
    && typeof (value as { x?: unknown }).x === "number"
    && typeof (value as { y?: unknown }).y === "number";
}

function vec2Array(value: unknown): Vector2[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!isVec2Like(value[0])) return undefined;
  return value.map((entry) => toVector2(entry as Vec2Like));
}

/**
 * Normalize `params.shape` / `params.points` into contour + holes. Accepts:
 *  - `[x,y][]`, `Vector2[]`, `{x,y}[]` (contour only)
 *  - `{ points }`, `{ contour }`, `{ shape }` with optional `holes`
 *  - L3 `Shape`: `{ extractPoints(curveSegments) -> {shape, holes} }`
 *  - Path-like `{ getPoints() }` (single contour)
 */
export function resolveShape2D(input: unknown, curveSegments = 12): ResolvedShape2D {
  const direct = vec2Array(input);
  if (direct) return { shape: direct, holes: [] };
  if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    if (typeof record.extractPoints === "function") {
      const extracted = (record.extractPoints as (n: number) => { shape: Vec2Like[]; holes: Vec2Like[][] })(curveSegments);
      const shape = vec2Array(extracted?.shape) ?? [];
      const holes = (extracted?.holes ?? []).map((hole) => vec2Array(hole) ?? []);
      return { shape, holes };
    }
    for (const key of ["shape", "contour", "points", "outline"] as const) {
      const contour = vec2Array(record[key]);
      if (contour) {
        const holes = Array.isArray(record.holes)
          ? (record.holes as unknown[]).map((hole) => vec2Array(hole) ?? [])
          : [];
        return { shape: contour, holes };
      }
    }
    if (typeof record.getPoints === "function") {
      const points = (record.getPoints as () => Vec2Like[])();
      return { shape: vec2Array(points) ?? [] , holes: [] };
    }
  }
  throw new Error("Aura3D shape/extrude requires a shape outline (point list, {points,holes}, or a Shape with extractPoints).");
}

/** three's `ShapeUtils.area` (signed, shoelace). */
export function shapeArea(contour: readonly { x: number; y: number }[]): number {
  const n = contour.length;
  let a = 0;
  for (let p = n - 1, q = 0; q < n; p = q++) {
    a += contour[p]!.x * contour[q]!.y - contour[q]!.x * contour[p]!.y;
  }
  return a * 0.5;
}

/** three's `ShapeUtils.isClockWise` — sign of the shoelace area. */
export function isClockWise(pts: readonly { x: number; y: number }[]): boolean {
  return shapeArea(pts) < 0;
}

export function removeDupEndPts(points: { x: number; y: number }[]): void {
  const l = points.length;
  // three uses Vector2.equals — exact coordinate equality.
  if (l > 2 && points[l - 1]!.x === points[0]!.x && points[l - 1]!.y === points[0]!.y) {
    points.pop();
  }
}

/**
 * three's `ShapeUtils.triangulateShape` over the vendored earcut below — same
 * vertex feeding order, so the emitted faces are index-for-index identical.
 */
export function triangulateShape(contour: readonly { x: number; y: number }[], holes: readonly (readonly { x: number; y: number }[])[]): number[][] {
  const vertices: number[] = [];
  const holeIndices: number[] = [];
  const faces: number[][] = [];

  const c = [...contour];
  removeDupEndPts(c);
  for (const p of c) vertices.push(p.x, p.y);

  // three mutates `contour` in place (so holeIndex is the post-strip length); this copy strips first, then counts.
  let holeIndex = c.length;
  const hs = holes.map((hole) => [...hole]);
  hs.forEach(removeDupEndPts);
  for (const hole of hs) {
    holeIndices.push(holeIndex);
    holeIndex += hole.length;
    for (const p of hole) vertices.push(p.x, p.y);
  }

  const triangles = earcut(vertices, holeIndices);
  for (let i = 0; i < triangles.length; i += 3) {
    faces.push([triangles[i]!, triangles[i + 1]!, triangles[i + 2]!]);
  }
  return faces;
}

// ─────────────────────────────────────────────────────────────────────────────
// Curve inputs — frozen `Curve<Vector3>` adapter (B-06) until L3 lands
// ─────────────────────────────────────────────────────────────────────────────

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Matrix4.makeRotationAxis(axis, angle) — column-major elements for a rotation
 * of `angle` about a *unit* axis (three's formula verbatim).
 */
export function rotationAxisMatrix(axis: Vector3, angle: number): Matrix4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const x = axis.x;
  const y = axis.y;
  const z = axis.z;
  const tx = t * x;
  const ty = t * y;
  // three's Matrix4.set row-major args → column-major elements
  return new Matrix4([
    tx * x + c, tx * y + z * s, tx * z - y * s, 0,
    tx * y - z * s, ty * y + c, ty * z + x * s, 0,
    tx * z + y * s, ty * z - x * s, t * z * z + c, 0,
    0, 0, 0, 1
  ]);
}

/**
 * Implements the frozen `Curve<Vector3>` interface over any `getPoint(t)`
 * sampler, using three's exact base-class algorithms: 200-division arc-length
 * cache, binary-search `getUtoTmapping`, finite-difference `getTangent`, and
 * the TR425 parallel-transport `computeFrenetFrames`. When L3's real family
 * lands, those objects satisfy `Curve` directly and never reach this adapter.
 */
export class Curve3Adapter implements Curve<Vector3> {
  private cacheArcLengths: number[] | undefined;
  private needsUpdate = true;
  readonly arcLengthDivisions = 200;
  /** Consulted by Extrude (three's `extrudePath.isCatmullRomCurve3 && closed`). */
  closed = false;
  /** Mirrors three's class flag — `extrudePath.isCatmullRomCurve3` gate. */
  isCatmullRomCurve3 = false;

  constructor(private readonly sampler: (t: number) => Vector3) {}

  getPoint(t: number): Vector3 {
    return this.sampler(Math.min(1, Math.max(0, t)));
  }

  getPointAt(u: number): Vector3 {
    return this.getPoint(this.getUtoTmapping(u));
  }

  getTangent(t: number): Vector3 {
    const delta = 0.0001;
    let t1 = t - delta;
    let t2 = t + delta;
    if (t1 < 0) t1 = 0;
    if (t2 > 1) t2 = 1;
    const pt1 = this.getPoint(t1);
    const pt2 = this.getPoint(t2);
    return pt2.subtract(pt1).normalize();
  }

  getTangentAt(u: number): Vector3 {
    return this.getTangent(this.getUtoTmapping(u));
  }

  getLength(): number {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1]!;
  }

  getLengths(divisions = this.arcLengthDivisions): number[] {
    if (this.cacheArcLengths && this.cacheArcLengths.length === divisions + 1 && !this.needsUpdate) {
      return this.cacheArcLengths;
    }
    this.needsUpdate = false;
    const cache: number[] = [0];
    let last = this.getPoint(0);
    let sum = 0;
    for (let p = 1; p <= divisions; p += 1) {
      const current = this.getPoint(p / divisions);
      sum += current.distanceTo(last);
      cache.push(sum);
      last = current;
    }
    this.cacheArcLengths = cache;
    return cache;
  }

  updateArcLengths(): void {
    this.needsUpdate = true;
    this.getLengths();
  }

  getUtoTmapping(u: number): number {
    const arcLengths = this.getLengths();
    const il = arcLengths.length;
    const targetArcLength = u * arcLengths[il - 1]!;
    let low = 0;
    let high = il - 1;
    let i = 0;
    while (low <= high) {
      i = Math.floor(low + (high - low) / 2);
      const comparison = arcLengths[i]! - targetArcLength;
      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;
      }
    }
    i = high;
    if (arcLengths[i] === targetArcLength) {
      return i / (il - 1);
    }
    const lengthBefore = arcLengths[i]!;
    const lengthAfter = arcLengths[i + 1]!;
    const segmentLength = lengthAfter - lengthBefore;
    if (segmentLength === 0) {
      return i / (il - 1);
    }
    const segmentFraction = (targetArcLength - lengthBefore) / segmentLength;
    return (i + segmentFraction) / (il - 1);
  }

  getSpacedPoints(divisions = 5): Vector3[] {
    const points: Vector3[] = [];
    for (let i = 0; i <= divisions; i += 1) {
      points.push(this.getPointAt(i / divisions));
    }
    return points;
  }

  getPoints(divisions = 5): Vector3[] {
    const points: Vector3[] = [];
    for (let i = 0; i <= divisions; i += 1) {
      points.push(this.getPoint(i / divisions));
    }
    return points;
  }

  computeFrenetFrames(segments: number, closed = false): FrenetFrame {
    // three's Curve.computeFrenetFrames — TR425 parallel transport with the
    // initial normal perpendicular to the first tangent's smallest component.
    const tangents: Vector3[] = [];
    const normals: Vector3[] = [];
    const binormals: Vector3[] = [];

    for (let i = 0; i <= segments; i += 1) {
      tangents[i] = this.getTangentAt(i / segments);
    }

    let normal = new Vector3();
    let min = Number.MAX_VALUE;
    const tx = Math.abs(tangents[0]!.x);
    const ty = Math.abs(tangents[0]!.y);
    const tz = Math.abs(tangents[0]!.z);
    if (tx <= min) {
      min = tx;
      normal = new Vector3(1, 0, 0);
    }
    if (ty <= min) {
      min = ty;
      normal = new Vector3(0, 1, 0);
    }
    if (tz <= min) {
      normal = new Vector3(0, 0, 1);
    }

    const vec = tangents[0]!.cross(normal).normalize();
    normals[0] = tangents[0]!.cross(vec);
    binormals[0] = tangents[0]!.cross(normals[0]!);

    for (let i = 1; i <= segments; i += 1) {
      normals[i] = normals[i - 1]!.clone();
      binormals[i] = binormals[i - 1]!.clone();
      const cross = tangents[i - 1]!.cross(tangents[i]!);
      if (cross.length() > Number.EPSILON) {
        const axis = cross.normalize();
        const theta = Math.acos(clampNumber(tangents[i - 1]!.dot(tangents[i]!), -1, 1));
        normals[i] = normals[i]!.transformMatrix4(rotationAxisMatrix(axis, theta));
      }
      binormals[i] = tangents[i]!.cross(normals[i]!);
    }

    if (closed === true) {
      let theta = Math.acos(clampNumber(normals[0]!.dot(normals[segments]!), -1, 1));
      theta /= segments;
      if (tangents[0]!.dot(normals[0]!.cross(normals[segments]!)) > 0) {
        theta = -theta;
      }
      for (let i = 1; i <= segments; i += 1) {
        normals[i] = normals[i]!.transformMatrix4(rotationAxisMatrix(tangents[i]!, theta * i));
        binormals[i] = tangents[i]!.cross(normals[i]!);
      }
    }

    return { tangents, normals, binormals };
  }
}

function isFrozenCurve(value: unknown): value is Curve<Vector3> {
  const candidate = value as Curve<Vector3>;
  return typeof candidate === "object" && candidate !== null
    && typeof candidate.getPoint === "function"
    && typeof candidate.getPointAt === "function"
    && typeof candidate.getUtoTmapping === "function"
    && typeof candidate.computeFrenetFrames === "function";
}

type Vec3Like = Vector3 | readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };

function toVector3(value: Vec3Like): Vector3 {
  if (value instanceof Vector3) return value;
  if (Array.isArray(value)) {
    const arr = value as readonly number[];
    return new Vector3(arr[0]!, arr[1]!, arr[2]!);
  }
  const obj = value as { readonly x: number; readonly y: number; readonly z: number };
  return new Vector3(obj.x, obj.y, obj.z);
}

/**
 * Resolve `params.path` / `params.extrudePath` into a frozen `Curve<Vector3>`:
 *  - an object already satisfying the frozen interface (L3's family) — used as-is;
 *  - `{ getPoint(t) }` samplers (incl. `CatmullRomCurve3`/`CubicBezierCurve3`) — wrapped in `Curve3Adapter`;
 *  - a point list → Catmull-Rom through the points (the same interpolation
 *    `M/CatmullRomCurve3` already implements).
 */
export function resolveCurve3(input: unknown): Curve<Vector3> {
  if (isFrozenCurve(input)) return input;
  if (typeof input === "object" && input !== null && typeof (input as { getPoint?: unknown }).getPoint === "function") {
    const sampler = input as { getPoint(t: number): Vector3 | readonly [number, number, number]; closed?: boolean; isCatmullRomCurve3?: boolean };
    const adapter = new Curve3Adapter((t) => {
      const p = sampler.getPoint(t);
      return p instanceof Vector3 ? p : new Vector3(p[0]!, p[1]!, p[2]!);
    });
    adapter.closed = sampler.closed === true;
    adapter.isCatmullRomCurve3 = sampler.isCatmullRomCurve3 === true || input instanceof CatmullRomCurve3;
    return adapter;
  }
  if (Array.isArray(input) && input.length >= 2) {
    const points = input.map((value) => toVector3(value as Vec3Like));
    const cr = new CatmullRomCurve3(points);
    const adapter = new Curve3Adapter((t) => cr.getPoint(t));
    adapter.isCatmullRomCurve3 = true;
    return adapter;
  }
  throw new Error("Aura3D path input must be a Curve, a { getPoint(t) } sampler, or a list of at least two points.");
}

// ─────────────────────────────────────────────────────────────────────────────
// mapbox earcut 3.0.2 — verbatim port (ISC), the same file three vendors at
// src/extras/lib/earcut.js; identical output ⇒ identical triangulation indices.
// ─────────────────────────────────────────────────────────────────────────────

interface EarcutNode {
  i: number;
  x: number;
  y: number;
  prev: EarcutNode;
  next: EarcutNode;
  z: number;
  prevZ: EarcutNode | null;
  nextZ: EarcutNode | null;
  steiner: boolean;
}

export function earcut(data: ArrayLike<number>, holeIndices: readonly number[] | undefined, dim = 2): number[] {
  const hasHoles = holeIndices !== undefined && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices[0]! * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles: number[] = [];

  if (!outerNode || outerNode.next === outerNode.prev) return triangles;

  let minX = 0;
  let minY = 0;
  let invSize = 0;

  if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

  if (data.length > 80 * dim) {
    minX = data[0]!;
    minY = data[1]!;
    let maxX = minX;
    let maxY = minY;
    for (let i = dim; i < outerLen; i += dim) {
      const x = data[i]!;
      const y = data[i + 1]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }

  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);
  return triangles;
}

function createNode(i: number, x: number, y: number): EarcutNode {
  return {
    i,
    x,
    y,
    prev: null as unknown as EarcutNode,
    next: null as unknown as EarcutNode,
    z: 0,
    prevZ: null,
    nextZ: null,
    steiner: false
  };
}

function linkedList(data: ArrayLike<number>, start: number, end: number, dim: number, clockwise: boolean): EarcutNode | undefined {
  let last: EarcutNode | undefined;
  if (clockwise === (signedArea(data, start, end, dim) > 0)) {
    for (let i = start; i < end; i += dim) last = insertNode(Math.floor(i / dim), data[i]!, data[i + 1]!, last);
  } else {
    for (let i = end - dim; i >= start; i -= dim) last = insertNode(Math.floor(i / dim), data[i]!, data[i + 1]!, last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

function filterPoints(start: EarcutNode | undefined, end?: EarcutNode): EarcutNode | undefined {
  if (!start) return start;
  let e = end ?? start;
  let p = start;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = e = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== e);
  return e;
}

function earcutLinked(earIn: EarcutNode | undefined, triangles: number[], dim: number, minX: number, minY: number, invSize: number, pass: number): void {
  if (!earIn) return;
  let ear: EarcutNode = earIn;
  if (pass === 0 && invSize !== 0) indexCurve(ear, minX, minY, invSize);
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev = ear.prev;
    const next = ear.next;
    if (invSize !== 0 ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      triangles.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (pass === 0) {
        earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
      } else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear) as EarcutNode, triangles);
        earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);
      } else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize);
      }
      break;
    }
  }
}

function isEar(ear: EarcutNode): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x;
  const bx = b.x;
  const cx = c.x;
  const ay = a.y;
  const by = b.y;
  const cy = c.y;
  const x0 = Math.min(ax, bx, cx);
  const y0 = Math.min(ay, by, cy);
  const x1 = Math.max(ax, bx, cx);
  const y1 = Math.max(ay, by, cy);
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
      && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y)
      && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}

function isEarHashed(ear: EarcutNode, minX: number, minY: number, invSize: number): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const ax = a.x;
  const bx = b.x;
  const cx = c.x;
  const ay = a.y;
  const by = b.y;
  const cy = c.y;
  const x0 = Math.min(ax, bx, cx);
  const y0 = Math.min(ay, by, cy);
  const x1 = Math.max(ax, bx, cx);
  const y1 = Math.max(ay, by, cy);
  const minZ = zOrder(x0, y0, minX, minY, invSize);
  const maxZ = zOrder(x1, y1, minX, minY, invSize);
  let p = ear.prevZ;
  let n = ear.nextZ;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c
      && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c
      && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  while (p && p.z >= minZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c
      && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
  }
  while (n && n.z <= maxZ) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c
      && pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }
  return true;
}

function cureLocalIntersections(start: EarcutNode, triangles: number[]): EarcutNode {
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i, p.i, b.i);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p) as EarcutNode;
}

function splitEarcut(start: EarcutNode, triangles: number[], dim: number, minX: number, minY: number, invSize: number): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, a.next) as EarcutNode;
        c = filterPoints(c, c.next) as EarcutNode;
        earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function eliminateHoles(data: ArrayLike<number>, holeIndices: readonly number[], outerNode: EarcutNode, dim: number): EarcutNode {
  const queue: EarcutNode[] = [];
  for (let i = 0, len = holeIndices.length; i < len; i += 1) {
    const start = holeIndices[i]! * dim;
    const end = i < len - 1 ? holeIndices[i + 1]! * dim : data.length;
    const list = linkedList(data, start, end, dim, false) as EarcutNode;
    if (list === list.next) list.steiner = true;
    queue.push(getLeftmost(list));
  }
  queue.sort(compareXYSlope);
  for (let i = 0; i < queue.length; i += 1) {
    outerNode = eliminateHole(queue[i]!, outerNode);
  }
  return outerNode;
}

function compareXYSlope(a: EarcutNode, b: EarcutNode): number {
  let result = a.x - b.x;
  if (result === 0) {
    result = a.y - b.y;
    if (result === 0) {
      const aSlope = (a.next.y - a.y) / (a.next.x - a.x);
      const bSlope = (b.next.y - b.y) / (b.next.x - b.x);
      result = aSlope - bSlope;
    }
  }
  return result;
}

function eliminateHole(hole: EarcutNode, outerNode: EarcutNode): EarcutNode {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next) as EarcutNode;
}

function findHoleBridge(hole: EarcutNode, outerNode: EarcutNode): EarcutNode | undefined {
  let p: EarcutNode = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: EarcutNode | undefined;
  if (equals(hole, p)) return p;
  do {
    if (equals(hole, p.next)) return p.next;
    else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return undefined;
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x
      && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole)
        && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

function sectorContainsSector(m: EarcutNode, p: EarcutNode): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

function indexCurve(start: EarcutNode, minX: number, minY: number, invSize: number): void {
  let p = start;
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);
  p.prevZ!.nextZ = null;
  p.prevZ = null;
  sortLinked(p);
}

function sortLinked(list: EarcutNode | null): EarcutNode | null {
  let numMerges = 0;
  let inSize = 1;
  do {
    let p = list;
    let e: EarcutNode | null | undefined;
    list = null;
    let tail: EarcutNode | null = null;
    numMerges = 0;
    while (p) {
      numMerges += 1;
      let q: EarcutNode | null = p;
      let pSize = 0;
      for (let i = 0; i < inSize; i += 1) {
        pSize += 1;
        q = q.nextZ;
        if (!q) break;
      }
      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
          e = p!;
          p = p!.nextZ;
          pSize -= 1;
        } else {
          e = q;
          q = q!.nextZ;
          qSize -= 1;
        }
        if (tail) tail.nextZ = e ?? null;
        else list = e ?? null;
        e!.prevZ = tail;
        tail = e!;
      }
      p = q;
    }
    tail!.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);
  return list;
}

function zOrder(xIn: number, yIn: number, minX: number, minY: number, invSize: number): number {
  let x = Math.floor((xIn - minX) * invSize);
  let y = Math.floor((yIn - minY) * invSize);
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  y = (y | (y << 8)) & 0x00ff00ff;
  y = (y | (y << 4)) & 0x0f0f0f0f;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;
  return x | (y << 1);
}

function getLeftmost(start: EarcutNode): EarcutNode {
  let p = start;
  let leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py)
    && (ax - px) * (by - py) >= (bx - px) * (ay - py)
    && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

function pointInTriangleExceptFirst(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return !(ax === px && ay === py) && pointInTriangle(ax, ay, bx, by, cx, cy, px, py);
}

function isValidDiagonal(a: EarcutNode, b: EarcutNode): boolean {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b)
    && (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b)
      && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)
      || equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
}

function area(p: EarcutNode, q: EarcutNode, r: EarcutNode): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p1: EarcutNode, p2: EarcutNode): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

function intersects(p1: EarcutNode, q1: EarcutNode, p2: EarcutNode, q2: EarcutNode): boolean {
  const o1 = signNum(area(p1, q1, p2));
  const o2 = signNum(area(p1, q1, q2));
  const o3 = signNum(area(p2, q2, p1));
  const o4 = signNum(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function onSegment(p: EarcutNode, q: EarcutNode, r: EarcutNode): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function signNum(num: number): number {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}

function intersectsPolygon(a: EarcutNode, b: EarcutNode): boolean {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i
      && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function locallyInside(a: EarcutNode, b: EarcutNode): boolean {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

function middleInside(a: EarcutNode, b: EarcutNode): boolean {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y
      && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}

function splitPolygon(a: EarcutNode, b: EarcutNode): EarcutNode {
  const a2 = createNode(a.i, a.x, a.y);
  const b2 = createNode(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

function insertNode(i: number, x: number, y: number, last: EarcutNode | undefined): EarcutNode {
  const p = createNode(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

function removeNode(p: EarcutNode): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function signedArea(data: ArrayLike<number>, start: number, end: number, dim: number): number {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j]! - data[i]!) * (data[i + 1]! + data[j + 1]!);
    j = i;
  }
  return sum;
}

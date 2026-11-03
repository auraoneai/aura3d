/**
 * Native planar shape generation.
 *
 * This implementation is independently authored. The shared geometry
 * adapters in `Support.ts` were independently replaced on 2026-11-02 (record:
 * docs/prds/aura3d-native-provenance-record.json).
 */
import type { ParityMesh } from "./Support";
import { normalizeIndependentShapeRings, triangulateIndependentShape, type IndependentShapePoint } from "./IndependentShapeTriangulation";

export interface ShapeParityParams {
  readonly shape: unknown;
  readonly curveSegments?: number;
}

type SampledPath = { readonly getPoints?: (segments: number) => unknown; readonly points?: unknown };
type SampledShape = SampledPath & {
  readonly extractPoints?: (segments: number) => unknown;
  readonly shape?: unknown;
  readonly holes?: unknown;
};
type VertexBudget = { remaining: number };

function pointsOf(value: unknown, label: string, segments: number, budget: VertexBudget): readonly IndependentShapePoint[] {
  let points = value;
  if (!Array.isArray(points) && points && typeof points === "object") {
    const path = points as SampledPath;
    points = typeof path.getPoints === "function" ? path.getPoints(segments) : path.points;
  }
  if (!Array.isArray(points)) throw new TypeError(`${label} must be a point list or a sampled path.`);
  if (points.length > budget.remaining + 1) throw new RangeError(`${label} exceeds the 8192-vertex capacity.`);
  const readPoint = (point: unknown, index: number): IndependentShapePoint => {
    const x = Array.isArray(point) ? point[0] : point && typeof point === "object" ? (point as { x?: unknown }).x : undefined;
    const y = Array.isArray(point) ? point[1] : point && typeof point === "object" ? (point as { y?: unknown }).y : undefined;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`${label} point ${index} must contain finite x and y coordinates.`);
    }
    return { x, y };
  };
  if (points.length === 0) return [];
  const first = readPoint(points[0], 0);
  const last = points.length > 1 ? readPoint(points[points.length - 1], points.length - 1) : first;
  const closed = points.length > 2 && first.x === last.x && first.y === last.y;
  const length = points.length - (closed ? 1 : 0);
  if (length > budget.remaining) throw new RangeError(`${label} exceeds the 8192-vertex capacity.`);
  budget.remaining -= length;
  const result: IndependentShapePoint[] = [];
  for (let index = 0; index < length; index += 1) {
    result.push(index === 0 ? first : index === points.length - 1 ? last : readPoint(points[index], index));
  }
  return result;
}

function extractShape(value: unknown, segments: number): { readonly outline: readonly IndependentShapePoint[]; readonly holes: readonly (readonly IndependentShapePoint[])[] } {
  const budget: VertexBudget = { remaining: 8_192 };
  let source: unknown = value;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const shape = source as SampledShape;
    if (typeof shape.extractPoints === "function") source = shape.extractPoints(segments);
  }
  if (Array.isArray(source)) return { outline: pointsOf(source, "Shape", segments, budget), holes: [] };
  if (!source || typeof source !== "object") throw new TypeError("Shape must be a point list or a shape with sampled points.");
  const shape = source as SampledShape;
  const outline = shape.shape ?? (typeof shape.getPoints === "function" ? shape.getPoints(segments) : shape.points);
  const holes = shape.holes ?? [];
  if (!Array.isArray(holes)) throw new TypeError("Shape holes must be an array of point lists or sampled paths.");
  if (holes.length > 8_192) throw new RangeError("Shape holes exceed the 8192-vertex capacity.");
  return { outline: pointsOf(outline, "Shape", segments, budget), holes: holes.map((hole, index) => pointsOf(hole, `Shape hole ${index}`, segments, budget)) };
}

/**
 * The public geometry adapter stores positions as Float32. Validate that
 * conversion before publishing a mesh so a representable double-precision
 * contour cannot silently become a point, flip a face, or materially distort
 * its triangles. Relative checks are scaled per triangle to avoid overflow or
 * underflow for otherwise representable coordinates.
 */
function assertFloat32TriangleFidelity(positions: readonly number[], indices: readonly number[]): void {
  const rounded = Float32Array.from(positions);
  if (!rounded.every(Number.isFinite)) throw new RangeError("Shape Float32 precision cannot represent these positions.");
  const tolerance = 0.05;
  for (let index = 0; index < indices.length; index += 3) {
    const a = 3 * indices[index]!, b = 3 * indices[index + 1]!, c = 3 * indices[index + 2]!;
    const abx = positions[b]! - positions[a]!, aby = positions[b + 1]! - positions[a + 1]!;
    const acx = positions[c]! - positions[a]!, acy = positions[c + 1]! - positions[a + 1]!;
    const scale = Math.max(Math.abs(abx), Math.abs(aby), Math.abs(acx), Math.abs(acy));
    if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError("Shape Float32 precision cannot preserve a triangle's extent.");
    const before = (abx / scale) * (acy / scale) - (aby / scale) * (acx / scale);
    const qbx = (rounded[b]! - rounded[a]!) / scale, qby = (rounded[b + 1]! - rounded[a + 1]!) / scale;
    const qcx = (rounded[c]! - rounded[a]!) / scale, qcy = (rounded[c + 1]! - rounded[a + 1]!) / scale;
    const after = qbx * qcy - qby * qcx;
    if (!(before > 0) || !(after > 0) || !Number.isFinite(after) || Math.abs(after / before - 1) > tolerance) {
      throw new RangeError("Shape Float32 precision collapses, reverses, or changes a triangle's area by more than 5%.");
    }
    const edges: readonly [number, number, number, number][] = [
      [abx / scale, aby / scale, qbx, qby],
      [acx / scale, acy / scale, qcx, qcy],
      [(positions[c]! - positions[b]!) / scale, (positions[c + 1]! - positions[b + 1]!) / scale, qcx - qbx, qcy - qby]
    ];
    for (const [x, y, qx, qy] of edges) {
      const length = Math.hypot(x, y), quantized = Math.hypot(qx, qy);
      if (!(length > 0) || !(quantized > 0) || !Number.isFinite(quantized) || Math.abs(quantized / length - 1) > tolerance) {
        throw new RangeError("Shape Float32 precision collapses or changes a triangle edge by more than 5%.");
      }
    }
  }
}

/** Build an indexed XY surface with +Z normals and planar UV coordinates. */
export function shapeParityMesh(params: ShapeParityParams): ParityMesh {
  const curveSegments = params.curveSegments ?? 12;
  if (!Number.isFinite(curveSegments) || curveSegments < 0 || curveSegments > 65_536) {
    throw new RangeError("curveSegments must be finite and between 0 and 65536.");
  }
  const sampled = extractShape(params.shape, curveSegments);
  // Preserve the established public vertex ordering: clockwise outer contour,
  // counter-clockwise holes, with an optional closing point removed.
  const rings = normalizeIndependentShapeRings(sampled.outline, sampled.holes, "mesh");
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const ring of rings) for (const point of ring) {
    positions.push(point.x, point.y, 0);
    normals.push(0, 0, 1);
    uvs.push(point.x, point.y);
  }
  const indices = triangulateIndependentShape(rings[0]!, rings.slice(1)).flat();
  assertFloat32TriangleFidelity(positions, indices);
  return { positions, normals, uvs, indices };
}

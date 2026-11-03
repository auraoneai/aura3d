import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

/** Limits apply to the whole base-geometry stream, not just the draw range. */
export interface AuraTopologyValidationOptions {
  /** Maximum source vertices; default and hard maximum are 196,608. */
  readonly maxVertices?: number;
  /** Maximum source triangles; default 16,384 and hard maximum 65,536. */
  readonly maxTriangles?: number;
  /**
   * A face is near-degenerate when the magnitude of its cross product is at
   * most this fraction of its longest squared edge. Defaults to 1e-12, matching
   * UV atlas face admission; use 0 to report only zero-area faces.
   */
  readonly relativeAreaTolerance?: number;
}

export type AuraTopologyValidationErrorCode = "INVALID_INPUT" | "CAPACITY" | "UNSUPPORTED_TOPOLOGY";

/** Malformed input, unsupported topology, and exceeded budgets fail explicitly. */
export class AuraTopologyValidationError extends Error {
  constructor(public readonly code: AuraTopologyValidationErrorCode, message: string) {
    super(`Aura3D topology validation: ${message}`);
    this.name = "AuraTopologyValidationError";
  }
}

export interface AuraTopologyInvalidIndex {
  /** Offset in the original index stream, or the implicit sequential stream. */
  readonly offset: number;
  readonly triangle: number;
  /** Retains the original value, including malformed non-number entries. */
  readonly value: unknown;
  readonly reason: "not-a-safe-integer" | "out-of-range";
}

export interface AuraTopologyDegenerateFace {
  /** Triangle number in the original stream. */
  readonly triangle: number;
  readonly vertices: readonly [number, number, number];
  readonly reason: "repeated-index" | "zero-area" | "near-zero-area";
}

export interface AuraTopologyEdge {
  /** Original vertex indices in ascending order; coincident positions stay distinct. */
  readonly vertices: readonly [number, number];
  /** Incident non-degenerate triangle numbers, in source order. */
  readonly triangles: readonly number[];
}

export interface AuraTopologyValidationResult {
  readonly topology: "triangles";
  /** Groups, draw ranges, and morph targets do not restrict or deform this analysis. */
  readonly scope: "all-base-triangles";
  /** An empty index list means a sequential, non-indexed stream. */
  readonly indexed: boolean;
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** Only triangles with valid indices and non-degenerate positions contribute edges. */
  readonly analyzedTriangleCount: number;
  readonly edgeCount: number;
  readonly relativeAreaTolerance: number;
  readonly invalidIndices: readonly AuraTopologyInvalidIndex[];
  readonly degenerateFaces: readonly AuraTopologyDegenerateFace[];
  /** Edges with exactly one incident analyzed triangle. */
  readonly boundaryEdges: readonly AuraTopologyEdge[];
  /** Edges with more than two incident analyzed triangles. */
  readonly nonManifoldEdges: readonly AuraTopologyEdge[];
  /**
   * Edges traversed in the same direction by at least two incident triangles.
   * Nonmanifold edges can also appear here.
   */
  readonly inconsistentWindingEdges: readonly AuraTopologyEdge[];
  /**
   * False when invalid-index or degenerate triangles were omitted. In that
   * case the edge lists describe only a subset and may contain artificial
   * boundaries; they are not a complete classification of the input mesh.
   */
  readonly edgeAnalysisComplete: boolean;
  /**
   * No invalid indices, degenerate faces, nonmanifold edges, or winding
   * conflicts were detected. Boundary edges do not make this false. This is
   * not a general mesh-validity or self-intersection guarantee.
   */
  readonly valid: boolean;
}

const DEFAULT_MAX_VERTICES = 196_608;
const HARD_MAX_VERTICES = 196_608;
const DEFAULT_MAX_TRIANGLES = 16_384;
const HARD_MAX_TRIANGLES = 65_536;
const DEFAULT_RELATIVE_AREA_TOLERANCE = 1e-12;

interface PositionLayout {
  readonly data: Float32Array | readonly unknown[];
  readonly tuples: boolean;
  readonly vertexCount: number;
}

interface EdgeUse {
  readonly vertices: [number, number];
  readonly triangles: number[];
  forward: number;
  backward: number;
}

function invalid(message: string): never {
  throw new AuraTopologyValidationError("INVALID_INPUT", message);
}

function capacity(message: string): never {
  throw new AuraTopologyValidationError("CAPACITY", message);
}

function limit(value: number | undefined, name: string, fallback: number, minimum: number, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    invalid(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return resolved;
}

function positionLayout(value: unknown, maxVertices: number): PositionLayout {
  if (!(value instanceof Float32Array || Array.isArray(value))) {
    invalid("positions must be a Float32Array, packed number array, or vec3 tuple array");
  }
  const tuples = Array.isArray(value) && value.length > 0 && Array.isArray(value[0]);
  if (!tuples && value.length % 3 !== 0) invalid("packed positions must contain complete vec3 values");
  const vertexCount = tuples ? value.length : value.length / 3;
  if (vertexCount > maxVertices) capacity(`vertex count ${vertexCount} exceeds ${maxVertices}`);
  if (vertexCount < 3) invalid("triangle geometry requires at least three positions");
  return { data: value, tuples, vertexCount };
}

function finiteFloat32(value: unknown, offset: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(`position component ${offset} must be a finite number`);
  }
  const converted = Math.fround(value);
  if (!Number.isFinite(converted)) invalid(`position component ${offset} must be finite in float32 storage`);
  return converted;
}

function readPositions(layout: PositionLayout): Float32Array {
  const result = new Float32Array(layout.vertexCount * 3);
  if (layout.tuples) {
    for (let vertex = 0; vertex < layout.vertexCount; vertex += 1) {
      const tuple = layout.data[vertex];
      if (!Array.isArray(tuple) || tuple.length !== 3) invalid(`position ${vertex} must be a vec3 tuple`);
      for (let axis = 0; axis < 3; axis += 1) {
        const offset = vertex * 3 + axis;
        result[offset] = finiteFloat32(tuple[axis], offset);
      }
    }
  } else {
    for (let offset = 0; offset < result.length; offset += 1) {
      result[offset] = finiteFloat32(layout.data[offset], offset);
    }
  }
  return result;
}

function degeneracy(
  positions: Float32Array,
  vertices: readonly [number, number, number],
  tolerance: number
): AuraTopologyDegenerateFace["reason"] | undefined {
  const [a, b, c] = vertices;
  if (a === b || b === c || c === a) return "repeated-index";
  const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
  const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
  const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const twiceArea = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
  if (twiceArea === 0) return "zero-area";
  const longest = Math.max(
    Math.hypot(abx, aby, abz),
    Math.hypot(acx, acy, acz),
    Math.hypot(cx - bx, cy - by, cz - bz)
  );
  return twiceArea <= tolerance * longest * longest ? "near-zero-area" : undefined;
}

/**
 * Analyze a complete triangle-list index stream without mutating the source.
 * Indices, not coordinates, define vertex identity; use an explicit welding
 * operation first if coincident seams should be connected. Positions are
 * checked after the float32 conversion used by runtime geometry buffers.
 *
 * The result concerns base positions and the entire stream, irrespective of
 * groups, drawRange, morph targets, and other attributes, which are not
 * validated here. It does not test vertex-manifoldness, duplicate surfaces,
 * geometric self-intersections, or changes caused by deformation.
 *
 * Work and retained output are linear in the admitted vertices and triangles
 * (expected constant-time edge map operations). At most three edge incidences
 * and three invalid-index records are produced per triangle. Edge lists follow
 * first occurrence in the source stream; face and index diagnostics follow
 * source order. Capacity is checked before allocating the working buffers.
 */
export function validateAuraGeometryTopology(
  source: AuraCustomGeometrySpec,
  options: AuraTopologyValidationOptions = {}
): AuraTopologyValidationResult {
  if (!source || typeof source !== "object") invalid("geometry is required");
  if (source.kind !== "aura-custom-geometry") invalid("geometry kind must be aura-custom-geometry");
  if (source.topology !== undefined && source.topology !== "triangles") {
    throw new AuraTopologyValidationError("UNSUPPORTED_TOPOLOGY", `only triangle lists are supported, got ${String(source.topology)}`);
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) invalid("options must be an object");
  const maxVertices = limit(options.maxVertices, "maxVertices", DEFAULT_MAX_VERTICES, 3, HARD_MAX_VERTICES);
  const maxTriangles = limit(options.maxTriangles, "maxTriangles", DEFAULT_MAX_TRIANGLES, 1, HARD_MAX_TRIANGLES);
  const tolerance = options.relativeAreaTolerance === undefined ? DEFAULT_RELATIVE_AREA_TOLERANCE : options.relativeAreaTolerance;
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    invalid("relativeAreaTolerance must be a finite number from 0 through 1");
  }

  const layout = positionLayout(source.positions, maxVertices);
  const indices = source.indices;
  if (!(Array.isArray(indices) || indices instanceof Uint16Array || indices instanceof Uint32Array)) {
    invalid("indices must be a number array, Uint16Array, or Uint32Array; use an empty list for non-indexed geometry");
  }
  const indexed = indices.length > 0;
  const indexCount = indexed ? indices.length : layout.vertexCount;
  if (indexCount > maxTriangles * 3) capacity(`triangle count exceeds ${maxTriangles}`);
  if (indexCount === 0 || indexCount % 3 !== 0) invalid("indices must contain complete, nonempty triangles");
  const triangleCount = indexCount / 3;
  const positions = readPositions(layout);
  const invalidIndices: AuraTopologyInvalidIndex[] = [];
  const degenerateFaces: AuraTopologyDegenerateFace[] = [];
  const edges = new Map<string, EdgeUse>();
  let analyzedTriangleCount = 0;

  const addEdge = (from: number, to: number, triangle: number): void => {
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const key = `${a}:${b}`;
    let edge = edges.get(key);
    if (!edge) {
      edge = { vertices: [a, b], triangles: [], forward: 0, backward: 0 };
      edges.set(key, edge);
    }
    edge.triangles.push(triangle);
    if (from === a) edge.forward += 1;
    else edge.backward += 1;
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertices: [number, number, number] = [0, 0, 0];
    let hasInvalidIndex = false;
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = triangle * 3 + corner;
      const value: unknown = indexed ? indices[offset] : offset;
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        invalidIndices.push({ offset, triangle, value, reason: "not-a-safe-integer" });
        hasInvalidIndex = true;
      } else if (value < 0 || value >= layout.vertexCount) {
        invalidIndices.push({ offset, triangle, value, reason: "out-of-range" });
        hasInvalidIndex = true;
      } else {
        vertices[corner] = value;
      }
    }
    if (hasInvalidIndex) continue;
    const reason = degeneracy(positions, vertices, tolerance);
    if (reason) {
      degenerateFaces.push({ triangle, vertices, reason });
      continue;
    }
    analyzedTriangleCount += 1;
    addEdge(vertices[0], vertices[1], triangle);
    addEdge(vertices[1], vertices[2], triangle);
    addEdge(vertices[2], vertices[0], triangle);
  }

  const boundaryEdges: AuraTopologyEdge[] = [];
  const nonManifoldEdges: AuraTopologyEdge[] = [];
  const inconsistentWindingEdges: AuraTopologyEdge[] = [];
  for (const edge of edges.values()) {
    const result: AuraTopologyEdge = { vertices: edge.vertices, triangles: edge.triangles };
    if (edge.triangles.length === 1) boundaryEdges.push(result);
    if (edge.triangles.length > 2) nonManifoldEdges.push(result);
    if (edge.forward > 1 || edge.backward > 1) inconsistentWindingEdges.push(result);
  }
  const edgeAnalysisComplete = invalidIndices.length === 0 && degenerateFaces.length === 0;
  return {
    topology: "triangles",
    scope: "all-base-triangles",
    indexed,
    vertexCount: layout.vertexCount,
    triangleCount,
    analyzedTriangleCount,
    edgeCount: edges.size,
    relativeAreaTolerance: tolerance,
    invalidIndices,
    degenerateFaces,
    boundaryEdges,
    nonManifoldEdges,
    inconsistentWindingEdges,
    edgeAnalysisComplete,
    valid: edgeAnalysisComplete && nonManifoldEdges.length === 0 && inconsistentWindingEdges.length === 0
  };
}

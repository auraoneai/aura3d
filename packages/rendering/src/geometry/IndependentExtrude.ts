/**
 * Independently authored straight extrusion, built from the native planar
 * shape mesh. This path deliberately does not implement bevels or path sweeps.
 */
import { shapeParityMesh } from "./Shape";
import type { ParityMesh } from "./Support";

export interface IndependentLinearExtrusionOptions {
  readonly depth?: number;
  readonly steps?: number;
  readonly curveSegments?: number;
}

const MAX_STEPS = 1_024;
const MAX_OUTPUT_VERTICES = 1_000_000;
const FLOAT32_RELATIVE_TOLERANCE = 0.05;

type BoundaryEdge = { readonly from: number; readonly to: number; count: number };

/**
 * The renderer stores vertex coordinates as Float32. Check every layer before
 * allocating geometry, so rounding cannot collapse a wall or change its step
 * height materially. Negative depths still produce levels in ascending order.
 */
function extrusionLevels(depth: number, steps: number): number[] {
  if (!Number.isFinite(depth) || depth === 0) {
    throw new RangeError("Linear extrusion depth must be finite and nonzero.");
  }
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > MAX_STEPS) {
    throw new RangeError(`Linear extrusion steps must be an integer between 1 and ${MAX_STEPS}.`);
  }
  const roundedDepth = Math.fround(depth);
  if (!Number.isFinite(roundedDepth) || roundedDepth === 0 || Math.abs(roundedDepth / depth - 1) > FLOAT32_RELATIVE_TOLERANCE) {
    throw new RangeError("Linear extrusion depth exceeds Float32 precision.");
  }

  const extent = Math.abs(depth);
  const stepHeight = extent / steps;
  const levels: number[] = [];
  let previous = -Infinity;
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const level = depth > 0 ? extent * fraction : -extent * (1 - fraction);
    const rounded = Math.fround(level);
    if (!Number.isFinite(rounded) || (index > 0 &&
      (!(rounded > previous) || Math.abs((rounded - previous) / stepHeight - 1) > FLOAT32_RELATIVE_TOLERANCE))) {
      throw new RangeError("Linear extrusion levels collapse or distort beyond Float32 precision.");
    }
    levels.push(level);
    previous = rounded;
  }
  return levels;
}

/**
 * Count directed edges of the planar triangles. Internal edges occur twice in
 * opposite directions, while every contour or hole edge occurs once. The
 * surface lies to the left of each remaining edge, including around holes.
 */
function findBoundaryEdges(indices: readonly number[], vertexCount: number): BoundaryEdge[] {
  const edges = new Map<string, BoundaryEdge>();
  const addEdge = (from: number, to: number): void => {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < 0 || from >= vertexCount || to >= vertexCount || from === to) {
      throw new RangeError("Linear extrusion received invalid planar triangle indices.");
    }
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    const edge = edges.get(key);
    if (!edge) {
      edges.set(key, { from, to, count: 1 });
    } else {
      if (edge.count !== 1 || edge.from !== to || edge.to !== from) {
        throw new RangeError("Linear extrusion requires a consistently wound, manifold planar surface.");
      }
      edge.count += 1;
    }
  };
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new RangeError("Linear extrusion requires at least one planar triangle.");
  }
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]!, b = indices[index + 1]!, c = indices[index + 2]!;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  const boundary = [...edges.values()].filter((edge) => edge.count === 1);
  if (boundary.length === 0) throw new RangeError("Linear extrusion requires a boundary.");
  return boundary;
}

/**
 * Extrude a sampled shape along Z. Both depth signs produce outward winding;
 * cap triangles use material group 0 and side triangles use material group 1.
 * This bounded path accepts at most 1,024 steps and 1,000,000 output vertices.
 */
export function independentExtrude(shape: unknown, options: IndependentLinearExtrusionOptions = {}): ParityMesh {
  const depth = options.depth ?? 1;
  const steps = options.steps ?? 1;
  const levels = extrusionLevels(depth, steps);
  const cap = shapeParityMesh({ shape, curveSegments: options.curveSegments });
  const capIndices = cap.indices;
  if (!capIndices) throw new RangeError("Linear extrusion requires indexed planar triangles.");
  const boundary = findBoundaryEdges(capIndices, cap.positions.length / 3);
  const capVertexCount = capIndices.length * 2;
  const sideVertexCount = boundary.length * steps * 6;
  const vertexCount = capVertexCount + sideVertexCount;
  if (!Number.isSafeInteger(vertexCount) || vertexCount > MAX_OUTPUT_VERTICES) {
    throw new RangeError(`Linear extrusion exceeds the ${MAX_OUTPUT_VERTICES}-vertex output capacity.`);
  }

  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const vertex = (point: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): void => {
    positions.push(cap.positions[point * 3]!, cap.positions[point * 3 + 1]!, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
  };
  const capVertex = (point: number, z: number, nz: number): void => {
    vertex(point, z, 0, 0, nz, cap.positions[point * 3]!, cap.positions[point * 3 + 1]!);
  };
  const bottom = levels[0]!, top = levels[steps]!;
  for (let index = 0; index < capIndices.length; index += 3) {
    const a = capIndices[index]!, b = capIndices[index + 1]!, c = capIndices[index + 2]!;
    capVertex(a, bottom, -1);
    capVertex(c, bottom, -1);
    capVertex(b, bottom, -1);
    capVertex(a, top, 1);
    capVertex(b, top, 1);
    capVertex(c, top, 1);
  }

  for (const edge of boundary) {
    const dx = cap.positions[edge.to * 3]! - cap.positions[edge.from * 3]!;
    const dy = cap.positions[edge.to * 3 + 1]! - cap.positions[edge.from * 3 + 1]!;
    const length = Math.hypot(dx, dy);
    if (!(length > 0) || !Number.isFinite(length)) throw new RangeError("Linear extrusion requires finite, nonzero boundary edges.");
    const nx = dy / length, ny = -dx / length;
    for (let step = 0; step < steps; step += 1) {
      const low = levels[step]!, high = levels[step + 1]!;
      const v0 = step / steps, v1 = (step + 1) / steps;
      vertex(edge.from, low, nx, ny, 0, 0, v0);
      vertex(edge.to, low, nx, ny, 0, 1, v0);
      vertex(edge.to, high, nx, ny, 0, 1, v1);
      vertex(edge.from, low, nx, ny, 0, 0, v0);
      vertex(edge.to, high, nx, ny, 0, 1, v1);
      vertex(edge.from, high, nx, ny, 0, 0, v1);
    }
  }
  return {
    positions, normals, uvs,
    groups: [
      { start: 0, count: capVertexCount, materialIndex: 0 },
      { start: capVertexCount, count: sideVertexCount, materialIndex: 1 },
    ],
  };
}

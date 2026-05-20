import { Geometry, type Bounds3 } from "./Geometry";
import { IndexBuffer } from "./IndexBuffer";
import { VertexBuffer } from "./VertexBuffer";

export interface MorphTargetDelta {
  readonly positions?: readonly (readonly [number, number, number])[];
  readonly normals?: readonly (readonly [number, number, number])[];
  readonly tangents?: readonly (readonly [number, number, number])[];
}

export function applyMorphTargets(
  geometry: Geometry,
  targets: readonly MorphTargetDelta[],
  weights: readonly number[]
): Geometry {
  if (targets.length !== weights.length) {
    throw new Error("Morph target count must match morph weight count.");
  }
  const source = geometry.vertexBuffer;
  const output = new VertexBuffer(source.format, source.vertexCount);
  for (let vertex = 0; vertex < source.vertexCount; vertex += 1) {
    for (const attribute of source.format.attributes) {
      output.setAttribute(vertex, attribute.semantic, source.getAttribute(vertex, attribute.semantic));
    }
    if (source.format.hasAttribute("position")) {
      output.setAttribute(vertex, "position", morphVec3(source.getAttribute(vertex, "position"), targets, weights, vertex, "positions"));
    }
    if (source.format.hasAttribute("normal")) {
      output.setAttribute(vertex, "normal", normalizeVec3(morphVec3(source.getAttribute(vertex, "normal"), targets, weights, vertex, "normals")));
    }
    if (source.format.hasAttribute("tangent")) {
      output.setAttribute(vertex, "tangent", morphTangent(source.getAttribute(vertex, "tangent"), targets, weights, vertex));
    }
  }
  return new Geometry(output, geometry.indexBuffer ? new IndexBuffer(Array.from(geometry.indexBuffer.data), source.vertexCount) : null, geometry.topology);
}

export function computeMorphTargetEnvelopeBounds(geometry: Geometry, targets: readonly MorphTargetDelta[]): Bounds3 {
  if (targets.length === 0 || !geometry.vertexBuffer.format.hasAttribute("position")) {
    return geometry.bounds;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
    const base = geometry.vertexBuffer.getAttribute(vertex, "position");
    const lower: [number, number, number] = [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0];
    const upper: [number, number, number] = [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0];
    for (const target of targets) {
      const delta = target.positions?.[vertex];
      if (!delta) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = delta[axis] ?? 0;
        if (value < 0) lower[axis] += value;
        if (value > 0) upper[axis] += value;
      }
    }
    includeBoundsPoint(min, max, lower);
    includeBoundsPoint(min, max, upper);
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) {
    return geometry.bounds;
  }
  return { min, max };
}

export function computeMorphTargetWeightedBounds(geometry: Geometry, targets: readonly MorphTargetDelta[], weights: readonly number[]): Bounds3 {
  if (targets.length === 0 || weights.length === 0 || !geometry.vertexBuffer.format.hasAttribute("position")) {
    return geometry.bounds;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
    includeBoundsPoint(min, max, morphVec3(geometry.vertexBuffer.getAttribute(vertex, "position"), targets, weights, vertex, "positions"));
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) {
    return geometry.bounds;
  }
  return { min, max };
}

function morphVec3(
  base: readonly number[],
  targets: readonly MorphTargetDelta[],
  weights: readonly number[],
  vertex: number,
  key: "positions" | "normals" | "tangents"
): readonly [number, number, number] {
  const result: [number, number, number] = [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0];
  for (let index = 0; index < targets.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (weight === 0) continue;
    const delta = targets[index]?.[key]?.[vertex];
    if (!delta) continue;
    result[0] += delta[0] * weight;
    result[1] += delta[1] * weight;
    result[2] += delta[2] * weight;
  }
  return result;
}

function normalizeVec3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-9 ? [value[0] / length, value[1] / length, value[2] / length] : [0, 0, 1];
}

function includeBoundsPoint(min: [number, number, number], max: [number, number, number], point: readonly [number, number, number]): void {
  min[0] = Math.min(min[0], point[0]);
  min[1] = Math.min(min[1], point[1]);
  min[2] = Math.min(min[2], point[2]);
  max[0] = Math.max(max[0], point[0]);
  max[1] = Math.max(max[1], point[1]);
  max[2] = Math.max(max[2], point[2]);
}

function morphTangent(
  base: readonly number[],
  targets: readonly MorphTargetDelta[],
  weights: readonly number[],
  vertex: number
): readonly [number, number, number, number] {
  const morphed = normalizeVec3(morphVec3(base, targets, weights, vertex, "tangents"));
  return [morphed[0], morphed[1], morphed[2], base[3] ?? 1];
}

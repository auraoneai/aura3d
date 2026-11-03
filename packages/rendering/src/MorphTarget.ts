import { Geometry, type Bounds3 } from "./Geometry";
import { IndexBuffer } from "./IndexBuffer";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat } from "./VertexFormat";

export interface MorphTargetDelta {
  readonly name?: string;
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
  const buffers = createMorphTargetBuffers(geometry);
  let index: IndexBuffer | null = null;
  let result: Geometry | undefined;
  try {
    writeMorphTargetBuffers(geometry, buffers, targets, weights);
    const sourceIndex = geometry.indexBuffer;
    if (sourceIndex) index = new IndexBuffer(sourceIndex.data, geometry.vertexBuffer.vertexCount, sourceIndex.type);
    result = new Geometry(
      buffers[0]!,
      index,
      geometry.topology,
      undefined,
      buffers.slice(1)
    );
    result.drawRange = geometry.drawRange;
    result.groups = geometry.groups;
    result.morphTargets = geometry.morphTargets;
    return result;
  } catch (error) {
    // Once constructed, Geometry owns its buffer retains. Before that point
    // these are still our unattached allocations. Attempt every release while
    // retaining the operation's original error, even when cleanup also fails.
    if (result) {
      try { result.dispose(); } catch { /* Preserve the morph failure. */ }
    } else {
      for (const buffer of buffers) {
        try { buffer.dispose(); } catch { /* Preserve the morph failure. */ }
      }
      try { index?.dispose(); } catch { /* Preserve the morph failure. */ }
    }
    throw error;
  }
}

/** Allocate independent streams for a CPU morph result, promoting morphed integer
 * attributes to floats so deltas are not rounded, clamped or re-normalized. */
export function createMorphTargetBuffers(geometry: Geometry): VertexBuffer[] {
  const sourceFormat = geometry.vertexBuffer.format;
  const nextOffsets = new Map(sourceFormat.streams.map((stream) => [stream.slot, Math.ceil(stream.stride / 4) * 4]));
  let promoted = false;
  const attributes = sourceFormat.attributes.map((attribute) => {
    const stream = sourceFormat.streams.find((candidate) => candidate.slot === attribute.bufferSlot)!;
    if (stream.stepMode === "vertex" && isMorphAttribute(attribute.semantic) && attribute.integer) {
      throw new Error(`CPU morph ${attribute.semantic} cannot preserve an integer shader input`);
    }
    if (stream.stepMode !== "vertex" || !isMorphAttribute(attribute.semantic) || attribute.type === "float32") return attribute;
    promoted = true;
    const offset = nextOffsets.get(attribute.bufferSlot)!;
    nextOffsets.set(attribute.bufferSlot, offset + attribute.components * 4);
    return { ...attribute, offset, type: "float32" as const, normalized: false, integer: false };
  });
  const format = promoted
    ? new VertexFormat(attributes, nextOffsets.get(0), sourceFormat.streams.map((stream) => ({
      ...stream,
      stride: nextOffsets.get(stream.slot)!
    })))
    : sourceFormat;
  const buffers: VertexBuffer[] = [];
  try {
    for (const stream of format.streams) {
      buffers.push(new VertexBuffer(format, geometry.getVertexBuffer(stream.slot).vertexCount, stream.slot));
    }
    return buffers;
  } catch (error) {
    for (const buffer of buffers) {
      try { buffer.dispose(); } catch { /* Preserve the allocation failure. */ }
    }
    throw error;
  }
}

/** Rewrite reusable morph buffers from the live source streams. */
export function writeMorphTargetBuffers(
  source: Geometry,
  outputs: readonly VertexBuffer[],
  targets: readonly MorphTargetDelta[],
  weights: readonly number[]
): void {
  if (targets.length !== weights.length) throw new Error("Morph target count must match morph weight count.");
  const format = source.vertexBuffer.format;
  // An instance-rate base with a per-vertex delta cannot be represented by a
  // single output stream. Reject an active delta before changing any buffers.
  for (const attribute of format.attributes) {
    const stream = format.streams.find((candidate) => candidate.slot === attribute.bufferSlot)!;
    const key = attribute.semantic === "position" ? "positions"
      : attribute.semantic === "normal" ? "normals"
      : attribute.semantic === "tangent" ? "tangents" : undefined;
    if (key && stream.stepMode === "instance" && targets.some((target, index) => (weights[index] ?? 0) !== 0 && target[key] !== undefined)) {
      throw new Error(`CPU morph ${attribute.semantic} deltas require a per-vertex attribute`);
    }
  }
  for (const attribute of format.attributes) {
    const stream = format.streams.find((candidate) => candidate.slot === attribute.bufferSlot)!;
    const input = source.getAttributeBuffer(attribute.semantic);
    const output = outputs.find((buffer) => buffer.bufferSlot === attribute.bufferSlot);
    if (!output) throw new Error(`Morph output is missing buffer slot ${attribute.bufferSlot}`);
    const key = attribute.semantic === "position" ? "positions"
      : attribute.semantic === "normal" ? "normals"
      : attribute.semantic === "tangent" ? "tangents" : undefined;
    for (let vertex = 0; vertex < input.vertexCount; vertex += 1) {
      if (!key || stream.stepMode !== "vertex") {
        output.setAttribute(vertex, attribute.semantic, input.getAttribute(vertex, attribute.semantic));
        continue;
      }
      const base = input.getDecodedAttribute(vertex, attribute.semantic);
      const morphed = key === "positions" ? morphVec3(base, targets, weights, vertex, key)
        : key === "normals" ? normalizeVec3(morphVec3(base, targets, weights, vertex, key))
        : morphTangent(base, targets, weights, vertex);
      // Preserve any extra components and the declared width for unusual formats.
      const values = Array.from({ length: attribute.components }, (_, component) => morphed[component] ?? base[component] ?? 0);
      output.setAttribute(vertex, attribute.semantic, values);
    }
  }
}

function isMorphAttribute(semantic: string): boolean {
  return semantic === "position" || semantic === "normal" || semantic === "tangent";
}

export function computeMorphTargetEnvelopeBounds(geometry: Geometry, targets: readonly MorphTargetDelta[]): Bounds3 {
  if (targets.length === 0 || !geometry.vertexBuffer.format.hasAttribute("position")) {
    return geometry.bounds;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
    const base = geometry.getAttributeBuffer("position").getDecodedAttribute(vertex, "position");
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
    includeBoundsPoint(min, max, morphVec3(geometry.getAttributeBuffer("position").getDecodedAttribute(vertex, "position"), targets, weights, vertex, "positions"));
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

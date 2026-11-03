import { Geometry, type Bounds3 } from "./Geometry";
import type { VertexBuffer } from "./VertexBuffer";
import {
  applyMorphTargets,
  computeMorphTargetEnvelopeBounds,
  computeMorphTargetWeightedBounds,
  type MorphTargetDelta
} from "./MorphTarget";

export interface SkinningBoundsPalette {
  readonly jointCount: number;
  readonly matrices: Float32Array | readonly number[];
  readonly extraInfluences?: boolean;
}

/**
 * T2.6 (PRD-06 §T2.6) — per-joint local AABBs in bind space. For each joint,
 * the AABB of every vertex that joint influences with positive weight.
 * `bindSkeleton` carries no
 * vertex data, so the computation is keyed on `Geometry` and cached in a
 * WeakMap — recomputed if the joint count or any contributing stream changes.
 * Layout: jointCount * 6 floats — [minX, minY, minZ, maxX, maxY, maxZ] per
 * joint, or Infinity/-Infinity for an unused joint.
 */
export function computeGeometryJointLocalBounds(geometry: Geometry, jointCount: number): Float32Array {
  const format = geometry.vertexBuffer.format;
  const semantics = (["position", "joints", "weights", "joints1", "weights1"] as const).filter((semantic) => format.hasAttribute(semantic));
  const streams = semantics.map((semantic) => geometry.getAttributeBuffer(semantic));
  const revisions = streams.map((buffer) => buffer.revision);
  const cached = geometryJointLocalBoundsCache.get(geometry);
  if (cached && cached.jointCount === jointCount && cached.streams.length === streams.length
    && streams.every((buffer, index) => buffer === cached.streams[index] && revisions[index] === cached.revisions[index])) return cached.boxes;
  const boxes = new Float32Array(jointCount * 6);
  let minWeight4 = Infinity, maxWeight4 = -Infinity, minWeight8 = Infinity, maxWeight8 = -Infinity;
  let hasUnweighted4 = false, hasUnweighted8 = false;
  for (let joint = 0; joint < jointCount; joint += 1) {
    boxes[joint * 6 + 0] = Infinity;
    boxes[joint * 6 + 1] = Infinity;
    boxes[joint * 6 + 2] = Infinity;
    boxes[joint * 6 + 3] = -Infinity;
    boxes[joint * 6 + 4] = -Infinity;
    boxes[joint * 6 + 5] = -Infinity;
  }
  if (format.hasAttribute("position") && format.hasAttribute("joints") && format.hasAttribute("weights")) {
    const positionBuffer = geometry.getAttributeBuffer("position");
    const jointBuffer = geometry.getAttributeBuffer("joints");
    const weightBuffer = geometry.getAttributeBuffer("weights");
    const hasExtra = format.hasAttribute("joints1") && format.hasAttribute("weights1");
    const joint1Buffer = hasExtra ? geometry.getAttributeBuffer("joints1") : undefined;
    const weight1Buffer = hasExtra ? geometry.getAttributeBuffer("weights1") : undefined;
    const vertexCount = geometry.vertexBuffer.vertexCount;
    const instanceCount = skinningInstanceCapacity(geometry, [jointBuffer, weightBuffer, joint1Buffer, weight1Buffer]);
    for (let record = 0; record < vertexCount * instanceCount; record += 1) {
      const vertex = record % vertexCount;
      const instance = Math.floor(record / vertexCount);
      const position = positionBuffer.getDecodedAttribute(vertex, "position");
      const includeInfluences = (joints: readonly number[], weights: readonly number[]) => {
        for (let slot = 0; slot < joints.length && slot < 4; slot += 1) {
          const weight = weights[slot] ?? 0;
          if (weight <= 0 || jointCount <= 0) continue;
          const joint = Math.max(0, Math.min(jointCount - 1, Math.trunc(joints[slot] ?? 0)));
          const base = joint * 6;
          for (let axis = 0; axis < 3; axis += 1) {
            const value = position[axis] ?? 0;
            if (value < boxes[base + axis]!) boxes[base + axis] = value;
            if (value > boxes[base + 3 + axis]!) boxes[base + 3 + axis] = value;
          }
        }
      };
      const weights = readSkinningAttribute(weightBuffer, "weights", vertex, instance);
      const extraWeights = hasExtra ? readSkinningAttribute(weight1Buffer!, "weights1", vertex, instance) : [];
      includeInfluences(readSkinningAttribute(jointBuffer, "joints", vertex, instance), weights);
      if (hasExtra) includeInfluences(readSkinningAttribute(joint1Buffer!, "joints1", vertex, instance), extraWeights);
      const sum4 = weights.slice(0, 4).reduce((sum, weight) => sum + weight, 0);
      const sum8 = sum4 + extraWeights.slice(0, 4).reduce((sum, weight) => sum + weight, 0);
      if (sum4 > 0.0001) { minWeight4 = Math.min(minWeight4, sum4); maxWeight4 = Math.max(maxWeight4, sum4); }
      else hasUnweighted4 = true;
      if (sum8 > 0.0001) { minWeight8 = Math.min(minWeight8, sum8); maxWeight8 = Math.max(maxWeight8, sum8); }
      else hasUnweighted8 = true;
    }
  }
  geometryJointLocalBoundsCache.set(geometry, { jointCount, streams, revisions, boxes, minWeight4, maxWeight4, minWeight8, maxWeight8, hasUnweighted4, hasUnweighted8 });
  return boxes;
}

const geometryJointLocalBoundsCache = new WeakMap<Geometry, {
  readonly jointCount: number;
  readonly streams: readonly Geometry["vertexBuffer"][];
  readonly revisions: readonly number[];
  readonly boxes: Float32Array;
  readonly minWeight4: number;
  readonly maxWeight4: number;
  readonly minWeight8: number;
  readonly maxWeight8: number;
  readonly hasUnweighted4: boolean;
  readonly hasUnweighted8: boolean;
}>();

/**
 * Union each joint's local box transformed by that joint's palette matrix —
 * the 8 corners of the bind-space box mapped through `matrices[j*16..]`.
 * Conservative for any pose (each influenced vertex lives in its joint's box,
 * so its skinned position lands inside that joint's transformed box), and
 * much tighter than the whole-geometry bound for articulated rigs.
 */
export function computeSkinnedGeometryBoundsFromJointBoxes(geometry: Geometry, skinning: SkinningBoundsPalette | undefined): Bounds3 {
  if (!skinning) return geometry.bounds;
  const boxes = computeGeometryJointLocalBounds(geometry, skinning.jointCount);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let joint = 0; joint < skinning.jointCount; joint += 1) {
    const base = joint * 6;
    if (!Number.isFinite(boxes[base]!)) continue;
    const offset = joint * 16;
    for (let corner = 0; corner < 8; corner += 1) {
      const point: readonly [number, number, number] = [
        boxes[base + (corner & 1) * 3]!,
        boxes[base + ((corner >> 1) & 1) * 3 + 1]!,
        boxes[base + ((corner >> 2) & 1) * 3 + 2]!
      ];
      includeBoundsPoint(min, max, transformPoint(skinning.matrices, offset, point));
    }
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return geometry.bounds;
  // Quantized weights can sum near, but not exactly, to one. The transformed
  // joint-box union bounds normalized mixtures; scaling it by the observed
  // weight-sum extrema also contains the shader's unnormalized weighted sum.
  const cached = geometryJointLocalBoundsCache.get(geometry)!;
  const minimumWeight = skinning.extraInfluences ? cached.minWeight8 : cached.minWeight4;
  const maximumWeight = skinning.extraInfluences ? cached.maxWeight8 : cached.maxWeight4;
  if (Number.isFinite(minimumWeight) && Number.isFinite(maximumWeight)) {
    for (let axis = 0; axis < 3; axis += 1) {
      const low = min[axis]!, high = max[axis]!;
      min[axis] = Math.min(low, low * minimumWeight, low * maximumWeight, high * minimumWeight, high * maximumWeight);
      max[axis] = Math.max(high, low * minimumWeight, low * maximumWeight, high * minimumWeight, high * maximumWeight);
    }
  }
  if (skinning.extraInfluences ? cached.hasUnweighted8 : cached.hasUnweighted4) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, geometry.bounds.min[axis]!);
      max[axis] = Math.max(max[axis]!, geometry.bounds.max[axis]!);
    }
  }
  return { min, max };
}

export function computeSkinnedGeometryBounds(geometry: Geometry, skinning: SkinningBoundsPalette | undefined): Bounds3 {
  if (!skinning || !geometry.vertexBuffer.format.hasAttribute("position") || !geometry.vertexBuffer.format.hasAttribute("joints") || !geometry.vertexBuffer.format.hasAttribute("weights")) {
    return geometry.bounds;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const positionBuffer = geometry.getAttributeBuffer("position");
  const jointBuffer = geometry.getAttributeBuffer("joints");
  const weightBuffer = geometry.getAttributeBuffer("weights");
  const hasExtra = skinning.extraInfluences && geometry.vertexBuffer.format.hasAttribute("joints1") && geometry.vertexBuffer.format.hasAttribute("weights1");
  const joint1Buffer = hasExtra ? geometry.getAttributeBuffer("joints1") : undefined;
  const weight1Buffer = hasExtra ? geometry.getAttributeBuffer("weights1") : undefined;
  const vertexCount = geometry.vertexBuffer.vertexCount;
  const instanceCount = skinningInstanceCapacity(geometry, [jointBuffer, weightBuffer, joint1Buffer, weight1Buffer]);
  for (let record = 0; record < vertexCount * instanceCount; record += 1) {
    const vertex = record % vertexCount;
    const instance = Math.floor(record / vertexCount);
    const position = positionBuffer.getDecodedAttribute(vertex, "position");
    const joints = readSkinningAttribute(jointBuffer, "joints", vertex, instance);
    const weights = readSkinningAttribute(weightBuffer, "weights", vertex, instance);
    const joints1 = joint1Buffer ? readSkinningAttribute(joint1Buffer, "joints1", vertex, instance) : undefined;
    const weights1 = weight1Buffer ? readSkinningAttribute(weight1Buffer, "weights1", vertex, instance) : undefined;
    const skinned = skinPoint(position, joints, weights, skinning, joints1, weights1);
    includeBoundsPoint(min, max, skinned);
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return geometry.bounds;
  return { min, max };
}

/**
 * Auto-recompute culling-correct bounds for an animated skinned mesh.
 *
 * A single-frame skinned bound is only valid for that frame: as joints move, vertices can
 * leave the bound and the mesh gets frustum-culled while still visible ("disappearing
 * heroes"). This unions the skinned bounds across per-frame joint palettes (e.g. sampled
 * clip keyframes), producing one conservative bound that stays valid for the whole motion.
 * Pure and deterministic. Returns the rest-pose geometry bounds when `palettes` is empty.
 */
export function computeAnimatedSkinnedBoundsUnion(
  geometry: Geometry,
  palettes: readonly (SkinningBoundsPalette | undefined)[]
): Bounds3 {
  let min: [number, number, number] | undefined;
  let max: [number, number, number] | undefined;
  for (const palette of palettes) {
    const bounds = computeSkinnedGeometryBounds(geometry, palette);
    if (!min || !max) {
      min = [...bounds.min] as [number, number, number];
      max = [...bounds.max] as [number, number, number];
    } else {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], bounds.min[axis] ?? min[axis]);
        max[axis] = Math.max(max[axis], bounds.max[axis] ?? max[axis]);
      }
    }
  }
  return min && max ? { min, max } : geometry.bounds;
}

export function computeSkinnedMorphTargetWeightedBounds(
  geometry: Geometry,
  skinning: SkinningBoundsPalette | undefined,
  targets: readonly MorphTargetDelta[] | undefined,
  weights: readonly number[] | undefined
): Bounds3 {
  if (!targets || targets.length === 0 || !weights || weights.length === 0) {
    return computeSkinnedGeometryBounds(geometry, skinning);
  }
  if (!skinning) {
    return computeMorphTargetWeightedBounds(geometry, targets, weights);
  }
  const morphed = applyMorphTargets(geometry, targets, weights);
  try {
    return computeSkinnedGeometryBounds(morphed, skinning);
  } finally {
    morphed.dispose();
  }
}

export function computeSkinnedMorphTargetEnvelopeBounds(
  geometry: Geometry,
  skinning: SkinningBoundsPalette | undefined,
  targets: readonly MorphTargetDelta[] | undefined
): Bounds3 {
  if (!targets || targets.length === 0) {
    return computeSkinnedGeometryBounds(geometry, skinning);
  }
  if (!skinning || !geometry.vertexBuffer.format.hasAttribute("position") || !geometry.vertexBuffer.format.hasAttribute("joints") || !geometry.vertexBuffer.format.hasAttribute("weights")) {
    return computeMorphTargetEnvelopeBounds(geometry, targets);
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const positionBuffer = geometry.getAttributeBuffer("position");
  const jointBuffer = geometry.getAttributeBuffer("joints");
  const weightBuffer = geometry.getAttributeBuffer("weights");
  const hasExtra = skinning.extraInfluences && geometry.vertexBuffer.format.hasAttribute("joints1") && geometry.vertexBuffer.format.hasAttribute("weights1");
  const joint1Buffer = hasExtra ? geometry.getAttributeBuffer("joints1") : undefined;
  const weight1Buffer = hasExtra ? geometry.getAttributeBuffer("weights1") : undefined;
  const vertexCount = geometry.vertexBuffer.vertexCount;
  const instanceCount = skinningInstanceCapacity(geometry, [jointBuffer, weightBuffer, joint1Buffer, weight1Buffer]);
  for (let record = 0; record < vertexCount * instanceCount; record += 1) {
    const vertex = record % vertexCount;
    const instance = Math.floor(record / vertexCount);
    const base = positionBuffer.getDecodedAttribute(vertex, "position");
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
    const joints = readSkinningAttribute(jointBuffer, "joints", vertex, instance);
    const weights = readSkinningAttribute(weightBuffer, "weights", vertex, instance);
    const joints1 = joint1Buffer ? readSkinningAttribute(joint1Buffer, "joints1", vertex, instance) : undefined;
    const weights1 = weight1Buffer ? readSkinningAttribute(weight1Buffer, "weights1", vertex, instance) : undefined;
    // A joint rotation can make any corner extremal, not just lower or upper.
    for (let corner = 0; corner < 8; corner += 1) {
      const point = [corner & 1 ? upper[0] : lower[0], corner & 2 ? upper[1] : lower[1], corner & 4 ? upper[2] : lower[2]];
      includeBoundsPoint(min, max, skinPoint(point, joints, weights, skinning, joints1, weights1));
    }
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return geometry.bounds;
  return { min, max };
}

function skinPoint(
  position: readonly number[],
  joints: readonly number[],
  weights: readonly number[],
  skinning: SkinningBoundsPalette,
  joints1?: readonly number[],
  weights1?: readonly number[]
): readonly [number, number, number] {
  const input: readonly [number, number, number] = [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0];
  const output: [number, number, number] = [0, 0, 0];
  let weightSum = 0;
  const applyInfluences = (indices: readonly number[], factors: readonly number[]) => {
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = factors[slot] ?? 0;
      if (weight === 0) continue;
      const joint = Math.max(0, Math.min(skinning.jointCount - 1, Math.trunc(indices[slot] ?? 0)));
      const transformed = transformPoint(skinning.matrices, joint * 16, input);
      output[0] += transformed[0] * weight;
      output[1] += transformed[1] * weight;
      output[2] += transformed[2] * weight;
      weightSum += weight;
    }
  };
  applyInfluences(joints, weights);
  if (joints1 && weights1) applyInfluences(joints1, weights1);
  return weightSum > 0.0001 ? output : input;
}

/** Union every drawable instance when skin inputs themselves advance per instance. */
function skinningInstanceCapacity(geometry: Geometry, buffers: readonly (VertexBuffer | undefined)[]): number {
  if (!buffers.some((buffer) => buffer && buffer.format.streams.find((stream) => stream.slot === buffer.bufferSlot)?.stepMode === "instance")) return 1;
  let capacity = Infinity;
  for (const stream of geometry.vertexBuffer.format.streams) {
    if (stream.stepMode === "instance") capacity = Math.min(capacity, geometry.getVertexBuffer(stream.slot).vertexCount * stream.divisor);
  }
  return Number.isFinite(capacity) ? capacity : 1;
}

function readSkinningAttribute(buffer: VertexBuffer, semantic: "joints" | "weights" | "joints1" | "weights1", vertex: number, instance: number): readonly number[] {
  const stream = buffer.format.streams.find((candidate) => candidate.slot === buffer.bufferSlot)!;
  return buffer.getDecodedAttribute(stream.stepMode === "instance" ? Math.floor(instance / stream.divisor) : vertex, semantic);
}

function transformPoint(matrices: Float32Array | readonly number[], offset: number, point: readonly [number, number, number]): readonly [number, number, number] {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  return [
    (mat(matrices, offset + 0) * x) + (mat(matrices, offset + 4) * y) + (mat(matrices, offset + 8) * z) + mat(matrices, offset + 12),
    (mat(matrices, offset + 1) * x) + (mat(matrices, offset + 5) * y) + (mat(matrices, offset + 9) * z) + mat(matrices, offset + 13),
    (mat(matrices, offset + 2) * x) + (mat(matrices, offset + 6) * y) + (mat(matrices, offset + 10) * z) + mat(matrices, offset + 14)
  ];
}

function mat(matrices: Float32Array | readonly number[], index: number): number {
  return matrices[index] ?? 0;
}

function includeBoundsPoint(min: [number, number, number], max: [number, number, number], point: readonly [number, number, number]): void {
  min[0] = Math.min(min[0], point[0]);
  min[1] = Math.min(min[1], point[1]);
  min[2] = Math.min(min[2], point[2]);
  max[0] = Math.max(max[0], point[0]);
  max[1] = Math.max(max[1], point[1]);
  max[2] = Math.max(max[2], point[2]);
}

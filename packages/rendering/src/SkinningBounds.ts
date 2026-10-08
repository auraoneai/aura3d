import { Geometry, type Bounds3 } from "./Geometry";
import {
  applyMorphTargets,
  computeMorphTargetEnvelopeBounds,
  computeMorphTargetWeightedBounds,
  type MorphTargetDelta
} from "./MorphTarget";

export interface SkinningBoundsPalette {
  readonly jointCount: number;
  readonly matrices: Float32Array | readonly number[];
}

/**
 * T2.6 (PRD-06 §T2.6) — per-joint local AABBs in bind space. For each joint,
 * the AABB of every vertex that joint influences with weight > 0.01 (the same
 * 0.01 cutoff the legacy skinned-unlit path used). `bindSkeleton` carries no
 * vertex data, so the computation is keyed on `Geometry` and cached in a
 * WeakMap — recomputed only if a geometry binds a different joint count.
 * Layout: jointCount * 6 floats — [minX, minY, minZ, maxX, maxY, maxZ] per
 * joint, or Infinity/-Infinity for an unused joint.
 */
export function computeGeometryJointLocalBounds(geometry: Geometry, jointCount: number): Float32Array {
  const cached = geometryJointLocalBoundsCache.get(geometry);
  if (cached && cached.jointCount === jointCount) return cached.boxes;
  const boxes = new Float32Array(jointCount * 6);
  for (let joint = 0; joint < jointCount; joint += 1) {
    boxes[joint * 6 + 0] = Infinity;
    boxes[joint * 6 + 1] = Infinity;
    boxes[joint * 6 + 2] = Infinity;
    boxes[joint * 6 + 3] = -Infinity;
    boxes[joint * 6 + 4] = -Infinity;
    boxes[joint * 6 + 5] = -Infinity;
  }
  if (geometry.vertexBuffer.format.hasAttribute("position") && geometry.vertexBuffer.format.hasAttribute("joints") && geometry.vertexBuffer.format.hasAttribute("weights")) {
    for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
      const position = geometry.vertexBuffer.getAttribute(vertex, "position");
      const joints = geometry.vertexBuffer.getAttribute(vertex, "joints");
      const weights = geometry.vertexBuffer.getAttribute(vertex, "weights");
      for (let slot = 0; slot < joints.length && slot < 4; slot += 1) {
        const weight = weights[slot] ?? 0;
        if (weight <= 0.01) continue;
        const joint = Math.max(0, Math.min(jointCount - 1, Math.trunc(joints[slot] ?? 0)));
        const base = joint * 6;
        for (let axis = 0; axis < 3; axis += 1) {
          const value = position[axis] ?? 0;
          if (value < boxes[base + axis]!) boxes[base + axis] = value;
          if (value > boxes[base + 3 + axis]!) boxes[base + 3 + axis] = value;
        }
      }
    }
  }
  geometryJointLocalBoundsCache.set(geometry, { jointCount, boxes });
  return boxes;
}

const geometryJointLocalBoundsCache = new WeakMap<Geometry, { readonly jointCount: number; readonly boxes: Float32Array }>();

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
  return { min, max };
}

export function computeSkinnedGeometryBounds(geometry: Geometry, skinning: SkinningBoundsPalette | undefined): Bounds3 {
  if (!skinning || !geometry.vertexBuffer.format.hasAttribute("position") || !geometry.vertexBuffer.format.hasAttribute("joints") || !geometry.vertexBuffer.format.hasAttribute("weights")) {
    return geometry.bounds;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
    const position = geometry.vertexBuffer.getAttribute(vertex, "position");
    const joints = geometry.vertexBuffer.getAttribute(vertex, "joints");
    const weights = geometry.vertexBuffer.getAttribute(vertex, "weights");
    const skinned = skinPoint(position, joints, weights, skinning);
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
    const joints = geometry.vertexBuffer.getAttribute(vertex, "joints");
    const weights = geometry.vertexBuffer.getAttribute(vertex, "weights");
    includeBoundsPoint(min, max, skinPoint(lower, joints, weights, skinning));
    includeBoundsPoint(min, max, skinPoint(upper, joints, weights, skinning));
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return geometry.bounds;
  return { min, max };
}

function skinPoint(
  position: readonly number[],
  joints: readonly number[],
  weights: readonly number[],
  skinning: SkinningBoundsPalette
): readonly [number, number, number] {
  const input: readonly [number, number, number] = [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0];
  const output: [number, number, number] = [0, 0, 0];
  let weightSum = 0;
  for (let slot = 0; slot < 4; slot += 1) {
    const weight = weights[slot] ?? 0;
    if (weight === 0) continue;
    const joint = Math.max(0, Math.min(skinning.jointCount - 1, Math.trunc(joints[slot] ?? 0)));
    const transformed = transformPoint(skinning.matrices, joint * 16, input);
    output[0] += transformed[0] * weight;
    output[1] += transformed[1] * weight;
    output[2] += transformed[2] * weight;
    weightSum += weight;
  }
  return weightSum > 0.0001 ? output : input;
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

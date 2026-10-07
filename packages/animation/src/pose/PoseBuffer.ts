/**
 * PRD-06 T1.1 — flat per-bone TRS storage for the pose pipeline.
 *
 * One `PoseBuffer` holds a full skeleton pose: `positions`/`scales` are
 * `3 × boneCount` (x, y, z) and `rotations` is `4 × boneCount` (x, y, z, w).
 * Fresh buffers start at the identity pose (zero translation/rotation, unit
 * scale); {@link copyPose} copies in place with no allocation.
 */

export interface PoseBuffer {
  readonly boneCount: number;
  /** `3 × boneCount` — x, y, z per bone. */
  readonly positions: Float32Array;
  /** `4 × boneCount` — x, y, z, w per bone. */
  readonly rotations: Float32Array;
  /** `3 × boneCount` — x, y, z per bone. */
  readonly scales: Float32Array;
}

export function createPoseBuffer(boneCount: number): PoseBuffer {
  if (!Number.isInteger(boneCount) || boneCount < 0) {
    throw new Error("createPoseBuffer requires a non-negative integer bone count.");
  }
  const rotations = new Float32Array(boneCount * 4);
  const scales = new Float32Array(boneCount * 3);
  for (let index = 0; index < boneCount; index += 1) {
    rotations[index * 4 + 3] = 1;
    scales[index * 3] = 1;
    scales[index * 3 + 1] = 1;
    scales[index * 3 + 2] = 1;
  }
  return {
    boneCount,
    positions: new Float32Array(boneCount * 3),
    rotations,
    scales
  };
}

/** Copy every channel of `src` into `dst` in place. Buffer sizes must match. */
export function copyPose(dst: PoseBuffer, src: PoseBuffer): PoseBuffer {
  if (dst.boneCount !== src.boneCount) {
    throw new Error("copyPose requires buffers with matching bone counts.");
  }
  dst.positions.set(src.positions);
  dst.rotations.set(src.rotations);
  dst.scales.set(src.scales);
  return dst;
}

/** Restore `pose` to the identity transform on every bone (no allocation). */
export function resetPoseToIdentity(pose: PoseBuffer): PoseBuffer {
  pose.positions.fill(0);
  pose.rotations.fill(0);
  pose.scales.fill(1);
  for (let index = 0; index < pose.boneCount; index += 1) {
    pose.rotations[index * 4 + 3] = 1;
  }
  return pose;
}

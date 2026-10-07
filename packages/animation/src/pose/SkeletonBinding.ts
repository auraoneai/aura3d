/**
 * PRD-06 T1.1 — binds a glTF skin to the live node list by **node index**.
 *
 * `jointNames` are debug/diagnostic only: rigs with duplicate bone names
 * (Mixamo `Spine` reused for a twist joint, symmetric helpers, generated
 * rigs) bind every joint correctly because resolution goes through the
 * skin's `joints[]` node indices, never a name map.
 *
 * The binding captures the **rest pose**: the nodes' local TRS at bind time.
 * The PoseMixer starts each evaluation from it (§6.3), which is what
 * three r185 `PropertyBinding` treats as "original state".
 */

import type { Quat, Vec3 } from "../Keyframe.js";
import { createPoseBuffer, type PoseBuffer } from "./PoseBuffer.js";

/** Structural node view the binding needs — keeps this module scene-free. */
export interface SkeletonNodeRef {
  readonly name: string;
  /** Local TRS at bind time (glTF node local transform). */
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

export interface BindSkeletonOptions {
  /** glTF skin `joints[]` — node indices in skin order. */
  readonly joints: readonly number[];
  /** Optional node-index → node lookup. Supply it for every skeleton bind. */
  readonly resolveNode: (nodeIndex: number) => SkeletonNodeRef | undefined;
  /** Diagnostic names, in the same order as `joints` (glTF `jointNames`). */
  readonly jointNames?: readonly string[];
  /**
   * Parent **joint** index per joint (-1 for skin roots), from
   * `skin.skeleton.bones[i].parentIndex`. Needed by `BoneMask`
   * `{bone, descendants}` selectors.
   */
  readonly parentIndices?: readonly number[];
}

export interface SkeletonBinding {
  readonly boneCount: number;
  /** Resolved bones in skin joint order. */
  readonly joints: readonly SkeletonNodeRef[];
  /** Node index (`joints[i]` input) per joint — the identity that resolved it. */
  readonly jointNodeIndices: readonly number[];
  /** Diagnostic names, aligned with `joints`. */
  readonly jointNames: readonly string[];
  /** Parent joint index per joint (-1 when unknown or a skin root). */
  readonly parentIndices: readonly number[];
  /** Name → joint indices; a duplicated name maps to *all* its slots. */
  readonly jointIndicesByName: ReadonlyMap<string, readonly number[]>;
  /** Local TRS at bind time; the mixer's evaluation base. */
  readonly restPose: PoseBuffer;
  /** Node indices named in `joints` that `resolveNode` could not find. */
  readonly missingNodeIndices: readonly number[];
}

export function bindSkeleton(options: BindSkeletonOptions): SkeletonBinding {
  const { joints, resolveNode, jointNames, parentIndices } = options;
  const boneCount = joints.length;
  const nodes: SkeletonNodeRef[] = [];
  const names: string[] = [];
  const missing: number[] = [];
  const indicesByName = new Map<string, number[]>();
  const restPose = createPoseBuffer(boneCount);

  for (let index = 0; index < boneCount; index += 1) {
    const nodeIndex = joints[index]!;
    const node = resolveNode(nodeIndex);
    const name = node?.name ?? jointNames?.[index] ?? `joint${nodeIndex}`;
    nodes.push(node ?? { name, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
    names.push(name);
    if (!node) {
      missing.push(nodeIndex);
    } else {
      restPose.positions[index * 3] = node.position[0];
      restPose.positions[index * 3 + 1] = node.position[1];
      restPose.positions[index * 3 + 2] = node.position[2];
      restPose.rotations[index * 4] = node.rotation[0];
      restPose.rotations[index * 4 + 1] = node.rotation[1];
      restPose.rotations[index * 4 + 2] = node.rotation[2];
      restPose.rotations[index * 4 + 3] = node.rotation[3];
      restPose.scales[index * 3] = node.scale[0];
      restPose.scales[index * 3 + 1] = node.scale[1];
      restPose.scales[index * 3 + 2] = node.scale[2];
    }
    const bucket = indicesByName.get(name);
    if (bucket) bucket.push(index);
    else indicesByName.set(name, [index]);
  }

  return {
    boneCount,
    joints: nodes,
    jointNodeIndices: [...joints],
    jointNames: names,
    parentIndices: parentIndices
      ? [...parentIndices]
      : new Array<number>(boneCount).fill(-1),
    jointIndicesByName: indicesByName,
    restPose,
    missingNodeIndices: missing
  };
}

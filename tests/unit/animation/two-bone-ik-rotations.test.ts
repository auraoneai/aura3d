/**
 * T3.1 — `solveTwoBoneIkRotations` (PRD-06 §7.2): tip reaches the target
 * within 1 mm when reachable, mid stays on the pole plane, no flip across a
 * 360° target sweep.
 */
import { describe, expect, it } from "vitest";
import { solveTwoBoneIkRotations, solveTwoBoneIk } from "../../../packages/animation/src/IK";
import { bindSkeleton, type SkeletonBinding } from "../../../packages/animation/src/pose/SkeletonBinding";
import { copyPose, createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

type Vec3 = readonly [number, number, number];

const IDENTITY_MODEL: Float32Array = Float32Array.from([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

/** Straight chain: root at origin, mid +1Y, tip +2Y (two 1-unit links). */
function makeChainSkeleton(): SkeletonBinding {
  const nodes = [
    { name: "root", position: [0, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 },
    { name: "mid", position: [0, 1, 0] as Vec3, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 },
    { name: "tip", position: [0, 1, 0] as Vec3, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 }
  ];
  return bindSkeleton({
    joints: [0, 1, 2],
    resolveNode: (i) => nodes[i] as never,
    parentIndices: [-1, 0, 1]
  });
}

/** Forward-kinematics world position of `joint` under `pose` (test-local). */
function jointWorld(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): Vec3 {
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const scl: Vec3 = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return pos;
  const pf = jointWorldAndRotation(pose, skeleton, parent);
  const scaled: Vec3 = [pos[0] * pf.scale[0], pos[1] * pf.scale[1], pos[2] * pf.scale[2]];
  const rotated = rotateVec3(pf.rotation, scaled);
  return [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]];
}

function jointWorldAndRotation(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): { position: Vec3; rotation: readonly [number, number, number, number]; scale: Vec3 } {
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const scl: Vec3 = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!];
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return { position: pos, rotation: rot, scale: scl };
  const pf = jointWorldAndRotation(pose, skeleton, parent);
  const scaled: Vec3 = [pos[0] * pf.scale[0], pos[1] * pf.scale[1], pos[2] * pf.scale[2]];
  const rotated = rotateVec3(pf.rotation, scaled);
  return {
    position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
    rotation: multiplyQuat(pf.rotation, rot),
    scale: [pf.scale[0] * scl[0], pf.scale[1] * scl[1], pf.scale[2] * scl[2]]
  };
}

function rotateVec3(q: readonly [number, number, number, number], v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

function multiplyQuat(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): readonly [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz
  ] as const;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("T3.1 — solveTwoBoneIkRotations", () => {
  it("tip reaches a reachable target within 1 mm", () => {
    const skeleton = makeChainSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    solveTwoBoneIkRotations(pose, skeleton, IDENTITY_MODEL, { root: "root", mid: "mid", tip: "tip" }, [0.5, 1.5, 0]);
    const tip = jointWorld(pose, skeleton, 2);
    expect(distance(tip, [0.5, 1.5, 0])).toBeLessThanOrEqual(1e-3);
  });

  it("mid stays on the pole plane", () => {
    const skeleton = makeChainSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    // Pole forward +Z: the bend plane contains root, target axis and +Z.
    solveTwoBoneIkRotations(pose, skeleton, IDENTITY_MODEL,
      { root: "root", mid: "mid", tip: "tip", pole: [0, 1, 1] }, [0.5, 1.5, 0]);
    const mid = jointWorld(pose, skeleton, 1);
    const root = jointWorld(pose, skeleton, 0);
    const axisDir = [0.5, 1.5, 0];
    const axisLen = Math.hypot(...axisDir);
    const axis: Vec3 = [axisDir[0] / axisLen, axisDir[1] / axisLen, axisDir[2] / axisLen];
    const poleDir: Vec3 = [0, 1, 1];
    // Plane normal = axis × pole; mid−root must be ⊥ to it.
    const normal: Vec3 = [
      axis[1] * poleDir[2] - axis[2] * poleDir[1],
      axis[2] * poleDir[0] - axis[0] * poleDir[2],
      axis[0] * poleDir[1] - axis[1] * poleDir[0]
    ];
    const nl = Math.hypot(...normal);
    const n: Vec3 = [normal[0] / nl, normal[1] / nl, normal[2] / nl];
    const midDelta: Vec3 = [mid[0] - root[0], mid[1] - root[1], mid[2] - root[2]];
    const d = Math.abs(midDelta[0] * n[0] + midDelta[1] * n[1] + midDelta[2] * n[2]);
    expect(d).toBeLessThanOrEqual(1e-3);
  });

  it("no flip across a 360° target sweep (consecutive mids move ≤ 0.2)", () => {
    const skeleton = makeChainSkeleton();
    let previousMid: Vec3 | undefined;
    let maxStep = 0;
    for (let i = 0; i < 72; i += 1) {
      const pose = createPoseBuffer(3);
      copyPose(pose, skeleton.restPose);
      const angle = (i / 72) * Math.PI * 2;
      const target: Vec3 = [Math.cos(angle) * 1.2, 1.0, Math.sin(angle) * 1.2];
      solveTwoBoneIkRotations(pose, skeleton, IDENTITY_MODEL,
        { root: "root", mid: "mid", tip: "tip" }, target);
      const mid = jointWorld(pose, skeleton, 1);
      if (previousMid) {
        const step = distance(mid, previousMid);
        // A flip would jump the elbow across the opposite side (> 0.5 for a
        // 1-unit upper link); continuous targets must move smoothly.
        expect(step).toBeLessThanOrEqual(0.2);
        maxStep = Math.max(maxStep, step);
      }
      previousMid = mid;
    }
    expect(maxStep).toBeGreaterThan(0); // sanity: the sweep actually moved the joint
  });

  it("clamps unreachable targets to full reach instead of failing", () => {
    const skeleton = makeChainSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    solveTwoBoneIkRotations(pose, skeleton, IDENTITY_MODEL, { root: "root", mid: "mid", tip: "tip" }, [0, 4.5, 0]);
    const tip = jointWorld(pose, skeleton, 2);
    const root = jointWorld(pose, skeleton, 0);
    // 2-unit reach: tip lands on the axis at the max distance.
    expect(distance(tip, root)).toBeLessThanOrEqual(2.001);
    expect(distance(tip, root)).toBeGreaterThanOrEqual(1.99);
  });

  it("weight 0 leaves the pose bitwise untouched; weight < 1 blends", () => {
    const skeleton = makeChainSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    const snapshot = Float32Array.from(pose.rotations);
    solveTwoBoneIkRotations(pose, skeleton, IDENTITY_MODEL,
      { root: "root", mid: "mid", tip: "tip", weight: 0 }, [0.5, 1.5, 0]);
    expect(Array.from(pose.rotations)).toEqual(Array.from(snapshot));

    solveTwoBoneIkRotations(pose, skeleton, IDENTITY_MODEL,
      { root: "root", mid: "mid", tip: "tip", weight: 0.5 }, [0.5, 1.5, 0]);
    const tipHalf = jointWorld(pose, skeleton, 2);
    // Half blend: tip moved toward the target but did not reach it.
    expect(distance(tipHalf, [0.5, 1.5, 0])).toBeGreaterThan(1e-3);
    expect(tipHalf[1]).toBeLessThan(2);
  });

  it("deprecated position-space solveTwoBoneIk still works (wrapper)", () => {
    const result = solveTwoBoneIk({ root: [0, 0, 0], mid: [0, 1, 0], end: [0, 2, 0], target: [0.5, 1.5, 0] });
    expect(result.reached).toBe(true);
  });
});

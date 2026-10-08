/**
 * T3.4 — `solveCcdIk`: a 6-bone tail reaches a reachable target in ≤ 8
 * iterations; cone limits cap per-bone rotation; tolerance 1 mm.
 */
import { describe, expect, it } from "vitest";
import { solveCcdIk } from "../../../packages/animation/src/pose/CcdIkConstraint";
import { bindSkeleton, type SkeletonBinding } from "../../../packages/animation/src/pose/SkeletonBinding";
import { copyPose, createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const IDENTITY: Float32Array = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Six-bone tail straight up +Y, 0.2 links. */
function makeTail(): SkeletonBinding {
  const nodes = [{ name: "base", position: [0, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 }];
  for (let i = 1; i <= 6; i += 1) {
    nodes.push({ name: `seg${i}`, position: [0, 0.2, 0] as Vec3, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 });
  }
  return bindSkeleton({
    joints: nodes.map((_, i) => i),
    resolveNode: (i) => nodes[i] as never,
    parentIndices: [-1, 0, 1, 2, 3, 4, 5]
  });
}

function jointWorld(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): Vec3 {
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const rot: Quat = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return pos;
  const pf = worldRot(pose, skeleton, parent);
  const rotated = rotateVec3(pf.rotation, pos);
  return [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]];
}

function worldRot(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): { position: Vec3; rotation: Quat } {
  const rot: Quat = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!];
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return { position: pos, rotation: rot };
  const pf = worldRot(pose, skeleton, parent);
  const rotated = rotateVec3(pf.rotation, pos);
  return { position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]], rotation: multiplyQuat(pf.rotation, rot) };
}

function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz
  ] as const;
}

const CHAIN = ["seg1", "seg2", "seg3", "seg4", "seg5", "seg6"] as const;

describe("T3.4 — solveCcdIk", () => {
  it("a 6-bone tail reaches a reachable target in ≤ 8 iterations", () => {
    const skeleton = makeTail();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);
    const result = solveCcdIk(pose, skeleton, IDENTITY, { chain: CHAIN }, [0.6, 0.8, 0]);
    const tip = jointWorld(pose, skeleton, 6);
    const error = Math.hypot(tip[0] - 0.6, tip[1] - 0.8, tip[2]);
    expect(result.iterations).toBeLessThanOrEqual(8);
    expect(error).toBeLessThanOrEqual(0.001);
    expect(result.reached).toBe(true);
  });

  it("cone limits cap each bone's rotation per solve", () => {
    const skeleton = makeTail();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);
    const cone = Object.fromEntries(CHAIN.map((name) => [name, 10]));
    // One iteration, 10° cone per joint: total bend ≤ 60° — cannot reach a
    // target needing ~90°, so the solve must partial-curl without reaching.
    const result = solveCcdIk(pose, skeleton, IDENTITY, { chain: CHAIN, coneLimitDeg: cone, iterations: 1 }, [0.6, 0.8, 0]);
    const tip = jointWorld(pose, skeleton, 6);
    const dist = Math.hypot(tip[0] - 0.6, tip[1] - 0.8, tip[2]);
    expect(result.iterations).toBe(1);
    expect(result.reached).toBe(false);
    expect(dist).toBeGreaterThan(0.05);
    const tipDirAngle = Math.atan2(tip[0], tip[1]) * 180 / Math.PI;
    expect(tipDirAngle).toBeGreaterThan(5); // some bend happened
  });

  it("unreachable target: returns reached:false without throwing", () => {
    const skeleton = makeTail();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);
    const result = solveCcdIk(pose, skeleton, IDENTITY, { chain: CHAIN }, [5, 5, 0]);
    expect(result.reached).toBe(false);
    expect(result.iterations).toBeLessThanOrEqual(8);
  });

  it("weight 0 leaves the pose untouched", () => {
    const skeleton = makeTail();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);
    const snapshot = Array.from(pose.rotations);
    solveCcdIk(pose, skeleton, IDENTITY, { chain: CHAIN, weight: 0 }, [0.6, 0.8, 0]);
    expect(Array.from(pose.rotations)).toEqual(snapshot);
  });
});

/**
 * T3.3 — `createLookAtConstraint`: distributed yaw/pitch with limits,
 * critically-damped smoothing, no snap across ±180°.
 */
import { describe, expect, it } from "vitest";
import { createLookAtConstraint } from "../../../packages/animation/src/pose/LookAtConstraint";
import { bindSkeleton, type SkeletonBinding } from "../../../packages/animation/src/pose/SkeletonBinding";
import { copyPose, createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const IDENTITY: Float32Array = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Spine → neck → head, stacked +Y, forward +Z. */
function makeSkeleton(): SkeletonBinding {
  const node = (name: string, position: Vec3) => ({ name, position, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 });
  const nodes = [node("spine", [0, 1.0, 0]), node("neck", [0, 0.3, 0]), node("head", [0, 0.3, 0])];
  return bindSkeleton({ joints: [0, 1, 2], resolveNode: (i) => nodes[i] as never, parentIndices: [-1, 0, 1] });
}

function headForward(pose: PoseBuffer, skeleton: SkeletonBinding): Vec3 {
  const rot = jointWorldRot(pose, skeleton, 2);
  return rotateVec3(rot, [0, 0, 1]);
}

function jointWorldRot(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): Quat {
  const rot: Quat = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return rot;
  return multiplyQuat(jointWorldRot(pose, skeleton, parent), rot);
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

/** Total applied yaw of the head forward from +Z, in degrees (−180, 180]. */
function appliedYawDeg(pose: PoseBuffer, skeleton: SkeletonBinding): number {
  const f = headForward(pose, skeleton);
  return (Math.atan2(f[0], f[2]) * 180) / Math.PI;
}

describe("T3.3 — LookAtConstraint", () => {
  const BONES = [
    { bone: "spine", weight: 0.25 },
    { bone: "neck", weight: 0.35 },
    { bone: "head", weight: 0.4 }
  ];

  it("small targets rotate toward them within limits", () => {
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    const constraint = createLookAtConstraint({ bones: BONES });
    // Settle the spring (run several frames).
    for (let i = 0; i < 60; i += 1) {
      copyPose(pose, skeleton.restPose); // mixer refresh each frame
      constraint.apply(pose, skeleton, IDENTITY, [0.8, 1.6, 1.6], 1 / 60);
    }
    const yaw = appliedYawDeg(pose, skeleton);
    // Target at +X+Z: yaw ≈ +27° (0.8/1.6 ≈ atan 26.6°) distributed across bones.
    expect(Math.abs(yaw)).toBeGreaterThan(15);
    expect(Math.abs(yaw)).toBeLessThan(40);
  });

  it("a target behind beyond the yaw limit clamps to the limit", () => {
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    const constraint = createLookAtConstraint({ bones: BONES, yawLimitDeg: 90, halfLife: 0.01 });
    for (let i = 0; i < 120; i += 1) {
      copyPose(pose, skeleton.restPose); // mixer refresh each frame
      constraint.apply(pose, skeleton, IDENTITY, [0, 1.5, -2], 1 / 60);
    }
    const yaw = Math.abs(appliedYawDeg(pose, skeleton));
    // Full clamp: aggregate ≈ 90° (not 180°).
    expect(yaw).toBeGreaterThanOrEqual(85);
    expect(yaw).toBeLessThanOrEqual(95);
  });

  it("no snap crossing ±180°: applied yaw stays continuous", () => {
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    const constraint = createLookAtConstraint({ bones: BONES, yawLimitDeg: 170, halfLife: 0.05 });
    const yaws: number[] = [];
    // Sweep target around behind the character through ±180°.
    for (let i = 0; i <= 48; i += 1) {
      const a = Math.PI * 0.6 + (i / 48) * Math.PI * 0.8; // 108° → 252°
      const target: Vec3 = [Math.sin(a) * 2, 1.5, Math.cos(a) * 2];
      for (let s = 0; s < 4; s += 1) {
        copyPose(pose, skeleton.restPose); // mixer refresh each frame
        constraint.apply(pose, skeleton, IDENTITY, target, 1 / 60);
      }
      yaws.push(constraint.smoothed.yaw);
    }
    // The smoothed yaw must never wrap-jump by more than ~35° per step
    // (a ±180 snap would be a ~360° jump; the spring keeps steps small).
    for (let i = 1; i < yaws.length; i += 1) {
      const step = Math.abs(yaws[i]! - yaws[i - 1]!);
      expect(step).toBeLessThan(0.6);
    }
  });

  it("an animated forward already pitched down still converges onto the target", () => {
    // Head animated ~40° below flat: the constraint must correct the DELTA to
    // the target's elevation, not just re-apply the target's elevation on top
    // of the clip's pitch (T4.4 §17.2 exercised this with the running rig).
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    const pitchDown = (deg: number): Quat => {
      const half = (deg * Math.PI) / 360;
      return [Math.sin(half), 0, 0, Math.cos(half)]; // R_x(+θ) pitches +Z down
    };
    pose.rotations[8] = pitchDown(40)[0]; // head local R_x(+40°)
    pose.rotations[11] = pitchDown(40)[3];
    const constraint = createLookAtConstraint({ bones: [{ bone: "head", weight: 1 }], halfLife: 0.01 });
    const target: Vec3 = [0, 2.2, 2.5]; // above the head
    for (let i = 0; i < 120; i += 1) {
      // Re-seed the animated pitch each frame, exactly as a mixer does.
      pose.rotations[8] = pitchDown(40)[0];
      pose.rotations[11] = pitchDown(40)[3];
      constraint.apply(pose, skeleton, IDENTITY, target, 1 / 60);
    }
    const f = headForward(pose, skeleton);
    const headPos: Vec3 = [0, 1.6, 0];
    const to: Vec3 = [target[0] - headPos[0], target[1] - headPos[1], target[2] - headPos[2]];
    const l = Math.hypot(to[0], to[1], to[2]);
    const dot = f[0] * to[0] + f[1] * to[1] + f[2] * to[2];
    expect(Math.acos(Math.max(-1, Math.min(1, dot / l))) * 180 / Math.PI).toBeLessThan(5);
  });

  it("eye bones aim directly at the target", () => {
    const node = (name: string, position: Vec3) => ({ name, position, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 });
    const nodes = [
      node("head", [0, 1.6, 0]),
      node("eyeL", [-0.05, 0.05, 0]), node("eyeR", [0.05, 0.05, 0])
    ];
    const skeleton = bindSkeleton({ joints: [0, 1, 2], resolveNode: (i) => nodes[i] as never, parentIndices: [-1, 0, 0] });
    const pose = createPoseBuffer(3);
    copyPose(pose, skeleton.restPose);
    const constraint = createLookAtConstraint({
      bones: [{ bone: "head", weight: 1 }],
      eyes: ["eyeL"],
      halfLife: 0.5 // slow head spring — eyes should still aim exactly
    });
    copyPose(pose, skeleton.restPose);
    constraint.apply(pose, skeleton, IDENTITY, [1.5, 1.65, 0], 1 / 60);
    const eyeForward = rotateVec3(jointWorldRot(pose, skeleton, 1), [0, 0, 1]);
    // Eye aims at [1.5,1.65,0] from [-0.05,1.65,0]: dir ≈ normalize([1.55,0,0]).
    const dot = eyeForward[0] * 1 + eyeForward[1] * 0 + eyeForward[2] * 0;
    expect(dot).toBeGreaterThan(0.99);
  });
});

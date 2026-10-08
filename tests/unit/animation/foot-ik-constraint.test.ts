/**
 * T3.2 — `solveFootIkConstraint` (PRD-06 §7.1/7.2): on a 20° slope both feet
 * penetrate ≤ 1 cm and float ≤ 2 cm; the pelvis drops by the minimum per-foot
 * ground delta clamped to `maxPelvisDrop`; foot tilt caps at 35°.
 */
import { describe, expect, it } from "vitest";
import { createHeightFieldGround, solveFootIkConstraint } from "../../../packages/animation/src/FootIk";
import { bindSkeleton, type SkeletonBinding } from "../../../packages/animation/src/pose/SkeletonBinding";
import { copyPose, createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

type Vec3 = readonly [number, number, number];

const IDENTITY: Float32Array = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const SLOPE_TAN = Math.tan((20 * Math.PI) / 180);

/** height = tan(20°)·x with a consistent plane normal. */
const slopeGround = createHeightFieldGround((x) => {
  const h = SLOPE_TAN * x;
  const n: Vec3 = [-SLOPE_TAN, 1, 0];
  const l = Math.hypot(n[0], n[1], n[2]);
  return { height: h, normal: [n[0] / l, n[1] / l, n[2] / l] };
});

/**
 * Pelvis + two straight leg chains (thigh → knee → ankle). Feet spaced ±0.3 in
 * X across the slope — a ~0.22 m height split forces a real pelvis drop.
 */
function makeTwoLegSkeleton(): SkeletonBinding {
  const node = (name: string, position: Vec3) => ({ name, position, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as Vec3 });
  const nodes = [
    node("pelvis", [0, 1.0, 0]),
    node("l_thigh", [-0.3, 0, 0]), node("l_knee", [0, -0.45, 0]), node("l_ankle", [0, -0.45, 0]),
    node("r_thigh", [0.3, 0, 0]), node("r_knee", [0, -0.45, 0]), node("r_ankle", [0, -0.45, 0])
  ];
  return bindSkeleton({
    joints: [0, 1, 2, 3, 4, 5, 6],
    resolveNode: (i) => nodes[i] as never,
    parentIndices: [-1, 0, 1, 2, 0, 4, 5]
  });
}

function jointWorld(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): Vec3 {
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return pos;
  const pf = jointWorldRot(pose, skeleton, parent);
  return [
    pf.position[0] + rotateVec3(pf.rotation, pos)[0],
    pf.position[1] + rotateVec3(pf.rotation, pos)[1],
    pf.position[2] + rotateVec3(pf.rotation, pos)[2]
  ];
}

function jointWorldRot(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number): { position: Vec3; rotation: readonly [number, number, number, number] } {
  const rot = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!] as const;
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0) return { position: pos, rotation: rot };
  const pf = jointWorldRot(pose, skeleton, parent);
  const rotated = rotateVec3(pf.rotation, pos);
  return {
    position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
    rotation: multiplyQuat(pf.rotation, rot)
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

const LEGS = [
  { root: "l_thigh", mid: "l_knee", tip: "l_ankle", ankleHeight: 0.035 },
  { root: "r_thigh", mid: "r_knee", tip: "r_ankle", ankleHeight: 0.035 }
] as const;

describe("T3.2 — solveFootIkConstraint on a 20° slope", () => {
  it("both feet plant: penetration ≤ 1 cm and float ≤ 2 cm", () => {
    const skeleton = makeTwoLegSkeleton();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);

    solveFootIkConstraint(pose, skeleton, IDENTITY, {
      legs: LEGS,
      ground: slopeGround,
      pelvis: "pelvis",
      maxPelvisDrop: 0.4
    });

    for (const ankleIndex of [3, 6]) {
      const ankle = jointWorld(pose, skeleton, ankleIndex);
      const groundY = SLOPE_TAN * ankle[0];
      const soleY = ankle[1] - 0.035;
      const penetration = groundY - soleY;   // > 0 means below ground
      const float = soleY - groundY;         // > 0 means hovering
      expect(penetration, `foot ${ankleIndex} penetration`).toBeLessThanOrEqual(0.01);
      expect(float, `foot ${ankleIndex} float`).toBeLessThanOrEqual(0.02);
    }
  });

  it("pelvis drops by the minimum per-foot delta, clamped to maxPelvisDrop", () => {
    const skeleton = makeTwoLegSkeleton();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);

    solveFootIkConstraint(pose, skeleton, IDENTITY, {
      legs: LEGS,
      ground: slopeGround,
      pelvis: "pelvis",
      maxPelvisDrop: 0.4
    });
    const pelvisDrop = 1.0 - pose.positions[1]!; // local Y, rest was 1.0
    // Deep foot needs ~0.174 m (downhill foot at x=−0.3 → ground −0.109 → sole
    // target −0.074 vs ankle rest 0.10). Pelvis drop ≈ that, well within 0.4.
    expect(pelvisDrop).toBeGreaterThan(0.05);
    expect(pelvisDrop).toBeLessThanOrEqual(0.4);

    // Clamp check: an extreme slope offset still respects maxPelvisDrop.
    const pose2 = createPoseBuffer(7);
    copyPose(pose2, skeleton.restPose);
    const deepGround = createHeightFieldGround((x) => ({
      height: SLOPE_TAN * x - 0.8,
      normal: [0, 1, 0]
    }));
    solveFootIkConstraint(pose2, skeleton, IDENTITY, {
      legs: LEGS,
      ground: deepGround,
      pelvis: "pelvis",
      maxPelvisDrop: 0.4
    });
    expect(1.0 - pose2.positions[1]!).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it("foot tilt toward the ground normal stays within the 35° cap", () => {
    const skeleton = makeTwoLegSkeleton();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);

    const results = solveFootIkConstraint(pose, skeleton, IDENTITY, {
      legs: LEGS,
      ground: slopeGround,
      pelvis: "pelvis",
      maxFootTiltDeg: 35
    });
    for (const result of results) {
      expect(result.tiltDeg).toBeLessThanOrEqual(35 + 1e-6);
    }
    // Verify the applied ankle rotation is really capped: foot up vs normal.
    const ankleRot = jointWorldRot(pose, skeleton, 3).rotation;
    const footUp = rotateVec3(ankleRot, [0, 1, 0]);
    const n: Vec3 = [-SLOPE_TAN, 1, 0];
    const nl = Math.hypot(...n);
    const normal: Vec3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    const dot = footUp[0] * normal[0] + footUp[1] * normal[1] + footUp[2] * normal[2];
    const appliedDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    // 20° slope needs ~20° of tilt — under the cap, so it should be ≈ applied.
    expect(appliedDeg).toBeLessThanOrEqual(35);
  });

  it("flat ground with planted feet leaves legs effectively unchanged", () => {
    const skeleton = makeTwoLegSkeleton();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);
    // Move the whole rig so feet already stand on y=0 ground.
    pose.positions[1] = 0.935; // pelvis 0.935 → ankles at 0.035 → planted
    const flat = createHeightFieldGround(() => ({ height: 0, normal: [0, 1, 0] }));
    solveFootIkConstraint(pose, skeleton, IDENTITY, {
      legs: LEGS,
      ground: flat,
      pelvis: "pelvis",
      lockOnContact: true
    });
    for (const ankleIndex of [3, 6]) {
      const ankle = jointWorld(pose, skeleton, ankleIndex);
      expect(Math.abs(ankle[1] - 0.035)).toBeLessThanOrEqual(0.01);
    }
  });

  it("non-identity modelMatrix: mounts with translate/rotate plant feet on the world terrain", () => {
    // Regression: `plan.target` is built in model space while
    // `solveTwoBoneIkRotations` expects world space — feeding it directly
    // applies the mount transform twice and the ankle aims ~mount-offset past
    // the terrain (ik-slope left foot missed by 0.37 m on a yaw+translate
    // mount). The caster contract stays model-space (the scene wraps the
    // world heightfield); only the solver target is lifted to world.
    const mount: Float32Array = Float32Array.from([
      // translate [0.95, 0.4, 0] · rotY(+90°), column-major
      0, 0, -1, 0,
      0, 1, 0, 0,
      1, 0, 0, 0,
      0.95, 0.4, 0, 1
    ]);
    const forward = (p: Vec3): Vec3 => [p[2] + 0.95, p[1] + 0.4, -p[0]];
    const inverse = (p: Vec3): Vec3 => {
      const q: Vec3 = [p[0] - 0.95, p[1] - 0.4, p[2]];
      return [-q[2], q[1], q[0]];
    };
    // World-space slope h_w(x, z) = tan(20°)·x, wrapped to model space the
    // same way `modelSpaceHeightAt` wraps scene heightfields.
    const worldNormal: Vec3 = (() => {
      const n: Vec3 = [-SLOPE_TAN, 1, 0];
      const l = Math.hypot(n[0], n[1], n[2]);
      return [n[0] / l, n[1] / l, n[2] / l];
    })();
    const inverseDir = (v: Vec3): Vec3 => [-v[2], v[1], v[0]];
    const modelGround = {
      raycastDown(origin: Vec3, maxDistance: number) {
        const [wx, , wz] = forward([origin[0], 0, origin[2]]);
        const [, ly] = inverse([wx, SLOPE_TAN * wx, wz]);
        const distance = origin[1] - ly;
        if (distance < 0 || distance > maxDistance) return undefined;
        return { point: [origin[0], ly, origin[2]] as Vec3, normal: inverseDir(worldNormal), distance };
      }
    };

    const skeleton = makeTwoLegSkeleton();
    const pose = createPoseBuffer(7);
    copyPose(pose, skeleton.restPose);
    solveFootIkConstraint(pose, skeleton, mount, {
      legs: LEGS,
      ground: modelGround,
      pelvis: "pelvis",
      maxPelvisDrop: 0.4
    });

    // Post-solve: lift each ankle to world and check the sole sits on the
    // world slope at the ankle's own (x, z).
    for (const ankleIndex of [3, 6]) {
      const ankleM = jointWorld(pose, skeleton, ankleIndex);
      const ankleW = forward(ankleM);
      const groundY = SLOPE_TAN * ankleW[0];
      const soleY = ankleW[1] - 0.035;
      expect(soleY - groundY, `world float for ankle ${ankleIndex}`).toBeLessThanOrEqual(0.03);
      expect(groundY - soleY, `world penetration for ankle ${ankleIndex}`).toBeLessThanOrEqual(0.03);
    }
  });

  it("pelvis drop maps through the parent frame — scaled/rotated glTF roots put 'up' off +Y and off unit scale", () => {
    // Soldier-style rig: `character` carries scale 0.01 and a −90° X rotation,
    // so the pelvis' local +Z is the up axis in pose space and its translation
    // units are centimetres. A naive `positions[pelvis*3+1] += drop` would nudge
    // the pelvis sideways by a hundredth of the intended amount instead.
    const s = 0.01;
    const rxNeg90 = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const;
    const node = (name: string, position: Vec3, rotation: readonly [number, number, number, number] = [0, 0, 0, 1], scale = [1, 1, 1] as Vec3) =>
      ({ name, position, rotation, scale });
    const nodes = [
      node("character", [0, 0, 0], rxNeg90, [s, s, s]),
      node("pelvis", [0, 0, 100]),
      node("l_thigh", [-30, 0, 0]), node("l_knee", [0, 0, -45]), node("l_ankle", [0, 0, -45]),
      node("r_thigh", [30, 0, 0]), node("r_knee", [0, 0, -45]), node("r_ankle", [0, 0, -45])
    ];
    const skeleton = bindSkeleton({
      joints: [0, 1, 2, 3, 4, 5, 6, 7],
      resolveNode: (i) => nodes[i] as never,
      parentIndices: [-1, 0, 1, 2, 3, 1, 5, 6]
    });
    const pose = createPoseBuffer(8);
    copyPose(pose, skeleton.restPose);

    const flat = createHeightFieldGround(() => ({ height: 0, normal: [0, 1, 0] }));
    const results = solveFootIkConstraint(pose, skeleton, IDENTITY, {
      legs: [
        { root: "l_thigh", mid: "l_knee", tip: "l_ankle", ankleHeight: 0.035 },
        { root: "r_thigh", mid: "r_knee", tip: "r_ankle", ankleHeight: 0.035 }
      ],
      ground: flat,
      pelvis: "pelvis"
    });

    // Ankles sit at 0.10 m in pose space; sole target is 0.035 → drop −0.065 m,
    // expressed locally as −6.5 on the pelvis' Z (cm, mapped-down axis).
    expect(pose.positions[3]).toBeCloseTo(0, 6);
    expect(pose.positions[4]).toBeCloseTo(0, 6);
    expect(pose.positions[5]).toBeGreaterThan(90);
    expect(pose.positions[5]).toBeLessThan(100);
    expect(100 - pose.positions[5]!).toBeGreaterThan(5);
    expect(100 - pose.positions[5]!).toBeLessThan(8);
    for (const result of results) {
      expect(result.verticalCorrection).toBeLessThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  createHumanoidRetargetingMap,
  retargetHumanoidPose,
  type AnimationPose,
  type AnimationQuaternion,
  type HumanoidRigDefinition
} from "../../../packages/animation/src/index.js";

// --- local quaternion helpers (object form, matching AnimationQuaternion) ---
function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): AnimationQuaternion {
  const len = Math.hypot(ax, ay, az) || 1;
  const half = angle / 2;
  const s = Math.sin(half) / len;
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
}
function mul(a: AnimationQuaternion, b: AnimationQuaternion): AnimationQuaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  };
}
function quatClose(a: AnimationQuaternion | undefined, b: AnimationQuaternion, tol = 1e-5): void {
  expect(a).toBeDefined();
  const q = a!;
  // Quaternions q and -q represent the same rotation; compare |dot| ~ 1.
  const dot = q.x * b.x + q.y * b.y + q.z * b.z + q.w * b.w;
  expect(Math.abs(dot)).toBeGreaterThan(1 - tol);
}

// Minimal complete humanoid rig builder (all required bones present so the map is `ok`).
const ARM_BONES = ["UpperArm", "LowerArm", "Hand"] as const;
function makeRig(
  id: string,
  opts: {
    prefix?: string;
    scale?: number;
    facingAxis?: HumanoidRigDefinition["facingAxis"];
    restPose?: HumanoidRigDefinition["restPose"];
    armLength?: number;
  } = {}
): HumanoidRigDefinition {
  const p = opts.prefix ?? "";
  const len = opts.armLength;
  const bone = (name: string) => ({ name: `${p}${name}`, ...(len !== undefined ? { length: len } : {}) });
  return {
    id,
    scale: opts.scale,
    facingAxis: opts.facingAxis,
    restPose: opts.restPose,
    bones: {
      hips: bone("Hips"),
      spine: bone("Spine"),
      head: bone("Head"),
      leftShoulder: bone("LeftShoulder"),
      leftUpperArm: bone("LeftUpperArm"),
      leftLowerArm: bone("LeftLowerArm"),
      leftHand: bone("LeftHand"),
      rightShoulder: bone("RightShoulder"),
      rightUpperArm: bone("RightUpperArm"),
      rightLowerArm: bone("RightLowerArm"),
      rightHand: bone("RightHand"),
      leftUpperLeg: bone("LeftUpperLeg"),
      leftLowerLeg: bone("LeftLowerLeg"),
      leftFoot: bone("LeftFoot"),
      rightUpperLeg: bone("RightUpperLeg"),
      rightLowerLeg: bone("RightLowerLeg"),
      rightFoot: bone("RightFoot")
    }
  };
}

describe("retargetHumanoidPose", () => {
  it("is a no-op for an identity map (same rig source and target)", () => {
    const rig = makeRig("same");
    const map = createHumanoidRetargetingMap(rig, rig);
    expect(map.ok).toBe(true);

    const armRot = quatFromAxisAngle(0, 0, 1, 0.7);
    const pose: AnimationPose = {
      bones: {
        Hips: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
        LeftUpperArm: { rotation: armRot },
        Spine: { rotation: quatFromAxisAngle(1, 0, 0, 0.3) }
      }
    };
    const out = retargetHumanoidPose(pose, map);

    // Same node names, same rotations, same positions (scale ratio = 1).
    quatClose(out.bones.LeftUpperArm?.rotation, armRot);
    quatClose(out.bones.Spine?.rotation, quatFromAxisAngle(1, 0, 0, 0.3));
    expect(out.bones.Hips?.position).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("reconciles differing rest orientations: Rt = Rt0 · Rs0⁻¹ · Ra", () => {
    // Source arm rests at identity; target arm rests rotated 90° about Z (e.g. A-pose vs T-pose).
    const targetRest = quatFromAxisAngle(0, 0, 1, Math.PI / 2);
    const source = makeRig("src");
    const target = makeRig("tgt", {
      prefix: "T_",
      restPose: { leftUpperArm: { rotation: targetRest } }
    });
    const map = createHumanoidRetargetingMap(source, target);
    expect(map.ok).toBe(true);

    // Source clip rotates the upper arm 45° about X away from its (identity) rest.
    const motion = quatFromAxisAngle(1, 0, 0, Math.PI / 4);
    const pose: AnimationPose = { bones: { LeftUpperArm: { rotation: motion } } };
    const out = retargetHumanoidPose(pose, map);

    // Rs0 = identity, so expected target local = Rt0 · motion.
    const expected = mul(targetRest, motion);
    quatClose(out.bones.T_LeftUpperArm?.rotation, expected);

    // Sanity: it must NOT be a naive 1:1 copy of the source rotation.
    const dotWithCopy =
      (out.bones.T_LeftUpperArm!.rotation!.x * motion.x) +
      (out.bones.T_LeftUpperArm!.rotation!.y * motion.y) +
      (out.bones.T_LeftUpperArm!.rotation!.z * motion.z) +
      (out.bones.T_LeftUpperArm!.rotation!.w * motion.w);
    expect(Math.abs(dotWithCopy)).toBeLessThan(0.999);
  });

  it("reconciles when BOTH rigs have non-identity rests", () => {
    const sourceRest = quatFromAxisAngle(0, 1, 0, 0.4);
    const targetRest = quatFromAxisAngle(0, 0, 1, -0.6);
    const source = makeRig("src2", { restPose: { leftLowerArm: { rotation: sourceRest } } });
    const target = makeRig("tgt2", { prefix: "T_", restPose: { leftLowerArm: { rotation: targetRest } } });
    const map = createHumanoidRetargetingMap(source, target);

    // Author a source local rotation; the motion delta is Rs0⁻¹·Ra.
    const ra = quatFromAxisAngle(1, 0, 0, 0.9);
    const pose: AnimationPose = { bones: { LeftLowerArm: { rotation: ra } } };
    const out = retargetHumanoidPose(pose, map);

    const invSource: AnimationQuaternion = { x: -sourceRest.x, y: -sourceRest.y, z: -sourceRest.z, w: sourceRest.w };
    const expected = mul(targetRest, mul(invSource, ra));
    quatClose(out.bones.T_LeftLowerArm?.rotation, expected);
  });

  it("scales translations by the per-bone length ratio (differently proportioned rigs)", () => {
    const source = makeRig("short", { armLength: 1 });
    const target = makeRig("tall", { prefix: "T_", armLength: 2 });
    const map = createHumanoidRetargetingMap(source, target);

    const pose: AnimationPose = {
      bones: { LeftUpperArm: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }
    };
    const out = retargetHumanoidPose(pose, map);
    expect(out.bones.T_LeftUpperArm?.position).toEqual({ x: 2, y: 4, z: 6 });
  });

  it("applies a whole-body facing correction on the hips when facing axes differ", () => {
    // Source faces +Z, target faces -Z (180° flip about Y).
    const source = makeRig("zf", { facingAxis: "z" });
    const target = makeRig("zb", { prefix: "T_", facingAxis: "-z" });
    const map = createHumanoidRetargetingMap(source, target);
    expect(map.sourceFacingAxis).toBe("z");
    expect(map.targetFacingAxis).toBe("-z");

    const pose: AnimationPose = { bones: { Hips: { rotation: { x: 0, y: 0, z: 0, w: 1 } } } };
    const out = retargetHumanoidPose(pose, map);

    // Hip rotation should now carry a 180° turn (about Y) rather than identity.
    const hipRot = out.bones.T_Hips?.rotation;
    expect(hipRot).toBeDefined();
    const dotIdentity = hipRot!.w; // dot with identity quaternion (0,0,0,1) is just w.
    expect(Math.abs(dotIdentity)).toBeLessThan(0.01); // ~180° turn => w ~ 0.
  });
});

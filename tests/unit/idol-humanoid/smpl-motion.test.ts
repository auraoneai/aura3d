import { describe, expect, it } from "vitest";
import { SMPL_JOINTS, SMPL_PARENTS, smplMotionToClip } from "../../../apps/showcase-port-shared/idol/smplMotion";
import { createHumanoidDriver, quatAxisAngle, quatMul, rotateVec, sampleHumanoidClip, readIdolSkeleton, type Quat, type Vec3 } from "../../../apps/showcase-port-shared/idol/humanoid";
import { PILOT_BONES } from "./pilotSkeleton";

// SMPL-like T-pose rest offsets (metres, parent frame; Y up, facing +Z, left = +X)
const REST: Vec3[] = [[0, 0, 0], [0.08, -0.09, 0], [-0.08, -0.09, 0], [0, 0.1, 0], [0.02, -0.38, 0], [-0.02, -0.38, 0], [0, 0.13, 0],
  [0, -0.4, -0.04], [0, -0.4, -0.04], [0, 0.05, 0], [0.01, -0.07, 0.14], [-0.01, -0.07, 0.14], [0, 0.2, -0.02], [0.06, 0.12, -0.02],
  [-0.06, 0.12, -0.02], [0, 0.1, 0], [0.11, 0.01, 0], [-0.11, 0.01, 0], [0.27, 0.01, 0], [-0.27, 0.01, 0], [0.27, 0, 0], [-0.27, 0, 0]];

/** HY-Motion rot6d of a quaternion: the 3x2 matrix of its first two columns, flattened row-major. */
function rot6d(q: Quat): number[] {
  const c0 = rotateVec(q, [1, 0, 0]), c1 = rotateVec(q, [0, 1, 0]);
  return [c0[0], c1[0], c0[1], c1[1], c0[2], c1[2]];
}

function dict(frames: Quat[][]) {
  const kp = frames.map((L) => {
    const G: Quat[] = [], P: Vec3[] = [];
    L.forEach((q, j) => {
      const p = SMPL_PARENTS[j]!;
      G[j] = p < 0 ? q : quatMul(G[p]!, q);
      const o = p < 0 ? [0, 0, 0] as Vec3 : rotateVec(G[p]!, REST[j]!);
      P[j] = p < 0 ? [0, 0, 0] : [P[p]![0] + o[0], P[p]![1] + o[1], P[p]![2] + o[2]];
    });
    return P.map((p) => [...p]);
  });
  return { rot6d: [frames.map((L) => L.map(rot6d))], transl: [frames.map((_, f) => [0, 1, f * 0.01])], keypoints3d: [kp] };
}

describe("fal hunyuan-motion dict -> canonical clip", () => {
  it("reads row-major rot6d local rotations in SMPL order: a T-pose maps to the T-pose, a lowered arm to a hanging arm", () => {
    const I: Quat = [0, 0, 0, 1];
    const tpose = SMPL_JOINTS.map(() => I);
    const lowered = tpose.map((q, j) => (SMPL_JOINTS[j] === "L_shoulder" ? quatAxisAngle([0, 0, 1], -Math.PI / 2) : q));
    const { clip } = smplMotionToClip("t", dict([tpose, tpose, lowered, lowered]), {});
    const driver = createHumanoidDriver(readIdolSkeleton({
      nodes: [{ name: "auraRoot", children: [1], rotation: [...quatAxisAngle([0, 1, 0], -Math.PI / 2)] }, ...PILOT_BONES.map(([c, t, r], i) => ({ name: `bone_${i}`, children: c.map((x) => x + 1), translation: t, rotation: r }))],
      skins: [{ joints: PILOT_BONES.map((_, i) => i + 1) }]
    }));
    const r = driver.map.roles as Record<string, string>;
    const dir = (pose: any) => { const p = driver.modelPositions(pose); const a = p[r.leftUpperArm!]!, b = p[r.leftLowerArm!]!; const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]; };
    const start = dir(sampleHumanoidClip(clip, 0, { loop: false })), end = dir(sampleHumanoidClip(clip, clip.duration, { loop: false }));
    expect(start[0]).toBeGreaterThan(0.95); // T-pose: left upper arm points +X (the body's left)
    expect(end[1]).toBeLessThan(-0.95); // lowered: hangs straight down
    expect(clip.meta!.groundSpeedHip).toBeGreaterThan(0); // transl travel recorded, root motion not applied
  });
});

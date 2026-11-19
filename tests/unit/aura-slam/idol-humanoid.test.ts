import { describe, expect, it } from "vitest";
import {
  createIdolHumanoid,
  mapIdolHumanoid,
  qAxis,
  qConj,
  qMul,
  qNorm,
  qRotate,
  vAdd,
  vLen,
  vSub,
  type IdolBind,
  type Q,
  type V3
} from "../../../examples/aura-slam/view/idolHumanoid";

/** A synthetic T-pose rig like Idol's: unnamed bones, arbitrary bind orientations, a wrapper parent with scale. */
function syntheticBind(twist = true): IdolBind {
  const spec: Array<[string, string | null, V3]> = [
    ["bone_0", null, [0, 0.95, 0]],
    ["bone_1", "bone_0", [0, 1.1, 0]],
    ["bone_2", "bone_1", [0, 1.25, 0]],
    ["bone_3", "bone_2", [0, 1.4, 0]],
    ["bone_4", "bone_3", [0, 1.5, 0]],
    ["bone_5", "bone_4", [0, 1.6, 0]],
    ["bone_6", "bone_3", [0.05, 1.42, 0]],
    ["bone_7", "bone_6", [0.18, 1.42, 0]],
    ["bone_8", "bone_7", [0.45, 1.42, 0]],
    ["bone_9", "bone_8", [0.7, 1.42, 0]],
    ["bone_10", "bone_3", [-0.05, 1.42, 0]],
    ["bone_11", "bone_10", [-0.18, 1.42, 0]],
    ["bone_12", "bone_11", [-0.45, 1.42, 0]],
    ["bone_13", "bone_12", [-0.7, 1.42, 0]],
    ["bone_14", "bone_0", [0.1, 0.9, 0]],
    ["bone_15", "bone_14", [0.1, 0.5, 0.01]],
    ["bone_16", "bone_15", [0.1, 0.08, 0]],
    ["bone_17", "bone_16", [0.1, 0.02, 0.12]],
    ["bone_18", "bone_0", [-0.1, 0.9, 0]],
    ["bone_19", "bone_18", [-0.1, 0.5, 0.01]],
    ["bone_20", "bone_19", [-0.1, 0.08, 0]],
    ["bone_21", "bone_20", [-0.1, 0.02, 0.12]]
  ];
  return {
    key: "synthetic",
    scale: 0.5,
    rootParent: { pos: [0, 0.01, 0], rot: qAxis([0, 1, 0], 0.3), scale: 0.5 },
    bones: spec.map(([name, parent, pos], i) => ({
      name, parent, pos,
      rot: twist ? qNorm(qMul(qAxis([0, 0, 1], 0.4 * Math.sin(i)), qAxis([1, 0, 0], 0.7 * Math.cos(i * 1.7)))) : [0, 0, 0, 1]
    }))
  };
}

/** independent forward kinematics from the solver's LOCAL output (what the engine evaluates) */
function forward(bind: IdolBind, bones: Record<string, { rotation: { x: number; y: number; z: number; w: number }; position?: { x: number; y: number; z: number } }>) {
  const byName = new Map(bind.bones.map((b) => [b.name, b]));
  const world = new Map<string, { pos: V3; rot: Q }>();
  for (const b of bind.bones) {
    const pose = bones[b.name];
    const toQ = (r: { x: number; y: number; z: number; w: number }): Q => [r.x, r.y, r.z, r.w];
    if (!b.parent) {
      const rp = bind.rootParent;
      const rot = pose ? qNorm(qMul(rp.rot, toQ(pose.rotation))) : b.rot;
      const pos: V3 = pose?.position ? vAdd(rp.pos, qRotate(rp.rot, [pose.position.x * rp.scale, pose.position.y * rp.scale, pose.position.z * rp.scale])) : b.pos;
      world.set(b.name, { pos, rot });
      continue;
    }
    const p = world.get(b.parent)!;
    const pb = byName.get(b.parent)!;
    const localRot = pose ? toQ(pose.rotation) : qNorm(qMul(qConj(pb.rot), b.rot));
    const off = qRotate(qConj(pb.rot), vSub(b.pos, pb.pos));
    world.set(b.name, { pos: pose?.position ? vAdd(p.pos, qRotate(p.rot, [pose.position.x * bind.scale, pose.position.y * bind.scale, pose.position.z * bind.scale])) : vAdd(p.pos, qRotate(p.rot, off)), rot: qNorm(qMul(p.rot, localRot)) });
  }
  return world;
}

const near = (a: V3, b: V3, tol = 1e-4) => expect(vLen(vSub(a, b)), `${a} vs ${b}`).toBeLessThan(tol);

describe("Idol humanoid retarget (examples/aura-slam/view/idolHumanoid.ts)", () => {
  it("maps unnamed bones to humanoid roles from hierarchy and rest positions (left = +X on a +Z-facing GLB)", () => {
    const m = mapIdolHumanoid(syntheticBind());
    expect(m).toMatchObject({
      hips: "bone_0", spine: ["bone_1", "bone_2"], chest: "bone_3", neck: "bone_4", head: "bone_5",
      shoulderL: "bone_6", upperArmL: "bone_7", foreArmL: "bone_8", handL: "bone_9",
      shoulderR: "bone_10", upperArmR: "bone_11", foreArmR: "bone_12", handR: "bone_13",
      upperLegL: "bone_14", lowerLegL: "bone_15", footL: "bone_16",
      upperLegR: "bone_18", lowerLegR: "bone_19", footR: "bone_20"
    });
  });

  it("an empty target set reproduces the bind pose exactly", () => {
    const bind = syntheticBind();
    const solved = createIdolHumanoid(bind).solve({});
    const fk = forward(bind, solved.bones);
    for (const b of bind.bones) near(fk.get(b.name)!.pos, b.pos);
  });

  it("two-bone IK puts the ankles and palms on reachable targets, and the engine-side FK of the local output agrees", () => {
    const bind = syntheticBind();
    const h = createIdolHumanoid(bind);
    const targets = {
      hipsOffset: [0, -0.06, 0.02] as V3,
      pelvis: qAxis([1, 0, 0], 0.08),
      chest: qAxis([1, 0, 0], 0.18),
      head: qAxis([0, 1, 0], 0.4),
      legL: { end: [0.16, 0.08, 0.22] as V3, pole: [0, 0, 1] as V3 },
      legR: { end: [-0.14, 0.2, -0.2] as V3, pole: [0, 0, 1] as V3 },
      armL: { end: [0.3, 1.05, 0.25] as V3, pole: [0.8, -0.45, -0.9] as V3 },
      armR: { end: [-0.25, 1.7, 0.2] as V3, pole: [-0.8, -0.45, -0.9] as V3 }
    };
    const solved = h.solve(targets);
    near(solved.positions.get("bone_16")!, targets.legL.end, 1e-6);
    near(solved.positions.get("bone_20")!, targets.legR.end, 1e-6);
    near(solved.palmL, targets.armL.end, 1e-6);
    near(solved.palmR, targets.armR.end, 1e-6);
    const fk = forward(bind, solved.bones);
    for (const [name, pos] of solved.positions) near(fk.get(name)!.pos, pos, 1e-6);
    // bone lengths are preserved (rigid segments)
    for (const b of bind.bones) {
      if (!b.parent) continue;
      const bindLen = vLen(vSub(b.pos, bind.bones.find((x) => x.name === b.parent)!.pos));
      expect(vLen(vSub(fk.get(b.name)!.pos, fk.get(b.parent)!.pos))).toBeCloseTo(bindLen, 6);
    }
    // the knee bends forward (+Z) toward its pole, the feet stay at their bind orientation
    expect(solved.positions.get("bone_15")![2]).toBeGreaterThan(0.05);
    const footRot = fk.get("bone_16")!.rot;
    const bindFoot = bind.bones.find((b) => b.name === "bone_16")!.rot;
    expect(Math.abs(footRot[0] * bindFoot[0] + footRot[1] * bindFoot[1] + footRot[2] * bindFoot[2] + footRot[3] * bindFoot[3])).toBeCloseTo(1, 6);
  });

  it("out-of-reach targets straighten the limb toward the target instead of breaking it", () => {
    const bind = syntheticBind();
    const solved = createIdolHumanoid(bind).solve({ armR: { end: [-2, 1.42, 0], pole: [0, 0, -1] } });
    const fk = forward(bind, solved.bones);
    const s = fk.get("bone_11")!.pos;
    const palm = solved.palmR;
    expect(palm[0]).toBeLessThan(s[0]);
    expect(Math.abs(palm[1] - 1.42)).toBeLessThan(0.01);
  });
});

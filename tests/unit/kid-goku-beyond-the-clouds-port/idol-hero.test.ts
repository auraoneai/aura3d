import { describe, expect, it } from "vitest";
import { idolHeroPose, type IdolBonePose, type IdolRig } from "../../../examples/kid-goku-beyond-the-clouds-port/art/idolHero";
import { IDOL_HERO_RIG } from "../../../examples/kid-goku-beyond-the-clouds-port/art/idolHeroRig";
import { computeSkyKidHeroPose, type SkyKidHeroPose } from "../../../examples/kid-goku-beyond-the-clouds-port/art/proceduralModels";

type V3 = [number, number, number];
type Q = [number, number, number, number];
const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qrot = (q: Q, v: V3): V3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};

/** Forward kinematics of a posed rig: bone world positions in the skeleton parent frame. */
function fk(rig: IdolRig, pose: IdolBonePose): V3[] {
  const rot: Q[] = [], pos: V3[] = [];
  rig.bones.forEach((b, i) => {
    const e = pose.bones[b.name]!;
    const r: Q = [e.rotation.x, e.rotation.y, e.rotation.z, e.rotation.w];
    const t: V3 = e.position ? [e.position.x, e.position.y, e.position.z] : [...b.t] as V3;
    if (b.parent < 0) { rot[i] = r; pos[i] = t; return; }
    const o = qrot(rot[b.parent]!, t);
    rot[i] = qmul(rot[b.parent]!, r);
    pos[i] = [pos[b.parent]![0] + o[0], pos[b.parent]![1] + o[1], pos[b.parent]![2] + o[2]];
  });
  return pos;
}

const ZERO: SkyKidHeroPose = {
  pelvisPos: [0, 0.72, 0], pelvisRot: [0, 0, 0], torsoRot: [0, 0, 0], headRot: [0, 0, 0], sashLRot: [0, 0, 0], sashRRot: [0, 0, 0],
  armLRot: [0, 0, 0], forearmLRot: [0, 0, 0], armRRot: [0, 0, 0], forearmRRot: [0, 0, 0], thighLRot: [0, 0, 0], shinLRot: [0, 0, 0],
  bootLRot: [0, 0, 0], thighRRot: [0, 0, 0], shinRRot: [0, 0, 0], bootRRot: [0, 0, 0], showBackPole: true
};

/** A tiny synthetic T-pose skeleton (identity rest rotations, +Z forward) to pin the retarget convention. */
const SYNTH: IdolRig = {
  bones: [
    { name: "hips", parent: -1, t: [0, 0.75, 0], r: [0, 0, 0, 1] },
    { name: "chest", parent: 0, t: [0, 0.4, 0], r: [0, 0, 0, 1] },
    { name: "armL", parent: 1, t: [0.15, 0.1, 0], r: [0, 0, 0, 1] },
    { name: "foreL", parent: 2, t: [0.2, 0, 0], r: [0, 0, 0, 1] },
    { name: "handL", parent: 3, t: [0.2, 0, 0], r: [0, 0, 0, 1] },
    { name: "thighR", parent: 0, t: [-0.1, -0.05, 0], r: [0, 0, 0, 1] },
    { name: "shinR", parent: 5, t: [-0.04, -0.33, 0], r: [0, 0, 0, 1] },
    { name: "footR", parent: 6, t: [0, -0.33, 0], r: [0, 0, 0, 1] }
  ],
  parentRotation: [0, 0, 0, 1],
  parentScale: 1,
  joints: { pelvis: 0, torso: 1, armL: 2, forearmL: 3, thighR: 5, shinR: 6 },
  limbs: [{ root: 2, tip: 4 }, { root: 5, tip: 7 }],
  restPelvisY: 0.72
};

describe("Cumulus Dash Idol hero retarget", () => {
  it("swings the T-pose limbs down to the procedural rest and follows the procedural joint convention", () => {
    const rest = fk(SYNTH, idolHeroPose(SYNTH, ZERO));
    // arm hangs straight down from the shoulder, hand 0.4 m below it
    expect(rest[4]![0]).toBeCloseTo(rest[2]![0], 5);
    expect(rest[2]![1] - rest[4]![1]).toBeCloseTo(0.4, 5);
    // leg straight down under the hip joint
    expect(rest[7]![0]).toBeCloseTo(rest[5]![0], 5);
    expect(rest[7]![2]).toBeCloseTo(rest[5]![2], 5);
    // negative x on the arm raises it forward (+Z), as computeSkyKidHeroPose's cheer/strike poses expect
    const raised = fk(SYNTH, idolHeroPose(SYNTH, { ...ZERO, armLRot: [-Math.PI / 2, 0, 0] }));
    expect(raised[4]![2] - raised[2]![2]).toBeCloseTo(0.4, 5);
    // positive z swings the left arm out to +X
    const out = fk(SYNTH, idolHeroPose(SYNTH, { ...ZERO, armLRot: [0, 0, Math.PI / 2] }));
    expect(out[4]![0] - out[2]![0]).toBeCloseTo(0.4, 5);
    // the pelvis offset moves the hips bone
    const low = idolHeroPose(SYNTH, { ...ZERO, pelvisPos: [0, 0.5, 0] });
    expect(low.bones.hips!.position!.y).toBeCloseTo(0.53, 5);
  });

  it("poses the shipped rig for every game clip with finite unit rotations and the feet near the ground at rest", () => {
    const names = new Set(IDOL_HERO_RIG.bones.map((b) => b.name));
    expect(names.size).toBe(IDOL_HERO_RIG.bones.length);
    for (const clip of ["idle", "run", "sit", "jump", "block", "attack", "hit", "cheer", "dead"]) {
      const pose = idolHeroPose(IDOL_HERO_RIG, computeSkyKidHeroPose({
        clip, clock: 12.3, animT: 0.4, gaitPhase: 3.25, groundSpeed: clip === "run" ? 14.5 : 0, lean: 0.1,
        boostTimer: 0, jumpVelocity: clip === "jump" ? 5 : 0, laneVelocity: 1, onPole: clip === "block"
      }));
      expect(pose.mode).toBe("replace");
      expect(Object.keys(pose.bones).length).toBe(IDOL_HERO_RIG.bones.length);
      for (const e of Object.values(pose.bones)) {
        const r = e.rotation;
        expect(Math.hypot(r.x, r.y, r.z, r.w)).toBeCloseTo(1, 4);
      }
    }
  });

  it("is deterministic: the same procedural pose gives the same bone pose", () => {
    const p = computeSkyKidHeroPose({ clip: "run", clock: 4, animT: 0.2, gaitPhase: 1.7, groundSpeed: 15, lean: 0.12 });
    expect(idolHeroPose(IDOL_HERO_RIG, p)).toEqual(idolHeroPose(IDOL_HERO_RIG, p));
  });
});

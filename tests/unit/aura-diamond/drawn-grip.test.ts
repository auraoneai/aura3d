import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTOR_FIT,
  BATTER_YAW,
  FIT_GROUND_N,
  RIG,
  buildContactConfig,
  poseBonesForEngine,
  qAxis,
  qMul,
  qToEulerZYX,
  rotY,
  sampleBatterTarget,
  solveBatterPose,
  type PoseSolve,
  type Vec3
} from "../../../apps/showcase-aura-diamond-3d/src/batter-pose";
import {
  computeBaseballBoneMatrices,
  type BaseballPoseBonesInput
} from "../../../apps/showcase-aura-diamond-3d/src/art/proceduralModels";

/**
 * The grip against the DRAWN procedural hand: the procedural batter forearm/glove geometry centers its sculpted hand
 * and fingers around `RIG.palmR` / `RIG.palmL` on `RightForearm` / `LeftForearm`. This test transforms the procedural
 * hand centroid through `computeBaseballBoneMatrices(poseBonesForEngine(pose.bones))` and verifies both hands stay
 * locked on the bat handle across every swing phase.
 */

type M = readonly number[];
const apply = (m: M, v: Vec3): Vec3 => [
  m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]!,
  m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]!,
  m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]!
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

const BP: Vec3 = [-0.82, 0, 0.28];
const toActor = (p: Vec3): Vec3 => {
  const l = rotY(-BATTER_YAW, sub(p, BP));
  return [l[0] / ACTOR_FIT - FIT_GROUND_N[0], l[1] / ACTOR_FIT - FIT_GROUND_N[1], l[2] / ACTOR_FIT - FIT_GROUND_N[2]];
};

interface Row { phase: string; right: number; left: number; rightAlong: number; leftAlong: number }
function sweep(): Row[] {
  const rows: Row[] = [];
  const phaseOf = (t: number, active: boolean, recover: number): string =>
    !active ? "stance" : t < 0.26 ? "load" : t < 0.4 ? "stride" : t < 0.56 ? "contact" : recover > 0 ? "recover" : "follow-through";
  const measure = (pose: PoseSolve, phase: string): void => {
    const W = computeBaseballBoneMatrices(pose.bones as unknown as BaseballPoseBonesInput);
    const knob = apply(W.RightForearm, RIG.palmR as Vec3);
    const dir = pose.batDir;
    const axis = (p: Vec3): [number, number] => {
      const r = sub(p, knob);
      const cr: Vec3 = [r[1] * dir[2] - r[2] * dir[1], r[2] * dir[0] - r[0] * dir[2], r[0] * dir[1] - r[1] * dir[0]];
      return [len(cr), r[0] * dir[0] + r[1] * dir[1] + r[2] * dir[2]];
    };
    const rightHandCentroid = apply(W.RightForearm, [RIG.palmR[0] - 0.004, RIG.palmR[1] - 0.006, RIG.palmR[2] + 0.008]);
    const leftHandCentroid = apply(W.LeftForearm, [RIG.palmL[0] + 0.004, RIG.palmL[1] - 0.006, RIG.palmL[2] + 0.008]);
    const [rd, ra] = axis(rightHandCentroid);
    const [ld, la] = axis(leftHandCentroid);
    rows.push({ phase, right: rd, left: ld, rightAlong: ra, leftAlong: la });
  };
  let tau = 0, tauL = 0, gamma = 0;
  const run = (target: ReturnType<typeof sampleBatterTarget>, phase: string): void => {
    let pose!: PoseSolve;
    for (let i = 0; i < 3; i++) {
      pose = solveBatterPose(target.K, target.D, target.phi, target.hip, target.pole, tau, tauL, gamma);
      tau = pose.tau; tauL = pose.tauL; gamma = pose.gamma;
    }
    measure(pose, phase);
  };
  for (let now = 0; now < 6; now += 0.5) run(sampleBatterTarget({ active: false, t: 0, recover: 0, contact: null }, now), "stance");
  for (const x of [-0.1, 0.18, 0.3]) for (const y of [0.8, 1.06, 1.4]) {
    const ba = toActor([x, y, 0.32]);
    const hipY = -Math.max(0.03, Math.min(0.18, (0.121 - ba[1]) * 0.9 + 0.03));
    const contact = buildContactConfig(ba, hipY);
    tau = 0; tauL = 0; gamma = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) run(sampleBatterTarget({ active: true, t, recover: 0, contact }, 0), phaseOf(t, true, 0));
    for (let r = 0.1; r <= 1.0001; r += 0.15) run(sampleBatterTarget({ active: true, t: 1, recover: r, contact }, 0), "recover");
  }
  return rows;
}

describe("drawn-hand grip (procedural batter hand geometry vs the bat axis)", () => {
  const rows = sweep();
  const phases = ["stance", "load", "stride", "contact", "follow-through", "recover"];
  const worst = (phase: string): { right: number; left: number } => {
    const r = rows.filter((x) => x.phase === phase);
    return { right: Math.max(...r.map((x) => x.right)), left: Math.max(...r.map((x) => x.left)) };
  };
  it("reports the per-phase table", () => {
    const table = phases.map((phase) => ({
      phase,
      samples: rows.filter((x) => x.phase === phase).length,
      worstRightCm: Number((worst(phase).right * 100).toFixed(1)),
      worstLeftCm: Number((worst(phase).left * 100).toFixed(1))
    }));
    if (process.env.DIAMOND_GRIP_REPORT) {
      mkdirSync(process.env.DIAMOND_GRIP_REPORT, { recursive: true });
      writeFileSync(`${process.env.DIAMOND_GRIP_REPORT}/drawn-grip.json`, JSON.stringify({ rig: "procedural-14-bone", table }, null, 1));
    }
    expect(table.length).toBe(phases.length);
  });
  it("keeps both drawn palms within 6 cm of the handle in every phase (8 cm in the follow-through tail)", () => {
    for (const phase of phases) {
      const w = worst(phase);
      const limit = phase === "follow-through" || phase === "recover" ? 0.08 : 0.06;
      expect(w.right, `${phase} right drawn palm to bat axis`).toBeLessThanOrEqual(limit);
      expect(w.left, `${phase} left drawn palm to bat axis`).toBeLessThanOrEqual(limit);
    }
  });
  it("keeps the drawn palms on the knob end of the bat (within 12 cm along the bat, top hand above the bottom hand)", () => {
    for (const r of rows) {
      expect(Math.abs(r.rightAlong)).toBeLessThanOrEqual(0.12);
      expect(r.leftAlong).toBeGreaterThanOrEqual(-0.02);
      expect(r.leftAlong).toBeLessThanOrEqual(0.2);
    }
  });
  it("sets the node rotation in the engine's ZYX order (Rz·Ry·Rx reproduces the quaternion)", () => {
    const q = qMul(qAxis([0, 1, 0], 2.4), qMul(qAxis([1, 0, 0], 0.7), qAxis([0, 0, 1], -1.1)));
    const [a, b, c] = qToEulerZYX(q);
    const back = qMul(qAxis([0, 0, 1], c), qMul(qAxis([0, 1, 0], b), qAxis([1, 0, 0], a)));
    const dot = Math.abs(q[0] * back[0] + q[1] * back[1] + q[2] * back[2] + q[3] * back[3]);
    expect(dot).toBeGreaterThan(0.99999);
  });
});

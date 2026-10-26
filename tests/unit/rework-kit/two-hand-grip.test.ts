import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRIP_BONE_NAMES,
  calibrateGripSocket,
  createTwoHandGrip,
  gripQAxis,
  gripQMul,
  gripQRot,
  gripQToEulerXYZ,
  gripQToEulerZYX,
  gripRotY,
  gripUnit,
  handCentroid,
  measureGrip,
  mirrorTwoHandGripBodyRig,
  relaxedTopHand,
  solveGripTwoBone,
  solveTwoHandGrip,
  twoHandGripBonesForEngine,
  type GripQuat,
  type GripVec3,
  type TwoHandGripBodyRig,
  type TwoHandGripRig,
  type TwoHandGripTarget
} from "../../../packages/game/src/motion/twoHandGrip";
import {
  ACTOR_FIT,
  BATTER_YAW,
  FIT_GROUND_N,
  RIG,
  POLE_STANCE_L,
  buildContactConfig,
  sampleBatterTarget,
  solveBatterPose
} from "../../../apps/showcase-aura-diamond-3d/src/batter-pose";

const sub = (a: readonly number[], b: readonly number[]): GripVec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const len = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): GripVec3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** A club: same human body, different object (longer, hands further apart, a different stance direction). */
const BODY: TwoHandGripBodyRig = { ...RIG, poleL: POLE_STANCE_L };
const CLUB_STANCE = { K: [-0.1, 0.55, 0.3] as GripVec3, D: gripUnit([0.1, 0.5, -0.85]), phi: 0.1, pole: gripUnit([-0.3, -1, -0.3]) as GripVec3 };
const clubSocket = calibrateGripSocket(BODY, CLUB_STANCE);
const CLUB: TwoHandGripRig = { ...BODY, ...clubSocket, gripSpread: 0.12, objectLength: 1.15, sweetSpot: 1.05 };

function compareDeep(a: unknown, b: unknown, path: string, tol: number, bad: string[]): void {
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > tol) bad.push(`${path}: ${a} vs ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) bad.push(`${path}: length`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) compareDeep(a[i], b[i], `${path}[${i}]`, tol, bad);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of Object.keys(b as object)) compareDeep((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, tol, bad);
    return;
  }
  if (a !== b) bad.push(`${path}: ${String(a)} vs ${String(b)}`);
}

describe("two-hand grip kit", () => {
  it("reproduces the Diamond batter solver exactly (golden outputs captured before the refactor)", () => {
    const rows = JSON.parse(readFileSync(resolve(process.cwd(), "tests/unit/rework-kit/golden/diamond-grip-golden.json"), "utf8")) as Array<{
      kind: string; K: GripVec3; D: GripVec3; phi: number; hip: GripVec3; pole: GripVec3; out: Record<string, unknown>;
    }>;
    expect(rows.length).toBeGreaterThan(100);
    // Replay the same chained solves the golden file was captured from, carrying tau, tauL and gamma between rows.
    let tau = 0, tauL = 0, gamma = 0;
    const bad: string[] = [];
    let prevKind = "";
    rows.forEach((r, i) => {
      if (r.kind === "swing" && prevKind !== "swing" && prevKind !== "recover") { tau = 0; tauL = 0; gamma = 0; }
      if (r.kind === "swing" && prevKind === "recover") { tau = 0; tauL = 0; gamma = 0; }
      const p = solveBatterPose(r.K, r.D, r.phi, r.hip, r.pole, tau, tauL, gamma);
      tau = p.tau; tauL = p.tauL; gamma = p.gamma;
      compareDeep(p, r.out, `row${i}`, 1e-12, bad);
      prevKind = r.kind;
    });
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("clamps a target past the arm's reach instead of stretching the arm", () => {
    const shoulder: GripVec3 = [0, 1.4, 0];
    const l1 = 0.26;
    const l2 = 0.34;
    const elbow = solveGripTwoBone(shoulder, [0, 1.4, 1.5], [0, -1, 0], l1, l2);
    expect(len(sub(elbow, shoulder))).toBeCloseTo(l1, 6);
    const reach = len(sub([0, 1.4, 0.6 - 1e-4], shoulder));
    expect(reach).toBeLessThanOrEqual(l1 + l2);
    // A reachable target puts the hand exactly on it.
    const e2 = solveGripTwoBone(shoulder, [0.1, 1.2, 0.4], [0, -1, 0], l1, l2);
    expect(len(sub(e2, shoulder))).toBeCloseTo(l1, 6);
    expect(len(sub([0.1, 1.2, 0.4], e2))).toBeCloseTo(l2, 6);
  });

  it("puts both palms on a club's axis through a swing arc (the kit is not bat-specific)", () => {
    let prev = { tau: 0, tauL: 0, gamma: 0 };
    let worstTop = 0;
    let worstBottom = 0;
    let worstSpread = 0;
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const phi = 0.1 + (-1.3 - 0.1) * u;
      const target: TwoHandGripTarget = {
        K: [-0.1 - 0.12 * u, 0.55 - 0.3 * Math.sin(Math.PI * u), 0.3 + 0.05 * u],
        D: gripUnit([0.1 - 0.7 * u, 0.5 - 0.6 * u, -0.85 + 1.4 * u]),
        phi,
        hip: [0, -0.02 * u, 0.05 * u],
        pole: CLUB_STANCE.pole
      };
      const p = solveTwoHandGrip(CLUB, target, prev);
      prev = { tau: p.tau, tauL: p.tauL, gamma: p.gamma };
      const axisPerp = len(cross(sub(p.palmL, p.palm), p.objectDir));
      worstTop = Math.max(worstTop, axisPerp);
      worstBottom = Math.max(worstBottom, len(sub(p.palm, target.K)));
      worstSpread = Math.max(worstSpread, Math.abs(dot(sub(p.palmL, p.palm), p.objectDir) - CLUB.gripSpread));
      expect(len(sub(p.tipPoint, p.palm))).toBeCloseTo(CLUB.objectLength, 9);
      expect(len(sub(p.sweetPoint, p.palm))).toBeCloseTo(CLUB.sweetSpot, 9);
    }
    expect(worstBottom).toBeLessThanOrEqual(0.06);
    expect(worstTop).toBeLessThanOrEqual(0.06);
    expect(worstSpread).toBeLessThanOrEqual(0.08);
  });

  it("lets the top hand go without a jump and leaves the bottom hand alone", () => {
    const target: TwoHandGripTarget = { K: CLUB_STANCE.K, D: CLUB_STANCE.D, phi: CLUB_STANCE.phi, hip: [0, 0, 0], pole: CLUB_STANCE.pole };
    const held = solveTwoHandGrip(CLUB, target, {}, { release: 0 });
    const none = solveTwoHandGrip(CLUB, target);
    expect(held.palmL).toEqual(none.palmL);
    let prev = held;
    let maxStep = 0;
    for (let i = 1; i <= 100; i++) {
      const p = solveTwoHandGrip(CLUB, target, { tau: prev.tau, tauL: prev.tauL, gamma: prev.gamma }, { release: i / 100 });
      maxStep = Math.max(maxStep, len(sub(p.palmL, prev.palmL)));
      expect(len(sub(p.palm, held.palm))).toBeLessThan(1e-9);
      prev = p;
    }
    expect(maxStep).toBeLessThan(0.03);
    const rest = relaxedTopHand(BODY, prev.shoulderL);
    expect(len(sub(prev.targetL, rest))).toBeLessThan(1e-9);
    expect(len(sub(prev.palmL, rest))).toBeLessThan(0.08);
    expect(len(sub(prev.palmL, held.palmL))).toBeGreaterThan(0.2);
  });

  it("uses the engine's ZYX node order for object rotation, not XYZ", () => {
    const qx = gripQAxis([1, 0, 0], 0.4);
    const qy = gripQAxis([0, 1, 0], -0.7);
    const qz = gripQAxis([0, 0, 1], 1.1);
    // ZYX: matrix Rz * Ry * Rx.
    const zyx = gripQMul(qz, gripQMul(qy, qx));
    const e = gripQToEulerZYX(zyx);
    expect(e[0]).toBeCloseTo(0.4, 9);
    expect(e[1]).toBeCloseTo(-0.7, 9);
    expect(e[2]).toBeCloseTo(1.1, 9);
    // XYZ: matrix Rx * Ry * Rz.
    const xyz = gripQMul(qx, gripQMul(qy, qz));
    const f = gripQToEulerXYZ(xyz);
    expect(f[0]).toBeCloseTo(0.4, 9);
    expect(f[1]).toBeCloseTo(-0.7, 9);
    expect(f[2]).toBeCloseTo(1.1, 9);
    // Reading a ZYX rotation as XYZ gives different angles: applying them to a ZYX node tilts the object the wrong way.
    const wrong = gripQToEulerXYZ(zyx);
    expect(Math.abs(wrong[0] - 0.4) + Math.abs(wrong[2] - 1.1)).toBeGreaterThan(0.05);
    const v = gripQRot(zyx, [1, 0, 0]);
    expect(len(v)).toBeCloseTo(1, 9);
  });

  it("mirrors a rig for a left-handed stance and swaps the arm bones", () => {
    const mirrored = mirrorTwoHandGripBodyRig(BODY);
    expect(mirrored.boneNames?.rightUpperArm).toBe(DEFAULT_GRIP_BONE_NAMES.leftUpperArm);
    expect(mirrored.boneNames?.leftForearm).toBe(DEFAULT_GRIP_BONE_NAMES.rightForearm);
    const mStance = {
      K: [-CLUB_STANCE.K[0], CLUB_STANCE.K[1], CLUB_STANCE.K[2]] as GripVec3,
      D: [-CLUB_STANCE.D[0], CLUB_STANCE.D[1], CLUB_STANCE.D[2]] as GripVec3,
      phi: -CLUB_STANCE.phi,
      pole: [-CLUB_STANCE.pole[0], CLUB_STANCE.pole[1], CLUB_STANCE.pole[2]] as GripVec3
    };
    const mRig: TwoHandGripRig = { ...mirrored, ...calibrateGripSocket(mirrored, mStance), gripSpread: 0.12, objectLength: 1.15, sweetSpot: 1.05 };
    const a = solveTwoHandGrip(CLUB, { K: CLUB_STANCE.K, D: CLUB_STANCE.D, phi: CLUB_STANCE.phi, hip: [0, 0, 0], pole: CLUB_STANCE.pole });
    const b = solveTwoHandGrip(mRig, { K: mStance.K, D: mStance.D, phi: mStance.phi, hip: [0, 0, 0], pole: mStance.pole });
    expect(b.palm[0]).toBeCloseTo(-a.palm[0], 6);
    expect(b.palm[1]).toBeCloseTo(a.palm[1], 6);
    expect(b.palm[2]).toBeCloseTo(a.palm[2], 6);
    expect(Object.keys(b.bones)).toContain("LeftUpperArm");
  });

  it("steps with continuity and forgets it on reset", () => {
    const grip = createTwoHandGrip(CLUB);
    const t1: TwoHandGripTarget = { K: CLUB_STANCE.K, D: CLUB_STANCE.D, phi: CLUB_STANCE.phi, hip: [0, 0, 0], pole: CLUB_STANCE.pole };
    const t2: TwoHandGripTarget = { ...t1, phi: -0.4, D: gripUnit([-0.4, 0.3, -0.5]) };
    const a1 = grip.step(t1);
    const a2 = grip.step(t2);
    const m1 = solveTwoHandGrip(CLUB, t1);
    const m2 = solveTwoHandGrip(CLUB, t2, { tau: m1.tau, tauL: m1.tauL, gamma: m1.gamma });
    expect(a1.palm).toEqual(m1.palm);
    expect(a2.palmL).toEqual(m2.palmL);
    expect(grip.state().steps).toBe(2);
    grip.reset();
    expect(grip.state()).toMatchObject({ tau: 0, tauL: 0, gamma: 0, steps: 0, pose: null });
  });

  it("converts bones for the engine as objects, never tuples", () => {
    const p = solveTwoHandGrip(CLUB, { K: CLUB_STANCE.K, D: CLUB_STANCE.D, phi: 0, hip: [0, 0, 0], pole: CLUB_STANCE.pole });
    const bones = twoHandGripBonesForEngine(p.bones);
    expect(bones.Hips?.position).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    expect(bones.Chest?.rotation).toMatchObject({ x: expect.any(Number), w: expect.any(Number) });
  });

  it("keeps the Diamond batter's palms on the bat for the real contact config too", () => {
    const BATTER_POS: GripVec3 = [-0.82, 0, 0.28];
    const actorFromWorld = (p: GripVec3): GripVec3 => {
      const d = sub(p, BATTER_POS) as GripVec3;
      const loc = gripRotY(-BATTER_YAW, d);
      return [loc[0] / ACTOR_FIT - FIT_GROUND_N[0], loc[1] / ACTOR_FIT - FIT_GROUND_N[1], loc[2] / ACTOR_FIT - FIT_GROUND_N[2]];
    };
    const ba = actorFromWorld([0, 1.06, 0.32]);
    const contact = buildContactConfig(ba, -0.06);
    const s = sampleBatterTarget({ active: true, t: 0.5, recover: 0, contact }, 0);
    const p = solveBatterPose(s.K, s.D, s.phi, s.hip, s.pole, 0, 0, 0);
    expect(len(cross(sub(p.palmLActor, p.palmActor), p.batDir))).toBeLessThanOrEqual(0.06);
  });
});

describe("measureGrip", () => {
  const axis: GripVec3 = [1, 0, 0];
  const good = (phase: string, off = 0.02): { phase: string; knob: GripVec3; axis: GripVec3; bottomPalm: GripVec3; topPalm: GripVec3 } => ({
    phase, knob: [0, 1, 0], axis, bottomPalm: [0, 1 + off, 0], topPalm: [0.09, 1 + off, 0]
  });
  it("passes a held grip and reports per-phase numbers", () => {
    const r = measureGrip([good("stance"), good("swing", 0.04), good("follow-through", 0.07)]);
    expect(r.ok).toBe(true);
    expect(r.phases.map((p) => p.phase).sort()).toEqual(["follow-through", "stance", "swing"]);
    const tail = r.phases.find((p) => p.phase === "follow-through")!;
    expect(tail.limit).toBeCloseTo(0.08, 9);
    expect(tail.topAlongMin).toBeCloseTo(0.09, 9);
  });
  it("fails a palm off the grip point or off the axis, with the tail limit only for the tail", () => {
    const bad = measureGrip([good("swing", 0.07)]);
    expect(bad.ok).toBe(false);
    expect(bad.failures.join(" ")).toMatch(/swing: bottom palm/);
    expect(measureGrip([good("follow-through", 0.07)]).ok).toBe(true);
    expect(measureGrip([good("follow-through", 0.09)]).ok).toBe(false);
    expect(measureGrip([]).ok).toBe(false);
  });
  it("measures against drawn-hand vertices via handCentroid", () => {
    const flat = [0.0, 0.0, 0.0, 0.2, 0.0, 0.0, 0.1, 0.3, 0.0];
    const c = handCentroid(flat);
    expect(c[0]).toBeCloseTo(0.1, 9);
    expect(c[1]).toBeCloseTo(0.1, 9);
    expect(c[2]).toBe(0);
    expect(handCentroid([[0, 0, 0], [2, 0, 0]])).toEqual([1, 0, 0]);
    expect(handCentroid([])).toEqual([0, 0, 0]);
    const q: GripQuat = [0, 0, 0, 1];
    expect(q.length).toBe(4);
  });
});

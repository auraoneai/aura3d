import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BALL_SHOT, ELBOW_FLEX_MAX_DEG, SKELETON_ATHLETE, evaluateSwing, makeRoot, solveSwing, toModel, unit, useSkeleton, vSub,
  type SolvedSwing, type SwingPosePhase
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { meshyProfile, meshyForwardKinematics, retargetSolved } from "../../../apps/showcase-aura-links-3d/src/game/golferRetarget";
import { lineTurnDeg, poseJoints, swingMetrics } from "../../../apps/showcase-aura-links-3d/src/game/swingAnalysis";

/**
 * The swing must read as a golf swing, not just put the hands on the grip: joint angles of the retargeted Meshy golfer through
 * the whole swing (the owner's 4.7.14 report: arms crossed over a front-facing chest, no shoulder turn, shaft pointing up behind
 * the head). Contact sheets and the angle table come from scripts/golfer-swing-sheet.ts (tests/reports/golfer-swing).
 */
// the root carries the active skeleton's fit scale: build it per call, after useSkeleton
const mk = () => makeRoot(0);
const solve = (phase: SwingPosePhase, t: number): SolvedSwing => solveSwing(evaluateSwing(phase, t), mk());
const dense = (): Array<[SwingPosePhase, number]> => {
  const out: Array<[SwingPosePhase, number]> = [["address", 0], ["top", 0]];
  for (const phase of ["backswing", "downswing", "follow"] as const) for (let i = 0; i <= 20; i++) out.push([phase, i / 20]);
  return out;
};

describe("Meshy golfer swing kinematics (anatomic solve)", () => {
  beforeAll(() => useSkeleton(meshyProfile()));
  afterAll(() => useSkeleton(SKELETON_ATHLETE));

  it("keeps both elbows between a soft 3 and 150 degrees of flexion through the whole swing, and the arms never fold into the torso", () => {
    for (const [phase, t] of dense()) {
      const m = swingMetrics(solve(phase, t), mk());
      for (const [side, flex] of [["L", m.elbowFlexL], ["R", m.elbowFlexR]] as const) {
        expect(flex, `${side} ${phase}@${t}`).toBeGreaterThanOrEqual(2.9);
        expect(flex, `${side} ${phase}@${t}`).toBeLessThanOrEqual(ELBOW_FLEX_MAX_DEG + 0.1);
      }
      // no elbow flies above its shoulder line by more than a forearm-raise at the top
      expect(m.elbowRiseL, `${phase}@${t}`).toBeLessThan(0.08);
      expect(m.elbowRiseR, `${phase}@${t}`).toBeLessThan(0.08);
    }
  });

  it("address: arms hang, lead arm near straight, hands in front of the thighs, no shoulder turn", () => {
    const s = solve("address", 0);
    const m = swingMetrics(s, mk());
    const j = poseJoints(s, mk());
    expect(m.elbowFlexL).toBeLessThan(40);
    expect(m.elbowFlexR).toBeLessThan(45);
    expect(Math.abs(m.shoulderTurn)).toBeLessThan(5);
    expect(Math.abs(m.hipTurn)).toBeLessThan(5);
    // hands: below the hips, above the knees, in front of the thighs (toward the ball line)
    expect(j.palmR[1]).toBeLessThan(j.hips[1] + 0.05);
    expect(j.palmR[1]).toBeGreaterThan(j.kneeL[1]);
    expect(j.palmR[2] - j.hips[2]).toBeGreaterThan(0.15);
    expect(s.posture.kneeFlexDeg).toBeGreaterThan(20);
  });

  it("top of the backswing: shoulders turn 80 to 95 degrees against hips of about 45, weight on the trail side, trail elbow about 90, hands high", () => {
    const s = solve("top", 0);
    const m = swingMetrics(s, mk());
    const a = swingMetrics(solve("address", 0), mk());
    expect(m.shoulderTurn).toBeGreaterThanOrEqual(80);
    expect(m.shoulderTurn).toBeLessThanOrEqual(95);
    expect(m.hipTurn).toBeGreaterThanOrEqual(38);
    expect(m.hipTurn).toBeLessThanOrEqual(52);
    expect(m.xFactor).toBeGreaterThan(30);
    expect(m.hipShift).toBeLessThan(a.hipShift - 0.05);
    expect(m.elbowFlexR).toBeGreaterThan(80);
    expect(m.elbowFlexR).toBeLessThan(125);
    expect(m.elbowFlexL).toBeLessThan(60);
    expect(m.handsAboveLeadShoulder).toBeGreaterThan(0.15);
    // the shaft is about parallel to the ground (a little past it at most) and points at the target, clear of the head
    expect(m.shaftElevation).toBeGreaterThan(-10);
    expect(m.shaftElevation).toBeLessThan(25);
    expect(unit(vSub(poseJoints(s, mk()).clubHead, poseJoints(s, mk()).grip))[0]).toBeGreaterThan(0.8);
    expect(m.headClearance).toBeGreaterThan(0.12);
  });

  it("the turn grows through the backswing and the pelvis leads the downswing (hips open before the shoulders)", () => {
    let prev = -5;
    for (let i = 0; i <= 10; i++) {
      const turn = swingMetrics(solve("backswing", i / 10), mk()).shoulderTurn;
      expect(turn).toBeGreaterThan(prev - 0.5);
      prev = turn;
    }
    const down = swingMetrics(solve("downswing", 0.85), mk());
    expect(down.hipTurn).toBeLessThan(down.shoulderTurn);
    const imp = swingMetrics(solve("downswing", 1), mk());
    expect(imp.hipTurn).toBeLessThan(-20);
    expect(imp.hipTurn).toBeLessThan(imp.shoulderTurn);
  });

  it("impact: hips open, arms extended, hands ahead of the ball, shaft near vertical onto the ball", () => {
    const s = solve("downswing", 1);
    const m = swingMetrics(s, mk());
    const j = poseJoints(s, mk());
    expect(m.hipTurn).toBeLessThan(-20);
    expect(m.elbowFlexR).toBeLessThan(45);
    expect(m.elbowFlexL).toBeLessThan(55);
    expect(s.grip[2]).toBeGreaterThan(BALL_SHOT[2]); // hands ahead of the ball (toward the target)
    expect(Math.abs(unit(vSub(j.clubHead, j.grip))[1])).toBeGreaterThan(0.9);
    expect(Math.hypot(...vSub(j.clubHead, toModel(mk(), BALL_SHOT)))).toBeLessThan(0.03);
    expect(m.hipShift).toBeGreaterThan(swingMetrics(solve("top", 0), mk()).hipShift + 0.05);
  });

  it("finish: hands high over the lead shoulder, chest facing the target, weight on the lead foot, trail foot on its toe", () => {
    const s = solve("follow", 1);
    const m = swingMetrics(s, mk());
    expect(m.handsAboveLeadShoulder).toBeGreaterThan(0.1);
    expect(m.shoulderTurn).toBeLessThan(-80);
    expect(m.hipTurn).toBeLessThan(-45);
    expect(m.hipShift).toBeGreaterThan(swingMetrics(solve("address", 0), mk()).hipShift + 0.02);
    expect(m.trailHeelLift).toBeGreaterThan(0.04);
    // the elbows hang below the shoulders, they do not fly
    expect(m.elbowRiseL).toBeLessThan(0.02);
    expect(m.elbowRiseR).toBeLessThan(0.06);
    expect(m.elbowFlexL).toBeLessThanOrEqual(ELBOW_FLEX_MAX_DEG + 0.1);
  });

  it("no arm crossing: each wrist stays on its own side of the torso mid-plane while the chest is within 40 degrees of square (the hands only follow a turned chest across it)", () => {
    for (const [phase, t] of dense()) {
      const m = swingMetrics(solve(phase, t), mk());
      if (Math.abs(m.shoulderTurn) > 40) continue;
      expect(m.sideR, `trail ${phase}@${t}`).toBeGreaterThan(-0.07);
      expect(m.sideL, `lead ${phase}@${t}`).toBeGreaterThan(-0.07);
    }
    // and at the top the crossing is the consequence of the turn: the chest has turned 80+ degrees
    const top = swingMetrics(solve("top", 0), mk());
    expect(top.sideL).toBeLessThan(0);
    expect(top.shoulderTurn).toBeGreaterThan(80);
  });

  it("the palms face each other (never back to back) and the club stays in the hands and on the ball line at address and impact", () => {
    for (const [phase, t] of dense()) {
      const s = solve(phase, t);
      expect(swingMetrics(s, mk()).palmFacing, `${phase}@${t}`).toBeGreaterThan(-0.5);
      const fk = meshyForwardKinematics(retargetSolved(s));
      expect(fk.get("LeftHand")!.pos.every(Number.isFinite)).toBe(true);
      // the real Meshy elbows (forward kinematics of the overlay pose) are where the analysed virtual elbows are
      const j = poseJoints(s, mk());
      expect(Math.hypot(...vSub(fk.get("LeftForeArm")!.pos, j.elbowL)), `LE ${phase}@${t}`).toBeLessThan(0.005);
      expect(Math.hypot(...vSub(fk.get("RightForeArm")!.pos, j.elbowR)), `RE ${phase}@${t}`).toBeLessThan(0.005);
    }
    expect(Math.hypot(...vSub(solve("address", 0).clubHead, BALL_SHOT))).toBeLessThan(0.03);
  });
});

describe("analysis helpers and the original athlete", () => {
  it("lineTurnDeg is 0 for a line square to the target line and positive for the backswing direction", () => {
    expect(lineTurnDeg([0.2, 0, 0], [-0.2, 0, 0])).toBeCloseTo(0, 6);
    // left shoulder moving toward +Z (toward the ball line) while the right goes back is a backswing turn
    expect(lineTurnDeg([0, 0, 0.2], [0, 0, -0.2])).toBeGreaterThan(80);
  });

  it("?golfer=old stays on the original trajectory solve (no anatomic keys, same poses as before the wave-8 change)", () => {
    useSkeleton(SKELETON_ATHLETE);
    expect(evaluateSwing("top", 0).turn).toBeUndefined();
    const top = swingMetrics(solve("top", 0), mk());
    expect(top.shoulderTurn).toBeCloseTo(55.2, 0);
    expect(top.elbowFlexR).toBeCloseTo(86.1, 0);
    expect(swingMetrics(solve("address", 0), mk()).elbowFlexL).toBeCloseTo(67.4, 0);
  });
});

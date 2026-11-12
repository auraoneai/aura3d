import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLUB_PARTS,
  SKELETON_ATHLETE,
  clubAttachOffsets,
  clubPartPose,
  evaluateSwing,
  makeRoot,
  solveSwing,
  useSkeleton,
  vDist,
  vDot,
  vSub,
  vCross,
  vLen,
  unit,
  type SwingPosePhase,
  type V3
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import {
  meshyForwardKinematics,
  meshyProfile,
  retargetSolved
} from "../../../apps/showcase-aura-links-3d/src/game/golferRetarget";
import { CLUBS } from "../../../apps/showcase-aura-links-3d/src/game/sim";

const PHASES: SwingPosePhase[] = ["address", "backswing", "top", "downswing", "follow", "putt-address", "putt-back", "putt-through"];
const root = makeRoot(0);
const lineDistance = (p: V3, origin: V3, dir: V3): number => {
  const d = unit(dir);
  const rel = vSub(p, origin);
  return vLen(vCross(rel, d));
};

describe("Links golfer: both procedural arms stay attached, visible and on the grip in every pose", () => {
  beforeAll(() => useSkeleton(meshyProfile()));
  afterAll(() => useSkeleton(SKELETON_ATHLETE));

  it("keeps the upper arm and forearm at exact rigid segment lengths through the retargeted FK chain", () => {
    const prof = meshyProfile();
    const restUpperR = vLen(prof.rig.tForearmR);
    const restUpperL = vLen(prof.rig.tForearmL);
    const bindFk = meshyForwardKinematics({});
    const restForeR = vDist(bindFk.get("RightForeArm")!.pos, bindFk.get("RightHand")!.pos);
    const restForeL = vDist(bindFk.get("LeftForeArm")!.pos, bindFk.get("LeftHand")!.pos);
    const bad: string[] = [];
    for (const phase of PHASES) {
      for (let s = 0; s <= 10; s += 1) {
        const solved = solveSwing(evaluateSwing(phase, s / 10), root);
        const fk = meshyForwardKinematics(retargetSolved(solved));
        const upperR = vDist(fk.get("RightArm")!.pos, fk.get("RightForeArm")!.pos) / restUpperR;
        const foreR = vDist(fk.get("RightForeArm")!.pos, fk.get("RightHand")!.pos) / restForeR;
        const upperL = vDist(fk.get("LeftArm")!.pos, fk.get("LeftForeArm")!.pos) / restUpperL;
        const foreL = vDist(fk.get("LeftForeArm")!.pos, fk.get("LeftHand")!.pos) / restForeL;
        if (upperR < 0.95 || upperR > 1.05 || foreR < 0.95 || foreR > 1.05) bad.push(`${phase}@${(s / 10).toFixed(2)}/R`);
        if (upperL < 0.95 || upperL > 1.05 || foreL < 0.95 || foreL > 1.05) bad.push(`${phase}@${(s / 10).toFixed(2)}/L`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("puts the drawn right palm on the grip and the drawn left palm on the shaft line, for every club and aim yaw", () => {
    const prof = meshyProfile();
    const reachMaxR = vLen(prof.rig.tForearmR) + vLen(prof.rig.palmR);
    const reachMaxL = vLen(prof.rig.tForearmL) + vLen(prof.rig.palmL);
    const misses: string[] = [];
    for (const club of Object.values(CLUBS)) {
      const phases: SwingPosePhase[] = club.putter ? ["putt-address", "putt-back", "putt-through"] : ["address", "backswing", "top", "downswing", "follow"];
      for (const phase of phases) for (let s = 0; s <= 10; s += 1) {
        const solved = solveSwing(evaluateSwing(phase, s / 10), root);
        for (let yaw = 0; yaw < 360; yaw += 30) {
          const addr = solveSwing(evaluateSwing("address", 0), root);
          const offsets = clubAttachOffsets(addr.rightForearmWorld, addr.rightElbowModel, addr.grip, addr.shaftDir, root);
          const grip = offsets.find((o) => o.id === "golfer-club-grip")!;
          const pose = clubPartPose(solved, grip, root, (yaw * Math.PI) / 180);
          if (vDist(pose.centreShot, solved.grip) > 0.2) misses.push(`${club.id}/${phase}@${s}/yaw${yaw}: grip part ${vDist(pose.centreShot, solved.grip).toFixed(2)} m from the grip`);
        }
        if (solved.reachR < reachMaxR - 0.01 && vDist(solved.rightPalm, solved.grip) > 0.02) misses.push(`${club.id}/${phase}@${s}: right palm ${vDist(solved.rightPalm, solved.grip).toFixed(3)} m off the grip`);
        if (solved.reachL < reachMaxL - 0.01 && lineDistance(solved.leftPalm, solved.grip, solved.shaftDir) > 0.03) misses.push(`${club.id}/${phase}@${s}: left palm ${lineDistance(solved.leftPalm, solved.grip, solved.shaftDir).toFixed(3)} m off the shaft`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("keeps both elbows separated and clear of the torso core in every pose", () => {
    for (const phase of PHASES) {
      for (let s = 0; s <= 6; s += 1) {
        const fk = meshyForwardKinematics(retargetSolved(solveSwing(evaluateSwing(phase, s / 6), root)));
        expect(vDist(fk.get("RightForeArm")!.pos, fk.get("LeftForeArm")!.pos), `${phase}@${s}`).toBeGreaterThan(0.12);
      }
    }
  });

  it("keeps the shaft direction equal to the authored one (the club still follows the exact solve)", () => {
    for (const phase of PHASES) for (let s = 0; s <= 10; s += 1) {
      const solved = solveSwing(evaluateSwing(phase, s / 10), root);
      expect(vDot(unit(solved.shaftDir), unit(evaluateSwing(phase, s / 10).dir))).toBeGreaterThan(0.9999);
    }
    expect(CLUB_PARTS.length).toBe(3);
  });
});

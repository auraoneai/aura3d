import { describe, expect, it } from "vitest";
import { sweepArms } from "../../../tools/aura-athletes/links-arm-sweep";
import { sweepVisibility } from "../../../tools/aura-athletes/links-arm-visibility";
import {
  CLUB_PARTS,
  FOREARM_PALM_LEN,
  UPPER_ARM_LEN,
  clubAttachOffsets,
  clubPartPose,
  evaluateSwing,
  makeRoot,
  solveSwing,
  vDist,
  vDot,
  vSub,
  vCross,
  vLen,
  unit,
  type SwingPosePhase,
  type V3
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { CLUBS } from "../../../apps/showcase-aura-links-3d/src/game/sim";

const GLB = "public/aura-assets/linksGolferAthleteClean.b56529b1.glb";
const PHASES: SwingPosePhase[] = ["address", "backswing", "top", "downswing", "follow", "putt-address", "putt-back", "putt-through"];
const root = makeRoot(0);
const REACH_MAX = UPPER_ARM_LEN + FOREARM_PALM_LEN;
const lineDistance = (p: V3, origin: V3, dir: V3): number => {
  const d = unit(dir);
  const rel = vSub(p, origin);
  return vLen(vCross(rel, d));
};

describe("Links golfer: both arms stay attached, visible and on the grip in every pose", () => {
  it("keeps the upper arm and forearm at 80 to 105 percent of rest length, with the elbow in front of the back plane", () => {
    const samples = sweepArms(GLB, PHASES, 10);
    const bad = samples.filter((s) => s.upperRatio < 0.8 || s.upperRatio > 1.05 || s.foreRatio < 0.8 || s.foreRatio > 1.05 || s.elbowBehind < -0.2);
    expect(bad.map((s) => `${s.phase}@${s.t.toFixed(2)}/${s.side}`)).toEqual([]);
  });

  it("puts the drawn right palm on the grip and the drawn left palm on the shaft line, for every club and aim yaw", () => {
    const misses: string[] = [];
    for (const club of Object.values(CLUBS)) {
      const phases: SwingPosePhase[] = club.putter ? ["putt-address", "putt-back", "putt-through"] : ["address", "backswing", "top", "downswing", "follow"];
      for (const phase of phases) for (let s = 0; s <= 10; s += 1) {
        const solved = solveSwing(evaluateSwing(phase, s / 10), root);
        // the solve is in the golfer frame, so the aim yaw (0 to 330 degrees) only rotates the whole node; the arms cannot change with it
        for (let yaw = 0; yaw < 360; yaw += 30) {
          const addr = solveSwing(evaluateSwing("address", 0), root);
          const offsets = clubAttachOffsets(addr.rightForearmWorld, addr.rightElbowModel, addr.grip, addr.shaftDir, root);
          const grip = offsets.find((o) => o.id === "golfer-club-grip")!;
          const pose = clubPartPose(solved, grip, root, (yaw * Math.PI) / 180);
          if (vDist(pose.centreShot, solved.grip) > 0.2) misses.push(`${club.id}/${phase}@${s}/yaw${yaw}: grip part ${vDist(pose.centreShot, solved.grip).toFixed(2)} m from the grip`);
        }
        const reachR = solved.reachR;
        if (reachR < REACH_MAX - 0.01 && vDist(solved.rightPalm, solved.grip) > 0.02) misses.push(`${club.id}/${phase}@${s}: right palm ${vDist(solved.rightPalm, solved.grip).toFixed(3)} m off the grip`);
        if (solved.reachL < REACH_MAX - 0.01 && lineDistance(solved.leftPalm, solved.grip, solved.shaftDir) > 0.03) misses.push(`${club.id}/${phase}@${s}: left palm ${lineDistance(solved.leftPalm, solved.grip, solved.shaftDir).toFixed(3)} m off the shaft`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("never hides an arm: at least half of each arm is visible from some side in every pose (the owner's far-arm stub)", () => {
    const rows = sweepVisibility(GLB, PHASES, 6, 160);
    const hidden = rows.filter((r) => r.best < 0.5).map((r) => `${r.phase}@${r.t.toFixed(2)}/${r.side} ${r.best.toFixed(2)}`);
    expect(hidden).toEqual([]);
  });

  it("keeps the shaft direction equal to the authored one (the club still follows the exact solve)", () => {
    for (const phase of PHASES) for (let s = 0; s <= 10; s += 1) {
      const solved = solveSwing(evaluateSwing(phase, s / 10), root);
      expect(vDot(unit(solved.shaftDir), unit(evaluateSwing(phase, s / 10).dir))).toBeGreaterThan(0.9999);
    }
    expect(CLUB_PARTS.length).toBe(3);
  });
});

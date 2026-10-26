import { describe, expect, it } from "vitest";
import {
  CLUB_PARTS,
  clubAttachOffsets,
  clubPartPose,
  evaluateSwing,
  makeRoot,
  qRotate,
  solveSwing,
  type SwingPosePhase
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";

const norm = (v: readonly number[]) => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const yawToWorld = (v: readonly number[], yaw: number) => [v[0]! * Math.cos(yaw) + v[2]! * Math.sin(yaw), v[1]!, -v[0]! * Math.sin(yaw) + v[2]! * Math.cos(yaw)];

describe("the club is one continuous object in every pose", () => {
  const root = makeRoot(0);
  const addr = solveSwing(evaluateSwing("address", 0), root);
  const offsets = clubAttachOffsets(addr.rightForearmWorld, addr.rightElbowModel, addr.grip, addr.shaftDir, root);

  it("the shaft overlaps the grip by at least 3 cm and runs into the head", () => {
    const grip = CLUB_PARTS.find((p) => p.id === "golfer-club-grip")!;
    const shaft = CLUB_PARTS.find((p) => p.id === "golfer-club-shaft")!;
    const gripEnd = grip.along + 0.3 / 2;
    const shaftStart = shaft.along - 0.84 / 2;
    expect(gripEnd - shaftStart).toBeGreaterThanOrEqual(0.03);
    const head = CLUB_PARTS.find((p) => p.id === "golfer-club-head")!;
    expect(shaft.along + 0.84 / 2).toBeGreaterThanOrEqual(head.along - 0.03);
  });

  const phases: Array<[SwingPosePhase, number]> = [["address", 0], ["backswing", 0.5], ["backswing", 1], ["downswing", 0.5], ["downswing", 1], ["follow", 0.5], ["follow", 1]];
  for (const [phase, t] of phases) {
    it(`grip, shaft and head share one axis and are collinear: ${phase} t=${t}`, () => {
      const solved = solveSwing(evaluateSwing(phase, t), root);
      const dir = norm(solved.shaftDir);
      const poses = offsets.map((o) => ({ part: CLUB_PARTS.find((p) => p.id === o.id)!, pose: clubPartPose(solved, o, root, 0) }));
      const origin = poses[0]!.pose.centreShot;
      for (const { part, pose } of poses) {
        const axis = norm(qRotate(pose.worldQuat, [0, 1, 0]));
        // every part's long axis is the shaft direction (the head box is turned about it, its +Y stays on the axis)
        expect(axis[0]! * dir[0]! + axis[1]! * dir[1]! + axis[2]! * dir[2]!).toBeGreaterThan(0.999);
        // centre sits on the grip's line at its `along` distance from the grip part's centre
        const rel = pose.centreShot.map((c, i) => c - origin[i]!);
        const expected = (part.along - CLUB_PARTS[0]!.along) * root.s;
        const along = rel[0]! * dir[0]! + rel[1]! * dir[1]! + rel[2]! * dir[2]!;
        expect(Math.abs(along - expected)).toBeLessThan(0.02);
        const off = Math.hypot(rel[0]! - dir[0]! * along, rel[1]! - dir[1]! * along, rel[2]! - dir[2]! * along);
        expect(off).toBeLessThan(0.01);
      }
    });
  }

  it("the world orientation turns the model frame by the node yaw", () => {
    const o = offsets[0]!;
    const a = clubPartPose(addr, o, root, 0).worldQuat;
    const b = clubPartPose(addr, o, root, Math.PI / 2).worldQuat;
    const va = qRotate(a, [0, 1, 0]);
    const vb = qRotate(b, [0, 1, 0]);
    const expected = yawToWorld(va, Math.PI / 2);
    for (let i = 0; i < 3; i += 1) expect(vb[i]).toBeCloseTo(expected[i]!, 6);
  });
});

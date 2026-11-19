import { afterAll, describe, expect, it } from "vitest";
import {
  BALL_SHOT,
  SKELETON_ATHLETE,
  evaluateSwing,
  makeRoot,
  solveSwing,
  toModel,
  unit,
  useSkeleton,
  vAdd,
  vDist,
  vLen,
  vScale,
  vSub,
  type SwingPosePhase
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { PALM_PAST_HAND } from "../../../apps/showcase-aura-links-3d/src/game/golferRetarget";
import { IDOL_BINDS } from "../../../apps/showcase-aura-links-3d/src/game/idolBinds";
import { idolForwardKinematics, idolProfile, mapIdolRoles, retargetIdol } from "../../../apps/showcase-aura-links-3d/src/game/idolHumanoid";
import { IDOL_GOLFER_BY_POLO, idolGolferKeyFor } from "../../../apps/showcase-aura-links-3d/src/game/idolArt";

const PHASES: Array<[SwingPosePhase, number]> = [
  ["address", 0],
  ["backswing", 0.5], ["backswing", 1],
  ["top", 0],
  ["downswing", 0.5], ["downswing", 1],
  ["follow", 0.5], ["follow", 1],
  ["putt-address", 0], ["putt-back", 1], ["putt-through", 0.5]
];

describe("Idol golfer variants", () => {
  it("every studio polo swatch has its own rigged golfer bind table", () => {
    for (const [polo, key] of Object.entries(IDOL_GOLFER_BY_POLO)) {
      expect(idolGolferKeyFor({ polo })).toBe(key);
      expect(IDOL_BINDS[key], key).toBeTruthy();
    }
    expect(idolGolferKeyFor({ polo: "#3070a0" })).toBe("linksIdolGolferBlue");
  });
});

for (const [key, bind] of Object.entries(IDOL_BINDS)) {
  describe(`Idol golfer ${key}: unnamed bones mapped by hierarchy and driven by the swing solve`, () => {
    afterAll(() => useSkeleton(SKELETON_ATHLETE));
    const roles = mapIdolRoles(bind);
    const prof = idolProfile(bind, key);
    const P = (n: string) => bind.joints.find((j) => j.name === n)!.pos;

    it("maps a plausible humanoid (left at +X, legs down, arms out, head on top)", () => {
      expect(P(roles.upperArmL)[0]).toBeGreaterThan(0.08);
      expect(P(roles.upperArmR)[0]).toBeLessThan(-0.08);
      expect(P(roles.handL)[0]).toBeGreaterThan(0.55);
      expect(P(roles.handR)[0]).toBeLessThan(-0.55);
      expect(P(roles.thighL)[0]).toBeGreaterThan(0);
      expect(P(roles.thighR)[0]).toBeLessThan(0);
      expect(P(roles.footL)[1]).toBeLessThan(0.2);
      expect(P(roles.head)[1]).toBeGreaterThan(1.45);
      expect(P(roles.chest)[1]).toBeGreaterThan(P(roles.hips)[1]);
      const upper = vLen(prof.rig.tForearmR), fore = vLen(prof.rig.palmR);
      expect(upper).toBeGreaterThan(0.2);
      expect(upper).toBeLessThan(0.4);
      expect(fore).toBeGreaterThan(0.2);
      expect(fore).toBeLessThan(0.45);
    });

    it("the club head meets the ball at address and impact on the Idol proportions", () => {
      useSkeleton(prof);
      const root = makeRoot(0);
      for (const [phase, t] of [["address", 0], ["downswing", 1]] as const) {
        expect(vDist(solveSwing(evaluateSwing(phase, t), root).clubHead, BALL_SHOT), `${phase}`).toBeLessThan(0.03);
      }
    });

    it("the retargeted pose (forward kinematics) puts both palms on the grip, the shoulders where the solve has them and the feet planted", () => {
      useSkeleton(prof);
      const root = makeRoot(0);
      for (const [phase, t] of PHASES) {
        const s = solveSwing(evaluateSwing(phase, t), root);
        const pose = retargetIdol(bind, s);
        expect(Object.keys(pose).length).toBe(bind.joints.length);
        for (const [bone, b] of Object.entries(pose)) {
          expect(Math.hypot(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w), `${bone} ${phase}@${t}`).toBeCloseTo(1, 5);
        }
        const fk = idolForwardKinematics(bind, pose);
        const palm = (fore: string, hand: string) => {
          const f = fk.get(fore)!.pos, h = fk.get(hand)!.pos;
          return vAdd(h, vScale(unit(vSub(h, f)), PALM_PAST_HAND));
        };
        expect(vDist(palm(roles.foreArmR, roles.handR), toModel(root, s.grip)), `R ${phase}@${t}`).toBeLessThan(0.01);
        expect(vDist(palm(roles.foreArmL, roles.handL), toModel(root, s.leftPalm)), `L ${phase}@${t}`).toBeLessThan(0.01);
        expect(vDist(fk.get(roles.upperArmR)!.pos, toModel(root, s.shoulderRShot)), `RS ${phase}@${t}`).toBeLessThan(0.01);
        expect(vDist(fk.get(roles.footL)!.pos, prof.leg.ankleL), `LF ${phase}@${t}`).toBeLessThan(0.01);
        if (s.posture.trailHeelLiftM && roles.toeR && prof.leg.toeR) {
          // finish: the trail heel rolls up about the planted toe
          expect(vDist(fk.get(roles.toeR)!.pos, prof.leg.toeR), `RT ${phase}@${t}`).toBeLessThan(0.04);
        } else {
          expect(vDist(fk.get(roles.footR)!.pos, prof.leg.ankleR), `RF ${phase}@${t}`).toBeLessThan(0.01);
        }
        expect(fk.get(roles.head)!.pos[1], `head ${phase}@${t}`).toBeGreaterThan(1.1);
        expect(fk.get(roles.handR)!.pos[1], `hand ${phase}@${t}`).toBeGreaterThan(fk.get(roles.shinR)!.pos[1]);
      }
    });
  });
}

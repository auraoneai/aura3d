import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BALL_SHOT,
  HERO_FIT_SCALE,
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
import {
  ATHLETE_TO_MESHY,
  GOLFER_TARGET_HEIGHT,
  MESHY_DRIVE,
  MESHY_GLB_HEIGHT,
  PALM_PAST_HAND,
  meshyForwardKinematics,
  meshyProfile,
  retargetSolved
} from "../../../apps/showcase-aura-links-3d/src/game/golferRetarget";
import { GOLFER_BIND, GOLFER_GLB } from "../../../apps/showcase-aura-links-3d/src/game/golferSkeleton";
import { buildGolferNodes, golferVariantFromSearch, setGolferVariant } from "../../../apps/showcase-aura-links-3d/src/game/rig";

const app = resolve(__dirname, "../../../apps/showcase-aura-links-3d");

describe("Procedural golfer bind skeleton (24 joints, zero GLBs)", () => {
  it("defines all 24 canonical humanoid joints with valid unit rotations and zero model entries in aura-assets.ts", () => {
    expect(GOLFER_BIND).toHaveLength(24);
    for (const joint of GOLFER_BIND) {
      expect(Math.hypot(joint.rot[0], joint.rot[1], joint.rot[2], joint.rot[3]), joint.name).toBeCloseTo(1, 3);
    }
    expect(GOLFER_GLB).toBe("procedural-golfer-rig");
    const src = readFileSync(resolve(app, "src/aura-assets.ts"), "utf8");
    expect(src).not.toContain('.glb"');
  });
});

describe("bone map: original athlete skeleton -> 24-joint procedural golfer skeleton", () => {
  const jointNames = new Set(GOLFER_BIND.map((b) => b.name));

  it("maps every bone the swing solve writes, and every target bone exists in the 24-joint bind skeleton", () => {
    const solved = solveSwing(evaluateSwing("address", 0), makeRoot(0));
    expect(Object.keys(ATHLETE_TO_MESHY).sort()).toEqual(Object.keys(solved.bones).sort());
    for (const [athlete, meshy] of Object.entries(ATHLETE_TO_MESHY)) {
      if (meshy === null) continue;
      expect(jointNames.has(meshy), `${athlete} -> ${meshy}`).toBe(true);
    }
    for (const bone of Object.keys(MESHY_DRIVE)) expect(jointNames.has(bone), bone).toBe(true);
  });

  it("the arm, leg, spine and head chains are driven end to end (hands follow the forearms, the club hand bones are driven)", () => {
    for (const bone of ["LeftHand", "RightHand", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "Hips", "Head", "LeftUpLeg", "RightUpLeg"]) {
      expect(MESHY_DRIVE, bone).toHaveProperty(bone);
    }
    expect(Object.values(ATHLETE_TO_MESHY).filter(Boolean).every((m) => m! in MESHY_DRIVE)).toBe(true);
  });

  it("rest-pose height: both profiles scale cleanly to 1.84 m with identical world club length", () => {
    expect(MESHY_GLB_HEIGHT * meshyProfile().fitScale).toBeCloseTo(GOLFER_TARGET_HEIGHT, 2);
    const headEnd = GOLFER_BIND.find((b) => b.name === "head_end")!.pos[1];
    expect(headEnd).toBeLessThanOrEqual(MESHY_GLB_HEIGHT);
    expect(headEnd).toBeGreaterThan(MESHY_GLB_HEIGHT * 0.97);
    expect(meshyProfile().clubScale * meshyProfile().fitScale).toBeCloseTo(SKELETON_ATHLETE.fitScale, 6);
  });
});

describe("swing on the 24-joint procedural golfer skeleton", () => {
  beforeAll(() => useSkeleton(meshyProfile()));
  afterAll(() => useSkeleton(SKELETON_ATHLETE));

  const PHASES: Array<[SwingPosePhase, number]> = [
    ["address", 0],
    ["backswing", 0.25], ["backswing", 0.5], ["backswing", 0.75], ["backswing", 1],
    ["top", 0],
    ["downswing", 0.25], ["downswing", 0.5], ["downswing", 0.75], ["downswing", 1],
    ["follow", 0.25], ["follow", 0.5], ["follow", 0.75], ["follow", 1],
    ["putt-address", 0], ["putt-back", 1], ["putt-through", 0.5]
  ];
  const root = () => makeRoot(0);
  const solve = (phase: SwingPosePhase, t: number) => solveSwing(evaluateSwing(phase, t), root());
  const prof = () => meshyProfile();
  const palmOf = (fk: ReturnType<typeof meshyForwardKinematics>, fore: string, hand: string) => {
    const f = fk.get(fore)!.pos;
    const h = fk.get(hand)!.pos;
    return vAdd(h, vScale(unit(vSub(h, f)), PALM_PAST_HAND));
  };

  it("the solve uses the 24-joint proportions and fit scale", () => {
    expect(HERO_FIT_SCALE).toBeCloseTo(1.84 / 1.82, 6);
    expect(solve("address", 0).posture.ankleDriftM).toBeLessThan(0.01);
  });

  it("the club head is on the ball at address and at impact, the shaft is rigid", () => {
    expect(vDist(solve("address", 0).clubHead, BALL_SHOT)).toBeLessThan(0.03);
    expect(vDist(solve("downswing", 1).clubHead, BALL_SHOT)).toBeLessThan(0.03);
  });

  it("address posture reads as a golf stance (spine tilt, knee flex, head over the ball)", () => {
    const p = solve("address", 0).posture;
    expect(p.spineTiltDeg).toBeGreaterThanOrEqual(25);
    expect(p.spineTiltDeg).toBeLessThanOrEqual(36);
    expect(p.kneeFlexDeg).toBeGreaterThanOrEqual(20);
    expect(p.kneeFlexDeg).toBeLessThanOrEqual(40);
    expect(p.thighTiltDeg).toBeLessThan(35);
    expect(p.headOverBallM).toBeLessThan(0.3);
    expect(p.sideBendDeg).toBeLessThan(4);
  });

  it("stays in a believable range through the whole swing and keeps the hands within reach", () => {
    for (const [phase, t] of PHASES) {
      const s = solve(phase, t);
      expect(s.posture.spineTiltDeg, `${phase}@${t}`).toBeGreaterThan(12);
      expect(s.posture.spineTiltDeg, `${phase}@${t}`).toBeLessThan(40);
      expect(s.posture.sideBendDeg, `${phase}@${t}`).toBeLessThan(16);
      expect(s.posture.ankleDriftM, `${phase}@${t}`).toBeLessThan(0.01);
      const maxR = vLen(prof().rig.tForearmR) + vLen(prof().rig.palmR);
      const maxL = vLen(prof().rig.tForearmL) + vLen(prof().rig.palmL);
      expect(s.reachR, `${phase}@${t}`).toBeLessThanOrEqual(maxR);
      expect(s.reachL, `${phase}@${t}`).toBeLessThanOrEqual(maxL);
    }
  });

  it("the retargeted bones (forward kinematics of the overlay pose) put both hands on the grip, feet planted, unit rotations", () => {
    for (const [phase, t] of PHASES) {
      const s = solve(phase, t);
      const pose = retargetSolved(s);
      for (const [bone, b] of Object.entries(pose)) {
        expect(Math.hypot(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w), `${bone} ${phase}@${t}`).toBeCloseTo(1, 5);
      }
      const fk = meshyForwardKinematics(pose);
      expect(vDist(palmOf(fk, "RightForeArm", "RightHand"), toModel(root(), s.grip)), `R ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(palmOf(fk, "LeftForeArm", "LeftHand"), toModel(root(), s.leftPalm)), `L ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(fk.get("RightArm")!.pos, toModel(root(), s.shoulderRShot)), `RS ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(fk.get("LeftArm")!.pos, toModel(root(), s.shoulderLShot)), `LS ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(fk.get("LeftFoot")!.pos, prof().leg.ankleL), `LF ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(fk.get("RightFoot")!.pos, prof().leg.ankleR), `RF ${phase}@${t}`).toBeLessThan(s.posture.trailHeelLiftM ? 0.09 : 0.005);
      expect(fk.get("LeftToeBase")!.pos[1], `LT ${phase}@${t}`).toBeGreaterThan(-0.005);
      expect(fk.get("RightToeBase")!.pos[1], `RT ${phase}@${t}`).toBeGreaterThan(-0.005);
      expect(pose.Hips!.position!.y).toBeGreaterThan(80);
      expect(pose.Hips!.position!.y).toBeLessThan(120);
    }
  });

  it("the head stays over the body and the hands are higher than the knees through the swing", () => {
    for (const [phase, t] of PHASES) {
      const fk = meshyForwardKinematics(retargetSolved(solve(phase, t)));
      expect(fk.get("Head")!.pos[1], `${phase}@${t}`).toBeGreaterThan(1.2);
      expect(fk.get("RightHand")!.pos[1], `${phase}@${t}`).toBeGreaterThan(fk.get("RightLeg")!.pos[1]);
    }
  });
});

describe("golfer variant", () => {
  it("selects the default GU47 profile by default, and the original athlete behind ?golfer=old or ?look=original", () => {
    expect(golferVariantFromSearch("")).toBe("meshy");
    expect(golferVariantFromSearch("?hole=3")).toBe("meshy");
    expect(golferVariantFromSearch("?golfer=old")).toBe("athlete");
    expect(golferVariantFromSearch("?look=original")).toBe("athlete");
    expect(golferVariantFromSearch("?look=gu47")).toBe("meshy");
  });

  it("mounts the procedural articulated group and ready clip metadata", () => {
    const find = () => (buildGolferNodes({} as any) as any[]).map((n) => (typeof n?.toJSON === "function" ? n.toJSON() : n)).find((n) => n.name === "golfer-body");
    try {
      setGolferVariant("meshy");
      expect(find().kind).toBe("group");
      expect(find().animation.clip).toBe("idle");
      setGolferVariant("athlete");
      expect(find().kind).toBe("group");
      expect(find().animation.clip).toBe("Ready");
    } finally {
      setGolferVariant("meshy");
    }
  });
});

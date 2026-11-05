import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BALL_SHOT,
  HERO_FIT_SCALE,
  SKELETON_ATHLETE,
  evaluateSwing,
  makeRoot,
  qRotate,
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
const glbPath = resolve(app, "public/aura-assets", GOLFER_GLB);
const oldGlbPath = resolve(__dirname, "../../../public/aura-assets/linksGolferAthleteClean.b56529b1.glb");

function glbJson(path: string): any {
  const b = readFileSync(path);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
}
const meshMaxY = (j: any): number => {
  const prim = j.meshes[0].primitives[0];
  return j.accessors[prim.attributes.POSITION].max[1];
};
/** width and height of a JPEG from its SOF marker */
function jpegSize(buf: Buffer): [number, number] {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no SOF marker");
}

describe("Meshy golfer asset (links_golfer_player)", () => {
  const j = glbJson(glbPath);
  it("is admitted with the real triangle count, 1k maps and the skinned clips", () => {
    const tris = j.meshes.flatMap((m: any) => m.primitives).reduce((n: number, p: any) => n + j.accessors[p.indices].count / 3, 0);
    expect(tris).toBe(16420);
    expect(tris).toBeGreaterThanOrEqual(12000);
    expect(tris).toBeLessThanOrEqual(20000);
    const bin = readFileSync(glbPath);
    const binStart = 20 + bin.readUInt32LE(12) + 8;
    for (const img of j.images) {
      const view = j.bufferViews[img.bufferView];
      const [w, h] = jpegSize(bin.subarray(binStart + (view.byteOffset ?? 0), binStart + (view.byteOffset ?? 0) + view.byteLength));
      expect(Math.max(w, h)).toBeLessThanOrEqual(1024);
    }
    expect(j.skins[0].joints).toHaveLength(24);
    expect(j.meshes[0].primitives[0].attributes).toHaveProperty("JOINTS_0");
    expect(j.meshes[0].primitives[0].attributes).toHaveProperty("WEIGHTS_0");
    expect(j.animations.map((a: any) => a.name).sort()).toEqual(["cheer", "idle", "wave"]);
  });

  it("is the typed catalog entry, hash matching the file", () => {
    const src = readFileSync(resolve(app, "src/aura-assets.ts"), "utf8");
    const hash = createHash("sha256").update(readFileSync(glbPath)).digest("hex");
    expect(src).toContain(`url: "/aura-assets/links_golfer_player.${hash.slice(0, 8)}.glb"`);
    expect(src).toContain(`sha256-${hash}`);
    expect(GOLFER_GLB).toBe(`links_golfer_player.${hash.slice(0, 8)}.glb`);
    expect(JSON.parse(readFileSync(resolve(app, "assets/provenance/links_golfer_player.rights.json"), "utf8")).rightsBasis).toMatch(/Meshy/);
  });

  it("has the bind table of its own node hierarchy (scripts/extract-golfer-skeleton.mjs)", async () => {
    const mod: any = await import("../../../apps/showcase-aura-links-3d/scripts/extract-golfer-skeleton.mjs");
    const rows = mod.bindFromGlb(glbPath) as Array<{ name: string; parent: string | null; pos: number[] }>;
    expect(rows.map((r) => r.name)).toEqual(GOLFER_BIND.map((b) => b.name));
    for (const [i, r] of rows.entries()) {
      expect(GOLFER_BIND[i]!.parent).toBe(r.parent);
      for (let k = 0; k < 3; k++) expect(GOLFER_BIND[i]!.pos[k]).toBeCloseTo(r.pos[k]!, 5);
    }
  });
});

describe("bone map: original athlete skeleton -> Meshy skeleton", () => {
  const jointNames = new Set(glbJson(glbPath).skins[0].joints.map((i: number) => glbJson(glbPath).nodes[i].name));

  it("maps every bone the swing solve writes, and every target bone exists in the Meshy GLB skeleton", () => {
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

  it("rest-pose height: both rigs are scaled to the same 1.84 m by their own GLB height", () => {
    const meshyH = meshMaxY(glbJson(glbPath));
    expect(meshyH).toBeCloseTo(MESHY_GLB_HEIGHT, 2);
    const oldH = meshMaxY(glbJson(oldGlbPath));
    expect(meshyH * meshyProfile().fitScale).toBeCloseTo(GOLFER_TARGET_HEIGHT, 2);
    expect(oldH * SKELETON_ATHLETE.fitScale).toBeCloseTo(GOLFER_TARGET_HEIGHT, 1);
    // the skeleton's head top sits under the mesh top, within 3 percent
    const headEnd = GOLFER_BIND.find((b) => b.name === "head_end")!.pos[1];
    expect(headEnd).toBeLessThanOrEqual(meshyH);
    expect(headEnd).toBeGreaterThan(meshyH * 0.97);
    // the club keeps the same world length on both rigs
    expect(meshyProfile().clubScale * meshyProfile().fitScale).toBeCloseTo(SKELETON_ATHLETE.fitScale, 6);
  });
});

describe("swing on the Meshy skeleton", () => {
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

  it("the solve uses the Meshy proportions and fit scale", () => {
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

  it("the retargeted bones (forward kinematics of the overlay pose) put both Meshy hands on the grip, feet planted, unit rotations", () => {
    for (const [phase, t] of PHASES) {
      const s = solve(phase, t);
      const pose = retargetSolved(s);
      for (const [bone, b] of Object.entries(pose)) {
        expect(Math.hypot(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w), `${bone} ${phase}@${t}`).toBeCloseTo(1, 5);
      }
      const fk = meshyForwardKinematics(pose);
      // right palm on the grip point, left palm on the shaft a hand-span above (both from the real hand joints)
      expect(vDist(palmOf(fk, "RightForeArm", "RightHand"), toModel(root(), s.grip)), `R ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(palmOf(fk, "LeftForeArm", "LeftHand"), toModel(root(), s.leftPalm)), `L ${phase}@${t}`).toBeLessThan(0.005);
      // the shoulders (Meshy LeftArm / RightArm joints) are where the solve put them, so the limb lengths are consistent
      expect(vDist(fk.get("RightArm")!.pos, toModel(root(), s.shoulderRShot)), `RS ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(fk.get("LeftArm")!.pos, toModel(root(), s.shoulderLShot)), `LS ${phase}@${t}`).toBeLessThan(0.005);
      // feet stay on the bind stance and above the ground
      expect(vDist(fk.get("LeftFoot")!.pos, prof().leg.ankleL), `LF ${phase}@${t}`).toBeLessThan(0.005);
      expect(vDist(fk.get("RightFoot")!.pos, prof().leg.ankleR), `RF ${phase}@${t}`).toBeLessThan(0.005);
      expect(fk.get("LeftToeBase")!.pos[1], `LT ${phase}@${t}`).toBeGreaterThan(-0.005);
      expect(fk.get("RightToeBase")!.pos[1], `RT ${phase}@${t}`).toBeGreaterThan(-0.005);
      // the hips local position is in centimetres (Armature scale 0.01)
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
  it("is the Meshy golfer by default, the original athlete behind ?golfer=old or ?look=original", () => {
    expect(golferVariantFromSearch("")).toBe("meshy");
    expect(golferVariantFromSearch("?hole=3")).toBe("meshy");
    expect(golferVariantFromSearch("?golfer=old")).toBe("athlete");
    expect(golferVariantFromSearch("?look=original")).toBe("athlete");
    expect(golferVariantFromSearch("?look=gu47")).toBe("meshy");
  });

  it("mounts the matching model and ready clip", () => {
    const find = () => (buildGolferNodes({} as any) as any[]).map((n) => (typeof n?.toJSON === "function" ? n.toJSON() : n)).find((n) => n.name === "golfer-body");
    try {
      setGolferVariant("meshy");
      expect(find().asset.url).toMatch(/links_golfer_player\.[0-9a-f]{8}\.glb$/);
      expect(find().animation.clip).toBe("idle");
      setGolferVariant("athlete");
      expect(find().asset.url).toMatch(/linksGolferAthleteClean/);
      expect(find().animation.clip).toBe("Ready");
    } finally {
      setGolferVariant("meshy");
    }
  });
});

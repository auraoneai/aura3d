import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import "../../../../packages/aura3d-cli/src/commands/animation-io/index";
import { importClipsOntoRig } from "../../../../packages/aura3d-cli/src/commands/animation-io/index";
import { inspectAnimationClips, readGlbDocument } from "../../../../packages/aura3d-cli/src/commands/prd06/inspectAnimationClips";
import { buildHierarchy, forward, localPose, readAccessor, readGlbFile, type GlbData } from "../../../../packages/aura3d-cli/src/skin/gltf";
import { buildRiggedGlb } from "../skin/rigged-fixture";
import * as appHumanoid from "../../../../apps/showcase-port-shared/idol/humanoid";
import * as appSmpl from "../../../../apps/showcase-port-shared/idol/smplMotion";
import * as pkgHumanoid from "../../../../packages/animation/src/smpl/humanoid";
import * as pkgSmpl from "../../../../packages/animation/src/smpl/smplMotion";
import { buildRigGlb, bvhText, fbxText, HUMANOID, PILOT, turned, type BvhRot, type V3 } from "./fixtures";

const HYMOTION = join(__dirname, "fixtures/hymotion-boxing.json");
const REAL_IDOL = join(__dirname, "../../../../apps/showcase-aura-fc-3d/assets/idol/fcIdolHomeA.glb");

// The engine's BVH/FBX parsers load on demand; warm the module graph once so per-test timeouts measure the import itself.
beforeAll(async () => { await import("@aura3d/assets/importers"); }, 120_000);

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "aura3d-anim-import-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function cli(...argv: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [], err: string[] = [];
  const code = await cliCommandFor("animation import")!.run(argv, { cwd: dir, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out, err };
}
async function cliJson(...argv: string[]): Promise<{ code: number; json: any }> {
  const r = await cli(...argv, "--json");
  expect(r.out).toHaveLength(1);
  return { code: r.code, json: JSON.parse(r.out[0]!) };
}

/** Linear ramp of BVH Euler keys from all-zero to `to` over `n` frames. */
function ramp(n: number, to: BvhRot): BvhRot[] {
  return Array.from({ length: n }, (_, f) => {
    const u = f / (n - 1);
    return Object.fromEntries(Object.entries(to).map(([k, v]) => [k, v.map((x) => x * u) as [number, number, number]]));
  });
}

function dirOf(glb: GlbData, anim: string, t: number, from: string, to: string): V3 {
  const h = buildHierarchy(glb);
  const a = glb.json.animations!.find((x) => x.name === anim)!;
  const pos = forward(localPose(glb, a, t, h), h).pos;
  const p = pos[h.id(from)]!, q = pos[h.id(to)]!;
  const v: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const deg = (d: number) => (d * Math.PI) / 180;
const LOWERED: V3 = [Math.cos(deg(-80)), Math.sin(deg(-80)), 0];

/** Source motion: left arm lowers 80 degrees, right thigh swings 60 degrees forward. */
const WALK = ramp(31, { LeftArm: [-80, 0, 0], RightUpLeg: [0, -60, 0] });

describe("aura3d animation import: CLI conventions", () => {
  it("--help prints the usage and writes nothing", async () => {
    const r = await cli("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb", "--help");
    expect(r.code).toBe(0);
    expect(r.out.join("\n")).toContain("aura3d animation import <src> --onto rigged.glb --out hero.glb");
    expect(existsSync(join(dir, "hero.glb"))).toBe(false);
  });

  it("usage errors exit 2 and name the fix", async () => {
    expect((await cli("walk.bvh", "--out", "hero.glb")).code).toBe(2);
    expect((await cli("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb", "--root-motion", "fly")).code).toBe(2);
    expect((await cli("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb", "--bogus")).code).toBe(2);
    expect((await cli("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb", "--window", "2,1")).code).toBe(2);
    const missing = await cliJson("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb");
    expect(missing.code).toBe(1);
    expect(missing.json.ok).toBe(false);
    expect(missing.json.error).toMatch(/--onto rig\.glb: file not found/);
  });

  it("the game modules are re-exports of the moved package modules (no fork)", () => {
    expect(appHumanoid.createHumanoidDriver).toBe(pkgHumanoid.createHumanoidDriver);
    expect(appHumanoid.mapHumanoid).toBe(pkgHumanoid.mapHumanoid);
    expect(appSmpl.smplMotionToClip).toBe(pkgSmpl.smplMotionToClip);
  });
});

describe("aura3d animation import: sources", () => {
  it("BVH -> named rig: real glTF channels whose limbs follow the source; inspect-clips round trip", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, WALK));
    const { code, json } = await cliJson("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb");
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
    const clip = json.clips[0];
    expect(clip).toMatchObject({ name: "walk", format: "bvh", frames: 31, fps: 30, flips: 0, channels: HUMANOID.length + 1 });
    expect(clip.duration).toBeCloseTo(1, 3);
    expect(clip.limbErrorDeg.max).toBeLessThan(0.5);
    expect(clip.verifiedErrorDeg).toBeLessThan(0.5);
    expect(clip.sourceFacing).toBe("+z (names)");
    expect(json.target.roles).toMatchObject({ hips: "Hips", leftUpperArm: "LeftArm", leftLowerArm: "LeftForeArm", rightUpperLeg: "RightUpLeg", head: "Head" });
    expect(json.skin.ok).toBe(true);

    const bytes = readFileSync(join(dir, "hero.glb"));
    const doc = readGlbDocument(new Uint8Array(bytes));
    const inspected = inspectAnimationClips(doc.json, doc.bin);
    expect(inspected.map((c) => c.name)).toEqual(["walk"]);
    expect(inspected[0]!.channelCount).toBe(HUMANOID.length + 1);
    expect(inspected[0]!.duration).toBeCloseTo(1, 3);
    expect(inspected[0]!.frameRate).toBeCloseTo(30, 0);

    const glb = readGlbFile(join(dir, "hero.glb"));
    expect(dot(dirOf(glb, "walk", 0, "LeftArm", "LeftForeArm"), [1, 0, 0])).toBeGreaterThan(0.99);
    expect(dot(dirOf(glb, "walk", 1, "LeftArm", "LeftForeArm"), LOWERED)).toBeGreaterThan(0.999);
    expect(dot(dirOf(glb, "walk", 1, "RightUpLeg", "RightLeg"), [0, -0.5, Math.sqrt(3) / 2])).toBeGreaterThan(0.999);
  });

  it("detects a turned source skeleton's facing from its bone names and keeps left on left", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    // Facing +X: lowering the left arm is a rotation about the forward (+X) axis.
    writeFileSync(join(dir, "turned.bvh"), bvhText(turned(HUMANOID, 90), ramp(31, { LeftArm: [0, -80, 0] })));
    const { code, json } = await cliJson("turned.bvh", "--onto", "rig.glb", "--out", "hero.glb");
    expect(code).toBe(0);
    expect(json.clips[0].sourceFacing).toBe("+x (names)");
    const glb = readGlbFile(join(dir, "hero.glb"));
    expect(dot(dirOf(glb, "turned", 1, "LeftArm", "LeftForeArm"), LOWERED)).toBeGreaterThan(0.999);
    expect(dot(dirOf(glb, "turned", 1, "RightArm", "RightForeArm"), [-1, 0, 0])).toBeGreaterThan(0.99);
  });

  it("FBX clip -> rig (skinless LimbNode skeleton, centimetre units, AnimationStack clip)", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "anim.fbx"), fbxText(HUMANOID, [{ time: 0, rot: { LeftArm: [0, 0, 0] } }, { time: 1, rot: { LeftArm: [-80, 0, 0] } }]));
    const { code, json } = await cliJson("punch=anim.fbx", "--onto", "rig.glb", "--out", "hero.glb");
    expect(code).toBe(0);
    expect(json.clips[0]).toMatchObject({ name: "punch", sourceClip: "Take 001", format: "fbx", flips: 0 });
    expect(json.clips[0].duration).toBeCloseTo(1, 3);
    expect(json.clips[0].diagnostics.join(" ")).toMatch(/FBX_ANIMATION_EULER_APPROXIMATION/);
    const glb = readGlbFile(join(dir, "hero.glb"));
    expect(dot(dirOf(glb, "punch", 1, "LeftArm", "LeftForeArm"), LOWERED)).toBeGreaterThan(0.999);
    expect(dot(dirOf(glb, "punch", 0.5, "LeftArm", "LeftForeArm"), [Math.cos(deg(-40)), Math.sin(deg(-40)), 0])).toBeGreaterThan(0.99);
  });

  it("GLB clip -> a different rig (a clip authored on the named skeleton, retargeted onto the Idol pilot rig)", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, WALK));
    expect((await cli("walk.bvh", "--onto", "rig.glb", "--out", "walk.glb")).code).toBe(0);
    writeFileSync(join(dir, "idol.glb"), buildRigGlb(PILOT, { root: { yaw: -90, scale: 2.2, translation: [0, 1.05, 0] } }));
    const { code, json } = await cliJson("walk.glb", "--onto", "idol.glb", "--out", "hero.glb");
    expect(code).toBe(0);
    expect(json.clips[0]).toMatchObject({ name: "walk", format: "gltf", flips: 0 });
    expect(json.clips[0].verifiedErrorDeg).toBeLessThan(0.5);
    const glb = readGlbFile(join(dir, "hero.glb"));
    const roles = json.target.roles;
    expect(dot(dirOf(glb, "walk", 1, roles.leftUpperArm, roles.leftLowerArm), LOWERED)).toBeGreaterThan(0.995);
  });

  it("HY-Motion motion.json -> Idol-like unnamed rig within the error bound, matching the games' live driver pose", async () => {
    const rig = buildRigGlb(PILOT, { root: { yaw: -90, scale: 2.2, translation: [0, 1.05, 0] } });
    writeFileSync(join(dir, "idol.glb"), rig);
    const result = await importClipsOntoRig({ projectDir: dir, onto: "idol.glb", output: "hero.glb", clips: [{ name: "Jab", file: HYMOTION }] });
    expect(result.ok).toBe(true);
    expect(result.target.facing).toBe("+z");
    expect(result.target.roles.hips).toBe("bone_0");
    const clip = result.clips[0]!;
    expect(clip).toMatchObject({ name: "Jab", format: "hy-motion", frames: 60, flips: 0, channels: PILOT.length + 1 });
    expect(clip.duration).toBeCloseTo(59 / 30, 4);
    expect(clip.limbErrorDeg.max).toBeLessThan(0.5);
    expect(clip.verifiedErrorDeg).toBeLessThan(0.5);
    expect(clip.motionDeg).toBeGreaterThan(20);
    expect(result.skin?.ok).toBe(true);

    // The games' path: canonical HumanoidClip -> sampleHumanoidClip -> driver.pose. The baked keys match it (int16 clip quantisation only).
    const dict = JSON.parse(readFileSync(HYMOTION, "utf8"));
    const { clip: hc } = appSmpl.smplMotionToClip("Jab", dict, {});
    const driver = appHumanoid.createHumanoidDriver(appHumanoid.readIdolSkeleton(appHumanoid.parseGlbJson(rig)));
    const glb = readGlbFile(join(dir, "hero.glb"));
    const anim = glb.json.animations!.find((a) => a.name === "Jab")!;
    const h = buildHierarchy(glb);
    let worst = 0;
    for (const f of [0, 15, 30, 59]) {
      const live = driver.pose(appHumanoid.sampleHumanoidClip(hc, f / 30, { loop: false }));
      const baked = localPose(glb, anim, f / 30, h);
      for (const name of ["bone_7", "bone_8", "bone_17", "bone_18", "bone_0"]) {
        const a = live.bones[name]!.rotation, b = baked[h.id(name)]!.r;
        const d = Math.abs(a.x * b[0]! + a.y * b[1]! + a.z * b[2]! + a.w * b[3]!);
        worst = Math.max(worst, (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI);
      }
    }
    expect(worst).toBeLessThan(1);
  });
});

const HAS_REAL_IDOL = existsSync(REAL_IDOL) && readFileSync(REAL_IDOL).readUInt32LE(0) === 0x46546c67;

describe.skipIf(!HAS_REAL_IDOL)("aura3d animation import: skin check on a real Idol rig with a known defect (fcIdolHomeA)", () => {
  // fcIdolHomeA already stretches 138 triangles past 1.6x in its own `idle` clip (Idol armpit/crotch bridging).
  const writeWalk = () => writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, WALK));

  it("a defect the base rig already shows is a warning, not a failure (exit 0)", async () => {
    writeWalk();
    const { code, json } = await cliJson("walk.bvh", "--onto", REAL_IDOL, "--out", "hero.glb");
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.skin).toMatchObject({ ok: true, mode: "relative-to-base", failures: [] });
    expect(json.skin.base).toMatchObject({ clips: ["idle"], codes: ["SKIN_STRETCH"] });
    expect(json.skin.imported.stretched).toBeLessThanOrEqual(1.5 * json.skin.base.stretched);
    expect(json.skin.warnings.join(" ")).toMatch(/SKIN_STRETCH.*pre-existing/);
    expect(json.target).toMatchObject({ facing: "+z", facingMethod: "toes" });
  });

  it("--strict keeps the plain validate rule: any skin error that is not allow-listed fails (file kept)", async () => {
    writeWalk();
    const { code, json } = await cliJson("walk.bvh", "--onto", REAL_IDOL, "--out", "hero.glb", "--strict");
    expect(code).toBe(1);
    expect(json.skin.mode).toBe("strict");
    expect(json.skin.failures.join(" ")).toMatch(/SKIN_STRETCH/);
    expect(existsSync(join(dir, "hero.glb"))).toBe(true);
  });

  it("fails when the imported clips make the defect materially worse (HY-Motion boxing: > 1.5x the base triangles)", async () => {
    const { code, json } = await cliJson(`Jab=${HYMOTION}`, "--onto", REAL_IDOL, "--out", "hero.glb");
    expect(json.clips[0].limbErrorDeg.max).toBeLessThan(0.5);
    expect(json.clips[0].verifiedErrorDeg).toBeLessThan(0.5);
    expect(json.animations).toEqual(["Jab"]);
    expect(code).toBe(1);
    expect(json.skin.imported.stretched).toBeGreaterThan(1.5 * json.skin.base.stretched);
    expect(json.skin.failures.join(" ")).toMatch(/SKIN_STRETCH.*materially worse/);
  });

  it("honours aura.skin-allow.json for the admitted asset the --onto file belongs to (allowed codes become warnings)", async () => {
    mkdirSync(join(dir, "assets/idol"), { recursive: true });
    copyFileSync(REAL_IDOL, join(dir, "assets/idol/fcIdolHomeA.glb"));
    const real = JSON.parse(readFileSync(join(__dirname, "../../../../aura.assets.json"), "utf8"));
    const entry = real.assets.find((a: { id: string }) => a.id === "fcIdolHomeA");
    writeFileSync(join(dir, "aura.assets.json"), JSON.stringify({ ...real, assets: [{ ...entry, source: "assets/idol/fcIdolHomeA.glb", outputPath: "public/aura-assets/fcIdolHomeA.glb" }] }));
    writeFileSync(join(dir, "aura.skin-allow.json"), JSON.stringify({ fcIdolHomeA: { allow: ["SKIN_STRETCH"], reason: "Idol auto-rig armpit bridging, known (test)" } }));
    const { code, json } = await cliJson(`Jab=${HYMOTION}`, "--onto", "assets/idol/fcIdolHomeA.glb", "--out", "hero.glb");
    expect(code).toBe(0);
    expect(json.skin).toMatchObject({ ok: true, allowed: ["SKIN_STRETCH"], allowedBy: ["fcIdolHomeA"] });
    expect(json.skin.warnings.join(" ")).toMatch(/SKIN_STRETCH.*allow-listed: fcIdolHomeA/);
    // --strict only honours an entry for the output itself.
    expect((await cliJson(`Jab=${HYMOTION}`, "--onto", "assets/idol/fcIdolHomeA.glb", "--out", "hero.glb", "--strict")).code).toBe(1);
    writeFileSync(join(dir, "aura.skin-allow.json"), JSON.stringify({ hero: { allow: ["SKIN_STRETCH"], reason: "Idol auto-rig armpit bridging, known (test)" } }));
    expect((await cliJson(`Jab=${HYMOTION}`, "--onto", "assets/idol/fcIdolHomeA.glb", "--out", "hero.glb", "--strict")).code).toBe(0);
  });
});

describe("aura3d animation import: fails loudly instead of writing a broken clip", () => {
  it("rejects a limb flip and writes nothing", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    const frames = ramp(31, { LeftArm: [-60, 0, 0] }).map((fr, f) => (f >= 10 ? { ...fr, LeftForeArm: [0, 0, 175] as [number, number, number] } : fr));
    writeFileSync(join(dir, "flip.bvh"), bvhText(HUMANOID, frames));
    const { code, json } = await cliJson("flip.bvh", "--onto", "rig.glb", "--out", "hero.glb");
    expect(code).toBe(1);
    expect(json.code).toBe("ANIMATION_IMPORT_LIMB_FLIP");
    expect(json.error).toMatch(/limb flip.*Nothing was written.*--window/);
    expect(existsSync(join(dir, "hero.glb"))).toBe(false);
  });

  it("rejects a clip that would leave the rig in its bind T-pose", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "still.bvh"), bvhText(HUMANOID, ramp(10, {})));
    const { code, json } = await cliJson("still.bvh", "--onto", "rig.glb", "--out", "hero.glb");
    expect(code).toBe(1);
    expect(json.code).toBe("ANIMATION_IMPORT_STATIC");
    expect(existsSync(join(dir, "hero.glb"))).toBe(false);
  });

  it("rejects a target it cannot map to a humanoid and names --map", async () => {
    writeFileSync(join(dir, "legs.glb"), buildRiggedGlb({ rename: true }));
    writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, WALK));
    const { code, json } = await cliJson("walk.bvh", "--onto", "legs.glb", "--out", "hero.glb");
    expect(code).toBe(1);
    expect(json.code).toBe("ANIMATION_IMPORT_TARGET");
    expect(json.error).toMatch(/could not map .*--map/);
  });
});

describe("aura3d animation import: options", () => {
  it("--map overrides target roles (here: the source's left arm drives the rig's right arm)", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, WALK));
    const swap = { leftShoulder: "RightShoulder", leftUpperArm: "RightArm", leftLowerArm: "RightForeArm", leftHand: "RightHand", rightShoulder: "LeftShoulder", rightUpperArm: "LeftArm", rightLowerArm: "LeftForeArm", rightHand: "LeftHand" };
    writeFileSync(join(dir, "map.json"), JSON.stringify({ target: swap }));
    const { code, json } = await cliJson("walk.bvh", "--onto", "rig.glb", "--out", "hero.glb", "--map", "map.json", "--target-facing", "+z");
    expect(json.target.roles.leftUpperArm).toBe("RightArm");
    expect(code).toBe(0);
    const glb = readGlbFile(join(dir, "hero.glb"));
    // The rig's right arm now carries the source's left arm: it ends lowered on the body's left side (crossing over).
    expect(dot(dirOf(glb, "walk", 1, "RightArm", "RightForeArm"), LOWERED)).toBeGreaterThan(0.999);
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ target: { hips: "NoSuchBone" } }));
    const bad = await cliJson("walk.bvh", "--onto", "rig.glb", "--out", "hero2.glb", "--map", "bad.json");
    expect(bad.code).toBe(1);
    expect(bad.json.error).toMatch(/NoSuchBone/);
  });

  it("root motion: in-place keeps the bob only, keep bakes the travel, strip pins the hips", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "travel.bvh"), bvhText(HUMANOID, ramp(31, { LeftArm: [-80, 0, 0] }), 30, [0, 0, 1]));
    const hips = async (mode: string): Promise<number[][]> => {
      const r = await cli("travel.bvh", "--onto", "rig.glb", "--out", `${mode}.glb`, "--root-motion", mode);
      expect(r.code).toBe(0);
      const glb = readGlbFile(join(dir, `${mode}.glb`));
      const anim = glb.json.animations![0]!;
      const ch = anim.channels.find((c) => c.target.path === "translation")!;
      return readAccessor(glb, anim.samplers[ch.sampler]!.output).rows;
    };
    const keep = await hips("keep"), inPlace = await hips("in-place"), strip = await hips("strip");
    expect(keep[keep.length - 1]![2]! - keep[0]![2]!).toBeCloseTo(1, 2);
    expect(Math.max(...inPlace.map((r) => Math.abs(r[2]!)))).toBeLessThan(1e-4);
    for (const r of strip) expect(r).toEqual([0, expect.closeTo(0.95, 5), 0]);
  });

  it("multiple name=src clips, --keep-base-animations, --window/--fps/--loop and --dry-run", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID, { clips: { Idle: 1 } }));
    writeFileSync(join(dir, "a.bvh"), bvhText(HUMANOID, WALK));
    writeFileSync(join(dir, "b.bvh"), bvhText(HUMANOID, ramp(61, { RightArm: [80, 0, 0] })));
    const kept = await cliJson("walk=a.bvh", "wave=b.bvh", "--onto", "rig.glb", "--out", "kept.glb", "--keep-base-animations");
    expect(kept.code).toBe(0);
    expect(kept.json.animations).toEqual(["Idle", "walk", "wave"]);
    const dropped = await cliJson("walk=a.bvh", "wave=b.bvh", "--onto", "rig.glb", "--out", "dropped.glb");
    expect(dropped.json.animations).toEqual(["walk", "wave"]);
    expect(readFileSync(join(dir, "dropped.glb")).length).toBeLessThan(readFileSync(join(dir, "kept.glb")).length);

    // Multi-clip GLB sources: --clips picks clips, name=file#clip picks one; importing the static Idle loudly fails.
    const picked = await cliJson("kept.glb", "--clips", "walk,wave", "--onto", "rig.glb", "--out", "picked.glb");
    expect(picked.code).toBe(0);
    expect(picked.json.animations).toEqual(["walk", "wave"]);
    const one = await cliJson("w2=kept.glb#wave", "--onto", "rig.glb", "--out", "one.glb");
    expect(one.json.animations).toEqual(["w2"]);
    expect(one.json.clips[0].sourceClip).toBe("wave");
    const all = await cliJson("kept.glb", "--onto", "rig.glb", "--out", "all.glb");
    expect(all.code).toBe(1);
    expect(all.json.code).toBe("ANIMATION_IMPORT_STATIC");
    expect(all.json.error).toMatch(/^Idle:/);

    const win = await cliJson("b.bvh", "--onto", "rig.glb", "--out", "win.glb", "--window", "0.5,1.5", "--fps", "20");
    expect(win.json.clips[0].duration).toBeCloseTo(1, 3);
    expect(win.json.clips[0].frames).toBe(21);
    const loop = await cliJson("b.bvh", "--onto", "rig.glb", "--out", "loop.glb", "--loop");
    expect(loop.json.clips[0].duration).toBeLessThan(2);

    const dry = await cliJson("b.bvh", "--onto", "rig.glb", "--out", "dry.glb", "--dry-run");
    expect(dry.code).toBe(0);
    expect(dry.json).toMatchObject({ ok: true, dryRun: true, written: false });
    expect(existsSync(join(dir, "dry.glb"))).toBe(false);
  });

  it("importClipsOntoRig returns { clips: {name, duration, channels}[], output, skin }", async () => {
    writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
    writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, WALK));
    const r = await importClipsOntoRig({ projectDir: dir, onto: "rig.glb", output: "out/hero.glb", clips: [{ file: "walk.bvh", name: "Walk" }] });
    expect(r.output).toBe(join(dir, "out/hero.glb"));
    expect(r.clips[0]).toMatchObject({ name: "Walk", channels: HUMANOID.length + 1 });
    expect(r.clips[0]!.duration).toBeCloseTo(1, 3);
    expect(r.skin?.ok).toBe(true);
  });
});

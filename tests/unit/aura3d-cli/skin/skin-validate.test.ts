import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  analyzeSkin, SKIN_BIND_MISMATCH, SKIN_FLAP, SKIN_STRETCH, SKIN_WEIGHT_SUM
} from "../../../../packages/aura3d-cli/src/skin/analysis";
import { checkAssetSkin, checkProjectSkins, readSkinAllowlist, runRepairSkin, SKIN_ALLOW_FILE } from "../../../../packages/aura3d-cli/src/skin/command";
import { parseGlb } from "../../../../packages/aura3d-cli/src/skin/gltf";
import { rebuildLimbs, RebuildLimbsUnsupported } from "../../../../packages/aura3d-cli/src/skin/rebuildLimbs";
import { repairSkin } from "../../../../packages/aura3d-cli/src/skin/repair";
import { buildRiggedGlb, buildStaticGlb } from "./rigged-fixture";

const root = resolve(__dirname, "../../../..");
const tmp = mkdtempSync(join(tmpdir(), "aura3d-skin-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const glb = (opts?: Parameters<typeof buildRiggedGlb>[0]) => parseGlb(buildRiggedGlb(opts));
const codes = (r: ReturnType<typeof analyzeSkin>) => r.findings.map((f) => `${f.severity}:${f.code}`);

describe("assets validate --skin: analysis", () => {
  it("passes a clean rigged mesh and reports per-material stretch", () => {
    const report = analyzeSkin(glb());
    expect(report.skinned).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.materials["kit-skin"]?.maxStretch).toBeLessThan(1.6);
    expect(report.jointRanges?.Run?.kneeForwardFrames).toBe(0);
  });

  it("fails a bridging triangle between the thighs with SKIN_STRETCH and names the material", () => {
    const report = analyzeSkin(glb({ bridge: true }));
    expect(report.ok).toBe(false);
    expect(report.reasonCodes).toContain(SKIN_STRETCH);
    expect(report.materials["kit-skin"]?.maxStretch).toBeGreaterThan(2.5);
    expect(report.materials["kit-skin"]?.trianglesOverLimit).toBeGreaterThanOrEqual(1);
    expect(report.failures.join("\n")).toMatch(/SKIN_STRETCH/);
  });

  it("fails a long thin flap with SKIN_FLAP", () => {
    const report = analyzeSkin(glb({ flap: true }));
    expect(report.reasonCodes).toContain(SKIN_FLAP);
    expect(report.ok).toBe(false);
  });

  it("flags weights that do not sum to one as SKIN_WEIGHT_SUM", () => {
    const report = analyzeSkin(glb({ badWeightSum: true }));
    expect(codes(report)).toContain(`error:${SKIN_WEIGHT_SUM}`);
  });

  it("reports a mesh that is not in its skeleton's pose as a bind mismatch (warning by default, error with strict)", () => {
    const soft = analyzeSkin(glb({ offsetLeftLeg: true }));
    expect(soft.bindMismatch.map((b) => b.bone)).toContain("LeftUpperLeg");
    expect(codes(soft)).toContain(`warning:${SKIN_BIND_MISMATCH}`);
    expect(soft.ok).toBe(true);
    const strict = analyzeSkin(glb({ offsetLeftLeg: true }), { strict: true });
    expect(codes(strict)).toContain(`error:${SKIN_BIND_MISMATCH}`);
    expect(strict.ok).toBe(false);
  });

  it("is not applicable to a mesh without a skin", () => {
    const report = analyzeSkin(parseGlb(buildStaticGlb()));
    expect(report.skinned).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("only poses the clips you name", () => {
    const report = analyzeSkin(glb({ bridge: true }), { clips: ["NoSuchClip"] });
    expect(report.clips).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("assets repair-skin", () => {
  it("normalize fixes bad weight sums", () => {
    const { glb: fixed, report } = repairSkin(glb({ badWeightSum: true }), { normalize: true });
    expect(report.before.reasonCodes).toContain(SKIN_WEIGHT_SUM);
    expect(report.after.reasonCodes).not.toContain(SKIN_WEIGHT_SUM);
    expect(analyzeSkin(fixed).ok).toBe(true);
  });

  it("smooth-bridges softens a stretched bridge and cut-stretch removes what still stretches", () => {
    const bad = glb({ bridge: true });
    const smooth = repairSkin(bad, { smoothBridges: true });
    expect(smooth.report.primitives[0]?.smoothedVertices).toBeGreaterThan(0);
    expect(analyzeSkin(smooth.glb).skinned).toBe(true);
    const cut = repairSkin(bad, { cutStretch: 1.6 });
    expect(cut.report.primitives[0]?.removedTriangles).toBeGreaterThanOrEqual(1);
    expect(cut.report.after.ok).toBe(true);
  });

  it("with no step selected changes nothing and says so", () => {
    const { report } = repairSkin(glb({ bridge: true }), {});
    expect(report.steps).toEqual([]);
    expect(report.guidance.join(" ")).toMatch(/No repair step selected/);
  });

  it("rebuild-limbs refuses a rig that is not a recognised humanoid, with guidance", () => {
    expect(() => rebuildLimbs(glb({ rename: true }))).toThrow(RebuildLimbsUnsupported);
    expect(() => rebuildLimbs(glb({ rename: true }))).toThrow(/Not a recognised humanoid/);
  });

  it("rebuild-limbs on a recognised humanoid needs a skin material and says how to name it", () => {
    expect(() => rebuildLimbs(glb({}), { materials: { skin: /nothing-matches/ } })).toThrow(/pass --material-map/);
  });

  it("the CLI helper writes a file and reports the result", () => {
    const dir = mkdtempSync(join(tmp, "repair-"));
    writeFileSync(join(dir, "bad.glb"), buildRiggedGlb({ bridge: true }));
    const result = runRepairSkin(dir, "bad.glb", { cutStretch: 1.6, out: "fixed.glb" });
    expect(result.ok).toBe(true);
    expect(existsSync(join(dir, "fixed.glb"))).toBe(true);
    expect(analyzeSkin(parseGlb(readFileSync(join(dir, "fixed.glb")))).ok).toBe(true);
  });
});

describe("aura.skin-allow.json", () => {
  it("requires a reason for every entry", () => {
    const dir = mkdtempSync(join(tmp, "allow-"));
    writeFileSync(join(dir, SKIN_ALLOW_FILE), JSON.stringify({ hero: { allow: ["SKIN_STRETCH"] } }));
    expect(() => readSkinAllowlist(dir)).toThrow(/needs a reason/);
  });

  it("turns an allowed finding into a pass that carries the reason", () => {
    const dir = mkdtempSync(join(tmp, "allow-ok-"));
    writeFileSync(join(dir, "bad.glb"), buildRiggedGlb({ bridge: true }));
    const unallowed = checkAssetSkin("hero", join(dir, "bad.glb"), {}, {});
    expect(unallowed.ok).toBe(false);
    writeFileSync(join(dir, SKIN_ALLOW_FILE), JSON.stringify({ hero: { allow: ["SKIN_STRETCH", "SKIN_FLAP"], reason: "known crotch bridge, tracked as F11" } }));
    const allowed = checkAssetSkin("hero", join(dir, "bad.glb"), {}, readSkinAllowlist(dir));
    expect(allowed.ok).toBe(true);
    expect(allowed.allowReason).toMatch(/F11/);
    const project = checkProjectSkins(dir, { file: "bad.glb" });
    expect(project.ok).toBe(false); // id is the file stem "bad", not "hero"
  });
});

// The Aura FC athletes are the regression: the rebuilt ones ship, the pre-rebuild one tore at the hips.
function shippedGlb(slug: string): string | null {
  const text = readFileSync(resolve(root, "apps/showcase-aura-fc-3d/src/aura-assets-v2.ts"), "utf8");
  const match = new RegExp(`${slug}[\\s\\S]{0,260}?url: "(/aura-assets/[^"]+\\.glb)"`).exec(text);
  const file = match ? resolve(root, "public", match[1]!.replace(/^\//, "")) : null;
  return file && existsSync(file) && readFileSync(file).subarray(0, 4).toString() === "glTF" ? file : null;
}
const prerebuild = resolve(root, "tests/fixtures/skin/fc-striker-prerebuild.glb");
const prerebuildReal = existsSync(prerebuild) && readFileSync(prerebuild).subarray(0, 4).toString() === "glTF";

describe("Aura FC athlete regression", () => {
  for (const slug of ["fcSoccerStrikerMeshy", "fcGoalkeeperMeshy"]) {
    const file = shippedGlb(slug);
    it.skipIf(!file)(`the shipped ${slug} passes the skin check`, () => {
      const report = analyzeSkin(parseGlb(readFileSync(file!)), { samples: 8 });
      expect(report.failures).toEqual([]);
      expect(report.ok).toBe(true);
    });
  }

  it.skipIf(!prerebuildReal)("the pre-rebuild striker (git history, skin and shorts meshes) fails with SKIN_STRETCH and SKIN_FLAP", () => {
    const report = analyzeSkin(parseGlb(readFileSync(prerebuild)), { samples: 8 });
    expect(report.ok).toBe(false);
    expect(report.reasonCodes).toEqual(expect.arrayContaining([SKIN_STRETCH, SKIN_FLAP]));
    expect(report.materials["fcSoccerStrikerMeshyAthlete-skin"]!.maxStretch).toBeGreaterThan(4);
  });

  it.skipIf(!prerebuildReal)("repair-skin --rebuild-limbs turns the pre-rebuild striker into one that passes", () => {
    const dir = mkdtempSync(join(tmp, "fc-"));
    const result = runRepairSkin(dir, prerebuild, { rebuildLimbs: true, cutStretch: 1.6, materialMap: { skin: /skin/i, shorts: /shorts/i, socks: /socks/i, boots: /dark/i }, out: join(dir, "fixed.glb") });
    expect(result.ok).toBe(true);
    expect(analyzeSkin(parseGlb(readFileSync(join(dir, "fixed.glb"))), { samples: 8 }).ok).toBe(true);
    expect(readdirSync(dir)).toContain("fixed.glb");
  });
});

void mkdirSync;

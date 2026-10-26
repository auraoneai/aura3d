import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeSkin } from "../../../../packages/aura3d-cli/src/skin/analysis";
import { runRepairSkin } from "../../../../packages/aura3d-cli/src/skin/command";
import { buildHierarchy, forward, loadSkins, localPose, parseGlb, skinnedPositions } from "../../../../packages/aura3d-cli/src/skin/gltf";
import { refitSkeleton } from "../../../../packages/aura3d-cli/src/skin/refitSkeleton";
import { buildRiggedGlb } from "./rigged-fixture";

const tmp = mkdtempSync(join(tmpdir(), "aura3d-refit-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const glb = (opts?: Parameters<typeof buildRiggedGlb>[0]) => parseGlb(buildRiggedGlb(opts));

function restError(g: ReturnType<typeof glb>): number {
  const h = buildHierarchy(g);
  const skin = loadSkins(g, h)[0]!;
  const world = forward(localPose(g, null, 0, h), h);
  let max = 0;
  for (const prim of skin.primitives) {
    const out = skinnedPositions(skin, prim, world);
    out.forEach((p, i) => { for (let k = 0; k < 3; k += 1) max = Math.max(max, Math.abs(p[k]! - prim.pos[i]![k]!)); });
  }
  return max;
}

describe("repair-skin --refit-skeleton", () => {
  it("moves the joints onto a mesh modelled in another pose without moving the mesh", () => {
    const source = glb({ offsetLeftLeg: true });
    const before = analyzeSkin(source);
    expect(before.bindMismatch.length).toBeGreaterThan(0);
    const { glb: fitted, report } = refitSkeleton(source);
    expect(restError(fitted)).toBeLessThan(1e-4);
    const names = report.moved.map((m) => m.joint);
    expect(names).toContain("LeftLowerLeg");
    const left = report.moved.find((m) => m.joint === "LeftLowerLeg")!;
    expect(left.offset).toBeGreaterThan(0.2);
    const after = analyzeSkin(fitted);
    expect(after.bindMismatch.length).toBe(0);
  });

  it("re-targets the clips about the corrected joints and keeps the shipped clip names", () => {
    const { glb: fitted, report } = refitSkeleton(glb({ offsetLeftLeg: true }));
    expect(report.clips).toBe(1);
    expect(fitted.json.animations?.map((a) => a.name)).toEqual(["Run"]);
    const clip = analyzeSkin(fitted).materials["kit-skin"];
    expect(clip?.maxStretch).toBeLessThan(1.6);
  });

  it("leaves an already matching rig alone (joints stay where the mesh bends)", () => {
    const { glb: fitted } = refitSkeleton(glb());
    expect(restError(fitted)).toBeLessThan(1e-4);
    expect(analyzeSkin(fitted).ok).toBe(true);
  });

  it("runs from the CLI helper with --keep-clips and writes a file that passes the bind check", () => {
    const file = join(tmp, "legs.glb");
    writeFileSync(file, buildRiggedGlb({ offsetLeftLeg: true }));
    const result = runRepairSkin(tmp, "legs.glb", { out: "legs.fixed.glb", refitSkeleton: true, keepClips: ["Run"], normalize: true });
    expect(result.ok).toBe(true);
    const out = parseGlb(readFileSync(join(tmp, "legs.fixed.glb")));
    expect(analyzeSkin(out).bindMismatch.length).toBe(0);
    const missing = runRepairSkin(tmp, "legs.glb", { keepClips: ["Nope"] });
    expect(missing.ok).toBe(false);
    expect(missing.messages[0]).toContain("Nope");
  });
});

const shipped: Array<[string, string[]]> = [
  ["bunkerGuardMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["bunkerGunnerMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["bunkerWardenMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["bunkerHoundMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["gullsiegeHeroGullMeshy", ["Load", "Ready", "Idle_Loop", "Jump_Loop"]],
  ["gullsiegeRaiderBossMeshy", ["Idle_Loop", "Contest"]]
];
describe("shipped rigs repaired with --refit-skeleton (Bunker Zero and Slingshot Siege)", () => {
  const root = resolve(__dirname, "../../../..");
  const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8")) as { assets: Array<{ id: string; outputPath: string }> };
  it.each(shipped)("%s passes the skin check through the clips its game plays", (id, clips) => {
    const entry = manifest.assets.find((a) => a.id === id)!;
    const g = parseGlb(readFileSync(join(root, entry.outputPath)));
    expect(g.json.animations?.map((a) => a.name).sort()).toEqual([...clips].sort());
    const report = analyzeSkin(g);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

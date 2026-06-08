import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  gradeCastGlb,
  resolveLocalGlb,
  combineFidelity
} from "../../../packages/create-aura3d/templates/animation-studio/scripts/resolve-asset";
import {
  SET_TEMPLATES,
  getSetTemplate
} from "../../../packages/create-aura3d/templates/animation-studio/src/set-templates";
import { gradeRig, inferHumanoidRig } from "../../../packages/animation/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "../../../packages/create-aura3d/templates/animation-studio");
const ASSET_DIR = resolve(TEMPLATE_ROOT, "public/aura-assets");
const CAST_FILES = ["miko.catalog.glb", "luma2.catalog.glb"];

/** Read the skin joint node names out of a .glb (for the engine-side rig grade). */
function jointNames(buf: Buffer): string[] {
  const jlen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jlen).toString("utf8")) as Record<string, any>;
  const skin = json.skins?.[0];
  return (skin?.joints ?? []).map((j: number) => String(json.nodes?.[j]?.name ?? ""));
}

/**
 * Phase M1 — Character fidelity. The DEFAULT cast emitted by build-characters.ts must be a
 * genuinely better, properly-rigged humanoid (graded-A on BOTH the engine retargeter's rig grade
 * and the resolver's rig+mesh grade), NOT the legacy 7-node mascot. These tests pin that contract
 * so the default cast can't silently regress to a stub rig.
 */
describe("M1 — default cast is a graded-A rigged humanoid (not an 8-bone mascot)", () => {
  for (const file of CAST_FILES) {
    it(`${file}: engine rig grade is A with full limb chains`, () => {
      const path = resolve(ASSET_DIR, file);
      expect(existsSync(path), `${file} should exist — run scripts/build-characters.ts`).toBe(true);
      const buf = readFileSync(path);
      const names = jointNames(buf);
      // A full humanoid chain — well above the legacy 7-node mascot.
      expect(names.length).toBeGreaterThanOrEqual(20);
      const report = gradeRig(inferHumanoidRig(names, { id: file }));
      expect(report.grade).toBe("A");
      expect(report.hasLegs).toBe(true);
      expect(report.hasFeet).toBe(true);
      // The full limb chain the legacy 7-node mascot lacked (forearm/lowerArm, hand, lower leg,
      // foot, toes). Names are canonical Mixamo/VRM-style so both graders recognise them.
      const lower = names.map((n) => n.toLowerCase()).join(",");
      expect(lower).toMatch(/lowerarm|forearm/);
      expect(lower).toContain("hand");
      expect(lower).toMatch(/lowerleg|shin|calf/);
      expect(lower).toContain("foot");
      expect(lower).toContain("toes");
    });

    it(`${file}: resolver rig+mesh fidelity is A (high poly + materials + clips)`, () => {
      const buf = readFileSync(resolve(ASSET_DIR, file));
      const g = gradeCastGlb(buf);
      expect(g.rigGrade).toBe("A");
      expect(g.meshGrade).toBe("A");
      expect(g.fidelity).toBe("A");
      expect(g.jointCount).toBeGreaterThanOrEqual(20);
      expect(g.humanoid).toBe(true);
      // Meaningfully higher mesh resolution than a previz blob.
      expect(g.tris).toBeGreaterThanOrEqual(8_000);
      expect(g.validMaterials).toBeGreaterThanOrEqual(3);
      // Real acting clips incl. a Talk loop for dialogue scenes, + a mouth morph for lip-sync.
      expect(g.clips).toEqual(expect.arrayContaining(["Idle", "Wave", "Walk", "Talk"]));
      expect(g.hasMouthMorph).toBe(true);
    });
  }

  it("combineFidelity takes the worse of rig + mesh", () => {
    expect(combineFidelity("A", "A")).toBe("A");
    expect(combineFidelity("A", "C")).toBe("C");
    expect(combineFidelity("B", "A")).toBe("B");
    expect(combineFidelity("D", "A")).toBe("D");
  });
});

/**
 * Phase M1 — public/cast-library manifest with provenance. The default cast ships a manifest that
 * records its CC0 provenance + fidelity, honestly stating these are authored (not downloaded)
 * assets. Every member's hash + grade must match the GLB on disk.
 */
describe("M1 — cast-library manifest provenance", () => {
  const manifestPath = resolve(TEMPLATE_ROOT, "public/cast-library/cast-library.json");

  it("exists and is in sync with the GLBs on disk", () => {
    expect(existsSync(manifestPath), "run scripts/build-cast-library.ts").toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as any;
    expect(manifest.schema).toBe("aura3d.cast-library/1.0");
    expect(Array.isArray(manifest.members)).toBe(true);
    expect(manifest.members.length).toBeGreaterThanOrEqual(2);
    for (const m of manifest.members) {
      // Honest provenance: CC0 + authored origin (NOT a fabricated external download).
      expect(m.provenance.license).toBe("CC0-1.0");
      expect(m.provenance.origin).toBe("authored-procedural");
      expect(m.fidelity).toBe("A");
      // The recorded grade must match a fresh grade of the actual bytes.
      const file = m.url.replace("/aura-assets/", "");
      const buf = readFileSync(resolve(ASSET_DIR, file));
      const g = gradeCastGlb(buf);
      expect(m.rigGrade).toBe(g.rigGrade);
      expect(m.meshGrade).toBe(g.meshGrade);
      expect(m.tris).toBe(g.tris);
    }
  });
});

/**
 * Phase M1 — user-upload path. `cast add --file <path.glb>` resolves a LOCAL rigged GLB, bypassing
 * the catalog, and grades + (optionally) render-probes it. We exercise the grading path against the
 * authored cast GLB (skipping the browser render probe), and confirm a non-rigged / missing file is
 * rejected honestly.
 */
describe("M1 — user-uploaded GLB path (resolveLocalGlb)", () => {
  afterAll(() => {
    // resolveLocalGlb copies the accepted GLB into public/aura-assets under the id — clean up the
    // test's copies so they don't pollute the repo working tree.
    for (const f of ["uploadtest.catalog.glb", "uploadtest.probe.glb"]) {
      rmSync(resolve(ASSET_DIR, f), { force: true });
    }
    rmSync(resolve(TEMPLATE_ROOT, "dist/scene/uploadtest.resolver-report.json"), { force: true });
  });

  it("accepts a local rigged GLB and grades it A (no catalog, no network)", async () => {
    const local = resolve(ASSET_DIR, "miko.catalog.glb");
    const resolved = await resolveLocalGlb(local, "uploadtest", { requireDialogue: false, skipRenderProbe: true });
    expect(resolved.id).toBe("uploadtest");
    expect(resolved.url).toBe("/aura-assets/uploadtest.catalog.glb");
    expect(resolved.fidelity).toBe("A");
    expect(resolved.rigGrade).toBe("A");
    expect(resolved.meshGrade).toBe("A");
    expect(resolved.license).toBe("user-provided");
    expect(resolved.attribution.toLowerCase()).toContain("upload");
    // A copy must land in the served public dir under the id's catalog name.
    expect(existsSync(resolve(ASSET_DIR, "uploadtest.catalog.glb"))).toBe(true);
  });

  it("rejects a missing upload honestly", async () => {
    await expect(
      resolveLocalGlb(resolve(ASSET_DIR, "does-not-exist.glb"), "nope", { skipRenderProbe: true })
    ).rejects.toThrow(/not found/i);
  });
});

/**
 * Phase M4 — set/environment quality. Every set template must read as a composed place, not a gray
 * plane + a single sphere: a wrapping skybox/cyclorama, a layered ground, and several scenery
 * pieces. These tests pin that each template ships those, with a horizon that reads at scale.
 */
describe("M4 — set templates are composed environments (skybox + layered ground + scenery)", () => {
  for (const template of SET_TEMPLATES) {
    it(`${template.id}: has a sky/backdrop, a base ground, and ≥4 pieces`, () => {
      const ids = template.set.pieces.map((p) => p.id);
      // A wrapping sky/backdrop (dome, cyclorama, starfield, or sky band).
      expect(ids.some((id) => /sky|cyc|starfield|horizon|backdrop/i.test(id))).toBe(true);
      // A wide auto-framed ground plate so scale/horizon read correctly.
      const ground = template.set.pieces.find((p) => p.includeInAutoFrame);
      expect(ground, `${template.id} needs an auto-framed ground`).toBeTruthy();
      expect(Math.max(...[...ground!.scale])).toBeGreaterThanOrEqual(60);
      // Real composition, not "plane + one sphere".
      expect(template.set.pieces.length).toBeGreaterThanOrEqual(4);
      // A real 3-point light rig.
      expect(template.set.lights.length).toBeGreaterThanOrEqual(3);
    });
  }

  it("a huge emissive sky dome/cyclorama wraps the stage (scale ≥ 24)", () => {
    for (const template of SET_TEMPLATES) {
      const sky = template.set.pieces.find((p) => /sky|cyc|starfield/i.test(p.id) && p.geometry === "sphere");
      expect(sky, `${template.id} sky should be a large sphere dome/cyc`).toBeTruthy();
      expect(Math.max(...[...sky!.scale])).toBeGreaterThanOrEqual(24);
      expect((sky!.emissiveStrength ?? 0)).toBeGreaterThan(0);
    }
  });

  it("getSetTemplate still resolves each id", () => {
    for (const t of SET_TEMPLATES) expect(getSetTemplate(t.id)?.id).toBe(t.id);
  });
});

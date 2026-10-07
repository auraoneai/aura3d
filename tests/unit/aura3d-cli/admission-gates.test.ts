import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  gateG1TriangleBand,
  gateG3PbrCompleteness,
  gateG4CardBan,
  gateG5ProgrammerArt,
  gateG8Tangents,
  gateG11Derived,
  runAdmissionGates,
  type AdmissionEntryContext,
  type AdmissionModel,
  type GateG5Result,
} from "../../../packages/aura3d-cli/src/admission/gates.js";
import { readAssetManifest } from "../../../packages/aura3d-cli/src/asset-manifest.js";
import { admissionModelFromGltf, readAdmissionGltf } from "../../../packages/aura3d-cli/src/admission/glb.js";
import { isBuilderGenerator, isBuilderScriptPath } from "../../../packages/aura3d-cli/src/admission/builder-patterns.js";
import { profileForRole } from "../../../packages/aura3d-cli/src/admission/profiles.js";
import { admitAsset } from "../../../packages/aura3d-cli/src/commands/prd05/admit.js";

const root = process.cwd();

function modelFor(repoPath: string): AdmissionModel {
  return admissionModelFromGltf(readAdmissionGltf(join(root, repoPath)).json);
}

function checkByGate(model: AdmissionModel, entry: AdmissionEntryContext, gate: string) {
  const check = runAdmissionGates(model, entry).find((candidate) => candidate.gate === gate);
  if (!check) throw new Error(`gate ${gate} not produced`);
  return check;
}

describe("PRD-05 §6.4 admission gates on real repo GLBs", () => {
  test("rooftopBackboard (12-tri board) fails G1", () => {
    const model = modelFor("public/aura-assets/rooftopBackboard.d2d48af6.glb");
    expect(model.totalTriangles).toBeLessThanOrEqual(12);
    expect(checkByGate(model, { id: "rooftopBackboard", role: "prop" }, "G1").verdict).toBe("fail");
  });

  test("skylineArcticRunnerHero (card silhouette) fails G4", () => {
    const model = modelFor("public/aura-assets/skylineArcticRunnerHero.84024fc9.glb");
    expect(checkByGate(model, { id: "skylineArcticRunnerHero", role: "character" }, "G4").verdict).toBe("fail");
  });

  test("mechChassisA (builder synth + no UVs) fails G5", () => {
    const model = modelFor("public/aura-assets/mechChassisA.069e6c29.glb");
    const check = checkByGate(model, { id: "mechChassisA", role: "character" }, "G5") as GateG5Result;
    expect(check.verdict).toBe("fail");
    expect(check.builderProvenance).toBe(true);
  });

  test("vaultBreakersTable fails G3 and G5", () => {
    const model = modelFor("public/aura-assets/vaultBreakersTable.36cf7099.glb");
    const checks = runAdmissionGates(model, { id: "vaultBreakersTable", role: "prop" });
    expect(checks.find((check) => check.gate === "G3")?.verdict).toBe("fail");
    expect(checks.find((check) => check.gate === "G5")?.verdict).toBe("fail");
  });

  test("damaged-helmet (Khronos PBR sample) passes G1/G3/G4/G5 as product", () => {
    const model = modelFor("fixtures/asset-corpus/damaged-helmet.glb");
    const entry: AdmissionEntryContext = { id: "damagedHelmet", role: "product" };
    for (const gate of ["G1", "G3", "G4", "G5"] as const) {
      expect(checkByGate(model, entry, gate).verdict).toBe("pass");
    }
    // It is normal-mapped without TANGENT — G8 fails, as the optimize step must fix.
    expect(checkByGate(model, entry, "G8").verdict).toBe("fail");
  });
});

describe("admission gate units", () => {
  const solid: AdmissionModel = {
    generator: "hand-built",
    primitives: [
      { triangleCount: 5000, materialIndex: 0, hasTexcoord0: true, hasTangent: true },
    ],
    materials: [
      { name: "rock", hasBaseColorTexture: true, hasNormalTexture: true, hasMetallicRoughnessTexture: true, hasOcclusionTexture: false, factorOnly: false, unlit: false },
    ],
    skinned: false,
    totalTriangles: 5000,
    boundsSize: [4, 2, 2],
  };

  test("G1 waived-by-role when the role maps to no profile", () => {
    const check = gateG1TriangleBand(solid, profileForRole("proxy", solid.boundsSize));
    expect(check.verdict).toBe("waived-by-role");
    // backdrop keeps a real band (floor 4, ceiling 2k) — it is not waived.
    const backdrop = gateG1TriangleBand(solid, profileForRole("backdrop", solid.boundsSize));
    expect(backdrop.verdict).toBe("fail");
  });

  test("G3 fails when PBR area coverage is under 90%", () => {
    const model: AdmissionModel = {
      ...solid,
      materials: [{ ...solid.materials[0]!, hasNormalTexture: false }],
      primitives: [solid.primitives[0]!],
    };
    const check = gateG3PbrCompleteness(model, "prop", profileForRole("prop", model.boundsSize));
    expect(check.verdict).toBe("fail");
  });

  test("G4 fails card-like ≤12-tri LOD0 and thinness < 0.02", () => {
    const card: AdmissionModel = {
      generator: "card",
      primitives: [{ triangleCount: 12, materialIndex: 0, hasTexcoord0: true, hasTangent: false }],
      materials: [{ name: "mat", hasBaseColorTexture: true, hasNormalTexture: false, hasMetallicRoughnessTexture: false, hasOcclusionTexture: false, factorOnly: false, unlit: false }],
      skinned: false,
      totalTriangles: 12,
      boundsSize: [4, 4, 0.001],
    };
    expect(gateG4CardBan(card, "prop").verdict).toBe("fail");
    // exempt roles never fail G4
    expect(gateG4CardBan(card, "backdrop").verdict).toBe("waived-by-role");
  });

  test("G4 fails unlit-heavy models", () => {
    const unlitModel: AdmissionModel = {
      generator: "flat",
      primitives: [{ triangleCount: 2000, materialIndex: 0, hasTexcoord0: true, hasTangent: false }],
      materials: [{ name: "mat", hasBaseColorTexture: false, hasNormalTexture: false, hasMetallicRoughnessTexture: false, hasOcclusionTexture: false, factorOnly: false, unlit: true }],
      skinned: false,
      totalTriangles: 2000,
      boundsSize: [4, 4, 4],
    };
    expect(gateG4CardBan(unlitModel, "prop").verdict).toBe("fail");
  });

  test("G5 factor-only fails without stylized-flat approval, passes with it", () => {
    const factor: AdmissionModel = {
      generator: "hand",
      primitives: [{ triangleCount: 2000, materialIndex: 0, hasTexcoord0: true, hasTangent: false }],
      materials: [{ name: "mat", hasBaseColorTexture: false, hasNormalTexture: false, hasMetallicRoughnessTexture: false, hasOcclusionTexture: false, factorOnly: true, unlit: false }],
      skinned: false,
      totalTriangles: 2000,
      boundsSize: [4, 4, 4],
    };
    expect(gateG5ProgrammerArt(factor, { id: "x" }).verdict).toBe("fail");
    expect(gateG5ProgrammerArt(factor, { id: "x", stylizedFlatApproved: true }).verdict).toBe("pass");
  });

  test("G8 requires TANGENT on normal-mapped primitives", () => {
    const missing: AdmissionModel = {
      ...solid,
      primitives: [{ triangleCount: 5000, materialIndex: 0, hasTexcoord0: true, hasTangent: false }],
    };
    expect(gateG8Tangents(missing).verdict).toBe("fail");
    expect(gateG8Tangents(solid).verdict).toBe("pass");
  });

  test("G11 requires a derived record", () => {
    expect(gateG11Derived({ id: "x", derivedPresent: true }).verdict).toBe("pass");
    expect(gateG11Derived({ id: "x" }).verdict).toBe("fail");
  });
});

describe("builder pattern coverage", () => {
  test("every builder-named script under apps/*/scripts is detected", () => {
    const files = execFileSync("git", ["ls-files", "apps/*/scripts/*"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const builderNamed = files.filter((file) => /(?:build|blender-build|build-review|register)-[^/]*\.(?:mjs|ts|py)$/i.test(file));
    expect(builderNamed.length).toBeGreaterThan(50);
    for (const file of builderNamed) {
      expect(isBuilderScriptPath(file), file).toBe(true);
    }
    // Non-builder scripts are not flagged.
    expect(isBuilderScriptPath("apps/showcase-x/scripts/render-frames.mjs")).toBe(false);
  });

  test("known generator strings are detected", () => {
    expect(isBuilderGenerator("Aura3D Mech Hangar modular family synth (original CC0)")).toBe(true);
    expect(isBuilderGenerator("Aura3D Skyline deterministic alpha-hero builder")).toBe(true);
    expect(isBuilderGenerator("Deep Recovery procedural GLB synth")).toBe(true);
    expect(isBuilderGenerator("Khronos Blender glTF 2.0 exporter")).toBe(false);
  });
});

describe("assets admit (C-39 verb)", () => {
  test("rejects release for a failing asset and records the admission", () => {
    const projectDir = join(tmpdir(), `aura3d-admit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
    cpSync(join(root, "public/aura-assets/rooftopBackboard.d2d48af6.glb"), join(projectDir, "public/aura-assets/board.glb"));
    writeFileSync(join(projectDir, "aura.assets.json"), JSON.stringify({
      schema: "aura3d.assets/1.0",
      assetBasePath: "public/aura-assets",
      typegen: "src/aura-assets.ts",
      generatedAt: "test",
      assets: [{
        id: "board",
        name: "board",
        type: "model",
        format: "glb",
        url: "/aura-assets/board.glb",
        hash: "sha256-test",
        source: "public/aura-assets/board.glb",
        outputPath: "public/aura-assets/board.glb",
        quality: "candidate",
        role: "prop",
        bounds: [4, 2, 0.5],
        triangles: 12,
        materials: [],
        textures: [],
        animations: [],
        provenance: { sourcePath: "public/aura-assets/board.glb", license: "CC0-1.0", checkedAt: "test" }
      }]
    }));

    const rejected = admitAsset({ projectDir, assetId: "board", quality: "release" });
    expect(rejected.ok).toBe(false);
    expect(rejected.checks.some((check) => check.gate === "G1" && check.verdict === "fail")).toBe(true);
    const after = readAssetManifest(projectDir).assets[0];
    expect(after?.admission?.status).toBe("rejected");
    expect(after?.quality).toBe("candidate"); // unchanged

    const admitted = admitAsset({ projectDir, assetId: "board", quality: "candidate" });
    expect(admitted.ok).toBe(true);
    const afterCandidate = readAssetManifest(projectDir).assets[0];
    expect(afterCandidate?.admission?.status).toBe("admitted");
  });
});

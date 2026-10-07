import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  gateG10ArtDirection,
  gateG2TexelDensity,
  gateG6TextureSanity,
  gateG7Budget,
  gateG9LookDev,
  runAdmissionGates,
  type AdmissionEntryContext,
  type AdmissionMeasured,
  type AdmissionModel,
} from "../../../packages/aura3d-cli/src/admission/gates.js";
import { admissionModelFromGltf, readAdmissionGltf } from "../../../packages/aura3d-cli/src/admission/glb.js";
import { measureTexelDensity } from "../../../packages/aura3d-cli/src/admission/texel.js";
import { measureTextureSanity } from "../../../packages/aura3d-cli/src/admission/textureStats.js";
import { profileForRole } from "../../../packages/aura3d-cli/src/admission/profiles.js";
import { validateRouteAssets } from "../../../packages/aura3d-cli/src/admission/routeGates.js";

const root = process.cwd();

function glb(repoPath: string) {
  return readAdmissionGltf(join(root, repoPath));
}

function checkByGate(model: AdmissionModel, entry: AdmissionEntryContext, measured: AdmissionMeasured, gate: string) {
  const check = runAdmissionGates(model, entry, measured).find((candidate) => candidate.gate === gate);
  if (!check) throw new Error(`gate ${gate} not produced`);
  return check;
}

describe("PRD-05 §6.4 G2 — texel density on real GLBs", () => {
  test("damaged-helmet measures p10/p50/p90 texels/px at the product camera", () => {
    const { json, bin } = glb("fixtures/asset-corpus/damaged-helmet.glb");
    const model = admissionModelFromGltf(json);
    const profile = profileForRole("product", model.boundsSize)!;
    expect(model.boundsSize).toBeDefined();
    const diag = Math.hypot(...(model.boundsSize ?? [1, 1, 1]));
    const camera = profile.gameplayCamera!;
    const report = measureTexelDensity(json, bin, {
      distance: 1.5 * diag || camera.distance,
      fovDegrees: camera.fovDegrees,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    expect(report.trianglesMeasured).toBeGreaterThan(0);
    expect(report.p50).toBeGreaterThan(0);
    expect(report.textureSize?.[0]).toBeGreaterThan(0);
    const check = gateG2TexelDensity(model, profile, { texelDensity: report });
    expect(["pass", "fail"]).toContain(check.verdict);
    expect(check.message).toContain("G2:");
  });

  test("untextured board reports zero measured triangles and fails G2", () => {
    const { json, bin } = glb("public/aura-assets/rooftopBackboard.d2d48af6.glb");
    const model = admissionModelFromGltf(json);
    const profile = profileForRole("prop", model.boundsSize)!;
    const report = measureTexelDensity(json, bin, { distance: 3, fovDegrees: 50, viewportWidth: 1920, viewportHeight: 1080 });
    const check = gateG2TexelDensity(model, profile, { texelDensity: report });
    expect(check.verdict).toBe("fail");
  });

  test("G2 fails when the measurement was never taken", () => {
    const { json } = glb("fixtures/asset-corpus/damaged-helmet.glb");
    const model = admissionModelFromGltf(json);
    const profile = profileForRole("product", model.boundsSize)!;
    expect(gateG2TexelDensity(model, profile, {}).verdict).toBe("fail");
  });
});

describe("PRD-05 §6.4 G6 — texture sanity (256² proxies)", () => {
  test("damaged-helmet textures decode: normal + ORM + baseColor slots measured", async () => {
    const { json, bin } = glb("fixtures/asset-corpus/damaged-helmet.glb");
    const report = await measureTextureSanity(json, bin, join(root, "fixtures/asset-corpus"), root);
    expect(report.available).toBe(true);
    expect(report.textures.length).toBeGreaterThanOrEqual(3);
    const normal = report.textures.find((t) => t.slot === "normal");
    expect(normal?.normalLength?.inUnitRange).toBeGreaterThan(0.9);
    const model = admissionModelFromGltf(json);
    const check = gateG6TextureSanity(profileForRole("product", model.boundsSize), { textureSanity: report });
    expect(["pass", "fail"]).toContain(check.verdict);
  }, 60_000);

  test("G6 fails when the measurement is absent, not silently passed", () => {
    expect(gateG6TextureSanity(profileForRole("product"), {}).verdict).toBe("fail");
    expect(gateG6TextureSanity(profileForRole("product"), {
      textureSanity: { available: false, unavailableReason: "sharp missing", textures: [] },
    }).verdict).toBe("fail");
  });

  test("constant ORM channels flag 'replace with factor'", () => {
    const report: AdmissionMeasured["textureSanity"] = {
      available: true,
      textures: [{
        slot: "metallicRoughness",
        materialIndex: 0,
        width: 256,
        height: 256,
        powerOfTwo: true,
        constantChannels: ["R", "G", "B"],
        channels: [
          { mean: 255, stdDev: 0 },
          { mean: 20, stdDev: 0 },
          { mean: 200, stdDev: 0 },
        ],
      }],
    };
    const check = gateG6TextureSanity(profileForRole("prop"), { textureSanity: report });
    expect(check.verdict).toBe("pass");
    expect((check.measured as { flags: string[] }).flags.join(" ")).toContain("replace texture with factor");
  });
});

describe("PRD-05 §6.4 G7 — §17.2 budgets", () => {
  test("over-budget fails; under passes; unmeasured fails", () => {
    const profile = profileForRole("prop", [0.4, 0.4, 0.4])!;
    expect(profile.id).toBe("prop-small");
    expect(gateG7Budget(profile, { derivedFileBytes: 100_000 }).verdict).toBe("pass");
    expect(gateG7Budget(profile, { derivedFileBytes: 2_000_000 }).verdict).toBe("fail");
    expect(gateG7Budget(profile, {}).verdict).toBe("fail");
    expect(gateG7Budget(profile, { derivedFileBytes: 100_000, gpuBytesHigh: 9_000_000 }).verdict).toBe("fail");
  });
});

describe("PRD-05 §6.4 G9 — look-dev record", () => {
  const entry: AdmissionEntryContext = { id: "hero1", role: "hero", derivedPresent: true };
  const profile = profileForRole("hero")!;
  const scored = (score: number, verdict: "accept" | "reject" = "accept", axes?: Record<string, number>) => ({
    reviewer: "vision", verdict, notes: "", at: "t",
    judge: { kind: "vision-model" as const, id: "review-vision", model: "claude-opus-5.5" },
    score, axes,
  });

  test("no record fails; un-scored reviews fail", () => {
    expect(gateG9LookDev(entry, profile, {}).verdict).toBe("fail");
    expect(gateG9LookDev(entry, profile, { lookDev: { reviews: [{ reviewer: "x", verdict: "accept", notes: "", at: "t" }] } }).verdict).toBe("fail");
  });

  test("hero role needs a named human review even with a high score", () => {
    const check = gateG9LookDev(entry, profile, {
      lookDev: { reviews: [scored(8.5)] },
    });
    expect(check.verdict).toBe("fail");
    expect(check.message).toContain("human");
    const withHuman = gateG9LookDev(entry, profile, {
      lookDev: { reviews: [scored(8.5), { reviewer: "gurbaksh", verdict: "accept", notes: "", at: "t", judge: { kind: "human", id: "gurbaksh" } }] },
    });
    expect(withHuman.verdict).toBe("pass");
  });

  test("mean < 6.5 and any axis < 4 fail; Aura gap > 1.5 marks rendererIssue", () => {
    const low = gateG9LookDev({ id: "x", role: "prop" }, profileForRole("prop", [2, 2, 2]), {
      lookDev: { reviews: [scored(5.0)] },
    });
    expect(low.verdict).toBe("fail");
    const lowAxis = gateG9LookDev({ id: "x", role: "prop" }, profileForRole("prop", [2, 2, 2]), {
      lookDev: { reviews: [scored(7.5, "accept", { silhouette: 3.5 })] },
    });
    expect(lowAxis.verdict).toBe("fail");
    const gap = gateG9LookDev({ id: "x", role: "prop" }, profileForRole("prop", [2, 2, 2]), {
      lookDev: { reviews: [scored(8.0)] },
      auraScore: 6.0,
    });
    expect(gap.verdict).toBe("pass");
    expect((gap as { rendererIssue?: boolean }).rendererIssue).toBe(true);
  });
});

describe("PRD-05 §6.4 G10 — art direction", () => {
  test("missing artDirection id fails; missing doc fails; doc passes", () => {
    const model: AdmissionModel = {
      primitives: [{ triangleCount: 2000, materialIndex: 0, hasTexcoord0: true, hasTangent: true }],
      materials: [],
      skinned: false,
      totalTriangles: 2000,
    };
    expect(gateG10ArtDirection(model, { id: "x" }, {}).verdict).toBe("fail");
    expect(gateG10ArtDirection(model, { id: "x", artDirection: "nope" }, {}).verdict).toBe("fail");
    const ok = gateG10ArtDirection(model, { id: "x", artDirection: "aurora-real" }, {
      artDirectionDoc: { id: "aurora-real", shading: "pbr-metallic-roughness" },
    });
    expect(ok.verdict).toBe("pass");
    // stylized-flat without approval fails; missing UVs fails even when approved.
    const flat = gateG10ArtDirection(model, { id: "x", artDirection: "flat", stylizedFlatApproved: false }, {
      artDirectionDoc: { id: "flat", shading: "stylized-flat" },
    });
    expect(flat.verdict).toBe("fail");
    const noUv: AdmissionModel = { ...model, primitives: [{ triangleCount: 2000, materialIndex: 0, hasTexcoord0: false, hasTangent: false }] };
    expect(gateG10ArtDirection(noUv, { id: "x", artDirection: "flat", stylizedFlatApproved: true }, {
      artDirectionDoc: { id: "flat", shading: "stylized-flat" },
    }).verdict).toBe("fail");
  });
});

describe("PRD-05 §6.4 route admission — validate --release --route", () => {
  function makeProject(): { projectDir: string } {
    const projectDir = join(tmpdir(), `aura3d-route-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
    mkdirSync(join(projectDir, "apps", "demo", "src"), { recursive: true });
    cpSync(join(root, "public/aura-assets/rooftopBackboard.d2d48af6.glb"), join(projectDir, "public/aura-assets/board.glb"));
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
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
        provenance: { sourcePath: "public/aura-assets/board.glb", license: "CC0-1.0", checkedAt: "test" },
      }],
    }));
    writeFileSync(join(projectDir, "apps", "demo", "src", "main.ts"), `
import { model } from "@aura3d/engine";
import { assets } from "../aura-assets";
export function spawn() {
  model(assets.board);
}
`);
    return { projectDir };
  }

  test("release route fails on below-release quality + gate failures; proxy role fails", async () => {
    const { projectDir } = makeProject();
    const report = await validateRouteAssets({ projectDir, route: "apps/demo", release: true, repoRoot: root });
    expect(report.ok).toBe(false);
    expect(report.assets.map((a) => a.assetId)).toEqual(["board"]);
    expect(report.failures.join("\n")).toContain('quality "candidate" is below release');
    expect(report.assets[0]?.checks.some((c) => c.verdict === "fail")).toBe(true);
  }, 90_000);

  test("non-release route reports gate table without failing on quality", async () => {
    const { projectDir } = makeProject();
    const report = await validateRouteAssets({ projectDir, route: "apps/demo", release: false, repoRoot: root });
    expect(report.failures.join("\n")).not.toContain("below release");
  }, 90_000);
});

describe("PRD-05 broken controls — broken assets must fail release admission", () => {
  test.each([
    "public/aura-assets/skylineArcticRunnerHero.84024fc9.glb",
    "public/aura-assets/siegeGolfBall.a9526ad8.glb",
  ])("%s produces at least one gate failure", (repoPath) => {
    const { json } = glb(repoPath);
    const model = admissionModelFromGltf(json);
    const checks = runAdmissionGates(model, { id: "control", role: "character", derivedPresent: false });
    expect(checks.some((c) => c.verdict === "fail")).toBe(true);
  });
});

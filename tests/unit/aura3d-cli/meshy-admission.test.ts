import { describe, expect, test } from "vitest";
import type { AssetInspectionReport } from "../../../packages/aura3d-cli/src/asset-inspection-types.js";
import { createMeshyAdmissionReport, inferMeshyAssetProfile } from "../../../packages/aura3d-cli/src/meshy/admission.js";
import type { AssetGeometryFacts } from "../../../packages/aura3d-cli/src/asset-role-admission.js";

describe("Meshy asset-profile admission", () => {
  test("maps Aura roles to the four Meshy profiles", () => {
    expect(inferMeshyAssetProfile("prop")).toBe("prop");
    expect(inferMeshyAssetProfile("environment")).toBe("environment");
    expect(inferMeshyAssetProfile("vehicle")).toBe("vehicle");
    expect(inferMeshyAssetProfile("character")).toBe("humanoid");
  });

  test.each([
    ["prop", "collision-plan"],
    ["environment", "environment-plan"],
    ["vehicle", "vehicle-parts"],
    ["humanoid", "humanoid-structure"]
  ] as const)("emits %s-specific admission UX", (profile, checkId) => {
    const report = createMeshyAdmissionReport({ profile, inspection: inspection(), geometry: geometry() });
    expect(report.candidateQuality).toBe(true);
    expect(report.checks.map((check) => check.id)).toContain(checkId);
    expect(report.nextActions.join(" ").toLowerCase()).toContain(profile === "prop" ? "collision" : profile);
  });

  test("enforces bounded triangle, texture-count, texture-dimension, and bounds checks", () => {
    const report = createMeshyAdmissionReport({
      profile: "prop",
      inspection: inspection({ bounds: [10_000, 1, 1], textures: Array.from({ length: 9 }, (_, index) => "texture-" + index) }),
      geometry: geometry({ triangles: 100_001, bounds: [10_000, 1, 1] }),
      textureDimensions: [{ label: "albedo", width: 8_192, height: 8_192 }]
    });
    expect(report.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("bounds-degeneracy"),
      expect.stringContaining("triangle-budget"),
      expect.stringContaining("texture-count"),
      expect.stringContaining("texture-dimensions")
    ]));
    expect(report.routeReady).toBe(false);
  });

  test("does not claim missing measurements are passes", () => {
    const report = createMeshyAdmissionReport({ profile: "humanoid", inspection: inspection({ bounds: undefined }), geometry: geometry({ triangles: 0, bounds: [0, 0, 0] }) });
    expect(report.unproven).toEqual(expect.arrayContaining([
      expect.stringContaining("bounds"),
      expect.stringContaining("triangle-budget"),
      expect.stringContaining("skin-skeleton"),
      expect.stringContaining("rendered-candidate-evidence")
    ]));
  });
});

function inspection(overrides: Partial<AssetInspectionReport> = {}): AssetInspectionReport {
  return {
    ok: true,
    schema: "aura3d.asset-inspection/1.0",
    file: "model.glb",
    format: "glb",
    sizeBytes: 1_024,
    bounds: [1, 1, 1],
    materials: ["material"],
    materialMetadata: [{ name: "material", visible: true, readable: true, opacity: 1, reasons: [] }],
    animations: [],
    animation: { clipCount: 0, clips: [], messages: [] },
    humanoid: { humanoid: false, status: "unknown", confidence: "low", skinCount: 0, jointCount: 0, matchedBones: [], missingBones: [], messages: ["Humanoid structure is unknown."] },
    skeleton: { skinCount: 0, jointCount: 0, skins: [], messages: [] },
    morphTargets: { targetCount: 0, targetNames: [], meshes: [], messages: [] },
    textures: ["albedo"],
    orientation: { source: "unknown", messages: [] },
    dependencies: [],
    warnings: [],
    messages: [],
    ...overrides
  };
}

function geometry(overrides: Partial<AssetGeometryFacts> = {}): AssetGeometryFacts {
  return { partCount: 1, triangles: 10_000, bounds: [1, 1, 1], materialCount: 1, textureCount: 1, ...overrides };
}

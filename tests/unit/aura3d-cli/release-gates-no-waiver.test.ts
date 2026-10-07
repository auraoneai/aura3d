import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addAsset, validateAssets } from "../../../packages/aura3d-cli/src";

/**
 * PRD-05 Phase 0 gate honesty: the `requiresTextureEvidence`
 * suitabilityReason-regex waiver and the hash-bound flat-color material
 * evidence waiver are deleted. A `vehicle` with no textures and a
 * "stylized flat-color" suitability rationale must now fail release —
 * `suitabilityReason` prose can no longer waive texture requirements.
 */
describe("release gates without waiver paths", () => {
  test("vehicle with no textures and stylized flat-color rationale fails release", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "car.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "paint" }],
      meshes: [{ name: "Body", primitives: [{}] }],
      nodes: [{ name: "Root", mesh: 0 }],
      accessors: [{ min: [-2, 0, -1], max: [2, 1.5, 1] }]
      // no `images` — the asset is genuinely untextured
    }));

    addAsset({
      projectDir,
      file: "assets/car.gltf",
      name: "stylizedCar",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/car",
      quality: "release",
      role: "vehicle",
      // The exact waiver phrasing the deleted `requiresTextureEvidence` regex
      // used to exempt from texture evidence:
      suitabilityReason: "Original CC0 stylized flat-color primary vehicle"
    });

    const report = validateAssets({ projectDir, release: true });
    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("release primary model has no texture references");
    expect(report.warnings.join("\n")).toContain("role-aware release vehicle validation requires texture evidence");
  });

  test("untextured product also fails release without a stylized-flat artDirection", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "mug.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "ceramic" }],
      meshes: [{ name: "Mug", primitives: [{}] }],
      nodes: [{ name: "Root", mesh: 0 }],
      accessors: [{ min: [-0.2, 0, -0.2], max: [0.2, 0.25, 0.2] }]
    }));

    addAsset({
      projectDir,
      file: "assets/mug.gltf",
      name: "flatMug",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/mug",
      quality: "release",
      role: "product",
      suitabilityReason: "Flat-color product, readable named materials"
    });

    const report = validateAssets({ projectDir, release: true });
    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("release primary model has no texture references");
  });
});

function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-cli-waiver-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addAsset, inspectAsset, readAssetManifest } from "../../../packages/aura3d-cli/src";

/**
 * Regression coverage for CLI asset bounds.
 *
 * The previous implementation unioned the raw min/max of *every* accessor in
 * mesh-local space. That mixed in non-POSITION accessors and ignored node
 * transforms, so for any GLB with transformed meshes the recorded bounds did not
 * describe the asset. Framing and sizing (`camera.frameAsset`, `targetHeight`,
 * `targetLength`, `targetMaxDimension`) all read these bounds, so a wrong value
 * silently mis-sizes or clips models.
 */
describe("CLI asset scene bounds", () => {
  it("records scene-space bounds that respect node translation and scale", () => {
    const projectDir = createProject();
    // One unit cube centred on the origin, placed by a node that scales it 2x on X
    // and translates it +10 on X. Correct scene-space bounds are therefore
    // x in [9, 11], y in [-0.5, 0.5], z in [-0.5, 0.5].
    writeFileSync(join(projectDir, "assets", "shifted.gltf"), JSON.stringify(shiftedCubeGltf()));
    addAsset({ projectDir, file: "assets/shifted.gltf", name: "shiftedCube" });

    const manifest = readAssetManifest(projectDir);
    const entry = manifest.assets.find((asset) => asset.id === "shiftedCube");
    expect(entry).toBeDefined();
    const bounds = entry?.boundsMetadata;
    expect(bounds).toBeDefined();

    expect(bounds?.min?.[0]).toBeCloseTo(9, 3);
    expect(bounds?.max?.[0]).toBeCloseTo(11, 3);
    expect(bounds?.min?.[1]).toBeCloseTo(-0.5, 3);
    expect(bounds?.max?.[1]).toBeCloseTo(0.5, 3);
    expect(bounds?.size?.[0]).toBeCloseTo(2, 3);
    expect(bounds?.size?.[1]).toBeCloseTo(1, 3);
    // Centre must reflect the translation, not the mesh-local origin. The old
    // algorithm reported a centre at the origin for this asset.
    expect(bounds?.center?.[0]).toBeCloseTo(10, 3);
  });

  it("ignores non-POSITION accessor ranges when computing bounds", () => {
    const projectDir = createProject();
    // The normal accessor's range is [-1, 1] on every axis and the UV accessor's is
    // [0, 1]. Neither describes geometry extent. The mesh itself is a unit cube at
    // the origin, so bounds must be [-0.5, 0.5] on every axis.
    writeFileSync(join(projectDir, "assets", "attrs.gltf"), JSON.stringify(unitCubeWithExtraAttributesGltf()));
    addAsset({ projectDir, file: "assets/attrs.gltf", name: "attrCube" });

    const bounds = readAssetManifest(projectDir).assets.find((asset) => asset.id === "attrCube")?.boundsMetadata;
    expect(bounds?.size?.[0]).toBeCloseTo(1, 3);
    expect(bounds?.size?.[1]).toBeCloseTo(1, 3);
    expect(bounds?.size?.[2]).toBeCloseTo(1, 3);
  });

  it("reports the same bounds through inspectAsset", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "shifted.gltf"), JSON.stringify(shiftedCubeGltf()));
    addAsset({ projectDir, file: "assets/shifted.gltf", name: "shiftedCube" });
    const inspection = inspectAsset({ projectDir, file: "assets/shifted.gltf" });
    expect(inspection.boundsMetadata?.size?.[0]).toBeCloseTo(2, 3);
    expect(inspection.boundsMetadata?.center?.[0]).toBeCloseTo(10, 3);
  });
});

function createProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-bounds-"));
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  mkdirSync(join(projectDir, "src"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "bounds-fixture", version: "0.0.0" }));
  return projectDir;
}

function shiftedCubeGltf(): unknown {
  return {
    asset: { version: "2.0", extras: { license: "CC0-1.0", source: "unit-test" } },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "shifted", mesh: 0, translation: [10, 0, 0], scale: [2, 1, 1] }],
    meshes: [{ name: "cube", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 },
      { buffer: 0, byteOffset: 96, byteLength: 6 }
    ],
    buffers: [{ byteLength: 102 }],
    materials: [{ name: "cube-material", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }]
  };
}

function unitCubeWithExtraAttributesGltf(): unknown {
  return {
    asset: { version: "2.0", extras: { license: "CC0-1.0", source: "unit-test" } },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "cube", mesh: 0 }],
    meshes: [{ name: "cube", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 } }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 8, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] },
      { bufferView: 2, componentType: 5126, count: 8, type: "VEC2", min: [0, 0], max: [1, 1] }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 },
      { buffer: 0, byteOffset: 96, byteLength: 96 },
      { buffer: 0, byteOffset: 192, byteLength: 64 }
    ],
    buffers: [{ byteLength: 256 }],
    materials: [{ name: "cube-material", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }]
  };
}

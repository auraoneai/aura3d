import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLTFLoader,
  LoadContext,
  createBlenderExportValidationReport,
  createAssetCompatibilityReport,
  normalizeAssetImportSettings,
  type BlenderExportFixtureInput,
  type BlenderExportFixtureManifest,
  type BlenderExportValidationReport,
  type GLTFCorpusManifest
} from "../../packages/assets/src";

const manifestPath = resolve("tests/assets/corpus/gltf-corpus.manifest.json");
const blenderExportManifestPath = resolve("tests/assets/corpus/blender/blender-export-fixtures.manifest.json");
const reportPath = resolve("tests/reports/asset-compatibility-threejs.json");
const blenderExportReportPath = resolve("tests/reports/blender-export-validation.json");
const blenderFixtureRoots = [
  resolve("tests/assets/blender"),
  resolve("tests/assets/fixtures/blender"),
  resolve("tests/assets/corpus/blender")
];

describe("asset compatibility diagnostics", () => {
  it("emits a corpus compatibility report with honest external-loader status", async () => {
    const manifest = readManifest();
    const blenderExportValidation = await runBlenderExportValidation();
    const report = createAssetCompatibilityReport(manifest, {
      generatedAt: "2026-05-06T00:00:00.000Z",
      blenderExportFixturesPresent: blenderFixtureRoots.some((path) => existsSync(path)),
      blenderExportValidation
    });

    expect(report.schemaVersion).toBe("asset-compatibility-report");
    expect(report.fixtureStatus.blenderExportFixtures).toBe("present");
    expect(report.summary.assetCount).toBe(77);
    // These are manifest classifications, not 77 loader executions.
    expect(report.summary.aura3d).toEqual({ pass: 70, warn: 7, "expected-fail": 0, "not-run": 0 });
    expect(report.summary.threejs).toEqual({ pass: 0, warn: 0, "expected-fail": 0, "not-run": 77 });
    expect(report.summary.babylonjs).toEqual({ pass: 0, warn: 0, "expected-fail": 0, "not-run": 77 });
    expect(report.blenderExportValidation?.summary).toMatchObject({ fixtureCount: 3, pass: 3, warn: 0, fail: 0 });
    expect(report.blenderExportValidation?.fixtures.every((fixture) => /Blender/i.test(fixture.generator))).toBe(true);
    expect(report.blenderExportValidation?.fixtures.every((fixture) => fixture.metrics.meshes > 0 && fixture.metrics.renderables > 0)).toBe(true);
    expect(report.assets.every((asset) => asset.loaders.some((loader) => loader.loader === "threejs" && loader.status === "not-run"))).toBe(true);
    expect(report.assets.every((asset) => asset.loaders.some((loader) => loader.loader === "babylonjs" && loader.status === "not-run"))).toBe(true);
    expect(report.assets.flatMap((asset) => asset.loaders.flatMap((loader) => loader.diagnostics)).every((diagnostic) => diagnostic.nextAction.length > 0)).toBe(true);

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(blenderExportReportPath, `${JSON.stringify(blenderExportValidation, null, 2)}\n`);
  }, 120_000);

  it("incorporates supplied external-loader results by asset and loader", () => {
    const report = createAssetCompatibilityReport(readManifest(), {
      generatedAt: "2026-05-06T00:00:00.000Z",
      externalLoaderResults: [{
        assetId: "box",
        loader: "threejs",
        status: "warn",
        diagnostics: [{
          code: "TEST_SYNTHETIC_EXTERNAL_RESULT",
          severity: "warning",
          message: "Synthetic input for report indexing; no external loader ran.",
          nextAction: "Supply separately measured evidence for a real compatibility report."
        }]
      }]
    });
    expect(report.summary.threejs).toEqual({ pass: 0, warn: 1, "expected-fail": 0, "not-run": 76 });
    expect(report.summary.babylonjs["not-run"]).toBe(77);
    expect(report.assets.find((asset) => asset.id === "box")?.loaders.find((loader) => loader.loader === "threejs"))
      .toMatchObject({ status: "warn", diagnostics: [{ code: "TEST_SYNTHETIC_EXTERNAL_RESULT" }] });
    expect(report.assets.find((asset) => asset.id === "box-textured")?.loaders.find((loader) => loader.loader === "threejs")?.status)
      .toBe("not-run");
  });

  it("keeps per-asset import settings normalized and actionable for loader decisions", () => {
    const manifest = readManifest();
    const report = createAssetCompatibilityReport(manifest, { generatedAt: "2026-05-06T00:00:00.000Z" });
    const textured = report.assets.find((asset) => asset.id === "box-textured");
    const defaults = normalizeAssetImportSettings();

    expect(textured?.importSettings).toEqual({
      ...defaults,
      colorSpace: "srgb",
      normals: "preserve"
    });
    expect(report.assets.find((asset) => asset.id === "meshopt-cube-test")?.importSettings.compression).toBe("prefer-source");
  });

  it("round-trips a loaded glTF asset through scene creation and serialized asset metadata", async () => {
    const asset = await new GLTFLoader().load({ url: triangleGLTF() }, new LoadContext());
    const scene = asset.createScene();
    const serialized = asset.toJSON();

    expect(asset.meshes).toHaveLength(1);
    expect(asset.scenes).toEqual([{ name: "RoundTripScene", nodeIndices: [0] }]);
    expect(scene.findByName("TriangleNode")).toHaveLength(1);
    expect(scene.collectRenderables()).toHaveLength(1);
    expect(serialized).toMatchObject({
      url: expect.stringContaining("data:model/gltf+json"),
      defaultScene: 0,
      scenes: [{ name: "RoundTripScene", nodeIndices: [0] }],
      meshes: [{
        name: "TriangleMesh",
        geometry: {
          vertexCount: 3,
          indexCount: 0,
          bounds: { min: [0, 0, 0], max: [1, 1, 0] }
        }
      }]
    });
  });

  it("loads skins with a real skinning palette instead of falling back to bind pose", async () => {
    // 65 joints used to exceed the loader's renderable limit and lose its palette
    // entirely, leaving the mesh frozen in bind pose. Skins are now renderable well
    // beyond the uniform-array limit because the palette can travel as a data texture,
    // so this skin must arrive with a usable palette.
    const asset = await new GLTFLoader().load({ url: overLimitSkinGLTF() }, new LoadContext());
    const renderable = asset.createScene().collectRenderables()[0]?.renderable;

    expect(asset.skins[0]?.joints).toHaveLength(65);
    expect(asset.loaderDiagnostics.features).not.toContain("skinning-palette-limit-fallback");
    expect(renderable).toBeDefined();
    expect(renderable?.skinning).toBeDefined();
    expect(renderable?.skinning?.jointCount).toBe(65);
    expect(renderable?.skinning?.matrices).toHaveLength(65 * 16);
  });

  it("keeps Blender-export validation blocked when no fixtures exist", () => {
    const report = createAssetCompatibilityReport(readManifest(), {
      generatedAt: "2026-05-06T00:00:00.000Z",
      blenderExportFixturesPresent: false
    });

    expect(report.fixtureStatus.blenderExportFixtures).toBe("missing");
    expect(report.summary.blenderExport).toEqual({ pass: 0, warn: 0, "expected-fail": 0, "not-run": 77 });
    expect(report.assets[0]?.loaders.find((loader) => loader.loader === "blender-export")?.diagnostics[0]).toMatchObject({
      code: "ASSET_BLENDER_EXPORT_FIXTURES_MISSING",
      nextAction: expect.stringContaining("fixtures")
    });
  });

  it("indexes supplied same-corpus Blender results", () => {
    const manifest = readManifest();
    const report = createAssetCompatibilityReport(manifest, {
      generatedAt: "2026-05-06T00:00:00.000Z",
      blenderExportFixturesPresent: true,
      blenderExportResults: manifest.assets.map((asset) => ({
        assetId: asset.id,
        loader: "blender-export" as const,
        status: asset.expectedStatus === "warn" ? "warn" as const : "pass" as const,
        diagnostics: [{
          code: "TEST_SYNTHETIC_BLENDER_RESULT",
          severity: asset.expectedStatus === "warn" ? "warning" as const : "info" as const,
          message: "Synthetic input for report indexing; no Blender export ran.",
          nextAction: "Supply separately measured evidence for a real compatibility report."
        }]
      }))
    });

    expect(report.summary.blenderExport["not-run"]).toBe(0);
    expect(report.summary.blenderExport["expected-fail"]).toBe(0);
    expect(report.assets).toHaveLength(77);
    expect(report.assets.every((asset) => asset.loaders.find((loader) => loader.loader === "blender-export")?.status !== "not-run")).toBe(true);
  });
});

function readManifest(): GLTFCorpusManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as GLTFCorpusManifest;
}

async function runBlenderExportValidation(): Promise<BlenderExportValidationReport> {
  const manifest = JSON.parse(readFileSync(blenderExportManifestPath, "utf8")) as BlenderExportFixtureManifest;
  const fixtureInputs: BlenderExportFixtureInput[] = manifest.fixtures.map((fixture) => {
    const sourceText = readFileSync(resolve(fixture.path), "utf8");
    const actualSha256 = createHash("sha256").update(sourceText).digest("hex");
    expect(actualSha256).toBe(fixture.sourceSha256);
    return { ...fixture, sourceText };
  });
  return createBlenderExportValidationReport(manifest, fixtureInputs, "2026-05-06T00:00:00.000Z");
}

function triangleGLTF(): string {
  const positions = Buffer.alloc(36);
  new Float32Array(positions.buffer, positions.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${positions.toString("base64")}`, byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "TriangleMesh", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "TriangleNode", mesh: 0 }],
    scenes: [{ name: "RoundTripScene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function overLimitSkinGLTF(): string {
  const positions = Buffer.alloc(36);
  new Float32Array(positions.buffer, positions.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const joints = Buffer.alloc(24);
  new Uint16Array(joints.buffer, joints.byteOffset, 12).set([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
  const weights = Buffer.alloc(48);
  new Float32Array(weights.buffer, weights.byteOffset, 12).set([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const inverseBindMatrices = Buffer.alloc(65 * 16 * 4);
  const inverseBindFloats = new Float32Array(inverseBindMatrices.buffer, inverseBindMatrices.byteOffset, 65 * 16);
  for (let joint = 0; joint < 65; joint += 1) {
    inverseBindFloats.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], joint * 16);
  }
  const buffer = Buffer.concat([positions, joints, weights, inverseBindMatrices]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: joints.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + joints.byteLength, byteLength: weights.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + joints.byteLength + weights.byteLength, byteLength: inverseBindMatrices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 65, type: "MAT4" }
    ],
    meshes: [{ name: "OverLimitMesh", primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    nodes: [
      { name: "MeshNode", mesh: 0, skin: 0 },
      ...Array.from({ length: 65 }, (_, index) => ({ name: `Joint${index}` }))
    ],
    skins: [{ name: "OverLimitSkin", joints: Array.from({ length: 65 }, (_, index) => index + 1), inverseBindMatrices: 3 }],
    scenes: [{ name: "Scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

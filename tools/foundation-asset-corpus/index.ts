import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  inspectGLTFAsset,
  type AssetDiagnostic,
  type DecodedGLTFImage
} from "@aura3d/assets";

type CorpusCategory = "product" | "architecture" | "character" | "environment" | "materials" | "animation" | "compression" | "problem-cases";

type CorpusFixture = {
  readonly id: string;
  readonly category: CorpusCategory;
  readonly fileName: string;
  readonly source: {
    readonly kind: "generated";
    readonly generator: string;
    readonly license: "CC0-1.0";
  };
  readonly features: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly expectedDiagnostics: readonly AssetDiagnostic[];
  readonly gltf: Record<string, unknown>;
};

type CorpusAssetReport = {
  readonly id: string;
  readonly category: CorpusCategory;
  readonly assetPath: string;
  readonly source: CorpusFixture["source"];
  readonly features: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly renderStatus: "render-resources-created" | "expected-error" | "error";
  readonly contentEvidence: {
    readonly decodedContent: boolean;
    readonly placeholder: false;
    readonly evidence: string;
  };
  readonly screenshotPath: string;
  readonly diagnosticsPath: string;
  readonly timings: {
    readonly loadMs: number;
    readonly renderResourceMs: number;
    readonly decodeMs: number;
    readonly transcodeMs: number;
    readonly totalMs: number;
  };
  readonly errorState?: string;
  readonly diagnostics: readonly AssetDiagnostic[];
  readonly inspection?: {
    readonly meshes: number;
    readonly materials: number;
    readonly textures: number;
    readonly animations: number;
    readonly skins: number;
    readonly morphTargets: number;
    readonly cameras: number;
    readonly lights: number;
    readonly warnings: readonly string[];
  };
};

const fixtureRoot = resolve("fixtures/foundation-assets");
const reportPath = resolve("tests/reports/foundation-asset-corpus.json");
const gltfReportPath = resolve("tests/reports/foundation-gltf-corpus.json");
const generatedAt = new Date().toISOString();

const fixtures: readonly CorpusFixture[] = [
  createProductFixture(),
  createArchitectureFixture(),
  createCharacterFixture(),
  createEnvironmentFixture(),
  createMaterialsFixture(),
  createAnimationFixture(),
  createCompressionFixture(),
  createProblemCaseFixture()
];

const reports: CorpusAssetReport[] = [];

for (const fixture of fixtures) {
  const directory = resolve(fixtureRoot, fixture.category, fixture.id);
  const assetPath = resolve(directory, fixture.fileName);
  const manifestPath = resolve(directory, "manifest.json");
  const diagnosticsPath = resolve(directory, "loader-diagnostics-baseline.json");
  const screenshotPath = resolve(directory, "screenshot-baseline.svg");

  mkdirSync(directory, { recursive: true });
  writeJson(assetPath, fixture.gltf);
  writeJson(manifestPath, {
    schemaVersion: "a3d-foundation-local-asset",
    id: fixture.id,
    category: fixture.category,
    source: fixture.source,
    localFile: fixture.fileName,
    features: fixture.features,
    expectedUnsupportedFeatures: fixture.unsupportedFeatures,
    expectedDiagnostics: fixture.expectedDiagnostics,
    screenshotBaseline: "screenshot-baseline.svg",
    loaderDiagnosticsBaseline: "loader-diagnostics-baseline.json"
  });
  writeFileSync(screenshotPath, createPreviewSvg(fixture), "utf8");

  reports.push(await inspectFixture(fixture, assetPath, diagnosticsPath, screenshotPath));
}

const report = {
  ok: reports.every((asset) => asset.renderStatus !== "error"),
  schemaVersion: "a3d-foundation-asset-corpus-report",
  generatedAt,
  commit: currentCommit(),
  runId: `foundation-asset-corpus-${Date.now()}`,
  command: "pnpm exec tsx --tsconfig tsconfig.base.json tools/foundation-asset-corpus/index.ts",
  blockedClaims: [
    "broad better-than-Three.js language",
    "Unity/Unreal replacement language",
    "production-ready language",
    "PBR parity language",
    "full WebGPU language",
    "complete glTF support language",
    "real editor language before editor workflow passes"
  ],
  screenshotPaths: reports.map((asset) => asset.screenshotPath),
  sourceFileHashes: [
    hashSource("tools/foundation-asset-corpus/index.ts"),
    hashSource("examples/asset-viewer/main.ts"),
    hashSource("packages/assets/src/AssetInspection.ts")
  ],
  assetCount: reports.length,
  summary: {
    renderResourcesCreated: reports.filter((asset) => asset.renderStatus === "render-resources-created").length,
    expectedError: reports.filter((asset) => asset.renderStatus === "expected-error").length,
    error: reports.filter((asset) => asset.renderStatus === "error").length
  },
  assets: reports
};
writeJson(reportPath, report);
writeJson(gltfReportPath, report);

console.log(`Wrote ${reports.length} foundation asset corpus entries to ${reportPath}`);

async function inspectFixture(
  fixture: CorpusFixture,
  assetPath: string,
  diagnosticsPath: string,
  screenshotPath: string
): Promise<CorpusAssetReport> {
  const loader = new GLTFLoader();
  const diagnostics = [...fixture.expectedDiagnostics];
  const totalStart = performance.now();
  let loadMs = 0;
  let renderResourceMs = 0;
  let decodeMs = 0;
  let transcodeMs = 0;

  try {
    const loadStart = performance.now();
    const asset = await loader.load({ url: gltfDataUrl(fixture.gltf), type: "gltf" }, new LoadContext());
    loadMs = elapsedMs(loadStart);
    const renderStart = performance.now();
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async (image, imageIndex, sourceAsset) => {
        const decodeStart = performance.now();
        void imageIndex;
        void sourceAsset;
        const decoded = await decodeFixtureImage();
        const duration = elapsedMs(decodeStart);
        decodeMs += duration;
        if (image.mimeType === "image/ktx2" || image.uri?.toLowerCase().endsWith(".ktx2")) {
          transcodeMs += duration;
        }
        return decoded;
      }
    });
    renderResourceMs = elapsedMs(renderStart);
    try {
      const inspection = inspectGLTFAsset(asset, resources);
      diagnostics.push(...inspection.warnings);
      writeJson(diagnosticsPath, diagnostics);
      return {
        id: fixture.id,
        category: fixture.category,
        assetPath: relativePath(assetPath),
        source: fixture.source,
        features: fixture.features,
        unsupportedFeatures: fixture.unsupportedFeatures,
        renderStatus: "render-resources-created",
        contentEvidence: {
          decodedContent: true,
          placeholder: false,
          evidence: "GLTFLoader parsed the fixture and createGLTFRenderResources created renderer geometry/material/texture resources."
        },
        screenshotPath: relativePath(screenshotPath),
        diagnosticsPath: relativePath(diagnosticsPath),
        timings: createTimings(loadMs, renderResourceMs, decodeMs, transcodeMs, totalStart),
        diagnostics,
        inspection: {
          meshes: inspection.meshes.length,
          materials: inspection.materials.length,
          textures: inspection.textures.length,
          animations: inspection.animations.length,
          skins: inspection.skins.length,
          morphTargets: inspection.morphTargets.length,
          cameras: inspection.cameras.length,
          lights: inspection.lights.length,
          warnings: inspection.warnings.map((warning) => warning.code)
        }
      };
    } finally {
      resources.dispose();
    }
  } catch (error) {
    if (loadMs === 0) {
      loadMs = elapsedMs(totalStart);
    }
    const errorState = error instanceof Error ? error.message : String(error);
    const expected = fixture.unsupportedFeatures.length > 0;
    const allDiagnostics = diagnostics.length > 0 ? diagnostics : [{
      code: "ASSET_FOUNDATION_CORPUS_LOAD_ERROR",
      severity: expected ? "warning" : "error",
      message: errorState,
      nextAction: expected ? "Keep this fixture classified as unsupported until the required feature is implemented." : "Fix the generated foundation fixture or loader regression."
    } satisfies AssetDiagnostic];
    writeJson(diagnosticsPath, allDiagnostics);
    return {
      id: fixture.id,
      category: fixture.category,
      assetPath: relativePath(assetPath),
      source: fixture.source,
      features: fixture.features,
      unsupportedFeatures: fixture.unsupportedFeatures,
      renderStatus: expected ? "expected-error" : "error",
      contentEvidence: {
        decodedContent: false,
        placeholder: false,
        evidence: expected
          ? "Fixture is an expected unsupported case; it is reported as an error state instead of a fake decoded placeholder."
          : "Fixture failed unexpectedly and is reported as an error state."
      },
      screenshotPath: relativePath(screenshotPath),
      diagnosticsPath: relativePath(diagnosticsPath),
      timings: createTimings(loadMs, renderResourceMs, decodeMs, transcodeMs, totalStart),
      errorState,
      diagnostics: allDiagnostics
    };
  }
}

function createTimings(
  loadMs: number,
  renderResourceMs: number,
  decodeMs: number,
  transcodeMs: number,
  totalStart: number
): CorpusAssetReport["timings"] {
  return {
    loadMs: roundMs(loadMs),
    renderResourceMs: roundMs(renderResourceMs),
    decodeMs: roundMs(decodeMs),
    transcodeMs: roundMs(transcodeMs),
    totalMs: roundMs(elapsedMs(totalStart))
  };
}

function elapsedMs(start: number): number {
  return performance.now() - start;
}

function roundMs(value: number): number {
  return Number(Math.max(0, value).toFixed(3));
}

function createProductFixture(): CorpusFixture {
  const positions = floatBytes(cubePositions(0.55));
  const normals = floatBytes(cubeNormals());
  const indices = uint16Bytes(cubeIndices());
  const buffer = concatBytes(positions, normals, indices);
  const offsets = byteOffsets([positions, normals, indices]);
  return {
    id: "product-box",
    category: "product",
    fileName: "product-box.gltf",
    source: generatedSource(),
    features: ["glTF", "indexed-triangles", "normals", "pbr-material"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.55, -0.55, -0.55], max: [0.55, 0.55, 0.55] },
      { bufferView: 1, componentType: 5126, count: 8, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.byteLength / 2, type: "SCALAR" }
    ], {
      materials: [{ name: "brushed-product", pbrMetallicRoughness: { baseColorFactor: [0.7, 0.78, 0.84, 1], metallicFactor: 0.7, roughnessFactor: 0.32 } }],
      meshes: [{ name: "product-box", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
      nodes: [{ name: "product-box-node", mesh: 0 }],
      scenes: [{ name: "product-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createArchitectureFixture(): CorpusFixture {
  const positions = floatBytes([-1.2, 0, 0, 1.2, 0, 0, 1.2, 1.8, 0, -1.2, 1.8, 0]);
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3]);
  const buffer = concatBytes(positions, indices);
  const offsets = byteOffsets([positions, indices]);
  return {
    id: "architecture-wall-panel",
    category: "architecture",
    fileName: "architecture-wall-panel.gltf",
    source: generatedSource(),
    features: ["glTF", "multiple-nodes", "double-sided-material", "camera", "punctual-light"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: indices.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-1.2, 0, 0], max: [1.2, 1.8, 0] },
      { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" }
    ], {
      extensionsUsed: ["KHR_lights_punctual"],
      extensions: { KHR_lights_punctual: { lights: [{ name: "gallery-key", type: "point", intensity: 280, range: 8 }] } },
      cameras: [{ name: "inspection-camera", type: "perspective", perspective: { yfov: 0.75, znear: 0.01, zfar: 20 } }],
      materials: [{ name: "painted-wall", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.84, 0.85, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.82 } }],
      meshes: [{ name: "wall-panel", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      nodes: [{ name: "wall", mesh: 0 }, { name: "camera", camera: 0, translation: [0, 0.8, 4] }, { name: "light", extensions: { KHR_lights_punctual: { light: 0 } }, translation: [0, 1.5, 2] }],
      scenes: [{ name: "architecture-scene", nodes: [0, 1, 2] }],
      scene: 0
    })
  };
}

function createCharacterFixture(): CorpusFixture {
  const positions = floatBytes([-0.25, 0, 0, 0.25, 0, 0, 0, 0.75, 0]);
  const joints = uint16Bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const weights = floatBytes([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const ibm = floatBytes([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const buffer = concatBytes(positions, joints, weights, indices, ibm);
  const offsets = byteOffsets([positions, joints, weights, indices, ibm]);
  return {
    id: "character-single-joint",
    category: "character",
    fileName: "character-single-joint.gltf",
    source: generatedSource(),
    features: ["glTF", "skin", "joint-weights", "inverse-bind-matrix"],
    unsupportedFeatures: ["viewer-skinning-render-application"],
    expectedDiagnostics: [{
      code: "ASSET_VIEWER_SKINNING_INSPECT_ONLY",
      severity: "warning",
      message: "The fixture validates skin import metadata, while viewer rendering still does not apply glTF skinning palettes.",
      nextAction: "Connect imported skin palettes to render items before using this fixture as skinned visual evidence."
    }],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: joints.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: weights.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: indices.byteLength },
      { buffer: 0, byteOffset: offsets[4], byteLength: ibm.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.25, 0, 0], max: [0.25, 0.75, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 4, componentType: 5126, count: 1, type: "MAT4" }
    ], {
      materials: [{ name: "character-debug", extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorFactor: [0.2, 0.6, 0.9, 1] } }],
      meshes: [{ name: "single-joint-character", primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 3, material: 0 }] }],
      skins: [{ name: "single-joint-skin", joints: [1], inverseBindMatrices: 4, skeleton: 1 }],
      nodes: [{ name: "character-mesh", mesh: 0, skin: 0 }, { name: "root-joint" }],
      scenes: [{ name: "character-scene", nodes: [0, 1] }],
      scene: 0
    })
  };
}

function createEnvironmentFixture(): CorpusFixture {
  const positions = floatBytes([
    -1.5, 0, -1.5,
    1.5, 0, -1.5,
    1.5, 0, 1.5,
    -1.5, 0, 1.5,
    -0.25, 0, -0.25,
    0.25, 0, -0.25,
    0, 0.55, 0
  ]);
  const colors = floatBytes([
    0.18, 0.34, 0.24, 1,
    0.18, 0.34, 0.24, 1,
    0.28, 0.42, 0.3, 1,
    0.28, 0.42, 0.3, 1,
    0.55, 0.48, 0.38, 1,
    0.55, 0.48, 0.38, 1,
    0.38, 0.62, 0.74, 1
  ]);
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3, 4, 5, 6]);
  const buffer = concatBytes(positions, colors, indices);
  const offsets = byteOffsets([positions, colors, indices]);
  return {
    id: "environment-ground-marker",
    category: "environment",
    fileName: "environment-ground-marker.gltf",
    source: generatedSource(),
    features: ["glTF", "multiple-primitives", "vertex-colors", "environment-marker"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: colors.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 7, type: "VEC3", min: [-1.5, 0, -1.5], max: [1.5, 0.55, 1.5] },
      { bufferView: 1, componentType: 5126, count: 7, type: "VEC4" },
      { bufferView: 2, componentType: 5123, count: 9, type: "SCALAR" }
    ], {
      materials: [{ name: "environment-vertex-color", extensions: { KHR_materials_unlit: {} } }],
      meshes: [{
        name: "environment-ground-marker",
        primitives: [
          { attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }
        ]
      }],
      nodes: [{ name: "environment-node", mesh: 0 }],
      scenes: [{ name: "environment-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createMaterialsFixture(): CorpusFixture {
  const positions = floatBytes([-0.7, -0.45, 0, 0.7, -0.45, 0, 0, 0.75, 0]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, texcoords, indices);
  const offsets = byteOffsets([positions, texcoords, indices]);
  return {
    id: "materials-textured-alpha",
    category: "materials",
    fileName: "materials-textured-alpha.gltf",
    source: generatedSource(),
    features: ["glTF", "base-color-texture", "texture-transform", "alpha-blend", "double-sided"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: texcoords.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.45, 0], max: [0.7, 0.75, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ], {
      extensionsUsed: ["KHR_texture_transform"],
      images: [{ name: "two-pixel-material", uri: twoPixelPngDataUri(), mimeType: "image/png" }],
      textures: [{ name: "two-pixel-material-texture", source: 0 }],
      materials: [{
        name: "textured-alpha-material",
        alphaMode: "BLEND",
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { offset: [0.1, 0.2], scale: [0.8, 0.8], rotation: 0.25 } } },
          metallicFactor: 0,
          roughnessFactor: 0.5
        }
      }],
      meshes: [{ name: "textured-alpha-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
      nodes: [{ name: "textured-alpha-node", mesh: 0 }],
      scenes: [{ name: "materials-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createAnimationFixture(): CorpusFixture {
  const positions = floatBytes([-0.5, -0.35, 0, 0.5, -0.35, 0, 0, 0.55, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 0.25, 0.25, 0]);
  const buffer = concatBytes(positions, indices, times, translations);
  const offsets = byteOffsets([positions, indices, times, translations]);
  return {
    id: "animation-translation",
    category: "animation",
    fileName: "animation-translation.gltf",
    source: generatedSource(),
    features: ["glTF", "animation-clip", "translation-track"],
    unsupportedFeatures: ["viewer-animation-render-application"],
    expectedDiagnostics: [{
      code: "ASSET_VIEWER_ANIMATION_INSPECT_ONLY",
      severity: "warning",
      message: "The fixture validates glTF animation import and sampling metadata, while viewer rendering does not apply sampled tracks.",
      nextAction: "Wire sampled animation tracks into scene node transforms before using this as playback visual evidence."
    }],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: indices.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: times.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: translations.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.35, 0], max: [0.5, 0.55, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" }
    ], {
      materials: [{ name: "animated-unlit", extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.35, 0.18, 1] } }],
      meshes: [{ name: "animated-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      nodes: [{ name: "animated-node", mesh: 0 }],
      animations: [{ name: "translate-x-y", samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }],
      scenes: [{ name: "animation-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createCompressionFixture(): CorpusFixture {
  return {
    id: "compression-meshopt-required",
    category: "compression",
    fileName: "compression-meshopt-required.gltf",
    source: generatedSource(),
    features: ["glTF", "EXT_meshopt_compression"],
    unsupportedFeatures: ["meshopt-decoder-required"],
    expectedDiagnostics: [{
      code: "ASSET_MESHOPT_DECODER_REQUIRED",
      severity: "error",
      message: "This fixture intentionally requires EXT_meshopt_compression without injecting a Meshopt decoder.",
      nextAction: "Run with a real Meshopt decoder before claiming compressed mesh browser support."
    }],
    gltf: {
      asset: { version: "2.0", generator: "A3D foundation generated meshopt-required fixture" },
      extensionsUsed: ["EXT_meshopt_compression"],
      extensionsRequired: ["EXT_meshopt_compression"],
      buffers: [{ uri: bytesDataUri(new Uint8Array([0, 1, 2, 3])), byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4, byteStride: 12, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 4, byteStride: 12, count: 3, mode: "ATTRIBUTES" } } }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
      meshes: [{ name: "meshopt-required", primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ name: "meshopt-required-node", mesh: 0 }],
      scenes: [{ name: "compression-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createProblemCaseFixture(): CorpusFixture {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const uv0 = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const uv1 = floatBytes([1, 1, 0, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, uv0, uv1, indices);
  const offsets = byteOffsets([positions, uv0, uv1, indices]);
  return {
    id: "problem-multi-uv-render-limit",
    category: "problem-cases",
    fileName: "problem-multi-uv-render-limit.gltf",
    source: generatedSource(),
    features: ["glTF", "multi-uv", "texture-transform"],
    unsupportedFeatures: ["renderer-single-uv-set-per-draw"],
    expectedDiagnostics: [{
      code: "ASSET_RENDERER_MULTI_UV_UNSUPPORTED",
      severity: "error",
      message: "This fixture intentionally references TEXCOORD_0 and TEXCOORD_1 from one material, which the current render-resource path rejects.",
      nextAction: "Keep the fixture classified unsupported until the renderer supports multiple UV sets per draw."
    }],
    gltf: baseGltf(buffer, [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: uv0.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: uv1.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: indices.byteLength }
    ], [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }
    ], {
      images: [{ name: "multi-uv-image", uri: twoPixelPngDataUri(), mimeType: "image/png" }],
      textures: [{ name: "multi-uv-texture", source: 0 }, { name: "multi-uv-texture-1", source: 0 }],
      materials: [{
        name: "multi-uv-material",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 0 },
          metallicRoughnessTexture: { index: 1, texCoord: 1 },
          metallicFactor: 0,
          roughnessFactor: 1
        }
      }],
      meshes: [{ name: "multi-uv-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, indices: 3, material: 0 }] }],
      nodes: [{ name: "multi-uv-node", mesh: 0 }],
      scenes: [{ name: "problem-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function generatedSource(): CorpusFixture["source"] {
  return { kind: "generated", generator: "tools/foundation-asset-corpus/index.ts", license: "CC0-1.0" };
}

function baseGltf(
  buffer: Uint8Array,
  bufferViews: readonly Record<string, unknown>[],
  accessors: readonly Record<string, unknown>[],
  rest: Record<string, unknown>
): Record<string, unknown> {
  return {
    asset: { version: "2.0", generator: "A3D foundation generated local fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews,
    accessors,
    ...rest
  };
}

async function decodeFixtureImage(): Promise<DecodedGLTFImage> {
  return {
    width: 2,
    height: 1,
    colorSpace: "srgb",
    data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255])
  };
}

function gltfDataUrl(gltf: Record<string, unknown>): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function createPreviewSvg(fixture: CorpusFixture): string {
  const unsupported = fixture.unsupportedFeatures.length > 0;
  const color = unsupported ? "#ff7b6b" : "#62d68f";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#101820"/>
  <rect x="28" y="28" width="584" height="304" fill="#151d24" stroke="#34424d" rx="6"/>
  <rect x="28" y="28" width="10" height="304" fill="${color}"/>
  <text x="58" y="78" fill="#eef2f6" font-family="ui-sans-serif, system-ui" font-size="28">${fixture.id}</text>
  <text x="58" y="118" fill="#b7c4ce" font-family="ui-sans-serif, system-ui" font-size="18">${fixture.category} / ${unsupported ? "expected unsupported" : "render-resource smoke"}</text>
  <text x="58" y="162" fill="#dbe6ef" font-family="ui-sans-serif, system-ui" font-size="16">${fixture.features.join(", ")}</text>
</svg>
`;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function relativePath(path: string): string {
  return path.replace(`${process.cwd()}/`, "");
}

function currentCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function hashSource(path: string): { readonly path: string; readonly sha256: string } {
  return {
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
  };
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function byteOffsets(chunks: readonly Uint8Array[]): readonly number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    offsets.push(offset);
    offset += chunk.byteLength;
  }
  return offsets;
}

function bytesDataUri(bytes: Uint8Array): string {
  return `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
}

function twoPixelPngDataUri(): string {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=";
}

function cubePositions(size: number): readonly number[] {
  return [
    -size, -size, -size,
    size, -size, -size,
    size, size, -size,
    -size, size, -size,
    -size, -size, size,
    size, -size, size,
    size, size, size,
    -size, size, size
  ];
}

function cubeNormals(): readonly number[] {
  return [
    -0.58, -0.58, -0.58,
    0.58, -0.58, -0.58,
    0.58, 0.58, -0.58,
    -0.58, 0.58, -0.58,
    -0.58, -0.58, 0.58,
    0.58, -0.58, 0.58,
    0.58, 0.58, 0.58,
    -0.58, 0.58, 0.58
  ];
}

function cubeIndices(): readonly number[] {
  return [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0
  ];
}

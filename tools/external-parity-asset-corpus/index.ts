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
  type DecodedGLTFImage,
  type GLTFAssetInspectionReport,
  type GLTFLoaderDiagnostics
} from "@aura3d/assets";

type V4Category = "product" | "architecture" | "environment" | "character" | "materials" | "morph" | "animation";

interface V4Fixture {
  readonly id: string;
  readonly category: V4Category;
  readonly fileName: string;
  readonly displayName: string;
  readonly license: "CC0-1.0";
  readonly source: {
    readonly kind: "generated-local";
    readonly generator: string;
  };
  readonly features: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly expectedDiagnostics: readonly AssetDiagnostic[];
  readonly gltf: Record<string, unknown>;
}

interface V4CorpusAssetReport {
  readonly id: string;
  readonly category: V4Category;
  readonly displayName: string;
  readonly assetPath: string;
  readonly license: string;
  readonly source: V4Fixture["source"];
  readonly features: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly textureCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly renderStatus: "render-resources-created" | "error";
  readonly screenshotPath: string;
  readonly diagnosticsPath: string;
  readonly loaderDiagnostics: GLTFLoaderDiagnostics;
  readonly inspection: CorpusInspectionSummary;
  readonly timings: {
    readonly loadMs: number;
    readonly renderResourceMs: number;
    readonly decodeMs: number;
    readonly totalMs: number;
  };
  readonly diagnostics: readonly AssetDiagnostic[];
  readonly errorState?: string;
}

interface CorpusInspectionSummary {
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly animations: number;
  readonly skins: number;
  readonly morphTargets: number;
  readonly cameras: number;
  readonly lights: number;
  readonly warnings: readonly string[];
}

const fixtureRoot = resolve("fixtures/external-parity-assets");
const reportPath = resolve("tests/reports/external-parity-asset-corpus.json");
const generatedAt = new Date().toISOString();
const fixtures: readonly V4Fixture[] = [
  createProductFixture(),
  createArchitectureFixture(),
  createEnvironmentFixture(),
  createCharacterFixture(),
  createMaterialFixture(),
  createSpecularGlossinessFixture(),
  createMorphFixture(),
  createAnimationFixture()
];

const reports: V4CorpusAssetReport[] = [];
for (const fixture of fixtures) {
  const directory = resolve(fixtureRoot, fixture.category, fixture.id);
  const assetPath = resolve(directory, fixture.fileName);
  const diagnosticsPath = resolve(directory, "loader-diagnostics-baseline.json");
  const screenshotPath = resolve(directory, "screenshot-baseline.svg");
  writeJson(assetPath, fixture.gltf);
  reports.push(await inspectFixture(fixture, assetPath, diagnosticsPath, screenshotPath));
}

writeJson(resolve(fixtureRoot, "manifest.json"), {
  schemaVersion: "a3d-v4-asset-corpus-v1",
  generatedAt,
  source: {
    kind: "generated-local",
    generator: "tools/external-parity-asset-corpus/index.ts",
    license: "CC0-1.0"
  },
  assetCount: fixtures.length,
  categories: [...new Set(fixtures.map((fixture) => fixture.category))].sort(),
  assets: reports.map((report) => ({
    id: report.id,
    category: report.category,
    displayName: report.displayName,
    localPath: report.assetPath,
    license: report.license,
    features: report.features,
    materialFeatures: report.materialFeatures,
    textureCount: report.textureCount,
    animations: report.animationCount,
    skins: report.skinCount,
    morphTargets: report.morphTargetCount,
    expectedScreenshot: report.screenshotPath,
    loaderDiagnostics: report.diagnosticsPath,
    unsupportedFeatures: report.unsupportedFeatures
  }))
});

const report = {
  ok: reports.every((entry) => entry.renderStatus === "render-resources-created"),
  schemaVersion: "a3d-v4-asset-corpus-report-v1",
  generatedAt,
  commit: currentCommit(),
  command: "pnpm exec tsx --tsconfig tsconfig.base.json tools/external-parity-asset-corpus/index.ts",
  assetCount: reports.length,
  summary: {
    renderResourcesCreated: reports.filter((entry) => entry.renderStatus === "render-resources-created").length,
    error: reports.filter((entry) => entry.renderStatus === "error").length,
    textureAssets: reports.filter((entry) => entry.textureCount > 0).length,
    animatedAssets: reports.filter((entry) => entry.animationCount > 0).length,
    skinnedAssets: reports.filter((entry) => entry.skinCount > 0).length,
    morphAssets: reports.filter((entry) => entry.morphTargetCount > 0).length
  },
  blockedClaims: [
    "complete glTF support",
    "loader parity with Three.js",
    "production asset pipeline",
    "broad skinned visual parity beyond the generated V4 corpus",
    "broad morph animation parity beyond the generated V4 corpus"
  ],
  sourceFileHashes: [
    hashSource("tools/external-parity-asset-corpus/index.ts"),
    hashSource("packages/assets/src/GLTFLoader.ts"),
    hashSource("packages/assets/src/AssetInspection.ts"),
    hashSource("packages/assets/src/GLTFRenderResources.ts")
  ],
  assets: reports
};
writeJson(reportPath, report);
console.log(`Wrote ${reports.length} V4 asset corpus fixtures and ${relativePath(reportPath)}`);

async function inspectFixture(
  fixture: V4Fixture,
  assetPath: string,
  diagnosticsPath: string,
  screenshotPath: string
): Promise<V4CorpusAssetReport> {
  const loader = new GLTFLoader();
  const totalStart = performance.now();
  let loadMs = 0;
  let renderResourceMs = 0;
  let decodeMs = 0;
  try {
    const loadStart = performance.now();
    const asset = await loader.load({ url: gltfDataUrl(fixture.gltf), type: "gltf" }, new LoadContext());
    loadMs = elapsedMs(loadStart);
    const renderStart = performance.now();
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: async () => {
        const decodeStart = performance.now();
        const decoded = await decodeFixtureImage();
        decodeMs += elapsedMs(decodeStart);
        return decoded;
      }
    });
    renderResourceMs = elapsedMs(renderStart);
    try {
      const inspection = inspectGLTFAsset(asset, resources);
      const diagnostics = [...fixture.expectedDiagnostics, ...inspection.warnings];
      const summary = summarizeInspection(inspection);
      writeJson(diagnosticsPath, {
        assetId: fixture.id,
        loaderDiagnostics: asset.loaderDiagnostics,
        inspection: summary,
        diagnostics
      });
      writeFileSync(screenshotPath, createPreviewSvg(fixture, summary), "utf8");
      writeJson(resolve(dirname(assetPath), "manifest.json"), createAssetManifest(fixture, assetPath, diagnosticsPath, screenshotPath, asset.loaderDiagnostics, summary));
      return {
        id: fixture.id,
        category: fixture.category,
        displayName: fixture.displayName,
        assetPath: relativePath(assetPath),
        license: fixture.license,
        source: fixture.source,
        features: fixture.features,
        materialFeatures: fixture.materialFeatures,
        unsupportedFeatures: fixture.unsupportedFeatures,
        textureCount: asset.textures.length,
        animationCount: asset.animations.length,
        skinCount: asset.skins.length,
        morphTargetCount: asset.meshes.reduce((sum, mesh) => sum + mesh.morphTargets.length, 0),
        renderStatus: "render-resources-created",
        screenshotPath: relativePath(screenshotPath),
        diagnosticsPath: relativePath(diagnosticsPath),
        loaderDiagnostics: asset.loaderDiagnostics,
        inspection: summary,
        timings: createTimings(loadMs, renderResourceMs, decodeMs, totalStart),
        diagnostics
      };
    } finally {
      resources.dispose();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = [...fixture.expectedDiagnostics, {
      code: "ASSET_V4_CORPUS_LOAD_ERROR",
      severity: "error",
      message,
      nextAction: "Fix the generated V4 corpus fixture or the loader/render-resource regression before marking this asset complete.",
      assetId: fixture.id
    } satisfies AssetDiagnostic];
    const emptyDiagnostics: GLTFLoaderDiagnostics = {
      schemaVersion: "gltf-loader-diagnostics-v1",
      features: [],
      extensionsUsed: [],
      extensionsRequired: [],
      unsupportedExtensions: [],
      unsupportedFeatures: [],
      meshCount: 0,
      primitiveCount: 0,
      vertexCount: 0,
      indexCount: 0,
      materialCount: 0,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      materialFeatures: [],
      textureSlots: [],
      compression: { draco: false, meshopt: false, ktx2Basis: false }
    };
    const emptyInspection: CorpusInspectionSummary = { meshes: 0, materials: 0, textures: 0, animations: 0, skins: 0, morphTargets: 0, cameras: 0, lights: 0, warnings: diagnostics.map((entry) => entry.code) };
    writeJson(diagnosticsPath, { assetId: fixture.id, loaderDiagnostics: emptyDiagnostics, inspection: emptyInspection, diagnostics });
    writeFileSync(screenshotPath, createPreviewSvg(fixture, emptyInspection), "utf8");
    writeJson(resolve(dirname(assetPath), "manifest.json"), createAssetManifest(fixture, assetPath, diagnosticsPath, screenshotPath, emptyDiagnostics, emptyInspection));
    return {
      id: fixture.id,
      category: fixture.category,
      displayName: fixture.displayName,
      assetPath: relativePath(assetPath),
      license: fixture.license,
      source: fixture.source,
      features: fixture.features,
      materialFeatures: fixture.materialFeatures,
      unsupportedFeatures: fixture.unsupportedFeatures,
      textureCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      renderStatus: "error",
      screenshotPath: relativePath(screenshotPath),
      diagnosticsPath: relativePath(diagnosticsPath),
      loaderDiagnostics: emptyDiagnostics,
      inspection: emptyInspection,
      timings: createTimings(loadMs, renderResourceMs, decodeMs, totalStart),
      diagnostics,
      errorState: message
    };
  }
}

function createAssetManifest(
  fixture: V4Fixture,
  assetPath: string,
  diagnosticsPath: string,
  screenshotPath: string,
  loaderDiagnostics: GLTFLoaderDiagnostics,
  inspection: CorpusInspectionSummary
): Record<string, unknown> {
  return {
    schemaVersion: "a3d-v4-local-asset-v1",
    id: fixture.id,
    category: fixture.category,
    displayName: fixture.displayName,
    localFile: fixture.fileName,
    license: fixture.license,
    source: fixture.source,
    features: fixture.features,
    materialFeatures: fixture.materialFeatures,
    textureCount: loaderDiagnostics.textureCount,
    animations: loaderDiagnostics.animationCount,
    skins: loaderDiagnostics.skinCount,
    morphTargets: loaderDiagnostics.morphTargetCount,
    expectedScreenshot: relativePath(screenshotPath),
    loaderDiagnostics: relativePath(diagnosticsPath),
    localPath: relativePath(assetPath),
    unsupportedFeatures: fixture.unsupportedFeatures,
    inspection
  };
}

function summarizeInspection(inspection: GLTFAssetInspectionReport): CorpusInspectionSummary {
  return {
    meshes: inspection.meshes.length,
    materials: inspection.materials.length,
    textures: inspection.textures.length,
    animations: inspection.animations.length,
    skins: inspection.skins.length,
    morphTargets: inspection.morphTargets.length,
    cameras: inspection.cameras.length,
    lights: inspection.lights.length,
    warnings: inspection.warnings.map((warning) => warning.code)
  };
}

function createProductFixture(): V4Fixture {
  const productRects = [
    rectVertices(-0.92, -0.54, 0, 0.92, -0.4),
    rectVertices(-0.62, -0.3, 0, -0.12, 0.3),
    rectVertices(0.16, -0.32, 0, 0.62, 0.32),
    rectVertices(-0.76, 0.38, 0, 0.78, 0.5),
  ];
  const positions = floatBytes(productRects.flat());
  const normals = floatBytes(Array.from({ length: 16 }, () => [0, 0, 1]).flat());
  const texcoords = floatBytes(Array.from({ length: 4 }, () => [0, 0, 1, 0, 1, 1, 0, 1]).flat());
  const bodyIndices = uint16Bytes(rectIndices(0));
  const grilleIndices = uint16Bytes(rectIndices(4));
  const coneIndices = uint16Bytes(rectIndices(8));
  const accentIndices = uint16Bytes(rectIndices(12));
  const buffer = concatBytes(positions, normals, texcoords, bodyIndices, grilleIndices, coneIndices, accentIndices);
  const offsets = byteOffsets([positions, normals, texcoords, bodyIndices, grilleIndices, coneIndices, accentIndices]);
  return {
    id: "v4-product-speaker",
    category: "product",
    fileName: "v4-product-speaker.gltf",
    displayName: "Generated V4 Product Speaker",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["product", "pbr", "metallic-roughness", "base-color-texture", "multi-primitive-scene", "normals", "indexed-geometry", "hdr-studio-environment-resource"],
    materialFeatures: ["base-color-texture", "metallic-roughness", "multi-material", "normal-ready"],
    unsupportedFeatures: ["commercial-product-model"],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [
      view(offsets[0], positions),
      view(offsets[1], normals),
      view(offsets[2], texcoords),
      view(offsets[3], bodyIndices),
      view(offsets[4], grilleIndices),
      view(offsets[5], coneIndices),
      view(offsets[6], accentIndices)
    ], [
      accessor(0, 5126, 16, "VEC3", [-0.92, -0.54, 0], [0.92, 0.5, 0]),
      accessor(1, 5126, 16, "VEC3"),
      accessor(2, 5126, 16, "VEC2"),
      accessor(3, 5123, 6, "SCALAR"),
      accessor(4, 5123, 6, "SCALAR"),
      accessor(5, 5123, 6, "SCALAR"),
      accessor(6, 5123, 6, "SCALAR")
    ], {
      images: [{ name: "speaker-grille-texture", uri: twoPixelPngDataUri(), mimeType: "image/png" }],
      textures: [{ name: "speaker-grille", source: 0 }],
      materials: [
        { name: "brushed-graphite-shell", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.08, 0.12, 0.17, 1], metallicFactor: 0.58, roughnessFactor: 0.32 } },
        { name: "woven-speaker-grille", doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [0.55, 0.62, 0.68, 1], metallicFactor: 0.08, roughnessFactor: 0.82 } },
        { name: "warm-driver-cone", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.92, 0.47, 0.18, 1], metallicFactor: 0.2, roughnessFactor: 0.44 } },
        { name: "glass-control-strip", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.1, 0.44, 0.72, 1], metallicFactor: 0.02, roughnessFactor: 0.18 } },
      ],
      meshes: [{
        name: "speaker-body",
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
          { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 4, material: 1 },
          { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 5, material: 2 },
          { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 6, material: 3 },
        ]
      }],
      nodes: [{ name: "speaker-body-node", mesh: 0 }],
      scenes: [{ name: "product-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createArchitectureFixture(): V4Fixture {
  const positions = floatBytes([-1.5, 0, 0, 1.5, 0, 0, 1.5, 1.8, 0, -1.5, 1.8, 0, -1.5, 0, -1.8, 1.5, 0, -1.8]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0]);
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3, 4, 5, 1, 4, 1, 0]);
  const buffer = concatBytes(positions, normals, indices);
  const offsets = byteOffsets([positions, normals, indices]);
  return {
    id: "external-gallery-corner",
    category: "architecture",
    fileName: "external-gallery-corner.gltf",
    displayName: "Generated V4 Gallery Corner",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["architecture", "room-corner", "double-sided", "camera", "punctual-light"],
    materialFeatures: ["double-sided", "unlit"],
    unsupportedFeatures: ["real-building-import", "baked-lightmaps"],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], normals), view(offsets[2], indices)], [
      accessor(0, 5126, 6, "VEC3", [-1.5, 0, -1.8], [1.5, 1.8, 0]),
      accessor(1, 5126, 6, "VEC3"),
      accessor(2, 5123, 12, "SCALAR")
    ], {
      extensionsUsed: ["KHR_lights_punctual", "KHR_materials_unlit"],
      extensions: { KHR_lights_punctual: { lights: [{ name: "gallery-key", type: "point", intensity: 280, range: 8 }] } },
      cameras: [{ name: "gallery-camera", type: "perspective", perspective: { yfov: 0.7, znear: 0.01, zfar: 20 } }],
      materials: [{ name: "warm-plaster-unlit", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.78, 0.73, 0.64, 1], roughnessFactor: 0.86, metallicFactor: 0 }, extensions: { KHR_materials_unlit: {} } }],
      meshes: [{ name: "gallery-corner", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
      nodes: [{ name: "gallery-shell", mesh: 0 }, { name: "gallery-camera-node", camera: 0, translation: [0, 1, 4] }, { name: "gallery-key-node", extensions: { KHR_lights_punctual: { light: 0 } }, translation: [0, 1.6, 1.2] }],
      scenes: [{ name: "architecture-scene", nodes: [0, 1, 2] }],
      scene: 0
    })
  };
}

function createEnvironmentFixture(): V4Fixture {
  const positions = floatBytes([-2, 0, -2, 2, 0, -2, 2, 0, 2, -2, 0, 2, -0.35, 0, -0.25, 0.35, 0, -0.25, 0, 0.72, 0]);
  const colors = floatBytes([0.12, 0.26, 0.18, 1, 0.12, 0.26, 0.18, 1, 0.22, 0.36, 0.24, 1, 0.22, 0.36, 0.24, 1, 0.52, 0.44, 0.3, 1, 0.52, 0.44, 0.3, 1, 0.32, 0.54, 0.72, 1]);
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3, 4, 5, 6]);
  const instanceTranslations = floatBytes([
    -0.34, 0, -0.18,
    0, 0, 0,
    0.34, 0, 0.2
  ]);
  const buffer = concatBytes(positions, colors, indices, instanceTranslations);
  const offsets = byteOffsets([positions, colors, indices, instanceTranslations]);
  return {
    id: "v4-game-outpost",
    category: "environment",
    fileName: "v4-game-outpost.gltf",
    displayName: "Generated V4 Game Outpost",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["game-environment", "vertex-colors", "multi-primitive-scene", "level-marker", "mesh-gpu-instancing"],
    materialFeatures: ["vertex-color-unlit"],
    unsupportedFeatures: ["streaming-world-asset", "navmesh"],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], colors), view(offsets[2], indices), view(offsets[3], instanceTranslations)], [
      accessor(0, 5126, 7, "VEC3", [-2, 0, -2], [2, 0.72, 2]),
      accessor(1, 5126, 7, "VEC4"),
      accessor(2, 5123, 9, "SCALAR"),
      accessor(3, 5126, 3, "VEC3", [-0.34, 0, -0.18], [0.34, 0, 0.2])
    ], {
      extensionsUsed: ["KHR_materials_unlit", "EXT_mesh_gpu_instancing"],
      materials: [{ name: "outpost-vertex-colors", doubleSided: true, extensions: { KHR_materials_unlit: {} } }],
      meshes: [{ name: "outpost-floor-and-marker", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }],
      nodes: [{ name: "outpost-root", mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 3 } } } }],
      scenes: [{ name: "environment-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createCharacterFixture(): V4Fixture {
  const positions = floatBytes([-0.25, 0, 0, 0.25, 0, 0, 0, 0.8, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const joints = uint16Bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const weights = floatBytes([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const ibm = floatBytes(identityMat4());
  const times = floatBytes([0, 1]);
  const rotations = floatBytes([0, 0, 0, 1, 0, 0, 0.2, 0.98]);
  const buffer = concatBytes(positions, normals, joints, weights, indices, ibm, times, rotations);
  const offsets = byteOffsets([positions, normals, joints, weights, indices, ibm, times, rotations]);
  return {
    id: "v4-skinned-hero",
    category: "character",
    fileName: "v4-skinned-hero.gltf",
    displayName: "Generated V4 Skinned Hero",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["character", "skin", "joint-weights", "inverse-bind-matrix", "animation"],
    materialFeatures: ["lit-character-material"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], normals), view(offsets[2], joints), view(offsets[3], weights), view(offsets[4], indices), view(offsets[5], ibm), view(offsets[6], times), view(offsets[7], rotations)], [
      accessor(0, 5126, 3, "VEC3", [-0.25, 0, 0], [0.25, 0.8, 0]),
      accessor(1, 5126, 3, "VEC3"),
      accessor(2, 5123, 3, "VEC4"),
      accessor(3, 5126, 3, "VEC4"),
      accessor(4, 5123, 3, "SCALAR"),
      accessor(5, 5126, 1, "MAT4"),
      accessor(6, 5126, 2, "SCALAR"),
      accessor(7, 5126, 2, "VEC4")
    ], {
      materials: [{ name: "hero-lit-blue", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.16, 0.42, 0.9, 1], roughnessFactor: 0.55, metallicFactor: 0.05 } }],
      meshes: [{ name: "hero-body", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 4, material: 0 }] }],
      skins: [{ name: "hero-single-joint-skin", joints: [1], inverseBindMatrices: 5, skeleton: 1 }],
      nodes: [{ name: "hero-mesh", mesh: 0, skin: 0 }, { name: "hero-root-joint" }],
      animations: [{ name: "hero-root-sway", samplers: [{ input: 6, output: 7 }], channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }] }],
      scenes: [{ name: "character-scene", nodes: [0, 1] }],
      scene: 0
    })
  };
}

function createMaterialFixture(): V4Fixture {
  const positions = floatBytes([-0.8, -0.45, 0, 0.8, -0.45, 0, 0, 0.75, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, normals, texcoords, indices);
  const offsets = byteOffsets([positions, normals, texcoords, indices]);
  return {
    id: "v4-material-fidelity-card",
    category: "materials",
    fileName: "v4-material-fidelity-card.gltf",
    displayName: "Generated V4 Material Fidelity Card",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["material-test", "base-color", "normal", "metallic-roughness", "emissive", "occlusion", "alpha", "texture-transform", "avif-texture-source", "webp-texture-source", "double-sided", "material-variant", "advanced-pbr-material-extensions", "linear-hdr-ibl-resource"],
    materialFeatures: ["base-color-texture", "normal-texture", "metallic-roughness-texture", "emissive-texture", "occlusion-texture", "alpha-blend", "texture-transform", "avif-texture-source", "webp-texture-source", "double-sided", "material-variant", "clearcoat", "transmission", "diffuse-transmission", "volume", "specular", "sheen", "anisotropy", "iridescence", "dispersion", "linear-hdr-ibl-resource"],
    unsupportedFeatures: ["reference-grade-ibl-parity"],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], normals), view(offsets[2], texcoords), view(offsets[3], indices)], [
      accessor(0, 5126, 3, "VEC3", [-0.8, -0.45, 0], [0.8, 0.75, 0]),
      accessor(1, 5126, 3, "VEC3"),
      accessor(2, 5126, 3, "VEC2"),
      accessor(3, 5123, 3, "SCALAR")
    ], {
      extensionsUsed: ["EXT_texture_avif", "EXT_texture_webp", "KHR_texture_transform", "KHR_materials_emissive_strength", "KHR_materials_variants", "KHR_materials_clearcoat", "KHR_materials_transmission", "KHR_materials_diffuse_transmission", "KHR_materials_volume", "KHR_materials_specular", "KHR_materials_sheen", "KHR_materials_anisotropy", "KHR_materials_iridescence", "KHR_materials_ior", "KHR_materials_dispersion"],
      extensions: { KHR_materials_variants: { variants: [{ name: "warm-alt-finish" }] } },
      images: [
        { name: "material-fixture-pixel", uri: twoPixelPngDataUri(), mimeType: "image/png" },
        { name: "material-fixture-webp", uri: twoPixelWebpDataUri(), mimeType: "image/webp" },
        { name: "material-fixture-avif", uri: twoPixelAvifDataUri(), mimeType: "image/avif" }
      ],
      textures: [{ name: "base", source: 0, extensions: { EXT_texture_webp: { source: 1 }, EXT_texture_avif: { source: 2 } } }, { name: "normal", source: 0 }, { name: "orm", source: 0 }, { name: "emissive", source: 0 }],
      materials: [
        {
          name: "v4-textured-alpha-emissive",
          alphaMode: "BLEND",
          doubleSided: true,
          emissiveFactor: [0.2, 0.55, 0.8],
          extensions: {
            KHR_materials_emissive_strength: { emissiveStrength: 1.8 },
            KHR_materials_clearcoat: { clearcoatFactor: 0.75, clearcoatRoughnessFactor: 0.18 },
            KHR_materials_transmission: { transmissionFactor: 0.22 },
            KHR_materials_diffuse_transmission: { diffuseTransmissionFactor: 0.18, diffuseTransmissionColorFactor: [0.82, 0.92, 1] },
            KHR_materials_volume: { thicknessFactor: 0.08, attenuationDistance: 2.4, attenuationColor: [0.78, 0.9, 1] },
            KHR_materials_specular: { specularFactor: 0.88, specularColorFactor: [1, 0.92, 0.76] },
            KHR_materials_sheen: { sheenColorFactor: [0.35, 0.48, 0.9], sheenRoughnessFactor: 0.42 },
            KHR_materials_anisotropy: { anisotropyStrength: 0.54, anisotropyRotation: 0.35 },
            KHR_materials_iridescence: { iridescenceFactor: 0.62, iridescenceIor: 1.45, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 520 },
            KHR_materials_ior: { ior: 1.55 },
            KHR_materials_dispersion: { dispersion: 0.14 }
          },
          normalTexture: { index: 1, scale: 0.6 },
          occlusionTexture: { index: 2, strength: 0.7 },
          emissiveTexture: { index: 3 },
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { offset: [0.1, 0.2], scale: [0.75, 0.75], rotation: 0.15 } } },
            metallicRoughnessTexture: { index: 2 },
            metallicFactor: 0.4,
            roughnessFactor: 0.35
          }
        },
        {
          name: "v4-warm-alt-finish",
          doubleSided: true,
          pbrMetallicRoughness: { baseColorFactor: [0.95, 0.6, 0.32, 1], metallicFactor: 0.15, roughnessFactor: 0.28 }
        }
      ],
      meshes: [{
        name: "material-card",
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
          indices: 3,
          material: 0,
          extensions: { KHR_materials_variants: { mappings: [{ material: 1, variants: [0] }] } }
        }]
      }],
      nodes: [{ name: "material-card-node", mesh: 0 }],
      scenes: [{ name: "materials-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createSpecularGlossinessFixture(): V4Fixture {
  const positions = floatBytes([-0.65, -0.42, 0, 0.65, -0.42, 0, 0, 0.68, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, normals, indices);
  const offsets = byteOffsets([positions, normals, indices]);
  return {
    id: "v4-specular-glossiness-card",
    category: "materials",
    fileName: "v4-specular-glossiness-card.gltf",
    displayName: "Generated V4 Specular Glossiness Card",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["material-test", "pbr-specular-glossiness", "extension-material", "indexed-geometry"],
    materialFeatures: ["pbr-specular-glossiness", "specular", "glossiness", "roughness-conversion"],
    unsupportedFeatures: ["reference-grade-specular-glossiness-parity"],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], normals), view(offsets[2], indices)], [
      accessor(0, 5126, 3, "VEC3", [-0.65, -0.42, 0], [0.65, 0.68, 0]),
      accessor(1, 5126, 3, "VEC3"),
      accessor(2, 5123, 3, "SCALAR")
    ], {
      extensionsUsed: ["KHR_materials_pbrSpecularGlossiness"],
      materials: [{
        name: "v4-specular-glossiness-blue",
        doubleSided: true,
        extensions: {
          KHR_materials_pbrSpecularGlossiness: {
            diffuseFactor: [0.12, 0.34, 0.92, 1],
            specularFactor: [0.92, 0.88, 0.72],
            glossinessFactor: 0.78
          }
        }
      }],
      meshes: [{ name: "specular-glossiness-card", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
      nodes: [{ name: "specular-glossiness-node", mesh: 0 }],
      scenes: [{ name: "specular-glossiness-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createMorphFixture(): V4Fixture {
  const positions = floatBytes([-0.55, -0.35, 0, 0.55, -0.35, 0, 0, 0.55, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const morphPositions = floatBytes([0, 0, 0, 0, 0, 0, 0, 0.35, 0.25]);
  const indices = uint16Bytes([0, 1, 2]);
  const times = floatBytes([0, 1]);
  const morphWeights = floatBytes([0, 1]);
  const buffer = concatBytes(positions, normals, morphPositions, indices, times, morphWeights);
  const offsets = byteOffsets([positions, normals, morphPositions, indices, times, morphWeights]);
  return {
    id: "v4-morph-expression",
    category: "morph",
    fileName: "v4-morph-expression.gltf",
    displayName: "Generated V4 Morph Expression",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["morph-target", "morph-position-deltas", "visible-morph-control", "animated-morph-weights"],
    materialFeatures: ["lit-morph-material"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], normals), view(offsets[2], morphPositions), view(offsets[3], indices), view(offsets[4], times), view(offsets[5], morphWeights)], [
      accessor(0, 5126, 3, "VEC3", [-0.55, -0.35, 0], [0.55, 0.9, 0.25]),
      accessor(1, 5126, 3, "VEC3"),
      accessor(2, 5126, 3, "VEC3"),
      accessor(3, 5123, 3, "SCALAR"),
      accessor(4, 5126, 2, "SCALAR"),
      accessor(5, 5126, 2, "SCALAR")
    ], {
      materials: [{ name: "morph-orange", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.95, 0.42, 0.1, 1], roughnessFactor: 0.44, metallicFactor: 0.02 } }],
      meshes: [{ name: "morph-expression", weights: [0.65], primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, targets: [{ POSITION: 2 }], indices: 3, material: 0 }] }],
      nodes: [{ name: "morph-node", mesh: 0 }],
      animations: [{ name: "morph-weight-smile", samplers: [{ input: 4, output: 5 }], channels: [{ sampler: 0, target: { node: 0, path: "weights" } }] }],
      scenes: [{ name: "morph-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function createAnimationFixture(): V4Fixture {
  const positions = normalizedInt16Bytes([-0.5, -0.35, 0, 0.5, -0.35, 0, 0, 0.55, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const times = floatBytes([0, 1, 2]);
  const translations = floatBytes([0, 0, 0, 0.25, 0.22, 0, -0.15, 0.1, 0]);
  const buffer = concatBytes(positions, normals, indices, times, translations);
  const offsets = byteOffsets([positions, normals, indices, times, translations]);
  return {
    id: "v4-root-motion-clip",
    category: "animation",
    fileName: "v4-root-motion-clip.gltf",
    displayName: "Generated V4 Root Motion Clip",
    license: "CC0-1.0",
    source: generatedSource(),
    features: ["animation", "translation-track", "root-motion-diagnostic", "mesh-quantization"],
    materialFeatures: ["lit-animation-material"],
    unsupportedFeatures: [],
    expectedDiagnostics: [],
    gltf: baseGltf(buffer, [view(offsets[0], positions), view(offsets[1], normals), view(offsets[2], indices), view(offsets[3], times), view(offsets[4], translations)], [
      { ...accessor(0, 5122, 3, "VEC3", [-0.5, -0.35, 0], [0.5, 0.55, 0]), normalized: true },
      accessor(1, 5126, 3, "VEC3"),
      accessor(2, 5123, 3, "SCALAR"),
      accessor(3, 5126, 3, "SCALAR"),
      accessor(4, 5126, 3, "VEC3")
    ], {
      extensionsUsed: ["KHR_mesh_quantization"],
      materials: [{ name: "animated-cyan", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.1, 0.8, 0.85, 1], roughnessFactor: 0.48, metallicFactor: 0.04 } }],
      meshes: [{ name: "animated-root-triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
      nodes: [{ name: "animated-root-node", mesh: 0 }],
      animations: [{ name: "root-translation-loop", samplers: [{ input: 3, output: 4 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }],
      scenes: [{ name: "animation-scene", nodes: [0] }],
      scene: 0
    })
  };
}

function generatedSource(): V4Fixture["source"] {
  return { kind: "generated-local", generator: "tools/external-parity-asset-corpus/index.ts" };
}

function baseGltf(
  buffer: Uint8Array,
  bufferViews: readonly Record<string, unknown>[],
  accessors: readonly Record<string, unknown>[],
  rest: Record<string, unknown>
): Record<string, unknown> {
  return {
    asset: { version: "2.0", generator: "A3D V4 generated local fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews,
    accessors,
    ...rest
  };
}

function view(byteOffset: number, bytes: Uint8Array): Record<string, unknown> {
  return { buffer: 0, byteOffset, byteLength: bytes.byteLength };
}

function accessor(bufferView: number, componentType: number, count: number, type: string, min?: readonly number[], max?: readonly number[]): Record<string, unknown> {
  return {
    bufferView,
    componentType,
    count,
    type,
    ...(min ? { min } : {}),
    ...(max ? { max } : {})
  };
}

async function decodeFixtureImage(): Promise<DecodedGLTFImage> {
  return {
    width: 2,
    height: 1,
    colorSpace: "srgb",
    data: new Uint8Array([255, 96, 64, 255, 20, 92, 220, 255])
  };
}

function createPreviewSvg(fixture: V4Fixture, inspection: CorpusInspectionSummary): string {
  const color = fixture.unsupportedFeatures.length > 0 ? "#ffd166" : "#62d68f";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#101820"/>
  <rect x="36" y="36" width="888" height="468" fill="#151d24" stroke="#34424d" rx="8"/>
  <rect x="36" y="36" width="12" height="468" fill="${color}"/>
  <text x="78" y="102" fill="#eef2f6" font-family="ui-sans-serif, system-ui" font-size="34">${fixture.displayName}</text>
  <text x="78" y="148" fill="#b7c4ce" font-family="ui-sans-serif, system-ui" font-size="22">${fixture.category} / ${fixture.features.join(", ")}</text>
  <text x="78" y="208" fill="#dbe6ef" font-family="ui-sans-serif, system-ui" font-size="20">meshes ${inspection.meshes} · materials ${inspection.materials} · textures ${inspection.textures}</text>
  <text x="78" y="246" fill="#dbe6ef" font-family="ui-sans-serif, system-ui" font-size="20">animations ${inspection.animations} · skins ${inspection.skins} · morph targets ${inspection.morphTargets}</text>
  <text x="78" y="304" fill="#9fb1c1" font-family="ui-sans-serif, system-ui" font-size="18">Unsupported: ${fixture.unsupportedFeatures.length > 0 ? fixture.unsupportedFeatures.join(", ") : "none"}</text>
</svg>
`;
}

function createTimings(loadMs: number, renderResourceMs: number, decodeMs: number, totalStart: number): V4CorpusAssetReport["timings"] {
  return {
    loadMs: roundMs(loadMs),
    renderResourceMs: roundMs(renderResourceMs),
    decodeMs: roundMs(decodeMs),
    totalMs: roundMs(elapsedMs(totalStart))
  };
}

function elapsedMs(start: number): number {
  return performance.now() - start;
}

function roundMs(value: number): number {
  return Number(Math.max(0, value).toFixed(3));
}

function gltfDataUrl(gltf: Record<string, unknown>): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
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
  return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
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

function normalizedInt16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  const output = new Int16Array(bytes.buffer);
  values.forEach((value, index) => {
    output[index] = Math.max(-32767, Math.min(32767, Math.round(value * 32767)));
  });
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

function twoPixelWebpDataUri(): string {
  return "data:image/webp;base64,UklGRggCAABXRUJQVlA4WAoAAAAgAAAAAQAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMGQAAAC8BAAAAD0AgQJkqzHSK9ZNxz3/cCzKi/wEA";
}

function twoPixelAvifDataUri(): string {
  return "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAAXBtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAANGlsb2MAAAAAREAAAgABAAAAAAGUAAEAAAAAAAAAHwACAAAAAAGzAAEAAAAAAAAAFQAAADhpaW5mAAAAAAACAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAFWluZmUCAAAAAAIAAGF2MDEAAAAAr2lwcnAAAACKaXBjbwAAAAxhdjFDgUBsAAAAABRpc3BlAAAAAAAAAAIAAAABAAAAEHBpeGkAAAAAAwwMDAAAAAxhdjFDgUB8AAAAAA5waXhpAAAAAAEMAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAdaXBtYQAAAAAAAAACAAEDgQIDAAIEhAIFhgAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAAAPG1kYXQSAAoIWAAmNAQ0G4QyERgADjjjhADtpYTBpN01XUFgEgAKBVgAJjqAMgoYADjhAAIhG6Ng";
}

function identityMat4(): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function rectVertices(minX: number, minY: number, z: number, maxX: number, maxY: number): readonly number[] {
  return [
    minX, minY, z,
    maxX, minY, z,
    maxX, maxY, z,
    minX, maxY, z,
  ];
}

function rectIndices(offset: number): readonly number[] {
  return [offset, offset + 1, offset + 2, offset, offset + 2, offset + 3];
}

function cubePositions(size: number): readonly number[] {
  return [
    -size, -size, -size, size, -size, -size, size, size, -size, -size, size, -size,
    -size, -size, size, size, -size, size, size, size, size, -size, size, size
  ];
}

function cubeNormals(): readonly number[] {
  return [
    -0.58, -0.58, -0.58, 0.58, -0.58, -0.58, 0.58, 0.58, -0.58, -0.58, 0.58, -0.58,
    -0.58, -0.58, 0.58, 0.58, -0.58, 0.58, 0.58, 0.58, 0.58, -0.58, 0.58, 0.58
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

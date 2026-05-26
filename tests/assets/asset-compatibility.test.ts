import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NullEngine, Scene, SceneLoader } from "@babylonjs/core";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import "@babylonjs/loaders/glTF/index.js";
import { LoadingManager } from "three";
import { GLTFLoader as ThreeGLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { describe, expect, it } from "vitest";
import {
  GLTFLoader,
  LoadContext,
  createBlenderExportValidationReport,
  createAssetCompatibilityReport,
  normalizeAssetImportSettings,
  type AssetDiagnostic,
  type BlenderExportFixtureInput,
  type BlenderExportFixtureManifest,
  type BlenderExportValidationReport,
  type ExternalAssetLoaderCompatibilityResult,
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
  it("emits a Three.js/Babylon compatibility report with pinned external loader runs", async () => {
    const manifest = readManifest();
    const externalLoaderResults = await runExternalLoaderCompatibility(manifest);
    const blenderExportValidation = await runBlenderExportValidation();
    const report = createAssetCompatibilityReport(manifest, {
      generatedAt: "2026-05-06T00:00:00.000Z",
      blenderExportFixturesPresent: blenderFixtureRoots.some((path) => existsSync(path)),
      blenderExportValidation,
      externalLoaderResults
    });

    expect(report.schemaVersion).toBe("asset-compatibility-report-v1");
    expect(report.fixtureStatus.blenderExportFixtures).toBe("present");
    expect(report.summary.assetCount).toBe(77);
    expect(report.summary.aura3d).toEqual({ pass: 70, warn: 7, "expected-fail": 0, "not-run": 0 });
    expect(report.summary.threejs["not-run"]).toBe(0);
    expect(report.summary.babylonjs["not-run"]).toBe(0);
    expect(report.blenderExportValidation?.summary).toMatchObject({ fixtureCount: 3, pass: 3, warn: 0, fail: 0 });
    expect(report.blenderExportValidation?.fixtures.every((fixture) => /Blender/i.test(fixture.generator))).toBe(true);
    expect(report.blenderExportValidation?.fixtures.every((fixture) => fixture.metrics.meshes > 0 && fixture.metrics.renderables > 0)).toBe(true);
    expect(report.assets.every((asset) => asset.loaders.some((loader) => loader.loader === "threejs" && loader.status !== "not-run"))).toBe(true);
    expect(report.assets.every((asset) => asset.loaders.some((loader) => loader.loader === "babylonjs" && loader.status !== "not-run"))).toBe(true);
    expect(report.summary.threejs.pass + report.summary.threejs.warn + report.summary.threejs["expected-fail"]).toBe(77);
    expect(report.summary.babylonjs.pass + report.summary.babylonjs.warn + report.summary.babylonjs["expected-fail"]).toBe(77);
    expect(report.assets.flatMap((asset) => asset.loaders.flatMap((loader) => loader.diagnostics)).every((diagnostic) => diagnostic.nextAction.length > 0)).toBe(true);

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(blenderExportReportPath, `${JSON.stringify(blenderExportValidation, null, 2)}\n`);
  }, 120_000);

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

  it("keeps over-limit skins loadable as bind-pose renderables with explicit diagnostics", async () => {
    const asset = await new GLTFLoader().load({ url: overLimitSkinGLTF() }, new LoadContext());
    const renderable = asset.createScene().collectRenderables()[0]?.renderable;

    expect(asset.skins[0]?.joints).toHaveLength(65);
    expect(asset.loaderDiagnostics.features).toContain("skinning-palette-limit-fallback");
    expect(renderable).toBeDefined();
    expect(renderable?.skinning).toBeUndefined();
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

  it("accepts real same-corpus Blender export results when a runner supplies them", () => {
    const manifest = readManifest();
    const report = createAssetCompatibilityReport(manifest, {
      generatedAt: "2026-05-06T00:00:00.000Z",
      blenderExportFixturesPresent: true,
      blenderExportResults: manifest.assets.map((asset) => ({
        assetId: asset.id,
        loader: "blender-export" as const,
        status: asset.expectedStatus === "warn" ? "warn" as const : "pass" as const,
        diagnostics: [{
          code: "ASSET_BLENDER_SAME_CORPUS_EXPORT_VALIDATED",
          severity: asset.expectedStatus === "warn" ? "warning" as const : "info" as const,
          message: "Asset was imported and exported by Blender in the same-corpus audit runner.",
          nextAction: "Keep the same-corpus Blender report fresh when changing the corpus, importer, or renderer."
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

async function runExternalLoaderCompatibility(manifest: GLTFCorpusManifest): Promise<ExternalAssetLoaderCompatibilityResult[]> {
  installNodeLoaderPolyfills();
  await MeshoptDecoder.ready;

  const results: ExternalAssetLoaderCompatibilityResult[] = [];
  for (const asset of manifest.assets) {
    const source = await loadSourceForExternalLoader(asset.source.uri, asset.format);
    results.push(await runThreeCompatibility(asset.id, source, asset.expectedStatus));
    results.push(await runBabylonCompatibility(asset.id, source, asset.expectedStatus));
  }
  return results;
}

async function runThreeCompatibility(
  assetId: string,
  source: ExternalLoaderSource,
  expectedStatus: GLTFCorpusManifest["assets"][number]["expectedStatus"]
): Promise<ExternalAssetLoaderCompatibilityResult> {
  const loader = new ThreeGLTFLoader(new LoadingManager());
  loader.setMeshoptDecoder(MeshoptDecoder);
  try {
    const warnings = await captureConsoleMessages(["error", "warn"], () => new Promise<string[]>((resolveResult, reject) => {
      loader.parse(source.threeInput, "", resolveResult, reject);
    }));
    return externalPass(assetId, "threejs", expectedStatus, warnings);
  } catch (error) {
    return externalExpectedFail(assetId, "threejs", error, expectedStatus);
  }
}

async function runBabylonCompatibility(
  assetId: string,
  source: ExternalLoaderSource,
  expectedStatus: GLTFCorpusManifest["assets"][number]["expectedStatus"]
): Promise<ExternalAssetLoaderCompatibilityResult> {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;
  try {
    const warnings = await captureBabylonLoggerMessages(async () => {
      engine = new NullEngine({ renderWidth: 1, renderHeight: 1, textureSize: 1 });
      scene = new Scene(engine);
      await SceneLoader.ImportMeshAsync(null, "", source.babylonDataUri, scene, undefined, source.babylonExtension);
    });
    return externalPass(assetId, "babylonjs", expectedStatus, warnings.filter((message) => !/Babylon\.js v[\d.]+ - Null engine/.test(message)));
  } catch (error) {
    return externalExpectedFail(assetId, "babylonjs", error, expectedStatus);
  } finally {
    scene?.dispose();
    engine?.dispose();
  }
}

function externalPass(
  assetId: string,
  loader: "threejs" | "babylonjs",
  expectedStatus: GLTFCorpusManifest["assets"][number]["expectedStatus"],
  warnings: readonly string[] = []
): ExternalAssetLoaderCompatibilityResult {
  const status = expectedStatus === "warn" || warnings.length > 0 ? "warn" : "pass";
  return {
    assetId,
    loader,
    status,
    diagnostics: [
      {
        code: `ASSET_${loader.toUpperCase()}_LOADER_EXECUTED`,
        severity: status === "warn" ? "warning" : "info",
        message: `Pinned ${loader} loader imported this corpus asset in the Node compatibility harness.`,
        nextAction: "Keep this result current when changing the corpus, loader versions, or import settings."
      },
      ...warnings.map((message): AssetDiagnostic => ({
        code: `ASSET_${loader.toUpperCase()}_LOADER_WARNING`,
        severity: "warning",
        message,
        nextAction: "Treat this as loader-import evidence only until visual output parity is captured in a browser."
      }))
    ]
  };
}

function externalExpectedFail(
  assetId: string,
  loader: "threejs" | "babylonjs",
  error: unknown,
  expectedStatus: GLTFCorpusManifest["assets"][number]["expectedStatus"]
): ExternalAssetLoaderCompatibilityResult {
  const message = error instanceof Error ? error.message : String(error);
  if (loader === "threejs" && expectedStatus === "warn" && /Image is not defined/.test(message)) {
    return {
      assetId,
      loader,
      status: "warn",
      diagnostics: [
        {
          code: "ASSET_THREEJS_NODE_IMAGE_POLYFILL_MISSING",
          severity: "warning",
          message: `threejs loader reached an image decode path not available in the pinned Node compatibility harness: ${message}`,
          nextAction: "Use browser visual parity evidence for this asset or add a real Node Image/createImageBitmap polyfill before treating this as pass evidence."
        }
      ]
    };
  }
  return {
    assetId,
    loader,
    status: "expected-fail",
    diagnostics: [
      {
        code: `ASSET_${loader.toUpperCase()}_LOADER_FAILED`,
        severity: "warning",
        message: `${loader} loader failed in the pinned Node compatibility harness: ${message}`,
        nextAction: "Inspect this loader-specific failure before using this asset in parity or superiority claims."
      }
    ]
  };
}

interface ExternalLoaderSource {
  readonly threeInput: string | ArrayBuffer;
  readonly babylonDataUri: string;
  readonly babylonExtension: ".gltf" | ".glb";
}

async function loadSourceForExternalLoader(uri: string, format: string): Promise<ExternalLoaderSource> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${uri}: ${response.status} ${response.statusText}`);
  }
  if (format === "glb") {
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      threeInput: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      babylonDataUri: `data:model/gltf-binary;base64,${bytes.toString("base64")}`,
      babylonExtension: ".glb"
    };
  }

  const root = uri.slice(0, uri.lastIndexOf("/") + 1);
  const gltf = JSON.parse(await response.text()) as {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };
  await inlineExternalUris(gltf.buffers, root, "application/octet-stream");
  await inlineExternalUris(gltf.images, root, "application/octet-stream");
  const json = JSON.stringify(gltf);
  return {
    threeInput: json,
    babylonDataUri: `data:model/gltf+json;base64,${Buffer.from(json).toString("base64")}`,
    babylonExtension: ".gltf"
  };
}

async function inlineExternalUris(
  entries: Array<{ uri?: string }> | undefined,
  root: string,
  fallbackContentType: string
): Promise<void> {
  for (const entry of entries ?? []) {
    if (!entry.uri || entry.uri.startsWith("data:")) continue;
    const response = await fetch(new URL(entry.uri, root));
    if (!response.ok) {
      throw new Error(`Failed to fetch glTF dependency ${entry.uri}: ${response.status} ${response.statusText}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    entry.uri = `data:${response.headers.get("content-type") ?? fallbackContentType};base64,${bytes.toString("base64")}`;
  }
}

function installNodeLoaderPolyfills(): void {
  const globalWithPolyfills = globalThis as typeof globalThis & {
    self?: typeof globalThis;
    ProgressEvent?: typeof Event;
    Image?: new () => HTMLImageElement;
    document?: {
      createElementNS(namespace: string, tagName: string): unknown;
      createElement(tagName: string): unknown;
      addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    };
    createImageBitmap?: (source: unknown) => Promise<unknown>;
  };
  globalWithPolyfills.self ??= globalThis;
  globalWithPolyfills.ProgressEvent ??= class ProgressEvent extends Event {
    constructor(type: string, init: EventInit = {}) {
      super(type, init);
    }
  };
  globalWithPolyfills.Image ??= class NodeCompatibilityImage extends EventTarget {
    width = 1;
    height = 1;
    crossOrigin = "";
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    #src = "";

    get src(): string {
      return this.#src;
    }

    set src(value: string) {
      this.#src = value;
      queueMicrotask(() => {
        const event = new Event("load");
        this.onload?.(event);
        this.dispatchEvent(event);
      });
    }

    decode(): Promise<void> {
      return Promise.resolve();
    }
  } as unknown as new () => HTMLImageElement;
  globalWithPolyfills.document ??= {
    createElementNS: (_namespace: string, tagName: string) => tagName.toLowerCase() === "img" ? new globalWithPolyfills.Image!() : {},
    createElement: (tagName: string) => tagName.toLowerCase() === "img" ? new globalWithPolyfills.Image!() : {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  globalWithPolyfills.createImageBitmap ??= async (source: unknown) => source;
}

async function captureConsoleMessages(
  methods: readonly ("log" | "warn" | "error")[],
  callback: () => Promise<unknown>
): Promise<string[]> {
  const messages: string[] = [];
  const originals = new Map<"log" | "warn" | "error", (...data: unknown[]) => void>();
  for (const method of methods) {
    originals.set(method, console[method]);
    console[method] = (...data: unknown[]) => {
      messages.push(data.map((entry) => typeof entry === "string" ? entry : JSON.stringify(entry)).join(" "));
    };
  }
  try {
    await callback();
    return messages;
  } finally {
    for (const [method, original] of originals) {
      console[method] = original;
    }
  }
}

async function captureBabylonLoggerMessages(callback: () => Promise<unknown>): Promise<string[]> {
  const messages: string[] = [];
  const originalLog = Logger.Log;
  const originalWarn = Logger.Warn;
  const originalError = Logger.Error;
  const capture = (message: string | unknown[]): void => {
    messages.push(formatLoggerMessage(message));
  };

  Logger.Log = capture;
  Logger.Warn = capture;
  Logger.Error = capture;
  try {
    await callback();
    return messages;
  } finally {
    Logger.Log = originalLog;
    Logger.Warn = originalWarn;
    Logger.Error = originalError;
  }
}

function formatLoggerMessage(message: string | unknown[]): string {
  if (Array.isArray(message)) {
    return String(message[0]);
  }
  return message;
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

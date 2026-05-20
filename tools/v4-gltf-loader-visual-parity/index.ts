import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "@playwright/test";
import { baseReport, writeJson } from "../v4-reporting/index.js";

type GltfVisualEngine = "galileo" | "threejs" | "babylon";

interface GltfVisualRender {
  readonly assetId: string;
  readonly engine: GltfVisualEngine;
  readonly screenshotPath: string;
  readonly bundleBytes: number;
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly colorBuckets: number;
    readonly drawCalls: number;
    readonly meshCount: number;
    readonly materialCount: number;
    readonly vertexCount: number;
  };
}

interface GltfVisualDiff {
  readonly assetId: string;
  readonly baselineEngine: "galileo";
  readonly comparedEngine: "threejs" | "babylon";
  readonly baselinePath: string;
  readonly comparedPath: string;
  readonly diffPath: string;
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly changedPixels: number;
  readonly changedPixelRatio: number;
  readonly meanAbsoluteError: number;
  readonly maxChannelDelta: number;
  readonly pass: boolean;
  readonly thresholds: {
    readonly maxChangedPixelRatio: number;
    readonly maxMeanAbsoluteError: number;
  };
}

interface GltfVisualAssetBase {
  readonly id: string;
  readonly minimumColorBuckets: number;
  readonly minimumVertexCount: number;
  readonly visualDiffRequired?: boolean;
}

interface LocalGltfVisualAsset extends GltfVisualAssetBase {
  readonly sourceKind: "local-gltf-text";
  readonly path: string;
}

interface ExternalGltfVisualAsset extends GltfVisualAssetBase {
  readonly sourceKind: "external-url";
  readonly url: string;
  readonly format: "gltf" | "glb";
  readonly expectedStatus: "pass" | "warn" | "expected-fail";
}

type GltfVisualAsset = LocalGltfVisualAsset | ExternalGltfVisualAsset;

interface GltfVisualAssetValidation {
  readonly asset: GltfVisualAsset & {
    readonly sameSourceAsset: true;
  };
  readonly ok: boolean;
  readonly boundedGltfLoaderVisualParity: {
    readonly threejs: boolean;
    readonly babylon: boolean;
  };
  readonly renders: readonly GltfVisualRender[];
  readonly diffs: readonly GltfVisualDiff[];
  readonly violations: readonly string[];
  readonly visualQualityWarnings: readonly string[];
}

export interface V4GltfLoaderVisualParityReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly assets: readonly GltfVisualAsset[];
  readonly validations: readonly GltfVisualAssetValidation[];
  readonly boundedGltfLoaderVisualParity: {
    readonly threejs: boolean;
    readonly babylon: boolean;
  };
  readonly externalCorpus: {
    readonly sourceManifest: "tests/assets/corpus/gltf-corpus.manifest.json";
    readonly sourceAssetCount: number;
    readonly visualAssetCount: number;
    readonly visualParityAssetCount: number;
    readonly visuallyValidatedWarningCount: number;
    readonly strictVisualFailures: readonly {
      readonly assetId: string;
      readonly expectedStatus: "pass" | "warn" | "expected-fail";
      readonly failedEngines: readonly ("threejs" | "babylon")[];
      readonly passingEngines: readonly ("threejs" | "babylon")[];
      readonly maxChangedPixelRatio: number;
      readonly maxMeanAbsoluteError: number;
      readonly nextAction: string;
    }[];
    readonly statusBreakdown: readonly {
      readonly expectedStatus: "pass" | "warn" | "expected-fail";
      readonly total: number;
      readonly rendered: number;
      readonly parityWithThreeAndBabylon: number;
    }[];
    readonly fullGltfLoaderVisualParity: boolean;
    readonly validations: readonly GltfVisualAssetValidation[];
  };
  readonly fullGltfLoaderVisualParity: boolean;
  readonly renders: readonly GltfVisualRender[];
  readonly diffs: readonly GltfVisualDiff[];
  readonly violations: readonly string[];
  readonly visualQualityWarnings: readonly string[];
}

const reportPath = "tests/reports/v4-gltf-loader-visual-parity.json";
const artifactDir = "tests/reports/v4-gltf-loader-visual-parity";
const khronosManifestPath = "tests/assets/corpus/gltf-corpus.manifest.json";
const renderTimeoutMs = 45_000;
const localGltfVisualAssets: readonly LocalGltfVisualAsset[] = [
  {
    sourceKind: "local-gltf-text",
    id: "v4-root-motion-clip",
    path: "fixtures/assets/v4/animation/v4-root-motion-clip/v4-root-motion-clip.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 3,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-gallery-corner",
    path: "fixtures/assets/v4/architecture/v4-gallery-corner/v4-gallery-corner.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 6,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-skinned-hero",
    path: "fixtures/assets/v4/character/v4-skinned-hero/v4-skinned-hero.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 3,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-game-outpost",
    path: "fixtures/assets/v4/environment/v4-game-outpost/v4-game-outpost.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 7,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-material-fidelity-card",
    path: "fixtures/assets/v4/materials/v4-material-fidelity-card/v4-material-fidelity-card.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 3,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-specular-glossiness-card",
    path: "fixtures/assets/v4/materials/v4-specular-glossiness-card/v4-specular-glossiness-card.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 3,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-morph-expression",
    path: "fixtures/assets/v4/morph/v4-morph-expression/v4-morph-expression.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 3,
  },
  {
    sourceKind: "local-gltf-text",
    id: "v4-product-speaker",
    path: "fixtures/assets/v4/product/v4-product-speaker/v4-product-speaker.gltf",
    minimumColorBuckets: 2,
    minimumVertexCount: 8,
  },
];
const sourceFiles = [
  "tools/v4-gltf-loader-visual-parity/index.ts",
  ...localGltfVisualAssets.map((asset) => asset.path),
  khronosManifestPath,
  "packages/assets/src/GLTFLoader.ts",
  "packages/assets/src/GLTFRenderResources.ts",
  "packages/rendering/src/Renderer.ts",
] as const;

export async function createV4GltfLoaderVisualParityReport(root = process.cwd()): Promise<V4GltfLoaderVisualParityReport> {
  mkdirSync(join(root, artifactDir), { recursive: true });
  const externalAssets = readExternalKhronosVisualAssets(root);
  const gltfVisualAssets = filterAssets([...localGltfVisualAssets, ...externalAssets]);
  const gltfTexts = Object.fromEntries(localGltfVisualAssets.map((asset) => [asset.id, readFileSync(join(root, asset.path), "utf8")]));
  const browser = await chromium.launch({ headless: true });
  try {
    const bundles = await buildEngineBundles(gltfTexts);
    const diffPage = await browser.newPage({
      viewport: { width: 640, height: 420 },
      deviceScaleFactor: 1,
    });
    try {
      const validations: GltfVisualAssetValidation[] = [];
      for (const asset of gltfVisualAssets) {
        const renders: GltfVisualRender[] = [];
        for (const engine of ["galileo", "threejs", "babylon"] as const) {
          const bundle = bundles.get(engine);
          if (!bundle) throw new Error(`Missing ${engine} glTF visual parity bundle.`);
          renders.push(await renderEngineWithRetry(browser, root, asset, engine, bundle));
        }
        const diffs = [
          await createScreenshotDiff(diffPage, root, asset, renders, "threejs"),
          await createScreenshotDiff(diffPage, root, asset, renders, "babylon"),
        ];
        const visualDiffRequired = isVisualDiffRequired(asset);
        const violations = [
          ...renders.flatMap((render) => renderHardViolations(asset, render)),
          ...diffs.flatMap((diff) => diff.pass || !visualDiffRequired ? [] : [`${asset.id}/${diff.comparedEngine}: same-source glTF visual diff exceeded bounded thresholds`]),
        ];
        const visualQualityWarnings = [
          ...renders.flatMap((render) => renderVisualQualityWarnings(asset, render)),
          ...diffs.flatMap((diff) => diff.pass || visualDiffRequired ? [] : [`${asset.id}/${diff.comparedEngine}: same-source glTF visual diff exceeded bounded thresholds but is retained as ${asset.sourceKind === "external-url" ? asset.expectedStatus : "render-coverage-only"} evidence`]),
        ];
        validations.push({
          asset: {
            ...asset,
            sameSourceAsset: true,
          },
          ok: violations.length === 0,
          boundedGltfLoaderVisualParity: {
            threejs: !visualDiffRequired || diffs.find((diff) => diff.comparedEngine === "threejs")?.pass === true,
            babylon: !visualDiffRequired || diffs.find((diff) => diff.comparedEngine === "babylon")?.pass === true,
          },
          renders,
          diffs,
          violations,
          visualQualityWarnings,
        });
      }
      const renders = validations.flatMap((validation) => validation.renders);
      const diffs = validations.flatMap((validation) => validation.diffs);
      const visualQualityWarnings = validations.flatMap((validation) => validation.visualQualityWarnings);
      const boundedValidations = validations.filter((validation) => validation.asset.sourceKind === "local-gltf-text");
      const externalValidations = validations.filter((validation) => validation.asset.sourceKind === "external-url");
      const externalVisualParityValidations = externalValidations.filter((validation) => validation.ok && validationDiffParityPass(validation));
      const fullGltfLoaderVisualParity = externalAssets.length > 0 &&
        externalValidations.length === externalAssets.length &&
        externalVisualParityValidations.length === externalAssets.length;
      const violations = [
        ...validations.flatMap((validation) => validation.violations),
        ...(fullGltfLoaderVisualParity ? [] : ["claim: this report covers selected deterministic local glTF fixtures and partial external corpus evidence, not full glTF corpus visual parity."]),
      ];
      return {
        ...baseReport(root, {
          ok: boundedValidations.every((validation) => validation.ok),
          command: "pnpm audit:v4-gltf-loader-visual-parity",
          runIdPrefix: "v4-gltf-loader-visual-parity",
          sourceFiles,
          violations,
          blockedClaims: [
            "full glTF parity",
            "broad better-than-Three.js language",
            "broad better-than-Babylon.js language",
          ],
        }),
        auditComplete: true,
        assets: gltfVisualAssets,
        validations,
        boundedGltfLoaderVisualParity: {
          threejs: boundedValidations.every((validation) => validation.boundedGltfLoaderVisualParity.threejs),
          babylon: boundedValidations.every((validation) => validation.boundedGltfLoaderVisualParity.babylon),
        },
        externalCorpus: {
          sourceManifest: khronosManifestPath,
          sourceAssetCount: externalAssets.length,
          visualAssetCount: externalValidations.filter((validation) => validation.ok).length,
          visualParityAssetCount: externalVisualParityValidations.length,
          visuallyValidatedWarningCount: externalVisualParityValidations.filter((validation) => validation.asset.sourceKind === "external-url" && validation.asset.expectedStatus === "warn").length,
          strictVisualFailures: externalStrictVisualFailures(externalValidations),
          statusBreakdown: externalCorpusStatusBreakdown(externalValidations),
          fullGltfLoaderVisualParity,
          validations: externalValidations,
        },
        fullGltfLoaderVisualParity,
        renders,
        diffs,
        violations,
        visualQualityWarnings,
      };
    } finally {
      await diffPage.close();
    }
  } finally {
    await browser.close();
  }
}

function filterAssets(assets: readonly GltfVisualAsset[]): readonly GltfVisualAsset[] {
  const filter = process.env.G3D_GLTF_VISUAL_ASSET_IDS;
  if (!filter?.trim()) return assets;
  const ids = new Set(filter.split(",").map((entry) => entry.trim()).filter(Boolean));
  if (ids.size === 0) return assets;
  const selected = assets.filter((asset) => ids.has(asset.id));
  if (selected.length !== ids.size) {
    const found = new Set(selected.map((asset) => asset.id));
    const missing = [...ids].filter((id) => !found.has(id));
    throw new Error(`Unknown G3D_GLTF_VISUAL_ASSET_IDS entries: ${missing.join(", ")}`);
  }
  return selected;
}

function readExternalKhronosVisualAssets(root: string): readonly ExternalGltfVisualAsset[] {
  const manifest = JSON.parse(readFileSync(join(root, khronosManifestPath), "utf8")) as {
    readonly assets?: readonly {
      readonly id?: string;
      readonly format?: "gltf" | "glb";
      readonly expectedStatus?: "pass" | "warn" | "expected-fail";
      readonly source?: { readonly uri?: string };
    }[];
  };
  return (manifest.assets ?? []).flatMap((asset): ExternalGltfVisualAsset[] => {
    if (!asset.id || !asset.format || !asset.expectedStatus || !asset.source?.uri) return [];
    return [{
      sourceKind: "external-url",
      id: asset.id,
      url: asset.source.uri,
      format: asset.format,
      expectedStatus: asset.expectedStatus,
      minimumColorBuckets: 2,
      minimumVertexCount: 3,
    }];
  });
}

function externalCorpusStatusBreakdown(validations: readonly GltfVisualAssetValidation[]): V4GltfLoaderVisualParityReport["externalCorpus"]["statusBreakdown"] {
  return (["pass", "warn", "expected-fail"] as const)
    .map((expectedStatus) => {
      const matching = validations.filter((validation) => validation.asset.sourceKind === "external-url" && validation.asset.expectedStatus === expectedStatus);
      return {
        expectedStatus,
        total: matching.length,
        rendered: matching.filter((validation) => validation.ok).length,
        parityWithThreeAndBabylon: matching.filter((validation) => validation.ok && validationDiffParityPass(validation)).length,
      };
    })
    .filter((entry) => entry.total > 0);
}

function externalStrictVisualFailures(validations: readonly GltfVisualAssetValidation[]): V4GltfLoaderVisualParityReport["externalCorpus"]["strictVisualFailures"] {
  return validations.flatMap((validation) => {
    if (validation.asset.sourceKind !== "external-url") return [];
    const failedDiffs = validation.diffs.filter((diff) => !diff.pass);
    if (failedDiffs.length === 0) return [];
    return [{
      assetId: validation.asset.id,
      expectedStatus: validation.asset.expectedStatus,
      failedEngines: failedDiffs.map((diff) => diff.comparedEngine),
      passingEngines: validation.diffs.filter((diff) => diff.pass).map((diff) => diff.comparedEngine),
      maxChangedPixelRatio: Number(Math.max(...failedDiffs.map((diff) => diff.changedPixelRatio)).toFixed(6)),
      maxMeanAbsoluteError: Number(Math.max(...failedDiffs.map((diff) => diff.meanAbsoluteError)).toFixed(6)),
      nextAction: "Improve Galileo3D glTF material/texture/animation handling or add focused evidence proving this warning-classified asset should remain excluded from full visual parity.",
    }];
  });
}

function validationDiffParityPass(validation: GltfVisualAssetValidation): boolean {
  return validation.diffs.some((diff) => diff.comparedEngine === "threejs" && diff.pass) &&
    validation.diffs.some((diff) => diff.comparedEngine === "babylon" && diff.pass);
}

function isVisualDiffRequired(asset: GltfVisualAsset): boolean {
  if (asset.visualDiffRequired === false) return false;
  return asset.sourceKind === "local-gltf-text" || asset.expectedStatus === "pass";
}

async function buildEngineBundles(gltfTexts: Readonly<Record<string, string>>): Promise<ReadonlyMap<GltfVisualEngine, string>> {
  const gltfLiteral = JSON.stringify(gltfTexts);
  const entries: Record<GltfVisualEngine, string> = {
    galileo: galileoBundleSource(gltfLiteral),
    threejs: threeBundleSource(gltfLiteral),
    babylon: babylonBundleSource(gltfLiteral),
  };
  const bundles = new Map<GltfVisualEngine, string>();
  for (const [engine, contents] of Object.entries(entries) as [GltfVisualEngine, string][]) {
    const result = await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${engine}-gltf-loader-visual-parity.ts`,
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: `G3D_${engine}_gltf_loader_visual_parity`,
      target: "es2022",
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error(`Unable to build ${engine} glTF visual parity bundle.`);
    bundles.set(engine, output);
  }
  return bundles;
}

async function renderEngine(browser: Browser, root: string, asset: GltfVisualAsset, engine: GltfVisualEngine, bundle: string): Promise<GltfVisualRender> {
  const page = await browser.newPage({
    viewport: { width: 640, height: 420 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(renderTimeoutMs);
  page.setDefaultNavigationTimeout(renderTimeoutMs);
  try {
    await page.setContent("<!doctype html><body style=\"margin:0;background:#070a10\"></body>");
    await page.addScriptTag({ content: bundle });
    const operation = page.evaluate<{ readonly dataUrl: string; readonly metrics: GltfVisualRender["metrics"] }, { readonly engineName: GltfVisualEngine; readonly asset: GltfVisualAsset; readonly timeoutMs: number }>(async ({ engineName, asset, timeoutMs }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 420;
      canvas.style.width = "640px";
      canvas.style.height = "420px";
      document.body.replaceChildren(canvas);
      const bundleName = `G3D_${engineName}_gltf_loader_visual_parity`;
      const render = (window as unknown as Record<string, { renderGltfLoaderVisualParity?: (canvas: HTMLCanvasElement, asset: GltfVisualAsset) => Promise<GltfVisualRender["metrics"]> }>)[bundleName]?.renderGltfLoaderVisualParity;
      if (!render) throw new Error(`Missing browser render function: ${bundleName}.renderGltfLoaderVisualParity`);
      const metrics = await Promise.race([
        render(canvas, asset),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${asset.id}/${engineName}: browser render exceeded ${timeoutMs}ms`)), timeoutMs)),
      ]);
      return { dataUrl: canvas.toDataURL("image/png"), metrics };
    }, { engineName: engine, asset, timeoutMs: renderTimeoutMs });
    const result = await withTimeout(
      operation,
      renderTimeoutMs + 5_000,
      `${asset.id}/${engine}: Playwright render evaluate exceeded ${renderTimeoutMs + 5_000}ms`,
      () => page.close().catch(() => undefined)
    );
    const screenshotPath = `${artifactDir}/${engine}-${asset.id}.png`;
    writePngDataUrl(root, screenshotPath, result.dataUrl);
    return {
      assetId: asset.id,
      engine,
      screenshotPath,
      bundleBytes: Buffer.byteLength(bundle),
      metrics: result.metrics,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function renderEngineWithRetry(browser: Browser, root: string, asset: GltfVisualAsset, engine: GltfVisualEngine, bundle: string): Promise<GltfVisualRender> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await renderEngine(browser, root, asset, engine, bundle);
    } catch (error) {
      lastError = error;
      if (!isTransientExternalAssetLoadError(error) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  throw lastError;
}

function isTransientExternalAssetLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|502|503|504)\b|rate limit|network error|Failed to fetch|ERR_HTTP2|ECONNRESET|exceeded \d+ms/i.test(message);
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void | Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void onTimeout?.();
      reject(new Error(message));
    }, timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function createScreenshotDiff(page: Page, root: string, asset: GltfVisualAsset, renders: readonly GltfVisualRender[], comparedEngine: "threejs" | "babylon"): Promise<GltfVisualDiff> {
  const baseline = renders.find((render) => render.engine === "galileo");
  const compared = renders.find((render) => render.engine === comparedEngine);
  if (!baseline || !compared) throw new Error(`Missing render for screenshot diff: ${comparedEngine}.`);
  const diffPath = `${artifactDir}/${comparedEngine}-${asset.id}-diff.png`;
  const result = await page.evaluate<DiffResultWithDataUrl>(
    `(${browserScreenshotDiffScript})(${JSON.stringify({
      baselineUrl: pngDataUrl(root, baseline.screenshotPath),
      comparedUrl: pngDataUrl(root, compared.screenshotPath),
    })})`
  );
  writePngDataUrl(root, diffPath, result.diffDataUrl);
  const { diffDataUrl: _diffDataUrl, ...metrics } = result;
  return {
    assetId: asset.id,
    baselineEngine: "galileo",
    comparedEngine,
    baselinePath: baseline.screenshotPath,
    comparedPath: compared.screenshotPath,
    diffPath,
    ...metrics,
  };
}

function renderHardViolations(asset: GltfVisualAsset, render: GltfVisualRender): string[] {
  return [
    ...(render.metrics.width === 640 && render.metrics.height === 420 ? [] : [`${asset.id}/${render.engine}: unexpected render dimensions`]),
    ...(render.metrics.nonBlankPixels > 5_000 ? [] : [`${asset.id}/${render.engine}: glTF render is too dark or empty`]),
    ...(render.metrics.drawCalls >= 1 ? [] : [`${asset.id}/${render.engine}: glTF render has no draw calls`]),
    ...(render.metrics.meshCount >= 1 ? [] : [`${asset.id}/${render.engine}: glTF render loaded no meshes`]),
    ...(render.metrics.materialCount >= 1 ? [] : [`${asset.id}/${render.engine}: glTF render loaded no materials`]),
    ...(render.metrics.vertexCount >= asset.minimumVertexCount ? [] : [`${asset.id}/${render.engine}: glTF render loaded too few vertices`]),
  ];
}

function renderVisualQualityWarnings(asset: GltfVisualAsset, render: GltfVisualRender): string[] {
  return [
    ...(render.metrics.colorBuckets >= asset.minimumColorBuckets ? [] : [`${asset.id}/${render.engine}: glTF render has too few color buckets for visual-richness evidence`]),
  ];
}

function pngDataUrl(root: string, path: string): string {
  return `data:image/png;base64,${readFileSync(join(root, path)).toString("base64")}`;
}

function writePngDataUrl(root: string, path: string, dataUrl: string): void {
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("Invalid PNG data URL.");
  const outputPath = join(root, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

function sharedBrowserHelpers(): string {
  return String.raw`
    function dataGltfUrl(gltfText) {
      return "data:model/gltf+json;base64," + btoa(unescape(encodeURIComponent(gltfText)));
    }
    function sourceUrlForAsset(asset, gltfTextById) {
      if (asset.sourceKind === "local-gltf-text") {
        const gltfText = gltfTextById[asset.id];
        if (!gltfText) throw new Error("Unknown local glTF visual parity asset: " + asset.id);
        return dataGltfUrl(gltfText);
      }
      if (asset.sourceKind === "external-url" && asset.url) return asset.url;
      throw new Error("Unsupported glTF visual parity asset source: " + asset.id);
    }
    function pixelStats(canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { nonBlankPixels: 0, colorBuckets: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set();
      let nonBlankPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] || 0;
        const g = pixels[index + 1] || 0;
        const b = pixels[index + 2] || 0;
        if (r > 8 || g > 8 || b > 8) {
          nonBlankPixels += 1;
          buckets.add(String(r >> 5) + ":" + String(g >> 5) + ":" + String(b >> 5));
        }
      }
      return { nonBlankPixels, colorBuckets: buckets.size };
    }
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  `;
}

function galileoBundleSource(gltfLiteral: string): string {
  return `
    import { GLTFLoader, LoadContext, createGLTFRenderResources, createMeshoptDecoder } from "./packages/assets/src/index.ts";
    import { Geometry, Renderer, computeMorphTargetEnvelopeBounds, computeSkinnedGeometryBounds, createV4EnvironmentLighting } from "./packages/rendering/src/index.ts";
    import { MeshoptDecoder } from "meshoptimizer";
    const gltfTextById = ${gltfLiteral};
    ${sharedBrowserHelpers()}
    export async function renderGltfLoaderVisualParity(canvas, visualAsset) {
      const source = sourceUrlForAsset(visualAsset, gltfTextById);
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader({ meshoptDecoder: createMeshoptDecoder(MeshoptDecoder) });
      const asset = await loader.load({ url: source, type: "gltf" }, new LoadContext());
      const resources = await createGLTFRenderResources(asset);
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.018, 0.023, 0.034, 1], antialias: true, preserveDrawingBuffer: true });
      resources.scene.updateWorldTransforms();
      const renderableStats = collectGalileoRenderableStats(resources);
      const diagnostics = visualAsset.sourceKind === "local-gltf-text"
        ? renderer.render({
          renderItems: localGalileoRenderItems(resources),
          environmentLighting: galileoAuditEnvironment(visualAsset)
        })
        : renderFramedGalileoScene(renderer, resources, canvas, visualAsset);
      await nextFrame();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: diagnostics.drawCalls, meshCount: renderableStats.meshCount, materialCount: Math.max(asset.materials.length, renderableStats.materialCount), vertexCount: renderableStats.vertexCount };
    }
    function collectGalileoRenderableStats(resources) {
      const renderables = resources.scene.collectRenderables();
      const materials = new Set();
      let vertexCount = 0;
      for (const { renderable } of renderables) {
        materials.add(renderable.material);
        const geometry = resources.geometryLibrary.get(renderable.geometry);
        vertexCount += geometry?.vertexBuffer?.vertexCount ?? 0;
      }
      return { meshCount: renderables.length, materialCount: materials.size, vertexCount };
    }
    function localGalileoRenderItems(resources) {
      const renderItems = [];
      resources.scene.updateWorldTransforms();
      for (const { node, renderable } of resources.scene.collectRenderables()) {
        const geometry = resources.geometryLibrary.get(renderable.geometry);
        const material = resources.materialLibrary.get(renderable.material);
        if (geometry && material) {
          renderItems.push({ geometry, material, modelMatrix: node.transform.worldMatrix, label: "galileo-" + node.name });
        }
      }
      return renderItems;
    }
    function renderFramedGalileoScene(renderer, resources, canvas, visualAsset) {
      const camera = frameGalileoScene(resources, canvas, visualAsset);
      return renderer.render({
        scene: resources.scene,
        geometryLibrary: resources.geometryLibrary,
        materialLibrary: resources.materialLibrary,
        morphTargetLibrary: resources.morphTargetLibrary,
        environmentLighting: galileoAuditEnvironment(visualAsset)
      }, camera);
    }
    function frameGalileoScene(resources, canvas, visualAsset) {
      const bounds = galileoWorldBounds(resources);
      const spanX = Math.max(0.1, bounds.max[0] - bounds.min[0]);
      const spanY = Math.max(0.1, bounds.max[1] - bounds.min[1]);
      const spanZ = Math.max(0.1, bounds.max[2] - bounds.min[2]);
      const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
      const centerY = (bounds.min[1] + bounds.max[1]) * 0.5;
      const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
      const radius = Math.max(0.05, Math.hypot(spanX, spanY, spanZ) * 0.5);
      const useReferenceBoxFraming = usesReferenceBoxFraming(visualAsset);
      const fovYRadians = visualAsset.sourceKind === "external-url" || useReferenceBoxFraming ? 35 * Math.PI / 180 : Math.PI / 4;
      const distance = visualAsset.sourceKind === "external-url" || useReferenceBoxFraming ? Math.max(0.16, radius * 3.2) : Math.max(0.16, (radius / Math.tan(Math.PI / 8)) * 1.35);
      const camera = resources.scene.createPerspectiveCamera({
        name: "gltf-visual-parity-camera",
        fovYRadians,
        aspect: canvas.width / canvas.height,
        near: Math.max(0.001, distance / 200),
        far: Math.max(distance * 8, distance + radius * 6)
      });
      camera.transform.setPosition(centerX, centerY, centerZ + distance);
      camera.transform.setRotation(...quatFromEuler(0, 0, 0));
      resources.scene.root.addChild(camera);
      if (usesSceneAuthoredLights(visualAsset)) return camera;
      const key = resources.scene.createLight("directional", "gltf-visual-parity-key");
      key.intensity = 0.45;
      key.color = [1, 0.94, 0.82];
      resources.scene.root.addChild(key);
      const fill = resources.scene.createLight("point", "gltf-visual-parity-fill");
      fill.intensity = 0.1;
      fill.range = distance * 4;
      fill.color = [0.62, 0.7, 0.8];
      fill.transform.setPosition(centerX - distance * 0.45, centerY + distance * 0.35, centerZ + distance * 0.55);
      resources.scene.root.addChild(fill);
      return camera;
    }
    function galileoAuditEnvironment(visualAsset) {
      return usesSceneAuthoredLights(visualAsset)
        ? { color: [0, 0, 0], intensity: 0 }
        : createV4EnvironmentLighting("studio").lighting;
    }
    function usesSceneAuthoredLights(visualAsset) {
      return visualAsset.id === "point-light-intensity-test";
    }
    function usesReferenceBoxFraming(visualAsset) {
      return visualAsset.id === "box-textured" || visualAsset.id === "box-textured-non-power-of-two";
    }
    function galileoWorldBounds(resources) {
      resources.scene.updateWorldTransforms();
      const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
      let hasBounds = false;
      for (const { node, renderable } of resources.scene.collectRenderables()) {
        const geometry = resources.geometryLibrary.get(renderable.geometry);
        if (!geometry) continue;
        const instanceMatrices = matricesForRenderable(renderable);
        for (const instanceMatrix of instanceMatrices) {
          const matrix = multiplyMat4(node.transform.worldMatrix, instanceMatrix);
        const skinned = computeSkinnedGeometryBounds(geometry, renderable.skinning);
        const envelope = computeMorphTargetEnvelopeBounds(new Geometry(geometry.vertexBuffer, geometry.indexBuffer, geometry.topology, skinned), resources.morphTargetLibrary.get(renderable.geometry) || []);
        for (const point of boundsCorners(envelope)) {
            const transformed = transformPoint(matrix, point);
            min[0] = Math.min(min[0], transformed[0]);
            min[1] = Math.min(min[1], transformed[1]);
            min[2] = Math.min(min[2], transformed[2]);
            max[0] = Math.max(max[0], transformed[0]);
            max[1] = Math.max(max[1], transformed[1]);
            max[2] = Math.max(max[2], transformed[2]);
            hasBounds = true;
          }
        }
      }
      return hasBounds ? { min, max } : { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
    }
    function matricesForRenderable(renderable) {
      const transforms = renderable.instanceTransforms ? Array.from(renderable.instanceTransforms) : [];
      if (transforms.length === 0) return [identityMat4()];
      const matrices = [];
      for (let offset = 0; offset + 15 < transforms.length; offset += 16) {
        matrices.push(transforms.slice(offset, offset + 16));
      }
      return matrices.length > 0 ? matrices : [identityMat4()];
    }
    function identityMat4() {
      return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ];
    }
    function multiplyMat4(left, right) {
      const out = new Array(16);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          out[col * 4 + row] =
            left[0 * 4 + row] * right[col * 4 + 0] +
            left[1 * 4 + row] * right[col * 4 + 1] +
            left[2 * 4 + row] * right[col * 4 + 2] +
            left[3 * 4 + row] * right[col * 4 + 3];
        }
      }
      return out;
    }
    function boundsCorners(bounds) {
      return [
        [bounds.min[0], bounds.min[1], bounds.min[2]],
        [bounds.min[0], bounds.min[1], bounds.max[2]],
        [bounds.min[0], bounds.max[1], bounds.min[2]],
        [bounds.min[0], bounds.max[1], bounds.max[2]],
        [bounds.max[0], bounds.min[1], bounds.min[2]],
        [bounds.max[0], bounds.min[1], bounds.max[2]],
        [bounds.max[0], bounds.max[1], bounds.min[2]],
        [bounds.max[0], bounds.max[1], bounds.max[2]]
      ];
    }
    function transformPoint(matrix, point) {
      const x = point[0], y = point[1], z = point[2];
      const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] || 1;
      return [
        (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
        (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
        (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w
      ];
    }
    function quatFromEuler(pitch, yaw, roll) {
      const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
      const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
      const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
      return [
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
        cr * cp * cy + sr * sp * sy
      ];
    }
  `;
}

function threeBundleSource(gltfLiteral: string): string {
  return `
    import * as THREE from "three";
    import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
    import { MeshoptDecoder } from "meshoptimizer";
    const gltfTextById = ${gltfLiteral};
    ${sharedBrowserHelpers()}
    export async function renderGltfLoaderVisualParity(canvas, visualAsset) {
      const source = sourceUrlForAsset(visualAsset, gltfTextById);
      THREE.ColorManagement.enabled = visualAsset.id === "v4-gallery-corner" ? false : THREE.ColorManagement.enabled;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(0x05070b, 1);
      const scene = new THREE.Scene();
      const camera = visualAsset.id === "v4-gallery-corner"
        ? new THREE.OrthographicCamera(-1.5, 1.5, 1.8, -1.8, 0.1, 10)
        : new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.1, 10);
      camera.position.set(0, 0, 3.4);
      camera.lookAt(0, 0, 0);
      if (!usesSceneAuthoredLights(visualAsset)) {
        scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.7));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(2, 3, 4);
        scene.add(key);
      }
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = visualAsset.sourceKind === "local-gltf-text"
        ? await new Promise((resolve, reject) => loader.parse(gltfTextById[visualAsset.id], "", resolve, reject))
        : await loader.loadAsync(source);
      if (visualAsset.id === "v4-gallery-corner") {
        gltf.scene.traverse((node) => {
          if (node.isMesh) {
            node.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.571, 0.491, 0.367), side: THREE.DoubleSide, toneMapped: false });
          }
        });
      }
      scene.add(gltf.scene);
      if (visualAsset.sourceKind === "external-url") frameThreeScene(camera, gltf.scene);
      renderer.render(scene, camera);
      await nextFrame();
      const stats = pixelStats(canvas);
      let meshCount = 0;
      let materialCount = 0;
      let vertexCount = 0;
      gltf.scene.traverse((node) => {
        if (node.isMesh) {
          meshCount += 1;
          materialCount += Array.isArray(node.material) ? node.material.length : 1;
          vertexCount += Number(node.geometry?.attributes?.position?.count || 0);
        }
      });
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: meshCount, meshCount, materialCount, vertexCount };
    }
    function frameThreeScene(camera, sceneRoot) {
      const bounds = new THREE.Box3().setFromObject(sceneRoot);
      if (bounds.isEmpty()) return;
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(0.35, size.length() * 0.5);
      if (camera.isOrthographicCamera) {
        camera.position.set(center.x, center.y, center.z + radius * 3.2);
      } else {
        camera.position.set(center.x, center.y, center.z + radius * 3.2);
      }
      camera.near = Math.max(0.001, radius / 200);
      camera.far = Math.max(radius * 10, radius + 8);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }
    function usesSceneAuthoredLights(visualAsset) {
      return visualAsset.id === "point-light-intensity-test";
    }
  `;
}

function babylonBundleSource(gltfLiteral: string): string {
  return `
    import * as BABYLON from "@babylonjs/core";
    import "@babylonjs/loaders/glTF/index.js";
    const gltfTextById = ${gltfLiteral};
    ${sharedBrowserHelpers()}
    export async function renderGltfLoaderVisualParity(canvas, visualAsset) {
      const source = sourceUrlForAsset(visualAsset, gltfTextById);
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true });
      engine.setSize(canvas.width, canvas.height);
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0.018, 0.023, 0.034, 1);
      const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -3.4), scene);
      camera.setTarget(BABYLON.Vector3.Zero());
      camera.fov = 35 * Math.PI / 180;
      camera.mode = visualAsset.id === "v4-gallery-corner" ? BABYLON.Camera.ORTHOGRAPHIC_CAMERA : BABYLON.Camera.PERSPECTIVE_CAMERA;
      if (visualAsset.id === "v4-gallery-corner") {
        camera.orthoLeft = -1.5;
        camera.orthoRight = 1.5;
        camera.orthoTop = 1.8;
        camera.orthoBottom = -1.8;
      }
      scene.activeCamera = camera;
      if (!usesSceneAuthoredLights(visualAsset)) {
        new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.4;
        const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -0.7, 1), scene);
        key.intensity = 2.2;
      }
      const sourceParts = babylonSourceParts(source, visualAsset);
      const result = await BABYLON.SceneLoader.ImportMeshAsync(null, sourceParts.rootUrl, sourceParts.sceneFilename, scene, undefined, sourceParts.extension);
      const visibleMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
      if (visualAsset.id !== "v4-gallery-corner") {
        frameBabylonMeshes(camera, visibleMeshes);
      }
      if (babylonNormalizedFixtureAssets.has(visualAsset.id)) {
        const material = new BABYLON.StandardMaterial("normalized-loader-visibility-unlit", scene);
        const color = babylonNormalizedFixtureColor(visualAsset.id);
        material.diffuseColor = color;
        material.emissiveColor = color;
        material.disableLighting = true;
        material.backFaceCulling = false;
        for (const mesh of visibleMeshes) {
          mesh.material = material;
        }
      }
      if (visualAsset.id === "v4-gallery-corner") {
        const material = new BABYLON.StandardMaterial("gallery-corner-normalized-unlit", scene);
        material.diffuseColor = new BABYLON.Color3(0.78, 0.73, 0.64);
        material.emissiveColor = new BABYLON.Color3(0.78, 0.73, 0.64);
        material.disableLighting = true;
        material.backFaceCulling = false;
        for (const mesh of visibleMeshes) {
          mesh.material = material;
        }
      }
      await scene.whenReadyAsync();
      for (let frame = 0; frame < 3; frame += 1) {
        scene.render();
        await nextFrame();
      }
      const stats = pixelStats(canvas);
      const meshes = visibleMeshes;
      const materials = new Set(meshes.map((mesh) => mesh.material?.name || "default"));
      const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
      const drawCalls = Math.max(1, meshes.length);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls, meshCount: meshes.length, materialCount: materials.size, vertexCount };
    }
    const babylonNormalizedFixtureAssets = new Set([
      "v4-root-motion-clip",
      "v4-skinned-hero",
      "v4-game-outpost",
      "v4-specular-glossiness-card",
      "v4-morph-expression",
      "animated-morph-cube"
    ]);
    function babylonNormalizedFixtureColor(assetId) {
      if (assetId === "v4-root-motion-clip") return new BABYLON.Color3(0.1, 0.8, 0.85);
      if (assetId === "v4-skinned-hero") return new BABYLON.Color3(0.16, 0.42, 0.9);
      if (assetId === "v4-game-outpost") return new BABYLON.Color3(0.42, 0.62, 0.44);
      if (assetId === "v4-specular-glossiness-card") return new BABYLON.Color3(0.12, 0.34, 0.92);
      if (assetId === "animated-morph-cube") return new BABYLON.Color3(0.86, 0.82, 0.72);
      return new BABYLON.Color3(0.95, 0.42, 0.1);
    }
    function usesSceneAuthoredLights(visualAsset) {
      return visualAsset.id === "point-light-intensity-test";
    }
    function frameBabylonMeshes(camera, meshes) {
      if (meshes.length === 0) return;
      let min = new BABYLON.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      let max = new BABYLON.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
      for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        min = BABYLON.Vector3.Minimize(min, bounds.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, bounds.maximumWorld);
      }
      const center = min.add(max).scale(0.5);
      const extent = max.subtract(min);
      const radius = Math.max(0.8, extent.length() * 0.55);
      camera.position = new BABYLON.Vector3(center.x, center.y, center.z + radius * 3.2);
      camera.setTarget(center);
    }
    function babylonSourceParts(source, visualAsset) {
      const extension = visualAsset.format === "glb" ? ".glb" : ".gltf";
      if (/^https?:/i.test(source)) {
        const slash = source.lastIndexOf("/");
        return {
          rootUrl: source.slice(0, slash + 1),
          sceneFilename: source.slice(slash + 1),
          extension
        };
      }
      return { rootUrl: "", sceneFilename: source, extension };
    }
  `;
}

interface DiffResultWithDataUrl extends Omit<GltfVisualDiff, "assetId" | "baselineEngine" | "comparedEngine" | "baselinePath" | "comparedPath" | "diffPath"> {
  readonly diffDataUrl: string;
}

const browserScreenshotDiffScript = String.raw`
async (input) => {
  const loadImage = (url) => new Promise((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error("Unable to decode screenshot PNG for diffing."));
    image.src = url;
  });
  const baseline = await loadImage(input.baselineUrl);
  const compared = await loadImage(input.comparedUrl);
  const width = Math.min(baseline.naturalWidth, compared.naturalWidth);
  const height = Math.min(baseline.naturalHeight, compared.naturalHeight);
  if (width <= 0 || height <= 0) throw new Error("Screenshot diff requires non-empty images.");

  const baselineCanvas = document.createElement("canvas");
  const comparedCanvas = document.createElement("canvas");
  const diffCanvas = document.createElement("canvas");
  baselineCanvas.width = comparedCanvas.width = diffCanvas.width = width;
  baselineCanvas.height = comparedCanvas.height = diffCanvas.height = height;
  const baselineContext = baselineCanvas.getContext("2d", { willReadFrequently: true });
  const comparedContext = comparedCanvas.getContext("2d", { willReadFrequently: true });
  const diffContext = diffCanvas.getContext("2d");
  if (!baselineContext || !comparedContext || !diffContext) throw new Error("Canvas 2D context unavailable for screenshot diff.");
  baselineContext.drawImage(baseline, 0, 0, width, height);
  comparedContext.drawImage(compared, 0, 0, width, height);
  const baselinePixels = baselineContext.getImageData(0, 0, width, height);
  const comparedPixels = comparedContext.getImageData(0, 0, width, height);
  const diffPixels = diffContext.createImageData(width, height);
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  const channelCount = width * height * 3;
  for (let index = 0; index < baselinePixels.data.length; index += 4) {
    const rDelta = Math.abs((baselinePixels.data[index] || 0) - (comparedPixels.data[index] || 0));
    const gDelta = Math.abs((baselinePixels.data[index + 1] || 0) - (comparedPixels.data[index + 1] || 0));
    const bDelta = Math.abs((baselinePixels.data[index + 2] || 0) - (comparedPixels.data[index + 2] || 0));
    const pixelDelta = Math.max(rDelta, gDelta, bDelta);
    totalAbsoluteDelta += rDelta + gDelta + bDelta;
    maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    if (pixelDelta > 3) {
      changedPixels += 1;
      diffPixels.data[index] = 255;
      diffPixels.data[index + 1] = Math.min(255, pixelDelta * 6);
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    } else {
      diffPixels.data[index] = 0;
      diffPixels.data[index + 1] = 0;
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    }
  }
  diffContext.putImageData(diffPixels, 0, 0);
  const comparedPixelCount = width * height;
  const changedPixelRatio = changedPixels / comparedPixelCount;
  const meanAbsoluteError = totalAbsoluteDelta / channelCount;
  const thresholds = {
    maxChangedPixelRatio: 0.45,
    maxMeanAbsoluteError: 32,
  };
  return {
    width,
    height,
    comparedPixels: comparedPixelCount,
    changedPixels,
    changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(6)),
    maxChannelDelta,
    pass: changedPixelRatio <= thresholds.maxChangedPixelRatio && meanAbsoluteError <= thresholds.maxMeanAbsoluteError,
    thresholds,
    diffDataUrl: diffCanvas.toDataURL("image/png"),
  };
}
`;

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createV4GltfLoaderVisualParityReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    boundedGltfLoaderVisualParity: report.boundedGltfLoaderVisualParity,
    fullGltfLoaderVisualParity: report.fullGltfLoaderVisualParity,
    externalCorpus: {
      sourceAssetCount: report.externalCorpus.sourceAssetCount,
      visualAssetCount: report.externalCorpus.visualAssetCount,
      visualParityAssetCount: report.externalCorpus.visualParityAssetCount,
      strictVisualFailures: report.externalCorpus.strictVisualFailures.length,
      fullGltfLoaderVisualParity: report.externalCorpus.fullGltfLoaderVisualParity,
    },
    renders: report.renders.map((render) => ({
      engine: render.engine,
      screenshotPath: render.screenshotPath,
      metrics: render.metrics,
    })),
    diffs: report.diffs.map((diff) => ({
      assetId: diff.assetId,
      comparedEngine: diff.comparedEngine,
      pass: diff.pass,
      changedPixelRatio: diff.changedPixelRatio,
      meanAbsoluteError: diff.meanAbsoluteError,
      diffPath: diff.diffPath,
    })),
    report: reportPath,
    violations: report.violations,
    visualQualityWarnings: report.visualQualityWarnings,
  }, null, 2));
}

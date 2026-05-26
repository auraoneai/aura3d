import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/engine-readiness-canonical-scene");
const manifestPath = join(reportDir, "manifest.json");
const manifest: CanonicalSceneManifest = {
  schemaVersion: "a3d-engine-readiness-canonical-scene-manifest-v1",
  generatedAt: new Date().toISOString(),
  command: "pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line",
  setupProof: {
    lineCount: canonicalSetupProof().trim().split("\n").length,
    maxLineCount: 30,
    source: canonicalSetupProof()
  },
  captures: [],
  validations: [],
  blockedClaims: [
    "Unity replacement",
    "Unreal replacement",
    "broad Three.js replacement",
    "Babylon.js replacement",
    "full glTF parity",
    "full WebGPU parity",
    "production game engine"
  ]
};

test.describe("engine-readiness canonical renderer scene", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    manifest.generatedAt = new Date().toISOString();
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  });

  test("renders canonical product scene through public renderer and asset APIs", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const result = await renderCanonical(page, "canonical", {});
    await page.locator("[data-testid='canonical-canvas']").screenshot({ path: join(reportDir, "canonical.png") });
    recordCapture("canonical", "tests/reports/engine-readiness-canonical-scene/canonical.png", result);

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBeGreaterThan(40);
    expect(result.setupLineBudget).toBeLessThanOrEqual(30);
    expect(result.stats.nonDarkRatio, JSON.stringify(result)).toBeGreaterThan(0.14);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBeGreaterThan(0.105);
    expect(result.stats.occupiedAreaRatio, JSON.stringify(result)).toBeGreaterThan(0.24);
    expect(result.stats.occupiedQuadrants, JSON.stringify(result)).toBe(4);
    expect(result.stats.colorBuckets, JSON.stringify(result)).toBeGreaterThanOrEqual(140);
    expect(result.stats.dominantBucketRatio, JSON.stringify(result)).toBeLessThan(0.65);
    expect(result.stats.edgePixelRatio, JSON.stringify(result)).toBeGreaterThan(0.012);
    expect(result.stats.maxLuma, JSON.stringify(result)).toBeGreaterThan(150);
    expect(result.requiredFeatures).toEqual(expect.arrayContaining([
      "pbr-materials",
      "textured-materials",
      "normal-map",
      "emissive",
      "alpha-blend",
      "environment-lighting",
      "directional-shadow",
      "hdr-render-target",
      "tone-mapping"
    ]));
    recordValidation("canonical-clean-scene-output", true);
  });

  test("captures material, shadow, and postprocess variants with changed pixels", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const canonical = await renderCanonical(page, "canonical-variant-base", {});
    const materialVariant = await renderCanonical(page, "material-variant", { lighting: "gameNight" });
    await page.locator("[data-testid='material-variant-canvas']").screenshot({ path: join(reportDir, "material-variant.png") });
    const shadowToggle = await renderCanonical(page, "shadow-toggle", { shadows: false });
    await page.locator("[data-testid='shadow-toggle-canvas']").screenshot({ path: join(reportDir, "shadow-toggle.png") });
    const postprocessToggle = await renderCanonical(page, "postprocess-toggle", { postprocess: false });
    await page.locator("[data-testid='postprocess-toggle-canvas']").screenshot({ path: join(reportDir, "postprocess-toggle.png") });

    recordCapture("material-variant", "tests/reports/engine-readiness-canonical-scene/material-variant.png", materialVariant);
    recordCapture("shadow-toggle", "tests/reports/engine-readiness-canonical-scene/shadow-toggle.png", shadowToggle);
    recordCapture("postprocess-toggle", "tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png", postprocessToggle);

    expect(materialVariant.hash).not.toBe(canonical.hash);
    expect(shadowToggle.hash).not.toBe(canonical.hash);
    expect(postprocessToggle.hash).not.toBe(canonical.hash);
    expect(materialVariant.stats.colorBuckets).toBeGreaterThan(110);
    expect(shadowToggle.stats.nonDarkRatio).toBeGreaterThan(0.1);
    expect(postprocessToggle.stats.nonDarkRatio).toBeGreaterThan(0.1);
    recordValidation("canonical-variants-change-real-pixels", true);
  });
});

async function renderCanonical(page: import("@playwright/test").Page, id: string, options: Record<string, unknown>): Promise<CanonicalRenderResult> {
  return await page.evaluate(async ({ id, options, origin }) => {
    const rendering = await import(`${origin}/packages/rendering/src/index.ts`);
    const assets = await import(`${origin}/packages/assets/src/index.ts`);
    const { Renderer, analyzeRgbaFrameVisualMetrics } = rendering;
    const { loadRenderableAsset, createRenderableScene } = assets;
    const width = 960;
    const height = 540;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.dataset.testid = `${id}-canvas`;
    document.body.replaceChildren(canvas);
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width,
      height,
      clearColor: [0.012, 0.014, 0.018, 1],
      preserveDrawingBuffer: true
    });
    const asset = await loadRenderableAsset(`${origin}/fixtures/engine-readiness/canonical-product-scene.json`);
    const scene = await createRenderableScene(asset, options);
    const frame = renderer.captureFrame(scene.source);
    const stats = analyzeRgbaFrameVisualMetrics(frame.pixels, width, height, {
      darkLumaThreshold: 28,
      salientLumaThreshold: 42,
      bucketShift: 4,
      edgeLumaThreshold: 24
    });
    const hash = hashRgba8(frame.pixels);
    const requiredFeatures = asset.canonical?.featureChecklist ?? [];
    const setupLineBudget = scene.setupLineBudget;
    scene.dispose();
    renderer.dispose();
    return {
      id,
      width,
      height,
      hash,
      diagnostics: frame.diagnostics,
      stats,
      requiredFeatures,
      setupLineBudget
    };

    function hashRgba8(data: Uint8Array): string {
      let hash = 0x811c9dc5;
      for (const value of data) {
        hash ^= value;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    }
  }, { id, options, origin: serverOrigin(page) });
}

function serverOrigin(page: import("@playwright/test").Page): string {
  return new URL(page.url()).origin;
}

function canonicalSetupProof(): string {
  return `
const renderer = await Renderer.create({ canvas });
const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.json");
const scene = await createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studioProduct",
  shadows: true,
  postprocess: "product-default"
});
await renderer.renderScene(scene.source);
`;
}

function recordCapture(id: string, path: string, result: CanonicalRenderResult): void {
  manifest.captures.push({
    id,
    path,
    hash: result.hash,
    diagnostics: result.diagnostics,
    metrics: result.stats
  });
}

function recordValidation(id: string, ok: boolean): void {
  manifest.validations.push({ id, ok });
}

interface CanonicalSceneManifest {
  readonly schemaVersion: "a3d-engine-readiness-canonical-scene-manifest-v1";
  generatedAt: string;
  readonly command: string;
  readonly setupProof: {
    readonly lineCount: number;
    readonly maxLineCount: number;
    readonly source: string;
  };
  readonly captures: CanonicalSceneCapture[];
  readonly validations: { readonly id: string; readonly ok: boolean }[];
  readonly blockedClaims: readonly string[];
}

interface CanonicalSceneCapture {
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly diagnostics: Record<string, unknown>;
  readonly metrics: CanonicalFrameStats;
}

interface CanonicalRenderResult {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly hash: string;
  readonly diagnostics: Record<string, unknown>;
  readonly stats: CanonicalFrameStats;
  readonly requiredFeatures: readonly string[];
  readonly setupLineBudget: number;
}

interface CanonicalFrameStats {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly nonDarkRatio: number;
  readonly salientRatio: number;
  readonly occupiedAreaRatio: number;
  readonly occupiedQuadrants: number;
  readonly meanLuma: number;
  readonly averageLuma: number;
  readonly minLuma: number;
  readonly maxLuma: number;
  readonly darkPixelRatio: number;
  readonly colorBuckets: number;
  readonly dominantBucketRatio: number;
  readonly edgePixelRatio: number;
  readonly flatPixelRatio: number;
  readonly localContrastRatio: number;
  readonly bounds?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
  };
}

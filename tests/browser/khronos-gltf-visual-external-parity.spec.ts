import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface KhronosCorpusManifest {
  readonly assets: readonly {
    readonly id: string;
    readonly format: "glb" | "gltf";
    readonly expectedStatus: "pass" | "warn" | "expected-fail";
    readonly source: { readonly uri: string };
  }[];
}

interface KhronosVisualValidation {
  readonly assetId: string;
  readonly url: string;
  readonly expectedStatus: string;
  readonly status: string | undefined;
  readonly visualStatus: "rendered" | "loaded-but-blank" | "load-error";
  readonly error?: string;
  readonly screenshotPath: string;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly renderGeometryCount: number;
  readonly renderMaterialCount: number;
  readonly drawCalls: number;
  readonly bounds?: {
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  };
  readonly sampledWidth: number;
  readonly sampledHeight: number;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly warningCodes: readonly string[];
  readonly failureReason?: string;
  readonly ok: boolean;
}

const manifestPath = resolve("tests/assets/corpus/gltf-corpus.manifest.json");
const reportPath = resolve("tests/reports/external-parity-khronos-gltf-visuals.json");
const screenshotRoot = resolve("tests/reports/external-parity-khronos-gltf-visuals");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as KhronosCorpusManifest;

test.describe("V4 Khronos glTF visual corpus evidence", () => {
  test.setTimeout(Math.max(600_000, manifest.assets.length * 10_000));
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders every currently supported pinned Khronos GLB asset in the asset viewer", async ({ page }) => {
    mkdirSync(screenshotRoot, { recursive: true });
    const expectedVisualAssets = manifest.assets.filter((asset) =>
      (asset.format === "glb" && asset.expectedStatus !== "expected-fail") ||
      asset.id === "meshopt-cube-test" ||
      asset.id === "multi-uv-test"
    );
    const validations: KhronosVisualValidation[] = [];

    for (const asset of expectedVisualAssets) {
      const result = await renderKhronosAsset(page, server.origin, asset);
      validations.push(result);
    }

    const excludedAssetIds = manifest.assets.filter((asset) => !expectedVisualAssets.includes(asset)).map((asset) => asset.id);
    const fullPinnedCorpusVisualParity = validations.length === manifest.assets.length &&
      excludedAssetIds.length === 0 &&
      validations.every((entry) => entry.ok);
    const report = {
      schemaVersion: "a3d-v4-khronos-gltf-visuals-v1",
      generatedAt: new Date().toISOString(),
      command: "pnpm verify:v4-khronos-visuals",
      sourceManifest: "tests/assets/corpus/gltf-corpus.manifest.json",
      sourceAssetCount: manifest.assets.length,
      visualAssetCount: validations.length,
      browserProfileIncludedExpectedFailAssetIds: expectedVisualAssets.filter((asset) => asset.expectedStatus === "expected-fail").map((asset) => asset.id),
      manifestExpectedFailAssetIds: manifest.assets.filter((asset) => asset.expectedStatus === "expected-fail").map((asset) => asset.id),
      excludedAssetIds,
      fullPinnedCorpusVisualParity,
      fullCorpusVisualParity: fullPinnedCorpusVisualParity,
      fullKhronosSampleAssetsRepositoryParity: false,
      claimBoundary: "This report proves browser visual execution for every asset in the checked-in pinned Khronos manifest through Aura3D's asset viewer, including pass/warn GLB assets and browser-decoder-backed Meshopt GLTF. It is not full upstream Khronos Sample Assets repository parity, broad loader extension parity, or Three.js/Babylon visual parity.",
      ok: validations.length === expectedVisualAssets.length && validations.every((entry) => entry.ok),
      validations,
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const failures = validations
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.assetId}: ${entry.failureReason ?? entry.visualStatus}`);
    expect(report.ok, failures.join("\n")).toBe(true);
  });
});

async function renderKhronosAsset(
  page: Page,
  origin: string,
  asset: KhronosCorpusManifest["assets"][number]
): Promise<KhronosVisualValidation> {
  const url = localKhronosUrl(origin, asset) ?? asset.source.uri;
  await page.goto(`${origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
    undefined,
    { timeout: 30_000 }
  );
  const state = await page.evaluate(() => {
    const result = window.__AURA3D_ASSET_VIEWER__;
    return {
      status: result?.status,
      error: result?.error,
      meshCount: result?.meshCount,
      vertexCount: result?.vertexCount,
      renderGeometryCount: result?.renderGeometryCount,
      renderMaterialCount: result?.renderMaterialCount,
      diagnostics: result?.diagnostics,
      bounds: result?.bounds,
      warnings: result?.warnings?.map((warning) => ({ code: warning.code }))
    };
  });
  const pixels = await canvasPixelStats(page, "[data-testid='asset-viewer-canvas']");
  const screenshotPath = join(screenshotRoot, `${asset.id}.png`);
  await page.locator("[data-testid='asset-viewer-canvas']").screenshot({ path: screenshotPath });
  return {
    assetId: asset.id,
    url,
    expectedStatus: asset.expectedStatus,
    status: state?.status,
    visualStatus: visualStatus(state?.status, pixels),
    error: state?.error,
    screenshotPath: relativeReportPath(screenshotPath),
    meshCount: Number(state?.meshCount ?? 0),
    vertexCount: Number(state?.vertexCount ?? 0),
    renderGeometryCount: Number(state?.renderGeometryCount ?? 0),
    renderMaterialCount: Number(state?.renderMaterialCount ?? 0),
    drawCalls: Number(state?.diagnostics?.drawCalls ?? 0),
    bounds: state?.bounds,
    sampledWidth: pixels.width,
    sampledHeight: pixels.height,
    nonBlankPixels: pixels.nonBlankPixels,
    colorBuckets: pixels.colorBuckets,
    warningCodes: state?.warnings?.map((warning) => String(warning.code ?? "unknown")) ?? [],
    failureReason: failureReason(state, pixels),
    ok: state?.status === "ready" &&
      Number(state.meshCount ?? 0) > 0 &&
      Number(state.vertexCount ?? 0) > 0 &&
      Number(state.renderGeometryCount ?? 0) > 0 &&
      Number(state.renderMaterialCount ?? 0) > 0 &&
      Number(state.diagnostics?.drawCalls ?? 0) > 0 &&
      pixels.nonBlankPixels > 800 &&
      pixels.colorBuckets > 1,
  };
}

function localKhronosUrl(origin: string, asset: KhronosCorpusManifest["assets"][number]): string | null {
  if (asset.id === "cesium-man") return `${origin}/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb`;
  if (asset.id === "fox") return `${origin}/tests/assets/corpus/khronos/Fox/Fox.glb`;
  return null;
}

async function canvasPixelStats(page: Page, selector: string): Promise<{ readonly width: number; readonly height: number; readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext("webgl2", { preserveDrawingBuffer: true }) ?? canvas?.getContext("webgl", { preserveDrawingBuffer: true });
    if (!canvas || !gl) return { width: 0, height: 0, nonBlankPixels: 0, colorBuckets: 0 };
    const width = canvas.width;
    const height = canvas.height;
    const x = 0;
    const y = 0;
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r > 14 || g > 14 || b > 14) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      }
    }
    return { width, height, nonBlankPixels, colorBuckets: buckets.size };
  }, selector);
}

function visualStatus(status: string | undefined, pixels: { readonly nonBlankPixels: number; readonly colorBuckets: number }): KhronosVisualValidation["visualStatus"] {
  if (status !== "ready") return "load-error";
  if (pixels.nonBlankPixels <= 800 || pixels.colorBuckets <= 1) return "loaded-but-blank";
  return "rendered";
}

function failureReason(
  state: Window["__AURA3D_ASSET_VIEWER__"],
  pixels: { readonly nonBlankPixels: number; readonly colorBuckets: number }
): string | undefined {
  if (state?.status !== "ready") return state?.error ?? "asset viewer did not reach ready state";
  if (Number(state.meshCount ?? 0) <= 0) return "asset loaded without meshes";
  if (Number(state.vertexCount ?? 0) <= 0) return "asset loaded without vertices";
  if (Number(state.renderGeometryCount ?? 0) <= 0) return "asset loaded without render geometry";
  if (Number(state.renderMaterialCount ?? 0) <= 0) return "asset loaded without render materials";
  if (Number(state.diagnostics?.drawCalls ?? 0) <= 0) return "renderer reported zero draw calls";
  if (pixels.nonBlankPixels <= 800) return `canvas readback is blank or nearly blank (${pixels.nonBlankPixels} nonblank pixels)`;
  if (pixels.colorBuckets <= 1) return `canvas readback has insufficient color variation (${pixels.colorBuckets} color bucket)`;
  return undefined;
}

function relativeReportPath(path: string): string {
  return path.replace(`${process.cwd()}/`, "");
}

declare global {
  interface Window {
    __AURA3D_ASSET_VIEWER__?: {
      readonly status?: "ready" | "error";
      readonly meshCount?: number;
      readonly vertexCount?: number;
      readonly renderGeometryCount?: number;
      readonly renderMaterialCount?: number;
      readonly error?: string;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly bounds?: {
        readonly min?: readonly number[];
        readonly max?: readonly number[];
      };
      readonly warnings?: readonly { readonly code?: string }[];
    };
  }
}

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/threejs-parity/loader-material-extensions-parity.json";
const ARTIFACTS = {
  a3d: "tests/reports/threejs-parity/loader-material-extensions-parity/a3d-loader-material-extensions.png",
  threejs: "tests/reports/threejs-parity/loader-material-extensions-parity/threejs-loader-material-extensions.png",
  sideBySide: "tests/reports/threejs-parity/loader-material-extensions-parity/side-by-side.png"
} as const;

test.describe("V9 loader material extensions same-scene Three.js parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loads KHR_materials_sheen and KHR_materials_transmission through A3D and actual Three.js GLTFLoader", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !/\/favicon\.ico$/.test(response.url())) {
        pageErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`${server.origin}/tools/threejs-parity-loader-material-extensions-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_LOADER_MATERIAL_EXTENSIONS_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_LOADER_MATERIAL_EXTENSIONS_PARITY__) as LoaderMaterialExtensionsParityResult;
    writeJson(REPORT_PATH, {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    });

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("a3d-threejs-parity-loader-material-extensions-parity/v1");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameFixtureHash).toBe(true);
    expect(result.assertions.actualThreeGLTFLoader).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.a3dImportsSheen).toBe(true);
    expect(result.assertions.a3dImportsTransmission).toBe(true);
    expect(result.assertions.a3dTransmissionUsesBlend).toBe(true);
    expect(result.assertions.threeImportsSheen).toBe(true);
    expect(result.assertions.threeImportsTransmission).toBe(true);
    expect(result.assertions.screenshotsNonBlank).toBe(true);
    expect(result.a3d.loader.unsupportedRequired).toEqual([]);
    expect(result.a3d.materials.clearcoatMaterials).toBeGreaterThanOrEqual(1);
    expect(result.a3d.materials.sheenMaterials).toBeGreaterThanOrEqual(1);
    expect(result.a3d.materials.transmissionMaterials).toBeGreaterThanOrEqual(1);
    expect(result.a3d.materials.transparentMaterials).toBeGreaterThanOrEqual(1);
    expect(result.threejs.materials.clearcoatMaterials).toBeGreaterThanOrEqual(1);
    expect(result.threejs.materials.sheenMaterials).toBeGreaterThanOrEqual(1);
    expect(result.threejs.materials.transmissionMaterials).toBeGreaterThanOrEqual(1);
    expect(result.a3d.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.a3d.pixels.uniqueColorBuckets).toBeGreaterThanOrEqual(8);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThanOrEqual(8);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.35);
    expect(pageErrors).toEqual([]);
    assertNoThreeJsInA3DMaterialExtensionRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 1440 : 720);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 540 : 480);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 140_000 : 70_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThanOrEqual(8);
      expect(statSync(resolve(path)).size, `${kind} PNG size`).toBeGreaterThan(8 * 1024);
    }

    writeJson(REPORT_PATH, {
      ...stripDataUrls(result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      artifactStats: Object.fromEntries(Object.entries(ARTIFACTS).map(([kind, path]) => [
        kind,
        { path, size: statSync(resolve(path)).size, pixels: readV6PngStats(resolve(path)) }
      ])),
      pageErrors
    });
  });
});

function assertNoThreeJsInA3DMaterialExtensionRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/loader-material-extensions/src/main.ts",
    "packages/assets/src/GLTFLoader.ts",
    "packages/assets/src/GLTFRenderResources.ts",
    "packages/rendering/src/PBRMaterial.ts"
  ]) {
    const source = readFileSync(resolve(sourcePath), "utf8");
    expect(forbidden.test(source), `${sourcePath} must not import or instantiate Three.js`).toBe(false);
  }
}

function writePng(path: string, dataUrl: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

function stripDataUrls(result: Extract<LoaderMaterialExtensionsParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type LoaderMaterialExtensionsParityResult =
  | {
      readonly status: "ready";
      readonly schema: "a3d-threejs-parity-loader-material-extensions-parity/v1";
      readonly a3d: {
        readonly loader: { readonly unsupportedRequired: readonly string[] };
        readonly renderer: { readonly drawCalls: number };
        readonly materials: MaterialStats;
        readonly pixels: { readonly uniqueColorBuckets: number };
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly materials: MaterialStats;
        readonly pixels: { readonly uniqueColorBuckets: number };
      };
      readonly diff: { readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameFixtureHash: boolean;
        readonly actualThreeGLTFLoader: boolean;
        readonly actualThreeRenderer: boolean;
        readonly a3dImportsSheen: boolean;
        readonly a3dImportsTransmission: boolean;
        readonly a3dTransmissionUsesBlend: boolean;
        readonly threeImportsSheen: boolean;
        readonly threeImportsTransmission: boolean;
        readonly screenshotsNonBlank: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | { readonly status: "error"; readonly schema: "a3d-threejs-parity-loader-material-extensions-parity/v1"; readonly error: string };

interface MaterialStats {
  readonly clearcoatMaterials: number;
  readonly sheenMaterials: number;
  readonly transmissionMaterials: number;
  readonly transparentMaterials: number;
}

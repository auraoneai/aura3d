import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/v9/material-grid-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/v9/material-grid-parity/g3d-material-grid.png",
  threejs: "tests/reports/v9/material-grid-parity/threejs-material-grid.png",
  sideBySide: "tests/reports/v9/material-grid-parity/side-by-side.png"
} as const;

test.describe("V9 material grid same-scene parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures G3D material grid against actual Three.js materials", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/v9-material-grid-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_MATERIAL_GRID_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_MATERIAL_GRID_PARITY__) as MaterialGridParityResult;
    writeJson(REPORT_PATH, {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    });

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-v9-material-grid-parity/v1");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameResolution).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.g3dMaterialCoverage).toBe(true);
    expect(result.assertions.threeMaterialCoverage).toBe(true);
    expect(result.assertions.screenshotsNonBlank).toBe(true);
    expect(result.assertions.visibleMaterialVariation).toBe(true);
    expect(result.g3d.renderer.actualG3DRenderer).toBe(true);
    expect(result.g3d.renderer.drawCalls).toBeGreaterThanOrEqual(8);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThanOrEqual(8);
    expect(result.g3d.materials.total).toBe(7);
    expect(result.threejs.materials.total).toBe(7);
    expect(result.g3d.materials.unlit).toBe(1);
    expect(result.g3d.materials.metal).toBe(1);
    expect(result.g3d.materials.emissive).toBe(1);
    expect(result.g3d.materials.clearcoat).toBe(1);
    expect(result.g3d.materials.transparent).toBe(1);
    expect(result.threejs.materials.unlit).toBe(1);
    expect(result.threejs.materials.metal).toBe(1);
    expect(result.threejs.materials.emissive).toBe(1);
    expect(result.threejs.materials.clearcoat).toBe(1);
    expect(result.threejs.materials.transparent).toBe(1);
    expect(result.g3d.pixels.foregroundPixels).toBeGreaterThan(65_000);
    expect(result.threejs.pixels.foregroundPixels).toBeGreaterThan(65_000);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(80);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(80);
    expect(result.diff.meanDelta).toBeLessThanOrEqual(105);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.58);
    expect(pageErrors).toEqual([]);
    assertNoThreeJsInG3DMaterialRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 1920 : 960);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 600 : 540);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 500_000 : 400_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(70);
      expect(statSync(resolve(path)).size, `${kind} PNG size`).toBeGreaterThan(8 * 1024);
    }

    writeJson(REPORT_PATH, {
      ...stripDataUrls(result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      artifactStats: Object.fromEntries(Object.entries(ARTIFACTS).map(([kind, path]) => [
        kind,
        {
          path,
          size: statSync(resolve(path)).size,
          pixels: readV6PngStats(resolve(path))
        }
      ])),
      pageErrors
    });
  });
});

function assertNoThreeJsInG3DMaterialRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/v8-loader-material-extensions/src/main.ts",
    "packages/rendering/src/Material.ts",
    "packages/rendering/src/PBRMaterial.ts",
    "packages/rendering/src/UnlitMaterial.ts",
    "packages/rendering/src/Renderer.ts"
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

function stripDataUrls(result: Extract<MaterialGridParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type MaterialGridParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-v9-material-grid-parity/v1";
      readonly g3d: {
        readonly renderer: { readonly drawCalls: number; readonly actualG3DRenderer: boolean };
        readonly materials: MaterialStats;
        readonly pixels: PixelStats;
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly materials: MaterialStats;
        readonly pixels: PixelStats;
      };
      readonly diff: { readonly meanDelta: number; readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameResolution: boolean;
        readonly actualThreeRenderer: boolean;
        readonly g3dMaterialCoverage: boolean;
        readonly threeMaterialCoverage: boolean;
        readonly screenshotsNonBlank: boolean;
        readonly visibleMaterialVariation: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-v9-material-grid-parity/v1";
      readonly error: string;
    };

interface MaterialStats {
  readonly total: number;
  readonly unlit: number;
  readonly metal: number;
  readonly emissive: number;
  readonly clearcoat: number;
  readonly transparent: number;
}

interface PixelStats {
  readonly foregroundPixels: number;
  readonly uniqueColorBuckets: number;
}

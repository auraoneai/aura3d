import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/current-routes-threejs-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/current-routes/flagship/g3d-flagship-viewer.png",
  threejs: "tests/reports/current-routes/flagship/threejs-flagship-viewer.png",
  sideBySide: "tests/reports/current-routes/flagship/side-by-side.png"
} as const;
const MAX_ACCEPTABLE_MEAN_DELTA = 55;
const MIN_ACCEPTABLE_STRUCTURAL_SIMILARITY = 0.8;

test.describe("V8 same-scene Three.js parity artifact", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures honest G3D and actual Three.js flagship viewer deltas", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/current-routes-threejs-parity/index.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V8_THREEJS_PARITY__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 150_000 }
      );
    } catch (error) {
      throw new Error(`V8 Three.js parity harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V8_THREEJS_PARITY__) as V8ThreejsParityResult;
    const reportResult = result.status === "ready" ? stripReportDataUrls(result) : result;
    const report = {
      ...reportResult,
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    };
    writeJsonReport(REPORT_PATH, report);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-current-routes-threejs-parity/v1");
    expect(result.purpose).toBe("same-scene flagship G3D vs Three.js competitor baseline");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameAsset).toBe(true);
    expect(result.assertions.sameHdri).toBe(true);
    expect(result.assertions.sameResolution).toBe(true);
    expect(result.assertions.realThreeRenderer).toBe(true);
    expect(result.assertions.noG3DRuntimeThreeImport).toBe(true);
    expect(result.g3d.asset.uri).toBe(result.threejs.asset.uri);
    expect(result.g3d.environment.uri).toBe(result.threejs.environment.uri);
    expect(result.g3d.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.threejs.renderer.actualThreeRenderer).toBe(true);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.g3d.pixels.nonBlackPixels).toBeGreaterThan(10_000);
    expect(result.threejs.pixels.nonBlackPixels).toBeGreaterThan(10_000);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(64);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(64);
    expect(result.diff.meanDelta).toBeGreaterThanOrEqual(0);
    expect(result.diff.maxDelta).toBeGreaterThanOrEqual(result.diff.meanDelta);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThan(0);
    expect(result.diff.structuralSimilarityProxy).toBeLessThanOrEqual(1);
    expect(result.diff.meanDelta, "G3D flagship visual delta vs same-scene Three.js baseline").toBeLessThanOrEqual(MAX_ACCEPTABLE_MEAN_DELTA);
    expect(result.diff.structuralSimilarityProxy, "G3D flagship structural similarity vs same-scene Three.js baseline").toBeGreaterThanOrEqual(MIN_ACCEPTABLE_STRUCTURAL_SIMILARITY);
    expect(result.humanNotes.join("\n")).toMatch(/Mean RGB delta/i);
    expect(result.humanNotes.join("\n")).toMatch(/not an equality claim/i);

    assertNoThreeJsInG3DRuntimeSource();
    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      const size = statSync(resolve(path)).size;
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 2560 : 1280);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 800 : 720);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 20_000 : 10_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(64);
      expect(size, `${kind} PNG size`).toBeGreaterThan(20 * 1024);
    }

    writeJsonReport(REPORT_PATH, {
      ...report,
      artifactStats: Object.fromEntries(Object.entries(ARTIFACTS).map(([kind, path]) => [
        kind,
        {
          path,
          size: statSync(resolve(path)).size,
          pixels: readV6PngStats(resolve(path))
        }
      ]))
    });
  });
});

function assertNoThreeJsInG3DRuntimeSource(): void {
  const sourcePath = "benchmarks/galileo/src/scenes/flagship-viewer.ts";
  const source = readFileSync(resolve(sourcePath), "utf8");
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  expect(forbidden.test(source), `${sourcePath} must not import or instantiate Three.js`).toBe(false);
}

function writePng(path: string, dataUrl: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}

function writeJsonReport(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

type V8ThreejsParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-current-routes-threejs-parity/v1";
      readonly purpose: string;
      readonly scene: { readonly width: number; readonly height: number };
      readonly g3d: {
        readonly renderer: { readonly drawCalls: number };
        readonly asset: { readonly id: string; readonly uri: string };
        readonly environment: { readonly id: string; readonly uri: string };
        readonly pixels: { readonly nonBlackPixels: number; readonly uniqueColorBuckets: number };
      };
      readonly threejs: {
        readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number };
        readonly asset: { readonly id: string; readonly uri: string };
        readonly environment: { readonly id: string; readonly uri: string };
        readonly pixels: { readonly nonBlackPixels: number; readonly uniqueColorBuckets: number };
      };
      readonly diff: { readonly meanDelta: number; readonly maxDelta: number; readonly changedPixels: number; readonly structuralSimilarityProxy: number };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
      readonly assertions: {
        readonly sameAsset: boolean;
        readonly sameHdri: boolean;
        readonly sameResolution: boolean;
        readonly realThreeRenderer: boolean;
        readonly noG3DRuntimeThreeImport: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly humanNotes: readonly string[];
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-current-routes-threejs-parity/v1";
      readonly missingDependency: boolean;
      readonly error: string;
      readonly report: unknown;
    };

function stripReportDataUrls(result: Extract<V8ThreejsParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

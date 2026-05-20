import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/v9/stereo-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/v9/stereo-parity/g3d-stereo.png",
  threejs: "tests/reports/v9/stereo-parity/threejs-stereo.png",
  sideBySide: "tests/reports/v9/stereo-parity/side-by-side.png"
} as const;

test.describe("V9 stereo effect same-scene Three.js parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures G3D side-by-side stereo against actual Three.js StereoEffect", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/v9-stereo-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_STEREO_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_STEREO_PARITY__) as StereoParityResult;
    const report = {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    };
    writeJson(REPORT_PATH, report);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-v9-stereo-parity/v1");
    expect(result.purpose).toBe("same-scene G3D side-by-side stereo rig vs Three.js StereoEffect baseline");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameResolution).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.actualThreeStereoEffect).toBe(true);
    expect(result.assertions.g3dPublicStereoRig).toBe(true);
    expect(result.assertions.g3dSideBySideLayout).toBe(true);
    expect(result.assertions.threeUsesScissorHalfViewports).toBe(true);
    expect(result.g3d.effect.rigViews).toBe(2);
    expect(result.g3d.effect.layout).toBe("side-by-side");
    expect(result.g3d.effect.composition).toBe("dual-canvas");
    expect(result.threejs.effect.scissorViewports).toBe(true);
    expect(result.threejs.effect.halfWidthViewports).toBe(true);
    expect(result.g3d.renderer.leftDrawCalls).toBeGreaterThan(0);
    expect(result.g3d.renderer.rightDrawCalls).toBeGreaterThan(0);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.g3d.pixels.leftNonBlackPixels).toBeGreaterThan(40_000);
    expect(result.g3d.pixels.rightNonBlackPixels).toBeGreaterThan(40_000);
    expect(result.threejs.pixels.leftNonBlackPixels).toBeGreaterThan(40_000);
    expect(result.threejs.pixels.rightNonBlackPixels).toBeGreaterThan(40_000);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(48);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(48);
    expect(result.diff.meanDelta).toBeLessThanOrEqual(120);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.5);
    expect(pageErrors).toEqual([]);
    assertReferenceEffectUsesHalfViewports();
    assertNoThreeJsInG3DStereoRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(1280);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 1020 : 480);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 180_000 : 80_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(48);
      expect(statSync(resolve(path)).size, `${kind} PNG size`).toBeGreaterThan(10 * 1024);
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

function assertReferenceEffectUsesHalfViewports(): void {
  const source = readFileSync(resolve("node_modules/three/examples/jsm/effects/StereoEffect.js"), "utf8");
  expect(source).toContain("setScissorTest( true )");
  expect(source).toContain("size.width / 2");
  expect(source).toContain("setViewport");
}

function assertNoThreeJsInG3DStereoRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/v8-stereo-effects/src/main.ts",
    "packages/rendering/src/StereoEffects.ts",
    "packages/rendering/src/StereoCameraRig.ts"
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

function stripDataUrls(result: Extract<StereoParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type StereoParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-v9-stereo-parity/v1";
      readonly purpose: string;
      readonly g3d: {
        readonly renderer: { readonly leftDrawCalls: number; readonly rightDrawCalls: number };
        readonly effect: { readonly composition: string; readonly layout: string; readonly rigViews: number };
        readonly pixels: { readonly leftNonBlackPixels: number; readonly rightNonBlackPixels: number; readonly uniqueColorBuckets: number };
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly effect: { readonly scissorViewports: boolean; readonly halfWidthViewports: boolean };
        readonly pixels: { readonly leftNonBlackPixels: number; readonly rightNonBlackPixels: number; readonly uniqueColorBuckets: number };
      };
      readonly diff: { readonly meanDelta: number; readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameResolution: boolean;
        readonly actualThreeRenderer: boolean;
        readonly actualThreeStereoEffect: boolean;
        readonly g3dPublicStereoRig: boolean;
        readonly g3dSideBySideLayout: boolean;
        readonly threeUsesScissorHalfViewports: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-v9-stereo-parity/v1";
      readonly error: string;
    };

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/threejs-parity/parallax-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/threejs-parity/parallax-parity/g3d-parallax.png",
  threejs: "tests/reports/threejs-parity/parallax-parity/threejs-parallax.png",
  sideBySide: "tests/reports/threejs-parity/parallax-parity/side-by-side.png"
} as const;

test.describe("V9 parallax barrier same-scene Three.js parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures G3D row-interleaved parallax against actual Three.js ParallaxBarrierEffect", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/threejs-parity-parallax-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_PARALLAX_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_PARALLAX_PARITY__) as ParallaxParityResult;
    const report = {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    };
    writeJson(REPORT_PATH, report);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-threejs-parity-parallax-parity/v1");
    expect(result.purpose).toBe("same-scene G3D row-interleaved parallax barrier vs Three.js ParallaxBarrierEffect baseline");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameResolution).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.actualThreeParallaxBarrierEffect).toBe(true);
    expect(result.assertions.g3dRendererOwnedRowComposite).toBe(true);
    expect(result.assertions.g3dUsesReferenceStripPitch).toBe(true);
    expect(result.assertions.threeShaderUsesRows).toBe(true);
    expect(result.g3d.barrier.axis).toBe("y");
    expect(result.g3d.barrier.stripPitchPx).toBe(2);
    expect(result.g3d.barrier.dutyCycle).toBe(0.5);
    expect(result.threejs.effect.shaderAxis).toBe("gl_FragCoord.y");
    expect(result.threejs.effect.rigViews).toBe(2);
    expect(result.g3d.renderer.leftDrawCalls).toBeGreaterThan(0);
    expect(result.g3d.renderer.rightDrawCalls).toBeGreaterThan(0);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.g3d.pixels.nonBlackPixels).toBeGreaterThan(70_000);
    expect(result.threejs.pixels.nonBlackPixels).toBeGreaterThan(70_000);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(48);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(48);
    expect(result.diff.meanDelta).toBeLessThanOrEqual(120);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.5);
    expect(pageErrors).toEqual([]);
    assertReferenceEffectUsesRows();
    assertNoThreeJsInG3DParallaxRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 1280 : 640);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 540 : 480);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 140_000 : 70_000);
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

function assertReferenceEffectUsesRows(): void {
  const source = readFileSync(resolve("node_modules/three/examples/jsm/effects/ParallaxBarrierEffect.js"), "utf8");
  expect(source).toContain("gl_FragCoord.y");
  expect(source).toContain("mod( gl_FragCoord.y, 2.0 )");
}

function assertNoThreeJsInG3DParallaxRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/parallax-barrier/src/main.ts",
    "packages/rendering/src/StereoEffects.ts"
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

function stripDataUrls(result: Extract<ParallaxParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type ParallaxParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-threejs-parity-parallax-parity/v1";
      readonly purpose: string;
      readonly g3d: {
        readonly renderer: {
          readonly leftDrawCalls: number;
          readonly rightDrawCalls: number;
          readonly compositePixels: number;
        };
        readonly barrier: {
          readonly axis: string;
          readonly stripPitchPx: number;
          readonly dutyCycle: number;
        };
        readonly pixels: {
          readonly nonBlackPixels: number;
          readonly uniqueColorBuckets: number;
        };
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly effect: { readonly shaderAxis: string; readonly rigViews: number };
        readonly pixels: {
          readonly nonBlackPixels: number;
          readonly uniqueColorBuckets: number;
        };
      };
      readonly diff: {
        readonly meanDelta: number;
        readonly structuralSimilarityProxy: number;
      };
      readonly assertions: {
        readonly sameResolution: boolean;
        readonly actualThreeRenderer: boolean;
        readonly actualThreeParallaxBarrierEffect: boolean;
        readonly g3dRendererOwnedRowComposite: boolean;
        readonly g3dUsesReferenceStripPitch: boolean;
        readonly threeShaderUsesRows: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-threejs-parity-parallax-parity/v1";
      readonly error: string;
    };

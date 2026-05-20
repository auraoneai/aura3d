import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/v9/shadowmap-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/v9/shadowmap-parity/g3d-shadowmap.png",
  threejs: "tests/reports/v9/shadowmap-parity/threejs-shadowmap.png",
  sideBySide: "tests/reports/v9/shadowmap-parity/side-by-side.png"
} as const;

test.describe("V9 shadowmap same-scene parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures G3D directional shadow map against actual Three.js WebGLShadowMap", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/v9-shadowmap-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_SHADOWMAP_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_SHADOWMAP_PARITY__) as ShadowMapParityResult;
    writeJson(REPORT_PATH, {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    });

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-v9-shadowmap-parity/v1");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameResolution).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.g3dShadowMapRequested).toBe(true);
    expect(result.assertions.threeShadowMapEnabled).toBe(true);
    expect(result.assertions.pcfCoverage).toBe(true);
    expect(result.assertions.shadowContactVisible).toBe(true);
    expect(result.assertions.screenshotsNonBlank).toBe(true);
    expect(result.g3d.renderer.drawCalls).toBeGreaterThanOrEqual(3);
    expect(result.g3d.shadowMap).toMatchObject({ enabled: true, size: 2048, filter: "pcf", pcfSamples: 16, casterCount: 1, receiverCount: 1 });
    expect(result.threejs.renderer.drawCalls).toBeGreaterThanOrEqual(2);
    expect(result.threejs.shadowMap).toMatchObject({ enabled: true, type: "PCFSoftShadowMap", size: 2048, filter: "pcf-soft", casterCount: 1, receiverCount: 1 });
    expect(Math.abs(result.g3d.pixels.contactDarkening)).toBeGreaterThan(2.5);
    expect(Math.abs(result.threejs.pixels.contactDarkening)).toBeGreaterThan(2.5);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(20);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(20);
    expect(result.diff.meanDelta).toBeLessThanOrEqual(150);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.4);
    expect(pageErrors).toEqual([]);
    assertG3DShadowShaderUsesPCF();
    assertNoThreeJsInG3DShadowRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 1800 : 900);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 680 : 620);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 350_000 : 170_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(20);
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

function assertG3DShadowShaderUsesPCF(): void {
  const source = readFileSync(resolve("packages/rendering/src/ShaderLibrary.ts"), "utf8");
  expect(source).toContain("u_shadowMapTexture");
  expect(source).toContain("u_shadowMapTexelSize");
  expect(source).toContain("storedDepth");
  expect(source).toContain("u_shadowMapStrength");
}

function assertNoThreeJsInG3DShadowRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/v8-shadowmap-viewer/src/main.ts",
    "packages/rendering/src/ShadowPass.ts",
    "packages/rendering/src/ShadowMap.ts",
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

function stripDataUrls(result: Extract<ShadowMapParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type ShadowMapParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-v9-shadowmap-parity/v1";
      readonly g3d: {
        readonly renderer: { readonly drawCalls: number };
        readonly shadowMap: ShadowMapStats;
        readonly pixels: PixelStats;
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly shadowMap: ShadowMapStats;
        readonly pixels: PixelStats;
      };
      readonly diff: { readonly meanDelta: number; readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameResolution: boolean;
        readonly actualThreeRenderer: boolean;
        readonly g3dShadowMapRequested: boolean;
        readonly threeShadowMapEnabled: boolean;
        readonly pcfCoverage: boolean;
        readonly shadowContactVisible: boolean;
        readonly screenshotsNonBlank: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-v9-shadowmap-parity/v1";
      readonly error: string;
    };

interface ShadowMapStats {
  readonly enabled: boolean;
  readonly type: string;
  readonly size: number;
  readonly filter: string;
  readonly pcfSamples: number;
  readonly casterCount: number;
  readonly receiverCount: number;
}

interface PixelStats {
  readonly contactDarkening: number;
  readonly uniqueColorBuckets: number;
}

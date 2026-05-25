import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/threejs-parity/physical-lights-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/threejs-parity/physical-lights-parity/g3d-physical-lights.png",
  threejs: "tests/reports/threejs-parity/physical-lights-parity/threejs-physical-lights.png",
  sideBySide: "tests/reports/threejs-parity/physical-lights-parity/side-by-side.png"
} as const;

test.describe("V9 physical lights same-scene parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures G3D point/spot attenuation against actual Three.js PointLight and SpotLight", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/threejs-parity-physical-lights-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_PHYSICAL_LIGHTS_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_PHYSICAL_LIGHTS_PARITY__) as PhysicalLightsParityResult;
    writeJson(REPORT_PATH, {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    });

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-threejs-parity-physical-lights-parity/v1");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameResolution).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.g3dPointAndSpotLights).toBe(true);
    expect(result.assertions.threePointAndSpotLights).toBe(true);
    expect(result.assertions.inverseSquareSamples).toBe(true);
    expect(result.assertions.screenshotsNonBlank).toBe(true);
    expect(result.assertions.visibleLightGradient).toBe(true);
    expect(result.g3d.renderer.drawCalls).toBeGreaterThanOrEqual(4);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThanOrEqual(4);
    expect(result.g3d.lights.pointLights).toBe(1);
    expect(result.g3d.lights.spotLights).toBe(1);
    expect(result.g3d.lights.decay).toBe(2);
    expect(result.g3d.lights.range).toBeCloseTo(4.2, 5);
    expect(result.threejs.lights.pointLights).toBe(1);
    expect(result.threejs.lights.spotLights).toBe(1);
    expect(result.threejs.lights.decay).toBe(2);
    expect(result.attenuationSamples.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...result.attenuationSamples.map((sample) => sample.delta))).toBeLessThanOrEqual(0.18);
    expect(result.g3d.pixels.litPixels).toBeGreaterThan(25_000);
    expect(result.threejs.pixels.litPixels).toBeGreaterThan(25_000);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(60);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(60);
    expect(result.diff.meanDelta).toBeLessThanOrEqual(135);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.45);
    expect(pageErrors).toEqual([]);
    assertG3DShaderUsesRangeFalloffAndInverseSquare();
    assertNoThreeJsInG3DLightRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 1800 : 900);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 580 : 520);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 140_000 : 55_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(50);
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

function assertG3DShaderUsesRangeFalloffAndInverseSquare(): void {
  const source = readFileSync(resolve("packages/rendering/src/ShaderLibrary.ts"), "utf8");
  expect(source).toContain("pow(distanceToLight / range, 4.0)");
  expect(source).toContain("max(distanceToLight * distanceToLight, 1.0)");
  expect(source).toContain("smoothstep(outer, inner, cone)");
}

function assertNoThreeJsInG3DLightRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/lights-spotlight/src/main.ts",
    "packages/rendering/src/LightUniforms.ts",
    "packages/rendering/src/LightCollector.ts",
    "packages/rendering/src/ShaderLibrary.ts"
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

function stripDataUrls(result: Extract<PhysicalLightsParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type PhysicalLightsParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-threejs-parity-physical-lights-parity/v1";
      readonly g3d: {
        readonly renderer: { readonly drawCalls: number };
        readonly lights: LightStats;
        readonly pixels: PixelStats;
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly lights: LightStats;
        readonly pixels: PixelStats;
      };
      readonly attenuationSamples: readonly { readonly delta: number }[];
      readonly diff: { readonly meanDelta: number; readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameResolution: boolean;
        readonly actualThreeRenderer: boolean;
        readonly g3dPointAndSpotLights: boolean;
        readonly threePointAndSpotLights: boolean;
        readonly inverseSquareSamples: boolean;
        readonly screenshotsNonBlank: boolean;
        readonly visibleLightGradient: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-threejs-parity-physical-lights-parity/v1";
      readonly error: string;
    };

interface LightStats {
  readonly pointLights: number;
  readonly spotLights: number;
  readonly decay: number;
  readonly range: number;
}

interface PixelStats {
  readonly litPixels: number;
  readonly uniqueColorBuckets: number;
}

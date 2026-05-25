import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/threejs-parity/animation-multiple-parity.json";
const ARTIFACTS = {
  g3d: "tests/reports/threejs-parity/animation-multiple-parity/g3d-animation-multiple.png",
  threejs: "tests/reports/threejs-parity/animation-multiple-parity/threejs-animation-multiple.png",
  sideBySide: "tests/reports/threejs-parity/animation-multiple-parity/side-by-side.png"
} as const;

test.describe("V9 animation multiple same-asset Three.js parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("samples Soldier clones through G3D and actual Three.js AnimationMixer", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/threejs-parity-animation-multiple-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_ANIMATION_MULTIPLE_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_ANIMATION_MULTIPLE_PARITY__) as AnimationMultipleParityResult;
    writeJson(REPORT_PATH, {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    });

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.schema).toBe("g3d-threejs-parity-animation-multiple-parity/v1");
    expect(result.purpose).toBe("same-asset multi-clip G3D clone sampler vs actual Three.js AnimationMixer baseline");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameAssetUrl).toBe(true);
    expect(result.assertions.sameClips).toBe(true);
    expect(result.assertions.sameCloneCount).toBe(true);
    expect(result.assertions.actualThreeGLTFLoader).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.actualThreeAnimationMixer).toBe(true);
    expect(result.assertions.actualThreeSkeletonClone).toBe(true);
    expect(result.assertions.g3dCloneSamplerUpdatedSkinning).toBe(true);
    expect(result.assertions.screenshotsNonBlank).toBe(true);
    expect(result.g3d.animation.cloneCount).toBe(3);
    expect(result.threejs.animation.cloneCount).toBe(3);
    expect(result.threejs.animation.mixerCount).toBe(3);
    expect(result.threejs.animation.skinnedMeshCount).toBeGreaterThanOrEqual(3);
    expect(result.g3d.animation.skinningPalettesUpdated).toBeGreaterThanOrEqual(3);
    expect(new Set(result.g3d.animation.clipNames)).toEqual(new Set(["Walk", "Run", "Idle"]));
    expect(result.g3d.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.g3d.pixels.uniqueColorBuckets).toBeGreaterThan(36);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(36);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.25);
    expect(pageErrors).toEqual([]);
    assertNoThreeJsInG3DAnimationMultipleRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 1440 : 720);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 540 : 480);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 90_000 : 45_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(36);
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

function assertNoThreeJsInG3DAnimationMultipleRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/animation-multiple/src/main.ts",
    "apps/animation-multiple/src/agentSpawner.ts",
    "packages/assets/src/GLTFAnimationRuntime.ts"
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

function stripDataUrls(result: Extract<AnimationMultipleParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type AnimationMultipleParityResult =
  | {
      readonly status: "ready";
      readonly schema: "g3d-threejs-parity-animation-multiple-parity/v1";
      readonly purpose: string;
      readonly g3d: {
        readonly renderer: { readonly drawCalls: number };
        readonly animation: {
          readonly cloneCount: number;
          readonly clipNames: readonly string[];
          readonly skinningPalettesUpdated: number;
        };
        readonly pixels: { readonly uniqueColorBuckets: number };
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly animation: {
          readonly cloneCount: number;
          readonly mixerCount: number;
          readonly skinnedMeshCount: number;
        };
        readonly pixels: { readonly uniqueColorBuckets: number };
      };
      readonly diff: { readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameAssetUrl: boolean;
        readonly sameClips: boolean;
        readonly sameCloneCount: boolean;
        readonly actualThreeGLTFLoader: boolean;
        readonly actualThreeRenderer: boolean;
        readonly actualThreeAnimationMixer: boolean;
        readonly actualThreeSkeletonClone: boolean;
        readonly g3dCloneSamplerUpdatedSkinning: boolean;
        readonly screenshotsNonBlank: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "g3d-threejs-parity-animation-multiple-parity/v1";
      readonly error: string;
    };

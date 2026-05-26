import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_PATH = "tests/reports/threejs-parity/animation-keyframes-parity.json";
const ARTIFACTS = {
  a3d: "tests/reports/threejs-parity/animation-keyframes-parity/a3d-animation-keyframes.png",
  threejs: "tests/reports/threejs-parity/animation-keyframes-parity/threejs-animation-keyframes.png",
  sideBySide: "tests/reports/threejs-parity/animation-keyframes-parity/side-by-side.png"
} as const;

test.describe("V9 animation keyframes same-asset Three.js parity", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("samples Robot Expressive keyframes through A3D and actual Three.js AnimationMixer", async ({ page }) => {
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

    await page.goto(`${server.origin}/tools/threejs-parity-animation-keyframes-parity/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__V9_ANIMATION_KEYFRAMES_PARITY__ as { readonly status?: string } | undefined;
        return result?.status === "ready" || result?.status === "error";
      },
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__V9_ANIMATION_KEYFRAMES_PARITY__) as AnimationKeyframesParityResult;
    writeJson(REPORT_PATH, {
      ...(result.status === "ready" ? stripDataUrls(result) : result),
      generatedAt: new Date().toISOString(),
      artifacts: ARTIFACTS,
      pageErrors
    });

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    if (result.status !== "ready") return;

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const dataUrl = result.dataUrls[kind as keyof typeof ARTIFACTS];
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      writePng(path, dataUrl);
    }

    expect(result.schema).toBe("a3d-threejs-parity-animation-keyframes-parity/v1");
    expect(result.purpose).toBe("same-asset Robot Expressive A3D keyframe sampling vs actual Three.js AnimationMixer baseline");
    expect(result.assertions.fakeEqualityClaimed).toBe(false);
    expect(result.assertions.sameAssetUrl).toBe(true);
    expect(result.assertions.sameClip).toBe(true);
    expect(result.assertions.actualThreeGLTFLoader).toBe(true);
    expect(result.assertions.actualThreeRenderer).toBe(true);
    expect(result.assertions.actualThreeAnimationMixer).toBe(true);
    expect(result.assertions.a3dAppliedTracksAndSkinning).toBe(true);
    expect(result.assertions.screenshotsNonBlank).toBe(true);
    expect(result.a3d.animation.clipName).toBe("Dance");
    expect(result.threejs.animation.clipName).toBe("Dance");
    expect(result.a3d.animation.clipCount).toBeGreaterThanOrEqual(1);
    expect(result.threejs.animation.clipCount).toBeGreaterThanOrEqual(1);
    expect(result.a3d.animation.tracksApplied).toBeGreaterThan(0);
    expect(result.a3d.animation.skinningPalettesUpdated).toBeGreaterThan(0);
    expect(result.threejs.animation.trackCount).toBeGreaterThan(0);
    expect(result.threejs.animation.skinnedMeshCount).toBeGreaterThan(0);
    expect(result.a3d.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.threejs.renderer.drawCalls).toBeGreaterThan(0);
    expect(result.a3d.pixels.uniqueColorBuckets).toBeGreaterThan(32);
    expect(result.threejs.pixels.uniqueColorBuckets).toBeGreaterThan(32);
    expect(result.diff.structuralSimilarityProxy).toBeGreaterThanOrEqual(0.25);
    expect(pageErrors).toEqual([]);
    assertNoThreeJsInA3DAnimationKeyframesRuntimeSource();

    for (const [kind, path] of Object.entries(ARTIFACTS)) {
      const stats = readV6PngStats(resolve(path));
      expect(stats.width, `${kind} width`).toBe(kind === "sideBySide" ? 2560 : 1280);
      expect(stats.height, `${kind} height`).toBe(kind === "sideBySide" ? 780 : 720);
      expect(stats.nonBlackPixels, `${kind} nonblank pixels`).toBeGreaterThan(kind === "sideBySide" ? 90_000 : 45_000);
      expect(stats.uniqueColorBuckets, `${kind} unique color buckets`).toBeGreaterThan(32);
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

function assertNoThreeJsInA3DAnimationKeyframesRuntimeSource(): void {
  const forbidden = /from\s+["'][^"']*three|node_modules\/three|new\s+THREE\.|THREE\./i;
  for (const sourcePath of [
    "apps/animation-keyframes/src/main.ts",
    "apps/animation-keyframes/src/scene.ts",
    "apps/animation-keyframes/src/state.ts",
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

function stripDataUrls(result: Extract<AnimationKeyframesParityResult, { readonly status: "ready" }>): Omit<typeof result, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

type AnimationKeyframesParityResult =
  | {
      readonly status: "ready";
      readonly schema: "a3d-threejs-parity-animation-keyframes-parity/v1";
      readonly purpose: string;
      readonly a3d: {
        readonly renderer: { readonly drawCalls: number };
        readonly animation: {
          readonly clipName: string;
          readonly clipCount: number;
          readonly tracksApplied: number;
          readonly skinningPalettesUpdated: number;
        };
        readonly pixels: { readonly uniqueColorBuckets: number };
      };
      readonly threejs: {
        readonly renderer: { readonly drawCalls: number };
        readonly animation: {
          readonly clipName: string;
          readonly clipCount: number;
          readonly trackCount: number;
          readonly skinnedMeshCount: number;
        };
        readonly pixels: { readonly uniqueColorBuckets: number };
      };
      readonly diff: { readonly structuralSimilarityProxy: number };
      readonly assertions: {
        readonly sameAssetUrl: boolean;
        readonly sameClip: boolean;
        readonly actualThreeGLTFLoader: boolean;
        readonly actualThreeRenderer: boolean;
        readonly actualThreeAnimationMixer: boolean;
        readonly a3dAppliedTracksAndSkinning: boolean;
        readonly screenshotsNonBlank: boolean;
        readonly fakeEqualityClaimed: false;
      };
      readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
    }
  | {
      readonly status: "error";
      readonly schema: "a3d-threejs-parity-animation-keyframes-parity/v1";
      readonly error: string;
    };

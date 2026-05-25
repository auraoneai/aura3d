import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = "tests/reports/v9/advanced-examples-gallery/product-wow-delayed-env";

declare global {
  interface Window {
    __g3dWowRuntime?: WowRuntime;
  }
}

test.describe("wow neon city car delayed environment stability", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures early and late car frames to isolate delayed HDR speckle source", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(`${server.origin}/apps/wow-neon-city/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const runtime = window.__g3dWowRuntime;
        return (runtime?.status === "ready" || runtime?.status === "running" || runtime?.status === "error")
          && (runtime?.frameCount ?? 0) >= 2;
      },
      undefined,
      { timeout: 90_000 }
    );

    const earlyRuntime = await wowRuntime(page);
    expect(earlyRuntime.status, earlyRuntime.error).not.toBe("error");
    const earlyStats = await carCanvasStats(page);
    const earlyPath = join(REPORT_DIR, "wow-neon-city-car-early.png");
    mkdirSync(REPORT_DIR, { recursive: true });
    const earlyPng = await page.locator("#viewport").screenshot({ path: earlyPath });

    await page.waitForFunction(
      (firstFrameCount) => {
        const runtime = window.__g3dWowRuntime;
        return (runtime?.frameCount ?? 0) >= firstFrameCount + 4 || (runtime?.status === "error");
      },
      earlyRuntime.frameCount,
      { timeout: 60_000 }
    ).catch(() => {
      // The visual failure is delayed environment activation, not a fixed frame count.
      // Low local FPS must still produce a late-state diagnostic instead of timing out.
    });
    await page.waitForTimeout(6_000);

    const lateRuntime = await wowRuntime(page);
    expect(lateRuntime.status, lateRuntime.error).not.toBe("error");
    const lateStats = await carCanvasStats(page);
    const latePath = join(REPORT_DIR, "wow-neon-city-car-late.png");
    const latePng = await page.locator("#viewport").screenshot({ path: latePath });

    expect(pageErrors).toEqual([]);
    expect(earlyStats.nonBlackPixels).toBeGreaterThan(50_000);
    expect(lateStats.nonBlackPixels).toBeGreaterThan(50_000);
    expect(lateRuntime.frameCount).toBeGreaterThanOrEqual(earlyRuntime.frameCount);

    const diagnosis = diagnoseDelayedEnvironment(earlyStats, lateStats);
    const report = {
      schema: "g3d-wow-neon-city-car-delayed-environment-diagnostic/v1",
      source: "tests/browser/wow-neon-city-car-stability.spec.ts",
      route: "apps/wow-neon-city",
      asset: "car-concept",
      purpose: "Bounded diagnostic for the user-observed failure where the car starts clean and then develops white speckle/halo after delayed HDR environment activation.",
      early: {
        runtime: earlyRuntime,
        screenshot: earlyPath,
        sha256: sha256DataUrl(earlyPng),
        stats: earlyStats
      },
      late: {
        runtime: lateRuntime,
        screenshot: latePath,
        sha256: sha256DataUrl(latePng),
        stats: lateStats
      },
      delta: {
        brightSpeckleRatio: round6(lateStats.brightSpeckleRatio - earlyStats.brightSpeckleRatio),
        edgeHaloRatio: round6(lateStats.edgeHaloRatio - earlyStats.edgeHaloRatio),
        grayWhiteCoverage: round6(lateStats.grayWhiteCoverage - earlyStats.grayWhiteCoverage),
        washedGrayWhiteRatio: round6(lateStats.washedGrayWhiteRatio - earlyStats.washedGrayWhiteRatio),
        localLumaNoise: round6(lateStats.localLumaNoise - earlyStats.localLumaNoise)
      },
      ownerConclusion: diagnosis
    };
    writeFileSync(join(REPORT_DIR, "wow-neon-city-car-stability.json"), `${JSON.stringify(report, null, 2)}\n`);
  });
});

interface WowRuntime {
  readonly status: "loading" | "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly textures: number;
  readonly error?: string;
}

interface CarArtifactStats {
  readonly width: number;
  readonly height: number;
  readonly nonBlackPixels: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly uniqueColorBuckets: number;
  readonly redPaintCoverage: number;
  readonly brightSpeckleRatio: number;
  readonly edgeHaloRatio: number;
  readonly grayWhiteCoverage: number;
  readonly washedGrayWhiteRatio: number;
  readonly localLumaNoise: number;
}

async function wowRuntime(page: Page): Promise<WowRuntime> {
  return await page.evaluate(() => {
    const runtime = window.__g3dWowRuntime;
    if (!runtime) throw new Error("Missing wow runtime.");
    return runtime;
  });
}

async function carCanvasStats(page: Page): Promise<CarArtifactStats> {
  return await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing #viewport canvas.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("Missing WebGL2 context for #viewport.");
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let nonBlackPixels = 0;
    let lumaTotal = 0;
    let lumaSquaredTotal = 0;
    let maxLuma = 0;
    let redPaintPixels = 0;
    let brightSpeckles = 0;
    let edgeHaloPixels = 0;
    let grayWhitePixels = 0;
    let washedGrayWhitePixels = 0;
    const buckets = new Set<number>();
    const roundMetric = (value: number): number => Number(value.toFixed(6));
    const lumaAt = (x: number, y: number): number => {
      const index = (y * width + x) * 4;
      return 0.2126 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.0722 * (pixels[index + 2] ?? 0);
    };
    const isIsolatedHighlight = (luma: number, x: number, y: number): boolean => {
      let brightNeighbors = 0;
      let neighborTotal = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighborLuma = lumaAt(x + dx, y + dy);
          neighborTotal += neighborLuma;
          if (neighborLuma > 130) brightNeighbors += 1;
        }
      }
      return brightNeighbors <= 1 && luma - neighborTotal / 8 > 42;
    };
    const touchesDarkNeighbor = (x: number, y: number): boolean => {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (lumaAt(x + dx, y + dy) < 32) return true;
        }
      }
      return false;
    };

    for (let y = 1; y + 1 < height; y += 1) {
      for (let x = 1; x + 1 < width; x += 1) {
        const index = (y * width + x) * 4;
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (red + green + blue > 12) nonBlackPixels += 1;
        lumaTotal += luma;
        lumaSquaredTotal += luma * luma;
        maxLuma = Math.max(maxLuma, luma);
        buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
        if (red > 36 && red - Math.max(green, blue) > 16) redPaintPixels += 1;
        if (luma > 138 && isIsolatedHighlight(luma, x, y)) brightSpeckles += 1;
        if (luma > 128 && chroma < 34 && touchesDarkNeighbor(x, y)) edgeHaloPixels += 1;
        if (luma > 92 && chroma < 28) grayWhitePixels += 1;
        if (luma > 132 && chroma < 22) washedGrayWhitePixels += 1;
      }
    }

    const samplePixels = Math.max(1, (width - 2) * (height - 2));
    const averageLuma = lumaTotal / samplePixels;
    const variance = Math.max(0, lumaSquaredTotal / samplePixels - averageLuma * averageLuma);
    return {
      width,
      height,
      nonBlackPixels,
      averageLuma: roundMetric(averageLuma),
      maxLuma: roundMetric(maxLuma),
      uniqueColorBuckets: buckets.size,
      redPaintCoverage: roundMetric(redPaintPixels / samplePixels),
      brightSpeckleRatio: roundMetric(brightSpeckles / Math.max(1, nonBlackPixels)),
      edgeHaloRatio: roundMetric(edgeHaloPixels / Math.max(1, nonBlackPixels)),
      grayWhiteCoverage: roundMetric(grayWhitePixels / samplePixels),
      washedGrayWhiteRatio: roundMetric(washedGrayWhitePixels / Math.max(1, nonBlackPixels)),
      localLumaNoise: roundMetric(Math.sqrt(variance))
    };
  });
}

function diagnoseDelayedEnvironment(early: CarArtifactStats, late: CarArtifactStats): {
  readonly delayedHdrTakeoverDetected: boolean;
  readonly sourceOwner: string;
  readonly nextSourceChange: string;
  readonly routeCaptureAllowed: false;
} {
  const whiteDelta = late.grayWhiteCoverage - early.grayWhiteCoverage;
  const washedDelta = late.washedGrayWhiteRatio - early.washedGrayWhiteRatio;
  const edgeDelta = late.edgeHaloRatio - early.edgeHaloRatio;
  const speckleDelta = late.brightSpeckleRatio - early.brightSpeckleRatio;
  const delayedHdrTakeoverDetected = whiteDelta > 0.018 || washedDelta > 0.006 || edgeDelta > 0.0015 || speckleDelta > 0.0004;
  return delayedHdrTakeoverDetected
    ? {
      delayedHdrTakeoverDetected,
      sourceOwner: "packages/engine/src/v8/index.ts plus packages/rendering/src/ShaderLibrary.ts sampled HDR/specular path",
      nextSourceChange: "Treat delayed sampled HDR activation as the white-speckle source: add a car-concept sampled-environment clamp/disable path before any Product route acceptance work.",
      routeCaptureAllowed: false
    }
    : {
      delayedHdrTakeoverDetected,
      sourceOwner: "packages/assets/src/CarConceptMaterialStability.ts Product gallery material profile",
      nextSourceChange: "Delayed v8 HDR did not reproduce a white takeover with the current code; keep Product failed and tune the gallery car material profile/material richness before the next Product route capture.",
      routeCaptureAllowed: false
    };
}

function sha256DataUrl(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

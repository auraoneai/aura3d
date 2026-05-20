import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const screenshotPath = "tests/reports/v4-example-screenshots/large-world-streaming.png";

test.describe("large-world streaming V4 example", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("streams cells, culls, selects LODs, and reports camera-path metrics", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/large-world-streaming/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const state = window.__GALILEO3D_LARGE_WORLD_STREAMING__;
      return state?.status === "ready" && Number(state.metrics?.cameraSamples ?? 0) > 24 && Number(state.metrics?.streamedIn ?? 0) > 0;
    }, undefined, { timeout: 30_000 });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => window.__GALILEO3D_LARGE_WORLD_STREAMING__);
    const pixels = await canvasPixelStats(page);
    mkdirSync(join(process.cwd(), "tests/reports/v4-example-screenshots"), { recursive: true });
    await page.screenshot({ path: join(process.cwd(), screenshotPath), fullPage: true });

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(state?.renderer).toBe("webgl2");
    expect(state?.screenshotPath).toBe(screenshotPath);
    expect(state?.featureEvidence?.generatedModularAssets).toBe(true);
    expect(state?.featureEvidence?.asyncChunkLoading).toBe(true);
    expect(state?.featureEvidence?.frustumCulling).toBe(true);
    expect(state?.featureEvidence?.lodSelection).toBe(true);
    expect(state?.featureEvidence?.cameraPathMetrics).toBe(true);
    expect(state?.featureEvidence?.frameAndMemoryMetrics).toBe(true);
    expect(state?.featureEvidence?.oldBranchTerrainGeneratorPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchWeatherSystemPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchVegetationSystemPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchLSystemVegetationPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchVoxelWorldPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchOceanSystemPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchBvhHizCullingPort).toBe(true);
    expect(state?.featureEvidence?.bvhCullingHierarchy).toBe(true);
    expect(state?.featureEvidence?.hizOcclusionTelemetry).toBe(true);
    expect(Number(state?.metrics?.loadedCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.visibleCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.culledCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.asyncLoadRequests ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.triangles ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.memoryBytes ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cameraPathLength ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics?.terrainFixtureSource).toBe("origin-master-terrain-generator-adapted");
    expect(String(state?.metrics?.terrainFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics?.terrainFixtureWidth ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics?.terrainFixtureHeight ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics?.terrainRoughness ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.terrainRiverCellCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.terrainBiomeCount ?? 0)).toBeGreaterThanOrEqual(3);
    expect(state?.metrics?.weatherFixtureSource).toBe("origin-master-weather-system-adapted");
    expect(String(state?.metrics?.weatherFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics?.weatherType).toBe("rain");
    expect(Number(state?.metrics?.weatherRainIntensity ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.weatherVisibleDropCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.weatherVisualDropRenderItems ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.weatherSplashCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.weatherPuddleDepth ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.weatherPuddlePatchRenderItems ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.weatherWetness ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics?.vegetationFixtureSource).toBe("origin-master-vegetation-system-adapted");
    expect(String(state?.metrics?.vegetationFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics?.vegetationInstances ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationVisible ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationCulled ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationMeshLod ?? 0) + Number(state?.metrics?.vegetationImpostorLod ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationTreeCount ?? 0) + Number(state?.metrics?.vegetationGrassCount ?? 0) + Number(state?.metrics?.vegetationShrubCount ?? 0)).toBe(Number(state?.metrics?.vegetationInstances ?? -1));
    expect(Number(state?.metrics?.vegetationMaxWindOffset ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics?.vegetationLSystemSource).toBe("origin-master-lsystem-turtle-adapted");
    expect(String(state?.metrics?.vegetationLSystemHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics?.vegetationLSystemIterations ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics?.vegetationLSystemSymbolLength ?? 0)).toBeGreaterThan(10);
    expect(Number(state?.metrics?.vegetationLSystemBranchSegments ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationLSystemRenderedBranchSegments ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationLSystemBranchTips ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.vegetationLSystemMaxDepth ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics?.voxelFixtureSource).toBe("origin-master-voxel-world-adapted");
    expect(String(state?.metrics?.voxelFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics?.voxelBlockTypeCount ?? 0)).toBe(20);
    expect(Number(state?.metrics?.voxelSolidBlockTypes ?? 0)).toBeGreaterThan(10);
    expect(Number(state?.metrics?.voxelTransparentBlockTypes ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics?.voxelAnimatedBlockTypes ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics?.voxelEmittingBlockTypes ?? 0)).toBe(1);
    expect(Number(state?.metrics?.voxelChunkQueueSize ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelGeneratingChunks ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelMeshingChunks ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelLodNear ?? 0) + Number(state?.metrics?.voxelLodMid ?? 0) + Number(state?.metrics?.voxelLodFar ?? 0) + Number(state?.metrics?.voxelLodCulled ?? 0)).toBe(Number(state?.metrics?.voxelChunkQueueSize ?? -1));
    expect(Number(state?.metrics?.voxelVisibleBlocks ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelVisibleFaceEstimate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelMemoryBytes ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelGrassBlocks ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.voxelStoneBlocks ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics?.oceanFixtureSource).toBe("origin-master-ocean-gerstner-foam-buoyancy-adapted");
    expect(String(state?.metrics?.oceanFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics?.oceanPreset).toBe("moderate");
    expect(Number(state?.metrics?.oceanWaveCount ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics?.oceanSampleCount ?? 0)).toBeGreaterThanOrEqual(5);
    expect(Number(state?.metrics?.oceanMaxHeight ?? 0)).toBeGreaterThan(Number(state?.metrics?.oceanMinHeight ?? 0));
    expect(Number(state?.metrics?.oceanMaxFoam ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.oceanFoamPatches ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.oceanBuoyancySamplePoints ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.oceanBuoyancySubmergedPoints ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.oceanBuoyancySubmergedVolume ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics?.oceanBuoyancyForceY ?? 0))).toBeGreaterThan(0);
    expect(String(state?.metrics?.oceanBlockedClaims ?? "")).toContain("Unity HDRP water parity");
    expect(String(state?.metrics?.oceanBlockedClaims ?? "")).toContain("Unreal Water plugin parity");
    expect(state?.metrics?.cullingFixtureSource).toBe("origin-master-bvh-hiz-occlusion-adapted");
    expect(String(state?.metrics?.cullingFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics?.cullingObjectCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingBvhNodeCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingBvhLeafCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingBvhMaxDepth ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics?.cullingBvhSahSplitCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingBvhBoundsTests ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingBvhObjectTests ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingBvhRangeQueryHits ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingFrustumVisibleObjects ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingFrustumCulledObjects ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingHizMipLevels ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics?.cullingHizDepthPyramidTexels ?? 0)).toBeGreaterThan(320 * 180);
    expect(Number(state?.metrics?.cullingHizConservativeTests ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingHizOccludedObjects ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingHizVisibleObjects ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.cullingHizEstimatedBuildMs ?? 1)).toBeLessThan(0.5);
    expect(Number(state?.metrics?.cullingHizEstimatedTestMs ?? 1)).toBeLessThan(0.3);
    expect(Number(state?.metrics?.cullingFrameCoherentReused ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics?.cullingBlockedClaims ?? "")).toContain("Unity occlusion culling parity");
    expect(String(state?.metrics?.cullingBlockedClaims ?? "")).toContain("Unreal Nanite/occlusion parity");
    expect(String(state?.metrics?.activeLodLevels ?? "")).toContain("high");
    expect(String(state?.metrics?.activeLodLevels ?? "")).toContain("medium");
    expect(String(state?.metrics?.activeLodLevels ?? "")).toContain("low");
    expect(Number(state?.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(0);
    expect(pixels.nonBlankPixels).toBeGreaterThan(400);
    expect(pixels.colorBuckets).toBeGreaterThan(2);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function canvasPixelStats(page: Page): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='large-world-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { nonBlankPixels: 0, colorBuckets: 0 };
    const width = Math.min(260, canvas.width);
    const height = Math.min(160, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      }
    }
    return { nonBlankPixels, colorBuckets: buckets.size };
  });
}

declare global {
  interface Window {
    __GALILEO3D_LARGE_WORLD_STREAMING__?: {
      readonly status?: "ready" | "error";
      readonly renderer?: "webgl2";
      readonly screenshotPath?: string;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly featureEvidence?: Record<string, unknown>;
      readonly metrics?: Record<string, unknown>;
    };
  }
}

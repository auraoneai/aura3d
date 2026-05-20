import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 Three.js example parity lab", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the first G3D V7 parity lab for animation, IK, decals, stereo, and physics", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize({ width: 1800, height: 1100 });
    await page.goto(`${server.origin}/apps/v7-example-parity-lab/`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const runtime = window.__g3dV7ExampleParityLab as { status?: string } | undefined;
          return runtime?.status === "ready" || runtime?.status === "error";
        },
        undefined,
        { timeout: 120_000 }
      );
    } catch (error) {
      throw new Error(`V7 example parity lab did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const runtime = await page.evaluate(() => window.__g3dV7ExampleParityLab) as {
      status: "ready" | "error";
      error?: string;
      appId: string;
      rendererBackend?: string;
      categories?: Record<string, { targetThreeExample: string; status: string; evidence: readonly string[]; missingForParity: readonly string[] }>;
      assets?: readonly {
        id: string;
        animationCount: number;
        skinCount: number;
        morphTargetCount: number;
        materialCount: number;
        textureCount: number;
        vertexCount: number;
        indexCount: number;
      }[];
      mixer?: {
        actionCount: number;
        idleWeight: number;
        walkWeight: number;
        runWeight: number;
        additiveUpperBodyWeight: number;
        sampledRootMotion: readonly [number, number, number];
        crossFadeExecuted: boolean;
      };
      importedAnimation?: {
        sceneRuntimeCount: number;
        characterClip: {
          tracksApplied: number;
          transformTracksApplied: number;
          morphWeightTracksApplied: number;
          skinningPalettesUpdated: number;
          missingTargets: readonly string[];
          unsupportedTracks: readonly string[];
        };
        characterBlendClip: {
          blendedClipCount?: number;
          tracksApplied: number;
          transformTracksApplied: number;
          morphWeightTracksApplied: number;
          skinningPalettesUpdated: number;
          missingTargets: readonly string[];
          unsupportedTracks: readonly string[];
        };
        morphClip: {
          blendedClipCount?: number;
          tracksApplied: number;
          transformTracksApplied: number;
          morphWeightTracksApplied: number;
          skinningPalettesUpdated: number;
          missingTargets: readonly string[];
          unsupportedTracks: readonly string[];
        };
      };
      ik?: {
        reached: boolean;
        endDistanceToTarget: number;
        poleInfluence: number;
        renderedHandles: number;
        importedSkeletonApplied: boolean;
        importedSkinningPalettesUpdated: number;
        importedJointNames: readonly [string, string, string];
      };
      decals?: {
        projectedDecalCount: number;
        raycastHitCount: number;
        projectedOnImportedBounds: boolean;
        orientedProjectorCount: number;
        sourceTriangleCount: number;
        clippedTriangleCount: number;
        decalVertexCount: number;
      };
      stereo?: {
        leftViewItems: number;
        rightViewItems: number;
        eyeSeparation: number;
        layout: string;
        convergenceDistance: number;
        leftViewport: { x: number; y: number; width: number; height: number };
        rightViewport: { x: number; y: number; width: number; height: number };
        leftProjectionOffset: number;
        rightProjectionOffset: number;
        leftDrawCalls: number;
        rightDrawCalls: number;
        leftNonBlackPixels: number;
        rightNonBlackPixels: number;
      };
      physics?: {
        bodyCount: number;
        colliderCount: number;
        constraintCount: number;
        contacts: number;
        steps: number;
        kineticEnergy: number;
        renderedBodies: number;
        raycastHits: number;
        sphereCastHits: number;
        maxContactPenetration: number;
      };
      proof?: {
        summary: { pass: boolean; missing: readonly string[] };
        drawCalls: number;
        triangles: number;
        textureBytes: number;
        nonBlackPixels: number;
        uniqueColorBuckets: number;
      };
    };

    expect(runtime.status, runtime.error).toBe("ready");
    expect(runtime.appId).toBe("v7-example-parity-lab");
    expect(runtime.rendererBackend).toBe("webgl2");
    expect(runtime.proof?.summary.pass, runtime.proof?.summary.missing.join(", ")).toBe(true);
    expect(runtime.proof?.drawCalls ?? 0).toBeGreaterThan(48);
    expect(runtime.proof?.triangles ?? 0).toBeGreaterThan(100_000);
    expect(runtime.proof?.textureBytes ?? 0).toBeGreaterThan(512 * 1024);
    expect(runtime.proof?.nonBlackPixels ?? 0).toBeGreaterThan(500_000);
    expect(runtime.proof?.uniqueColorBuckets ?? 0).toBeGreaterThan(160);

    expect(runtime.assets?.find((asset) => asset.id === "robot-expressive")?.animationCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "robot-expressive")?.skinCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "soldier")?.animationCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "soldier")?.skinCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "animated-morph-cube")?.morphTargetCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "damaged-helmet")?.textureCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "chronograph-watch")?.materialCount ?? 0).toBeGreaterThan(0);
    expect(runtime.assets?.find((asset) => asset.id === "car-concept")?.vertexCount ?? 0).toBeGreaterThan(1_000);
    expect(runtime.assets?.find((asset) => asset.id === "materials-variants-shoe")?.textureCount ?? 0).toBeGreaterThan(0);

    expect(runtime.mixer?.actionCount).toBeGreaterThanOrEqual(4);
    expect(runtime.mixer?.crossFadeExecuted).toBe(true);
    expect(runtime.mixer?.walkWeight ?? 0).toBeGreaterThan(0.5);
    expect(runtime.mixer?.additiveUpperBodyWeight).toBeGreaterThan(0.2);
    expect(Math.abs(runtime.mixer?.sampledRootMotion[0] ?? 0)).toBeGreaterThan(0.01);
    expect(runtime.importedAnimation?.sceneRuntimeCount).toBe(2);
    expect(runtime.importedAnimation?.characterClip.transformTracksApplied ?? 0).toBeGreaterThan(40);
    expect(runtime.importedAnimation?.characterClip.skinningPalettesUpdated ?? 0).toBeGreaterThan(0);
    expect(runtime.importedAnimation?.characterClip.missingTargets).toEqual([]);
    expect(runtime.importedAnimation?.characterBlendClip.blendedClipCount).toBe(2);
    expect(runtime.importedAnimation?.characterBlendClip.transformTracksApplied ?? 0).toBeGreaterThan(40);
    expect(runtime.importedAnimation?.characterBlendClip.skinningPalettesUpdated ?? 0).toBeGreaterThan(0);
    expect(runtime.importedAnimation?.characterBlendClip.missingTargets).toEqual([]);
    expect(runtime.importedAnimation?.morphClip.blendedClipCount).toBe(3);
    expect(runtime.importedAnimation?.morphClip.morphWeightTracksApplied).toBe(1);
    expect(runtime.importedAnimation?.morphClip.missingTargets).toEqual([]);

    expect(runtime.ik?.renderedHandles).toBeGreaterThanOrEqual(4);
    expect(runtime.ik?.importedSkeletonApplied).toBe(true);
    expect(runtime.ik?.importedSkinningPalettesUpdated ?? 0).toBeGreaterThan(0);
    expect(runtime.ik?.importedJointNames).toHaveLength(3);
    expect(runtime.ik?.endDistanceToTarget ?? Number.POSITIVE_INFINITY).toBeLessThan(0.4);
    expect(runtime.ik?.poleInfluence ?? 0).toBeGreaterThan(0.2);

    expect(runtime.decals?.projectedDecalCount ?? 0).toBeGreaterThanOrEqual(3);
    expect(runtime.decals?.raycastHitCount).toBe(runtime.decals?.projectedDecalCount);
    expect(runtime.decals?.orientedProjectorCount).toBe(runtime.decals?.projectedDecalCount);
    expect(runtime.decals?.projectedOnImportedBounds).toBe(true);
    expect(runtime.decals?.sourceTriangleCount ?? 0).toBeGreaterThan(1000);
    expect(runtime.decals?.clippedTriangleCount ?? 0).toBeGreaterThan(0);
    expect(runtime.decals?.decalVertexCount ?? 0).toBeGreaterThan(0);

    expect(runtime.stereo?.leftViewItems).toBeGreaterThanOrEqual(6);
    expect(runtime.stereo?.rightViewItems).toBeGreaterThanOrEqual(6);
    expect(runtime.stereo?.eyeSeparation).toBeCloseTo(0.064, 3);
    expect(runtime.stereo?.layout).toBe("side-by-side");
    expect(runtime.stereo?.convergenceDistance ?? 0).toBeGreaterThan(8);
    expect(runtime.stereo?.leftViewport).toEqual({ x: 0, y: 0, width: 1280, height: 1440 });
    expect(runtime.stereo?.rightViewport).toEqual({ x: 1280, y: 0, width: 1280, height: 1440 });
    expect(runtime.stereo?.leftProjectionOffset ?? 0).toBeLessThan(runtime.stereo?.rightProjectionOffset ?? 0);
    expect(runtime.stereo?.leftDrawCalls ?? 0).toBeGreaterThan(28);
    expect(runtime.stereo?.rightDrawCalls ?? 0).toBeGreaterThan(28);
    expect(runtime.stereo?.leftNonBlackPixels ?? 0).toBeGreaterThan(240_000);
    expect(runtime.stereo?.rightNonBlackPixels ?? 0).toBeGreaterThan(240_000);

    expect(runtime.physics?.bodyCount ?? 0).toBeGreaterThanOrEqual(11);
    expect(runtime.physics?.colliderCount ?? 0).toBeGreaterThanOrEqual(11);
    expect(runtime.physics?.constraintCount ?? 0).toBeGreaterThanOrEqual(2);
    expect(runtime.physics?.contacts ?? 0).toBeGreaterThan(0);
    expect(runtime.physics?.raycastHits ?? 0).toBeGreaterThan(0);
    expect(runtime.physics?.sphereCastHits ?? 0).toBeGreaterThan(0);
    expect(runtime.physics?.steps).toBe(120);
    expect(runtime.physics?.renderedBodies ?? 0).toBeGreaterThanOrEqual(10);
    expect(runtime.physics?.maxContactPenetration ?? 0).toBeGreaterThanOrEqual(0);

    const categoryIds = ["keyframes", "skinningBlending", "additiveBlending", "morph", "ik", "decals", "stereo", "physics"];
    for (const id of categoryIds) {
      const category = runtime.categories?.[id];
      expect(category?.status, id).toBe("implemented-foundation");
      expect(category?.targetThreeExample, id).toBeTruthy();
      expect(category?.evidence.length ?? 0, id).toBeGreaterThan(0);
      expect(category?.missingForParity.length ?? 0, id).toBeGreaterThan(0);
    }

    const reportDir = "tests/reports/v7/threejs-example-parity-lab";
    mkdirSync(resolve(reportDir), { recursive: true });
    const screenshotPath = `${reportDir}/v7-example-parity-lab.png`;
    const canvasPngBase64 = await page.locator("#viewport").evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected #viewport to be a canvas.");
      return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    });
    writeFileSync(resolve(screenshotPath), Buffer.from(canvasPngBase64, "base64"));
    const pngStats = readV6PngStats(resolve(screenshotPath));
    expect(pngStats.width).toBe(2560);
    expect(pngStats.height).toBe(1440);
    expect(pngStats.nonBlackPixels).toBeGreaterThan(500_000);
    expect(pngStats.uniqueColorBuckets).toBeGreaterThan(160);
    expect(pngStats.detailEdgeDensity).toBeGreaterThan(0.005);
    expect(statSync(resolve(screenshotPath)).size).toBeGreaterThan(200 * 1024);

    const reportPath = `${reportDir}/v7-example-parity-lab-report.json`;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      schema: "g3d-v7-threejs-example-parity-lab/v1",
      generatedAt: new Date().toISOString(),
      app: "apps/v7-example-parity-lab",
      screenshot: screenshotPath,
      screenshotStats: pngStats,
      runtime
    }, null, 2)}\n`);
  });
});

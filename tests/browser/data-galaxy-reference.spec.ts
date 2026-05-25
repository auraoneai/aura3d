import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __DATA_GALAXY_REFERENCE__?: unknown;
  }
}

test.describe("Data Galaxy same-system reference harness", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders Data Galaxy particles, lines, core systems, and renderer state without gallery shell UI", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Data Galaxy Reference Harness</title>
        </head>
        <body>
          <script type="module" src="${server.origin}/tests/browser/data-galaxy-reference-harness.js"></script>
        </body>
      </html>
    `);

    try {
      await page.waitForFunction(
        () => {
          const result = window.__DATA_GALAXY_REFERENCE__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
    } catch (error) {
      throw new Error(`Data Galaxy reference harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__DATA_GALAXY_REFERENCE__) as {
      status: "ready" | "error";
      schema?: string;
      error?: string;
      route?: string;
      harness?: {
        galleryShellUi?: boolean;
        fixedCamera?: boolean;
        fixedDensity?: boolean;
        fixedBackground?: boolean;
        importedRouteModules?: readonly string[];
        claimBoundary?: string;
      };
      render?: {
        width?: number;
        height?: number;
        cssWidth?: number;
        cssHeight?: number;
        devicePixelRatio?: number;
        effectiveBackingDprX?: number;
        effectiveBackingDprY?: number;
        rendererBackend?: string;
        cpuGpuMode?: string;
        diagnostics?: {
          drawCalls?: number;
          visibleObjects?: number;
          submittedObjects?: number;
          postprocessPasses?: number;
          postprocessPassNames?: readonly string[];
          postprocessTargetFormat?: string;
          lastError?: string | null;
          contextLost?: boolean;
        };
        pixelStats?: {
          nonBlackPixels?: number;
          nonTransparentPixels?: number;
          uniqueColorBuckets?: number;
          averageLuma?: number;
          maxLuma?: number;
        };
      };
      dataGalaxy?: {
        requestedParticles?: number;
        effectiveParticles?: number;
        mode?: string;
        densityTier?: string;
        primaryCount?: number;
        vortexCount?: number;
        networkCount?: number;
        waveCount?: number;
        nativeGpuComputeDispatches?: number;
        overlayPointCount?: number;
        overlayPointDrawBatches?: number;
        lineSegmentCount?: number;
        lineDrawBatches?: number;
        trailSegmentCount?: number;
        connectionSegmentCount?: number;
        telemetryRingSegmentCount?: number;
        totalParticleEvidenceCount?: number;
        totalLineEvidenceCount?: number;
        attractorCount?: number;
        coreSystemLabels?: readonly string[];
        systems?: readonly string[];
        approximations?: readonly string[];
      };
      postprocess?: {
        active?: boolean;
        toneMapping?: boolean;
        colorGrade?: boolean;
        fxaa?: boolean;
        passNames?: readonly string[];
        passCount?: number;
        targetFormat?: string;
        outputColorSpace?: string;
        plan?: { passNames?: readonly string[]; executionMode?: string; outputColorSpace?: string };
      };
      dataUrl?: string;
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.schema).toBe("g3d-data-galaxy-reference/v1");
    expect(result.route).toBe("data-galaxy");
    expect(result.harness).toMatchObject({
      galleryShellUi: false,
      fixedCamera: true,
      fixedDensity: true,
      fixedBackground: true
    });
    expect(result.harness?.importedRouteModules).toContain("apps/advanced-examples-gallery/src/dataGalaxyScene.ts");
    expect(result.harness?.claimBoundary).toContain("does not prove native GPU-compute particle simulation");

    expect(result.render?.rendererBackend).toBe("webgl2");
    expect(result.render?.cpuGpuMode).toBe("cpu-static-point-buffers-webgl2-render");
    expect(result.render?.width).toBe(960);
    expect(result.render?.height).toBe(720);
    expect(result.render?.devicePixelRatio).toBe(1);
    expect(result.render?.effectiveBackingDprX).toBe(1);
    expect(result.render?.effectiveBackingDprY).toBe(1);
    expect(result.render?.diagnostics?.drawCalls).toBeGreaterThan(0);
    expect(result.render?.diagnostics?.visibleObjects).toBeGreaterThan(0);
    expect(result.render?.diagnostics?.lastError).toBeNull();
    expect(result.render?.diagnostics?.contextLost).toBe(false);
    expect(result.render?.pixelStats?.nonBlackPixels).toBeGreaterThan(10_000);
    expect(result.render?.pixelStats?.nonTransparentPixels).toBe(960 * 720);
    expect(result.render?.pixelStats?.uniqueColorBuckets).toBeGreaterThan(8);
    expect(result.render?.pixelStats?.maxLuma).toBeGreaterThan(20);

    expect(result.dataGalaxy).toMatchObject({
      requestedParticles: 12_000,
      effectiveParticles: 12_000,
      mode: "showcase",
      densityTier: "12k showcase",
      nativeGpuComputeDispatches: 0
    });
    expect(result.dataGalaxy?.primaryCount).toBe(6480);
    expect(result.dataGalaxy?.vortexCount).toBe(2760);
    expect(result.dataGalaxy?.networkCount).toBe(1800);
    expect(result.dataGalaxy?.waveCount).toBe(960);
    expect(result.dataGalaxy?.totalParticleEvidenceCount).toBeGreaterThanOrEqual(12_000);
    expect(result.dataGalaxy?.overlayPointCount).toBeGreaterThan(0);
    expect(result.dataGalaxy?.overlayPointDrawBatches).toBeGreaterThan(0);
    expect(result.dataGalaxy?.lineSegmentCount).toBeGreaterThan(0);
    expect(result.dataGalaxy?.lineDrawBatches).toBeGreaterThan(0);
    expect(result.dataGalaxy?.trailSegmentCount).toBeGreaterThan(0);
    expect(result.dataGalaxy?.connectionSegmentCount).toBeGreaterThan(0);
    expect(result.dataGalaxy?.telemetryRingSegmentCount).toBeGreaterThan(0);
    expect(result.dataGalaxy?.attractorCount).toBeGreaterThan(0);
    expect(result.dataGalaxy?.coreSystemLabels?.length).toBeGreaterThan(0);
    expect(result.dataGalaxy?.systems).toEqual(expect.arrayContaining([
      "separated CPU point-cloud layers",
      "batched inference spark buffers",
      "connection graph"
    ]));
    expect(result.dataGalaxy?.approximations?.join("\n")).toContain("does not submit one render object per spark");

    expect(result.postprocess).toMatchObject({
      active: true,
      toneMapping: true,
      colorGrade: true,
      fxaa: true,
      outputColorSpace: "srgb"
    });
    expect(result.postprocess?.passNames).toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(result.postprocess?.passCount).toBe(3);
    expect(result.postprocess?.targetFormat).toBe("rgba16f");
    expect(result.postprocess?.plan?.passNames).toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(result.dataUrl?.startsWith("data:image/png;base64,")).toBe(true);
  });
});

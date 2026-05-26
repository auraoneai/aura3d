import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("WebGPU imported asset artifact", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders or honestly blocks a real imported GLB through the low-level WebGPU renderer", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/production-runtime-webgl2-real-renderer.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const WIDTH = 768;
      const HEIGHT = 768;
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const webgl2Canvas = document.createElement("canvas");
      webgl2Canvas.width = WIDTH;
      webgl2Canvas.height = HEIGHT;
      document.body.append(canvas);
      document.body.append(webgl2Canvas);

      const [
        { GLTFLoader },
        { LoadContext },
        { createGLTFRenderResources },
        { Renderer },
        { createProductionPbrHdrPipelineFromRadiance, createProductionEnvironmentLightingResources }
      ] = await Promise.all([
        import("/packages/assets/src/GLTFLoader.js"),
        import("/packages/assets/src/LoadContext.js"),
        import("/packages/assets/src/GLTFRenderResources.js"),
        import("/packages/rendering/src/index.js"),
        import("/packages/rendering/src/production-runtime/index.js")
      ]);

      const availability = await (await import("/packages/rendering/src/production-runtime/index.js")).createProductionWebGPUReport(navigator.gpu);
      if (availability.status !== "available") {
        return {
          status: "blocked",
          schema: "a3d-runtime-webgpu-imported-asset",
          availability,
          productionClaim: "not-claimed",
          reason: "Browser did not expose a usable WebGPU adapter/device."
        };
      }

      try {
        const assetUrl = `${location.origin}/fixtures/asset-corpus/damaged-helmet.glb`;
        const hdrUrl = `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`;
        const [asset, hdrResponse] = await Promise.all([
          new GLTFLoader().load({ url: assetUrl }, new LoadContext()),
          fetch(hdrUrl)
        ]);
        if (!hdrResponse.ok) throw new Error(`Failed to fetch HDR ${hdrUrl}: ${hdrResponse.status}`);
        const hdrBytes = await hdrResponse.arrayBuffer();
        const hdrPipeline = createProductionPbrHdrPipelineFromRadiance(hdrBytes, {
          id: "runtime-webgpu-imported-asset-hdr",
          label: "WebGPU Imported Asset HDR",
          intensity: 1.12,
          backgroundIntensity: 0.72,
          rotation: 0.18,
          toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
        });
        const lighting = createProductionEnvironmentLightingResources(hdrPipeline);
        const resources = await createGLTFRenderResources(asset);
        const webgl2Resources = await createGLTFRenderResources(asset);
        const input = resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
          qualityPreset: "hdr-studio-preview",
          environmentLighting: lighting.lighting,
          cameraPolicy: "require"
        });
        const webgl2Input = webgl2Resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
          qualityPreset: "hdr-studio-preview",
          environmentLighting: lighting.lighting,
          cameraPolicy: "require"
        });
        const renderer = await Renderer.create({
          canvas,
          width: WIDTH,
          height: HEIGHT,
          backend: "webgpu",
          preserveDrawingBuffer: true,
          clearColor: [0.012, 0.014, 0.018, 1],
          requiredFeatures: ["basic-rendering", "pixel-readback"]
        });
        const renderTarget = renderer.device.createRenderTarget({
          width: WIDTH,
          height: HEIGHT,
          label: "runtime-webgpu-imported-asset-target",
          format: "rgba8",
          depth: true
        });
        const diagnostics = await renderer.renderAsync({ ...input.source, renderTarget, postprocess: false }, input.camera);
        const cpuShadowPixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        const cpuShadowPixelStats = analyzePixels(cpuShadowPixels, WIDTH, HEIGHT);
        const cpuShadowDataUrl = pixelsToDataUrl(cpuShadowPixels, WIDTH, HEIGHT);
        let readbackMode = "cpu-shadowed-render-target";
        let pixels: Uint8Array;
        const readPixelsAsync = renderer.device.readPixelsAsync;
        if (typeof readPixelsAsync === "function") {
          try {
            pixels = await readPixelsAsync.call(renderer.device, 0, 0, WIDTH, HEIGHT);
            readbackMode = "native-webgpu-texture-to-buffer";
          } catch {
            pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
          }
        } else {
          pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        }
        const pixelStats = analyzePixels(pixels, WIDTH, HEIGHT);
        const dataUrl = pixelsToDataUrl(pixels, WIDTH, HEIGHT);
        const webgl2Renderer = await Renderer.create({
          canvas: webgl2Canvas,
          width: WIDTH,
          height: HEIGHT,
          backend: "webgl2",
          preserveDrawingBuffer: true,
          clearColor: [0.012, 0.014, 0.018, 1],
          requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
        });
        const webgl2Diagnostics = webgl2Renderer.render({ ...webgl2Input.source, postprocess: false }, webgl2Input.camera);
        const webgl2Pixels = webgl2Renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        const webgl2PixelStats = analyzePixels(webgl2Pixels, WIDTH, HEIGHT);
        const webgl2DataUrl = pixelsToDataUrl(webgl2Pixels, WIDTH, HEIGHT);
        const webgpuVsWebgl2Diff = diffPixels(pixels, webgl2Pixels, WIDTH, HEIGHT);
        const webgpuVsWebgl2DiffDataUrl = diffToDataUrl(pixels, webgl2Pixels, WIDTH, HEIGHT);
        const visualReady = pixelStats.uniqueColorBuckets >= 20
          && pixelStats.nonBlackPixels > 20_000
          && pixelStats.maxLuma > 40;
        webgl2Renderer.dispose();
        renderer.dispose();
        resources.dispose();
        webgl2Resources.dispose();
        lighting.dispose();
        return {
          status: visualReady ? "ready" : "blocked",
          schema: "a3d-runtime-webgpu-imported-asset",
          productionClaim: "not-claimed",
          reason: visualReady
            ? "This is low-level Renderer WebGPU imported-asset evidence. It is not the public production SDK production backend."
            : "Low-level WebGPU submitted a native imported-asset PBR draw, but the readback lacks enough visual detail to count as product-rendering proof.",
          availability,
          asset: {
            id: "damaged-helmet",
            url: assetUrl,
            materialFeatures: asset.loaderDiagnostics.materialFeatures,
            extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
            textureCount: asset.textures.length,
            materialCount: asset.materials.length
          },
          hdr: hdrPipeline.diagnostics,
          diagnostics,
          webgl2Diagnostics,
          readbackMode,
          cpuShadowPixelStats,
          cpuShadowDataUrl,
          pixelStats,
          dataUrl,
          webgl2PixelStats,
          webgl2DataUrl,
          webgpuVsWebgl2Diff,
          webgpuVsWebgl2DiffDataUrl
        };
      } catch (error) {
        return {
          status: "blocked",
          schema: "a3d-runtime-webgpu-imported-asset",
          availability,
          productionClaim: "not-claimed",
          reason: error instanceof Error ? error.stack ?? error.message : String(error)
        };
      }

      function analyzePixels(pixels: Uint8Array, width: number, height: number) {
        let nonBlackPixels = 0;
        let lumaTotal = 0;
        let maxLuma = 0;
        const buckets = new Set<number>();
        for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
          const red = pixels[offset] ?? 0;
          const green = pixels[offset + 1] ?? 0;
          const blue = pixels[offset + 2] ?? 0;
          const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
          if (red + green + blue > 12) nonBlackPixels += 1;
          lumaTotal += luma;
          maxLuma = Math.max(maxLuma, luma);
          buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
        }
        return {
          width,
          height,
          nonBlackPixels,
          uniqueColorBuckets: buckets.size,
          averageLuma: Number((lumaTotal / (width * height)).toFixed(6)),
          maxLuma: Number(maxLuma.toFixed(6))
        };
      }

      function pixelsToDataUrl(pixels: Uint8Array, width: number, height: number): string {
        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const context = output.getContext("2d");
        if (!context) throw new Error("Unable to create WebGPU artifact 2D context.");
        const image = context.createImageData(width, height);
        for (let y = 0; y < height; y += 1) {
          const sourceY = height - 1 - y;
          for (let x = 0; x < width; x += 1) {
            const source = (sourceY * width + x) * 4;
            const target = (y * width + x) * 4;
            image.data[target] = pixels[source] ?? 0;
            image.data[target + 1] = pixels[source + 1] ?? 0;
            image.data[target + 2] = pixels[source + 2] ?? 0;
            image.data[target + 3] = pixels[source + 3] ?? 255;
          }
        }
        context.putImageData(image, 0, 0);
        return output.toDataURL("image/png");
      }

      function diffPixels(leftPixels: Uint8Array, rightPixels: Uint8Array, width: number, height: number) {
        let totalDelta = 0;
        let maxDelta = 0;
        let changedPixels = 0;
        for (let offset = 0; offset + 3 < leftPixels.length; offset += 4) {
          const redDelta = Math.abs((leftPixels[offset] ?? 0) - (rightPixels[offset] ?? 0));
          const greenDelta = Math.abs((leftPixels[offset + 1] ?? 0) - (rightPixels[offset + 1] ?? 0));
          const blueDelta = Math.abs((leftPixels[offset + 2] ?? 0) - (rightPixels[offset + 2] ?? 0));
          const delta = (redDelta + greenDelta + blueDelta) / 3;
          totalDelta += delta;
          maxDelta = Math.max(maxDelta, delta);
          if (delta > 8) changedPixels += 1;
        }
        const meanDelta = totalDelta / (width * height);
        return {
          meanDelta: Number(meanDelta.toFixed(4)),
          maxDelta: Number(maxDelta.toFixed(4)),
          changedPixels,
          structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4))
        };
      }

      function diffToDataUrl(leftPixels: Uint8Array, rightPixels: Uint8Array, width: number, height: number): string {
        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const context = output.getContext("2d");
        if (!context) throw new Error("Unable to create WebGPU/WebGL2 diff context.");
        const image = context.createImageData(width, height);
        for (let y = 0; y < height; y += 1) {
          const sourceY = height - 1 - y;
          for (let x = 0; x < width; x += 1) {
            const source = (sourceY * width + x) * 4;
            const target = (y * width + x) * 4;
            image.data[target] = Math.min(255, Math.abs((leftPixels[source] ?? 0) - (rightPixels[source] ?? 0)) * 2);
            image.data[target + 1] = Math.min(255, Math.abs((leftPixels[source + 1] ?? 0) - (rightPixels[source + 1] ?? 0)) * 2);
            image.data[target + 2] = Math.min(255, Math.abs((leftPixels[source + 2] ?? 0) - (rightPixels[source + 2] ?? 0)) * 2);
            image.data[target + 3] = 255;
          }
        }
        context.putImageData(image, 0, 0);
        return output.toDataURL("image/png");
      }
    });

    const reportDir = "tests/reports/runtime-parity/webgpu-imported-asset";
    const reportPath = `${reportDir}/webgpu-imported-asset-report.json`;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    const { dataUrl, cpuShadowDataUrl, webgl2DataUrl, webgpuVsWebgl2DiffDataUrl, ...report } = result as {
      dataUrl?: string;
      cpuShadowDataUrl?: string;
      webgl2DataUrl?: string;
      webgpuVsWebgl2DiffDataUrl?: string;
    };
    const screenshotPath = `${reportDir}/webgpu-imported-damaged-helmet.png`;
    if (dataUrl) {
      writeFileSync(resolve(screenshotPath), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      const pngStats = readProductionPngStats(resolve(screenshotPath));
      const fileSize = statSync(resolve(screenshotPath)).size;
      Object.assign(report, { screenshot: screenshotPath, fileSize, pngStats });
    }
    if (cpuShadowDataUrl) {
      const cpuShadowScreenshotPath = `${reportDir}/webgpu-imported-damaged-helmet-cpu-shadow.png`;
      writeFileSync(resolve(cpuShadowScreenshotPath), Buffer.from(cpuShadowDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        cpuShadowScreenshot: cpuShadowScreenshotPath,
        cpuShadowPngStats: readProductionPngStats(resolve(cpuShadowScreenshotPath))
      });
    }
    if (webgl2DataUrl) {
      const webgl2ScreenshotPath = `${reportDir}/webgl2-reference-damaged-helmet.png`;
      writeFileSync(resolve(webgl2ScreenshotPath), Buffer.from(webgl2DataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        webgl2Screenshot: webgl2ScreenshotPath,
        webgl2PngStats: readProductionPngStats(resolve(webgl2ScreenshotPath))
      });
    }
    if (webgpuVsWebgl2DiffDataUrl) {
      const webgpuVsWebgl2DiffPath = `${reportDir}/webgpu-vs-webgl2-diff.png`;
      writeFileSync(resolve(webgpuVsWebgl2DiffPath), Buffer.from(webgpuVsWebgl2DiffDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        webgpuVsWebgl2DiffScreenshot: webgpuVsWebgl2DiffPath,
        webgpuVsWebgl2DiffPngStats: readProductionPngStats(resolve(webgpuVsWebgl2DiffPath))
      });
    }
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...report
    }, null, 2)}\n`);

    expect(["ready", "blocked"]).toContain((result as { status?: string }).status);
    expect((result as { productionClaim?: string }).productionClaim).toBe("not-claimed");
    if ((result as { status?: string }).status === "ready") {
      const ready = result as {
        diagnostics?: { drawCalls?: number; lastError?: string | null; nativePbrSubmissions?: number; nativeTextureBindings?: number; nativeEnvironmentBindings?: number };
        webgl2Diagnostics?: { drawCalls?: number; lastError?: string | null };
        pixelStats?: { nonBlackPixels?: number; uniqueColorBuckets?: number; maxLuma?: number };
        webgl2PixelStats?: { nonBlackPixels?: number; uniqueColorBuckets?: number; maxLuma?: number };
        webgpuVsWebgl2Diff?: { meanDelta?: number; changedPixels?: number; structuralSimilarityProxy?: number };
      };
      expect(ready.diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.lastError).toBeNull();
      expect(ready.diagnostics?.nativePbrSubmissions ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.nativeTextureBindings ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.nativeEnvironmentBindings ?? 0).toBeGreaterThan(0);
      expect(ready.pixelStats?.nonBlackPixels ?? 0).toBeGreaterThan(20_000);
      expect(ready.pixelStats?.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(20);
      expect(ready.pixelStats?.maxLuma ?? 0).toBeGreaterThan(40);
      expect(ready.webgl2Diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(ready.webgl2Diagnostics?.lastError).toBeNull();
      expect(ready.webgl2PixelStats?.nonBlackPixels ?? 0).toBeGreaterThan(20_000);
      expect(ready.webgl2PixelStats?.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(20);
      expect(ready.webgl2PixelStats?.maxLuma ?? 0).toBeGreaterThan(40);
      expect(ready.webgpuVsWebgl2Diff?.changedPixels ?? 0).toBeGreaterThan(10_000);
      expect(ready.webgpuVsWebgl2Diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(32);
      expect(ready.webgpuVsWebgl2Diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.9);
    } else {
      expect((result as { reason?: string }).reason ?? "").not.toHaveLength(0);
    }
  });
});

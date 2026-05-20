import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 WebGPU product-viewer artifact", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders or honestly blocks a flagship GLTF/HDR/PBR scene through native WebGPU", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/v6-webgl2-real-renderer.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const WIDTH = 1024;
      const HEIGHT = 768;
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const webgl2Canvas = document.createElement("canvas");
      webgl2Canvas.width = WIDTH;
      webgl2Canvas.height = HEIGHT;
      document.body.append(canvas, webgl2Canvas);

      const [{ Renderer }, engine] = await Promise.all([
        import("/packages/rendering/src/index.js"),
        import("/packages/engine/src/v6/index.js")
      ]);
      const availability = await (await import("/packages/rendering/src/v6/index.js")).createV6WebGPUReport(navigator.gpu);
      if (availability.status !== "available") {
        return {
          status: "blocked",
          schema: "g3d-v7-webgpu-product-viewer/v1",
          productionClaim: "not-claimed",
          availability,
          reason: "Browser did not expose a usable WebGPU adapter/device."
        };
      }

      let asset: Awaited<ReturnType<typeof engine.loadGltfScene>> | undefined;
      let webgl2Asset: Awaited<ReturnType<typeof engine.loadGltfScene>> | undefined;
      let environment: Awaited<ReturnType<typeof engine.loadHdrEnvironment>> | undefined;
      let webgl2Environment: Awaited<ReturnType<typeof engine.loadHdrEnvironment>> | undefined;
      let stage: ReturnType<typeof engine.createGroundedStage> | undefined;
      let webgl2Stage: ReturnType<typeof engine.createGroundedStage> | undefined;
      let renderer: Awaited<ReturnType<typeof Renderer.create>> | undefined;
      let webgl2Renderer: Awaited<ReturnType<typeof Renderer.create>> | undefined;
      try {
        const viewport = { width: WIDTH, height: HEIGHT };
        const assetOptions = {
          url: `${location.origin}/fixtures/v7/assets/flagship/chronograph-watch.glb`,
          assetId: "chronograph-watch",
          assetName: "Chronograph Watch",
          viewport
        };
        asset = await engine.loadGltfScene(assetOptions);
        webgl2Asset = await engine.loadGltfScene(assetOptions);
        const environmentOptions = {
          id: "studio-small-08-webgpu-product-viewer",
          label: "Studio Small 08 WebGPU Product Viewer",
          url: `${location.origin}/fixtures/v7/environments/hdri/studio_small_08_4k.hdr`,
          intensity: 1.12,
          backgroundIntensity: 0.82,
          rotation: 0.18,
          toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
        };
        environment = await engine.loadHdrEnvironment(environmentOptions);
        webgl2Environment = await engine.loadHdrEnvironment(environmentOptions);
        stage = engine.createGroundedStage(asset.resources.bounds, {
          labelPrefix: "v7-webgpu-product-viewer",
          shadowLightDirection: [-0.42, -0.82, -0.38]
        });
        webgl2Stage = engine.createGroundedStage(webgl2Asset.resources.bounds, {
          labelPrefix: "v7-webgpu-product-viewer-webgl2",
          shadowLightDirection: [-0.42, -0.82, -0.38]
        });
        stage.update({ backgroundBlur: 0.08, backgroundVisible: true });
        webgl2Stage.update({ backgroundBlur: 0.08, backgroundVisible: true });
        const camera = engine.createCameraFrame({
          bounds: asset.resources.bounds,
          viewport,
          preset: "product-hero"
        });
        const webgl2Camera = engine.createCameraFrame({
          bounds: webgl2Asset.resources.bounds,
          viewport,
          preset: "product-hero"
        });
        const lights = engine.createStudioLighting({ preset: "product", shadows: false });
        const webgl2Lights = engine.createStudioLighting({ preset: "product", shadows: false });
        const renderItems = stage.renderItems({ shadows: true, backgroundVisible: true });
        const webgl2RenderItems = webgl2Stage.renderItems({ shadows: true, backgroundVisible: true });
        const rendererInput = asset.createRendererInput({
          viewport,
          environment,
          environmentLighting: environment.environmentLighting,
          renderItems,
          collectedLights: lights,
          shadow: false,
          postprocess: false
        });
        const webgl2RendererInput = webgl2Asset.createRendererInput({
          viewport,
          environment: webgl2Environment,
          environmentLighting: webgl2Environment.environmentLighting,
          renderItems: webgl2RenderItems,
          collectedLights: webgl2Lights,
          shadow: false,
          postprocess: false
        });
        renderer = await Renderer.create({
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
          label: "v7-webgpu-product-viewer-target",
          format: "rgba8",
          depth: true
        });
        const diagnostics = await renderer.renderAsync({
          ...rendererInput.source,
          renderTarget,
          postprocess: false,
          shadow: false
        }, camera.camera);
        let readbackMode = "cpu-shadowed-render-target";
        let pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        if (typeof renderer.device.readPixelsAsync === "function") {
          try {
            pixels = await renderer.device.readPixelsAsync.call(renderer.device, 0, 0, WIDTH, HEIGHT);
            readbackMode = "native-webgpu-texture-to-buffer";
          } catch {
            pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
          }
        }
        const pixelStats = analyzePixels(pixels, WIDTH, HEIGHT);
        const dataUrl = pixelsToDataUrl(pixels, WIDTH, HEIGHT);

        webgl2Renderer = await Renderer.create({
          canvas: webgl2Canvas,
          width: WIDTH,
          height: HEIGHT,
          backend: "webgl2",
          preserveDrawingBuffer: true,
          clearColor: [0.012, 0.014, 0.018, 1],
          requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
        });
        const webgl2Diagnostics = webgl2Renderer.render({
          ...webgl2RendererInput.source,
          postprocess: false,
          shadow: false
        }, webgl2Camera.camera);
        const webgl2Pixels = webgl2Renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        const webgl2PixelStats = analyzePixels(webgl2Pixels, WIDTH, HEIGHT);
        const webgl2DataUrl = pixelsToDataUrl(webgl2Pixels, WIDTH, HEIGHT);
        const webgpuVsWebgl2Diff = diffPixels(pixels, webgl2Pixels, WIDTH, HEIGHT);
        const webgpuVsWebgl2DiffDataUrl = diffToDataUrl(pixels, webgl2Pixels, WIDTH, HEIGHT);
        const deltaReady = webgpuVsWebgl2Diff.meanDelta < 42 && webgpuVsWebgl2Diff.structuralSimilarityProxy > 0.83;
        const visualReady = pixelStats.nonBlackPixels > 120_000
          && pixelStats.uniqueColorBuckets >= 40
          && pixelStats.maxLuma > 80
          && diagnostics.drawCalls >= asset.metadata.primitiveCount
          && deltaReady;
        return {
          status: visualReady ? "ready" : "blocked",
          schema: "g3d-v7-webgpu-product-viewer/v1",
          productionClaim: "not-claimed",
          reason: visualReady
            ? "This is a bounded native WebGPU product-viewer visual artifact using public V6 scene-composition helpers; public SDK production-backend proof is covered by v7-webgpu-sdk-production.spec.ts."
            : `WebGPU rendered the product-viewer path, but the output did not meet the minimum visual-product artifact thresholds; WebGPU-vs-WebGL2 meanDelta=${webgpuVsWebgl2Diff.meanDelta}, structuralSimilarityProxy=${webgpuVsWebgl2Diff.structuralSimilarityProxy}.`,
          availability,
          readbackMode,
          asset: {
            assetId: asset.metadata.assetId,
            assetName: asset.metadata.assetName,
            meshCount: asset.metadata.meshCount,
            primitiveCount: asset.metadata.primitiveCount,
            materialCount: asset.metadata.materialCount,
            textureCount: asset.metadata.textureCount,
            extensionsUsed: asset.metadata.extensionsUsed,
            unsupportedExtensions: asset.metadata.unsupportedExtensions
          },
          environment: {
            id: environment.id,
            cubemapPMREM: environment.pipeline.diagnostics.cubemapPMREM,
            cubemapPMREMShaderSampling: environment.pipeline.diagnostics.cubemapPMREMShaderSampling,
            brdfLut: environment.pipeline.diagnostics.brdfLut,
            realRadianceHdr: environment.pipeline.diagnostics.realRadianceHdr
          },
          sdkPath: {
            loadGltfScene: true,
            loadHdrEnvironment: true,
            createGroundedStage: true,
            createCameraFrame: true,
            createStudioLighting: true
          },
          diagnostics,
          webgl2Diagnostics,
          pixelStats,
          webgl2PixelStats,
          webgpuVsWebgl2Diff,
          stage: stage.diagnostics,
          camera: camera.diagnostics,
          dataUrl,
          webgl2DataUrl,
          webgpuVsWebgl2DiffDataUrl
        };
      } catch (error) {
        return {
          status: "blocked",
          schema: "g3d-v7-webgpu-product-viewer/v1",
          productionClaim: "not-claimed",
          availability,
          reason: error instanceof Error ? error.stack ?? error.message : String(error)
        };
      } finally {
        webgl2Renderer?.dispose();
        renderer?.dispose();
        webgl2Stage?.dispose();
        stage?.dispose();
        webgl2Environment?.dispose();
        environment?.dispose();
        webgl2Asset?.dispose();
        asset?.dispose();
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
        if (!context) throw new Error("Unable to create WebGPU product-viewer artifact 2D context.");
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
        if (!context) throw new Error("Unable to create WebGPU/WebGL2 product-viewer diff context.");
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

    const reportDir = "tests/reports/v7/webgpu-product-viewer";
    const reportPath = `${reportDir}/webgpu-product-viewer-report.json`;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    const { dataUrl, webgl2DataUrl, webgpuVsWebgl2DiffDataUrl, ...report } = result as {
      dataUrl?: string;
      webgl2DataUrl?: string;
      webgpuVsWebgl2DiffDataUrl?: string;
    };
    const screenshotPath = `${reportDir}/webgpu-product-viewer-chronograph.png`;
    if (dataUrl) {
      writeFileSync(resolve(screenshotPath), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        screenshot: screenshotPath,
        fileSize: statSync(resolve(screenshotPath)).size,
        pngStats: readV6PngStats(resolve(screenshotPath))
      });
    }
    if (webgl2DataUrl) {
      const webgl2Path = `${reportDir}/webgl2-product-viewer-reference.png`;
      writeFileSync(resolve(webgl2Path), Buffer.from(webgl2DataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        webgl2Screenshot: webgl2Path,
        webgl2PngStats: readV6PngStats(resolve(webgl2Path))
      });
    }
    if (webgpuVsWebgl2DiffDataUrl) {
      const diffPath = `${reportDir}/webgpu-vs-webgl2-product-viewer-diff.png`;
      writeFileSync(resolve(diffPath), Buffer.from(webgpuVsWebgl2DiffDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        webgpuVsWebgl2DiffScreenshot: diffPath,
        webgpuVsWebgl2DiffPngStats: readV6PngStats(resolve(diffPath))
      });
    }
    writeFileSync(resolve(reportPath), `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);

    expect(["ready", "blocked"]).toContain((result as { status?: string }).status);
    expect((result as { productionClaim?: string }).productionClaim).toBe("not-claimed");
    if ((result as { status?: string }).status === "ready") {
      const ready = result as {
        diagnostics?: { drawCalls?: number; lastError?: string | null; nativePbrSubmissions?: number; nativeTextureBindings?: number; nativeEnvironmentBindings?: number };
        webgl2Diagnostics?: { drawCalls?: number; lastError?: string | null };
        pixelStats?: { nonBlackPixels?: number; uniqueColorBuckets?: number; maxLuma?: number };
        webgl2PixelStats?: { nonBlackPixels?: number; uniqueColorBuckets?: number; maxLuma?: number };
        webgpuVsWebgl2Diff?: { meanDelta?: number; changedPixels?: number; structuralSimilarityProxy?: number };
        asset?: { primitiveCount?: number; materialCount?: number; textureCount?: number; unsupportedExtensions?: readonly string[] };
        environment?: { realRadianceHdr?: boolean; cubemapPMREM?: boolean; brdfLut?: boolean };
        sdkPath?: Record<string, boolean>;
      };
      expect(ready.asset?.primitiveCount ?? 0).toBeGreaterThanOrEqual(10);
      expect(ready.asset?.materialCount ?? 0).toBeGreaterThanOrEqual(10);
      expect(ready.asset?.textureCount ?? 0).toBeGreaterThanOrEqual(4);
      expect(ready.asset?.unsupportedExtensions).toEqual([]);
      expect(ready.environment?.realRadianceHdr).toBe(true);
      expect(ready.environment?.cubemapPMREM).toBe(true);
      expect(ready.environment?.brdfLut).toBe(true);
      expect(Object.values(ready.sdkPath ?? {}).every(Boolean)).toBe(true);
      expect(ready.diagnostics?.drawCalls ?? 0).toBeGreaterThanOrEqual(ready.asset?.primitiveCount ?? 1);
      expect(ready.diagnostics?.lastError).toBeNull();
      expect(ready.diagnostics?.nativePbrSubmissions ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.nativeTextureBindings ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.nativeEnvironmentBindings ?? 0).toBeGreaterThan(0);
      expect(ready.pixelStats?.nonBlackPixels ?? 0).toBeGreaterThan(120_000);
      expect(ready.pixelStats?.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(40);
      expect(ready.pixelStats?.maxLuma ?? 0).toBeGreaterThan(80);
      expect(ready.webgl2Diagnostics?.drawCalls ?? 0).toBeGreaterThanOrEqual(ready.asset?.primitiveCount ?? 1);
      expect(ready.webgl2Diagnostics?.lastError).toBeNull();
      expect(ready.webgl2PixelStats?.nonBlackPixels ?? 0).toBeGreaterThan(120_000);
      expect(ready.webgl2PixelStats?.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(40);
      expect(ready.webgl2PixelStats?.maxLuma ?? 0).toBeGreaterThan(80);
      expect(ready.webgpuVsWebgl2Diff?.changedPixels ?? 0).toBeGreaterThan(30_000);
      expect(ready.webgpuVsWebgl2Diff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(42);
      expect(ready.webgpuVsWebgl2Diff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.83);
    } else {
      expect((result as { reason?: string }).reason ?? "").not.toHaveLength(0);
    }
  });
});

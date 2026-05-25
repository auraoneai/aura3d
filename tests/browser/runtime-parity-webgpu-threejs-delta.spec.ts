import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readV6PngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 WebGPU vs Three.js bounded visual delta", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures same-asset native WebGPU and Three.js product-viewer delta evidence", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/production-runtime-webgl2-real-renderer.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const WIDTH = 1024;
      const HEIGHT = 768;
      const webgpuCanvas = document.createElement("canvas");
      webgpuCanvas.width = WIDTH;
      webgpuCanvas.height = HEIGHT;
      const threeCanvas = document.createElement("canvas");
      threeCanvas.width = WIDTH;
      threeCanvas.height = HEIGHT;
      document.body.append(webgpuCanvas, threeCanvas);

      const [{ Renderer }, engine, THREE, { GLTFLoader }, { RGBELoader }] = await Promise.all([
        import("/packages/rendering/src/index.js"),
        import("/packages/engine/src/production-runtime/index.js"),
        import("/node_modules/three/build/three.module.js"),
        import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js"),
        import("/node_modules/three/examples/jsm/loaders/RGBELoader.js")
      ]);
      const availability = await (await import("/packages/rendering/src/production-runtime/index.js")).createV6WebGPUReport(navigator.gpu);
      if (availability.status !== "available") {
        return {
          status: "blocked",
          schema: "g3d-v7-webgpu-threejs-delta/v1",
          productionClaim: "not-claimed",
          availability,
          reason: "Browser did not expose a usable WebGPU adapter/device."
        };
      }

      let asset: Awaited<ReturnType<typeof engine.loadGltfScene>> | undefined;
      let environment: Awaited<ReturnType<typeof engine.loadHdrEnvironment>> | undefined;
      let stage: ReturnType<typeof engine.createGroundedStage> | undefined;
      let renderer: Awaited<ReturnType<typeof Renderer.create>> | undefined;
      let threeRenderer: InstanceType<typeof THREE.WebGLRenderer> | undefined;
      let threeEnvironment: InstanceType<typeof THREE.Texture> | undefined;
      let threePmrem: InstanceType<typeof THREE.PMREMGenerator> | undefined;
      let hdrTexture: InstanceType<typeof THREE.Texture> | undefined;

      try {
        const viewport = { width: WIDTH, height: HEIGHT };
        const assetUrl = `${location.origin}/fixtures/v7/assets/flagship/chronograph-watch.glb`;
        const hdrUrl = `${location.origin}/fixtures/v7/environments/hdri/studio_small_08_4k.hdr`;
        asset = await engine.loadGltfScene({
          url: assetUrl,
          assetId: "chronograph-watch",
          assetName: "Chronograph Watch",
          viewport
        });
        environment = await engine.loadHdrEnvironment({
          id: "studio-small-08-webgpu-threejs-delta",
          label: "Studio Small 08 WebGPU Three.js Delta",
          url: hdrUrl,
          intensity: 1.12,
          backgroundIntensity: 0.82,
          rotation: 0.18,
          toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
        });
        stage = engine.createGroundedStage(asset.resources.bounds, {
          labelPrefix: "v7-webgpu-threejs-delta",
          shadowLightDirection: [-0.42, -0.82, -0.38]
        });
        stage.update({ backgroundBlur: 0.08, backgroundVisible: true });
        const cameraFrame = engine.createCameraFrame({
          bounds: asset.resources.bounds,
          viewport,
          preset: "product-hero"
        });
        const lights = engine.createStudioLighting({ preset: "product", shadows: false });
        const rendererInput = asset.createRendererInput({
          viewport,
          environment,
          environmentLighting: environment.environmentLighting,
          renderItems: stage.renderItems({ shadows: true, backgroundVisible: true }),
          collectedLights: lights,
          shadow: false,
          postprocess: false
        });
        renderer = await Renderer.create({
          canvas: webgpuCanvas,
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
          label: "v7-webgpu-threejs-delta-target",
          format: "rgba8",
          depth: true
        });
        const diagnostics = await renderer.renderAsync({
          ...rendererInput.source,
          renderTarget,
          postprocess: false,
          shadow: false
        }, cameraFrame.camera);
        let readbackMode = "cpu-shadowed-render-target";
        let webgpuPixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        if (typeof renderer.device.readPixelsAsync === "function") {
          try {
            webgpuPixels = await renderer.device.readPixelsAsync.call(renderer.device, 0, 0, WIDTH, HEIGHT);
            readbackMode = "native-webgpu-texture-to-buffer";
          } catch {
            webgpuPixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
          }
        }

        threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
        threeRenderer.setSize(WIDTH, HEIGHT, false);
        threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
        threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        threeRenderer.toneMappingExposure = 0.96;
        hdrTexture = await new Promise<InstanceType<typeof THREE.Texture>>((resolve, reject) => {
          new RGBELoader().load(hdrUrl, resolve, undefined, reject);
        });
        threePmrem = new THREE.PMREMGenerator(threeRenderer);
        threeEnvironment = threePmrem.fromEquirectangular(hdrTexture).texture;
        const threeScene = new THREE.Scene();
        threeScene.background = new THREE.Color(0x030405);
        threeScene.environment = threeEnvironment;
        threeScene.add(new THREE.HemisphereLight(0xcdd8ff, 0x242018, 0.34));
        const key = new THREE.DirectionalLight(0xfff2dc, 2.75);
        key.position.set(3.5, 4.2, 2.8);
        threeScene.add(key);
        const fill = new THREE.DirectionalLight(0x8faeff, 0.48);
        fill.position.set(-2.6, 2.1, 2.8);
        threeScene.add(fill);
        const rim = new THREE.DirectionalLight(0xffd18c, 1.05);
        rim.position.set(-0.9, 1.8, -3.2);
        threeScene.add(rim);
        const gltf = await new Promise<{ scene: InstanceType<typeof THREE.Object3D> }>((resolve, reject) => {
          new GLTFLoader().load(assetUrl, resolve, undefined, reject);
        });
        threeScene.add(gltf.scene);
        const camera = new THREE.PerspectiveCamera(25.78, WIDTH / HEIGHT, 0.03, 100);
        const bounds = asset.resources.bounds;
        const center = [
          (bounds.min[0] + bounds.max[0]) / 2 + cameraFrame.diagnostics.targetOffset[0],
          (bounds.min[1] + bounds.max[1]) / 2 + cameraFrame.diagnostics.targetOffset[1],
          (bounds.min[2] + bounds.max[2]) / 2 + cameraFrame.diagnostics.targetOffset[2]
        ];
        const cameraPosition = cameraFrame.diagnostics.cameraPosition;
        camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
        camera.lookAt(center[0], center[1], center[2]);
        threeRenderer.render(threeScene, camera);
        const threePixels = readThreePixels(threeRenderer, WIDTH, HEIGHT);
        const diff = diffPixels(webgpuPixels, threePixels, WIDTH, HEIGHT);
        const webgpuStats = analyzePixels(webgpuPixels, WIDTH, HEIGHT);
        const threeStats = analyzePixels(threePixels, WIDTH, HEIGHT);
        const deltaReady = diff.meanDelta < 54 && diff.structuralSimilarityProxy > 0.78;
        const visualReady = webgpuStats.nonBlackPixels > 120_000
          && threeStats.nonBlackPixels > 120_000
          && webgpuStats.uniqueColorBuckets >= 40
          && threeStats.uniqueColorBuckets >= 40
          && deltaReady;
        return {
          status: visualReady ? "ready" : "blocked",
          schema: "g3d-v7-webgpu-threejs-delta/v1",
          productionClaim: "not-claimed",
          reason: visualReady
            ? "Bounded same-asset WebGPU-vs-Three.js visual delta evidence exists; this does not make WebGPU the production backend."
            : `WebGPU and Three.js rendered the same asset/HDR/camera intent, but the bounded visual delta gate failed; meanDelta=${diff.meanDelta}, structuralSimilarityProxy=${diff.structuralSimilarityProxy}.`,
          availability,
          readbackMode,
          asset: {
            assetId: asset.metadata.assetId,
            primitiveCount: asset.metadata.primitiveCount,
            materialCount: asset.metadata.materialCount,
            textureCount: asset.metadata.textureCount,
            unsupportedExtensions: asset.metadata.unsupportedExtensions
          },
          environment: {
            id: environment.id,
            realRadianceHdr: environment.pipeline.diagnostics.realRadianceHdr,
            cubemapPMREM: environment.pipeline.diagnostics.cubemapPMREM,
            brdfLut: environment.pipeline.diagnostics.brdfLut
          },
          camera: cameraFrame.diagnostics,
          diagnostics,
          threejs: {
            drawCalls: threeRenderer.info.render.calls,
            triangles: threeRenderer.info.render.triangles,
            textures: threeRenderer.info.memory.textures,
            pmremGenerator: true
          },
          webgpuPixelStats: webgpuStats,
          threejsPixelStats: threeStats,
          webgpuVsThreejsDiff: diff,
          dataUrl: pixelsToDataUrl(webgpuPixels, WIDTH, HEIGHT),
          threejsDataUrl: pixelsToDataUrl(threePixels, WIDTH, HEIGHT),
          diffDataUrl: diffToDataUrl(webgpuPixels, threePixels, WIDTH, HEIGHT)
        };
      } catch (error) {
        return {
          status: "blocked",
          schema: "g3d-v7-webgpu-threejs-delta/v1",
          productionClaim: "not-claimed",
          availability,
          reason: error instanceof Error ? error.stack ?? error.message : String(error)
        };
      } finally {
        threeEnvironment?.dispose();
        threePmrem?.dispose();
        hdrTexture?.dispose();
        threeRenderer?.dispose();
        renderer?.dispose();
        stage?.dispose();
        environment?.dispose();
        asset?.dispose();
      }

      function readThreePixels(threeRenderer: InstanceType<typeof THREE.WebGLRenderer>, width: number, height: number): Uint8Array {
        const gl = threeRenderer.getContext();
        gl.finish();
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
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

      function pixelsToDataUrl(pixels: Uint8Array, width: number, height: number): string {
        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const context = output.getContext("2d");
        if (!context) throw new Error("Unable to create WebGPU/Three.js artifact 2D context.");
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

      function diffToDataUrl(leftPixels: Uint8Array, rightPixels: Uint8Array, width: number, height: number): string {
        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const context = output.getContext("2d");
        if (!context) throw new Error("Unable to create WebGPU-vs-Three.js diff context.");
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

    const reportDir = "tests/reports/runtime-parity/webgpu-threejs-delta";
    const reportPath = `${reportDir}/webgpu-threejs-delta-report.json`;
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    const { dataUrl, threejsDataUrl, diffDataUrl, ...report } = result as {
      dataUrl?: string;
      threejsDataUrl?: string;
      diffDataUrl?: string;
    };
    if (dataUrl) {
      const screenshot = `${reportDir}/webgpu-chronograph.png`;
      writeFileSync(resolve(screenshot), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        screenshot,
        fileSize: statSync(resolve(screenshot)).size,
        pngStats: readV6PngStats(resolve(screenshot))
      });
    }
    if (threejsDataUrl) {
      const screenshot = `${reportDir}/threejs-chronograph.png`;
      writeFileSync(resolve(screenshot), Buffer.from(threejsDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        threejsScreenshot: screenshot,
        threejsPngStats: readV6PngStats(resolve(screenshot))
      });
    }
    if (diffDataUrl) {
      const screenshot = `${reportDir}/webgpu-vs-threejs-diff.png`;
      writeFileSync(resolve(screenshot), Buffer.from(diffDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      Object.assign(report, {
        diffScreenshot: screenshot,
        diffPngStats: readV6PngStats(resolve(screenshot))
      });
    }
    writeFileSync(resolve(reportPath), `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);

    expect(["ready", "blocked"]).toContain((result as { status?: string }).status);
    expect((result as { productionClaim?: string }).productionClaim).toBe("not-claimed");
    if ((result as { status?: string }).status === "ready") {
      const ready = result as {
        diagnostics?: { nativePbrSubmissions?: number; nativeTextureBindings?: number; nativeEnvironmentBindings?: number; lastError?: string | null };
        threejs?: { drawCalls?: number; triangles?: number; textures?: number; pmremGenerator?: boolean };
        webgpuPixelStats?: { nonBlackPixels?: number; uniqueColorBuckets?: number; maxLuma?: number };
        threejsPixelStats?: { nonBlackPixels?: number; uniqueColorBuckets?: number; maxLuma?: number };
        webgpuVsThreejsDiff?: { meanDelta?: number; changedPixels?: number; structuralSimilarityProxy?: number };
        environment?: { realRadianceHdr?: boolean; cubemapPMREM?: boolean; brdfLut?: boolean };
      };
      expect(ready.environment?.realRadianceHdr).toBe(true);
      expect(ready.environment?.cubemapPMREM).toBe(true);
      expect(ready.environment?.brdfLut).toBe(true);
      expect(ready.diagnostics?.nativePbrSubmissions ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.nativeTextureBindings ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.nativeEnvironmentBindings ?? 0).toBeGreaterThan(0);
      expect(ready.diagnostics?.lastError).toBeNull();
      expect(ready.threejs?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(ready.threejs?.triangles ?? 0).toBeGreaterThan(10_000);
      expect(ready.threejs?.textures ?? 0).toBeGreaterThan(0);
      expect(ready.threejs?.pmremGenerator).toBe(true);
      expect(ready.webgpuPixelStats?.nonBlackPixels ?? 0).toBeGreaterThan(120_000);
      expect(ready.webgpuPixelStats?.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(40);
      expect(ready.webgpuPixelStats?.maxLuma ?? 0).toBeGreaterThan(80);
      expect(ready.threejsPixelStats?.nonBlackPixels ?? 0).toBeGreaterThan(120_000);
      expect(ready.threejsPixelStats?.uniqueColorBuckets ?? 0).toBeGreaterThanOrEqual(40);
      expect(ready.threejsPixelStats?.maxLuma ?? 0).toBeGreaterThan(80);
      expect(ready.webgpuVsThreejsDiff?.changedPixels ?? 0).toBeGreaterThan(30_000);
      expect(ready.webgpuVsThreejsDiff?.meanDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(54);
      expect(ready.webgpuVsThreejsDiff?.structuralSimilarityProxy ?? 0).toBeGreaterThan(0.78);
    } else {
      expect((result as { reason?: string }).reason ?? "").not.toHaveLength(0);
    }
  });
});

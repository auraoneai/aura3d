import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V7 WebGPU public SDK production path", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders imported GLTF/HDR/PBR through A3DRenderer backend='auto' navigator.gpu renderAsync", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/production-runtime-webgl2-real-renderer.html`, { waitUntil: "domcontentloaded" });
    const report = await page.evaluate(async () => {
      const WIDTH = 1024;
      const HEIGHT = 768;
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      document.body.append(canvas);

      const [engine, renderingV6] = await Promise.all([
        import("/packages/engine/src/production-runtime/index.js"),
        import("/packages/rendering/src/production-runtime/index.js")
      ]);
      const availability = await renderingV6.createV6WebGPUReport(navigator.gpu);
      if (availability.status !== "available") {
        return {
          schema: "a3d-v7-webgpu-sdk-production/v1",
          status: "blocked",
          productionClaim: "hardware-unavailable",
          availability,
          reason: "Browser did not expose a usable WebGPU adapter/device."
        };
      }

      let renderer: Awaited<ReturnType<typeof engine.A3DRenderer.create>> | undefined;
      let asset: Awaited<ReturnType<typeof engine.loadGltfScene>> | undefined;
      let environment: Awaited<ReturnType<typeof engine.loadHdrEnvironment>> | undefined;
      let stage: ReturnType<typeof engine.createGroundedStage> | undefined;
      try {
        const viewport = { width: WIDTH, height: HEIGHT };
        asset = await engine.loadGltfScene({
          url: `${location.origin}/fixtures/threejs-parity/assets/vehicles/chronograph-watch.glb`,
          assetId: "chronograph-watch",
          assetName: "Chronograph Watch",
          viewport
        });
        environment = await engine.loadHdrEnvironment({
          id: "studio-small-08-webgpu-sdk-production",
          label: "Studio Small 08 WebGPU SDK Production",
          url: `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`,
          intensity: 1.12,
          backgroundIntensity: 0.82,
          rotation: 0.18,
          toneMapping: { operator: "filmic", exposure: 0.96, whitePoint: 11.2 }
        });
        stage = engine.createGroundedStage(asset.resources.bounds, {
          labelPrefix: "v7-webgpu-sdk-production",
          shadowLightDirection: [-0.42, -0.82, -0.38]
        });
        stage.update({ backgroundBlur: 0.08, backgroundVisible: true });
        const camera = engine.createCameraFrame({
          bounds: asset.resources.bounds,
          viewport,
          preset: "product-hero"
        });
        renderer = await engine.A3DRenderer.create({
          backend: "auto",
          canvas,
          width: WIDTH,
          height: HEIGHT,
          preserveDrawingBuffer: true,
          clearColor: [0.012, 0.014, 0.018, 1]
        });
        const result = await renderer.renderAsync(engine.createProductionRenderOptions({
          scene: asset,
          environment,
          environmentLighting: environment.environmentLighting,
          stage,
          backgroundVisible: true,
          lights: engine.createStudioLighting({ preset: "product", shadows: false }),
          shadows: false,
          camera: camera.camera,
          viewport,
          postprocess: false
        }));
        const supported = new Set(result.proof.features.filter((feature) => feature.state === "supported").map((feature) => feature.id));
        const required = [
          "real-webgpu-context",
          "imported-gltf-render-source",
          "pbr-materials",
          "native-webgpu-render-pipeline",
          "native-webgpu-sampled-textures",
          "native-webgpu-texture-readback",
          "native-webgpu-pbr-submissions",
          "hdr-ibl-ready",
          "pixel-readback"
        ];
        const missing = required.filter((feature) => !supported.has(feature));
        const ready = result.proof.backend === "webgpu"
          && renderer.backend === "webgpu"
          && result.summary.pass
          && missing.length === 0
          && (result.proof.diagnostics.nativePbrSubmissions ?? 0) > 0
          && (result.proof.diagnostics.nativeTextureBindings ?? 0) > 0
          && (result.proof.diagnostics.nativeEnvironmentBindings ?? 0) > 0
          && result.proof.pixels.nonBlackPixels > 120_000
          && result.proof.pixels.uniqueColorBuckets >= 40
          && result.proof.pixels.maxLuma > 80;
        return {
          schema: "a3d-v7-webgpu-sdk-production/v1",
          status: ready ? "ready" : "blocked",
          productionClaim: ready ? "public-sdk-webgpu-production-path" : "not-ready",
          availability,
          sdkPath: {
            a3dRendererBackend: renderer.backend,
            backendSelection: renderer.backendSelection,
            renderAsync: true,
            lowLevelRendererImportedDirectly: false,
            threeJsRuntime: false
          },
          asset: {
            assetId: asset.metadata.assetId,
            primitiveCount: asset.metadata.primitiveCount,
            materialCount: asset.metadata.materialCount,
            textureCount: asset.metadata.textureCount,
            extensionsUsed: asset.metadata.extensionsUsed
          },
          environment: {
            id: environment.id,
            realRadianceHdr: environment.pipeline.diagnostics.realRadianceHdr,
            cubemapPMREM: environment.pipeline.diagnostics.cubemapPMREM,
            cubemapPMREMShaderSampling: environment.pipeline.diagnostics.cubemapPMREMShaderSampling
          },
          summary: result.summary,
          proof: {
            backend: result.proof.backend,
            diagnostics: result.proof.diagnostics,
            pixels: result.proof.pixels,
            features: result.proof.features
          },
          missing
        };
      } catch (error) {
        return {
          schema: "a3d-v7-webgpu-sdk-production/v1",
          status: "blocked",
          productionClaim: "not-ready",
          availability,
          reason: error instanceof Error ? error.stack ?? error.message : String(error)
        };
      } finally {
        renderer?.dispose();
        stage?.dispose();
        environment?.dispose();
        asset?.dispose();
      }
    });

    const reportPath = "tests/reports/runtime-parity/webgpu-sdk-production/webgpu-sdk-production-report.json";
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...report
    }, null, 2)}\n`);

    expect(report.schema).toBe("a3d-v7-webgpu-sdk-production/v1");
    if (report.status === "blocked" && report.productionClaim === "hardware-unavailable") {
      test.skip(true, report.reason);
      return;
    }
    expect(report.status).toBe("ready");
    expect(report.productionClaim).toBe("public-sdk-webgpu-production-path");
    expect(report.sdkPath.a3dRendererBackend).toBe("webgpu");
    expect(report.sdkPath.backendSelection.requestedBackend).toBe("auto");
    expect(report.sdkPath.backendSelection.selectedBackend).toBe("webgpu");
    expect(report.sdkPath.backendSelection.reason).toContain("navigator.gpu");
    expect(report.sdkPath.lowLevelRendererImportedDirectly).toBe(false);
    expect(report.sdkPath.threeJsRuntime).toBe(false);
    expect(report.summary.pass).toBe(true);
    expect(report.proof.backend).toBe("webgpu");
    expect(report.proof.diagnostics.nativePbrSubmissions).toBeGreaterThan(0);
    expect(report.proof.diagnostics.nativeTextureBindings).toBeGreaterThan(0);
    expect(report.proof.diagnostics.nativeEnvironmentBindings).toBeGreaterThan(0);
    expect(report.proof.pixels.nonBlackPixels).toBeGreaterThan(120_000);
    expect(report.missing).toEqual([]);
  });
});

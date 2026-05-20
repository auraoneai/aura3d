import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const rootQualityReportPath = join(process.cwd(), "tests/reports/v4-root-rendering-quality.json");
const rootQualityScreenshotDir = join(process.cwd(), "tests/reports/v4-root-rendering-quality");

test.describe("root rendering quality gate", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("preserves dark clear color through renderer-owned postprocess presentation", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { Renderer, analyzeRgbaFrameVisualMetrics } = rendering;
      const width = 96;
      const height = 64;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.012, 0.016, 0.022, 1],
        preserveDrawingBuffer: true
      });
      const diagnostics = renderer.render({
        renderItems: [],
        postprocess: {
          targetFormat: "rgba8",
          toneMapping: { exposure: 1.15, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
          colorGrade: { contrast: 1.12, saturation: 1.08, vibrance: 0.1, vignette: 0.08, sharpening: 0.28 },
          bloom: { threshold: 0.8, intensity: 0.1, radius: 1 },
          fxaa: true
        }
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 24,
        salientLumaThreshold: 42,
        bucketShift: 4,
        edgeLumaThreshold: 16
      });
      const sample = [...pixels.slice(0, 16)];
      renderer.dispose();
      canvas.remove();
      return { diagnostics, stats, sample };
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBe(0);
    expect(result.stats.averageLuma, JSON.stringify(result)).toBeLessThan(28);
    expect(result.stats.maxLuma, JSON.stringify(result)).toBeLessThan(34);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBe(0);
    writeRootQualityEvidence("postprocessClearColorPreservation", result);
  });

  test("presents renderer-owned postprocess even after scene cull state changes", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { Geometry, PBRMaterial, Renderer, analyzeRgbaFrameVisualMetrics } = rendering;
      const width = 160;
      const height = 100;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.006, 0.008, 0.012, 1],
        preserveDrawingBuffer: true
      });
      const visible = new PBRMaterial({
        name: "root-visible-before-cull-state",
        baseColor: [0.88, 0.44, 0.18, 1],
        metallic: 0.08,
        roughness: 0.36,
        renderState: { cullMode: "none" }
      });
      const stateChanger = new PBRMaterial({
        name: "root-front-cull-state-changer",
        baseColor: [0.1, 0.2, 0.9, 1],
        metallic: 0,
        roughness: 0.6,
        renderState: { cullMode: "front" }
      });
      const diagnostics = renderer.render({
        renderItems: [
          {
            geometry: Geometry.litCube(0.72),
            material: visible,
            label: "visible-subject",
            modelMatrix: matrix(0, 0, 0, 2.1, 2.1, 2.1)
          },
          {
            geometry: Geometry.litTriangle(),
            material: stateChanger,
            label: "offscreen-front-cull-state-changer",
            modelMatrix: matrix(3.2, 0, 0, 1, 1, 1)
          }
        ],
        environmentLighting: {
          color: [0.22, 0.22, 0.24],
          intensity: 0.34,
          proceduralMap: {
            skyColor: [0.56, 0.68, 0.92],
            horizonColor: [0.96, 0.72, 0.38],
            groundColor: [0.06, 0.06, 0.07],
            specularColor: [1, 0.9, 0.66],
            intensity: 0.58,
            specularIntensity: 0.8
          }
        },
        postprocess: {
          targetFormat: "rgba8",
          toneMapping: { exposure: 1.2, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
          colorGrade: { contrast: 1.08, saturation: 1.06, sharpening: 0.18 },
          fxaa: true
        }
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 18,
        salientLumaThreshold: 38,
        bucketShift: 4,
        edgeLumaThreshold: 16
      });
      const state = Object.fromEntries(renderer.device.captureState());
      renderer.dispose();
      canvas.remove();
      return { diagnostics, stats, state };

      function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBe(2);
    expect(result.stats.nonDarkRatio, JSON.stringify(result)).toBeGreaterThan(0.08);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBeGreaterThan(0.07);
    expect(result.stats.maxLuma, JSON.stringify(result)).toBeGreaterThan(80);
    writeRootQualityEvidence("postprocessPresentationIgnoresSceneCullState", result);
  });

  test("presents renderer-owned LDR postprocess after mipmap sampler material draws", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { Geometry, Renderer, Sampler, Texture, TexturedPBRMaterial, analyzeRgbaFrameVisualMetrics } = rendering;
      const width = 192;
      const height = 120;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.005, 0.007, 0.012, 1],
        preserveDrawingBuffer: true
      });
      const checkerTexture = new Texture({
        label: "root-postprocess-mipmap-sampler-checker",
        width: 4,
        height: 4,
        colorSpace: "srgb",
        data: new Uint8Array([
          255, 92, 28, 255, 26, 180, 255, 255, 255, 92, 28, 255, 26, 180, 255, 255,
          26, 180, 255, 255, 255, 220, 64, 255, 26, 180, 255, 255, 255, 220, 64, 255,
          255, 92, 28, 255, 26, 180, 255, 255, 255, 92, 28, 255, 26, 180, 255, 255,
          26, 180, 255, 255, 255, 220, 64, 255, 26, 180, 255, 255, 255, 220, 64, 255
        ])
      });
      const mipmapSampler = new Sampler({
        minFilter: "linear-mipmap-linear",
        magFilter: "linear",
        addressU: "repeat",
        addressV: "repeat"
      });
      const textured = new TexturedPBRMaterial({
        name: "zz-root-postprocess-mipmap-sampler-material",
        baseColor: [1, 1, 1, 1],
        metallic: 0.04,
        roughness: 0.38,
        baseColorTexture: checkerTexture,
        baseColorSampler: mipmapSampler,
        renderState: { cullMode: "none" }
      });
      const diagnostics = renderer.render({
        renderItems: [
          {
            geometry: Geometry.texturedCube(0.78),
            material: textured,
            label: "mipmap-sampler-postprocess-subject",
            modelMatrix: matrix(0, 0, 0, 2.2, 1.8, 1.1)
          }
        ],
        environmentLighting: {
          color: [0.28, 0.28, 0.3],
          intensity: 0.48,
          proceduralMap: {
            skyColor: [0.55, 0.68, 0.96],
            horizonColor: [1, 0.76, 0.42],
            groundColor: [0.07, 0.07, 0.08],
            specularColor: [1, 0.9, 0.64],
            intensity: 0.62,
            specularIntensity: 0.74
          }
        },
        postprocess: {
          targetFormat: "rgba8",
          toneMapping: { exposure: 1.22, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
          colorGrade: { contrast: 1.12, saturation: 1.08, vibrance: 0.08, sharpening: 0.18 },
          fxaa: true
        }
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 18,
        salientLumaThreshold: 40,
        bucketShift: 4,
        edgeLumaThreshold: 16
      });
      const centerLuma = regionLuma(pixels, width, 76, 42, 40, 36);
      const deviceState = Object.fromEntries(renderer.device.captureState());
      renderer.dispose();
      checkerTexture.dispose();
      canvas.remove();
      return { diagnostics, stats, centerLuma, deviceState };

      function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }

      function regionLuma(pixels: Uint8Array, targetWidth: number, x: number, y: number, sampleWidth: number, sampleHeight: number): number {
        let total = 0;
        let count = 0;
        for (let sy = y; sy < y + sampleHeight; sy += 1) {
          for (let sx = x; sx < x + sampleWidth; sx += 1) {
            const index = (sy * targetWidth + sx) * 4;
            total += (pixels[index] ?? 0) * 0.2126 + (pixels[index + 1] ?? 0) * 0.7152 + (pixels[index + 2] ?? 0) * 0.0722;
            count += 1;
          }
        }
        return total / Math.max(1, count);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBe(1);
    expect(result.stats.nonDarkRatio, JSON.stringify(result)).toBeGreaterThan(0.12);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBeGreaterThan(0.08);
    expect(result.stats.maxLuma, JSON.stringify(result)).toBeGreaterThan(95);
    expect(result.centerLuma, JSON.stringify(result)).toBeGreaterThan(34);
    writeRootQualityEvidence("postprocessPresentationClearsStaleMipmapSampler", result);
  });

  test("presents renderer-owned HDR postprocess without CPU readback pass chain", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { Geometry, PBRMaterial, Renderer, analyzeRgbaFrameVisualMetrics } = rendering;
      const width = 192;
      const height = 120;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.004, 0.006, 0.011, 1],
        preserveDrawingBuffer: true
      });
      const diagnostics = renderer.render({
        renderItems: [
          {
            geometry: Geometry.uvSphere(0.62, 48, 24),
            material: new PBRMaterial({
              name: "root-hdr-postprocess-red-product-material",
              baseColor: [1, 0.16, 0.06, 1],
              metallic: 0.52,
              roughness: 0.24,
              renderState: { cullMode: "none" }
            }),
            label: "hdr-postprocess-subject",
            modelMatrix: matrix(0, 0, 0, 1.35, 1.35, 1.35)
          }
        ],
        environmentLighting: {
          color: [0.16, 0.18, 0.22],
          intensity: 0.42,
          proceduralMap: {
            skyColor: [0.62, 0.72, 1.0],
            horizonColor: [1.0, 0.68, 0.34],
            groundColor: [0.05, 0.052, 0.06],
            specularColor: [1, 0.86, 0.62],
            intensity: 1.1,
            specularIntensity: 1.4
          }
        },
        postprocess: {
          targetFormat: "rgba16f",
          toneMapping: { exposure: 1.08, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
          colorGrade: { contrast: 1.1, saturation: 1.08, vibrance: 0.12, sharpening: 0.22 },
          fxaa: true
        }
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 18,
        salientLumaThreshold: 38,
        bucketShift: 4,
        edgeLumaThreshold: 16
      });
      renderer.dispose();
      canvas.remove();
      return { diagnostics, stats };

      function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBe(1);
    expect(result.diagnostics.postprocessTargetFormat).toBe("rgba16f");
    expect(result.diagnostics.postprocessPlan).toMatchObject({
      source: "Renderer.postprocessPlan",
      targetFormat: "rgba16f",
      sourceTargetFormat: "rgba16f",
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      readbackPassNames: []
    });
    expect(result.stats.nonDarkRatio, JSON.stringify(result)).toBeGreaterThan(0.1);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBeGreaterThan(0.08);
    expect(result.stats.maxLuma, JSON.stringify(result)).toBeGreaterThan(80);
    writeRootQualityEvidence("postprocessPresentationFusesHdrSource", result);
  });

  test("identity camera policy ignores scene cameras while preserving scene lights", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const { Geometry, Renderer, UnlitMaterial, analyzeRgbaFrameVisualMetrics } = rendering;
      const { Scene } = sceneModule;
      const width = 180;
      const height = 120;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const scene = new Scene();
      const camera = scene.createPerspectiveCamera({ name: "offscreen-scene-camera", fovYRadians: Math.PI / 10, aspect: width / height, near: 0.1, far: 20 });
      camera.transform.setPosition(100, 100, 100);
      scene.root.addChild(camera);
      const light = scene.createLight("point", "identity-policy-scene-light");
      light.intensity = 1;
      light.transform.setPosition(0, 0, 1);
      scene.root.addChild(light);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.006, 0.008, 0.012, 1],
        preserveDrawingBuffer: true
      });
      const diagnostics = renderer.render({
        scene,
        cameraPolicy: "identity",
        renderItems: [
          {
            geometry: Geometry.texturedCube(1),
            material: new UnlitMaterial({ name: "identity-left-visible", color: [0.94, 0.32, 0.12, 1] }),
            label: "identity-left-visible",
            modelMatrix: matrix(-0.42, 0, 0, 0.58, 1.32, 0.08)
          },
          {
            geometry: Geometry.texturedCube(1),
            material: new UnlitMaterial({ name: "identity-right-visible", color: [0.08, 0.82, 1, 1] }),
            label: "identity-right-visible",
            modelMatrix: matrix(0.42, 0, 0, 0.58, 1.32, 0.08)
          }
        ],
        environmentLighting: false
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 18,
        salientLumaThreshold: 38,
        bucketShift: 4,
        edgeLumaThreshold: 18
      });
      renderer.dispose();
      canvas.remove();
      return { diagnostics, stats };

      function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBe(2);
    expect(result.stats.nonDarkRatio, JSON.stringify(result)).toBeGreaterThan(0.3);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBeGreaterThan(0.25);
    expect(result.stats.occupiedAreaRatio, JSON.stringify(result)).toBeGreaterThan(0.4);
    expect(result.stats.occupiedQuadrants, JSON.stringify(result)).toBe(4);
    writeRootQualityEvidence("identityCameraPolicyIgnoresSceneCamera", result);
  });

  test("composes scene renderables with explicit render items in one render source", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const { Geometry, PBRMaterial, Renderer, UnlitMaterial, analyzeRgbaFrameVisualMetrics } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;
      const width = 240;
      const height = 160;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const scene = new Scene();
      const light = scene.createLight("directional", "root-composition-key-light");
      light.intensity = 1.35;
      light.transform.setRotation(...quatFromEuler(-0.55, 0.35, 0));
      scene.root.addChild(light);
      const subject = scene.createNode("scene-backed-red-subject");
      subject.transform.setPosition(0, 0.05, 0);
      subject.transform.setScale(1.4, 1.4, 1.4);
      scene.root.addChild(subject);
      scene.addRenderable(subject, new Renderable({ geometry: "subject", material: "scene-red-pbr" }));

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.006, 0.008, 0.012, 1],
        preserveDrawingBuffer: true
      });
      const diagnostics = renderer.render({
        scene,
        geometryLibrary: new Map([["subject", Geometry.uvSphere(0.62, 48, 24)]]),
        materialLibrary: new Map([["scene-red-pbr", new PBRMaterial({
          name: "scene-red-pbr",
          baseColor: [0.92, 0.14, 0.08, 1],
          metallic: 0.08,
          roughness: 0.34
        })]]),
        renderItems: [
          {
            geometry: Geometry.texturedCube(0.42),
            material: new UnlitMaterial({ name: "explicit-cyan-reference", color: [0.04, 0.84, 1, 1] }),
            label: "explicit-cyan-reference",
            modelMatrix: matrix(-1.2, -0.62, 0.58, 1.5, 0.3, 0.16)
          },
          {
            geometry: Geometry.texturedCube(0.42),
            material: new UnlitMaterial({ name: "explicit-gold-reference", color: [1, 0.64, 0.08, 1] }),
            label: "explicit-gold-reference",
            modelMatrix: matrix(1.2, -0.62, 0.58, 1.5, 0.3, 0.16)
          }
        ],
        environmentLighting: {
          color: [0.18, 0.18, 0.2],
          intensity: 0.32,
          proceduralMap: {
            skyColor: [0.58, 0.68, 0.92],
            horizonColor: [0.96, 0.72, 0.42],
            groundColor: [0.05, 0.05, 0.06],
            specularColor: [1, 0.88, 0.66],
            intensity: 0.5,
            specularIntensity: 0.72
          }
        },
        cameraPolicy: "auto-frame"
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 20,
        salientLumaThreshold: 38,
        bucketShift: 4,
        edgeLumaThreshold: 20
      });
      const colorEvidence = countColorEvidence(pixels);
      renderer.dispose();
      canvas.remove();
      return { diagnostics, stats, colorEvidence };

      function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }

      function countColorEvidence(pixels: Uint8Array): { readonly redPixels: number; readonly cyanPixels: number; readonly goldPixels: number } {
        let redPixels = 0;
        let cyanPixels = 0;
        let goldPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index] ?? 0;
          const g = pixels[index + 1] ?? 0;
          const b = pixels[index + 2] ?? 0;
          if (r > 80 && r > g * 1.45 && r > b * 1.45) redPixels += 1;
          if (b > 110 && g > 90 && r < 80) cyanPixels += 1;
          if (r > 120 && g > 70 && b < 70) goldPixels += 1;
        }
        return { redPixels, cyanPixels, goldPixels };
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls, JSON.stringify(result)).toBe(3);
    expect(result.stats.occupiedQuadrants, JSON.stringify(result)).toBe(4);
    expect(result.stats.colorBuckets, JSON.stringify(result)).toBeGreaterThan(16);
    expect(result.colorEvidence.redPixels, JSON.stringify(result)).toBeGreaterThan(1_600);
    expect(result.colorEvidence.cyanPixels, JSON.stringify(result)).toBeGreaterThan(100);
    expect(result.colorEvidence.goldPixels, JSON.stringify(result)).toBeGreaterThan(150);
    writeRootQualityEvidence("sceneAndExplicitRenderItemComposition", result);
  });

  test("does not double-decode WebGL sRGB PBR texture samples", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const rendering = await import(renderingUrl);
      const { Geometry, PBRMaterial, Renderer, Sampler, Texture, TexturedPBRMaterial } = rendering;
      const width = 192;
      const height = 96;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.006, 0.008, 0.012, 1],
        preserveDrawingBuffer: true
      });
      const scalar = new PBRMaterial({
        name: "root-srgb-scalar-reference",
        baseColor: [0.5, 0.5, 0.5, 1],
        metallic: 0,
        roughness: 0.55,
        renderState: { cullMode: "none" }
      });
      const texture = new Texture({
        label: "root-srgb-gray-base-color",
        width: 2,
        height: 2,
        colorSpace: "srgb",
        data: new Uint8Array([
          188, 188, 188, 255, 188, 188, 188, 255,
          188, 188, 188, 255, 188, 188, 188, 255
        ])
      });
      const textured = new TexturedPBRMaterial({
        name: "root-srgb-textured-reference",
        baseColor: [1, 1, 1, 1],
        metallic: 0,
        roughness: 0.55,
        baseColorTexture: texture,
        baseColorSampler: new Sampler({ minFilter: "linear", magFilter: "linear" }),
        renderState: { cullMode: "none" }
      });
      renderer.render({
        renderItems: [
          {
            geometry: Geometry.litCube(0.68),
            material: scalar,
            label: "scalar-gray-reference",
            modelMatrix: matrix(-0.48, 0, 0, 1.5, 1.5, 1.5)
          },
          {
            geometry: Geometry.texturedCube(0.68),
            material: textured,
            label: "srgb-textured-gray-reference",
            modelMatrix: matrix(0.48, 0, 0, 1.5, 1.5, 1.5)
          }
        ],
        environmentLighting: {
          color: [0.24, 0.24, 0.25],
          intensity: 0.42,
          proceduralMap: {
            skyColor: [0.58, 0.68, 0.88],
            horizonColor: [0.98, 0.78, 0.5],
            groundColor: [0.08, 0.08, 0.09],
            specularColor: [1, 0.92, 0.7],
            intensity: 0.5,
            specularIntensity: 0.5
          }
        }
      });
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const scalarLuma = regionLuma(pixels, width, 42, 28, 36, 34);
      const texturedLuma = regionLuma(pixels, width, 114, 28, 36, 34);
      const ratio = texturedLuma / Math.max(1, scalarLuma);
      const diagnostics = renderer.device.getDiagnostics();
      renderer.dispose();
      texture.dispose();
      canvas.remove();
      return { diagnostics, scalarLuma, texturedLuma, ratio };

      function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }

      function regionLuma(pixels: Uint8Array, targetWidth: number, x: number, y: number, sampleWidth: number, sampleHeight: number): number {
        let total = 0;
        let count = 0;
        for (let sy = y; sy < y + sampleHeight; sy += 1) {
          for (let sx = x; sx < x + sampleWidth; sx += 1) {
            const index = (sy * targetWidth + sx) * 4;
            total += (pixels[index] ?? 0) * 0.2126 + (pixels[index + 1] ?? 0) * 0.7152 + (pixels[index + 2] ?? 0) * 0.0722;
            count += 1;
          }
        }
        return total / Math.max(1, count);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.diagnostics.lastError).toBeNull();
    expect(result.scalarLuma, JSON.stringify(result)).toBeGreaterThan(35);
    expect(result.texturedLuma, JSON.stringify(result)).toBeGreaterThan(35);
    expect(result.ratio, JSON.stringify(result)).toBeGreaterThan(0.72);
    expect(result.ratio, JSON.stringify(result)).toBeLessThan(1.32);
    writeRootQualityEvidence("srgbPbrTextureSampling", result);
  });

  test("keeps a lit multi-material scene visible through camera movement, shadows, and postprocess", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const {
        analyzeRgbaFrameVisualMetrics,
        Geometry,
        PBRMaterial,
        Renderer,
        Sampler,
        Texture,
        TexturedPBRMaterial,
        createDepthTextureBinding,
        computePerspectiveCameraFrame
      } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;

      const width = 640;
      const height = 360;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.015, 0.018, 0.024, 1],
        preserveDrawingBuffer: true
      });
      const scene = new Scene();
      const keyLight = scene.createLight("directional", "root-quality-key-light");
      keyLight.intensity = 1.25;
      keyLight.castsShadow = true;
      keyLight.transform.setRotation(...quatFromEuler(-0.55, 0.52, 0.08));
      scene.root.addChild(keyLight);

      const fillLight = scene.createLight("point", "root-quality-fill-light");
      fillLight.intensity = 0.9;
      fillLight.range = 5.5;
      fillLight.transform.setPosition(-1.7, 1.8, 1.6);
      scene.root.addChild(fillLight);

      const rimLight = scene.createLight("spot", "root-quality-rim-light");
      rimLight.intensity = 0.75;
      rimLight.range = 6;
      rimLight.angle = 0.72;
      rimLight.penumbra = 0.28;
      rimLight.transform.setPosition(1.8, 1.7, 1.8);
      rimLight.transform.setRotation(...quatFromEuler(-0.86, -0.48, 0));
      scene.root.addChild(rimLight);

      const repeatSampler = new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "repeat" });
      const clampSampler = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
      const paintTexture = makeTexture("root-quality-metal-flake-paint", 128, 128, "srgb", (x, y) => {
        const stripe = (Math.sin((x + y * 0.7) * 0.18) + 1) * 0.5;
        const flake = ((x * 17 + y * 31) % 37) < 3 ? 42 : 0;
        return [118 + stripe * 48 + flake, 24 + stripe * 16, 18 + stripe * 10, 255];
      });
      const carbonTexture = makeTexture("root-quality-carbon-weave", 128, 128, "srgb", (x, y) => {
        const weave = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) === 0 ? 38 : 74;
        const fiber = ((x + y) % 11) < 4 ? 18 : 0;
        return [weave + fiber, weave + fiber + 4, weave + fiber + 12, 255];
      });
      const brushedTexture = makeTexture("root-quality-brushed-metal", 128, 128, "srgb", (x, y) => {
        const grain = Math.sin(y * 0.42) * 22 + ((x * 13 + y * 7) % 19);
        return [144 + grain, 136 + grain, 122 + grain, 255];
      });
      const floorTexture = makeTexture("root-quality-studio-floor-grid", 128, 128, "srgb", (x, y) => {
        const grid = x % 32 < 2 || y % 32 < 2 ? 34 : 0;
        const speckle = ((x * 9 + y * 5) % 23) < 2 ? 18 : 0;
        return [86 + grid + speckle, 90 + grid + speckle, 96 + grid + speckle, 255];
      });
      const panelTexture = makeTexture("root-quality-accent-panel", 128, 128, "srgb", (x, y) => {
        const line = Math.abs((x % 24) - 12) < 1 || Math.abs((y % 24) - 12) < 1 ? 44 : 0;
        const wave = (Math.sin((x - y) * 0.13) + 1) * 16;
        return [30 + line, 70 + wave + line, 104 + wave + line, 255];
      });
      const normalTexture = makeTexture("root-quality-normal-ridges", 128, 128, "linear", (x, y) => {
        const nx = 128 + Math.sin(x * 0.22) * 38;
        const ny = 128 + Math.cos(y * 0.19) * 34;
        return [nx, ny, 224, 255];
      });
      const metalRoughTexture = makeTexture("root-quality-metal-roughness", 128, 128, "linear", (x, y) => {
        const rough = 82 + ((x * 5 + y * 3) % 96);
        const metal = 160 + ((x + y) % 72);
        return [0, rough, metal, 255];
      });
      const occlusionTexture = makeTexture("root-quality-occlusion", 128, 128, "linear", (x, y) => {
        const cavity = ((x % 32) < 4 || (y % 32) < 4) ? 128 : 235;
        return [cavity, cavity, cavity, 255];
      });

      const geometryLibrary = new Map([
        ["body", Geometry.uvSphere(0.62, 72, 36, { textured: true })],
        ["metal", Geometry.cylinder({ radius: 0.32, height: 1.25, segments: 72, textured: true })],
        ["matte", Geometry.texturedCube(0.92)],
        ["ground", Geometry.texturedCube(1)],
        ["accent", Geometry.texturedCube(1)],
        ["capsule", Geometry.capsule({ radius: 0.24, height: 1.05, radialSegments: 48, rings: 12, textured: true })]
      ]);
      const materialLibrary = new Map([
        ["body", new TexturedPBRMaterial({ name: "quality-painted-dielectric", baseColor: [0.92, 0.48, 0.38, 1], metallic: 0.18, roughness: 0.28, baseColorTexture: paintTexture, baseColorSampler: repeatSampler, normalTexture, normalSampler: repeatSampler, normalScale: 0.42, metallicRoughnessTexture: metalRoughTexture, metallicRoughnessSampler: repeatSampler, occlusionTexture, occlusionSampler: repeatSampler, occlusionStrength: 0.42, clearcoatFactor: 0.38, clearcoatRoughnessFactor: 0.18 })],
        ["metal", new TexturedPBRMaterial({ name: "quality-brushed-metal", baseColor: [0.82, 0.8, 0.72, 1], metallic: 1, roughness: 0.18, baseColorTexture: brushedTexture, baseColorSampler: repeatSampler, normalTexture, normalSampler: repeatSampler, normalScale: 0.28, metallicRoughnessTexture: metalRoughTexture, metallicRoughnessSampler: repeatSampler })],
        ["matte", new TexturedPBRMaterial({ name: "quality-carbon-ceramic", baseColor: [0.42, 0.64, 0.9, 1], metallic: 0.02, roughness: 0.72, baseColorTexture: carbonTexture, baseColorSampler: repeatSampler, normalTexture, normalSampler: repeatSampler, normalScale: 0.34, occlusionTexture, occlusionSampler: repeatSampler, occlusionStrength: 0.35 })],
        ["ground", new TexturedPBRMaterial({ name: "quality-ground-receiver", baseColor: [0.74, 0.76, 0.78, 1], metallic: 0, roughness: 0.62, baseColorTexture: floorTexture, baseColorSampler: repeatSampler, normalTexture, normalSampler: repeatSampler, normalScale: 0.2, occlusionTexture, occlusionSampler: repeatSampler, occlusionStrength: 0.5 })],
        ["panel", new TexturedPBRMaterial({ name: "quality-studio-panel", baseColor: [0.38, 0.5, 0.68, 1], metallic: 0.08, roughness: 0.5, baseColorTexture: panelTexture, baseColorSampler: repeatSampler, normalTexture, normalSampler: repeatSampler, normalScale: 0.18 })],
        ["warm-accent", new PBRMaterial({ name: "quality-warm-accent", baseColor: [0.95, 0.58, 0.22, 1], metallic: 0.1, roughness: 0.38, emissiveColor: [0.18, 0.06, 0.01], emissiveStrength: 0.16 })],
        ["cool-accent", new PBRMaterial({ name: "quality-cool-accent", baseColor: [0.12, 0.74, 0.86, 1], metallic: 0.04, roughness: 0.42, emissiveColor: [0.01, 0.14, 0.18], emissiveStrength: 0.18 })],
        ["dark-trim", new PBRMaterial({ name: "quality-dark-trim", baseColor: [0.04, 0.045, 0.055, 1], metallic: 0.6, roughness: 0.32 })]
      ]);

      addRenderable(scene, "body-node", "body", "body", [-0.85, 0.22, 0.1], [1, 1, 1], [0.12, -0.28, 0.04]);
      addRenderable(scene, "metal-node", "metal", "metal", [0.38, 0.28, -0.12], [1, 1, 1], [0.16, 0.2, -0.28]);
      addRenderable(scene, "matte-node", "matte", "matte", [1.18, 0.08, 0.2], [0.82, 0.82, 0.82], [0.08, 0.48, -0.1]);
      addRenderable(scene, "capsule-node", "capsule", "panel", [-1.55, -0.02, -0.22], [0.9, 1, 0.9], [0.42, 0.08, 0.28]);
      addRenderable(scene, "ground-node", "ground", "ground", [0.08, -0.74, 0], [4.7, 0.08, 2.8], [0, 0.02, 0]);
      addRenderable(scene, "backdrop-node", "accent", "panel", [0.2, 0.3, -1.12], [4.4, 1.65, 0.05], [0, 0, 0]);
      addRenderable(scene, "left-trim-node", "accent", "dark-trim", [-2.08, -0.08, -0.18], [0.08, 1.2, 0.08], [0.1, 0, 0]);
      addRenderable(scene, "right-trim-node", "accent", "dark-trim", [2.08, -0.08, -0.18], [0.08, 1.2, 0.08], [-0.1, 0, 0]);
      for (let index = 0; index < 14; index += 1) {
        const x = -2.0 + index * 0.31;
        const y = -0.52 + (index % 3) * 0.12;
        const z = 0.66 - (index % 4) * 0.18;
        addRenderable(
          scene,
          `accent-chip-${index}`,
          "accent",
          index % 2 === 0 ? "warm-accent" : "cool-accent",
          [x, y, z],
          [0.12 + (index % 3) * 0.025, 0.035, 0.08],
          [0, index * 0.22, 0.08]
        );
      }

      const bounds = { min: [-2.45, -0.9, -1.35], max: [2.45, 1.35, 1.35] };
      const environmentLighting = {
        color: [0.16, 0.17, 0.19],
        intensity: 0.34,
        proceduralMap: {
          skyColor: [0.46, 0.6, 0.82],
          horizonColor: [0.95, 0.72, 0.46],
          groundColor: [0.12, 0.12, 0.13],
          specularColor: [1, 0.93, 0.72],
          intensity: 0.58,
          specularIntensity: 1.08
        }
      };
      const depth = createDepthTextureBinding({
        label: "root-quality-depth",
        width,
        height,
        data: createDepthData(width, height)
      });
      const velocity = createVelocityData(width, height);
      const history = new Uint8Array(width * height * 4);
      const frames = [];
      for (const yawRadians of [-0.58, 0, 0.64]) {
        const frame = computePerspectiveCameraFrame(bounds, { width, height }, {
          paddingRatio: 0.18,
          yawRadians,
          pitchRadians: -0.18,
          nearPadding: 0.2,
          farPadding: 2
        });
        const diagnostics = renderer.render({
          scene,
          geometryLibrary,
          materialLibrary,
          environmentLighting,
          cameraPosition: frame.cameraPosition,
          frustumCulling: false,
          shadow: {
            light: keyLight,
            size: 128,
            strength: 0.48,
            bias: 0.003,
            pcfRadius: 1.25,
            pcfSamples: 9
          },
          postprocess: {
            targetFormat: "rgba8",
            toneMapping: { exposure: 1.18, operator: "filmic", gamma: 2.2, inputColorSpace: "linear", outputColorSpace: "srgb" },
            colorGrade: { saturation: 1.12, contrast: 1.16, vibrance: 0.12, sharpening: 0.34, vignette: 0.08 },
            bloom: { threshold: 0.86, intensity: 0.04, radius: 1 },
            depthOfField: { depth, focusDepth: 0.46, focusRange: 0.9, maxRadius: 1 },
            motionBlur: { velocity, samples: 2, scale: 0.12 },
            ssao: { depth, radius: 1, intensity: 0.18, bias: 0.01 },
            ssr: { depth, intensity: 0.06, maxDistance: 3 },
            taa: { history, blend: 0.02 },
            fxaa: true
          }
        }, {
          viewProjectionMatrix: frame.viewProjectionMatrix,
          viewMatrix: frame.viewMatrix,
          projectionMatrix: frame.projectionMatrix
        });
        const pixels = renderer.device.readPixels(0, 0, width, height);
        frames.push({
          yawRadians,
          diagnostics,
          stats: pixelStats(pixels),
          hash: hashPixels(pixels)
        });
      }
      renderer.dispose();
      for (const geometry of geometryLibrary.values()) geometry.dispose();

      return {
        status: "ready",
        frames,
        uniqueHashes: new Set(frames.map((frame) => frame.hash)).size,
        screenshotDataUrl: canvas.toDataURL("image/png")
      };

      function addRenderable(
        targetScene: typeof scene,
        name: string,
        geometry: string,
        material: string,
        position: readonly [number, number, number],
        scale: readonly [number, number, number],
        rotation: readonly [number, number, number] = [0, 0, 0]
      ) {
        const node = targetScene.createNode(name);
        node.transform.setPosition(position[0], position[1], position[2]);
        node.transform.setRotation(...quatFromEuler(rotation[0], rotation[1], rotation[2]));
        node.transform.setScale(scale[0], scale[1], scale[2]);
        targetScene.root.addChild(node);
        targetScene.addRenderable(node, new Renderable({ geometry, material }));
      }

      function pixelStats(pixels: Uint8Array) {
        return analyzeRgbaFrameVisualMetrics(pixels, width, height, {
          darkLumaThreshold: 36,
          salientLumaThreshold: 50,
          bucketShift: 4,
          edgeLumaThreshold: 24
        });
      }

      function makeTexture(
        label: string,
        textureWidth: number,
        textureHeight: number,
        colorSpace: "srgb" | "linear",
        fill: (x: number, y: number) => readonly [number, number, number, number]
      ) {
        const data = new Uint8Array(textureWidth * textureHeight * 4);
        for (let y = 0; y < textureHeight; y += 1) {
          for (let x = 0; x < textureWidth; x += 1) {
            const [r, g, b, a] = fill(x, y);
            const offset = (y * textureWidth + x) * 4;
            data[offset] = clampByte(r);
            data[offset + 1] = clampByte(g);
            data[offset + 2] = clampByte(b);
            data[offset + 3] = clampByte(a);
          }
        }
        return new Texture({ label, width: textureWidth, height: textureHeight, colorSpace, data });
      }

      function clampByte(value: number): number {
        return Math.max(0, Math.min(255, Math.round(value)));
      }

      function hashPixels(pixels: Uint8Array): string {
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 97) {
          hash ^= pixels[index] ?? 0;
          hash = Math.imul(hash, 16777619);
        }
        return String(hash >>> 0);
      }

      function createDepthData(targetWidth: number, targetHeight: number): Float32Array {
        const data = new Float32Array(targetWidth * targetHeight);
        for (let y = 0; y < targetHeight; y += 1) {
          for (let x = 0; x < targetWidth; x += 1) {
            data[y * targetWidth + x] = Math.min(1, Math.max(0, 0.18 + (y / Math.max(1, targetHeight - 1)) * 0.7 + (x / Math.max(1, targetWidth - 1)) * 0.08));
          }
        }
        return data;
      }

      function createVelocityData(targetWidth: number, targetHeight: number): Float32Array {
        const data = new Float32Array(targetWidth * targetHeight * 2);
        for (let y = 0; y < targetHeight; y += 1) {
          for (let x = 0; x < targetWidth; x += 1) {
            const offset = (y * targetWidth + x) * 2;
            data[offset] = x % 17 === 0 ? 0.75 : 0;
            data[offset + 1] = y % 19 === 0 ? 0.5 : 0;
          }
        }
        return data;
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.uniqueHashes).toBe(3);
    expect(result.frames).toHaveLength(3);
    for (const frame of result.frames as RootQualityFrame[]) {
      expect(frame.diagnostics.lastError).toBeNull();
      expect(frame.diagnostics.drawCalls).toBeGreaterThanOrEqual(32);
      expect(frame.stats.width, JSON.stringify(frame)).toBe(640);
      expect(frame.stats.height, JSON.stringify(frame)).toBe(360);
      expect(frame.stats.nonDarkRatio, JSON.stringify(frame)).toBeGreaterThan(0.12);
      expect(frame.stats.salientRatio, JSON.stringify(frame)).toBeGreaterThan(0.11);
      expect(frame.stats.occupiedAreaRatio, JSON.stringify(frame)).toBeGreaterThan(0.2);
      expect(frame.stats.occupiedQuadrants, JSON.stringify(frame)).toBe(4);
      expect(frame.stats.colorBuckets, JSON.stringify(frame)).toBeGreaterThan(120);
      expect(frame.stats.dominantBucketRatio, JSON.stringify(frame)).toBeLessThan(0.75);
      expect(frame.stats.edgePixelRatio, JSON.stringify(frame)).toBeGreaterThan(0.008);
      expect(frame.stats.averageLuma, JSON.stringify(frame)).toBeGreaterThan(25);
      expect(frame.stats.maxLuma, JSON.stringify(frame)).toBeGreaterThan(180);
    }
    const screenshotPath = writeRootQualityScreenshot("lit-multi-material-scene", result.screenshotDataUrl);
    writeRootQualityEvidence("litMultiMaterialScene", {
      uniqueHashes: result.uniqueHashes,
      frames: result.frames,
      screenshotPath
    });
  });

  test("renders a package-level product turntable kit without example-specific assembly", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const {
        Renderer,
        analyzeRgbaFrameVisualMetrics,
        createProductTurntableRenderKit
      } = await import(renderingUrl);

      const width = 960;
      const height = 540;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const kit = createProductTurntableRenderKit({
        elapsedSeconds: 2.25,
        canvasWidth: width,
        canvasHeight: height,
        lightingPreset: "studio"
      });
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.012, 0.014, 0.018, 1],
        preserveDrawingBuffer: true
      });
      const diagnostics = renderer.render(kit.source);
      const pixels = renderer.device.readPixels(0, 0, width, height);
      const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
        darkLumaThreshold: 28,
        salientLumaThreshold: 42,
        bucketShift: 4,
        edgeLumaThreshold: 24
      });
      const productRegion = summarizeProductRegion(pixels, width, height);
      const screenshotDataUrl = canvas.toDataURL("image/png");
      const fixture = kit.fixture;
      const renderItemCount = kit.renderItems.length;
      const materialCount = kit.materialLibrary.size;
      const geometryCount = kit.geometryLibrary.size;
      const postprocessTargetFormat = kit.postprocess.targetFormat;
      const sourceCameraPolicy = kit.source.cameraPolicy;
      const shadowEnabled = typeof kit.source.shadow === "object" && kit.source.shadow.enabled === true;
      const collectedLights = Array.from(kit.source.collectedLights ?? []);
      const shadowCastingLightCount = collectedLights.filter((light) => light.castsShadow).length;
      renderer.dispose();
      kit.dispose();
      canvas.remove();
      return {
        status: "ready",
        diagnostics,
        stats,
        productRegion,
        screenshotDataUrl,
        renderItemCount,
        materialCount,
        geometryCount,
        postprocessTargetFormat,
        sourceCameraPolicy,
        shadowEnabled,
        collectedLightCount: collectedLights.length,
        shadowCastingLightCount,
        fixture: {
          id: fixture.id,
          visibleHotspotCount: fixture.visibleHotspotCount,
          lightingPreset: fixture.lighting.activePreset,
          manifestHash: fixture.manifestHash
        }
      };

      function summarizeProductRegion(pixels: Uint8Array, width: number, height: number) {
        const startX = Math.floor(width * 0.26);
        const endX = Math.floor(width * 0.74);
        const startY = Math.floor(height * 0.18);
        const endY = Math.floor(height * 0.78);
        const buckets = new Set<string>();
        let productPixels = 0;
        let edgePixels = 0;
        let sampledPixels = 0;
        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const index = (y * width + x) * 4;
            const r = pixels[index] ?? 0;
            const g = pixels[index + 1] ?? 0;
            const b = pixels[index + 2] ?? 0;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            sampledPixels += 1;
            buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
            if (luma > 38 && (max - min > 18 || luma > 78)) productPixels += 1;
            if (x > startX && y > startY) {
              const left = index - 4;
              const up = index - width * 4;
              const leftLuma = 0.2126 * (pixels[left] ?? 0) + 0.7152 * (pixels[left + 1] ?? 0) + 0.0722 * (pixels[left + 2] ?? 0);
              const upLuma = 0.2126 * (pixels[up] ?? 0) + 0.7152 * (pixels[up + 1] ?? 0) + 0.0722 * (pixels[up + 2] ?? 0);
              if (Math.abs(luma - leftLuma) + Math.abs(luma - upLuma) > 48) edgePixels += 1;
            }
          }
        }
        return {
          sampledPixels,
          productPixels,
          productPixelRatio: productPixels / Math.max(1, sampledPixels),
          colorBuckets: buckets.size,
          edgePixelRatio: edgePixels / Math.max(1, sampledPixels)
        };
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.diagnostics.lastError).toBeNull();
    expect(result.diagnostics.drawCalls).toBeGreaterThan(result.renderItemCount);
    expect(result.renderItemCount).toBeGreaterThanOrEqual(10);
    expect(result.materialCount).toBeGreaterThanOrEqual(6);
    expect(result.geometryCount).toBeGreaterThanOrEqual(6);
    expect(result.postprocessTargetFormat).toBe("rgba16f");
    expect(result.sourceCameraPolicy).toBe("auto-frame");
    expect(result.shadowEnabled).toBe(true);
    expect(result.collectedLightCount).toBeGreaterThanOrEqual(3);
    expect(result.shadowCastingLightCount).toBe(1);
    expect(result.fixture).toMatchObject({
      id: "v4-old-branch-product-turntable-fixture",
      lightingPreset: "studio"
    });
    expect(result.fixture.visibleHotspotCount).toBeGreaterThan(0);
    expect(result.fixture.manifestHash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.stats.width).toBe(960);
    expect(result.stats.height).toBe(540);
    expect(result.stats.nonDarkRatio, JSON.stringify(result)).toBeGreaterThan(0.14);
    expect(result.stats.salientRatio, JSON.stringify(result)).toBeGreaterThan(0.105);
    expect(result.stats.occupiedAreaRatio, JSON.stringify(result)).toBeGreaterThan(0.24);
    expect(result.stats.occupiedQuadrants, JSON.stringify(result)).toBe(4);
    expect(result.stats.bounds?.minX, JSON.stringify(result)).toBeGreaterThan(180);
    expect(result.stats.bounds?.maxX, JSON.stringify(result)).toBeLessThan(950);
    expect(result.stats.colorBuckets, JSON.stringify(result)).toBeGreaterThanOrEqual(140);
    expect(result.stats.colorBuckets, JSON.stringify(result)).toBeLessThan(450);
    expect(result.stats.dominantBucketRatio, JSON.stringify(result)).toBeLessThan(0.65);
    expect(result.stats.edgePixelRatio, JSON.stringify(result)).toBeGreaterThan(0.012);
    expect(result.stats.edgePixelRatio, JSON.stringify(result)).toBeLessThan(0.04);
    expect(result.stats.maxLuma, JSON.stringify(result)).toBeGreaterThan(150);
    expect(result.productRegion.productPixels, JSON.stringify(result)).toBeGreaterThan(7_000);
    expect(result.productRegion.productPixelRatio, JSON.stringify(result)).toBeGreaterThan(0.07);
    expect(result.productRegion.colorBuckets, JSON.stringify(result)).toBeGreaterThan(160);
    expect(result.productRegion.edgePixelRatio, JSON.stringify(result)).toBeGreaterThan(0.02);
    const screenshotPath = writeRootQualityScreenshot("product-turntable-render-kit", result.screenshotDataUrl);
    writeRootQualityEvidence("productTurntableRenderKit", {
      fixture: result.fixture,
      diagnostics: result.diagnostics,
      stats: result.stats,
      productRegion: result.productRegion,
      renderItemCount: result.renderItemCount,
      materialCount: result.materialCount,
      geometryCount: result.geometryCount,
      postprocessTargetFormat: result.postprocessTargetFormat,
      sourceCameraPolicy: result.sourceCameraPolicy,
      shadowEnabled: result.shadowEnabled,
      collectedLightCount: result.collectedLightCount,
      shadowCastingLightCount: result.shadowCastingLightCount,
      screenshotPath
    });
  });

  test("keeps authored scene camera orbit movement visible with renderer frustum culling enabled", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl, inputUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const input = await import(inputUrl);
      const {
        analyzeRgbaFrameVisualMetrics,
        Geometry,
        PBRMaterial,
        Renderer
      } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;
      const { InputSnapshot, OrbitControls, createSceneCameraControlAdapter } = input;

      const width = 280;
      const height = 180;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.014, 0.017, 0.023, 1],
        preserveDrawingBuffer: true
      });
      const scene = new Scene();
      const camera = scene.createPerspectiveCamera({ name: "root-authored-orbit-camera", fovYRadians: Math.PI / 3, aspect: width / height, near: 0.05, far: 80 });
      scene.root.addChild(camera);
      const controls = new OrbitControls(createSceneCameraControlAdapter(camera), {
        target: { x: 0.15, y: 0.1, z: 0 },
        distance: 4.4,
        minDistance: 1.2,
        maxDistance: 12,
        rotateSpeed: 0.004
      });

      const keyLight = scene.createLight("directional", "root-authored-orbit-key-light");
      keyLight.intensity = 1.4;
      keyLight.transform.setRotation(...quatFromEuler(-0.62, 0.4, 0.05));
      scene.root.addChild(keyLight);
      const fillLight = scene.createLight("point", "root-authored-orbit-fill-light");
      fillLight.intensity = 0.65;
      fillLight.transform.setPosition(-1.5, 1.6, 2.8);
      scene.root.addChild(fillLight);

      const geometryLibrary = new Map([
        ["sphere", Geometry.uvSphere(0.58, 40, 20)],
        ["cube", Geometry.litCube(0.74)],
        ["cylinder", Geometry.cylinder({ radius: 0.24, height: 1.2, segments: 36 })],
        ["ground", Geometry.litCube(1)]
      ]);
      const materialLibrary = new Map([
        ["red", new PBRMaterial({ name: "root-authored-camera-red", baseColor: [0.86, 0.16, 0.1, 1], metallic: 0.04, roughness: 0.38 })],
        ["blue", new PBRMaterial({ name: "root-authored-camera-blue", baseColor: [0.08, 0.34, 0.88, 1], metallic: 0.1, roughness: 0.5 })],
        ["metal", new PBRMaterial({ name: "root-authored-camera-metal", baseColor: [0.86, 0.78, 0.62, 1], metallic: 1, roughness: 0.22 })],
        ["ground", new PBRMaterial({ name: "root-authored-camera-ground", baseColor: [0.42, 0.44, 0.48, 1], metallic: 0, roughness: 0.72 })]
      ]);
      addRenderable("root-orbit-red-sphere", "sphere", "red", [-0.9, 0.2, 0], [1, 1, 1]);
      addRenderable("root-orbit-blue-cube", "cube", "blue", [0.45, 0.12, -0.16], [1, 1, 1]);
      addRenderable("root-orbit-metal-cylinder", "cylinder", "metal", [1.1, 0.18, 0.2], [1, 1, 1]);
      addRenderable("root-orbit-ground", "ground", "ground", [0.08, -0.66, 0], [4.2, 0.08, 2.5]);

      const source = {
        scene,
        geometryLibrary,
        materialLibrary,
        environmentLighting: {
          color: [0.1, 0.11, 0.13],
          intensity: 0.22,
          proceduralMap: {
            skyColor: [0.42, 0.56, 0.84],
            horizonColor: [0.96, 0.74, 0.48],
            groundColor: [0.06, 0.06, 0.07],
            specularColor: [1, 0.9, 0.68],
            intensity: 0.5,
            specularIntensity: 0.95
          }
        }
      };
      const initial = renderFrame("initial");
      controls.update(new InputSnapshot({
        pointer: {
          deltaX: 180,
          deltaY: -34,
          buttons: new Map([[0, { down: true, pressed: false, released: false }]])
        }
      }));
      const moved = renderFrame("moved");
      controls.update(new InputSnapshot({
        pointer: {
          deltaX: -260,
          deltaY: 52,
          buttons: new Map([[0, { down: true, pressed: false, released: false }]])
        }
      }));
      const movedBack = renderFrame("moved-back");

      renderer.dispose();
      for (const geometry of geometryLibrary.values()) geometry.dispose();
      canvas.remove();

      return {
        status: "ready",
        cameraPosition: [...camera.transform.position],
        cameraFrustumPlanes: camera.frustumPlanes.length,
        frames: [initial, moved, movedBack],
        uniqueHashes: new Set([initial.hash, moved.hash, movedBack.hash]).size,
        screenshotDataUrl: canvas.toDataURL("image/png")
      };

      function addRenderable(name: string, geometry: string, material: string, position: readonly [number, number, number], scale: readonly [number, number, number]) {
        const node = scene.createNode(name);
        node.transform.setPosition(position[0], position[1], position[2]);
        node.transform.setScale(scale[0], scale[1], scale[2]);
        scene.root.addChild(node);
        scene.addRenderable(node, new Renderable({ geometry, material }));
      }

      function renderFrame(label: string) {
        const diagnostics = renderer.render(source);
        const pixels = renderer.device.readPixels(0, 0, width, height);
        return {
          label,
          diagnostics,
          stats: pixelStats(pixels),
          hash: hashPixels(pixels)
        };
      }

      function pixelStats(pixels: Uint8Array) {
        return analyzeRgbaFrameVisualMetrics(pixels, width, height);
      }

      function hashPixels(pixels: Uint8Array): string {
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 89) {
          hash ^= pixels[index] ?? 0;
          hash = Math.imul(hash, 16777619);
        }
        return String(hash >>> 0);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`,
      inputUrl: `${server.origin}/packages/input/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.cameraFrustumPlanes).toBe(6);
    expect(result.uniqueHashes).toBeGreaterThanOrEqual(2);
    expect(result.frames).toHaveLength(3);
    for (const frame of result.frames as RootQualityFrame[]) {
      expect(frame.diagnostics.lastError).toBeNull();
      expect(frame.diagnostics.drawCalls, JSON.stringify(frame)).toBeGreaterThanOrEqual(4);
      expect(frame.stats.nonDarkRatio, JSON.stringify(frame)).toBeGreaterThan(0.055);
      expect(frame.stats.salientRatio, JSON.stringify(frame)).toBeGreaterThan(0.12);
      expect(frame.stats.occupiedAreaRatio, JSON.stringify(frame)).toBeGreaterThan(0.23);
      expect(frame.stats.occupiedQuadrants, JSON.stringify(frame)).toBe(4);
      expect(frame.stats.colorBuckets, JSON.stringify(frame)).toBeGreaterThan(10);
      expect(frame.stats.dominantBucketRatio, JSON.stringify(frame)).toBeLessThan(0.88);
      expect(frame.stats.edgePixelRatio, JSON.stringify(frame)).toBeGreaterThan(0.008);
      expect(frame.stats.averageLuma, JSON.stringify(frame)).toBeGreaterThan(5);
      expect(frame.stats.maxLuma, JSON.stringify(frame)).toBeGreaterThan(45);
    }
    const screenshotPath = writeRootQualityScreenshot("authored-camera-movement", result.screenshotDataUrl);
    writeRootQualityEvidence("authoredCameraMovement", {
      cameraPosition: result.cameraPosition,
      cameraFrustumPlanes: result.cameraFrustumPlanes,
      uniqueHashes: result.uniqueHashes,
      frames: result.frames,
      screenshotPath
    });
  });

  test("keeps dense thin transformed scenes visible during authored camera movement and frustum culling", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl, inputUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const input = await import(inputUrl);
      const {
        analyzeRgbaFrameVisualMetrics,
        Geometry,
        PBRMaterial,
        Renderer
      } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;
      const { InputSnapshot, OrbitControls, createSceneCameraControlAdapter } = input;

      const width = 520;
      const height = 320;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.012, 0.014, 0.018, 1],
        preserveDrawingBuffer: true
      });
      const scene = new Scene();
      const camera = scene.createPerspectiveCamera({ name: "root-dense-authored-camera", fovYRadians: Math.PI / 3.2, aspect: width / height, near: 0.05, far: 80 });
      scene.root.addChild(camera);
      const controls = new OrbitControls(createSceneCameraControlAdapter(camera), {
        target: { x: 0.08, y: 0.08, z: -0.05 },
        distance: 4.4,
        minDistance: 1.5,
        maxDistance: 18,
        rotateSpeed: 0.0036
      });

      const keyLight = scene.createLight("directional", "root-dense-key");
      keyLight.intensity = 1.7;
      keyLight.castsShadow = true;
      keyLight.transform.setRotation(...quatFromEuler(-0.62, 0.46, 0.05));
      scene.root.addChild(keyLight);
      const fillLight = scene.createLight("point", "root-dense-fill");
      fillLight.intensity = 0.95;
      fillLight.range = 9;
      fillLight.transform.setPosition(-2.5, 2.4, 2.6);
      scene.root.addChild(fillLight);

      const geometryLibrary = new Map([
        ["thin-panel", Geometry.litCube(1)],
        ["trim", Geometry.litCube(1)],
        ["marker", Geometry.uvSphere(0.08, 24, 12)]
      ]);
      const materialLibrary = new Map([
        ["wall", new PBRMaterial({ name: "root-dense-wall", baseColor: [0.72, 0.72, 0.66, 1], metallic: 0.02, roughness: 0.58 })],
        ["glass", new PBRMaterial({ name: "root-dense-glass", baseColor: [0.36, 0.58, 0.74, 0.7], metallic: 0.02, roughness: 0.16, transmissionFactor: 0.22, specularFactor: 0.85, renderState: { blend: true, depthWrite: false } })],
        ["floor", new PBRMaterial({ name: "root-dense-floor", baseColor: [0.48, 0.5, 0.52, 1], metallic: 0, roughness: 0.72 })],
        ["stone", new PBRMaterial({ name: "root-dense-stone", baseColor: [0.62, 0.58, 0.5, 1], metallic: 0, roughness: 0.82 })],
        ["copper", new PBRMaterial({ name: "root-dense-copper", baseColor: [0.86, 0.46, 0.26, 1], metallic: 0.75, roughness: 0.3 })],
        ["blueprint", new PBRMaterial({ name: "root-dense-blueprint", baseColor: [0.16, 0.35, 0.58, 1], metallic: 0.05, roughness: 0.48, emissiveColor: [0.0, 0.06, 0.12], emissiveStrength: 0.12 })],
        ["greenery", new PBRMaterial({ name: "root-dense-greenery", baseColor: [0.22, 0.54, 0.28, 1], metallic: 0.02, roughness: 0.7 })],
        ["ceramic", new PBRMaterial({ name: "root-dense-ceramic", baseColor: [0.86, 0.82, 0.72, 1], metallic: 0.02, roughness: 0.34 })],
        ["warm", new PBRMaterial({ name: "root-dense-warm", baseColor: [0.92, 0.58, 0.2, 1], metallic: 0.1, roughness: 0.42 })],
        ["cool", new PBRMaterial({ name: "root-dense-cool", baseColor: [0.1, 0.66, 0.86, 1], metallic: 0.08, roughness: 0.38 })],
        ["dark", new PBRMaterial({ name: "root-dense-dark", baseColor: [0.04, 0.045, 0.052, 1], metallic: 0.45, roughness: 0.34 })]
      ]);

      addRenderable("root-dense-floor", "thin-panel", "floor", [0, -0.84, 0.1], [6.2, 0.05, 3.2], [0, 0, 0]);
      const palette = ["wall", "stone", "copper", "blueprint", "greenery", "ceramic", "glass", "dark"] as const;
      for (let column = 0; column < 8; column += 1) {
        addRenderable(
          `root-dense-back-plane-${column}`,
          "thin-panel",
          palette[column % palette.length],
          [-2.74 + column * 0.78, 0.34, -1.15],
          [0.68, 1.78, 0.05],
          [0, 0, 0]
        );
      }
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 12; column += 1) {
          const x = -2.85 + column * 0.52;
          const y = -0.55 + row * 0.34;
          const z = -0.82 + (column % 4) * 0.24;
          const material = palette[(row * 3 + column) % palette.length];
          addRenderable(
            `root-dense-panel-${row}-${column}`,
            "thin-panel",
            material,
            [x, y, z],
            [0.18 + (column % 3) * 0.04, 0.26 + (row % 2) * 0.12, 0.035],
            [0.05 * row, -0.28 + column * 0.045, 0]
          );
        }
      }
      for (let index = 0; index < 24; index += 1) {
        addRenderable(
          `root-dense-trim-${index}`,
          "trim",
          index % 2 === 0 ? "warm" : "cool",
          [-3.0 + index * 0.26, -0.9 + (index % 4) * 0.18, 0.8 - (index % 5) * 0.26],
          [0.12, 0.025, 0.12],
          [0, index * 0.12, 0.04]
        );
      }
      for (let index = 0; index < 8; index += 1) {
        addRenderable(
          `root-dense-marker-${index}`,
          "marker",
          index % 2 === 0 ? "cool" : "warm",
          [-2.1 + index * 0.6, 0.95 + (index % 3) * 0.1, -0.18 + (index % 2) * 0.34],
          [1, 1, 1],
          [0, 0, 0]
        );
      }

      const source = {
        scene,
        geometryLibrary,
        materialLibrary,
        environmentLighting: {
          color: [0.12, 0.13, 0.15],
          intensity: 0.28,
          proceduralMap: {
            skyColor: [0.48, 0.62, 0.86],
            horizonColor: [0.95, 0.74, 0.46],
            groundColor: [0.06, 0.06, 0.07],
            specularColor: [1, 0.92, 0.72],
            intensity: 0.52,
            specularIntensity: 0.95
          }
        },
        frustumCulling: true,
        shadow: {
          light: keyLight,
          size: 128,
          strength: 0.42,
          bias: 0.003,
          pcfRadius: 1,
          pcfSamples: 9
        },
        postprocess: {
          targetFormat: "rgba8",
          toneMapping: { exposure: 1.08, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
          colorGrade: { contrast: 1.1, saturation: 1.08, vibrance: 0.1, sharpening: 0.25 },
          bloom: { threshold: 0.86, intensity: 0.04, radius: 1 },
          fxaa: true
        }
      };

      const frames = [renderFrame("initial")];
      controls.update(new InputSnapshot({
        pointer: {
          deltaX: 240,
          deltaY: -18,
          buttons: new Map([[0, { down: true, pressed: false, released: false }]])
        }
      }));
      frames.push(renderFrame("orbit-right"));
      controls.update(new InputSnapshot({
        pointer: {
          deltaX: -420,
          deltaY: 34,
          buttons: new Map([[0, { down: true, pressed: false, released: false }]])
        }
      }));
      frames.push(renderFrame("orbit-left"));
      controls.update(new InputSnapshot({
        pointer: {
          deltaX: 180,
          deltaY: 12,
          buttons: new Map([[0, { down: true, pressed: false, released: false }]])
        }
      }));
      frames.push(renderFrame("orbit-return"));

      renderer.dispose();
      for (const geometry of geometryLibrary.values()) geometry.dispose();
      canvas.remove();

      return {
        status: "ready",
        totalRenderables: scene.collectRenderables().length,
        cameraFrustumPlanes: camera.frustumPlanes.length,
        uniqueHashes: new Set(frames.map((frame) => frame.hash)).size,
        frames,
        screenshotDataUrl: canvas.toDataURL("image/png")
      };

      function renderFrame(label: string) {
        const diagnostics = renderer.render(source);
        const pixels = renderer.device.readPixels(0, 0, width, height);
        const stats = analyzeRgbaFrameVisualMetrics(pixels, width, height, {
          darkLumaThreshold: 32,
          salientLumaThreshold: 46,
          bucketShift: 4,
          edgeLumaThreshold: 24
        });
        return { label, diagnostics, stats, hash: hashPixels(pixels) };
      }

      function addRenderable(
        name: string,
        geometry: string,
        material: string,
        position: readonly [number, number, number],
        scale: readonly [number, number, number],
        rotation: readonly [number, number, number]
      ) {
        const node = scene.createNode(name);
        node.transform.setPosition(position[0], position[1], position[2]);
        node.transform.setRotation(...quatFromEuler(rotation[0], rotation[1], rotation[2]));
        node.transform.setScale(scale[0], scale[1], scale[2]);
        scene.root.addChild(node);
        scene.addRenderable(node, new Renderable({ geometry, material }));
      }

      function hashPixels(pixels: Uint8Array): string {
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 101) {
          hash ^= pixels[index] ?? 0;
          hash = Math.imul(hash, 16777619);
        }
        return String(hash >>> 0);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`,
      inputUrl: `${server.origin}/packages/input/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.totalRenderables).toBeGreaterThanOrEqual(90);
    expect(result.cameraFrustumPlanes).toBe(6);
    expect(result.uniqueHashes).toBeGreaterThanOrEqual(3);
    expect(result.frames).toHaveLength(4);
    for (const frame of result.frames as RootQualityFrame[]) {
      expect(frame.diagnostics.lastError).toBeNull();
      expect(frame.diagnostics.drawCalls, JSON.stringify(frame)).toBeGreaterThanOrEqual(40);
      expect(frame.stats.nonDarkRatio, JSON.stringify(frame)).toBeGreaterThan(0.24);
      expect(frame.stats.salientRatio, JSON.stringify(frame)).toBeGreaterThan(0.22);
      expect(frame.stats.occupiedAreaRatio, JSON.stringify(frame)).toBeGreaterThan(0.48);
      expect(frame.stats.occupiedQuadrants, JSON.stringify(frame)).toBe(4);
      expect(frame.stats.colorBuckets, JSON.stringify(frame)).toBeGreaterThan(70);
      expect(frame.stats.dominantBucketRatio, JSON.stringify(frame)).toBeLessThan(0.8);
      expect(frame.stats.edgePixelRatio, JSON.stringify(frame)).toBeGreaterThan(0.012);
      expect(frame.stats.averageLuma, JSON.stringify(frame)).toBeGreaterThan(38);
      expect(frame.stats.maxLuma, JSON.stringify(frame)).toBeGreaterThan(110);
    }
    const screenshotPath = writeRootQualityScreenshot("dense-camera-framing", result.screenshotDataUrl);
    writeRootQualityEvidence("denseCameraFraming", {
      totalRenderables: result.totalRenderables,
      cameraFrustumPlanes: result.cameraFrustumPlanes,
      uniqueHashes: result.uniqueHashes,
      frames: result.frames,
      screenshotPath
    });
  });

  test("proves the full postprocess suite on root renderer real-scene pixels without example coupling", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const {
        analyzeRgbaFrameVisualMetrics,
        Geometry,
        PBRMaterial,
        Renderer,
        applyToneMappingPreset,
        bloomPixels,
        chromaticAberrationPixels,
        colorGradePixels,
        createDepthTextureBinding,
        depthOfFieldPixels,
        filmGrainPixels,
        fxaaPixels,
        motionBlurPixels,
        outlinePixels,
        ssaoPixels,
        ssrPixels,
        taaPixels,
        toneMapPixels,
        visualizeDepthTexture
      } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;

      const width = 192;
      const height = 128;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.015, 0.018, 0.024, 1],
        preserveDrawingBuffer: true
      });
      const scene = new Scene();
      const keyLight = scene.createLight("directional", "root-postprocess-key-light");
      keyLight.intensity = 1.55;
      keyLight.castsShadow = true;
      keyLight.transform.setRotation(...quatFromEuler(-0.62, 0.48, 0.08));
      scene.root.addChild(keyLight);

      const geometryLibrary = new Map([
        ["red-sphere", Geometry.uvSphere(0.56, 48, 24)],
        ["blue-box", Geometry.litCube(0.86)],
        ["metal-cylinder", Geometry.cylinder({ radius: 0.28, height: 1.15, segments: 40 })],
        ["ground", Geometry.litCube(1)]
      ]);
      const materialLibrary = new Map([
        ["red-sphere", new PBRMaterial({ name: "root-postprocess-red-pbr", baseColor: [0.95, 0.16, 0.08, 1], metallic: 0.04, roughness: 0.34, emissiveColor: [0.2, 0.02, 0.01], emissiveStrength: 0.8 })],
        ["blue-box", new PBRMaterial({ name: "root-postprocess-blue-pbr", baseColor: [0.08, 0.36, 0.92, 1], metallic: 0.08, roughness: 0.48 })],
        ["metal-cylinder", new PBRMaterial({ name: "root-postprocess-metal-pbr", baseColor: [0.92, 0.86, 0.72, 1], metallic: 1, roughness: 0.18 })],
        ["ground", new PBRMaterial({ name: "root-postprocess-ground-pbr", baseColor: [0.45, 0.47, 0.5, 1], metallic: 0, roughness: 0.72 })]
      ]);

      addRenderable("red-node", "red-sphere", "red-sphere", [-0.78, 0.15, 0.05], [1, 1, 1]);
      addRenderable("blue-node", "blue-box", "blue-box", [0.58, 0.03, -0.08], [0.82, 0.82, 0.82]);
      addRenderable("metal-node", "metal-cylinder", "metal-cylinder", [1.18, 0.18, 0.04], [1, 1, 1]);
      addRenderable("ground-node", "ground", "ground", [0.12, -0.68, 0], [4.3, 0.08, 2.4]);

      const environmentLighting = {
        color: [0.1, 0.11, 0.13],
        intensity: 0.24,
        proceduralMap: {
          skyColor: [0.48, 0.62, 0.9],
          horizonColor: [0.98, 0.76, 0.46],
          groundColor: [0.06, 0.06, 0.07],
          specularColor: [1, 0.92, 0.68],
          intensity: 0.56,
          specularIntensity: 1.05
        }
      };
      const source = {
        scene,
        geometryLibrary,
        materialLibrary,
        cameraPolicy: "auto-frame",
        environmentLighting,
        frustumCulling: false,
        shadow: {
          light: keyLight,
          size: 128,
          strength: 0.42,
          bias: 0.003,
          pcfRadius: 1,
          pcfSamples: 9
        }
      };

      const baseDiagnostics = renderer.render(source);
      const basePixels = renderer.device.readPixels(0, 0, width, height);
      const depth = createDepthTextureBinding({
        label: "root-postprocess-real-scene-derived-depth",
        width,
        height,
        data: createSceneDepth(basePixels, width, height)
      });
      const velocity = createVelocity(width, height);
      const history = dimHistory(basePixels);

      const tone = toneMapPixels(basePixels, width, height, { exposure: 1.35, operator: "aces", inputColorSpace: "srgb", outputColorSpace: "srgb" });
      const preset = applyToneMappingPreset(basePixels, width, height, "cinematic", {
        autoExposure: true,
        previousExposure: 1,
        deltaTimeSeconds: 1 / 30,
        inputColorSpace: "srgb",
        outputColorSpace: "srgb"
      });
      const bloom = bloomPixels(tone.pixels, width, height, { threshold: 0.42, intensity: 0.45, radius: 2 });
      const fxaa = fxaaPixels(bloom.pixels, width, height, { edgeThreshold: 0.08, subpixelBlend: 0.65 });
      const grading = colorGradePixels(fxaa.pixels, width, height, {
        contrast: 1.18,
        temperature: 0.28,
        tint: 0.18,
        saturation: 1.22,
        vibrance: 0.24,
        vignette: 0.42,
        sharpening: 0.75
      });
      const depthVisualization = visualizeDepthTexture(depth, { edgeThreshold: 0.035 });
      const chromaticAberration = chromaticAberrationPixels(grading.pixels, width, height, { strength: 0.9 });
      const filmGrain = filmGrainPixels(chromaticAberration.pixels, width, height, { intensity: 0.18, seed: 17, monochrome: false });
      const depthOfField = depthOfFieldPixels(filmGrain.pixels, width, height, { depth, focusDepth: 0.48, focusRange: 0.1, maxRadius: 2 });
      const outline = outlinePixels(depthOfField.pixels, width, height, { threshold: 0.08, width: 1, opacity: 0.85 });
      const motionBlur = motionBlurPixels(outline.pixels, width, height, { velocity, samples: 3, scale: 1.2 });
      const ssao = ssaoPixels(motionBlur.pixels, width, height, { depth, radius: 1, intensity: 0.55, bias: 0.005 });
      const ssr = ssrPixels(ssao.pixels, width, height, { depth, intensity: 0.34, maxDistance: 4 });
      const taa = taaPixels(ssr.pixels, width, height, { history, blend: 0.18 });

      const integratedDiagnostics = renderer.render({
        ...source,
        postprocess: {
          targetFormat: "rgba8",
          bloom: { threshold: 0.42, intensity: 0.3, radius: 1 },
          toneMapping: { exposure: 1.25, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
          colorGrade: { contrast: 1.12, saturation: 1.16, vibrance: 0.12, vignette: 0.32, sharpening: 0.45 },
          chromaticAberration: { strength: 0.55 },
          filmGrain: { intensity: 0.08, seed: 23 },
          depthOfField: { focusDepth: 0.48, focusRange: 0.12, maxRadius: 1 },
          motionBlur: { velocity, samples: 2, scale: 0.85 },
          ssao: { radius: 1, intensity: 0.45, bias: 0.004 },
          ssr: { intensity: 0.22, maxDistance: 4 },
          taa: { history, blend: 0.12 },
          outline: { threshold: 0.08, width: 1, opacity: 0.75 },
          fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.65 }
        }
      });
      const integratedPixels = renderer.device.readPixels(0, 0, width, height);
      const integratedStats = pixelStats(integratedPixels);

      renderer.dispose();
      for (const geometry of geometryLibrary.values()) geometry.dispose();
      canvas.remove();

      return {
        status: "ready",
        baseDrawCalls: baseDiagnostics.drawCalls,
        baseLastError: baseDiagnostics.lastError,
        integratedDrawCalls: integratedDiagnostics.drawCalls,
        integratedLastError: integratedDiagnostics.lastError,
        baseStats: pixelStats(basePixels),
        integratedStats,
        integratedChangedPixels: countChangedRgb(basePixels, integratedPixels),
        colorManagement: {
          controls: {
            toneMapper: "filmic",
            exposure: 1.25,
            inputColorSpace: "linear",
            outputColorSpace: "srgb"
          },
          calibration: {
            operator: tone.calibration.operator,
            monotonic: tone.calibration.monotonic,
            inputColorSpace: tone.calibration.inputColorSpace,
            outputColorSpace: tone.calibration.outputColorSpace
          },
          preset: {
            name: preset.preset,
            histogramPixelCount: preset.histogram.pixelCount,
            histogramBinCount: preset.histogram.binCount,
            averageLuminance: preset.histogram.averageLuminance,
            autoExposure: preset.autoExposure?.exposure ?? 0
          }
        },
        screenshotDataUrl: canvas.toDataURL("image/png"),
        effects: {
          toneMapping: tone.calibration.operator === "aces" && tone.calibration.monotonic,
          toneMappingPresets: preset.preset === "cinematic" && preset.histogram.pixelCount === width * height,
          autoExposure: Boolean(preset.autoExposure && preset.autoExposure.exposure > 0),
          bloom: bloom.changedPixels > 0 && bloom.brightPixelCount > 0,
          fxaa: countMaskPixels(fxaa.edgeMask) > 0,
          colorGrading: grading.changedPixels > 0,
          vignette: grading.vignetteDarkenedPixels > 0,
          sharpening: grading.sharpenedPixels > 0,
          depthVisualization: depthVisualization.stats.edgePixelCount > 0 && depthVisualization.stats.minDepth < depthVisualization.stats.maxDepth,
          chromaticAberration: chromaticAberration.changedPixels > 0,
          filmGrain: filmGrain.changedPixels > 0,
          depthOfField: depthOfField.blurredPixels > 0,
          outline: outline.changedPixels > 0 && outline.outlinedPixels > 0,
          motionBlur: motionBlur.blurredPixels > 0,
          ssao: ssao.occludedPixels > 0,
          ssr: ssr.reflectedPixels > 0,
          taa: taa.blendedPixels > 0
        }
      };

      function addRenderable(name: string, geometry: string, material: string, position: readonly [number, number, number], scale: readonly [number, number, number]) {
        const node = scene.createNode(name);
        node.transform.setPosition(position[0], position[1], position[2]);
        node.transform.setScale(scale[0], scale[1], scale[2]);
        scene.root.addChild(node);
        scene.addRenderable(node, new Renderable({ geometry, material }));
      }

      function createSceneDepth(pixels: Uint8Array, targetWidth: number, targetHeight: number) {
        const data = new Float32Array(targetWidth * targetHeight);
        for (let y = 0; y < targetHeight; y += 1) {
          for (let x = 0; x < targetWidth; x += 1) {
            const index = (y * targetWidth + x) * 4;
            const luma = ((pixels[index] ?? 0) * 0.2126 + (pixels[index + 1] ?? 0) * 0.7152 + (pixels[index + 2] ?? 0) * 0.0722) / 255;
            const gradient = x / Math.max(1, targetWidth - 1);
            data[y * targetWidth + x] = Math.max(0.04, Math.min(0.96, 0.18 + gradient * 0.62 + (1 - luma) * 0.18));
          }
        }
        return data;
      }

      function createVelocity(targetWidth: number, targetHeight: number) {
        const data = new Float32Array(targetWidth * targetHeight * 2);
        for (let y = 0; y < targetHeight; y += 1) {
          for (let x = 0; x < targetWidth; x += 1) {
            const offset = (y * targetWidth + x) * 2;
            data[offset] = x % 13 === 0 ? 0.8 : 0.04;
            data[offset + 1] = y % 17 === 0 ? 0.55 : 0.02;
          }
        }
        return data;
      }

      function dimHistory(pixels: Uint8Array) {
        const output = new Uint8Array(pixels.length);
        for (let index = 0; index < pixels.length; index += 4) {
          output[index] = Math.round((pixels[index] ?? 0) * 0.62);
          output[index + 1] = Math.round((pixels[index + 1] ?? 0) * 0.62);
          output[index + 2] = Math.round((pixels[index + 2] ?? 0) * 0.62);
          output[index + 3] = pixels[index + 3] ?? 255;
        }
        return output;
      }

      function pixelStats(pixels: Uint8Array) {
        return analyzeRgbaFrameVisualMetrics(pixels, width, height);
      }

      function countMaskPixels(mask: Uint8Array) {
        let count = 0;
        for (const value of mask) {
          if (value > 0) count += 1;
        }
        return count;
      }

      function countChangedRgb(before: Uint8Array, after: Uint8Array) {
        let count = 0;
        for (let index = 0; index < before.length; index += 4) {
          const delta = Math.abs((before[index] ?? 0) - (after[index] ?? 0))
            + Math.abs((before[index + 1] ?? 0) - (after[index + 1] ?? 0))
            + Math.abs((before[index + 2] ?? 0) - (after[index + 2] ?? 0));
          if (delta > 8) count += 1;
        }
        return count;
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.baseLastError).toBeNull();
    expect(result.integratedLastError).toBeNull();
    expect(result.baseDrawCalls).toBeGreaterThanOrEqual(6);
    expect(result.integratedDrawCalls).toBeGreaterThanOrEqual(6);
    expect(result.baseStats.nonDarkRatio).toBeGreaterThan(0.08);
    expect(result.baseStats.salientRatio).toBeGreaterThan(0.15);
    expect(result.baseStats.occupiedAreaRatio).toBeGreaterThan(0.3);
    expect(result.baseStats.occupiedQuadrants).toBe(4);
    expect(result.baseStats.colorBuckets).toBeGreaterThan(12);
    expect(result.baseStats.dominantBucketRatio).toBeLessThan(0.85);
    expect(result.baseStats.edgePixelRatio).toBeGreaterThan(0.02);
    expect(result.integratedStats.nonDarkRatio).toBeGreaterThan(0.08);
    expect(result.integratedStats.salientRatio).toBeGreaterThan(0.25);
    expect(result.integratedStats.salientRatio).toBeLessThan(0.75);
    expect(result.integratedStats.occupiedAreaRatio).toBeGreaterThan(0.35);
    expect(result.integratedStats.occupiedQuadrants).toBe(4);
    expect(result.integratedStats.colorBuckets).toBeGreaterThan(12);
    expect(result.integratedStats.dominantBucketRatio).toBeLessThan(0.82);
    expect(result.integratedStats.edgePixelRatio).toBeGreaterThan(0.018);
    expect(result.integratedStats.edgePixelRatio).toBeLessThan(0.18);
    expect(result.integratedChangedPixels, JSON.stringify(result)).toBeGreaterThan(1_000);
    expect(result.effects).toEqual({
      toneMapping: true,
      toneMappingPresets: true,
      autoExposure: true,
      bloom: true,
      fxaa: true,
      colorGrading: true,
      vignette: true,
      sharpening: true,
      depthVisualization: true,
      chromaticAberration: true,
      filmGrain: true,
      depthOfField: true,
      outline: true,
      motionBlur: true,
      ssao: true,
      ssr: true,
      taa: true
    });
    const screenshotPath = writeRootQualityScreenshot("postprocess-suite-integrated", result.screenshotDataUrl);
    writeRootQualityEvidence("postprocessSuite", {
      effects: result.effects,
      baseDrawCalls: result.baseDrawCalls,
      integratedDrawCalls: result.integratedDrawCalls,
      integratedChangedPixels: result.integratedChangedPixels,
      baseStats: result.baseStats,
      integratedStats: result.integratedStats,
      colorManagement: result.colorManagement,
      screenshotPath
    });
  });

  test("preserves overbright PBR output in linear HDR render targets before tone mapping", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl }) => {
      const {
        ForwardPass,
        Geometry,
        PBRMaterial,
        RenderGraph,
        Renderer
      } = await import(renderingUrl);

      const width = 48;
      const height = 48;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0, 0, 0, 1],
        preserveDrawingBuffer: true
      });
      const target = renderer.device.createRenderTarget({ width, height, label: "root-hdr-forward-target", format: "rgba32f" });
      const geometry = Geometry.litTriangle();
      const material = new PBRMaterial({
        name: "root-overbright-pbr",
        baseColor: [1, 1, 1, 1],
        emissiveColor: [1, 0.88, 0.62],
        emissiveStrength: 2.4,
        roughness: 0.35
      });

      renderer.device.beginFrame(width, height);
      renderer.device.setRenderTarget(target);
      renderer.device.clear([0, 0, 0, 1]);
      const graph = new RenderGraph();
      graph.addPass(new ForwardPass({
        items: [{ geometry, material, label: "root-overbright-pbr" }],
        cameraPosition: [0, 0, 1],
        outputColorSpace: "linear"
      }));
      graph.execute({ device: renderer.device, width, height });
      const pixels = renderer.device.readFloatPixels(0, 0, width, height);
      renderer.device.endFrame();

      let maxR = 0;
      let maxG = 0;
      let overbrightPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] ?? 0;
        const g = pixels[index + 1] ?? 0;
        maxR = Math.max(maxR, r);
        maxG = Math.max(maxG, g);
        if (r > 1.01 || g > 1.01) overbrightPixels += 1;
      }

      target.dispose();
      renderer.dispose();
      geometry.dispose();
      canvas.remove();

      return {
        status: "ready",
        maxR,
        maxG,
        overbrightPixels
      };
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.maxR).toBeGreaterThan(1.5);
    expect(result.maxG).toBeGreaterThan(1.2);
    expect(result.overbrightPixels).toBeGreaterThan(100);
    writeRootQualityEvidence("hdrRenderTarget", result);
  });

  test("keeps renderer-owned shadow sampling stable across backing-buffer resize", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const {
        Geometry,
        PBRMaterial,
        Renderer,
        ShadowPass
      } = rendering;
      const { DirectionalLight, Scene } = sceneModule;

      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 192;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: 256,
        height: 192,
        clearColor: [0, 0, 0, 1],
        preserveDrawingBuffer: true
      });
      const scene = new Scene();
      const light = new DirectionalLight("root-shadow-stability-light");
      light.castsShadow = true;
      light.intensity = 1.35;
      scene.root.addChild(light);
      const material = new PBRMaterial({ baseColor: [0.74, 0.74, 0.72, 1], roughness: 0.82, environmentIntensity: 0 });
      const casterGeometry = Geometry.litTriangle();
      const receiverGeometry = Geometry.litTriangle();
      const lightMatrix = identityMatrix();
      const frames = [
        renderShadowFrame(128, 96, 96),
        renderShadowFrame(256, 192, 192)
      ];
      casterGeometry.dispose();
      receiverGeometry.dispose();
      renderer.dispose();
      canvas.remove();

      return {
        status: "ready",
        frames,
        dprShadowDarker: frames[0]?.shadowDeltaRgb > 60,
        resizedShadowDarker: frames[1]?.shadowDeltaRgb > 60,
        resizedDrawCallsStable: frames.every((frame) => frame.drawCalls === 2 && frame.lastError === null),
        scaledShadowMap: (frames[1]?.shadowSize ?? 0) > (frames[0]?.shadowSize ?? 0)
      };

      function renderShadowFrame(width: number, height: number, shadowSize: number) {
        renderer.resize(width, height);
        const shadowPass = new ShadowPass({
          light,
          casters: [{
            geometry: casterGeometry,
            material,
            modelMatrix: scaleTranslationMatrix(-0.38, -0.05, -0.46, 0.72, 0.72, 1),
            label: "root-shadow-stability-caster"
          }],
          viewProjectionMatrix: lightMatrix,
          size: shadowSize
        });
        renderer.device.beginFrame(width, height);
        const shadowResult = shadowPass.execute({ device: renderer.device, width, height });
        renderer.device.endFrame();
        const forwardShadowMap = shadowPass.getForwardShadowMap({
          lightMatrix,
          strength: 0.85,
          bias: 0,
          slopeBias: 0,
          texelSize: [1 / shadowSize, 1 / shadowSize]
        });
        if (!shadowResult.rendered || !forwardShadowMap) {
          throw new Error(`Root shadow stability setup failed: ${shadowResult.reason}`);
        }
        const diagnostics = renderer.render({
          scene,
          renderItems: [
            {
              geometry: receiverGeometry,
              material,
              modelMatrix: scaleTranslationMatrix(-0.38, -0.05, 0.18, 0.72, 0.72, 1),
              label: "root-shadow-stability-shadowed-receiver"
            },
            {
              geometry: receiverGeometry,
              material,
              modelMatrix: scaleTranslationMatrix(0.38, -0.05, 0.18, 0.72, 0.72, 1),
              label: "root-shadow-stability-lit-receiver"
            }
          ],
          shadowMap: forwardShadowMap
        });
        const shadowed = readRegionAverage(renderer.device.readPixels(Math.floor(width * 0.22), Math.floor(height * 0.34), Math.floor(width * 0.16), Math.floor(height * 0.22)));
        const lit = readRegionAverage(renderer.device.readPixels(Math.floor(width * 0.62), Math.floor(height * 0.34), Math.floor(width * 0.16), Math.floor(height * 0.22)));
        shadowPass.dispose();
        return {
          width,
          height,
          shadowSize,
          drawCalls: diagnostics.drawCalls,
          lastError: diagnostics.lastError,
          shadowed,
          lit,
          shadowDeltaRgb: lit.rgb - shadowed.rgb
        };
      }

      function readRegionAverage(pixels: Uint8Array) {
        let rgb = 0;
        let alphaPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] ?? 0;
          if (alpha > 0) {
            rgb += (pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0);
            alphaPixels += 1;
          }
        }
        return { rgb: rgb / Math.max(1, alphaPixels), alphaPixels };
      }

      function scaleTranslationMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number) {
        return new Float32Array([
          sx, 0, 0, 0,
          0, sy, 0, 0,
          0, 0, sz, 0,
          tx, ty, tz, 1
        ]);
      }

      function identityMatrix() {
        return new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ]);
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.dprShadowDarker, JSON.stringify(result)).toBe(true);
    expect(result.resizedShadowDarker, JSON.stringify(result)).toBe(true);
    expect(result.resizedDrawCallsStable, JSON.stringify(result)).toBe(true);
    expect(result.scaledShadowMap, JSON.stringify(result)).toBe(true);
    writeRootQualityEvidence("shadowResizeStability", result);
  });

  test("keeps textured PBR metallic and roughness scalar factors active when maps are omitted", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const {
        analyzeRgbaFrameVisualMetrics,
        Geometry,
        Renderer,
        TexturedPBRMaterial
      } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;

      const width = 160;
      const height = 120;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.01, 0.012, 0.018, 1],
        preserveDrawingBuffer: true
      });
      const geometry = Geometry.uvSphere(0.72, 48, 24, { textured: true });
      const geometryLibrary = new Map([["subject", geometry]]);
      const environmentLighting = {
        color: [0.12, 0.13, 0.15],
        intensity: 0.22,
        proceduralMap: {
          skyColor: [0.45, 0.58, 0.82],
          horizonColor: [0.95, 0.8, 0.54],
          groundColor: [0.08, 0.08, 0.09],
          specularColor: [1, 0.92, 0.72],
          intensity: 0.48,
          specularIntensity: 1.25
        }
      };

      const dielectric = renderSubject(new TexturedPBRMaterial({
        name: "root-textured-pbr-dielectric-no-mr-map",
        baseColor: [0.9, 0.78, 0.55, 1],
        metallic: 0,
        roughness: 0.24,
        environmentIntensity: 0.18
      }));
      const metallic = renderSubject(new TexturedPBRMaterial({
        name: "root-textured-pbr-metal-no-mr-map",
        baseColor: [0.9, 0.78, 0.55, 1],
        metallic: 1,
        roughness: 0.24,
        environmentIntensity: 0.18
      }));

      renderer.dispose();
      geometry.dispose();
      canvas.remove();

      return {
        status: "ready",
        dielectric,
        metallic,
        hashChanged: dielectric.hash !== metallic.hash,
        averageLumaDelta: Math.abs(dielectric.averageLuma - metallic.averageLuma),
        nonDarkPixelDelta: Math.abs(dielectric.nonDarkPixels - metallic.nonDarkPixels),
        colorBucketDelta: Math.abs(dielectric.colorBuckets - metallic.colorBuckets)
      };

      function renderSubject(material: typeof TexturedPBRMaterial.prototype) {
        const scene = new Scene();
        const light = scene.createLight("directional", `root-textured-pbr-light-${material.name}`);
        light.intensity = 1.35;
        light.transform.setRotation(...quatFromEuler(-0.62, 0.36, 0.08));
        scene.root.addChild(light);
        const node = scene.createNode(`root-textured-pbr-node-${material.name}`);
        scene.root.addChild(node);
        scene.addRenderable(node, new Renderable({ geometry: "subject", material: "subject" }));
        renderer.render({
          scene,
          geometryLibrary,
          materialLibrary: new Map([["subject", material]]),
          cameraPolicy: "auto-frame",
          cameraFrameOptions: { minDistance: 0.2, paddingRatio: 0 },
          environmentLighting,
          frustumCulling: false
        });
        return {
          ...pixelStats(renderer.device.readPixels(0, 0, width, height)),
          screenshotDataUrl: canvas.toDataURL("image/png")
        };
      }

      function pixelStats(pixels: Uint8Array) {
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index] ?? 0;
          const g = pixels[index + 1] ?? 0;
          const b = pixels[index + 2] ?? 0;
          hash ^= r + (g << 8) + (b << 16);
          hash = Math.imul(hash, 16777619);
        }
        return {
          ...analyzeRgbaFrameVisualMetrics(pixels, width, height),
          hash: String(hash >>> 0)
        };
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.dielectric.nonDarkPixels).toBeGreaterThan(3_500);
    expect(result.metallic.nonDarkPixels).toBeGreaterThan(3_500);
    expect(result.dielectric.salientRatio).toBeGreaterThan(0.18);
    expect(result.metallic.salientRatio).toBeGreaterThan(0.18);
    expect(result.dielectric.occupiedAreaRatio).toBeGreaterThan(0.23);
    expect(result.metallic.occupiedAreaRatio).toBeGreaterThan(0.23);
    expect(result.dielectric.occupiedQuadrants).toBe(4);
    expect(result.metallic.occupiedQuadrants).toBe(4);
    expect(result.dielectric.colorBuckets).toBeGreaterThan(8);
    expect(result.metallic.colorBuckets).toBeGreaterThan(8);
    expect(result.dielectric.dominantBucketRatio).toBeLessThan(0.82);
    expect(result.metallic.dominantBucketRatio).toBeLessThan(0.82);
    expect(result.dielectric.edgePixelRatio).toBeGreaterThan(0.012);
    expect(result.metallic.edgePixelRatio).toBeGreaterThan(0.012);
    expect(result.dielectric.averageLuma).toBeGreaterThan(24);
    expect(result.metallic.averageLuma).toBeGreaterThan(16);
    expect(result.hashChanged, JSON.stringify(result)).toBe(true);
    expect(result.averageLumaDelta, JSON.stringify(result)).toBeGreaterThan(5);
    expect(result.colorBucketDelta, JSON.stringify(result)).toBeGreaterThan(1);
    const dielectricScreenshotPath = writeRootQualityScreenshot("pbr-material-scalar-dielectric", result.dielectric.screenshotDataUrl);
    const metallicScreenshotPath = writeRootQualityScreenshot("pbr-material-scalar-metallic", result.metallic.screenshotDataUrl);
    const { screenshotDataUrl: _dielectricScreenshotDataUrl, ...dielectric } = result.dielectric;
    const { screenshotDataUrl: _metallicScreenshotDataUrl, ...metallic } = result.metallic;
    writeRootQualityEvidence("pbrMaterialScalarResponse", {
      ...result,
      dielectric,
      metallic,
      screenshotPaths: [dielectricScreenshotPath, metallicScreenshotPath]
    });
  });

  test("renders sampler-budgeted advanced textured PBR extension variants in the root WebGL path", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async ({ renderingUrl, sceneUrl }) => {
      const rendering = await import(renderingUrl);
      const sceneModule = await import(sceneUrl);
      const {
        analyzeRgbaFrameVisualMetrics,
        DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
        DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
        DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
        DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
        DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
        DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
        Geometry,
        Renderer,
        Texture,
        TexturedPBRMaterial
      } = rendering;
      const { Renderable, Scene, quatFromEuler } = sceneModule;

      const width = 160;
      const height = 120;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.append(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width,
        height,
        clearColor: [0.015, 0.016, 0.02, 1],
        preserveDrawingBuffer: true
      });
      const geometry = Geometry.uvSphere(0.7, 48, 24, { textured: true });
      const geometryLibrary = new Map([["subject", geometry]]);
      const environmentLighting = {
        color: [0.1, 0.11, 0.13],
        intensity: 0.2,
        proceduralMap: {
          skyColor: [0.45, 0.58, 0.82],
          horizonColor: [0.96, 0.75, 0.42],
          groundColor: [0.06, 0.06, 0.07],
          specularColor: [1, 0.92, 0.7],
          intensity: 0.5,
          specularIntensity: 1.1
        }
      };
      const variants = [
        {
          id: "clearcoat",
          expected: DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
          material: new TexturedPBRMaterial({
            name: "root-pbr-clearcoat-textures",
            baseColor: [0.8, 0.22, 0.14, 1],
            metallic: 0.05,
            roughness: 0.28,
            clearcoatFactor: 0.9,
            clearcoatTexture: linearTexture(Texture, [240, 255, 255, 255]),
            clearcoatRoughnessTexture: linearTexture(Texture, [255, 90, 255, 255]),
            clearcoatNormalTexture: normalTexture(Texture, 170, 96)
          })
        },
        {
          id: "transmission-volume",
          expected: DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
          material: new TexturedPBRMaterial({
            name: "root-pbr-transmission-volume-textures",
            baseColor: [0.45, 0.75, 0.92, 1],
            metallic: 0,
            roughness: 0.18,
            transmissionFactor: 0.72,
            transmissionTexture: linearTexture(Texture, [210, 255, 255, 255]),
            diffuseTransmissionFactor: 0.35,
            diffuseTransmissionTexture: linearTexture(Texture, [180, 255, 255, 255]),
            diffuseTransmissionColorFactor: [0.55, 0.9, 1],
            diffuseTransmissionColorTexture: srgbTexture(Texture, [110, 210, 255, 255]),
            volumeThicknessFactor: 0.55,
            volumeThicknessTexture: linearTexture(Texture, [255, 180, 255, 255]),
            volumeAttenuationDistance: 3,
            volumeAttenuationColor: [0.7, 0.9, 1]
          })
        },
        {
          id: "specular-sheen-anisotropy",
          expected: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
          material: new TexturedPBRMaterial({
            name: "root-pbr-specular-sheen-anisotropy-textures",
            baseColor: [0.5, 0.28, 0.72, 1],
            metallic: 0.2,
            roughness: 0.42,
            specularFactor: 0.82,
            specularTexture: linearTexture(Texture, [255, 255, 255, 210]),
            specularColorFactor: [0.95, 0.8, 1],
            specularColorTexture: srgbTexture(Texture, [230, 180, 255, 255]),
            sheenColorFactor: [0.8, 0.3, 1],
            sheenColorTexture: srgbTexture(Texture, [210, 90, 255, 255]),
            sheenRoughnessFactor: 0.28,
            sheenRoughnessTexture: linearTexture(Texture, [255, 255, 255, 180]),
            anisotropyStrength: 0.72,
            anisotropyTexture: linearTexture(Texture, [255, 255, 220, 255])
          })
        },
        {
          id: "iridescence",
          expected: DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
          material: new TexturedPBRMaterial({
            name: "root-pbr-iridescence-textures",
            baseColor: [0.42, 0.52, 0.84, 1],
            metallic: 0.05,
            roughness: 0.22,
            iridescenceFactor: 0.88,
            iridescenceTexture: linearTexture(Texture, [230, 255, 255, 255]),
            iridescenceIor: 1.45,
            iridescenceThicknessMinimum: 150,
            iridescenceThicknessMaximum: 650,
            iridescenceThicknessTexture: linearTexture(Texture, [255, 160, 255, 255])
          })
        },
        {
          id: "clearcoat-transmission-volume",
          expected: DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
          material: new TexturedPBRMaterial({
            name: "root-pbr-clearcoat-transmission-volume-textures",
            baseColor: [0.8, 0.62, 0.32, 1],
            metallic: 0.05,
            roughness: 0.2,
            clearcoatFactor: 0.7,
            clearcoatTexture: linearTexture(Texture, [220, 255, 255, 255]),
            clearcoatRoughnessTexture: linearTexture(Texture, [255, 110, 255, 255]),
            clearcoatNormalTexture: normalTexture(Texture, 92, 172),
            transmissionFactor: 0.38,
            transmissionTexture: linearTexture(Texture, [160, 255, 255, 255]),
            diffuseTransmissionFactor: 0.18,
            diffuseTransmissionTexture: linearTexture(Texture, [120, 255, 255, 255]),
            diffuseTransmissionColorTexture: srgbTexture(Texture, [255, 220, 120, 255]),
            volumeThicknessFactor: 0.35,
            volumeThicknessTexture: linearTexture(Texture, [255, 140, 255, 255]),
            volumeAttenuationDistance: 4,
            volumeAttenuationColor: [1, 0.82, 0.5]
          })
        },
        {
          id: "specular-sheen-anisotropy-iridescence",
          expected: DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
          material: new TexturedPBRMaterial({
            name: "root-pbr-specular-sheen-anisotropy-iridescence-textures",
            baseColor: [0.42, 0.34, 0.9, 1],
            metallic: 0.15,
            roughness: 0.34,
            specularFactor: 0.75,
            specularTexture: linearTexture(Texture, [255, 255, 255, 190]),
            specularColorTexture: srgbTexture(Texture, [160, 180, 255, 255]),
            sheenColorFactor: [0.55, 0.25, 1],
            sheenColorTexture: srgbTexture(Texture, [180, 80, 255, 255]),
            sheenRoughnessFactor: 0.22,
            sheenRoughnessTexture: linearTexture(Texture, [255, 255, 255, 140]),
            anisotropyStrength: 0.65,
            anisotropyTexture: linearTexture(Texture, [255, 255, 210, 255]),
            iridescenceFactor: 0.7,
            iridescenceTexture: linearTexture(Texture, [210, 255, 255, 255]),
            iridescenceIor: 1.4,
            iridescenceThicknessMinimum: 120,
            iridescenceThicknessMaximum: 520,
            iridescenceThicknessTexture: linearTexture(Texture, [255, 170, 255, 255])
          })
        }
      ];
      const results = variants.map((entry) => renderVariant(entry.id, entry.expected, entry.material));
      renderer.dispose();
      geometry.dispose();
      canvas.remove();
      return {
        status: "ready",
        results,
        uniqueHashes: new Set(results.map((entry) => entry.hash)).size,
        combinedVariantCount: results.filter((entry) => entry.id.includes("-")).length
      };

      function renderVariant(id: string, expected: string, material: InstanceType<typeof TexturedPBRMaterial>) {
        const scene = new Scene();
        const light = scene.createLight("directional", `root-pbr-variant-light-${id}`);
        light.intensity = 1.45;
        light.transform.setRotation(...quatFromEuler(-0.58, 0.42, 0.05));
        scene.root.addChild(light);
        const node = scene.createNode(`root-pbr-variant-node-${id}`);
        scene.root.addChild(node);
        scene.addRenderable(node, new Renderable({ geometry: "subject", material: "subject" }));
        const diagnostics = renderer.render({
          scene,
          geometryLibrary,
          materialLibrary: new Map([["subject", material]]),
          cameraPolicy: "auto-frame",
          cameraFrameOptions: { minDistance: 0.2, paddingRatio: 0 },
          environmentLighting,
          frustumCulling: false
        });
        const stats = pixelStats(renderer.device.readPixels(0, 0, width, height));
        return {
          id,
          shaderVariant: material.shaderVariant,
          expected,
          variantMatched: material.shaderVariant === expected,
          drawCalls: diagnostics.drawCalls,
          lastError: diagnostics.lastError,
          ...stats,
          screenshotDataUrl: canvas.toDataURL("image/png")
        };
      }

      function linearTexture(TextureCtor: typeof Texture, rgba: readonly [number, number, number, number]) {
        return new TextureCtor({ width: 2, height: 2, colorSpace: "linear", data: tiled(rgba) });
      }

      function srgbTexture(TextureCtor: typeof Texture, rgba: readonly [number, number, number, number]) {
        return new TextureCtor({ width: 2, height: 2, colorSpace: "srgb", data: tiled(rgba) });
      }

      function normalTexture(TextureCtor: typeof Texture, x: number, y: number) {
        return new TextureCtor({ width: 2, height: 2, colorSpace: "linear", data: tiled([x, y, 255, 255]) });
      }

      function tiled(rgba: readonly [number, number, number, number]) {
        return new Uint8Array([...rgba, ...rgba, ...rgba, ...rgba]);
      }

      function pixelStats(pixels: Uint8Array) {
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index] ?? 0;
          const g = pixels[index + 1] ?? 0;
          const b = pixels[index + 2] ?? 0;
          hash ^= r + (g << 8) + (b << 16);
          hash = Math.imul(hash, 16777619);
        }
        return {
          ...analyzeRgbaFrameVisualMetrics(pixels, width, height),
          hash: String(hash >>> 0)
        };
      }
    }, {
      renderingUrl: `${server.origin}/packages/rendering/src/index.ts`,
      sceneUrl: `${server.origin}/packages/scene/src/index.ts`
    });

    expect(result.status).toBe("ready");
    expect(result.results).toHaveLength(6);
    expect(result.combinedVariantCount).toBeGreaterThanOrEqual(2);
    expect(result.uniqueHashes, JSON.stringify(result)).toBeGreaterThanOrEqual(4);
    for (const entry of result.results as PbrVariantFrame[]) {
      expect(entry.variantMatched, JSON.stringify(entry)).toBe(true);
      expect(entry.drawCalls).toBe(1);
      expect(entry.lastError).toBeNull();
      expect(entry.nonDarkPixels, JSON.stringify(entry)).toBeGreaterThan(3_500);
      expect(entry.salientRatio, JSON.stringify(entry)).toBeGreaterThan(0.18);
      expect(entry.occupiedAreaRatio, JSON.stringify(entry)).toBeGreaterThan(0.23);
      expect(entry.occupiedQuadrants, JSON.stringify(entry)).toBe(4);
      expect(entry.colorBuckets, JSON.stringify(entry)).toBeGreaterThan(6);
      expect(entry.dominantBucketRatio, JSON.stringify(entry)).toBeLessThan(0.82);
      expect(entry.edgePixelRatio, JSON.stringify(entry)).toBeGreaterThan(0.012);
      expect(entry.averageLuma, JSON.stringify(entry)).toBeGreaterThan(20);
      expect(entry.maxLuma, JSON.stringify(entry)).toBeGreaterThan(40);
    }
    const cleanedResults = (result.results as PbrVariantFrame[]).map((entry) => {
      const screenshotPath = writeRootQualityScreenshot(`advanced-textured-pbr-${entry.id}`, entry.screenshotDataUrl);
      const { screenshotDataUrl: _screenshotDataUrl, ...cleaned } = entry;
      return { ...cleaned, screenshotPath };
    });
    writeRootQualityEvidence("advancedTexturedPbrVariants", {
      ...result,
      results: cleanedResults,
      screenshotPaths: cleanedResults.map((entry) => entry.screenshotPath)
    });
  });
});

interface RootQualityFrame {
  readonly diagnostics: { readonly drawCalls: number; readonly lastError: string | null };
  readonly stats: {
    readonly nonDarkRatio: number;
    readonly salientRatio: number;
    readonly occupiedAreaRatio: number;
    readonly occupiedQuadrants: number;
    readonly colorBuckets: number;
    readonly dominantBucketRatio: number;
    readonly edgePixelRatio: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
  };
}

interface PbrVariantFrame {
  readonly id: string;
  readonly shaderVariant: string;
  readonly expected: string;
  readonly variantMatched: boolean;
  readonly drawCalls: number;
  readonly lastError: string | null;
  readonly nonDarkPixels: number;
  readonly salientRatio: number;
  readonly occupiedAreaRatio: number;
  readonly occupiedQuadrants: number;
  readonly colorBuckets: number;
  readonly dominantBucketRatio: number;
  readonly edgePixelRatio: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
  readonly hash: string;
  readonly screenshotDataUrl: string;
}

function writeRootQualityScreenshot(id: string, dataUrl: string): string {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error(`Root quality screenshot ${id} did not return a PNG data URL.`);
  mkdirSync(rootQualityScreenshotDir, { recursive: true });
  const relativePath = `tests/reports/v4-root-rendering-quality/${id}.png`;
  writeFileSync(join(process.cwd(), relativePath), Buffer.from(match[1]!, "base64"));
  return relativePath;
}

function writeRootQualityEvidence(section: string, value: unknown): void {
  mkdirSync(dirname(rootQualityReportPath), { recursive: true });
  const existing = existsSync(rootQualityReportPath)
    ? JSON.parse(readFileSync(rootQualityReportPath, "utf8")) as Record<string, unknown>
    : {};
  writeFileSync(rootQualityReportPath, `${JSON.stringify({
    ...existing,
    ok: true,
    updatedAt: new Date().toISOString(),
    [section]: value
  }, null, 2)}\n`);
}

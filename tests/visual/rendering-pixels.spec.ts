import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

test.describe("rendering visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("covers triangle, cube, PBR sphere, normal map, emissive material, scene morph target, GPU morph target, and local light pixels", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgl2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_RENDERING_TEST__?.status === "ready" || window.__GALILEO3D_RENDERING_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_RENDERING_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.canvasFrame).toMatchObject({ width: 64, height: 64 });
    expect(result?.diagnostics?.drawCalls).toBe(1);
    expect(result?.cubeDiagnostics?.drawCalls).toBe(1);
    expect(result?.pbrSphereDiagnostics?.drawCalls).toBe(1);
    expect(result?.normalMapDiagnostics?.drawCalls).toBe(1);
    expect(result?.morphSceneDiagnostics?.drawCalls).toBe(1);
    expect(result?.gpuMorphSceneDiagnostics?.drawCalls).toBe(1);
    expect(result?.emissiveDiagnostics?.drawCalls).toBe(1);
    expect(result?.localLightDiagnostics?.drawCalls).toBe(1);

    expect(isWarmTriangle(result?.centerPixel)).toBe(true);
    expect(isBlueCube(result?.cubePixel)).toBe(true);
    expect(isLitGold(result?.pbrSphereCenterPixel)).toBe(true);
    expect(isNormalMappedBlue(result?.normalMapPixel)).toBe(true);
    expect(isMorphMagenta(result?.morphScenePixel)).toBe(true);
    expect(isGpuMorphCyan(result?.gpuMorphScenePixel)).toBe(true);
    expect(isEmissiveGreen(result?.emissivePixel)).toBe(true);
    expect(isLocalLightTinted(result?.localLightPixel)).toBe(true);
    expect(isTexturedGreen(result?.texturedCubePixel)).toBe(true);
  });

  test("covers projected shadow contrast on a receiving plane", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/shadow-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_SHADOW_BROWSER_TEST__?.status === "ready" || window.__GALILEO3D_SHADOW_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_SHADOW_BROWSER_TEST__);
    const shadow = rgbSum(result?.shadowPixel);
    const plane = rgbSum(result?.planePixel);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.canvasFrame).toMatchObject({ width: 160, height: 120 });
    expect(result?.shadowRendered).toBe(true);
    expect(result?.polygonPointCount).toBeGreaterThanOrEqual(4);
    expect(shadow).toBeLessThan(plane - 120);
  });

  test("covers tone-mapping post-process pixels in a browser canvas", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { toneMapPixels } = await import(moduleUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 1;
      document.body.appendChild(canvas);
      const context = canvas.getContext("2d");
      if (!context) return { status: "error", error: "2D context unavailable" };
      const mapped = toneMapPixels(new Uint8Array([255, 64, 0, 255, 128, 128, 128, 255]), 2, 1, {
        exposure: 2,
        gamma: 1,
        operator: "reinhard"
      });
      context.putImageData(new ImageData(new Uint8ClampedArray(mapped.pixels), mapped.width, mapped.height), 0, 0);
      return {
        status: "ready",
        firstPixel: Array.from(context.getImageData(0, 0, 1, 1).data),
        secondPixel: Array.from(context.getImageData(1, 0, 1, 1).data),
        canvasFrame: { width: canvas.width, height: canvas.height }
      };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    expect(result.canvasFrame).toEqual({ width: 2, height: 1 });
    expect(result.firstPixel).toEqual([170, 85, 0, 255]);
    expect(result.secondPixel?.[0]).toBeGreaterThan(120);
    expect(result.secondPixel?.[0]).toBeLessThan(150);
    expect(result.secondPixel?.[3]).toBe(255);
  });

  test("covers bloom post-process diffusion pixels in a browser canvas", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { bloomPixels } = await import(moduleUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 3;
      canvas.height = 1;
      document.body.appendChild(canvas);
      const context = canvas.getContext("2d");
      if (!context) return { status: "error", error: "2D context unavailable" };
      const bloomed = bloomPixels(new Uint8Array([
        0, 0, 0, 255,
        255, 255, 255, 255,
        0, 0, 0, 255
      ]), 3, 1, { threshold: 0.9, intensity: 1, radius: 1 });
      context.putImageData(new ImageData(new Uint8ClampedArray(bloomed.pixels), bloomed.width, bloomed.height), 0, 0);
      return {
        status: "ready",
        leftPixel: Array.from(context.getImageData(0, 0, 1, 1).data),
        centerPixel: Array.from(context.getImageData(1, 0, 1, 1).data),
        rightPixel: Array.from(context.getImageData(2, 0, 1, 1).data),
        brightCenterAlpha: bloomed.brightPixels[7],
        canvasFrame: { width: canvas.width, height: canvas.height }
      };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    expect(result.canvasFrame).toEqual({ width: 3, height: 1 });
    expect(result.leftPixel).toEqual([85, 85, 85, 255]);
    expect(result.centerPixel).toEqual([255, 255, 255, 255]);
    expect(result.rightPixel).toEqual([85, 85, 85, 255]);
    expect(result.brightCenterAlpha).toBe(255);
  });

  test("covers FXAA post-process edge smoothing pixels in a browser canvas", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { fxaaPixels } = await import(moduleUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 3;
      canvas.height = 1;
      document.body.appendChild(canvas);
      const context = canvas.getContext("2d");
      if (!context) return { status: "error", error: "2D context unavailable" };
      const smoothed = fxaaPixels(new Uint8Array([
        0, 0, 0, 255,
        255, 255, 255, 255,
        0, 0, 0, 255
      ]), 3, 1, { edgeThreshold: 0.1, subpixelBlend: 1 });
      context.putImageData(new ImageData(new Uint8ClampedArray(smoothed.pixels), smoothed.width, smoothed.height), 0, 0);
      return {
        status: "ready",
        leftPixel: Array.from(context.getImageData(0, 0, 1, 1).data),
        centerPixel: Array.from(context.getImageData(1, 0, 1, 1).data),
        rightPixel: Array.from(context.getImageData(2, 0, 1, 1).data),
        edgeMask: Array.from(smoothed.edgeMask),
        canvasFrame: { width: canvas.width, height: canvas.height }
      };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.status, result.status === "error" ? result.error : undefined).toBe("ready");
    expect(result.canvasFrame).toEqual({ width: 3, height: 1 });
    expect(result.leftPixel).toEqual([64, 64, 64, 255]);
    expect(result.centerPixel).toEqual([128, 128, 128, 255]);
    expect(result.rightPixel).toEqual([64, 64, 64, 255]);
    expect(result.edgeMask).toEqual([255, 255, 255]);
  });

  test("covers WebGL2 renderer resize with updated backing buffer and viewport pixels", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (moduleUrl) => {
      const { Geometry, Renderer, UnlitMaterial } = await import(moduleUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      document.body.appendChild(canvas);
      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: 24,
        height: 24,
        clearColor: [0, 0, 0, 1],
        antialias: false
      });
      const item = {
        geometry: Geometry.triangle(),
        material: new UnlitMaterial({ color: [1, 0.06, 0.02, 1] }),
        label: "resize-triangle"
      };
      renderer.render([item]);
      const initialPixel = Array.from(renderer.device.readPixels(12, 12, 1, 1));
      const initialFrame = {
        width: canvas.width,
        height: canvas.height,
        drawingBufferWidth: renderer.device.captureState().get("viewportWidth"),
        drawingBufferHeight: renderer.device.captureState().get("viewportHeight")
      };

      renderer.resize(48, 32);
      renderer.render([item]);
      const resizedPixel = Array.from(renderer.device.readPixels(24, 16, 1, 1));
      const resizedState = renderer.device.captureState();
      const resizedFrame = {
        width: canvas.width,
        height: canvas.height,
        drawingBufferWidth: resizedState.get("viewportWidth"),
        drawingBufferHeight: resizedState.get("viewportHeight")
      };
      const diagnostics = renderer.getDiagnostics();
      renderer.dispose();

      return { status: "ready", initialPixel, resizedPixel, initialFrame, resizedFrame, diagnostics };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.status).toBe("ready");
    expect(result.initialFrame).toEqual({ width: 24, height: 24, drawingBufferWidth: 24, drawingBufferHeight: 24 });
    expect(result.resizedFrame).toEqual({ width: 48, height: 32, drawingBufferWidth: 48, drawingBufferHeight: 32 });
    expect(result.diagnostics.drawCalls).toBe(1);
    expect(isWarmTriangle(result.initialPixel as readonly number[])).toBe(true);
    expect(isWarmTriangle(result.resizedPixel as readonly number[])).toBe(true);
  });
});

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function rgbSum(pixel: readonly number[] | undefined): number {
  return channel(pixel, 0) + channel(pixel, 1) + channel(pixel, 2);
}

function isWarmTriangle(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 160 && channel(pixel, 1) < 80 && channel(pixel, 2) < 60 && channel(pixel, 3) === 255;
}

function isBlueCube(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 2) > 130 && channel(pixel, 0) < 80 && channel(pixel, 3) === 255;
}

function isLitGold(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 90 && channel(pixel, 1) > 55 && channel(pixel, 2) > 20 && channel(pixel, 3) === 255;
}

function isNormalMappedBlue(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 2) > channel(pixel, 0) && channel(pixel, 2) > channel(pixel, 1) && channel(pixel, 3) === 255;
}

function isMorphMagenta(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 150 && channel(pixel, 1) < 80 && channel(pixel, 2) > 120 && channel(pixel, 3) === 255;
}

function isGpuMorphCyan(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) < 80 && channel(pixel, 1) > 150 && channel(pixel, 2) > 120 && channel(pixel, 3) === 255;
}

function isEmissiveGreen(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > channel(pixel, 0) + 60 && channel(pixel, 1) > channel(pixel, 2) + 30 && channel(pixel, 3) === 255;
}

function isLocalLightTinted(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 30 && channel(pixel, 1) > 30 && channel(pixel, 2) > 30 && channel(pixel, 3) === 255;
}

function isTexturedGreen(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > channel(pixel, 0) + 80 && channel(pixel, 1) > channel(pixel, 2) + 60 && channel(pixel, 3) === 255;
}

declare global {
  interface Window {
    __GALILEO3D_RENDERING_TEST__?: {
      readonly status: "ready" | "error";
      readonly diagnostics?: { readonly drawCalls: number };
      readonly cubeDiagnostics?: { readonly drawCalls: number };
      readonly pbrSphereDiagnostics?: { readonly drawCalls: number };
      readonly normalMapDiagnostics?: { readonly drawCalls: number };
      readonly morphSceneDiagnostics?: { readonly drawCalls: number };
      readonly gpuMorphSceneDiagnostics?: { readonly drawCalls: number };
      readonly emissiveDiagnostics?: { readonly drawCalls: number };
      readonly localLightDiagnostics?: { readonly drawCalls: number };
      readonly centerPixel?: readonly number[];
      readonly cubePixel?: readonly number[];
      readonly pbrSphereCenterPixel?: readonly number[];
      readonly normalMapPixel?: readonly number[];
      readonly morphScenePixel?: readonly number[];
      readonly gpuMorphScenePixel?: readonly number[];
      readonly emissivePixel?: readonly number[];
      readonly localLightPixel?: readonly number[];
      readonly texturedCubePixel?: readonly number[];
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly error?: string;
    };
    __GALILEO3D_SHADOW_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly shadowRendered?: boolean;
      readonly polygonPointCount?: number;
      readonly shadowPixel?: readonly number[];
      readonly planePixel?: readonly number[];
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly error?: string;
    };
  }
}

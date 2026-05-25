import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 same-scene Three.js parity", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders 12 real GLB scenes through G3D and Three.js with diff metrics", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/browser/production-runtime-threejs-parity.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_THREEJS_PARITY__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 120_000 }
      );
    } catch (error) {
      throw new Error(`V6 Three.js parity harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_THREEJS_PARITY__) as {
      status: "ready" | "error";
      error?: string;
      sceneCount?: number;
      results?: {
        id: string;
        category: string;
        assetId: string;
        g3d: { drawCalls: number; nonBlackPixels: number; uniqueColorBuckets: number; pass: boolean };
        threejs: { drawCalls: number; triangles: number; geometries: number; textures: number; nonBlackPixels: number; uniqueColorBuckets: number };
        diff: { meanDelta: number; maxDelta: number; changedPixels: number; structuralSimilarityProxy: number; pass: boolean };
      }[];
    };
    expect(result.status, result.error).toBe("ready");
    expect(result.sceneCount).toBeGreaterThanOrEqual(12);
    const categories = new Set((result.results ?? []).map((item) => item.category));
    for (const required of ["product", "materials", "asset", "architecture"]) {
      expect(categories.has(required), `missing category ${required}`).toBe(true);
    }
    for (const scene of result.results ?? []) {
      expect(scene.g3d.pass, `${scene.id} G3D proof`).toBe(true);
      expect(scene.g3d.drawCalls).toBeGreaterThan(0);
      expect(scene.g3d.nonBlackPixels).toBeGreaterThan(1000);
      expect(scene.g3d.uniqueColorBuckets, `${scene.id} G3D color buckets`).toBeGreaterThanOrEqual(50);
      expect(scene.threejs.drawCalls, `${scene.id} Three.js draw calls`).toBeGreaterThan(0);
      expect(scene.threejs.nonBlackPixels, `${scene.id} Three.js nonblack pixels`).toBeGreaterThan(1000);
      expect(scene.threejs.uniqueColorBuckets, `${scene.id} Three.js color buckets`).toBeGreaterThanOrEqual(50);
      expect(scene.diff.pass, `${scene.id} diff ${JSON.stringify(scene.diff)}`).toBe(true);
      expect(scene.diff.meanDelta).toBeGreaterThanOrEqual(0);
      expect(scene.diff.structuralSimilarityProxy, `${scene.id} structural similarity`).toBeGreaterThanOrEqual(0.75);
      expect(scene.diff.maxDelta).toBeGreaterThanOrEqual(scene.diff.meanDelta);
    }

    mkdirSync(resolve("tests/reports/production-runtime-threejs-parity"), { recursive: true });
    mkdirSync(resolve("tests/reports/production-runtime-gallery/threejs-comparison"), { recursive: true });
    for (const scene of result.results ?? []) {
      await saveCanvasPng(page, `${scene.id}-g3d`, `tests/reports/production-runtime-threejs-parity/${scene.id}-g3d.png`);
      await saveCanvasPng(page, `${scene.id}-threejs`, `tests/reports/production-runtime-threejs-parity/${scene.id}-threejs.png`);
      await saveCanvasPng(page, `${scene.id}-diff`, `tests/reports/production-runtime-threejs-parity/${scene.id}-diff.png`);
    }
    const galleryPairs = [
      { sceneId: "product-helmet", galleryId: "product" },
      { sceneId: "materials-clearcoat", galleryId: "materials" },
      { sceneId: "asset-duck", galleryId: "asset" },
      { sceneId: "architecture-camera", galleryId: "architecture" }
    ] as const;
    for (const item of galleryPairs) {
      await saveCanvasPng(page, `${item.sceneId}-g3d`, `tests/reports/production-runtime-gallery/threejs-comparison/${item.galleryId}-g3d.png`);
      await saveCanvasPng(page, `${item.sceneId}-threejs`, `tests/reports/production-runtime-gallery/threejs-comparison/${item.galleryId}-threejs.png`);
      await saveCanvasPng(page, `${item.sceneId}-diff`, `tests/reports/production-runtime-gallery/threejs-comparison/${item.galleryId}-diff.png`);
    }
    writeFileSync(resolve("tests/reports/production-runtime-threejs-parity/browser-report.json"), `${JSON.stringify({
      schema: "g3d-production-runtime-threejs-parity-browser/v1",
      generatedAt: new Date().toISOString(),
      screenshots: (result.results ?? []).flatMap((scene) => [
        `tests/reports/production-runtime-threejs-parity/${scene.id}-g3d.png`,
        `tests/reports/production-runtime-threejs-parity/${scene.id}-threejs.png`,
        `tests/reports/production-runtime-threejs-parity/${scene.id}-diff.png`
      ]),
      ...result
    }, null, 2)}\n`);
  });
});

async function saveCanvasPng(page: Page, canvasId: string, path: string): Promise<void> {
  const dataUrl = await page.evaluate((id) => {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`Missing canvas ${id}`);
    }
    if (canvas.dataset.captureDataUrl) return canvas.dataset.captureDataUrl;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return canvas.toDataURL("image/png");
    gl.finish();
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) throw new Error(`Unable to create 2D screenshot context for ${id}`);
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const sourceRow = height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = (sourceRow * width + x) * 4;
        const targetOffset = (y * width + x) * 4;
        image.data[targetOffset] = pixels[sourceOffset] ?? 0;
        image.data[targetOffset + 1] = pixels[sourceOffset + 1] ?? 0;
        image.data[targetOffset + 2] = pixels[sourceOffset + 2] ?? 0;
        image.data[targetOffset + 3] = pixels[sourceOffset + 3] ?? 255;
      }
    }
    context.putImageData(image, 0, 0);
    return output.toDataURL("image/png");
  }, canvasId);
  const encoded = dataUrl.replace(/^data:image\/png;base64,/, "");
  writeFileSync(resolve(path), Buffer.from(encoded, "base64"));
}

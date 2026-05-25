import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/foundation-assets");
const captures: AssetRenderCapture[] = [];

test.describe("V3 asset rendering", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "g3d-foundation-assets-browser/v1",
      generatedAt: new Date().toISOString(),
      captures,
      pass: captures.length >= 3 && captures.every((capture) => capture.bytes > 10_000 && capture.lastError === null)
    }, null, 2)}\n`);
  });

  test("loads and renders real V3 asset fixtures through public APIs", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    for (const fixture of [
      { id: "product-camera", path: "/fixtures/v3/assets/product-camera/product-camera.gltf" },
      { id: "material-spheres", path: "/fixtures/v3/assets/material-spheres/material-spheres.gltf" },
      { id: "product-camera-external", path: "/fixtures/v3/assets/product-camera/product-camera-external.gltf" }
    ]) {
      const result = await renderAsset(page, server.origin, fixture);
      const screenshot = join(reportDir, `${fixture.id}.png`);
      await page.locator(`[data-testid='${fixture.id}-canvas']`).screenshot({ path: screenshot });
      const bytes = statSync(screenshot).size;
      expect(bytes).toBeGreaterThan(10_000);
      expect(result.diagnostics.lastError).toBeNull();
      expect(result.diagnostics.drawCalls).toBeGreaterThan(5);
      expect(result.meshCount).toBeGreaterThan(0);
      expect(result.materialCount).toBeGreaterThan(0);
      captures.push({
        id: fixture.id,
        path: relativeReportPath(screenshot),
        bytes,
        hash: result.hash,
        meshCount: result.meshCount,
        materialCount: result.materialCount,
        textureCount: result.textureCount,
        drawCalls: result.diagnostics.drawCalls,
        lastError: result.diagnostics.lastError
      });
    }
  });
});

async function renderAsset(page: import("@playwright/test").Page, origin: string, fixture: { readonly id: string; readonly path: string }): Promise<AssetRenderResult> {
  return page.evaluate(async ({ origin, fixture }) => {
    const rendering = await import(`${origin}/packages/rendering/src/index.ts`);
    const assets = await import(`${origin}/packages/assets/src/index.ts`);
    const { Renderer } = rendering;
    const { loadRenderableAsset, createRenderableScene } = assets;
    const width = 900;
    const height = 620;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.dataset.testid = `${fixture.id}-canvas`;
    document.body.replaceChildren(canvas);
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width,
      height,
      clearColor: [0.025, 0.028, 0.03, 1],
      preserveDrawingBuffer: true
    });
    const asset = await loadRenderableAsset(`${origin}${fixture.path}`);
    const scene = await createRenderableScene(asset, {
      camera: "auto-frame",
      lighting: "studioProduct",
      shadows: true,
      postprocess: "product-default"
    });
    const frame = renderer.captureFrame(scene.source, scene.rendererInput?.camera);
    const hash = hashRgba8(frame.pixels);
    const result = {
      diagnostics: frame.diagnostics,
      hash,
      meshCount: asset.gltf?.loaderDiagnostics.meshCount ?? 0,
      materialCount: asset.gltf?.loaderDiagnostics.materialCount ?? 0,
      textureCount: asset.gltf?.loaderDiagnostics.textureCount ?? 0
    };
    scene.dispose();
    renderer.dispose();
    return result;

    function hashRgba8(data: Uint8Array): string {
      let hash = 0x811c9dc5;
      for (const value of data) {
        hash ^= value;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    }
  }, { origin, fixture });
}

function relativeReportPath(path: string): string {
  return path.replace(`${process.cwd()}/`, "");
}

interface AssetRenderResult {
  readonly diagnostics: {
    readonly drawCalls: number;
    readonly lastError: string | null;
  };
  readonly hash: string;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
}

interface AssetRenderCapture extends AssetRenderResult {
  readonly id: string;
  readonly path: string;
  readonly bytes: number;
  readonly drawCalls: number;
  readonly lastError: string | null;
}

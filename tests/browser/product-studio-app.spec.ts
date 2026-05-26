import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/product-studio");
const captures: Array<{ readonly id: string; readonly path: string; readonly bytes: number; readonly hash: string }> = [];

test.describe("V2 Product Studio app", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "a3d-v2-product-studio-browser-report/v1",
      generatedAt: new Date().toISOString(),
      app: "apps/product-studio/index.html",
      rejectedInputs: [
        "tests/reports/legacy-product-viewer/product-viewer.png",
        "tests/reports/legacy-material-studio/material-studio.png",
        "tests/reports/legacy-asset-viewer/asset-viewer.png",
        "tests/reports/legacy-rendering-showcase/rendering-showcase.png"
      ],
      captures
    }, null, 2)}\n`);
  });

  test("loads all generated products and captures Product Studio states", async ({ page }) => {
    await page.goto(`${server.origin}/apps/product-studio/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.__A3D_PRODUCT_STUDIO__?.status)).toBe("ready");

    for (const product of ["camera-kit", "speaker", "watch"] as const) {
      await page.evaluate(async (id) => window.__A3D_PRODUCT_STUDIO__?.reloadProduct?.(id), product);
      await expect.poll(() => page.evaluate(() => window.__A3D_PRODUCT_STUDIO__?.status)).toBe("ready");
      const state = await page.evaluate(() => ({
        product: window.__A3D_PRODUCT_STUDIO__?.selectedProductId,
        parts: window.__A3D_PRODUCT_STUDIO__?.diagnostics?.partCount,
        materials: window.__A3D_PRODUCT_STUDIO__?.diagnostics?.materialCount,
        textures: window.__A3D_PRODUCT_STUDIO__?.diagnostics?.textureCount,
        warnings: window.__A3D_PRODUCT_STUDIO__?.diagnostics?.warnings,
        lastError: window.__A3D_PRODUCT_STUDIO__?.diagnostics?.renderDiagnostics?.lastError
      }));
      expect(state.product).toBe(product);
      expect(state.parts).toBeGreaterThanOrEqual(8);
      expect(state.materials).toBeGreaterThanOrEqual(3);
      expect(state.textures).toBeGreaterThanOrEqual(12);
      expect(state.warnings).toEqual([]);
      expect(state.lastError).toBeNull();
      await capture(page, `${product}-asset`);
    }

    await page.evaluate(async () => window.__A3D_PRODUCT_STUDIO__?.setMaterialMode?.("contrast"));
    await capture(page, "watch-contrast-materials");
    await page.evaluate(async () => window.__A3D_PRODUCT_STUDIO__?.setLighting?.("hero-contrast"));
    await capture(page, "watch-hero-lighting");
    await page.evaluate(async () => window.__A3D_PRODUCT_STUDIO__?.setCamera?.("macro-detail"));
    await capture(page, "watch-macro-camera");

    const exported = await page.evaluate(async () => {
      const result = await window.__A3D_PRODUCT_STUDIO__?.exportPng?.();
      return result ? {
        byteLength: result.byteLength,
        mimeType: result.mimeType,
        assetId: result.manifest.assetId,
        materialMode: result.manifest.materialMode
      } : undefined;
    });
    expect(exported?.mimeType).toBe("image/png");
    expect(exported?.byteLength).toBeGreaterThan(10_000);
    expect(exported?.assetId).toBe("watch");
    expect(exported?.materialMode).toBe("contrast");
  });
});

async function capture(page: import("@playwright/test").Page, id: string): Promise<void> {
  const path = join(reportDir, `${id}.png`);
  mkdirSync(dirname(path), { recursive: true });
  const bytes = await page.locator("[data-testid='product-studio-canvas']").screenshot({ path });
  expect(statSync(path).size).toBeGreaterThan(10_000);
  captures.push({ id, path: relativeReportPath(path), bytes: statSync(path).size, hash: hashBytes(bytes) });
}

function hashBytes(bytes: Buffer): string {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function relativeReportPath(path: string): string {
  return path.replace(`${process.cwd()}/`, "");
}

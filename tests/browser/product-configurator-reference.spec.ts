import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("Product configurator same-asset reference harness", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders original Product source GLBs outside the advanced gallery UI and reports material readiness", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.body.replaceChildren();
      document.body.style.margin = "0";
      document.body.style.background = "#05070a";
      void import("/tests/browser/product-configurator-reference-harness.js")
        .then((module) => module.runProductConfiguratorReferenceHarness());
    });

    try {
      await page.waitForFunction(
        () => {
          const report = window.__G3D_PRODUCT_REFERENCE__ as { status?: string } | undefined;
          return report?.status === "ready" || report?.status === "error";
        },
        undefined,
        { timeout: 75_000 }
      );
    } catch (error) {
      throw new Error(`Product reference harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const report = await page.evaluate(() => window.__G3D_PRODUCT_REFERENCE__) as ProductReferenceReport;

    expect(report.status, report.error).toBe("ready");
    expect(report.schema).toBe("g3d-product-configurator-reference-harness/v1");
    expect(report.claim).toBe("same-original-product-glb-reference-outside-advanced-gallery");
    expect(report.galleryUiBypassed).toBe(true);
    expect(report.renderer.backend).toBe("webgl2");
    expect(report.renderer.mockDevice).toBe(false);
    expect(report.renderer.canvas2dProof).toBe(false);
    expect(report.renderer.fixedCameraPreset).toBe("product-hero");
    expect(report.renderer.fixedLighting).toBe("studio-small-08-hdr-plus-product-directional");
    expect(report.dpr.viewportCssPixels).toEqual({ width: 640, height: 480 });

    expect(report.summary.originalAssetIds).toEqual([
      "car-concept",
      "chronograph-watch",
      "materials-variants-shoe",
      "sunglasses-khronos"
    ]);
    expect(report.summary.allOriginalAssetUrlsLoaded).toBe(true);
    expect(report.summary.allAssetsRendered).toBe(true);
    expect(report.summary.allAssetsMaterialBacked).toBe(true);
    expect(report.summary.allAssetsTextureBacked).toBe(true);
    expect(report.summary.allAssetsReadyForCapture).toBe(true);
    expect(report.summary.totalMaterials).toBeGreaterThan(0);
    expect(report.summary.totalTextures).toBeGreaterThanOrEqual(4);
    expect(report.summary.totalDrawCalls).toBeGreaterThanOrEqual(report.assets.length);
    expect(report.summary.totalNonBlackPixels).toBeGreaterThan(4000);

    const byId = new Map(report.assets.map((asset) => [asset.id, asset]));
    for (const id of report.summary.originalAssetIds) {
      const asset = byId.get(id);
      expect(asset, `${id} report`).toBeDefined();
      expect(asset?.sourceOfTruth, `${id} source`).toBe("advanced-gallery-original-product-asset");
      expect(asset?.url, `${id} original URL`).toMatch(/^\/fixtures\/v8\/assets\/(?:product|vehicles)\/.+\.glb$/);
      expect(asset?.loaded, `${id} loaded`).toBe(true);
      expect(asset?.rendered, `${id} rendered`).toBe(true);
      expect(asset?.captureReady, `${id} capture ready`).toBe(true);
      expect(asset?.diagnostics.materialCount ?? 0, `${id} material count`).toBeGreaterThan(0);
      expect(asset?.diagnostics.textureCount ?? 0, `${id} texture count`).toBeGreaterThan(0);
      expect(asset?.diagnostics.drawCalls ?? 0, `${id} draw calls`).toBeGreaterThan(0);
      expect(asset?.diagnostics.lastError, `${id} renderer error`).toBeNull();
      expect(asset?.pixels.nonBlackPixels ?? 0, `${id} visible pixels`).toBeGreaterThan(1000);
      expect(asset?.pixels.uniqueColorBuckets ?? 0, `${id} color variety`).toBeGreaterThan(8);
      expect(asset?.materials.length ?? 0, `${id} material report`).toBe(asset?.diagnostics.materialCount);
      expect((asset?.textureSlots.length ?? 0) + (asset?.materialFeatures.length ?? 0), `${id} material/texture feature diagnostics`).toBeGreaterThan(0);
    }

    expect(byId.get("car-concept")?.extensions.used ?? [], "car-concept material variants extension").toContain("KHR_materials_variants");
    expect(byId.get("chronograph-watch")?.extensions.used ?? [], "watch material variants extension").toContain("KHR_materials_variants");
    expect(byId.get("materials-variants-shoe")?.extensions.used ?? [], "shoe material variants extension").toContain("KHR_materials_variants");
    expect(byId.get("sunglasses-khronos")?.extensions.used.length ?? 0, "sunglasses extension/material state").toBeGreaterThan(0);
    expect(report.summary.materialVariants.some((entry) => entry.assetId === "car-concept" && entry.variants.length > 0)).toBe(true);
    expect(report.summary.materialVariants.some((entry) => entry.assetId === "chronograph-watch" && entry.variants.length > 0)).toBe(true);
    expect(report.summary.materialVariants.some((entry) => entry.assetId === "materials-variants-shoe" && entry.variants.length > 0)).toBe(true);
  });
});

interface ProductReferenceReport {
  readonly schema: "g3d-product-configurator-reference-harness/v1";
  readonly status: "ready" | "error";
  readonly claim: string;
  readonly galleryUiBypassed: boolean;
  readonly dpr: {
    readonly viewportCssPixels: { readonly width: number; readonly height: number };
  };
  readonly renderer: {
    readonly backend: "webgl2" | "webgpu";
    readonly mockDevice?: boolean;
    readonly canvas2dProof?: boolean;
    readonly fixedCameraPreset: string;
    readonly fixedLighting: string;
  };
  readonly assets: readonly ProductReferenceAssetReport[];
  readonly summary: {
    readonly originalAssetIds: readonly string[];
    readonly allOriginalAssetUrlsLoaded: boolean;
    readonly allAssetsRendered: boolean;
    readonly allAssetsMaterialBacked: boolean;
    readonly allAssetsTextureBacked: boolean;
    readonly allAssetsReadyForCapture: boolean;
    readonly totalMaterials: number;
    readonly totalTextures: number;
    readonly totalDrawCalls: number;
    readonly totalNonBlackPixels: number;
    readonly materialVariants: readonly { readonly assetId: string; readonly variants: readonly string[] }[];
  };
  readonly error?: string;
}

interface ProductReferenceAssetReport {
  readonly id: string;
  readonly url: string;
  readonly sourceOfTruth: string;
  readonly loaded: boolean;
  readonly rendered: boolean;
  readonly captureReady: boolean;
  readonly diagnostics: {
    readonly materialCount: number;
    readonly textureCount: number;
    readonly drawCalls: number;
    readonly lastError: string | null;
  };
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
  };
  readonly extensions: {
    readonly used: readonly string[];
  };
  readonly materials: readonly unknown[];
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
}

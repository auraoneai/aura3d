import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("Product configurator same-asset reference harness", () => {
  test.setTimeout(180_000);

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
      window.__G3D_PRODUCT_REFERENCE_PROGRESS__ = ["spec:import:start"];
      void import("/tests/browser/product-configurator-reference-harness.js")
        .then((module) => {
          window.__G3D_PRODUCT_REFERENCE_PROGRESS__ = [...(window.__G3D_PRODUCT_REFERENCE_PROGRESS__ ?? []), "spec:import:done"];
          return module.runProductConfiguratorReferenceHarness();
        })
        .catch((error) => {
          window.__G3D_PRODUCT_REFERENCE_PROGRESS__ = [...(window.__G3D_PRODUCT_REFERENCE_PROGRESS__ ?? []), `spec:import:error:${error instanceof Error ? error.message : String(error)}`];
          window.__G3D_PRODUCT_REFERENCE__ = {
            schema: "g3d-product-configurator-reference-harness/v1",
            status: "error",
            claim: "same-original-product-glb-reference-outside-advanced-gallery",
            galleryUiBypassed: true,
            dpr: { viewportCssPixels: { width: 640, height: 480 } },
            renderer: { backend: "webgl2", fixedCameraPreset: "product-hero", fixedLighting: "studio-small-08-hdr-plus-product-directional" },
            assets: [],
            summary: {
              originalAssetIds: [],
              allOriginalAssetUrlsLoaded: false,
              allAssetsRendered: false,
              allAssetsMaterialBacked: false,
              allAssetsTextureBacked: false,
              allAssetsReadyForCapture: false,
              totalMaterials: 0,
              totalTextures: 0,
              totalDrawCalls: 0,
              totalNonBlackPixels: 0,
              materialVariants: []
            },
            error: error instanceof Error ? error.stack ?? error.message : String(error)
          } as ProductReferenceReport;
        });
    });

    try {
      await page.waitForFunction(
        () => {
          const report = window.__G3D_PRODUCT_REFERENCE__ as { status?: string } | undefined;
          return report?.status === "ready" || report?.status === "error";
        },
        undefined,
        { timeout: 150_000 }
      );
    } catch (error) {
      const progress = await page.evaluate(() => window.__G3D_PRODUCT_REFERENCE_PROGRESS__ ?? []);
      throw new Error(`Product reference harness did not report ready/error. Progress:\n${progress.join("\n") || "(none captured)"}\nPage errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
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
      expect(asset?.renderResources.drawItems ?? 0, `${id} render-resource draw items`).toBeGreaterThan(0);
      expect(asset?.renderResources.effectiveTextureBackedDrawItems ?? 0, `${id} effective texture-backed draw items`).toBeGreaterThan(0);
      expect(asset?.renderResources.fallbackWhiteDrawItems ?? 0, `${id} fallback-white render resources: ${(asset?.renderResources.fallbackWhiteLabels ?? []).join(", ")}`).toBe(0);
      expect(asset?.renderResources.missingGeometryDrawItems ?? 0, `${id} missing render-resource geometry`).toBe(0);
      expect(asset?.renderResources.missingMaterialDrawItems ?? 0, `${id} missing render-resource materials`).toBe(0);
      expect(asset?.renderResources.unsupportedTexCoordDrawItems ?? 0, `${id} unsupported TEXCOORD_2+ render fallback`).toBe(0);
      expect(asset?.renderResources.generatedTangentUvMismatchDrawItems ?? 0, `${id} generated tangent / UV mismatch fallback`).toBe(0);
      expect(Array.isArray(asset?.renderResources.materialFidelityDiagnostics), `${id} material fidelity diagnostics`).toBe(true);
      expect(asset?.pixels.nonBlackPixels ?? 0, `${id} visible pixels`).toBeGreaterThan(1000);
      expect(asset?.pixels.uniqueColorBuckets ?? 0, `${id} color variety`).toBeGreaterThan(8);
      expect(asset?.materials.length ?? 0, `${id} material report`).toBe(asset?.diagnostics.materialCount);
      expect(asset?.runtimeMaterials.length ?? 0, `${id} runtime material report`).toBeGreaterThan(0);
      expect((asset?.textureSlots.length ?? 0) + (asset?.materialFeatures.length ?? 0), `${id} material/texture feature diagnostics`).toBeGreaterThan(0);
    }

    expect(byId.get("car-concept")?.extensions.used ?? [], "car-concept material variants extension").toContain("KHR_materials_variants");
    expect(byId.get("chronograph-watch")?.extensions.used ?? [], "watch material variants extension").toContain("KHR_materials_variants");
    expect(byId.get("materials-variants-shoe")?.extensions.used ?? [], "shoe material variants extension").toContain("KHR_materials_variants");
    expect(byId.get("sunglasses-khronos")?.extensions.used.length ?? 0, "sunglasses extension/material state").toBeGreaterThan(0);
    expect(report.summary.materialVariants.some((entry) => entry.assetId === "car-concept" && entry.variants.length > 0)).toBe(true);
    expect(report.summary.materialVariants.some((entry) => entry.assetId === "chronograph-watch" && entry.variants.length > 0)).toBe(true);
    expect(report.summary.materialVariants.some((entry) => entry.assetId === "materials-variants-shoe" && entry.variants.length > 0)).toBe(true);

    const car = byId.get("car-concept");
    const carGlass = car?.runtimeMaterials.find((material) => material.name === "Glass");
    expect(carGlass, "car Glass runtime material").toBeDefined();
    expect(carGlass?.renderState.blend, "car glass must render as blended transmission material").toBe(true);
    expect(carGlass?.renderState.depthWrite, "car glass must not depth-write over the cabin/paint").toBe(false);
    expect(carGlass?.uniforms.transmissionFactor ?? 0, "car glass transmission uniform").toBeGreaterThan(0.99);
    expect(car?.carRegionAcceptance.map((entry) => entry.id).sort(), "car crop-region material proofs").toEqual([
      "contact-grounding",
      "front-bumper-paint",
      "hood-paint",
      "windshield-roof-glass"
    ]);
    const failedCarRegions = (car?.carRegionAcceptance ?? [])
      .filter((region) => !region.pass)
      .map((region) => ({
        id: region.id,
        kind: region.kind,
        pixels: region.pixels,
        thresholds: region.thresholds,
        screenRegion: region.screenRegion
      }));
    expect(failedCarRegions, `car crop-region failures: ${JSON.stringify(failedCarRegions)}`).toEqual([]);

    const materialAcceptance = report.assets.flatMap((asset) => asset.materialAcceptance.map((entry) => [asset.id, entry] as const));
    expect(materialAcceptance.map(([assetId, entry]) => `${assetId}:${entry.id}`).sort()).toEqual([
      "car-concept:car-carmine-paint",
      "car-concept:car-glass",
      "chronograph-watch:watch-glass-face",
      "sunglasses-khronos:sunglasses-lenses"
    ]);
    for (const [assetId, acceptance] of materialAcceptance) {
      expect(
        acceptance.pass,
        `${assetId} ${acceptance.id} failed material acceptance with pixels ${JSON.stringify(acceptance.pixels)} and runtime materials ${acceptance.runtimeMaterialNames.join(", ")}`
      ).toBe(true);
    }
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
  readonly runtimeMaterials: readonly ProductReferenceRuntimeMaterialReport[];
  readonly materialAcceptance: readonly ProductReferenceMaterialAcceptanceReport[];
  readonly carRegionAcceptance: readonly ProductReferenceCarRegionAcceptanceReport[];
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly renderResources: {
    readonly drawItems: number;
    readonly texturedDrawItems: number;
    readonly baseColorTextureDrawItems: number;
    readonly colorBearingTextureDrawItems: number;
    readonly surfaceDetailTextureDrawItems: number;
    readonly effectiveTextureBackedDrawItems: number;
    readonly unsupportedTexCoordDrawItems: number;
    readonly generatedTangentUvMismatchDrawItems: number;
    readonly fallbackWhiteDrawItems: number;
    readonly fallbackWhiteLabels: readonly string[];
    readonly fallbackWhiteMaterialNames: readonly string[];
    readonly missingGeometryDrawItems: number;
    readonly missingMaterialDrawItems: number;
    readonly materialFidelityDiagnostics: readonly unknown[];
  };
}

interface ProductReferenceRuntimeMaterialReport {
  readonly key: string;
  readonly name: string;
  readonly renderState: {
    readonly blend: boolean;
    readonly depthWrite: boolean;
    readonly cullMode: string;
  };
  readonly uniforms: {
    readonly metallic?: number;
    readonly roughness?: number;
    readonly normalScale?: number;
    readonly clearcoatFactor?: number;
    readonly clearcoatRoughnessFactor?: number;
    readonly transmissionFactor?: number;
    readonly transmissionFallbackEnergy?: number;
    readonly specularFactor?: number;
  };
}

interface ProductReferenceMaterialAcceptanceReport {
  readonly id: string;
  readonly kind: "paint" | "glass";
  readonly sourceMaterialNamePattern: string;
  readonly runtimeMaterialNames: readonly string[];
  readonly pass: boolean;
  readonly thresholds: Record<string, number>;
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
    readonly uniqueColorBuckets: number;
    readonly redPaintCoverage: number;
    readonly meanRedDominance: number;
    readonly isolatedHighlightRatio: number;
    readonly grayWhiteCoverage: number;
    readonly washedGrayWhiteRatio: number;
  };
}

interface ProductReferenceCarRegionAcceptanceReport {
  readonly id: "hood-paint" | "front-bumper-paint" | "windshield-roof-glass" | "contact-grounding";
  readonly kind: "paint" | "glass" | "grounding";
  readonly selection: "asset-relative-camera-proof";
  readonly screenRegion: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  readonly pass: boolean;
  readonly thresholds: Record<string, number>;
  readonly camera: unknown;
  readonly drawCalls: number;
  readonly lastError: string | null;
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
    readonly uniqueColorBuckets: number;
    readonly redPaintCoverage: number;
    readonly meanRedDominance: number;
    readonly isolatedHighlightRatio: number;
    readonly grayWhiteCoverage: number;
    readonly washedGrayWhiteRatio: number;
    readonly localLumaNoise: number;
    readonly brightSpeckleRatio: number;
    readonly contactDarkPixelRatio: number;
    readonly contactContrast: number;
  };
}

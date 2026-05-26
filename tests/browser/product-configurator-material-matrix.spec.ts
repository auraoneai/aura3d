import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = "tests/reports/advanced-examples-gallery/product-material-matrix";

test.describe("Product configurator material diagnostic matrix", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders same car asset across material/HDR variants before another gallery capture", async ({ page }) => {
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
      window.__A3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ = ["spec:import:start"];
      void import("/tests/browser/product-configurator-material-matrix-harness.js")
        .then((module) => {
          window.__A3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ = [
            ...(window.__A3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ ?? []),
            "spec:import:done"
          ];
          return module.runProductConfiguratorMaterialMatrixHarness();
        })
        .catch((error) => {
          window.__A3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ = [
            ...(window.__A3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ ?? []),
            `spec:import:error:${error instanceof Error ? error.message : String(error)}`
          ];
          window.__A3D_PRODUCT_MATERIAL_MATRIX__ = {
            schema: "a3d-product-configurator-material-matrix",
            status: "error",
            source: "tests/browser/product-configurator-material-matrix-harness.ts",
            galleryUiBypassed: true,
            asset: {
              id: "car-concept",
              url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb"
            },
            viewport: { width: 760, height: 520 },
            variants: [],
            diagnostics: {
              routeCurrentReproducesFailure: false,
              routeCurrentDetailLoss: {
                uniqueColorBucketLoss: 0,
                localLumaNoiseLoss: 0,
                edgeHaloDelta: 0
              },
              noOpComparisons: [],
              requiredRoleCoverage: {
                expectedRoles: [],
                presentRoles: [],
                missingRoles: []
              },
              riskyRenderableStateCount: 0,
              unclassifiedRiskMaterialCount: 0,
              unclassifiedRiskyRenderableCount: 0
            },
            ownerConclusion: {
              whiteHaloSpeckleOwner: "unresolved",
              materialRichnessOwner: "unresolved",
              nextSourceOwner: "unresolved",
              nextSourceChange: "Fix harness import/runtime error.",
              routeCaptureAllowed: false
            },
            error: error instanceof Error ? error.stack ?? error.message : String(error)
          };
        });
    });

    try {
      await page.waitForFunction(
        () => {
          const report = window.__A3D_PRODUCT_MATERIAL_MATRIX__ as { status?: string } | undefined;
          return report?.status === "ready" || report?.status === "error";
        },
        undefined,
        { timeout: 210_000 }
      );
    } catch (error) {
      const progress = await page.evaluate(() => window.__A3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__ ?? []);
      throw new Error(`Product material matrix did not report ready/error. Progress:\n${progress.join("\n") || "(none captured)"}\nPage errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const report = await page.evaluate(() => window.__A3D_PRODUCT_MATERIAL_MATRIX__) as ProductMaterialMatrixReport;
    expect(report.status, report.error).toBe("ready");
    expect(report.schema).toBe("a3d-product-configurator-material-matrix");
    expect(report.galleryUiBypassed).toBe(true);
    expect(report.asset).toEqual({
      id: "car-concept",
      url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb"
    });
    expect(report.variants.map((variant) => variant.id)).toEqual([
      "raw-fallback",
      "raw-hdr",
      "gallery-hdr",
      "gallery-route-current-hdr",
      "gallery-route-current-no-postprocess-hdr",
      "gallery-route-current-tone-only-hdr",
      "gallery-route-current-soft-tone-only-hdr",
      "gallery-route-current-no-tone-soft-fxaa-hdr",
      "gallery-route-no-postprocess-sampled-specular-off-hdr",
      "gallery-route-direct-detail-no-postprocess-hdr",
      "gallery-route-direct-detail-tone-fxaa-hdr",
      "gallery-route-fxaa-only-hdr",
      "gallery-route-tone-fxaa-hdr",
      "gallery-route-balanced-hdr",
      "gallery-route-material-rich-hdr",
      "gallery-route-material-rich-no-postprocess-hdr",
      "gallery-carmine-variant-hdr",
      "gallery-pearly-variant-hdr",
      "gallery-graphite-variant-hdr",
      "gallery-paint-texture-off-hdr",
      "gallery-paint-texture-on-hdr",
      "gallery-sampled-specular-off-hdr",
      "gallery-sampled-environment-off-hdr",
      "cinematic-hdr",
      "gallery-normal-off-hdr",
      "gallery-clearcoat-off-hdr",
      "gallery-extension-energy-off-hdr",
      "gallery-glass-readable-hdr"
    ]);
    const persisted = persistMaterialMatrixReport(report);
    expect(persisted.variantCount).toBe(28);
    expect(report.ownerConclusion.routeCaptureAllowed, "matrix source proof must explicitly qualify exactly one Product focused capture").toBe(true);
    expect(report.diagnostics.routeCurrentReproducesFailure, "the current Product route profile should no longer reproduce the old material-detail collapse after the route-profile source patch").toBe(false);
    expect(report.diagnostics.routeCurrentDetailLoss.uniqueColorBucketLoss, "current route should preserve most of the gallery material color structure").toBeLessThan(20);
    expect(report.diagnostics.noOpComparisons.filter((comparison) => comparison.status === "unexpected-no-op"), "named diagnostic variants must not silently render identical pixels").toEqual([]);
    expect(report.diagnostics.requiredRoleCoverage.missingRoles, "matrix must cover the expected Product car material roles").toEqual([]);
    expect(report.diagnostics.riskyRenderableStateCount, "final gallery renderables cannot retain transparent/no-depth/double-sided risk state").toBe(0);
    expect(report.diagnostics.unclassifiedRiskyRenderableCount, "unclassified Product car renderables cannot retain risky render state or HDR texture escapes").toBe(0);
    for (const variant of report.variants) {
      expect(variant.captureReady, `${variant.id} readiness: ${variant.lastError ?? "no last error"}`).toBe(true);
      expect(variant.drawCalls, `${variant.id} draw calls`).toBeGreaterThan(0);
      expect(variant.metrics.nonBlackPixels, `${variant.id} visible pixels`).toBeGreaterThan(1000);
      expect(variant.metrics.uniqueColorBuckets, `${variant.id} color buckets`).toBeGreaterThan(8);
      expect(persisted.hashes[variant.id], `${variant.id} persisted hash`).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(persisted.hashes["gallery-route-direct-detail-no-postprocess-hdr"], "direct-detail route diagnostic must not be a route-current no-op").not.toBe(persisted.hashes["gallery-route-current-no-postprocess-hdr"]);
    expect(persisted.hashes["gallery-route-direct-detail-tone-fxaa-hdr"], "direct-detail tone/fxaa diagnostic must not be a route-current no-op").not.toBe(persisted.hashes["gallery-route-tone-fxaa-hdr"]);

    const rawHdr = report.variants.find((variant) => variant.id === "raw-hdr");
    const gallery = report.variants.find((variant) => variant.id === "gallery-hdr");
    const routeCurrent = report.variants.find((variant) => variant.id === "gallery-route-current-hdr");
    const routeCurrentNoPostprocess = report.variants.find((variant) => variant.id === "gallery-route-current-no-postprocess-hdr");
    const routeCurrentToneOnly = report.variants.find((variant) => variant.id === "gallery-route-current-tone-only-hdr");
    const routeCurrentSoftToneOnly = report.variants.find((variant) => variant.id === "gallery-route-current-soft-tone-only-hdr");
    const routeCurrentNoToneSoftFxaa = report.variants.find((variant) => variant.id === "gallery-route-current-no-tone-soft-fxaa-hdr");
    const routeNoPostSampledSpecularOff = report.variants.find((variant) => variant.id === "gallery-route-no-postprocess-sampled-specular-off-hdr");
    const routeDirectDetail = report.variants.find((variant) => variant.id === "gallery-route-direct-detail-no-postprocess-hdr");
    const routeDirectDetailToneFxaa = report.variants.find((variant) => variant.id === "gallery-route-direct-detail-tone-fxaa-hdr");
    const routeFxaaOnly = report.variants.find((variant) => variant.id === "gallery-route-fxaa-only-hdr");
    const routeToneFxaa = report.variants.find((variant) => variant.id === "gallery-route-tone-fxaa-hdr");
    const routeBalanced = report.variants.find((variant) => variant.id === "gallery-route-balanced-hdr");
    const routeMaterialRich = report.variants.find((variant) => variant.id === "gallery-route-material-rich-hdr");
    const routeMaterialRichNoPostprocess = report.variants.find((variant) => variant.id === "gallery-route-material-rich-no-postprocess-hdr");
    const carmine = report.variants.find((variant) => variant.id === "gallery-carmine-variant-hdr");
    const pearl = report.variants.find((variant) => variant.id === "gallery-pearly-variant-hdr");
    const graphite = report.variants.find((variant) => variant.id === "gallery-graphite-variant-hdr");
    const textureOff = report.variants.find((variant) => variant.id === "gallery-paint-texture-off-hdr");
    const textureOn = report.variants.find((variant) => variant.id === "gallery-paint-texture-on-hdr");
    const sampledSpecularOff = report.variants.find((variant) => variant.id === "gallery-sampled-specular-off-hdr");
    const sampledEnvironmentOff = report.variants.find((variant) => variant.id === "gallery-sampled-environment-off-hdr");
    const cinematic = report.variants.find((variant) => variant.id === "cinematic-hdr");
    const extensionEnergyOff = report.variants.find((variant) => variant.id === "gallery-extension-energy-off-hdr");
    expect(rawHdr).toBeDefined();
    expect(gallery).toBeDefined();
    expect(routeCurrent).toBeDefined();
    expect(routeCurrentNoPostprocess).toBeDefined();
    expect(routeCurrentToneOnly).toBeDefined();
    expect(routeCurrentSoftToneOnly).toBeDefined();
    expect(routeCurrentNoToneSoftFxaa).toBeDefined();
    expect(routeNoPostSampledSpecularOff).toBeDefined();
    expect(routeDirectDetail).toBeDefined();
    expect(routeDirectDetailToneFxaa).toBeDefined();
    expect(routeFxaaOnly).toBeDefined();
    expect(routeToneFxaa).toBeDefined();
    expect(routeBalanced).toBeDefined();
    expect(routeMaterialRich).toBeDefined();
    expect(routeMaterialRichNoPostprocess).toBeDefined();
    expect(carmine).toBeDefined();
    expect(pearl).toBeDefined();
    expect(graphite).toBeDefined();
    expect(textureOff).toBeDefined();
    expect(textureOn).toBeDefined();
    expect(sampledSpecularOff).toBeDefined();
    expect(sampledEnvironmentOff).toBeDefined();
    expect(cinematic).toBeDefined();
    expect(extensionEnergyOff).toBeDefined();
    expect(gallery!.renderableMaterials.some((material) => material.key === "Glass" && material.visualRole === "glass" && material.uniforms.transmissionFactor === 0)).toBe(true);
    expect(gallery!.renderableMaterials.length, "diagnostic must emit final cloned material state for every car draw item, not grouped material-library summaries").toBeGreaterThan(90);
    expect(gallery!.renderableMaterials.every((material) => material.nodeName && material.geometryKey && material.materialKey && material.sourceMaterialName), "each final cloned car record must carry node/material binding ownership").toBe(true);
    const roofPanel = gallery!.renderableMaterials.find((material) => material.visualRole === "roof-panel");
    expect(roofPanel, "matrix must include the final cloned roof-panel material that was visible as the old white shell/roof artifact").toBeDefined();
    expect(roofPanel!.renderState).toMatchObject({ blend: false, depthWrite: true, cullMode: "back" });
    expect(roofPanel!.uniforms.transmissionFactor ?? 0, "roof-panel must not render through transparent/transmission shell state").toBe(0);
    expect(roofPanel!.uniforms.materialEnvironmentSpecularScale ?? 1, "roof-panel environment specular must stay bounded by Product role clamps").toBeLessThanOrEqual(0.08);
    expect(gallery!.renderableMaterials.some((material) => material.visualRole === "brake" && material.uniforms.materialEnvironmentSpecularScale === 0.012)).toBe(true);
    const wheelMetal = gallery!.renderableMaterials.find((material) => material.visualRole === "wheel-metal");
    expect(wheelMetal, "matrix must include final cloned wheel-metal material so wheel/brake detail is not inferred from grouped material-library state").toBeDefined();
    expect(wheelMetal!.renderState).toMatchObject({ blend: false, depthWrite: true, cullMode: "back" });
    expect(wheelMetal!.uniforms.specularTextureEnabled ?? 0, "wheel metal must not escape through glTF specular textures").toBe(0);
    expect(wheelMetal!.uniforms.baseColorTextureEnabled ?? 0, "wheel metal should keep bounded source texture contribution for visible spoke/disc detail").toBeGreaterThan(0);
    expect(wheelMetal!.uniforms.baseColorTextureEnabled ?? 1, "wheel metal source texture contribution must stay bounded").toBeLessThanOrEqual(0.5);
    expect(gallery!.renderableMaterials.some((material) => material.visualRole === "interior" && material.uniforms.specularTextureEnabled === 0)).toBe(true);
    expect(gallery!.renderableMaterials.some((material) => /Paint 1 Carmine/.test(material.name) && (material.uniforms.materialEnvironmentSpecularScale ?? 1) < 0.1)).toBe(true);
    expect(gallery!.renderableMaterials.every((material) => (material.uniforms.specularTextureEnabled ?? 0) === 0), "bound car materials must not escape through specular textures").toBe(true);
    expect(gallery!.renderableMaterials.every((material) => (material.uniforms.specularColorTextureEnabled ?? 0) === 0), "bound car materials must not escape through specular color textures").toBe(true);
    expect(gallery!.renderableMaterials.every((material) => (material.uniforms.transmissionTextureEnabled ?? 0) === 0), "bound car materials must not escape through unbacked transmission textures").toBe(true);
    expect(gallery!.renderableMaterials.every((material) => (material.uniforms.iridescenceTextureEnabled ?? 0) === 0), "bound car materials must not escape through iridescence textures").toBe(true);
    expect(gallery!.renderableMaterials.every((material) => material.renderState.blend === false), "gallery body/glass/detail materials must not render as transparent overlays").toBe(true);
    expect(gallery!.renderableMaterials.every((material) => material.renderState.depthWrite === true), "gallery body/glass/detail materials must write depth").toBe(true);
    expect(gallery!.renderableMaterials.every((material) => material.renderState.cullMode === "back"), "gallery body/glass/detail materials must cull source double-sided shells").toBe(true);
    expect(routeCurrent!.routeLighting).toBe("product-route-current");
    expect(routeCurrent!.postprocess).toBe("product-route-current");
    expect(routeCurrentNoPostprocess!.routeLighting).toBe("product-route-current");
    expect(routeCurrentNoPostprocess!.postprocess).toBe("none");
    expect(routeCurrentToneOnly!.routeLighting).toBe("product-route-current");
    expect(routeCurrentToneOnly!.postprocess).toBe("product-route-tone-only");
    expect(routeCurrentSoftToneOnly!.routeLighting).toBe("product-route-current");
    expect(routeCurrentSoftToneOnly!.postprocess).toBe("product-route-soft-tone-only");
    expect(routeCurrentNoToneSoftFxaa!.routeLighting).toBe("product-route-current");
    expect(routeCurrentNoToneSoftFxaa!.postprocess).toBe("product-route-no-tone-soft-fxaa");
    expect(routeNoPostSampledSpecularOff!.routeLighting).toBe("product-route-current");
    expect(routeNoPostSampledSpecularOff!.postprocess).toBe("none");
    expect(routeNoPostSampledSpecularOff!.environmentMutation).toBe("sampled-specular-off");
    expect(routeDirectDetail!.routeLighting).toBe("product-route-direct-detail");
    expect(routeDirectDetail!.postprocess).toBe("none");
    expect(routeDirectDetail!.environmentMutation).toBe("sampled-specular-off");
    expect(routeDirectDetailToneFxaa!.routeLighting).toBe("product-route-direct-detail");
    expect(routeDirectDetailToneFxaa!.postprocess).toBe("product-route-tone-fxaa");
    expect(routeDirectDetailToneFxaa!.environmentMutation).toBe("sampled-specular-off");
    expect(routeFxaaOnly!.routeLighting).toBe("product-route-current");
    expect(routeFxaaOnly!.postprocess).toBe("product-route-fxaa-only");
    expect(routeToneFxaa!.routeLighting).toBe("product-route-current");
    expect(routeToneFxaa!.postprocess).toBe("product-route-tone-fxaa");
    expect(routeBalanced!.routeLighting).toBe("product-route-balanced");
    expect(routeBalanced!.postprocess).toBe("product-route-balanced");
    expect(routeMaterialRich!.routeLighting).toBe("product-route-material-rich");
    expect(routeMaterialRich!.postprocess).toBe("product-route-material-rich");
    expect(routeMaterialRichNoPostprocess!.routeLighting).toBe("product-route-material-rich");
    expect(routeMaterialRichNoPostprocess!.postprocess).toBe("none");
    expect(boundMaterialKeys(carmine!)).toEqual(expect.arrayContaining(["Paint 1 Carmine", "Paint 2 Carmine", "Interior 3 Carmine"]));
    expect(boundMaterialKeys(carmine!)).not.toEqual(expect.arrayContaining(["Paint 1 Pearl", "Paint 2 Pearl", "Interior 3 Pearl"]));
    expect(boundMaterialKeys(pearl!)).toEqual(expect.arrayContaining(["Paint 1 Pearl", "Paint 2 Pearl", "Interior 3 Pearl"]));
    expect(boundMaterialKeys(pearl!)).not.toEqual(expect.arrayContaining(["Paint 1 Carmine", "Paint 2 Carmine", "Interior 3 Carmine"]));
    expect(boundMaterialKeys(graphite!)).toEqual(expect.arrayContaining(["Paint 1 Graphite", "Paint 2 Graphite", "Interior 3 Graphite"]));
    expect(gallery!.metrics.edgeHaloRatio, "gallery profile should not exceed raw HDR edge halo ratio").toBeLessThanOrEqual(rawHdr!.metrics.edgeHaloRatio + 0.002);
    expect(gallery!.metrics.edgeHaloRatio, "gallery profile must hard-cap white edge halo before Product route capture").toBeLessThan(0.0022);
    expect(gallery!.metrics.brightSpeckleRatio, "gallery profile must hard-cap isolated bright paint/glass speckles before Product route capture").toBeLessThan(0.001);
    expect(gallery!.metrics.uniqueColorBuckets, "paint texture should restore detail over the texture-disabled diagnostic").toBeGreaterThanOrEqual(textureOff!.metrics.uniqueColorBuckets);
    expect(textureOn!.renderableMaterials.some((material) => /Paint 1 Carmine/.test(material.name) && material.uniforms.baseColorTextureEnabled === 1)).toBe(true);
    expect(sampledSpecularOff!.environmentMutation).toBe("sampled-specular-off");
    expect(sampledEnvironmentOff!.environmentMutation).toBe("sampled-environment-off");
    expect(extensionEnergyOff!.renderableMaterials.every((material) => (material.uniforms.materialEnvironmentSpecularScale ?? 1) === 0), "extension-off diagnostic must zero bound material environment specular scale").toBe(true);
    expect(extensionEnergyOff!.renderableMaterials.every((material) => (material.uniforms.clearcoatFactor ?? 0) === 0), "extension-off diagnostic must zero bound clearcoat").toBe(true);
    expect(extensionEnergyOff!.renderableMaterials.every((material) => (material.uniforms.specularFactor ?? 0) === 0), "extension-off diagnostic must zero bound specular").toBe(true);
    expect(cinematic!.metrics.redPaintCoverage, "cinematic profile is diagnostic only and should not replace Product gallery richness").toBeLessThanOrEqual(gallery!.metrics.redPaintCoverage + 0.08);
  });
});

function boundMaterialKeys(variant: ProductMaterialMatrixVariant): string[] {
  return variant.renderableMaterials.map((material) => material.key).sort();
}

function persistMaterialMatrixReport(report: ProductMaterialMatrixReport): {
  readonly variantCount: number;
  readonly hashes: Record<string, string>;
} {
  mkdirSync(REPORT_DIR, { recursive: true });
  const hashes: Record<string, string> = {};
  const reportWithoutPngs = {
    ...report,
    variants: report.variants.map((variant) => {
      const png = pngBufferFromDataUrl(variant.pngDataUrl);
      const path = join(REPORT_DIR, `${variant.id}.png`);
      writeFileSync(path, png);
      const sha256 = createHash("sha256").update(png).digest("hex");
      hashes[variant.id] = sha256;
      const { pngDataUrl, ...rest } = variant;
      return {
        ...rest,
        artifact: path,
        sha256
      };
    })
  };
  writeFileSync(join(REPORT_DIR, "product-material-matrix.json"), `${JSON.stringify(reportWithoutPngs, null, 2)}\n`);
  return {
    variantCount: report.variants.length,
    hashes
  };
}

function pngBufferFromDataUrl(dataUrl: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error(`Expected PNG data URL, got ${dataUrl.slice(0, 32)}`);
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

interface ProductMaterialMatrixReport {
  readonly schema: "a3d-product-configurator-material-matrix";
  readonly status: "ready" | "error";
  readonly source: string;
  readonly galleryUiBypassed: true;
  readonly asset: {
    readonly id: "car-concept";
    readonly url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb";
  };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly variants: readonly ProductMaterialMatrixVariant[];
  readonly diagnostics: {
    readonly routeCurrentReproducesFailure: boolean;
    readonly routeCurrentDetailLoss: {
      readonly uniqueColorBucketLoss: number;
      readonly localLumaNoiseLoss: number;
      readonly edgeHaloDelta: number;
    };
    readonly noOpComparisons: readonly {
      readonly id: string;
      readonly leftVariant: string;
      readonly rightVariant: string;
      readonly expectedToDiffer: boolean;
      readonly pixelsDiffer: boolean;
      readonly metricDelta: {
        readonly uniqueColorBuckets: number;
        readonly localLumaNoise: number;
        readonly edgeHaloRatio: number;
        readonly averageLuma: number;
      };
      readonly status: "changed" | "unexpected-no-op" | "expected-no-op";
    }[];
    readonly requiredRoleCoverage: {
      readonly expectedRoles: readonly string[];
      readonly presentRoles: readonly string[];
      readonly missingRoles: readonly string[];
    };
    readonly riskyRenderableStateCount: number;
    readonly unclassifiedRiskMaterialCount: number;
    readonly unclassifiedRiskyRenderableCount: number;
  };
  readonly ownerConclusion: {
    readonly whiteHaloSpeckleOwner: string;
    readonly materialRichnessOwner: string;
    readonly nextSourceOwner: string;
    readonly nextSourceChange: string;
    readonly routeCaptureAllowed: boolean;
  };
  readonly error?: string;
}

interface ProductMaterialMatrixVariant {
  readonly id: string;
  readonly label: string;
  readonly lighting: string;
  readonly profile: string;
  readonly renderState: string;
  readonly materialVariant: string;
  readonly mutation: string;
  readonly environmentMutation: string;
  readonly routeLighting: string;
  readonly postprocess: string;
  readonly captureReady: boolean;
  readonly drawCalls: number;
  readonly lastError: string | null;
  readonly runtimeMaterials: readonly {
    readonly key: string;
    readonly name: string;
    readonly renderState: {
      readonly blend: boolean;
      readonly depthWrite: boolean;
      readonly cullMode: string;
    };
    readonly uniforms: {
      readonly baseColor?: readonly [number, number, number, number];
      readonly baseColorTextureEnabled?: number;
      readonly normalTextureEnabled?: number;
      readonly normalScale?: number;
      readonly metallic?: number;
      readonly metallicRoughnessTextureEnabled?: number;
      readonly occlusionTextureEnabled?: number;
      readonly occlusionStrength?: number;
      readonly roughness?: number;
      readonly specularFactor?: number;
      readonly specularTextureEnabled?: number;
      readonly specularColorTextureEnabled?: number;
      readonly clearcoatFactor?: number;
      readonly clearcoatTextureEnabled?: number;
      readonly clearcoatRoughnessFactor?: number;
      readonly clearcoatNormalTextureEnabled?: number;
      readonly iridescenceFactor?: number;
      readonly iridescenceTextureEnabled?: number;
      readonly transmissionFactor?: number;
      readonly transmissionTextureEnabled?: number;
      readonly materialEnvironmentSpecularScale?: number;
    };
  }[];
  readonly renderableMaterials: readonly {
    readonly key: string;
    readonly name: string;
    readonly nodeName: string;
    readonly geometryKey: string;
    readonly materialKey: string;
    readonly sourceMaterialName: string;
    readonly visualRole: string;
    readonly renderState: {
      readonly blend: boolean;
      readonly depthWrite: boolean;
      readonly cullMode: string;
    };
    readonly drawItems: number;
    readonly nodes: readonly string[];
    readonly sourceMaterials: readonly string[];
    readonly renderStateRisk: boolean;
    readonly textureEscape: boolean;
    readonly uniforms: {
      readonly baseColor?: readonly [number, number, number, number];
      readonly baseColorTextureEnabled?: number;
      readonly normalTextureEnabled?: number;
      readonly normalScale?: number;
      readonly metallic?: number;
      readonly metallicRoughnessTextureEnabled?: number;
      readonly occlusionTextureEnabled?: number;
      readonly occlusionStrength?: number;
      readonly roughness?: number;
      readonly specularFactor?: number;
      readonly specularTextureEnabled?: number;
      readonly specularColorTextureEnabled?: number;
      readonly clearcoatFactor?: number;
      readonly clearcoatTextureEnabled?: number;
      readonly clearcoatRoughnessFactor?: number;
      readonly clearcoatNormalTextureEnabled?: number;
      readonly iridescenceFactor?: number;
      readonly iridescenceTextureEnabled?: number;
      readonly transmissionFactor?: number;
      readonly transmissionTextureEnabled?: number;
      readonly materialEnvironmentSpecularScale?: number;
    };
  }[];
  readonly roleDiagnostics: readonly {
    readonly visualRole: string;
    readonly drawItems: number;
    readonly materialKeys: readonly string[];
    readonly sourceMaterials: readonly string[];
    readonly representativeNodes: readonly string[];
    readonly renderStateRiskCount: number;
    readonly textureEscapeCount: number;
    readonly averageEnvironmentSpecularScale: number | null;
    readonly averageSpecularFactor: number | null;
    readonly averageClearcoatFactor: number | null;
  }[];
  readonly metrics: {
    readonly nonBlackPixels: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
    readonly uniqueColorBuckets: number;
    readonly redPaintCoverage: number;
    readonly meanRedDominance: number;
    readonly brightSpeckleRatio: number;
    readonly edgeHaloRatio: number;
    readonly grayWhiteCoverage: number;
    readonly washedGrayWhiteRatio: number;
    readonly localLumaNoise: number;
  };
  readonly pngDataUrl: string;
}

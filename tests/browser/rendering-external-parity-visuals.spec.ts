import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_MATERIAL_SHOWROOM__?: ExternalParityExampleState;
    __AURA3D_SHADOW_LAB__?: ExternalParityExampleState;
    __AURA3D_FORWARD_SHADOW_MAP_CHECK__?: ExternalParityForwardShadowMapCheckState;
    __AURA3D_POSTPROCESS_LAB__?: ExternalParityExampleState;
    __AURA3D_WEBGPU_CAPABILITY__?: ExternalParityWebGPUCapabilityState;
    __AURA3D_PBR_EXTENSION_TEXTURE_VARIANTS__?: ExternalParityPbrExtensionTextureVariantState;
  }
}

test.describe("ExternalParity renderer visual quality evidence", () => {
  let server: ExampleDevServer;
  const report: ExternalParityRenderingReport = {
    ok: false,
    generatedAt: new Date().toISOString(),
    command: "pnpm exec playwright test tests/browser/rendering-external-parity-visuals.spec.ts",
    screenshots: [],
    validations: [],
    blockedClaims: [
      "HDR render targets and HDR image-based lighting remain blocked by current renderer feature evidence.",
      "SSAO, SSR, TAA, and DOF are not claimed by ExternalParity renderer evidence.",
      "This report covers renderer-owned labs only; flagship product, architecture, game, and asset viewer ExternalParity screenshots require their owning agents."
    ]
  };

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.every((validation) => validation.ok);
    report.generatedAt = new Date().toISOString();
    const reportPath = resolve("tests/reports/external-parity-rendering.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("shadow lab publishes ExternalParity preset evidence and visible shadow screenshot", async ({ page }) => {
    await page.goto(`${server.origin}/tests/fixtures/visual-examples/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
    await waitForState(page, "__AURA3D_SHADOW_LAB__");
    const screenshotPath = "tests/reports/external-parity-example-screenshots/shadow-lab.png";
    await captureScreenshot(page, "body", screenshotPath);
    const state = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
    const shadowRgb = rgbSum(state?.shadowPixel);
    const planeRgb = rgbSum(state?.planePixel);
    const checks = {
      ready: state?.status === "ready",
      preset: state?.featureEvidence?.presetId === "aura3d-external-parity-visual-quality-preset",
      screenshotPath: state?.featureEvidence?.screenshotPath === screenshotPath,
      claimBoundary: typeof state?.claimBoundary === "string" && state.claimBoundary.length > 40,
      shadowFeature: state?.featureEvidence?.activeFeatures?.includes("directional-shadows") === true,
      contactBlocked: state?.featureEvidence?.blockedFeatures?.some((feature) => feature.feature === "contact-shadows") === true,
      cascadesRendered: state?.cascadeRendered?.every(Boolean) === true,
      pointShadowFaces: Number(state?.pointSpot?.point?.renderedFaces ?? 0) === 6,
      spotShadowRendered: state?.pointSpot?.spot?.rendered === true && Number(state?.pointSpot?.spot?.pcfSamples ?? 0) >= 9,
      pointSpotPixels: rgbSum(state?.pointSpot?.point?.pixel) > 0 && rgbSum(state?.pointSpot?.spot?.pixel) > 0,
      projectedShadowDarker: shadowRgb > 0 && planeRgb > 0 && shadowRgb < planeRgb,
      pcfPenumbra: rgbSum(state?.pcf?.litPixel) > rgbSum(state?.pcf?.penumbraPixel) && rgbSum(state?.pcf?.penumbraPixel) > rgbSum(state?.pcf?.shadowPixel),
      debugOverlayPixels: Object.values(state?.debugView?.pixels ?? {}).every((pixel) => channel(pixel, 3) === 255)
    };
    recordValidation("shadow-lab-external-parity-preset", screenshotPath, checks, {
      drawCalls: Number(state?.diagnostics?.drawCalls ?? 0),
      cascadeCount: Number(state?.cascadeCount ?? 0),
      pointShadowFaces: Number(state?.pointSpot?.point?.renderedFaces ?? 0),
      spotPcfSamples: Number(state?.pointSpot?.spot?.pcfSamples ?? 0),
      pointSpotDrawCalls: Number(state?.pointSpot?.drawCalls ?? 0),
      shadowRgb,
      planeRgb,
      pcfSamples: Number(state?.pcf?.samples ?? 0)
    });
    expect(checks, JSON.stringify(state)).toEqual({
      ready: true,
      preset: true,
      screenshotPath: true,
      claimBoundary: true,
      shadowFeature: true,
      contactBlocked: true,
      cascadesRendered: true,
      pointShadowFaces: true,
      spotShadowRendered: true,
      pointSpotPixels: true,
      projectedShadowDarker: true,
      pcfPenumbra: true,
      debugOverlayPixels: true
    });
  });

  test("shadow lab remains stable after resize and under DPR 2", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1180, height: 760 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    try {
      await page.goto(`${server.origin}/tests/fixtures/visual-examples/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
      await waitForState(page, "__AURA3D_SHADOW_LAB__");
      const dprScreenshot = "tests/reports/external-parity-example-screenshots/shadow-lab-dpr2.png";
      await captureScreenshot(page, "body", dprScreenshot);
      const dprState = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
      const dprShadowRgb = rgbSum(dprState?.shadowPixel);
      const dprPlaneRgb = rgbSum(dprState?.planePixel);

      await page.setViewportSize({ width: 740, height: 620 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForState(page, "__AURA3D_SHADOW_LAB__");
      const resizedScreenshot = "tests/reports/external-parity-example-screenshots/shadow-lab-resized-dpr2.png";
      await captureScreenshot(page, "body", resizedScreenshot);
      const resizedState = await page.evaluate(() => window.__AURA3D_SHADOW_LAB__);
      const resizedShadowRgb = rgbSum(resizedState?.shadowPixel);
      const resizedPlaneRgb = rgbSum(resizedState?.planePixel);
      const checks = {
        dprReady: dprState?.status === "ready",
        dprShadowDarker: dprShadowRgb > 0 && dprPlaneRgb > 0 && dprShadowRgb < dprPlaneRgb,
        dprCascadesRendered: dprState?.cascadeRendered?.every(Boolean) === true,
        resizedReady: resizedState?.status === "ready",
        resizedShadowDarker: resizedShadowRgb > 0 && resizedPlaneRgb > 0 && resizedShadowRgb < resizedPlaneRgb,
        resizedCascadesRendered: resizedState?.cascadeRendered?.every(Boolean) === true,
        dprPublished: await page.evaluate(() => window.devicePixelRatio) === 2,
      };
      recordValidation("shadow-lab-resize-dpr2-stability", dprScreenshot, checks, {
        dprShadowRgb,
        dprPlaneRgb,
        resizedShadowRgb,
        resizedPlaneRgb,
        dpr: 2,
      });
      report.screenshots.push(resizedScreenshot);
      expect(checks, JSON.stringify({ dprState, resizedState })).toEqual({
        dprReady: true,
        dprShadowDarker: true,
        dprCascadesRendered: true,
        resizedReady: true,
        resizedShadowDarker: true,
        resizedCascadesRendered: true,
        dprPublished: true,
      });
    } finally {
      await context.close();
    }
  });

  function recordValidation(name: string, screenshotPath: string, checks: Record<string, boolean>, metrics: Record<string, number>): void {
    const ok = Object.values(checks).every(Boolean);
    report.validations.push({ name, ok, screenshotPath, checks, metrics });
    report.screenshots.push(screenshotPath);
  }
});

async function waitForState(page: Page, stateName: "__AURA3D_MATERIAL_SHOWROOM__" | "__AURA3D_SHADOW_LAB__" | "__AURA3D_POSTPROCESS_LAB__"): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const state = (globalThis as Record<string, ExternalParityExampleState | undefined>)[name];
      return state?.status === "ready" || state?.status === "error";
    },
    stateName,
    { timeout: 30_000 }
  );
}

async function waitForPbrVariantState(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = window.__AURA3D_PBR_EXTENSION_TEXTURE_VARIANTS__;
      return state?.status === "ready" || state?.status === "error";
    },
    undefined,
    { timeout: 30_000 }
  );
}

async function captureScreenshot(page: Page, selector: string, screenshotPath: string): Promise<void> {
  mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
  await page.locator(selector).screenshot({ path: screenshotPath });
}

function includesAll(values: readonly string[] | undefined, required: readonly string[]): boolean {
  return required.every((value) => values?.includes(value));
}

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function rgbSum(pixel: readonly number[] | undefined): number {
  return channel(pixel, 0) + channel(pixel, 1) + channel(pixel, 2);
}

function distinctPixelBuckets(pixels: readonly (readonly number[])[]): number {
  return new Set(pixels.map((pixel) => `${channel(pixel, 0) >> 4}:${channel(pixel, 1) >> 4}:${channel(pixel, 2) >> 4}`)).size;
}

async function requiredBox(locator: Locator): Promise<{ readonly width: number; readonly height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected locator to have a bounding box.");
  return { width: box.width, height: box.height };
}

function boxesMatch(left: { readonly width: number; readonly height: number }, right: { readonly width: number; readonly height: number }): boolean {
  return Math.abs(left.width - right.width) <= 1 && Math.abs(left.height - right.height) <= 1;
}

interface ExternalParityExampleState {
  readonly status: "ready" | "error";
  readonly featureEvidence?: {
    readonly presetId: string;
    readonly screenshotPath: string;
    readonly colorManagement?: {
      readonly inputColorSpace: "linear" | "srgb";
      readonly outputColorSpace: "linear" | "srgb";
      readonly toneMapper: string;
      readonly exposure: number;
      readonly whitePoint: number;
    };
    readonly activeFeatures: readonly string[];
    readonly blockedFeatures: readonly { readonly feature: string; readonly state: string; readonly reason?: string }[];
  };
  readonly claimBoundary?: string;
  readonly diagnostics?: { readonly drawCalls?: number; readonly lastError: string | null };
  readonly pixels?: Record<string, readonly number[]>;
  readonly environmentResources?: { readonly specularMipCount: number };
  readonly environmentPreset?: string;
  readonly environmentPresets?: readonly string[];
  readonly materials?: readonly string[];
  readonly oldBranchPhysicalMaterialPresets?: readonly string[];
  readonly proceduralTextureFixtures?: readonly { readonly id: string; readonly hash: string; readonly semantic: string }[];
  readonly postprocess?: {
    readonly brightPixelCount: number;
    readonly beforeNeighbor: readonly number[];
    readonly afterNeighbor: readonly number[];
  };
  readonly controls?: {
    readonly toneMapping: boolean;
    readonly bloom: boolean;
    readonly fxaa: boolean;
    readonly toneMapper?: string;
    readonly exposure?: number;
    readonly whitePoint?: number;
    readonly inputColorSpace?: "linear" | "srgb";
    readonly outputColorSpace?: "linear" | "srgb";
    readonly contrast?: number;
    readonly temperature?: number;
    readonly tint?: number;
    readonly saturation?: number;
    readonly vibrance?: number;
    readonly vignette?: number;
    readonly sharpening?: number;
  };
  readonly colorManagement?: {
    readonly inputColorSpace: "linear" | "srgb";
    readonly outputColorSpace: "linear" | "srgb";
    readonly toneMapper: string;
    readonly exposure: number;
    readonly whitePoint: number;
    readonly calibration: {
      readonly monotonic: boolean;
      readonly samples: readonly { readonly inputLinear: number; readonly encodedByte: number }[];
    };
  };
  readonly toneMappingPresetEvidence?: {
    readonly source: string;
    readonly preset: string;
    readonly path: string;
    readonly operators: readonly string[];
    readonly histogram: {
      readonly bins: readonly number[];
      readonly binCount: number;
      readonly pixelCount: number;
      readonly averageLuminance: number;
      readonly maxObservedLuminance: number;
    };
    readonly autoExposure: {
      readonly exposure: number;
      readonly targetExposure: number;
      readonly averageLuminance: number;
      readonly adaptationRate: number;
    };
    readonly changedPixels: number;
    readonly colorBuckets: number;
  };
  readonly cascadeCount?: number;
  readonly cascadeRendered?: readonly boolean[];
  readonly shadowPixel?: readonly number[];
  readonly planePixel?: readonly number[];
  readonly pcf?: {
    readonly samples: number;
    readonly litPixel: readonly number[];
    readonly penumbraPixel: readonly number[];
    readonly shadowPixel: readonly number[];
  };
  readonly pointSpot?: {
    readonly point?: {
      readonly renderedFaces?: number;
      readonly pixel?: readonly number[];
    };
    readonly spot?: {
      readonly rendered?: boolean;
      readonly pcfSamples?: number;
      readonly pixel?: readonly number[];
    };
    readonly drawCalls?: number;
  };
  readonly debugView?: { readonly pixels: Record<string, readonly number[]> };
  readonly passCostsMs?: Record<string, number>;
  readonly graphOrder?: readonly string[];
  readonly timing?: { readonly sampleCount: number };
  readonly bloomMetrics?: { readonly maxNeighborBoost: number };
  readonly colorGrading?: {
    readonly path: string;
    readonly changedPixels: number;
    readonly vignetteDarkenedPixels: number;
    readonly sharpenedPixels: number;
    readonly settings: Record<string, number>;
  };
  readonly advancedPostprocess?: {
    readonly source: string;
    readonly chromaticAberration: { readonly path: string; readonly changedPixels: number; readonly maxChannelOffsetPixels: number };
    readonly filmGrain: { readonly path: string; readonly changedPixels: number };
    readonly depthOfField: { readonly path: string; readonly blurredPixels: number };
    readonly outline: {
      readonly source: string;
      readonly path: string;
      readonly method: string;
      readonly outlinedPixels: number;
      readonly changedPixels: number;
      readonly maxGradient: number;
    };
    readonly motionBlur: { readonly path: string; readonly blurredPixels: number };
    readonly ssao: { readonly path: string; readonly occludedPixels: number };
    readonly ssr: { readonly path: string; readonly reflectedPixels: number };
    readonly taa: { readonly path: string; readonly blendedPixels: number };
  };
  readonly blockedPostprocessEffects?: {
    readonly dof: false;
    readonly chromaticAberration: false;
    readonly filmGrain: false;
    readonly motionBlur: false;
    readonly ssao: false;
    readonly ssr: false;
    readonly taa: false;
    readonly requiredEvidence: string;
  };
  readonly realScene?: {
    readonly source: string;
    readonly meshCount: number;
    readonly materialCount: number;
    readonly renderItems: number;
    readonly drawCalls: number;
    readonly nonDarkPixels: number;
    readonly colorBuckets: number;
  };
  readonly proceduralBackground?: {
    readonly id: string;
    readonly hash: string;
    readonly layers: number;
  };
  readonly error?: string;
}

interface ExternalParityRenderingReport {
  ok: boolean;
  generatedAt: string;
  command: string;
  screenshots: string[];
  validations: ExternalParityRenderingValidation[];
  blockedClaims: string[];
}

interface ExternalParityRenderingValidation {
  readonly name: string;
  readonly ok: boolean;
  readonly screenshotPath: string;
  readonly checks: Record<string, boolean>;
  readonly metrics: Record<string, number>;
}

interface ExternalParityPbrExtensionTextureVariantState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-pbr-extension-texture-variants";
  readonly screenshotPath: string;
  readonly diagnostics?: { readonly drawCalls?: number };
  readonly variants: readonly {
    readonly id: string;
    readonly shaderVariant: string;
    readonly pixel: readonly number[];
    readonly rgb: number;
  }[];
  readonly featureEvidence?: {
    readonly samplerBudgetedShaderVariants?: boolean;
    readonly combinedSamplerBudgetedShaderVariants?: boolean;
    readonly advancedTextureMapsRendered?: boolean;
    readonly variantCount?: number;
    readonly variantNames?: readonly string[];
    readonly browserPixelReadback?: boolean;
  };
  readonly knownLimits?: readonly string[];
  readonly error?: string;
}

interface ExternalParityForwardShadowMapCheckState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2-forward-pass-shadow-map";
  readonly diagnostics?: { readonly drawCalls?: number };
  readonly featureEvidence?: {
    readonly forwardPassShadowMapSampling?: boolean;
    readonly shadowTextureBound?: boolean;
    readonly generatedShadowMapTexture?: boolean;
    readonly depthPassRenderTarget?: boolean;
    readonly lightCastsShadow?: boolean;
    readonly litVsShadowedPixelReadback?: boolean;
    readonly pcfTextureSamples?: number;
  };
  readonly pixels?: {
    readonly lit?: readonly number[];
    readonly shadowed?: readonly number[];
  };
  readonly metrics?: {
    readonly litRgb?: number;
    readonly shadowedRgb?: number;
    readonly deltaRgb?: number;
    readonly shadowStrength?: number;
    readonly generatedDepthRgb?: number;
  };
  readonly knownLimits?: readonly string[];
  readonly error?: string;
}

interface ExternalParityWebGPUCapabilityState {
  readonly status: "ready";
  readonly renderer: "webgpu" | "unavailable";
  readonly visualClaim: "webgpu-capability-probe";
  readonly availability: "available" | "not-exposed" | "adapter-missing" | "device-error";
  readonly hasNavigatorGpu: boolean;
  readonly diagnostics?: { readonly drawCalls?: number };
  readonly centerPixel: readonly number[];
  readonly gracefulFallback: boolean;
  readonly computeBoundary?: {
    readonly computeParticlesClaimed: boolean;
    readonly computeUseCaseClaimed: boolean;
    readonly fallbackPath: string;
    readonly requiredEvidence: string;
  };
  readonly knownLimits: readonly string[];
}

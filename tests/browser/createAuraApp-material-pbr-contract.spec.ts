import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type FeatureStatus = "pass" | "partial" | "unsupported";

interface VariantPixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly colorBuckets: number;
  readonly foregroundBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly meanRgb: readonly [number, number, number];
  readonly meanLuma: number;
  /** Mean absolute luma delta between adjacent foreground pixels. */
  readonly localLumaVariation: number;
  /** `localLumaVariation` normalized by mean foreground luma. */
  readonly relativeLumaVariation: number;
  /** Mean per-pixel max-minus-min RGB spread across the foreground. */
  readonly meanChroma: number;
  readonly hash: string;
}

interface VariantCapture {
  readonly id: string;
  readonly feature: string;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
  };
  readonly pixels: VariantPixelMetrics;
}

interface VariantComparison {
  readonly feature: string;
  readonly variantA: string;
  readonly variantB: string;
  readonly pixelDelta: number;
  readonly changedPixelFraction: number;
  readonly meanLumaDelta: number;
  readonly foregroundBounds: VariantPixelMetrics["foregroundBounds"];
}

interface RootMaterialContractRunner {
  readonly imports: readonly string[];
  readonly typedTextureAsset: {
    readonly id: string;
    readonly typed: string;
    readonly textureCount: number;
    readonly materialCount: number;
  };
  renderVariant(id: string): Promise<VariantCapture>;
  compareVariants(variantA: string, variantB: string): VariantComparison;
  unsupportedFeatures(): readonly FeatureEvidence[];
  helperStatuses(): RootMaterialContractEvidence["publicHelpers"];
}

interface MaterialContractWindow extends Window {
  readonly __AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__?: RootMaterialContractRunner;
  readonly __AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__?: string;
}

interface FeatureEvidence {
  readonly feature: string;
  readonly status: FeatureStatus;
  readonly screenshotA?: string;
  readonly screenshotB?: string;
  readonly hashA?: string;
  readonly hashB?: string;
  readonly pixelDelta?: number;
  readonly measurements?: Readonly<Record<string, number>>;
  readonly reason: string;
}

interface RootMaterialContractEvidence {
  readonly schema: "aura3d-root-material-contract/1.0";
  readonly generatedAt: string;
  readonly imports: readonly string[];
  readonly renderer: {
    readonly backend?: string;
    readonly runtimeBackend?: string;
    readonly fallback?: string;
    readonly drawCalls?: number;
    readonly renderSize?: readonly number[];
  };
  readonly typedTextureAsset: RootMaterialContractRunner["typedTextureAsset"];
  readonly features: readonly FeatureEvidence[];
  readonly publicHelpers: readonly {
    readonly name: string;
    readonly status: "root-proven" | "partial" | "internal-only" | "roadmap" | "unsupported";
    readonly reason: string;
  }[];
  readonly pass: boolean;
  readonly failures: readonly string[];
}

const reportDir = "tests/reports/createAuraApp-material-pbr-contract";
const evidencePath = `${reportDir}/material-contract.json`;

const comparedFeatures = [
  {
    feature: "base-color",
    variantA: "base-color-a",
    variantB: "base-color-b",
    minDelta: 10,
    passReason: "Root createAuraApp pixels show base color changes in the material foreground region."
  },
  {
    feature: "metallic-roughness",
    variantA: "metallic-roughness-low",
    variantB: "metallic-roughness-high",
    minDelta: 2.5,
    passReason: "Root createAuraApp pixels show metallic/roughness changes, enough to claim limited material response but not full PBR parity."
  },
  {
    feature: "emissive",
    variantA: "emissive-off",
    variantB: "emissive-on",
    minDelta: 12,
    passReason: "Root createAuraApp pixels show emissive color/intensity changes without claiming bloom."
  },
  {
    feature: "clearcoat",
    variantA: "clearcoat-low",
    variantB: "clearcoat-high",
    minDelta: 1.5,
    forcePartial: true,
    passReason: "Root createAuraApp pixels show clearcoat-helper material contrast, but this is not physically accurate layered clearcoat proof."
  }
] as const;

test.describe("createAuraApp root material/PBR contract", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("writes retained root-only material evidence with pixel deltas and demotions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-material-pbr-contract-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const contractWindow = window as MaterialContractWindow;
      return Boolean(contractWindow.__AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__ || contractWindow.__AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__);
    }, undefined, { timeout: 20_000 });

    const harnessError = await page.evaluate(() => (window as MaterialContractWindow).__AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__);
    if (harnessError) throw new Error(harnessError);

    mkdirSync(resolve(reportDir), { recursive: true });

    const runnerInfo = await page.evaluate(() => {
      const runner = (window as MaterialContractWindow).__AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__;
      if (!runner) throw new Error("Root material contract runner was not initialized.");
      return {
        imports: runner.imports,
        typedTextureAsset: runner.typedTextureAsset,
        unsupportedFeatures: runner.unsupportedFeatures(),
        publicHelpers: runner.helperStatuses()
      };
    });

    const captures = new Map<string, VariantCapture>();
    const screenshots = new Map<string, { readonly path: string; readonly hash: string }>();
    const features: FeatureEvidence[] = [];

    for (const feature of comparedFeatures) {
      const first = await captureVariant(page, feature.variantA);
      const second = await captureVariant(page, feature.variantB);
      captures.set(feature.variantA, first.capture);
      captures.set(feature.variantB, second.capture);
      screenshots.set(feature.variantA, { path: first.screenshotPath, hash: first.screenshotHash });
      screenshots.set(feature.variantB, { path: second.screenshotPath, hash: second.screenshotHash });

      const comparison = await compareVariants(page, feature.variantA, feature.variantB);
      const differentHashes = first.screenshotHash !== second.screenshotHash;
      const deltaPasses = comparison.pixelDelta >= feature.minDelta;
      const status: FeatureStatus = deltaPasses && differentHashes
        ? "forcePartial" in feature && feature.forcePartial ? "partial" : "pass"
        : "unsupported";
      features.push({
        feature: feature.feature,
        status,
        screenshotA: first.screenshotPath,
        screenshotB: second.screenshotPath,
        hashA: first.screenshotHash,
        hashB: second.screenshotHash,
        pixelDelta: comparison.pixelDelta,
        reason: status === "unsupported"
          ? `Root pixels did not meet the material-region delta threshold ${feature.minDelta}; measured ${comparison.pixelDelta}.`
          : feature.passReason
      });
    }

    await page.goto(`${server.origin}/tests/browser/createAuraApp-material-pbr-contract-harness.html?initial=typed-textured-asset`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const contractWindow = window as MaterialContractWindow;
      return Boolean(contractWindow.__AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__ || contractWindow.__AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__);
    }, undefined, { timeout: 20_000 });
    const typedHarnessError = await page.evaluate(() => (window as MaterialContractWindow).__AURA3D_ROOT_MATERIAL_CONTRACT_ERROR__);
    if (typedHarnessError) throw new Error(typedHarnessError);
    const typedTextureCapture = await captureVariant(page, "typed-textured-asset", { minNonBackgroundPixels: 900 });
    features.push({
      feature: "base-color-texture",
      status: "partial",
      screenshotA: typedTextureCapture.screenshotPath,
      hashA: typedTextureCapture.screenshotHash,
      reason: `Typed assets.${runnerInfo.typedTextureAsset.id} renders through root createAuraApp with ${runnerInfo.typedTextureAsset.textureCount} texture metadata entries, but this contract does not perform a controlled texture on/off pixel comparison.`
    });
    captures.set("typed-textured-asset", typedTextureCapture.capture);

    // FS-302: controlled texture on/off proof. Both variants render the same
    // typed asset with the same camera and lighting; only the material differs.
    const textureOn = await captureVariant(page, "typed-texture-on", { minNonBackgroundPixels: 900 });
    captures.set("typed-texture-on", textureOn.capture);
    const textureOff = await captureVariant(page, "typed-texture-off", { minNonBackgroundPixels: 900 });
    captures.set("typed-texture-off", textureOff.capture);
    const textureComparison = await compareVariants(page, "typed-texture-on", "typed-texture-off");
    // A sampled texture must change a substantial fraction of the model region
    // AND carry colour information the achromatic flat override cannot produce
    // AND show more brightness-normalized local detail. Requiring only a mean
    // colour delta would pass for any material swap, which is exactly the weak
    // proof this replaces.
    //
    // Absolute local luma variation is deliberately NOT the gate: it is
    // brightness-confounded. The flat grey override is brighter than the dark
    // textured robot, so it shows larger absolute adjacent differences from
    // shading gradients alone while carrying no texture detail. Normalizing by
    // mean foreground luma is what makes the two comparable.
    const textureMetrics = {
      changedPixelFraction: textureComparison.changedPixelFraction,
      relativeLumaVariationOn: textureOn.capture.pixels.relativeLumaVariation,
      relativeLumaVariationOff: textureOff.capture.pixels.relativeLumaVariation,
      meanChromaOn: textureOn.capture.pixels.meanChroma,
      meanChromaOff: textureOff.capture.pixels.meanChroma,
      colorBucketsOn: textureOn.capture.pixels.colorBuckets,
      colorBucketsOff: textureOff.capture.pixels.colorBuckets
    };
    const controlledTextureChecks = {
      regionChanged: textureMetrics.changedPixelFraction >= 0.2,
      chromaFromTexture: textureMetrics.meanChromaOn >= textureMetrics.meanChromaOff * 2 && textureMetrics.meanChromaOn >= 8,
      moreRelativeDetail: textureMetrics.relativeLumaVariationOn > textureMetrics.relativeLumaVariationOff * 1.15,
      moreColorBuckets: textureMetrics.colorBucketsOn > textureMetrics.colorBucketsOff
    };
    const controlledTexturePass = Object.values(controlledTextureChecks).every(Boolean);
    const failedTextureChecks = Object.entries(controlledTextureChecks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    const textureMeasurementSummary = `changed-pixel fraction ${textureMetrics.changedPixelFraction} of the compared region, mean chroma ${textureMetrics.meanChromaOn} textured vs ${textureMetrics.meanChromaOff} flat, relative luma variation ${textureMetrics.relativeLumaVariationOn} textured vs ${textureMetrics.relativeLumaVariationOff} flat, ${textureMetrics.colorBucketsOn} vs ${textureMetrics.colorBucketsOff} colour buckets`;
    features.push({
      feature: "base-color-texture-controlled",
      status: controlledTexturePass ? "pass" : "partial",
      screenshotA: textureOn.screenshotPath,
      hashA: textureOn.screenshotHash,
      screenshotB: textureOff.screenshotPath,
      hashB: textureOff.screenshotHash,
      pixelDelta: textureComparison.pixelDelta,
      measurements: textureMetrics,
      reason: controlledTexturePass
        ? `Controlled texture on/off comparison on typed assets.${runnerInfo.typedTextureAsset.id}: ${textureMeasurementSummary}. Root createAuraApp samples base-color textures.`
        : `Controlled texture on/off comparison did not clear its thresholds (${failedTextureChecks.join(", ")}): ${textureMeasurementSummary}.`
    });

    features.push(...runnerInfo.unsupportedFeatures);

    const rendererCapture = captures.get("base-color-a") ?? typedTextureCapture.capture;
    const failures = contractFailures(features);
    const evidence: RootMaterialContractEvidence = {
      schema: "aura3d-root-material-contract/1.0",
      generatedAt: new Date().toISOString(),
      imports: runnerInfo.imports,
      renderer: {
        backend: rendererCapture.diagnostics.backend,
        runtimeBackend: rendererCapture.diagnostics.runtimeBackend,
        fallback: undefined,
        drawCalls: rendererCapture.diagnostics.drawCalls,
        renderSize: rendererCapture.diagnostics.renderSize
      },
      typedTextureAsset: runnerInfo.typedTextureAsset,
      features,
      publicHelpers: runnerInfo.publicHelpers,
      pass: failures.length === 0,
      failures
    };

    writeFileSync(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);

    expect(evidence.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence.renderer.backend).toBe("webgl2");
    expect(evidence.renderer.drawCalls).toBeGreaterThan(0);
    // Regression guard: `resize: false` on a container target used to leave the
    // engine-created canvas at the HTML default 300x150 backing store, so every
    // material measurement was taken from a tiny blurry upscale. The stage is
    // 720x480 CSS pixels at pixelRatio 1, so the backing store must be in that
    // range rather than the spec default.
    expect(evidence.renderer.renderSize?.[0]).toBeGreaterThan(600);
    expect(evidence.renderer.renderSize?.[1]).toBeGreaterThan(400);
    expect(evidence.typedTextureAsset.textureCount).toBeGreaterThan(0);
    expect(featureStatus(evidence, "base-color")).toBe("pass");
    expect(featureStatus(evidence, "metallic-roughness")).toBe("pass");
    expect(featureStatus(evidence, "emissive")).toBe("pass");
    expect(featureStatus(evidence, "alpha")).toBe("partial");
    expect(featureStatus(evidence, "base-color-texture")).toBe("partial");
    // Negative control: the same metric applied to the base-color pair must NOT
    // report a texture. Those two variants are an untextured sphere in two flat
    // colours, so a metric that any material swap could satisfy would wrongly
    // pass here. This is what makes the texture claim above discriminating
    // rather than merely a "the pixels changed" check.
    // The comparison is read from the captures recorded earlier in this run
    // rather than re-measured, because navigating to the typed-asset harness
    // discards the page-side capture store.
    const flatControlChromaA = captures.get("base-color-a")?.pixels.meanChroma ?? 0;
    const flatControlChromaB = captures.get("base-color-b")?.pixels.meanChroma ?? 0;
    const flatControlChromaRatioPasses = flatControlChromaA >= flatControlChromaB * 2 && flatControlChromaA >= 8;
    const flatControlRelativeDetailPasses =
      (captures.get("base-color-a")?.pixels.relativeLumaVariation ?? 0)
      > (captures.get("base-color-b")?.pixels.relativeLumaVariation ?? 0) * 1.15;
    expect(flatControlChromaRatioPasses && flatControlRelativeDetailPasses).toBe(false);

    // The controlled on/off comparison is the strong texture claim.
    expect(failedTextureChecks).toEqual([]);
    expect(featureStatus(evidence, "base-color-texture-controlled")).toBe("pass");
    expect(textureMetrics.changedPixelFraction).toBeGreaterThanOrEqual(0.2);
    expect(textureMetrics.meanChromaOn).toBeGreaterThanOrEqual(textureMetrics.meanChromaOff * 2);
    expect(textureMetrics.relativeLumaVariationOn).toBeGreaterThan(textureMetrics.relativeLumaVariationOff * 1.15);
    expect(featureStatus(evidence, "normal-map")).toBe("unsupported");
    expect(featureStatus(evidence, "glass-transmission")).toBe("partial");
    expect(evidence.publicHelpers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "material.glass", status: "partial" }),
      expect.objectContaining({ name: "material.physical", status: "partial" }),
      expect.objectContaining({ name: "material.emissive", status: "root-proven" })
    ]));
    expect(evidence.pass, JSON.stringify(evidence.failures, null, 2)).toBe(true);
    expect(errors).toEqual([]);
  });
});

async function captureVariant(page: Page, variantId: string, options: { readonly minNonBackgroundPixels?: number } = {}): Promise<{
  readonly capture: VariantCapture;
  readonly screenshotPath: string;
  readonly screenshotHash: string;
}> {
  const capture = await page.evaluate(async (id) => {
    const runner = (window as MaterialContractWindow).__AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__;
    if (!runner) throw new Error("Root material contract runner was not initialized.");
    return runner.renderVariant(id);
  }, variantId);
  const screenshotPath = `${reportDir}/${variantId}.png`;
  await page.locator("#material-contract-stage canvas").screenshot({ path: screenshotPath });
  const screenshotHash = sha256File(screenshotPath);
  expect(["webgl2-agent-runtime", "production-runtime"]).toContain(capture.diagnostics.runtimeBackend);
  expect(capture.diagnostics.drawCalls).toBeGreaterThan(0);
  expect(capture.pixels.nonBackgroundPixels).toBeGreaterThan(options.minNonBackgroundPixels ?? 1800);
  expect(capture.pixels.colorBuckets).toBeGreaterThan(2);
  return { capture, screenshotPath, screenshotHash };
}

async function compareVariants(page: Page, variantA: string, variantB: string): Promise<VariantComparison> {
  return page.evaluate(({ first, second }) => {
    const runner = (window as MaterialContractWindow).__AURA3D_ROOT_MATERIAL_CONTRACT_RUNNER__;
    if (!runner) throw new Error("Root material contract runner was not initialized.");
    return runner.compareVariants(first, second);
  }, { first: variantA, second: variantB });
}

function sha256File(path: string): string {
  const bytes = readFileSync(resolve(path));
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function featureStatus(evidence: RootMaterialContractEvidence, feature: string): FeatureStatus | undefined {
  return evidence.features.find((entry) => entry.feature === feature)?.status;
}

function contractFailures(features: readonly FeatureEvidence[]): readonly string[] {
  const requiredPasses = ["base-color", "metallic-roughness", "emissive"];
  const failures: string[] = [];
  for (const feature of requiredPasses) {
    const evidence = features.find((entry) => entry.feature === feature);
    if (evidence?.status !== "pass") failures.push(`${feature} is not root-proven by pixel delta.`);
  }
  for (const feature of features) {
    if (feature.status === "pass" && (!feature.hashA || (feature.screenshotB && !feature.hashB))) {
      failures.push(`${feature.feature} is marked pass without screenshot hashes.`);
    }
  }
  return failures;
}

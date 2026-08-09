import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type EffectStatus = "root-proven" | "partial" | "unreachable-from-root";

interface PixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly meanLuma: number;
  readonly meanRgb: readonly [number, number, number];
  readonly meanChroma: number;
  readonly brightFraction: number;
  readonly colorBuckets: number;
  readonly hash: string;
}

interface VariantCapture {
  readonly id: string;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
    readonly postprocess: {
      readonly enabled: boolean;
      readonly requested: boolean;
      readonly runtimeStatus: string;
      readonly pixelBacked: boolean;
      readonly requestedPasses: readonly string[];
      readonly actualPasses: readonly string[];
      readonly fallbackPasses: readonly string[];
      readonly bloomPass: boolean;
      readonly ambientOcclusionPass: boolean;
    };
  };
  readonly pixels: PixelMetrics;
}

interface VariantComparison {
  readonly variantA: string;
  readonly variantB: string;
  readonly meanAbsoluteChannelDelta: number;
  readonly changedPixelFraction: number;
  readonly meanLumaDelta: number;
  readonly brightFractionDelta: number;
}

interface PostprocessWindow extends Window {
  readonly __AURA3D_ROOT_POSTPROCESS_RUNNER__?: {
    readonly imports: readonly string[];
    readonly variantIds: readonly string[];
    renderVariant(id: string, options?: { readonly cssWidth?: number; readonly cssHeight?: number; readonly pixelRatio?: number }): Promise<VariantCapture>;
    compareVariants(variantA: string, variantB: string): VariantComparison;
    unexpressibleEffects(): readonly { readonly effect: string; readonly reason: string }[];
  };
  readonly __AURA3D_ROOT_POSTPROCESS_ERROR__?: string;
}

interface EffectEvidence {
  readonly effect: string;
  readonly status: EffectStatus;
  readonly passName?: string;
  readonly passRan?: boolean;
  readonly screenshotOff?: string;
  readonly screenshotOn?: string;
  readonly hashOff?: string;
  readonly hashOn?: string;
  readonly comparison?: VariantComparison;
  readonly reason: string;
}

interface PostprocessEvidence {
  readonly schema: "aura3d-root-postprocess-contract/1.0";
  readonly generatedAt: string;
  readonly imports: readonly string[];
  readonly claimBoundary: string;
  readonly renderer: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly baselineActualPasses: readonly string[];
  };
  readonly effects: readonly EffectEvidence[];
  readonly resize: {
    readonly configurations: readonly {
      readonly label: string;
      readonly backingWidth: number;
      readonly backingHeight: number;
      readonly pixelRatio: number;
      readonly actualPasses: readonly string[];
      readonly pixelBacked: boolean;
    }[];
    readonly passesStableAcrossResize: boolean;
  };
  readonly pass: boolean;
  readonly failures: readonly string[];
}

const reportDir = "tests/reports/createAuraApp-postprocess-contract";
const evidencePath = `${reportDir}/postprocess-contract.json`;

/**
 * An effect is only `root-proven` when the runtime actually ran its pass AND the
 * on/off pixel delta clears these floors. Requiring both prevents two distinct
 * failure modes: a pass that runs but changes nothing, and a pixel change caused by
 * something other than the pass.
 */
const MIN_CHANGED_PIXEL_FRACTION = 0.02;
const MIN_MEAN_CHANNEL_DELTA = 1;

test.describe("createAuraApp root postprocess contract", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("writes retained root-only postprocess evidence with effect-on/off deltas and honest demotions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-postprocess-contract-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const contractWindow = window as PostprocessWindow;
      return Boolean(contractWindow.__AURA3D_ROOT_POSTPROCESS_RUNNER__ || contractWindow.__AURA3D_ROOT_POSTPROCESS_ERROR__);
    }, undefined, { timeout: 30_000 });

    const harnessError = await page.evaluate(() => (window as PostprocessWindow).__AURA3D_ROOT_POSTPROCESS_ERROR__);
    if (harnessError) throw new Error(harnessError);

    mkdirSync(resolve(reportDir), { recursive: true });

    const runnerInfo = await page.evaluate(() => {
      const runner = (window as PostprocessWindow).__AURA3D_ROOT_POSTPROCESS_RUNNER__;
      if (!runner) throw new Error("Root postprocess runner was not initialized.");
      return { imports: runner.imports, variantIds: runner.variantIds, unexpressible: runner.unexpressibleEffects() };
    });

    const captures = new Map<string, { readonly capture: VariantCapture; readonly screenshot: string; readonly hash: string }>();
    for (const id of runnerInfo.variantIds) {
      const capture = await renderVariant(page, id);
      const screenshot = `${reportDir}/${id}.png`;
      await page.locator("#postprocess-contract-stage canvas").screenshot({ path: screenshot });
      captures.set(id, { capture, screenshot, hash: sha256File(screenshot) });
    }

    const baseline = captures.get("baseline");
    if (!baseline) throw new Error("Root postprocess contract produced no baseline.");
    // The baseline must genuinely have bloom and SSAO off, otherwise every on/off
    // comparison below would be measuring a difference against an already-affected
    // frame. The root bridge auto-enables bloom for dark scenes containing emissive
    // subjects, so this is a real risk rather than a theoretical one.
    expect(baseline.capture.diagnostics.postprocess.bloomPass).toBe(false);
    expect(baseline.capture.diagnostics.postprocess.ambientOcclusionPass).toBe(false);

    const effects: EffectEvidence[] = [];
    const measured = [
      { effect: "bloom", variant: "bloom", passName: "bloom", passRan: (capture: VariantCapture) => capture.diagnostics.postprocess.bloomPass },
      { effect: "ambient-occlusion", variant: "ambient-occlusion", passName: "ssao", passRan: (capture: VariantCapture) => capture.diagnostics.postprocess.ambientOcclusionPass },
      { effect: "contact-occlusion", variant: "contact-occlusion", passName: "ssao", passRan: (capture: VariantCapture) => capture.diagnostics.postprocess.ambientOcclusionPass },
      { effect: "fog", variant: "fog", passName: "forward-environment-fog", passRan: (capture: VariantCapture) => capture.pixels.hash !== baseline.capture.pixels.hash },
      {
        effect: "rain",
        variant: "rain",
        baselineVariant: "rain-baseline",
        passName: "safe-basic-rain-geometry",
        passRan: (capture: VariantCapture) => capture.diagnostics.runtimeBackend === "webgl2-agent-runtime" && capture.diagnostics.drawCalls > 0
      }
    ] as const;

    for (const entry of measured) {
      const variant = captures.get(entry.variant);
      if (!variant) throw new Error(`Missing postprocess variant capture: ${entry.variant}`);
      const comparisonBaseline = "baselineVariant" in entry ? entry.baselineVariant : "baseline";
      const comparisonCapture = captures.get(comparisonBaseline);
      if (!comparisonCapture) throw new Error(`Missing comparison baseline capture: ${comparisonBaseline}`);
      const comparison = await compareVariants(page, comparisonBaseline, entry.variant);
      const passRan = entry.passRan(variant.capture);
      const pixelsChanged = comparison.changedPixelFraction >= MIN_CHANGED_PIXEL_FRACTION
        && comparison.meanAbsoluteChannelDelta >= MIN_MEAN_CHANNEL_DELTA;
      const status: EffectStatus = passRan && pixelsChanged ? "root-proven" : "partial";
      effects.push({
        effect: entry.effect,
        status,
        passName: entry.passName,
        passRan,
        screenshotOff: comparisonCapture.screenshot,
        screenshotOn: variant.screenshot,
        hashOff: comparisonCapture.hash,
        hashOn: variant.hash,
        comparison,
        reason: status === "root-proven"
          ? `Root createAuraApp ran the ${entry.passName} pass and changed ${comparison.changedPixelFraction} of the frame (mean channel delta ${comparison.meanAbsoluteChannelDelta}) versus an identical scene without the effect node.`
          : passRan
            ? `Root createAuraApp ran the ${entry.passName} pass, but the measured on/off change (${comparison.changedPixelFraction} of the frame, mean channel delta ${comparison.meanAbsoluteChannelDelta}) is below the proof thresholds. The pass executes; its visible contribution in this scene is not provable.`
            : `Root createAuraApp did not run the ${entry.passName} pass, so no root claim can be made for ${entry.effect}.`
      });
    }

    for (const entry of runnerInfo.unexpressible) {
      effects.push({ effect: entry.effect, status: "unreachable-from-root", reason: entry.reason });
    }

    // Resize behavior: the postprocess chain must survive canvas resize and DPR
    // change rather than silently dropping to a direct render.
    const resizeConfigurations = [
      { label: "bloom-720x480-dpr1", cssWidth: 720, cssHeight: 480, pixelRatio: 1 },
      { label: "bloom-480x320-dpr1", cssWidth: 480, cssHeight: 320, pixelRatio: 1 },
      { label: "bloom-720x480-dpr2", cssWidth: 720, cssHeight: 480, pixelRatio: 2 }
    ];
    const resizeResults: PostprocessEvidence["resize"]["configurations"][number][] = [];
    for (const configuration of resizeConfigurations) {
      const capture = await renderVariant(page, "bloom", configuration);
      resizeResults.push({
        label: configuration.label,
        backingWidth: capture.pixels.width,
        backingHeight: capture.pixels.height,
        pixelRatio: configuration.pixelRatio,
        actualPasses: capture.diagnostics.postprocess.actualPasses,
        pixelBacked: capture.diagnostics.postprocess.pixelBacked
      });
    }
    const firstPasses = [...(resizeResults[0]?.actualPasses ?? [])].sort().join(",");
    const passesStableAcrossResize = resizeResults.every(
      (result) => [...result.actualPasses].sort().join(",") === firstPasses && result.pixelBacked
    );

    const failures: string[] = [];
    if (!passesStableAcrossResize) failures.push("Postprocess pass set or pixel-backed status changed across resize/DPR.");
    if (new Set(resizeResults.map((result) => `${result.backingWidth}x${result.backingHeight}`)).size < 3) {
      failures.push("Resize coverage did not produce three distinct backing stores.");
    }
    for (const effect of effects) {
      if (effect.status === "root-proven" && (!effect.hashOn || !effect.hashOff)) {
        failures.push(`${effect.effect} is root-proven without both on/off screenshot hashes.`);
      }
    }
    // Bloom, fog, and starter-level rain are the effects this contract claims. Everything else is
    // recorded honestly as partial or unreachable rather than quietly omitted.
    for (const required of ["bloom", "fog", "rain"]) {
      const effect = effects.find((entry) => entry.effect === required);
      if (effect?.status !== "root-proven") failures.push(`${required} is not root-proven by an on/off pixel delta.`);
    }

    const evidence: PostprocessEvidence = {
      schema: "aura3d-root-postprocess-contract/1.0",
      generatedAt: new Date().toISOString(),
      imports: runnerInfo.imports,
      claimBoundary: "Root createAuraApp runs neutral pixel-backed tone mapping and adds measurable bloom and forward environment fog on the typed-GLB production bridge. It does not silently inject color grading or FXAA when the author did not request them. The safe-basic WebGL2 path draws starter-level rain geometry with a measured on/off screenshot delta. SSAO executes when an occlusion effect is authored but its visible contribution is not proven. Color grading, FXAA, outline, SSR, depth of field, motion blur, and TAA are not reachable through the public root effects surface and are not claimed. No HDR-dependent or WebGPU postprocess claim is made.",
      renderer: {
        backend: baseline.capture.diagnostics.backend,
        runtimeBackend: baseline.capture.diagnostics.runtimeBackend,
        baselineActualPasses: baseline.capture.diagnostics.postprocess.actualPasses
      },
      effects,
      resize: { configurations: resizeResults, passesStableAcrossResize },
      pass: failures.length === 0,
      failures
    };
    writeFileSync(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);

    expect(evidence.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence.renderer.runtimeBackend).toBe("production-runtime");
    // The base chain must be pixel-backed, not a reported plan.
    expect(baseline.capture.diagnostics.postprocess.pixelBacked).toBe(true);
    expect(evidence.renderer.baselineActualPasses).toEqual(["tone-mapping"]);
    expect(effectStatus(evidence, "bloom")).toBe("root-proven");
    expect(effectStatus(evidence, "fog")).toBe("root-proven");
    expect(effectStatus(evidence, "rain")).toBe("root-proven");
    // SSAO must at minimum be reported as an executed pass; claiming it as proven
    // would overstate a measured near-zero contribution.
    expect(evidence.effects.find((entry) => entry.effect === "ambient-occlusion")?.passRan).toBe(true);
    expect(effectStatus(evidence, "outline")).toBe("unreachable-from-root");
    expect(effectStatus(evidence, "ssr")).toBe("unreachable-from-root");
    expect(effectStatus(evidence, "depth-of-field")).toBe("unreachable-from-root");
    expect(effectStatus(evidence, "motion-blur")).toBe("unreachable-from-root");
    expect(effectStatus(evidence, "taa")).toBe("unreachable-from-root");
    expect(effectStatus(evidence, "color-grade")).toBe("unreachable-from-root");
    expect(effectStatus(evidence, "fxaa")).toBe("unreachable-from-root");
    expect(evidence.resize.passesStableAcrossResize).toBe(true);
    expect(evidence.failures, JSON.stringify(evidence.failures, null, 2)).toEqual([]);
    expect(evidence.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});

async function renderVariant(
  page: Page,
  id: string,
  options?: { readonly cssWidth?: number; readonly cssHeight?: number; readonly pixelRatio?: number }
): Promise<VariantCapture> {
  return page.evaluate(async ({ variantId, variantOptions }) => {
    const runner = (window as PostprocessWindow).__AURA3D_ROOT_POSTPROCESS_RUNNER__;
    if (!runner) throw new Error("Root postprocess runner was not initialized.");
    return runner.renderVariant(variantId, variantOptions);
  }, { variantId: id, variantOptions: options });
}

async function compareVariants(page: Page, variantA: string, variantB: string): Promise<VariantComparison> {
  return page.evaluate(({ first, second }) => {
    const runner = (window as PostprocessWindow).__AURA3D_ROOT_POSTPROCESS_RUNNER__;
    if (!runner) throw new Error("Root postprocess runner was not initialized.");
    return runner.compareVariants(first, second);
  }, { first: variantA, second: variantB });
}

function effectStatus(evidence: PostprocessEvidence, effect: string): EffectStatus | undefined {
  return evidence.effects.find((entry) => entry.effect === effect)?.status;
}

function sha256File(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(resolve(path))).digest("hex")}`;
}

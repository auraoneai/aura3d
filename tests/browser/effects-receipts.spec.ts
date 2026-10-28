import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import type { FrameComparison, FrameResult } from "./receipts-harness";
import {
  compareFrames,
  engineVersion,
  gitSha,
  logMetrics,
  openHarness,
  receiptRenderer,
  renderEffect,
  rendererString,
  saveFrame,
  writeReceipt,
  type Receipt
} from "./receipts-lib";

/**
 * Per-effect pixel receipts (PRD beat-three.js WP-K.1): AO, colour grade, vignette,
 * depth of field, contact shadows. Each effect is rendered as an on/off pair against the same
 * scene through the public root API; a receipt is written only when the runtime ran cleanly
 * AND the measured pixel change has the direction and size the effect promises.
 */

const SPEC = "tests/browser/effects-receipts.spec.ts";
const SCENE = "tests/browser/receipts-harness.ts effectScene(): typed GLB subject, floor, reference bar, far colour block, one directional light";

interface EffectCase {
  readonly capability: string;
  readonly variant: string;
  readonly describe: string;
  /** Returns a map of named boolean checks; every check must be true for a receipt. */
  readonly checks: (off: FrameResult, on: FrameResult, delta: FrameComparison) => Readonly<Record<string, boolean>>;
  /** Optional second on-variant of the same capability (its checks are prefixed with the variant id). */
  readonly extra?: {
    readonly variant: string;
    readonly checks: (off: FrameResult, on: FrameResult, delta: FrameComparison) => Readonly<Record<string, boolean>>;
  };
}

const cases: readonly EffectCase[] = [
  {
    capability: "effects-ambient-occlusion",
    variant: "fx-ambient-occlusion",
    describe: "effects.ambientOcclusion darkens occluded regions through the ssao pass",
    checks: (off, on, delta) => ({
      ssaoPassRan: on.diagnostics.ambientOcclusionPass,
      baselineHasNoSsao: !off.diagnostics.ambientOcclusionPass,
      changedPixelFractionAtLeast2pc: delta.changedPixelFraction >= 0.02,
      meanChannelDeltaAtLeast1: delta.meanAbsoluteChannelDelta >= 1,
      darkens: delta.meanLumaDelta < 0
    })
  },
  {
    capability: "effects-color-grade",
    variant: "fx-color-grade-desaturate",
    describe: "effects.colorGrade({ saturation: 0 }) removes chroma",
    checks: (off, on, delta) => ({
      baselineHasChroma: off.metrics.meanChroma > 6,
      chromaCollapsed: on.metrics.meanChroma < off.metrics.meanChroma * 0.25,
      changedPixelFractionAtLeast2pc: delta.changedPixelFraction >= 0.02
    }),
    extra: {
      variant: "fx-color-grade-contrast",
      checks: (off, on, delta) => ({
        lumaSpreadIncreased: on.metrics.lumaStd >= off.metrics.lumaStd * 1.1,
        changedPixelFractionAtLeast5pc: delta.changedPixelFraction >= 0.05
      })
    }
  },
  {
    capability: "effects-vignette",
    variant: "fx-vignette",
    describe: "effects.vignette darkens the corners and leaves the centre",
    checks: (off, on, delta) => ({
      cornersDarker: on.metrics.cornerLuma <= off.metrics.cornerLuma * 0.85,
      centreNearlyUnchanged: Math.abs(on.metrics.centerLuma - off.metrics.centerLuma) <= off.metrics.centerLuma * 0.15 + 2,
      changedPixelFractionAtLeast2pc: delta.changedPixelFraction >= 0.02
    })
  },
  {
    capability: "effects-depth-of-field",
    variant: "fx-depth-of-field",
    describe: "effects.depthOfField blurs out-of-focus depth (lower edge energy)",
    checks: (off, on, delta) => ({
      edgeEnergyReduced: on.metrics.edgeEnergy <= off.metrics.edgeEnergy * 0.95,
      changedPixelFractionAtLeast2pc: delta.changedPixelFraction >= 0.02
    })
  },
  {
    capability: "effects-contact-shadows",
    variant: "fx-contact-shadows",
    describe: "effects.contactShadows darkens the floor under the subject",
    checks: (off, on, delta) => ({
      darkensFrame: delta.meanLumaDelta < 0,
      darkensFloorUnderSubject: on.metrics.lowerCenterLuma < off.metrics.lowerCenterLuma,
      changedPixelFractionAtLeast0p3pc: delta.changedPixelFraction >= 0.003
    })
  }
];

test.describe("effect pixel receipts", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;
  let page: Page;
  let baseline: FrameResult;
  let renderer = "";
  const version = engineVersion();
  const sha = gitSha();
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`);
    });
    await openHarness(page, server.origin);
    renderer = receiptRenderer(await rendererString(page));
    baseline = await renderEffect(page, "fx-baseline");
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  test("baseline frame is a clean, lit, ssao-free reference", () => {
    logMetrics("fx-baseline", { renderer, metrics: baseline.metrics, diagnostics: baseline.diagnostics });
    expect(baseline.diagnostics.errors).toEqual([]);
    expect(baseline.diagnostics.drawCalls).toBeGreaterThan(0);
    expect(baseline.metrics.nonBlackRatio).toBeGreaterThan(0.1);
    expect(baseline.diagnostics.ambientOcclusionPass).toBe(false);
  });

  for (const entry of cases) {
    test(`${entry.capability}: ${entry.describe}`, async () => {
      const on = await renderEffect(page, entry.variant);
      const delta = await compareFrames(page, "fx-baseline", entry.variant);
      const checks: Record<string, boolean> = {
        noRuntimeErrors: on.diagnostics.errors.length === 0,
        drew: on.diagnostics.drawCalls > 0,
        ...entry.checks(baseline, on, delta)
      };
      logMetrics(entry.variant, { metrics: on.metrics, baseline: baseline.metrics, delta, diagnostics: on.diagnostics, checks });
      let extraOn: FrameResult | undefined;
      let extraDelta: FrameComparison | undefined;
      if (entry.extra) {
        extraOn = await renderEffect(page, entry.extra.variant);
        extraDelta = await compareFrames(page, "fx-baseline", entry.extra.variant);
        const extraChecks: Record<string, boolean> = {
          noRuntimeErrors: extraOn.diagnostics.errors.length === 0,
          drew: extraOn.diagnostics.drawCalls > 0,
          ...entry.extra.checks(baseline, extraOn, extraDelta)
        };
        logMetrics(entry.extra.variant, { metrics: extraOn.metrics, baseline: baseline.metrics, delta: extraDelta, diagnostics: extraOn.diagnostics, checks: extraChecks });
        for (const [name, ok] of Object.entries(extraChecks)) checks[`${entry.extra.variant}:${name}`] = ok;
      }
      const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
      expect(failed, `${entry.capability} receipt checks failed (metrics logged above)`).toEqual([]);

      const baselineFrame = saveFrame(baseline, `evidence/receipts/_shared/${version}/fx-baseline.png`, "effect off (baseline)");
      const onFrame = saveFrame(on, `evidence/receipts/${entry.capability}/${version}/${entry.variant}.png`, `effect on (${entry.variant})`);
      const extraFrame = entry.extra && extraOn ? saveFrame(extraOn, `evidence/receipts/${entry.capability}/${version}/${entry.extra.variant}.png`, `effect on (${entry.extra.variant})`) : undefined;
      const receipt: Receipt = {
        capability: entry.capability,
        version,
        gitSha: sha,
        renderer,
        scene: SCENE,
        frames: extraFrame ? [baselineFrame, onFrame, extraFrame] : [baselineFrame, onFrame],
        tests: [SPEC],
        date: new Date().toISOString(),
        checks: {
          ...checks,
          changedPixelFraction: delta.changedPixelFraction,
          meanAbsoluteChannelDelta: delta.meanAbsoluteChannelDelta,
          meanLumaDelta: delta.meanLumaDelta,
          actualPasses: on.diagnostics.actualPasses.join(","),
          ...(extraDelta ? { contrastChangedPixelFraction: extraDelta.changedPixelFraction } : {})
        }
      };
      writeReceipt(receipt);
    });
  }

  test("no page errors or console errors during the receipt runs", () => {
    expect(consoleProblems).toEqual([]);
  });
});

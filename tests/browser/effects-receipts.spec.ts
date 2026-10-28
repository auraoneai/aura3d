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
 *
 * The off frame must take the same post chain as the on frame, or the diff measures the chain
 * (direct render versus tone-mapped LDR post) and not the effect. The 4.3.7 AO and colour-grade
 * receipts passed only because the off frame was untonemapped; 4.5.0 tone-maps the direct path too,
 * which exposed it. So AO, contact shadows and the contrast variant use an own off frame: the same
 * scene with the same effect node neutralised (intensity 0 or an identity grade).
 */

const SPEC = "tests/browser/effects-receipts.spec.ts";
const SCENE = "tests/browser/receipts-harness.ts effectScene(): typed GLB subject, floor, reference bar, far colour block, one directional light";
const ROOM_SCENE = "tests/browser/receipts-harness.ts occlusionRoom(): floor, two walls in a concave corner, two crates resting against them, directional key plus hemisphere fill; off frame = same node at intensity 0";
const CARD_SCENE = "tests/browser/receipts-harness.ts cardScene(): eleven evenly lit grey tiles (24..240) on a mid-grey field; off frame = identity colour grade";

interface EffectCase {
  readonly capability: string;
  readonly variant: string;
  readonly describe: string;
  /** Scene description stored in the receipt. */
  readonly scene?: string;
  /** Own off frame (same post chain, effect neutralised). Defaults to the shared `fx-baseline`. */
  readonly off?: string;
  /** Returns a map of named boolean checks; every check must be true for a receipt. */
  readonly checks: (off: FrameResult, on: FrameResult, delta: FrameComparison) => Readonly<Record<string, boolean>>;
  /** Set when the case is known to miss its checks in this release; the test runs as test.fail and writes no receipt. */
  readonly expectedFail?: string;
  /** Optional second on-variant of the same capability (its checks are prefixed with the variant id). */
  readonly extra?: {
    readonly variant: string;
    readonly off?: string;
    readonly scene?: string;
    readonly checks: (off: FrameResult, on: FrameResult, delta: FrameComparison) => Readonly<Record<string, boolean>>;
  };
}

const cases: readonly EffectCase[] = [
  {
    capability: "effects-ambient-occlusion",
    variant: "fx-ao-room",
    off: "fx-ao-room-off",
    scene: ROOM_SCENE,
    describe: "effects.ambientOcclusion darkens the indirect light in creases through the v2 GTAO stage",
    checks: (off, on, delta) => ({
      aoRequested: on.diagnostics.ambientOcclusionPass,
      v2ChainServedBothFrames: on.diagnostics.post.v2Outcome === "v2" && off.diagnostics.post.v2Outcome === "v2",
      offFrameSameChain: off.diagnostics.actualPasses.join(",") === on.diagnostics.actualPasses.join(","),
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
      variant: "fx-card-contrast",
      off: "fx-card-off",
      scene: CARD_SCENE,
      checks: (off, on, delta) => ({
        offFrameSameChain: off.diagnostics.actualPasses.join(",") === on.diagnostics.actualPasses.join(","),
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
  }
  // effects-contact-shadows moved to tests/browser/contact-shadow-mask.spec.ts (PRD-2 WP-4): the effect is a real
  // screen-space mask sampled by forward lighting, no longer the SSAO lowering this on/off pair used to measure.
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

  const rendered = new Map<string, FrameResult>();
  const frameFor = async (variant: string): Promise<FrameResult> => {
    if (variant === "fx-baseline") return baseline;
    const cached = rendered.get(variant);
    if (cached) return cached;
    const frame = await renderEffect(page, variant);
    rendered.set(variant, frame);
    return frame;
  };
  const offLabel = (variant: string, explicit: boolean) => (explicit ? `effect off (${variant})` : "effect off (baseline)");
  const offPath = (capability: string, off: string, explicit: boolean) =>
    explicit ? `evidence/receipts/${capability}/${version}/${off}.png` : `evidence/receipts/_shared/${version}/fx-baseline.png`;

  for (const entry of cases) {
    test(`${entry.capability}: ${entry.describe}`, async () => {
      if (entry.expectedFail !== undefined) test.fail(true, entry.expectedFail);
      const offVariant = entry.off ?? "fx-baseline";
      const off = await frameFor(offVariant);
      const on = await frameFor(entry.variant);
      const delta = await compareFrames(page, offVariant, entry.variant);
      const checks: Record<string, boolean> = {
        noRuntimeErrors: on.diagnostics.errors.length === 0 && off.diagnostics.errors.length === 0,
        drew: on.diagnostics.drawCalls > 0,
        ...entry.checks(off, on, delta)
      };
      logMetrics(entry.variant, { metrics: on.metrics, off: off.metrics, offVariant, delta, diagnostics: on.diagnostics, offDiagnostics: off.diagnostics, checks });
      let extraOff: FrameResult | undefined;
      let extraOn: FrameResult | undefined;
      let extraDelta: FrameComparison | undefined;
      if (entry.extra) {
        const extraOffVariant = entry.extra.off ?? "fx-baseline";
        extraOff = await frameFor(extraOffVariant);
        extraOn = await frameFor(entry.extra.variant);
        extraDelta = await compareFrames(page, extraOffVariant, entry.extra.variant);
        const extraChecks: Record<string, boolean> = {
          noRuntimeErrors: extraOn.diagnostics.errors.length === 0 && extraOff.diagnostics.errors.length === 0,
          drew: extraOn.diagnostics.drawCalls > 0,
          ...entry.extra.checks(extraOff, extraOn, extraDelta)
        };
        logMetrics(entry.extra.variant, { metrics: extraOn.metrics, off: extraOff.metrics, offVariant: extraOffVariant, delta: extraDelta, diagnostics: extraOn.diagnostics, offDiagnostics: extraOff.diagnostics, checks: extraChecks });
        for (const [name, ok] of Object.entries(extraChecks)) checks[`${entry.extra.variant}:${name}`] = ok;
      }
      const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
      expect(failed, `${entry.capability} receipt checks failed (metrics logged above)`).toEqual([]);

      const frames = [
        saveFrame(off, offPath(entry.capability, offVariant, entry.off !== undefined), offLabel(offVariant, entry.off !== undefined)),
        saveFrame(on, `evidence/receipts/${entry.capability}/${version}/${entry.variant}.png`, `effect on (${entry.variant})`)
      ];
      if (entry.extra && extraOn && extraOff) {
        if (entry.extra.off !== undefined) {
          frames.push(saveFrame(extraOff, offPath(entry.capability, entry.extra.off, true), offLabel(entry.extra.off, true)));
        }
        frames.push(saveFrame(extraOn, `evidence/receipts/${entry.capability}/${version}/${entry.extra.variant}.png`, `effect on (${entry.extra.variant})`));
      }
      const receipt: Receipt = {
        capability: entry.capability,
        version,
        gitSha: sha,
        renderer,
        scene: entry.extra?.scene ? `${entry.scene ?? SCENE}; ${entry.extra.variant}: ${entry.extra.scene}` : entry.scene ?? SCENE,
        frames,
        tests: [SPEC],
        date: new Date().toISOString(),
        checks: {
          ...checks,
          changedPixelFraction: delta.changedPixelFraction,
          meanAbsoluteChannelDelta: delta.meanAbsoluteChannelDelta,
          meanLumaDelta: delta.meanLumaDelta,
          actualPasses: on.diagnostics.actualPasses.join(","),
          ...(extraDelta ? {
            contrastChangedPixelFraction: extraDelta.changedPixelFraction,
            contrastMeanAbsoluteChannelDelta: extraDelta.meanAbsoluteChannelDelta,
            contrastLumaStdOff: extraOff?.metrics.lumaStd ?? 0,
            contrastLumaStdOn: extraOn?.metrics.lumaStd ?? 0
          } : {})
        }
      };
      writeReceipt(receipt);
    });
  }

  test("no page errors or console errors during the receipt runs", () => {
    expect(consoleProblems).toEqual([]);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import type { ContactMaskComparison, ContactMaskFrame, ContactMaskVariant } from "./receipts-harness";
import {
  compareContactMask,
  engineVersion,
  gitSha,
  logMetrics,
  openHarness,
  receiptRenderer,
  renderContactMask,
  rendererString,
  saveFrame,
  writeReceipt,
  type Receipt
} from "./receipts-lib";

/**
 * Contact-shadow mask receipt (PRD beat-three.js part 2, WP-4 / section 2.3).
 *
 * `effects.contactShadows()` produces a screen-space mask in the `shadows` frame phase and forward lighting
 * multiplies it into the shadow-casting light's visibility (`u_contactShadowMask`). It used to be lowered to the
 * SSAO contact-occlusion pass; the receipt below is the gate for that lowering's removal, so every check here must
 * hold for the receipt to be written.
 *
 * Two on/off pairs against the same scene (floor, box subject, one shadow-casting directional light). "Off" is the same
 * effect node at intensity 0, so both frames take the same post route and only the mask differs ("effect absent" is the
 * shader's constant-1.0 path, covered in tests/unit/rendering/contact-shadow-mask.test.ts):
 *  - nocast:   the subject does not cast a shadow-map shadow, so the shadow map cannot darken the floor and the
 *              on/off delta is attributable to the mask alone. Floor at the subject's base must darken, far floor must not.
 *  - shadowed: the subject casts a normal shadow-map shadow (the realistic case). The mask must not brighten anything
 *              and must leave the far floor untouched; its near-base delta is recorded, not asserted to a size, because the
 *              shadow map already removes most direct light there.
 *
 * Thresholds were fixed before the first measurement and are not adjusted to the result.
 */

const SPEC = "tests/browser/contact-shadow-mask.spec.ts";
const UNIT = "tests/unit/rendering/contact-shadow-mask.test.ts";
const SCENE = "tests/browser/receipts-harness.ts contactMaskScene(): grey PBR floor, 0.9 m box subject on it, one directional key light (2.6, 4.2, 2.4); nocast = subject outside the shadow map, shadowed = subject casts; only the contactShadows node differs";

const NEAR_DARKEN_AT_LEAST = 1; // mean luma (0..255) in the floor patch at the subject's base
const NEAR_CHANGED_FRACTION_AT_LEAST = 0.05;
const FAR_DELTA_AT_MOST = 0.25;
const FAR_CHANGED_FRACTION_AT_MOST = 0.001;
const BRIGHTENED_FRACTION_AT_MOST = 0.0005;
const WHOLE_CHANGED_FRACTION_AT_LEAST = 0.001;

test.describe("contact shadow mask receipt", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;
  let page: Page;
  let renderer = "";
  const version = engineVersion();
  const sha = gitSha();
  const consoleProblems: string[] = [];
  const frames = new Map<ContactMaskVariant, ContactMaskFrame>();
  const comparisons = new Map<string, ContactMaskComparison>();

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`);
    });
    await openHarness(page, server.origin);
    renderer = receiptRenderer(await rendererString(page));
    for (const id of ["cm-nocast-off", "cm-nocast-on", "cm-shadowed-off", "cm-shadowed-on"] as const) {
      frames.set(id, await renderContactMask(page, id));
    }
    comparisons.set("nocast", await compareContactMask(page, "cm-nocast-off", "cm-nocast-on"));
    comparisons.set("shadowed", await compareContactMask(page, "cm-shadowed-off", "cm-shadowed-on"));
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  const frame = (id: ContactMaskVariant): ContactMaskFrame => frames.get(id)!;

  test("all four frames render cleanly and the mask pass ran on the effect-on frames", () => {
    for (const [id, result] of frames) {
      logMetrics(id, { metrics: result.metrics, diagnostics: result.diagnostics, contactShadows: result.contactShadows, ssaoRequested: result.ssaoRequested });
      expect(result.diagnostics.errors, id).toEqual([]);
      expect(result.diagnostics.drawCalls, id).toBeGreaterThan(0);
      expect(result.metrics.nonBlackRatio, id).toBeGreaterThan(0.1);
      // The retired lowering: no SSAO pass may stand in for the mask.
      expect(result.ssaoRequested, `${id} must not request ssao`).toBe(false);
    }
    for (const id of ["cm-nocast-on", "cm-shadowed-on"] as const) {
      expect(frame(id).contactShadows, id).toMatchObject({ passExecuted: true, depthSource: "self" });
    }
    // The mask reaches shading: a non-trivial mask was produced and every forward draw bound it.
    for (const id of ["cm-nocast-on", "cm-shadowed-on"] as const) {
      const probe = (frame(id).contactShadows as { probe?: { mask?: { fractionBelow098: number } | null; drawCounters?: { calls: number; reflectingDraws: number; maskedDraws: number } } } | null)?.probe;
      expect(probe?.mask?.fractionBelow098, `${id} mask has occluded texels`).toBeGreaterThan(0);
      expect(probe?.drawCounters?.maskedDraws, `${id} draws bound the mask`).toBeGreaterThan(0);
    }
    for (const kind of ["nocast", "shadowed"] as const) {
      expect(frame(`cm-${kind}-on`).diagnostics.actualPasses, kind).toEqual(frame(`cm-${kind}-off`).diagnostics.actualPasses);
      expect(frame(`cm-${kind}-on`).diagnostics.drawCalls, kind).toBe(frame(`cm-${kind}-off`).diagnostics.drawCalls);
    }
  });

  test("nocast pair: floor at the subject's base darkens, far floor does not, nothing brightens", () => {
    const delta = comparisons.get("nocast")!;
    logMetrics("cm-nocast-delta", delta);
    const near = delta.regions.floorAtSubjectBase!;
    const far = delta.regions.farFloor!;
    expect(near.pixels, "near patch must project onto the frame").toBeGreaterThan(50);
    expect(far.pixels, "far patch must project onto the frame").toBeGreaterThan(50);
    expect(near.meanLumaDelta).toBeLessThanOrEqual(-NEAR_DARKEN_AT_LEAST);
    expect(near.changedFraction).toBeGreaterThanOrEqual(NEAR_CHANGED_FRACTION_AT_LEAST);
    expect(Math.abs(far.meanLumaDelta)).toBeLessThanOrEqual(FAR_DELTA_AT_MOST);
    expect(far.changedFraction).toBeLessThanOrEqual(FAR_CHANGED_FRACTION_AT_MOST);
    expect(delta.whole.brightenedFraction).toBeLessThanOrEqual(BRIGHTENED_FRACTION_AT_MOST);
    expect(delta.whole.changedFraction).toBeGreaterThanOrEqual(WHOLE_CHANGED_FRACTION_AT_LEAST);
    expect(delta.whole.meanLumaDelta).toBeLessThan(0);
  });

  test("shadowed pair: the mask never brightens and leaves the far floor untouched", () => {
    const delta = comparisons.get("shadowed")!;
    logMetrics("cm-shadowed-delta", delta);
    const near = delta.regions.floorAtSubjectBase!;
    const far = delta.regions.farFloor!;
    expect(far.pixels).toBeGreaterThan(50);
    expect(Math.abs(far.meanLumaDelta)).toBeLessThanOrEqual(FAR_DELTA_AT_MOST);
    expect(far.changedFraction).toBeLessThanOrEqual(FAR_CHANGED_FRACTION_AT_MOST);
    expect(near.meanLumaDelta).toBeLessThanOrEqual(FAR_DELTA_AT_MOST);
    expect(delta.whole.brightenedFraction).toBeLessThanOrEqual(BRIGHTENED_FRACTION_AT_MOST);
  });

  test("writes the receipt only when every check above held", () => {
    const nocast = comparisons.get("nocast")!;
    const shadowed = comparisons.get("shadowed")!;
    const nearNocast = nocast.regions.floorAtSubjectBase!;
    const farNocast = nocast.regions.farFloor!;
    const nearShadowed = shadowed.regions.floorAtSubjectBase!;
    const farShadowed = shadowed.regions.farFloor!;
    const passed = nearNocast.meanLumaDelta <= -NEAR_DARKEN_AT_LEAST
      && nearNocast.changedFraction >= NEAR_CHANGED_FRACTION_AT_LEAST
      && Math.abs(farNocast.meanLumaDelta) <= FAR_DELTA_AT_MOST
      && farNocast.changedFraction <= FAR_CHANGED_FRACTION_AT_MOST
      && nocast.whole.brightenedFraction <= BRIGHTENED_FRACTION_AT_MOST
      && nocast.whole.meanLumaDelta < 0
      && Math.abs(farShadowed.meanLumaDelta) <= FAR_DELTA_AT_MOST
      && farShadowed.changedFraction <= FAR_CHANGED_FRACTION_AT_MOST
      && nearShadowed.meanLumaDelta <= FAR_DELTA_AT_MOST
      && shadowed.whole.brightenedFraction <= BRIGHTENED_FRACTION_AT_MOST
      && frame("cm-nocast-on").contactShadows?.passExecuted === true
      && frame("cm-shadowed-on").contactShadows?.passExecuted === true
      && ["cm-nocast-off", "cm-nocast-on", "cm-shadowed-off", "cm-shadowed-on"].every((id) => !frame(id as ContactMaskVariant).ssaoRequested);
    expect(passed, "contact-shadow mask receipt checks").toBe(true);
    expect(consoleProblems).toEqual([]);

    const dir = `evidence/receipts/effects-contact-shadows/${version}`;
    const saved = [
      saveFrame(frame("cm-nocast-off"), `${dir}/cm-nocast-off.png`, "effect at intensity 0, subject outside the shadow map"),
      saveFrame(frame("cm-nocast-on"), `${dir}/cm-nocast-on.png`, "effect on, subject outside the shadow map (mask only)"),
      saveFrame(frame("cm-shadowed-off"), `${dir}/cm-shadowed-off.png`, "effect at intensity 0, subject casts a shadow-map shadow"),
      saveFrame(frame("cm-shadowed-on"), `${dir}/cm-shadowed-on.png`, "effect on, subject casts a shadow-map shadow")
    ];
    const receipt: Receipt = {
      capability: "effects-contact-shadows",
      version,
      gitSha: sha,
      renderer,
      scene: SCENE,
      frames: saved,
      tests: [SPEC, UNIT],
      date: new Date().toISOString(),
      checks: {
        passed: true,
        maskPassExecuted: true,
        maskDepthSource: frame("cm-nocast-on").contactShadows?.depthSource ?? "none",
        ssaoLoweringUsed: false,
        nocastNearFloorLumaDelta: nearNocast.meanLumaDelta,
        nocastNearFloorChangedFraction: nearNocast.changedFraction,
        nocastFarFloorLumaDelta: farNocast.meanLumaDelta,
        nocastFarFloorChangedFraction: farNocast.changedFraction,
        nocastBrightenedFraction: nocast.whole.brightenedFraction,
        nocastWholeFrameLumaDelta: nocast.whole.meanLumaDelta,
        nocastChangedPixelFraction: nocast.whole.changedFraction,
        shadowedNearFloorLumaDelta: nearShadowed.meanLumaDelta,
        shadowedFarFloorLumaDelta: farShadowed.meanLumaDelta,
        shadowedBrightenedFraction: shadowed.whole.brightenedFraction,
        shadowedChangedPixelFraction: shadowed.whole.changedFraction,
        thresholdNearDarkenAtLeast: NEAR_DARKEN_AT_LEAST,
        thresholdFarDeltaAtMost: FAR_DELTA_AT_MOST,
        directLightOnly: `by construction (mask multiplies the shadow-casting light visibility only); shader coverage in ${UNIT}`
      }
    };
    writeReceipt(receipt);
  });

  test("no page errors or console errors during the receipt run", () => {
    expect(consoleProblems).toEqual([]);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import type { ContactMaskComparison, ContactMaskFrame, ContactMaskProbe, ContactMaskVariant } from "./receipts-harness";
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
 * multiplies it into the shadow-casting directional light's visibility (`u_contactShadowMask`). It used to be lowered
 * to the SSAO contact-occlusion pass; the receipt below is the gate for that lowering's removal, so every check here
 * must hold for the receipt to be written.
 *
 * Three on/off pairs against the same floor and subject. "Off" is the same effect node at intensity 0, so both frames
 * take the same post route and only the mask differs. ("Effect absent" is a separate spec,
 * contact-shadow-absent.spec.ts, which compares against the pre-WP-4 build by pixel hash.)
 *  - nocast:   a shadow-casting sun, the subject does not cast a shadow-map shadow, so the shadow map cannot darken the
 *              floor and the on/off delta is attributable to the mask alone. Floor at the subject's base must darken,
 *              far floor must not. This is an isolating scene, not a realistic one.
 *  - shadowed: a shadow-casting sun, the subject casts a normal shadow-map shadow (the realistic case). The mask
 *              must still change the frame (so a mask that never reaches shading fails), must not brighten anything, and
 *              must leave the far floor untouched. The shadow map already removes the sun's light where the mask looks,
 *              so the realistic effect is small; its size is recorded in the receipt, not hidden.
 *  - spot:     a shadow-casting spot light and NO sun. The mask is marched along the sun, so with no sun the effect must
 *              not run and must change nothing, whatever lights the scene has (the mask is never applied to spot lights).
 *
 * Floors of the thresholds are fixed by what each check must tell apart (an inert effect gives exactly 0 change in the
 * deterministic software renderer), not by the size of a measurement.
 */

const SPEC = "tests/browser/contact-shadow-mask.spec.ts";
const ABSENT_SPEC = "tests/browser/contact-shadow-absent.spec.ts";
const UNIT = "tests/unit/rendering/contact-shadow-mask.test.ts";
const SCENE = "tests/browser/receipts-harness.ts contactMaskScene(): grey PBR floor, 0.9 m box subject on it, a small far-away shadow-anchor box; nocast/shadowed = one shadow-casting directional key light (2.6, 4.2, 2.4), nocast = subject outside the shadow map, shadowed = subject casts; spot = one shadow-casting spot light and no sun; the contactShadows node is present in every frame (intensity 0 vs 1)";

const NEAR_DARKEN_AT_LEAST = 1; // mean luma (0..255) in the floor patch at the subject's base, isolating scene
const NEAR_CHANGED_FRACTION_AT_LEAST = 0.05;
const FAR_DELTA_AT_MOST = 0.25;
const FAR_CHANGED_FRACTION_AT_MOST = 0.001;
const BRIGHTENED_FRACTION_AT_MOST = 0.0005;
const WHOLE_CHANGED_FRACTION_AT_LEAST = 0.001;
// Realistic scene: anything above exactly-zero change shows the mask reaches shading; these floors leave room for a small effect.
const SHADOWED_WHOLE_CHANGED_FRACTION_AT_LEAST = 0.0003; // about 70 px of a 600x400 frame
const SHADOWED_NEAR_DARKEN_AT_LEAST = 0.1;
// Ortho: a contact mask touches a thin band around the subject, never a large part of the frame.
const ORTHO_CHANGED_FRACTION_AT_MOST = 0.05;

const VARIANTS: readonly ContactMaskVariant[] = ["cm-nocast-off", "cm-nocast-on", "cm-shadowed-off", "cm-shadowed-on", "cm-spot-off", "cm-spot-on", "cm-ortho-off", "cm-ortho-on"];

function probeOf(frame: ContactMaskFrame): ContactMaskProbe | undefined {
  return frame.contactShadows?.probe;
}

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
      // The spot scene is expected to warn exactly once that the mask has no sun to march along; that is the feature, not a problem.
      if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`);
    });
    await openHarness(page, server.origin);
    renderer = receiptRenderer(await rendererString(page));
    for (const id of VARIANTS) frames.set(id, await renderContactMask(page, id));
    comparisons.set("nocast", await compareContactMask(page, "cm-nocast-off", "cm-nocast-on"));
    comparisons.set("shadowed", await compareContactMask(page, "cm-shadowed-off", "cm-shadowed-on"));
    comparisons.set("spot", await compareContactMask(page, "cm-spot-off", "cm-spot-on"));
    comparisons.set("ortho", await compareContactMask(page, "cm-ortho-off", "cm-ortho-on"));
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  const frame = (id: ContactMaskVariant): ContactMaskFrame => frames.get(id)!;

  test("every frame renders cleanly; on the sun frames the mask pass ran, was sampled, and is not the SSAO lowering", () => {
    for (const [id, result] of frames) {
      logMetrics(id, { metrics: result.metrics, diagnostics: result.diagnostics, contactShadows: result.contactShadows, ssaoRequested: result.ssaoRequested });
      expect(result.diagnostics.errors, id).toEqual([]);
      expect(result.diagnostics.drawCalls, id).toBeGreaterThan(0);
      expect(result.metrics.nonBlackRatio, id).toBeGreaterThan(0.1);
      // The retired lowering: no SSAO pass may stand in for the mask.
      expect(result.ssaoRequested, `${id} must not request ssao`).toBe(false);
    }
    for (const id of ["cm-nocast-on", "cm-shadowed-on", "cm-ortho-on"] as const) {
      expect(frame(id).contactShadows, id).toMatchObject({ passExecuted: true, depthSource: "self" });
      expect(frame(id).contactShadows?.unavailable, id).toBeUndefined();
      // The mask reaches shading: a non-trivial mask was produced and forward draws bound it.
      const probe = probeOf(frame(id));
      expect(probe?.publishedToShading, id).toBe(true);
      expect(probe?.mask?.fractionBelow098, `${id} mask has occluded texels`).toBeGreaterThan(0);
      expect(probe?.drawCounters?.reflectingDraws, `${id} programs that sample the mask`).toBeGreaterThan(0);
      expect(probe?.drawCounters?.maskedDraws, `${id} draws bound the mask`).toBeGreaterThan(0);
    }
    for (const kind of ["nocast", "shadowed", "spot", "ortho"] as const) {
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

  test("shadowed pair: the mask reaches shading (the frame changes and darkens near the base), never brightens, leaves the far floor untouched", () => {
    const delta = comparisons.get("shadowed")!;
    logMetrics("cm-shadowed-delta", delta);
    const near = delta.regions.floorAtSubjectBase!;
    const far = delta.regions.farFloor!;
    expect(far.pixels).toBeGreaterThan(50);
    expect(Math.abs(far.meanLumaDelta)).toBeLessThanOrEqual(FAR_DELTA_AT_MOST);
    expect(far.changedFraction).toBeLessThanOrEqual(FAR_CHANGED_FRACTION_AT_MOST);
    // An effect that does nothing gives exactly 0 here, so these fail for it.
    expect(near.meanLumaDelta).toBeLessThanOrEqual(-SHADOWED_NEAR_DARKEN_AT_LEAST);
    expect(delta.whole.changedFraction).toBeGreaterThanOrEqual(SHADOWED_WHOLE_CHANGED_FRACTION_AT_LEAST);
    expect(delta.whole.meanLumaDelta).toBeLessThan(0);
    expect(delta.whole.brightenedFraction).toBeLessThanOrEqual(BRIGHTENED_FRACTION_AT_MOST);
  });

  test("spot pair: with no shadow-casting sun the effect says so and the frame is pixel-identical to the effect-off frame", () => {
    const delta = comparisons.get("spot")!;
    logMetrics("cm-spot-delta", delta);
    const on = frame("cm-spot-on");
    expect(on.contactShadows, "spot-on diagnostics").toMatchObject({ passExecuted: false, unavailable: "no-shadow-casting-directional-light" });
    expect(delta.whole.changedFraction).toBe(0);
    expect(delta.whole.meanLumaDelta).toBe(0);
    expect(delta.changedBounds).toBeNull();
    // The scene is lit by the spot (not a black frame that would hide a leak).
    expect(frame("cm-spot-off").metrics.nonBlackRatio).toBeGreaterThan(0.1);
  });

  test("ortho pair: the orthographic view-depth branch darkens something, brightens nothing, and the mask is sampled", () => {
    // The harness region projection is perspective-only, so this pair is judged on whole-frame statistics.
    const delta = comparisons.get("ortho")!;
    logMetrics("cm-ortho-delta", delta);
    expect(delta.whole.changedFraction).toBeGreaterThanOrEqual(WHOLE_CHANGED_FRACTION_AT_LEAST);
    expect(delta.whole.meanLumaDelta).toBeLessThan(0);
    expect(delta.whole.brightenedFraction).toBeLessThanOrEqual(BRIGHTENED_FRACTION_AT_MOST);
    // A mask whose view depth was inconsistent would be all ones (nothing changes, caught above) or darken most of the frame.
    expect(delta.whole.changedFraction).toBeLessThanOrEqual(ORTHO_CHANGED_FRACTION_AT_MOST);
  });

  test("writes the receipt only when every check above held", () => {
    const nocast = comparisons.get("nocast")!;
    const shadowed = comparisons.get("shadowed")!;
    const spot = comparisons.get("spot")!;
    const ortho = comparisons.get("ortho")!;
    const nearNocast = nocast.regions.floorAtSubjectBase!;
    const farNocast = nocast.regions.farFloor!;
    const nearShadowed = shadowed.regions.floorAtSubjectBase!;
    const farShadowed = shadowed.regions.farFloor!;
    const checks = {
      nocastNearDarkens: nearNocast.meanLumaDelta <= -NEAR_DARKEN_AT_LEAST && nearNocast.changedFraction >= NEAR_CHANGED_FRACTION_AT_LEAST,
      nocastFarUntouched: Math.abs(farNocast.meanLumaDelta) <= FAR_DELTA_AT_MOST && farNocast.changedFraction <= FAR_CHANGED_FRACTION_AT_MOST,
      nocastNoBrightening: nocast.whole.brightenedFraction <= BRIGHTENED_FRACTION_AT_MOST && nocast.whole.meanLumaDelta < 0,
      shadowedReachesShading: nearShadowed.meanLumaDelta <= -SHADOWED_NEAR_DARKEN_AT_LEAST && shadowed.whole.changedFraction >= SHADOWED_WHOLE_CHANGED_FRACTION_AT_LEAST,
      shadowedFarUntouched: Math.abs(farShadowed.meanLumaDelta) <= FAR_DELTA_AT_MOST && farShadowed.changedFraction <= FAR_CHANGED_FRACTION_AT_MOST,
      shadowedNoBrightening: shadowed.whole.brightenedFraction <= BRIGHTENED_FRACTION_AT_MOST,
      orthoDarkensABand: ortho.whole.changedFraction >= WHOLE_CHANGED_FRACTION_AT_LEAST && ortho.whole.changedFraction <= ORTHO_CHANGED_FRACTION_AT_MOST && ortho.whole.meanLumaDelta < 0 && ortho.whole.brightenedFraction <= BRIGHTENED_FRACTION_AT_MOST,
      spotUnchanged: spot.whole.changedFraction === 0 && spot.whole.meanLumaDelta === 0,
      spotReportsNoSun: frame("cm-spot-on").contactShadows?.unavailable === "no-shadow-casting-directional-light",
      maskPassRan: frame("cm-nocast-on").contactShadows?.passExecuted === true && frame("cm-shadowed-on").contactShadows?.passExecuted === true,
      noSsaoStandIn: VARIANTS.every((id) => !frame(id).ssaoRequested)
    };
    const passed = Object.values(checks).every(Boolean);
    expect(checks, "contact-shadow mask receipt checks").toEqual(Object.fromEntries(Object.keys(checks).map((key) => [key, true])));
    expect(consoleProblems).toEqual([]);

    const dir = `evidence/receipts/effects-contact-shadows/${version}`;
    const saved = [
      saveFrame(frame("cm-nocast-off"), `${dir}/cm-nocast-off.png`, "effect at intensity 0, subject outside the shadow map"),
      saveFrame(frame("cm-nocast-on"), `${dir}/cm-nocast-on.png`, "effect on, subject outside the shadow map (mask only)"),
      saveFrame(frame("cm-shadowed-off"), `${dir}/cm-shadowed-off.png`, "effect at intensity 0, subject casts a shadow-map shadow"),
      saveFrame(frame("cm-shadowed-on"), `${dir}/cm-shadowed-on.png`, "effect on, subject casts a shadow-map shadow"),
      saveFrame(frame("cm-spot-off"), `${dir}/cm-spot-off.png`, "effect at intensity 0, shadow-casting spot light and no sun"),
      saveFrame(frame("cm-spot-on"), `${dir}/cm-spot-on.png`, "effect on, shadow-casting spot light and no sun (must equal the off frame)"),
      saveFrame(frame("cm-ortho-off"), `${dir}/cm-ortho-off.png`, "orthographic camera, effect at intensity 0, subject outside the shadow map"),
      saveFrame(frame("cm-ortho-on"), `${dir}/cm-ortho-on.png`, "orthographic camera, effect on, subject outside the shadow map")
    ];
    // Probe readbacks, flattened (receipt checks are scalars). These are what the GPU run measured, not claims.
    const probeScalars = (prefix: string, id: ContactMaskVariant): Record<string, number> => {
      const probe = probeOf(frame(id));
      return {
        [`${prefix}ForwardDraws`]: probe?.drawCounters?.calls ?? -1,
        [`${prefix}DrawsWithMaskSampler`]: probe?.drawCounters?.reflectingDraws ?? -1,
        [`${prefix}DrawsThatBoundMask`]: probe?.drawCounters?.maskedDraws ?? -1,
        [`${prefix}MaskMin`]: probe?.mask?.min ?? -1,
        [`${prefix}MaskMean`]: probe?.mask?.mean ?? -1,
        [`${prefix}MaskFractionBelow098`]: probe?.mask?.fractionBelow098 ?? -1,
        [`${prefix}DepthCoveredFraction`]: probe?.depth?.coveredFraction ?? -1
      };
    };
    const receipt: Receipt = {
      capability: "effects-contact-shadows",
      version,
      gitSha: sha,
      renderer,
      scene: SCENE,
      frames: saved,
      tests: [SPEC, ABSENT_SPEC, UNIT],
      date: new Date().toISOString(),
      checks: {
        passed,
        ...checks,
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
        shadowedNearFloorChangedFraction: nearShadowed.changedFraction,
        shadowedFarFloorLumaDelta: farShadowed.meanLumaDelta,
        shadowedBrightenedFraction: shadowed.whole.brightenedFraction,
        shadowedChangedPixelFraction: shadowed.whole.changedFraction,
        shadowedWholeFrameLumaDelta: shadowed.whole.meanLumaDelta,
        spotChangedPixelFraction: spot.whole.changedFraction,
        orthoChangedPixelFraction: ortho.whole.changedFraction,
        orthoWholeFrameLumaDelta: ortho.whole.meanLumaDelta,
        spotUnavailableReason: frame("cm-spot-on").contactShadows?.unavailable ?? "none",
        ...probeScalars("nocastOn", "cm-nocast-on"),
        ...probeScalars("shadowedOn", "cm-shadowed-on"),
        ...probeScalars("orthoOn", "cm-ortho-on"),
        thresholdNocastNearDarkenAtLeast: NEAR_DARKEN_AT_LEAST,
        thresholdShadowedNearDarkenAtLeast: SHADOWED_NEAR_DARKEN_AT_LEAST,
        thresholdShadowedWholeChangedFractionAtLeast: SHADOWED_WHOLE_CHANGED_FRACTION_AT_LEAST,
        thresholdFarDeltaAtMost: FAR_DELTA_AT_MOST,
        directLightOnlyBasis: "spot pair measured above: with a shadow-casting spot and no sun the on and off frames are pixel-identical; the shader applies the factor only when the light kind is directional (kind 0), asserted in " + UNIT,
        realisticEffectSize: "In the shadowed scene the shadow map already removes the sun's light where the mask looks, so the mask's own contribution there is small (see shadowedNearFloorLumaDelta and shadowedChangedPixelFraction); the large near-base delta exists only in the nocast isolating scene.",
        knownLimits: [
          "needs a shadow-casting directional light; without one the effect reports unavailable and renders nothing",
          "the 9 textured-PBR glTF extension variants (clearcoat, transmission and similar) do not sample the mask",
          "a blocker deeper than twice the march length (default 0.25 m, 0.5 m in these scenes) is ignored by design, so thick casters shade only the band within that distance of the receiver",
          "measured on software WebGL2 (SwiftShader) only"
        ].join("; ")
      }
    };
    writeReceipt(receipt);
  });

  test("no page errors or console errors during the receipt run", () => {
    expect(consoleProblems).toEqual([]);
  });
});

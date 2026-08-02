import { describe, expect, it } from "vitest";
import {
  resolveChaseFramingFromBounds,
  resolveSubjectRenderedSize,
  resolveSubjectRenderedSizeFromBounds,
  type ChaseFramingIntent
} from "../../../packages/engine/src/agent-api/SubjectFramingUtils";

/**
 * These tests exist because of a specific, repeated failure: routes encoded one asset's dimensions as
 * visual constants, and the constants outlived the asset.
 *
 * Turbo's `CAR_SCENE_HEIGHT` was literally `CAR_TARGET_MAX_DIMENSION * (2.209 / 6.958)` -- the bounds of
 * a hero car that had already been replaced twice. Its chase height `0.46` was justified by reciting a
 * different asset's bounds. Neither broke a test, because no test compared a derived value against the
 * asset it claimed to describe.
 *
 * The requirement therefore is not "these helpers compute plausible numbers". It is: **swap two
 * materially different assets and the framing stays correct with no route change.** Every test below is
 * written to fail if a tuned constant creeps back in.
 */

/** A long, low subject: 1.86 x 1.76 x 3.78, i.e. the real hero car's proportions. */
const LOW_LONG_SUBJECT = { min: [-0.93, 0.007, -1.93] as const, max: [0.93, 1.77, 1.85] as const };
/** A short, tall subject with a very different aspect ratio and a non-zero pivot. */
const TALL_SHORT_SUBJECT = { min: [-0.4, 0.5, -0.4] as const, max: [0.4, 3.1, 0.4] as const };

describe("resolveSubjectRenderedSize derives fit from typed bounds", () => {
  it("computes rendered height from the fit target instead of a copied ratio", () => {
    const rendered = resolveSubjectRenderedSizeFromBounds(LOW_LONG_SUBJECT, { targetMaxDimension: 1.1 });
    // longest axis is Z: 1.85 - (-1.93) = 3.78, so fitScale = 1.1 / 3.78.
    expect(rendered.fitScale).toBeCloseTo(1.1 / 3.78, 6);
    expect(rendered.maxDimension).toBeCloseTo(1.1, 6);
    // height = (1.77 - 0.007) * fitScale
    expect(rendered.height).toBeCloseTo(1.763 * (1.1 / 3.78), 6);
  });

  it("honours a height fit and a longitudinal fit distinctly", () => {
    const byHeight = resolveSubjectRenderedSizeFromBounds(LOW_LONG_SUBJECT, { targetHeight: 0.5 });
    expect(byHeight.height).toBeCloseTo(0.5, 6);
    const byLength = resolveSubjectRenderedSizeFromBounds(LOW_LONG_SUBJECT, { targetLength: 4 });
    expect(byLength.length).toBeCloseTo(4, 6);
    // A long-low subject's longest axis IS its length, so these must not coincide by accident.
    expect(byHeight.fitScale).not.toBeCloseTo(byLength.fitScale, 3);
  });

  it("reads bounds from a typed asset record, including a non-centred pivot", () => {
    const asset = {
      bounds: [1.86, 1.763, 3.78],
      metadata: { boundsMetadata: { min: [-0.93, 0.007, -1.93], max: [0.93, 1.77, 1.85] } }
    };
    const rendered = resolveSubjectRenderedSize(asset, { targetMaxDimension: 1.1 });
    expect(rendered.height).toBeCloseTo(1.763 * (1.1 / 3.78), 6);
  });

  it("never produces NaN or Infinity for a degenerate subject", () => {
    const flat = { min: [0, 0, 0] as const, max: [0, 0, 0] as const };
    const rendered = resolveSubjectRenderedSizeFromBounds(flat, { targetHeight: 2 });
    expect(Number.isFinite(rendered.fitScale)).toBe(true);
    expect(Number.isFinite(rendered.height)).toBe(true);
  });
});

describe("resolveChaseFraming satisfies an occupancy contract across asset swaps", () => {
  const intent: ChaseFramingIntent = {
    targetMaxDimension: 1.1,
    subjectVerticalOccupancy: [0.25, 0.4],
    fov: 54,
    eyeHeightFraction: 0.9,
    lowerSilhouetteFraction: 0.32
  };

  it("frames the long-low subject inside the requested occupancy band", () => {
    const framing = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    expect(framing.withinRequestedOccupancy).toBe(true);
    expect(framing.predictedVerticalOccupancy).toBeGreaterThanOrEqual(0.25);
    expect(framing.predictedVerticalOccupancy).toBeLessThanOrEqual(0.4);
  });

  it("frames a materially different subject inside the SAME band with no intent change", () => {
    // This is the asset-swap requirement. The route expresses identical intent; only the asset differs.
    const framing = resolveChaseFramingFromBounds(TALL_SHORT_SUBJECT, intent);
    expect(framing.withinRequestedOccupancy).toBe(true);
    expect(framing.predictedVerticalOccupancy).toBeGreaterThanOrEqual(0.25);
    expect(framing.predictedVerticalOccupancy).toBeLessThanOrEqual(0.4);
  });

  it("actually changes the derived numbers between the two assets", () => {
    // Guards against a helper that "passes" by returning constants.
    const low = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    const tall = resolveChaseFramingFromBounds(TALL_SHORT_SUBJECT, intent);
    expect(tall.height).not.toBeCloseTo(low.height, 3);
    expect(tall.distance).not.toBeCloseTo(low.distance, 3);
    // The tall subject is taller once fit, so it needs to be further away to occupy the same fraction.
    expect(tall.subject.height).toBeGreaterThan(low.subject.height);
    expect(tall.distance).toBeGreaterThan(low.distance);
  });

  it("keeps the camera above the subject's mid-height but below its roof line", () => {
    // Below mid-height looks up into the underbody; above the roof hides the lower silhouette, which is
    // what made two earlier hand-tuned heights (0.72 and 0.30) both wrong.
    for (const bounds of [LOW_LONG_SUBJECT, TALL_SHORT_SUBJECT]) {
      const framing = resolveChaseFramingFromBounds(bounds, intent);
      expect(framing.height).toBeGreaterThan(framing.subject.height * 0.5);
      expect(framing.height).toBeLessThan(framing.subject.height);
    }
  });

  it("reports a lower-silhouette band measured from the contact plane", () => {
    const framing = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    expect(framing.lowerSilhouetteBand[0]).toBe(0);
    expect(framing.lowerSilhouetteBand[1]).toBeCloseTo(framing.subject.height * 0.32, 4);
  });

  it("responds to the occupancy contract rather than ignoring it", () => {
    const tight = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, {
      ...intent,
      subjectVerticalOccupancy: [0.5, 0.6]
    });
    const loose = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, {
      ...intent,
      subjectVerticalOccupancy: [0.1, 0.15]
    });
    // Filling more of the frame requires being closer.
    expect(tight.distance).toBeLessThan(loose.distance);
    expect(tight.withinRequestedOccupancy).toBe(true);
    expect(loose.withinRequestedOccupancy).toBe(true);
  });

  it("responds to field of view", () => {
    const wide = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, { ...intent, fov: 80 });
    const narrow = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, { ...intent, fov: 30 });
    // A narrow lens must sit further back to hold the same occupancy.
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });

  it("is deterministic", () => {
    const a = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    const b = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    expect(a).toEqual(b);
  });
});

describe("lower side feature visibility is a framing capability, not an assumption", () => {
  /**
   * This encodes the most expensive mistake of this pass. A hero car's tyres were reported as "not
   * rendering", and a renderer defect was diagnosed, when in fact the renderer drew all five primitives
   * and the camera was pointed down the one axis where a car's own bodywork hides its wheels.
   *
   * A framing helper must therefore be able to answer "can this view show the subject's lower flanks?"
   * so no caller claims wheel visibility from a framing that cannot support it.
   */
  const baseIntent: ChaseFramingIntent = {
    targetMaxDimension: 1.1,
    subjectVerticalOccupancy: [0.18, 0.24],
    fov: 54,
    eyeHeightFraction: 0.9,
    lowerSilhouetteFraction: 0.32
  };

  it("reports a dead-astern chase view as unable to show lower side features", () => {
    const framing = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, baseIntent);
    expect(framing.sideOffset).toBe(0);
    expect(framing.lowerSideFeaturesReadable).toBe(false);
  });

  it("derives a lateral offset when lower side features are required", () => {
    const framing = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, {
      ...baseIntent,
      requireLowerSideFeatureVisibility: true
    });
    expect(framing.sideOffset).toBeGreaterThan(0);
    expect(framing.lowerSideFeaturesReadable).toBe(true);
    // Roughly 12-25 degrees off-axis: enough to clear the bodywork, not a side-on beauty shot.
    const offAxisDegrees = Math.atan(framing.sideOffset / framing.distance) * 180 / Math.PI;
    expect(offAxisDegrees).toBeGreaterThan(12);
    expect(offAxisDegrees).toBeLessThan(30);
  });

  it("scales the offset with the subject's own width, not a tuned constant", () => {
    // A wide subject needs a larger step sideways than a narrow one to clear its own body.
    const narrow = resolveChaseFramingFromBounds(
      { min: [-0.3, 0, -1.9] as const, max: [0.3, 1.2, 1.9] as const },
      { ...baseIntent, requireLowerSideFeatureVisibility: true }
    );
    const wide = resolveChaseFramingFromBounds(
      { min: [-1.2, 0, -1.9] as const, max: [1.2, 1.2, 1.9] as const },
      { ...baseIntent, requireLowerSideFeatureVisibility: true }
    );
    expect(wide.sideOffset).toBeGreaterThan(narrow.sideOffset);
  });

  it("uses the narrower horizontal axis as width, not the longest", () => {
    /*
     * A car is long and narrow. Deriving the lateral step from its *length* overshoots badly and swings
     * the camera to a side-on view; this asserts the offset tracks the short axis.
     */
    const framing = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, {
      ...baseIntent,
      requireLowerSideFeatureVisibility: true
    });
    const rendered = framing.subject.size;
    const halfShort = Math.min(rendered[0], rendered[2]) / 2;
    const halfLong = Math.max(rendered[0], rendered[2]) / 2;
    expect(framing.sideOffset).toBeCloseTo(halfShort * 3.2, 4);
    expect(framing.sideOffset).toBeLessThan(halfLong * 3.2);
  });

  it("stays deterministic and inside the occupancy band with the offset applied", () => {
    const intent: ChaseFramingIntent = { ...baseIntent, requireLowerSideFeatureVisibility: true };
    const a = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    const b = resolveChaseFramingFromBounds(LOW_LONG_SUBJECT, intent);
    expect(a).toEqual(b);
    // Stepping sideways must not break the vertical framing contract.
    expect(a.withinRequestedOccupancy).toBe(true);
  });
});

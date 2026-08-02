import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  boundsFromAsset,
  boundsHeight,
  boundsSize,
  groundedRenderedAssetPlacement,
  resolveSubjectPlacementFacts,
  type SceneBounds
} from "../../../packages/engine/src/agent-api/SceneGroundingUtils";
import {
  resolveChaseFraming,
  resolveSubjectRenderedSize
} from "../../../packages/engine/src/agent-api/SubjectFramingUtils";

/**
 * WS4's "typed fit and grounding" cases, exercised against the **real registered assets** rather than only
 * synthetic bounds.
 *
 * Synthetic bounds prove the arithmetic; they cannot prove the arithmetic is fed the right numbers. The defect
 * this pass root-caused was exactly that gap: `CAR_SCENE_HEIGHT` computed a correct ratio from the *wrong*
 * asset's bounds and survived two swaps, and the grounding bug placed a car 77% of a wheel below the tarmac
 * because an anchor read a bounding-box floor instead of a sampled surface. Both were arithmetic that worked on
 * numbers that were wrong.
 *
 * So each case below pins a property against a manifest entry whose characteristics were verified by inspection:
 *
 * | Asset | Height | min-Y | Orientation source |
 * | --- | --- | --- | --- |
 * | `turboRaceCar` | 176.351 | **+0.705** (nonzero) | `manifest-override`, `-z` |
 * | `showcaseKenneyOobiPlatformerHero` | 0.907 | 0 | `manifest-override`, `+Z` |
 * | `propConifer` | 7.469 | **-1.331** (negative) | `unknown` |
 * | `showcaseBlockfallCabinet` | 2.058 | +0.002 | `manifest-override` |
 */

interface ManifestAsset {
  readonly id: string;
  readonly bounds?: readonly number[];
  readonly boundsMetadata?: {
    readonly min?: readonly number[];
    readonly max?: readonly number[];
    readonly size?: readonly number[];
    readonly center?: readonly number[];
  };
  readonly orientation?: { readonly forwardAxis?: string; readonly source?: string };
}

const MANIFEST = JSON.parse(readFileSync("aura.assets.json", "utf8")) as { readonly assets: readonly ManifestAsset[] };

function manifestAsset(id: string): ManifestAsset {
  const asset = MANIFEST.assets.find((entry) => entry.id === id);
  if (!asset) throw new Error(`manifest asset ${id} is required by this test but is not registered`);
  return asset;
}

/** Shape the grounding/framing helpers consume from a typed asset record. */
function typedRef(asset: ManifestAsset) {
  return {
    bounds: asset.bounds,
    metadata: { boundsMetadata: asset.boundsMetadata }
  };
}

describe("bounds are read from manifest metadata, not from the legacy size array", () => {
  it("preserves a nonzero source min-Y instead of assuming an origin-centred pivot", () => {
    /*
     * `turboRaceCar` sits at min-Y +0.705 in its own units. A helper that reconstructed bounds from the `size`
     * array alone would centre it on the origin and lose that offset -- which is how a hero ends up floating or
     * buried. `boundsFromAsset` must prefer `boundsMetadata.min/max`.
     */
    const asset = manifestAsset("turboRaceCar");
    const bounds = boundsFromAsset(typedRef(asset));
    expect(bounds.min[1]).toBeCloseTo(0.705, 3);
    expect(bounds.min[1]).not.toBe(-boundsHeight(bounds) / 2);
  });

  it("preserves a negative source min-Y", () => {
    // `propConifer` extends 1.331 units *below* its origin. Clamping that to zero would sink the trunk.
    const bounds = boundsFromAsset(typedRef(manifestAsset("propConifer")));
    expect(bounds.min[1]).toBeCloseTo(-1.331, 3);
    // `max - min` is 7.468 against a `bounds` array of 7.469: the manifest stores both rounded to 3dp, so a
    // sub-millimetre disagreement is expected and is not a drift defect. Asserting tighter than the manifest's
    // own precision would make this test fail on correct data.
    expect(boundsHeight(bounds)).toBeCloseTo(7.469, 2);
  });

  it("agrees with the manifest size array on every axis", () => {
    // Manifest bounds vs derived extents must not diverge; a mismatch means one of them is stale.
    for (const id of ["turboRaceCar", "showcaseKenneyOobiPlatformerHero", "propConifer", "showcaseBlockfallCabinet"]) {
      const asset = manifestAsset(id);
      const derived = boundsSize(boundsFromAsset(typedRef(asset)));
      for (const axis of [0, 1, 2]) {
        expect(derived[axis], `${id} axis ${axis}`).toBeCloseTo(asset.bounds?.[axis] ?? 0, 2);
      }
    }
  });

  it("falls back to a centred reconstruction only when metadata is absent", () => {
    // The fallback must still be usable, but it is a *fallback*: it cannot recover a real pivot.
    const withoutMetadata = boundsFromAsset({ bounds: [2, 4, 6] });
    expect(boundsSize(withoutMetadata)).toEqual([2, 4, 6]);
    expect(withoutMetadata.min[1]).toBeCloseTo(-2, 6);
  });
});

describe("grounding places the lowest point on the floor for any pivot", () => {
  it("grounds assets with positive, zero, and negative source min-Y identically", () => {
    /*
     * The renderer's `scaleMode: "fit"` path translates by `-bounds.min[1]`, so a correctly-grounded placement
     * sets `position.y` to the floor regardless of pivot. This asserts that invariance across three genuinely
     * different pivots rather than trusting it for one.
     */
    for (const id of ["turboRaceCar", "showcaseKenneyOobiPlatformerHero", "propConifer"]) {
      const placement = groundedRenderedAssetPlacement(typedRef(manifestAsset(id)), {
        targetHeight: 1.5,
        floorY: -0.12
      });
      expect(placement.position[1], `${id} grounded Y`).toBeCloseTo(-0.12, 6);
      expect(placement.height, `${id} rendered height`).toBeCloseTo(1.5, 4);
    }
  });

  it("scales the rendered height to the requested target for every pivot", () => {
    for (const id of ["turboRaceCar", "propConifer", "showcaseBlockfallCabinet"]) {
      for (const targetHeight of [0.4, 2, 9]) {
        const placement = groundedRenderedAssetPlacement(typedRef(manifestAsset(id)), { targetHeight });
        expect(placement.height, `${id} @ ${targetHeight}`).toBeCloseTo(targetHeight, 4);
      }
    }
  });

  it("honours a max-dimension fit as an alternative to a height fit", () => {
    const placement = groundedRenderedAssetPlacement(typedRef(manifestAsset("turboRaceCar")), {
      targetMaxDimension: 1.1
    });
    expect(placement.maxDimension).toBeCloseTo(1.1, 4);
    // The car is longer than it is tall, so a max-dimension fit yields a height well below the target.
    expect(placement.height).toBeLessThan(1.1);
  });
});

describe("orientation evidence is reported, never invented", () => {
  it("distinguishes a manifest-declared forward axis from an unknown one", () => {
    /*
     * A route that needs a reliable forward direction must be able to tell "declared" from "guessed". Turbo's
     * hero asset carries `manifest-override` evidence; `propConifer` carries `unknown`, and no helper may
     * silently upgrade that to a claim.
     */
    const hero = manifestAsset("turboRaceCar");
    expect(hero.orientation?.source).toBe("manifest-override");
    expect(hero.orientation?.forwardAxis).toBe("-z");

    const prop = manifestAsset("propConifer");
    expect(prop.orientation?.source).toBe("unknown");
    expect(prop.orientation?.forwardAxis).toBeUndefined();
  });

  it("records opposing forward axes across two assets, so an override is observable", () => {
    // `-z` for the car and `+Z` for the platformer hero: a single hardcoded assumption would be wrong for one.
    expect(manifestAsset("turboRaceCar").orientation?.forwardAxis).toBe("-z");
    expect(manifestAsset("showcaseKenneyOobiPlatformerHero").orientation?.forwardAxis).toBe("+Z");
  });
});

describe("camera framing holds its occupancy contract across an asset swap", () => {
  const intent = {
    targetMaxDimension: 1.1,
    subjectVerticalOccupancy: [0.18, 0.24] as const,
    fov: 54,
    eyeHeightFraction: 0.9,
    lowerSilhouetteFraction: 0.32,
    requireLowerSideFeatureVisibility: true
  };

  it("keeps four materially different real assets inside one declared occupancy band", () => {
    /*
     * This is WS4's asset-swap requirement against real assets: identical intent, four subjects whose
     * proportions differ by orders of magnitude (a 377-unit car, a 0.9-unit mascot, a 24-unit tree, a 2-unit
     * cabinet), and the occupancy contract must hold for all of them with no per-asset tuning.
     */
    for (const id of ["turboRaceCar", "showcaseKenneyOobiPlatformerHero", "propConifer", "showcaseBlockfallCabinet"]) {
      const framing = resolveChaseFraming(typedRef(manifestAsset(id)), intent);
      expect(framing.withinRequestedOccupancy, `${id} occupancy`).toBe(true);
      expect(framing.predictedVerticalOccupancy).toBeGreaterThanOrEqual(0.18);
      expect(framing.predictedVerticalOccupancy).toBeLessThanOrEqual(0.24);
    }
  });

  it("derives different camera numbers for each asset, proving nothing is hardcoded", () => {
    // If two materially different subjects produced identical framing, the helper would be returning constants.
    const car = resolveChaseFraming(typedRef(manifestAsset("turboRaceCar")), intent);
    const mascot = resolveChaseFraming(typedRef(manifestAsset("showcaseKenneyOobiPlatformerHero")), intent);
    expect(car.height).not.toBeCloseTo(mascot.height, 3);
    expect(car.distance).not.toBeCloseTo(mascot.distance, 3);
    expect(car.sideOffset).not.toBeCloseTo(mascot.sideOffset, 3);
  });

  it("reports a lower-silhouette band measured from the contact plane for every asset", () => {
    // The band is what makes wheels/feet readable; it must scale with the subject, not be a fixed slab.
    for (const id of ["turboRaceCar", "propConifer"]) {
      const framing = resolveChaseFraming(typedRef(manifestAsset(id)), intent);
      expect(framing.lowerSilhouetteBand[0]).toBe(0);
      expect(framing.lowerSilhouetteBand[1]).toBeCloseTo(framing.subject.height * 0.32, 4);
    }
  });

  it("confirms lower side features can read for every swapped asset", () => {
    // A framing that cannot show the lower flanks must say so; here the intent requires it, so all must pass.
    for (const id of ["turboRaceCar", "showcaseKenneyOobiPlatformerHero", "propConifer", "showcaseBlockfallCabinet"]) {
      const framing = resolveChaseFraming(typedRef(manifestAsset(id)), intent);
      expect(framing.lowerSideFeaturesReadable, `${id} lower side readable`).toBe(true);
    }
  });

  it("requires no route-local height literal: rendered size comes from the manifest", () => {
    /*
     * The precise defect being guarded: Turbo hardcoded `CAR_TARGET_MAX_DIMENSION * (2.209 / 6.958)` -- a *prior*
     * asset's bounds ratio -- and it survived two hero swaps. Recomputing from the manifest must match the
     * helper, so no route needs to restate a dimension.
     */
    const asset = manifestAsset("turboRaceCar");
    const rendered = resolveSubjectRenderedSize(typedRef(asset), { targetMaxDimension: 1.1 });
    const rawSize = asset.bounds ?? [1, 1, 1];
    const expectedScale = 1.1 / Math.max(...rawSize);
    expect(rendered.fitScale).toBeCloseTo(expectedScale, 8);
    /*
     * The helper derives height from `boundsMetadata.max - min` (176.352) while the `bounds` array stores 176.351,
     * both rounded to 3dp by the manifest writer. The 3e-6 difference in rendered height is that rounding, not a
     * divergence, so this asserts agreement at 5 decimals rather than at a precision the source data lacks.
     */
    expect(rendered.height).toBeCloseTo((rawSize[1] ?? 0) * expectedScale, 5);
    // And the stale literal it replaced is provably not what the manifest yields.
    expect(rendered.height).not.toBeCloseTo(1.1 * (2.209 / 6.958), 3);
  });

  it("is deterministic for every asset", () => {
    for (const id of ["turboRaceCar", "propConifer"]) {
      const asset = typedRef(manifestAsset(id));
      expect(resolveChaseFraming(asset, intent)).toEqual(resolveChaseFraming(asset, intent));
    }
  });
});

describe("the five WS4 derived values that had no reusable derivation", () => {
  /**
   * WS4 lists 15 values a reusable helper should derive, so "route code does not know raw asset dimensions".
   * Ten existed. Absent: world-space ground contact, visual centre, centre-of-mass approximation, subject framing
   * bounds, and character-foot/wheel contact region.
   *
   * Each is a value a route would otherwise compute inline from bounds -- which is precisely how
   * `CAR_SCENE_HEIGHT` came to be hardcoded to one asset's ratio and survive two hero-asset swaps, mis-seating
   * each replacement by 8.2%.
   */
  const RAW: SceneBounds = { min: [-1, 0.4, -2], max: [1, 1.8, 2] };

  it("grounds the contact point on the floor regardless of the asset's own origin", () => {
    /*
     * The defect this guards: this asset's lowest point is at y=0.4, not 0. A route reading raw bounds would
     * place it floating 0.4 units up, or sink it if it subtracted the wrong term.
     */
    const facts = resolveSubjectPlacementFacts(RAW, { scale: 2, x: 3, z: -4, floorY: 1.5 });
    expect(facts.groundContact).toEqual([3, 1.5, -4]);
    expect(facts.framingBounds.min[1], "lowest geometry must rest on the floor").toBe(1.5);
  });

  it("derives the visual centre from scaled height, not from raw bounds", () => {
    const facts = resolveSubjectPlacementFacts(RAW, { scale: 2 });
    // Raw height 1.4, scaled 2.8, so the centre sits 1.4 above the floor.
    expect(facts.visualCenter[1]).toBeCloseTo(1.4, 6);
    expect(facts.framingBounds.max[1]).toBeCloseTo(2.8, 6);
  });

  it("places the centre-of-mass approximation below the geometric centre", () => {
    /*
     * A vehicle or character carries mass low. If this equalled the visual centre it would be a duplicate value
     * rather than a distinct WS4 fact, so the ordering is the assertion.
     */
    const facts = resolveSubjectPlacementFacts(RAW, { scale: 1 });
    expect(facts.centerOfMassApproximation[1]).toBeLessThan(facts.visualCenter[1]);
    expect(facts.centerOfMassApproximation[1]).toBeGreaterThan(facts.framingBounds.min[1]);
  });

  it("produces framing bounds that enclose the placed subject exactly", () => {
    const facts = resolveSubjectPlacementFacts(RAW, { scale: 3, x: 1, z: 2 });
    const { min, max } = facts.framingBounds;
    // Raw footprint 2 x 4, scaled by 3 -> 6 x 12, centred on (1, 2).
    expect(max[0] - min[0]).toBeCloseTo(6, 6);
    expect(max[2] - min[2]).toBeCloseTo(12, 6);
    expect(facts.visualCenter[0]).toBeCloseTo(1, 6);
    expect(facts.visualCenter[2]).toBeCloseTo(2, 6);
  });

  it("derives a contact region for wheel or foot readability", () => {
    /*
     * Defaults to 0.3 of subject height, matching the wheel-band fraction the vehicle visibility probe measures,
     * so a framing check and the probe are talking about the same region.
     */
    const facts = resolveSubjectPlacementFacts(RAW, { scale: 2 });
    expect(facts.contactRegion.depth).toBeCloseTo(2.8 * 0.3, 6);
    expect(facts.contactRegion.min[1]).toBe(facts.framingBounds.min[1]);
    expect(facts.contactRegion.max[1]).toBeLessThan(facts.framingBounds.max[1]);

    const shallow = resolveSubjectPlacementFacts(RAW, { scale: 2, contactRegionFraction: 0.1 });
    expect(shallow.contactRegion.depth).toBeLessThan(facts.contactRegion.depth);
  });

  it("never invents a forward axis", () => {
    // Same rule as admission: a symmetric body has no intrinsic front, and guessing faces a vehicle backwards.
    expect(resolveSubjectPlacementFacts(RAW, { scale: 1 }).forwardAxis).toBeUndefined();
    expect(resolveSubjectPlacementFacts(RAW, { scale: 1, forwardAxis: [0, 0, 1] }).forwardAxis).toEqual([0, 0, 1]);
  });

  it("holds every fact consistent across an asset swap with a different aspect ratio", () => {
    /*
     * The WS4 acceptance test: two materially different assets, no route-local literal, and grounding plus framing
     * must stay correct for both. A tall narrow subject and a long flat one.
     */
    const tall: SceneBounds = { min: [-0.3, 0, -0.3], max: [0.3, 3.2, 0.3] };
    const flat: SceneBounds = { min: [-2.5, -0.7, -1], max: [2.5, 0.1, 1] };
    for (const bounds of [tall, flat]) {
      const facts = resolveSubjectPlacementFacts(bounds, { scale: 1.5, floorY: 2 });
      expect(facts.groundContact[1], "always rests on the floor").toBe(2);
      expect(facts.framingBounds.min[1]).toBe(2);
      expect(facts.visualCenter[1]).toBeGreaterThan(2);
      expect(facts.contactRegion.depth).toBeGreaterThan(0);
      // The framing box must actually contain the visual centre, for any aspect ratio.
      expect(facts.visualCenter[1]).toBeLessThan(facts.framingBounds.max[1]);
    }
  });

  it("is deterministic", () => {
    const build = () => resolveSubjectPlacementFacts(RAW, { scale: 2, x: 1, z: 1, forwardAxis: [1, 0, 0] });
    expect(build()).toEqual(build());
  });
});

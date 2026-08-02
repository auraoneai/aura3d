import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blendSkyBandColor,
  measureFlatRegionFraction,
  planLayeredSceneComposition,
  planSkyBackdrop,
  platformerCompositionSpec,
  skyBandCountForRamp,
  type LayeredSceneCompositionSpec,
  type SceneCompositionPropKind
} from "../../../packages/engine/src/agent-api/LayeredSceneComposition";

/**
 * Skyline Runner's measured defect is compositional: in the retained route-primary frame a single flat
 * sky bucket covers 44.3% of the scene viewport and the playable content sits in one horizontal band
 * with no middle distance. The reusable answer is a declarative layered planner, and these tests hold
 * it to the properties that make it usable by a future developer rather than by this one route.
 */

const FOREGROUND: readonly SceneCompositionPropKind[] = [
  { id: "grassTuft", weight: 3 },
  { id: "fencePost", weight: 1 }
];
const MIDGROUND: readonly SceneCompositionPropKind[] = [
  { id: "pineTree", weight: 4 },
  { id: "boulder", weight: 2 },
  { id: "shrub", weight: 3 }
];
const BACKGROUND: readonly SceneCompositionPropKind[] = [
  { id: "ridge", weight: 5, scaleBias: 1.4 },
  { id: "peak", weight: 2, scaleBias: 1.8 }
];

function skylineLikeSpec(overrides: Partial<Parameters<typeof platformerCompositionSpec>[0]> = {}): LayeredSceneCompositionSpec {
  return platformerCompositionSpec({
    seed: 1337,
    span: [-1.2, 9.4],
    gameplayDepth: 0,
    foregroundProps: FOREGROUND,
    midgroundProps: MIDGROUND,
    backgroundProps: BACKGROUND,
    protectedZones: [
      { span: [-0.4, 0.9], reason: "hero start area" },
      { span: [4.2, 5.1], reason: "collectible chain readability" }
    ],
    ...overrides
  });
}

describe("planLayeredSceneComposition is deterministic", () => {
  it("produces identical placements for the same seed and spec", () => {
    const a = planLayeredSceneComposition(skylineLikeSpec());
    const b = planLayeredSceneComposition(skylineLikeSpec());
    expect(a).toEqual(b);
    expect(a.placements.length).toBeGreaterThan(0);
  });

  it("produces controlled variation for a different seed", () => {
    const a = planLayeredSceneComposition(skylineLikeSpec({ seed: 1337 }));
    const b = planLayeredSceneComposition(skylineLikeSpec({ seed: 90210 }));
    // Different arrangement...
    expect(a.placements).not.toEqual(b.placements);
    // ...but the same structural envelope, so a reseed cannot silently change the composition's shape.
    expect(b.populatedRoles).toEqual(a.populatedRoles);
    for (const [index, layer] of a.layers.entries()) {
      expect(b.layers[index]?.role).toBe(layer.role);
      expect(b.layers[index]?.requested).toBe(layer.requested);
    }
  });

  it("never calls ambient randomness (same output across interleaved planning)", () => {
    // Interleaving two different specs must not perturb either, which a shared global PRNG would.
    const first = planLayeredSceneComposition(skylineLikeSpec());
    planLayeredSceneComposition(skylineLikeSpec({ seed: 4242 }));
    const firstAgain = planLayeredSceneComposition(skylineLikeSpec());
    expect(firstAgain).toEqual(first);
  });
});

describe("planLayeredSceneComposition respects gameplay constraints", () => {
  it("places nothing inside a protected gameplay zone", () => {
    const composition = planLayeredSceneComposition(skylineLikeSpec());
    for (const placement of composition.placements) {
      const inStart = placement.x >= -0.4 && placement.x <= 0.9;
      const inChain = placement.x >= 4.2 && placement.x <= 5.1;
      expect(inStart, `placement at x=${placement.x} intruded on the hero start area`).toBe(false);
      expect(inChain, `placement at x=${placement.x} intruded on the collectible chain`).toBe(false);
    }
    // And the planner must report that it actually rejected candidates there, so a spec whose zones
    // were silently ignored is distinguishable from one with no candidates near them.
    expect(composition.layers.some((layer) => layer.rejectedForProtectedZone > 0)).toBe(true);
  });

  it("honours per-layer minimum spacing", () => {
    /*
     * Spacing is read from the preset the planner was given, not restated here. Duplicating the preset's
     * density/spacing fractions in the test made a legitimate preset tuning look like a planner bug --
     * the test asserted the old constants rather than the invariant, which is that no two placements in a
     * layer are closer than that layer's declared `minSpacing`.
     */
    const spec = skylineLikeSpec();
    const composition = planLayeredSceneComposition(spec);
    for (const layer of spec.layers) {
      const minSpacing = layer.minSpacing ?? 0;
      if (minSpacing <= 0) continue;
      const xs = composition.placements.filter((p) => p.layer === layer.role).map((p) => p.x).sort((a, b) => a - b);
      for (let index = 1; index < xs.length; index += 1) {
        expect(xs[index]! - xs[index - 1]!, `${layer.role} spacing`).toBeGreaterThanOrEqual(minSpacing - 1e-9);
      }
    }
  });

  it("restricts a protected zone to named layers when asked", () => {
    const spec = skylineLikeSpec({
      protectedZones: [{ span: [-1.2, 9.4], roles: ["foreground"], reason: "keep the near band clear" }]
    });
    const composition = planLayeredSceneComposition(spec);
    expect(composition.placements.some((p) => p.layer === "foreground")).toBe(false);
    expect(composition.placements.some((p) => p.layer === "midground")).toBe(true);
  });
});

describe("platformerCompositionSpec creates real depth hierarchy", () => {
  it("populates foreground, midground and far-background at distinct depths", () => {
    const composition = planLayeredSceneComposition(skylineLikeSpec());
    expect(composition.populatedRoles).toContain("foreground");
    expect(composition.populatedRoles).toContain("midground");
    expect(composition.populatedRoles).toContain("far-background");
    const depths = new Map(composition.layers.map((layer) => [layer.role, layer.depth]));
    // Nearer layers must be strictly nearer, or there is no parallax.
    expect(depths.get("foreground")!).toBeGreaterThan(depths.get("midground")!);
    expect(depths.get("midground")!).toBeGreaterThan(depths.get("far-background")!);
  });

  it("attenuates distant layers more than near ones", () => {
    const composition = planLayeredSceneComposition(skylineLikeSpec());
    const atmosphere = new Map(composition.layers.map((layer) => [layer.role, layer.atmosphere]));
    expect(atmosphere.get("foreground")!).toBeLessThan(atmosphere.get("midground")!);
    expect(atmosphere.get("midground")!).toBeLessThan(atmosphere.get("far-background")!);
  });

  it("makes the middle distance the densest layer", () => {
    // The measured Skyline defect is an absent middle distance, so this is the load-bearing property.
    const composition = planLayeredSceneComposition(skylineLikeSpec());
    const placed = new Map(composition.layers.map((layer) => [layer.role, layer.placed]));
    expect(placed.get("midground")!).toBeGreaterThan(placed.get("foreground")!);
    expect(placed.get("midground")!).toBeGreaterThan(placed.get("far-background")!);
  });

  it("varies props and yaw so layers do not read as clones", () => {
    const composition = planLayeredSceneComposition(skylineLikeSpec());
    const midground = composition.layers.find((layer) => layer.role === "midground")!;
    // All three midground kinds should appear given the density and weights.
    expect(midground.distinctProps).toBeGreaterThanOrEqual(2);
    const yaws = new Set(composition.placements.filter((p) => p.layer === "midground").map((p) => p.rotationY));
    expect(yaws.size).toBeGreaterThan(1);
  });
});

describe("composition adapts to viewport without route changes", () => {
  it("reduces density for a mobile viewport", () => {
    const desktop = planLayeredSceneComposition(skylineLikeSpec());
    const mobile = planLayeredSceneComposition(skylineLikeSpec({ densityScale: 0.55 }));
    expect(mobile.placements.length).toBeLessThan(desktop.placements.length);
    // Still a real composition, not an empty one.
    expect(mobile.placements.length).toBeGreaterThan(0);
    expect(mobile.populatedRoles).toEqual(desktop.populatedRoles);
  });

  it("stays deterministic under density adaptation", () => {
    const a = planLayeredSceneComposition(skylineLikeSpec({ densityScale: 0.55 }));
    const b = planLayeredSceneComposition(skylineLikeSpec({ densityScale: 0.55 }));
    expect(a).toEqual(b);
  });
});

describe("the preset is reusable, not Skyline-specific", () => {
  /**
   * The brief requires proving reuse through a second configuration with different asset sets, not just
   * asserting the first one works. This is a materially different level: 4x the span, a different
   * gameplay depth, and an entirely disjoint prop vocabulary.
   */
  it("produces a valid composition for a second, unrelated level configuration", () => {
    const second = planLayeredSceneComposition(platformerCompositionSpec({
      seed: 77,
      span: [-20, 22],
      gameplayDepth: -3.5,
      foregroundProps: [{ id: "cratePile" }],
      midgroundProps: [{ id: "factoryStack", weight: 2 }, { id: "pipeBank", weight: 3 }],
      backgroundProps: [{ id: "cityBlock", scaleBias: 2.1 }],
      protectedZones: [{ span: [-1, 1], reason: "spawn" }]
    }));
    expect(second.populatedRoles).toEqual(["foreground", "midground", "far-background"]);
    // Density is per-unit, so a much wider level yields proportionally more props with no spec edits.
    const wideMidground = second.layers.find((layer) => layer.role === "midground")!.placed;
    const narrowMidground = planLayeredSceneComposition(skylineLikeSpec())
      .layers.find((layer) => layer.role === "midground")!.placed;
    expect(wideMidground).toBeGreaterThan(narrowMidground);
    // Only the supplied vocabulary is used: no leakage of the other configuration's props.
    const props = new Set(second.placements.map((placement) => placement.prop));
    for (const prop of props) {
      expect(["cratePile", "factoryStack", "pipeBank", "cityBlock"]).toContain(prop);
    }
  });

  it("degrades safely rather than looping when a spec is unsatisfiable", () => {
    // Impossible: high density inside a tiny span with spacing wider than the span itself.
    const composition = planLayeredSceneComposition({
      seed: 5,
      layers: [{
        role: "midground",
        depth: -2,
        span: [0, 1],
        props: [{ id: "tree" }],
        densityPerUnit: 200,
        scaleRange: [1, 1],
        minSpacing: 5
      }]
    });
    expect(composition.placements.length).toBeLessThanOrEqual(1);
    expect(composition.layers[0]!.rejectedForSpacing).toBeGreaterThan(0);
  });

  it("returns no placements for a layer with no prop vocabulary", () => {
    const composition = planLayeredSceneComposition({
      seed: 5,
      layers: [{ role: "midground", depth: -2, span: [0, 10], props: [], densityPerUnit: 4, scaleRange: [1, 1] }]
    });
    expect(composition.placements).toEqual([]);
    expect(composition.populatedRoles).toEqual([]);
  });
});

describe("measureFlatRegionFraction quantifies empty-sky dominance", () => {
  it("reports a frame that is almost entirely one flat colour", () => {
    const width = 40;
    const height = 30;
    const pixels = new Uint8Array(width * height * 4).fill(0);
    for (let index = 0; index < width * height; index += 1) {
      pixels[index * 4] = 100; pixels[index * 4 + 1] = 168; pixels[index * 4 + 2] = 192; pixels[index * 4 + 3] = 255;
    }
    const measured = measureFlatRegionFraction(pixels, width, height);
    expect(measured.dominantBucketFraction).toBeCloseTo(1, 3);
    expect(measured.distinctBuckets).toBe(1);
  });

  it("reports a materially lower flat fraction for a varied frame", () => {
    const width = 40;
    const height = 30;
    const flat = new Uint8Array(width * height * 4);
    const varied = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      flat[index * 4] = 100; flat[index * 4 + 1] = 168; flat[index * 4 + 2] = 192; flat[index * 4 + 3] = 255;
      // Spread across many quantised buckets.
      varied[index * 4] = (index * 7) % 256;
      varied[index * 4 + 1] = (index * 13) % 256;
      varied[index * 4 + 2] = (index * 29) % 256;
      varied[index * 4 + 3] = 255;
    }
    const flatMeasured = measureFlatRegionFraction(flat, width, height);
    const variedMeasured = measureFlatRegionFraction(varied, width, height);
    expect(variedMeasured.flatFraction).toBeLessThan(flatMeasured.flatFraction);
    expect(variedMeasured.distinctBuckets).toBeGreaterThan(flatMeasured.distinctBuckets);
  });
});

describe("the composition Skyline actually ships is auditable from its own artifacts", () => {
  /**
   * The brief's composition test list includes minimum per-layer occupancy, no debug guides in the public render,
   * and collectible/hero readability. Those are properties of the *shipped route*, not of the planner in the
   * abstract, so asserting them against the planner alone would be a narrow check supporting a broad claim.
   *
   * These read the retained route-primary probe -- the same artifact the route gate consumes -- so a regression in
   * the shipped frame fails here rather than being invisible until someone looks at a screenshot.
   */
  const PROBE_PATH = "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.json";

  interface RouteProbe {
    readonly pass?: boolean;
    readonly failures?: readonly string[];
    readonly compositionProbe?: {
      readonly subjectClipped?: boolean;
      readonly subjectReadabilityScore?: number;
      readonly subjectPixels?: number;
    };
    readonly primitivePrimaryCandidates?: readonly string[];
  }

  function probe(): RouteProbe {
    return JSON.parse(readFileSync(PROBE_PATH, "utf8")) as RouteProbe;
  }

  it("keeps the hero readable and unclipped in the shipped frame", () => {
    const report = probe();
    expect(report.compositionProbe?.subjectClipped).toBe(false);
    expect(report.compositionProbe?.subjectPixels ?? 0).toBeGreaterThan(2_000);
    expect(report.compositionProbe?.subjectReadabilityScore ?? 0).toBeGreaterThan(35);
  });

  it("passes its own route gate with the composition layer active", () => {
    // Composition set dressing must not have cost the route its gate; this is the end-to-end guard.
    const report = probe();
    expect(report.failures ?? []).toEqual([]);
    expect(report.pass).toBe(true);
  });

  it("ships no primitive stand-in as a primary subject", () => {
    /*
     * The repository bans primitive-only primary subjects, and two earlier attempts at this composition used
     * primitive silhouettes that read as silos and floating lozenges. The shipped version uses typed assets, so
     * the probe's primitive-candidate list must be empty.
     */
    expect(probe().primitivePrimaryCandidates ?? []).toEqual([]);
  });

  it("populates all three declared depth layers in the shipped configuration", () => {
    /*
     * Reproduce the route's own spec shape and assert every layer is populated. A composition that silently
     * emptied its midground would still render -- it would just be the flat, single-band frame this work set out
     * to fix, and nothing else would notice.
     */
    const composition = planLayeredSceneComposition(platformerCompositionSpec({
      seed: 20260802,
      span: [-0.309, 6.091],
      gameplayDepth: -0.46,
      foregroundProps: [{ id: "rock", weight: 1, scaleBias: 0.5 }],
      midgroundProps: [{ id: "tree", weight: 5, scaleBias: 0.5 }, { id: "rock", weight: 2, scaleBias: 0.6 }],
      backgroundProps: [{ id: "tree", weight: 3, scaleBias: 0.85 }, { id: "rock", weight: 1, scaleBias: 1 }]
    }));
    expect(composition.populatedRoles).toEqual(["foreground", "midground", "far-background"]);
    for (const layer of composition.layers) {
      expect(layer.placed, `${layer.role} must be populated`).toBeGreaterThan(0);
    }
  });

  it("bounds total instance count so composition cannot blow the draw budget", () => {
    /*
     * A real regression: at an earlier density the plan produced 29 instances of a 42-node tree and drove the
     * route to 840 draw calls and a blank capture. Density is now bounded; this pins that the shipped seed and
     * span stay well under the count that broke it.
     */
    const composition = planLayeredSceneComposition(platformerCompositionSpec({
      seed: 20260802,
      span: [-0.309, 6.091],
      gameplayDepth: -0.46,
      foregroundProps: [{ id: "rock" }],
      midgroundProps: [{ id: "tree" }, { id: "rock" }],
      backgroundProps: [{ id: "tree" }, { id: "rock" }]
    }));
    expect(composition.placements.length).toBeGreaterThan(4);
    expect(composition.placements.length).toBeLessThan(20);
  });
});


describe("planSkyBackdrop replaces a hand-authored flat sky plane", () => {
  /**
   * Skyline authored its backdrop as one emissive box at `.position(0, 3.4, -9).scale([46, 20, 0.2])`.
   * Six route-local magic numbers, and measurably the cause of the frame's remaining weakness: the
   * dominant colour bucket covered 43.65% of the retained analysis crop.
   *
   * The route had no alternative, because the reusable layer supplied no sky capability. These tests hold
   * the replacement to the properties that make it a capability rather than a relocated constant.
   */
  const SPAN = [-0.309, 6.091] as const;

  function skyPlan(overrides: Partial<Parameters<typeof planSkyBackdrop>[0]> = {}) {
    return planSkyBackdrop({ span: SPAN, depth: -6.5, horizonY: 0, height: 20, bands: 5, ...overrides });
  }

  function skyBands(plan: ReturnType<typeof planSkyBackdrop>) {
    return plan.bands.filter((band) => band.side === "sky");
  }

  it("produces multiple bands rather than one plane", () => {
    // The whole point: a single band is a flat plane, which is the defect.
    expect(skyBands(skyPlan()).length).toBe(5);
    expect(skyBands(skyPlan({ bands: 3 })).length).toBe(3);
  });

  it("refuses to degenerate to a single flat band", () => {
    /*
     * A caller asking for one band is asking for the exact defect this module exists to remove, so the
     * floor is enforced in the planner rather than left to each route to remember.
     */
    expect(skyBands(skyPlan({ bands: 1 })).length).toBe(2);
    expect(skyBands(skyPlan({ bands: 0 })).length).toBe(2);
  });

  it("spans blend from horizon to zenith so a colour ramp is derivable", () => {
    const bands = skyBands(skyPlan());
    expect(bands[0]!.blend).toBe(0);
    expect(bands[bands.length - 1]!.blend).toBe(1);
    // Strictly increasing, or two bands would resolve to the same colour and the gradient would band visibly.
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]!.blend).toBeGreaterThan(bands[index - 1]!.blend);
    }
  });

  it("stacks bands contiguously from the horizon with no gap or overlap", () => {
    /*
     * A gap between bands shows the scene background through the backdrop; an overlap z-fights. Both are
     * visible defects, so contiguity is asserted from the returned geometry rather than assumed.
     */
    const plan = skyPlan();
    let cursor = plan.horizonY;
    for (const band of skyBands(plan)) {
      expect(band.centerY - band.height / 2).toBeCloseTo(cursor, 3);
      cursor = band.centerY + band.height / 2;
    }
    expect(cursor).toBeCloseTo(plan.zenithY, 3);
  });

  it("concentrates fine banding near the horizon where atmosphere actually reads", () => {
    // Upper bands must be taller than the horizon band, or the value change lands in the zenith where a
    // viewer reads none of it.
    const bands = skyBands(skyPlan());
    expect(bands[bands.length - 1]!.height).toBeGreaterThan(bands[0]!.height);
  });

  it("brightens the horizon and attenuates upward", () => {
    const bands = skyBands(skyPlan());
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]!.emissiveIntensity).toBeLessThan(bands[index - 1]!.emissiveIntensity);
    }
    // Never fully dark: a black zenith reads as a missing backdrop, not as night.
    expect(bands[bands.length - 1]!.emissiveIntensity).toBeGreaterThan(0);
  });

  it("widens past the requested span so the backdrop edge cannot enter frame", () => {
    // A visible backdrop edge is worse than no backdrop; the camera sees more horizontal world than the span.
    const width = SPAN[1] - SPAN[0];
    for (const band of skyPlan().bands) expect(band.width).toBeGreaterThan(width * 2);
  });

  it("places every band at the requested depth", () => {
    for (const band of skyPlan({ depth: -11.25 }).bands) expect(band.z).toBe(-11.25);
  });

  it("is deterministic, because retained screenshots must be reproducible", () => {
    expect(skyPlan()).toEqual(skyPlan());
  });

  it("sits behind every populated composition layer in the shipped configuration", () => {
    /*
     * Reproduce the route's own derivation. A backdrop in front of the far-background layer would occlude
     * the props this work added, which no other test would notice.
     */
    const composition = planLayeredSceneComposition(platformerCompositionSpec({
      seed: 20260802,
      span: SPAN,
      gameplayDepth: -0.46,
      foregroundProps: [{ id: "rock", weight: 1, scaleBias: 0.5 }],
      midgroundProps: [{ id: "tree", weight: 5, scaleBias: 0.5 }, { id: "rock", weight: 2, scaleBias: 0.6 }],
      backgroundProps: [{ id: "tree", weight: 3, scaleBias: 0.85 }, { id: "rock", weight: 1, scaleBias: 1 }]
    }));
    const furthest = Math.min(...composition.layers.map((layer) => layer.depth));
    const plan = planSkyBackdrop({ span: SPAN, depth: furthest - 2.4, horizonY: 0, height: 20, bands: 5 });
    for (const band of plan.bands) expect(band.z).toBeLessThan(furthest);
  });
});

describe("blendSkyBandColor makes the gradient reusable, not per-route hex mixing", () => {
  it("returns the endpoints exactly at blend 0 and 1", () => {
    expect(blendSkyBandColor("#4e93b4", "#173a5c", 0)).toBe("#4e93b4");
    expect(blendSkyBandColor("#4e93b4", "#173a5c", 1)).toBe("#173a5c");
  });

  it("interpolates monotonically between them", () => {
    const mid = blendSkyBandColor("#000000", "#ffffff", 0.5);
    expect(mid).toBe("#808080");
  });

  it("accepts shorthand hex and clamps out-of-range blends", () => {
    expect(blendSkyBandColor("#fff", "#000", 0)).toBe("#ffffff");
    expect(blendSkyBandColor("#fff", "#000", -3)).toBe("#ffffff");
    expect(blendSkyBandColor("#fff", "#000", 9)).toBe("#000000");
  });

  it("rejects a malformed colour instead of silently producing NaN channels", () => {
    // A silently-wrong colour would ship as a visual defect nothing gates.
    expect(() => blendSkyBandColor("not-a-colour", "#000", 0.5)).toThrow(/hex colour/);
  });
});


describe("planSkyBackdrop grades below the horizon as well as above it", () => {
  /**
   * ## Why the ground side exists
   *
   * The first version of this planner graded only upward. Measured on Skyline Runner's retained frame that
   * cut the dominant colour bucket from **43.65% to 26.08%** -- a real improvement -- but the region *below*
   * the horizon then became the largest remaining flat wash, because the scene background showed through
   * unmodulated. Grading one side of a horizon is not horizon placement.
   */
  const SPAN = [-0.309, 6.091] as const;
  const plan = planSkyBackdrop({
    span: SPAN, depth: -6.5, horizonY: 0, height: 20, bands: 5, belowHorizonHeight: 14, belowHorizonBands: 4
  });
  const ground = plan.bands.filter((band) => band.side === "ground");
  const sky = plan.bands.filter((band) => band.side === "sky");

  it("omits the ground side unless it is asked for", () => {
    // Most scenes show nothing below the horizon; adding geometry there by default would be a silent cost.
    const skyOnly = planSkyBackdrop({ span: SPAN, depth: -6.5, horizonY: 0, height: 20, bands: 5 });
    expect(skyOnly.bands.every((band) => band.side === "sky")).toBe(true);
    expect(skyOnly.nadirY).toBe(skyOnly.horizonY);
  });

  it("produces both sides when asked, each with its own band count", () => {
    expect(sky.length).toBe(5);
    expect(ground.length).toBe(4);
  });

  it("stacks ground bands contiguously downward from the horizon", () => {
    let cursor = plan.horizonY;
    for (const band of ground) {
      expect(band.centerY + band.height / 2).toBeCloseTo(cursor, 3);
      cursor = band.centerY - band.height / 2;
    }
    expect(cursor).toBeCloseTo(plan.nadirY, 3);
  });

  it("keeps every ground band strictly below the horizon and every sky band above it", () => {
    // A band crossing the horizon would double-cover it and z-fight against its opposite side.
    for (const band of ground) expect(band.centerY + band.height / 2).toBeLessThanOrEqual(plan.horizonY + 1e-6);
    for (const band of sky) expect(band.centerY - band.height / 2).toBeGreaterThanOrEqual(plan.horizonY - 1e-6);
  });

  it("darkens the ground away from the horizon rather than repeating the sky ramp", () => {
    for (let index = 1; index < ground.length; index += 1) {
      expect(ground[index]!.emissiveIntensity).toBeLessThan(ground[index - 1]!.emissiveIntensity);
    }
    // The ground side starts dimmer than the sky's horizon band: ground is lit indirectly.
    expect(ground[0]!.emissiveIntensity).toBeLessThan(sky[0]!.emissiveIntensity);
    expect(ground[ground.length - 1]!.emissiveIntensity).toBeGreaterThan(0);
  });

  it("shares depth and width across both sides so the backdrop reads as one surface", () => {
    const widths = new Set(plan.bands.map((band) => band.width));
    const depths = new Set(plan.bands.map((band) => band.z));
    expect(widths.size).toBe(1);
    expect(depths.size).toBe(1);
  });

  it("remains deterministic with both sides planned", () => {
    expect(planSkyBackdrop({
      span: SPAN, depth: -6.5, horizonY: 0, height: 20, bands: 5, belowHorizonHeight: 14, belowHorizonBands: 4
    })).toEqual(plan);
  });
});


describe("skyBandCountForRamp derives band count instead of guessing it", () => {
  /**
   * ## The defect that motivated this
   *
   * The first banded backdrop used a hand-picked 5 bands. Sampling the *rendered* Skyline frame down a
   * backdrop-only column measured hard steps of **21 per channel** at the horizon and 18 in the ground ramp.
   * That is visible banding: it replaced "flat sky" with "stepped sky", which is a different defect, not a
   * fix. Band count is a property of the colour ramp, so it is derivable rather than a matter of taste.
   */
  it("keeps the per-band step at or below the requested maximum", () => {
    /*
     * The load-bearing property. For each ramp, the widest channel range divided by the number of gaps must
     * not exceed the budget -- this is the invariant, asserted rather than a specific band count.
     */
    const ramps: readonly (readonly [string, string])[] = [
      ["#4e93b4", "#173a5c"],
      ["#41809f", "#123048"],
      ["#000000", "#ffffff"],
      ["#102030", "#112131"]
    ];
    for (const [from, to] of ramps) {
      for (const budget of [4, 8, 16]) {
        const bands = skyBandCountForRamp(from, to, budget);
        const channels = [0, 2, 4].map((offset) => Math.abs(
          Number.parseInt(from.slice(1).slice(offset, offset + 2), 16) -
          Number.parseInt(to.slice(1).slice(offset, offset + 2), 16)
        ));
        const widest = Math.max(...channels);
        expect(widest / (bands - 1), `${from}->${to} @${budget}`).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("rejects the 5-band count that produced the measured 21-per-channel stair", () => {
    // Regression pin: Skyline's own ramp must now demand materially more than the 5 bands that banded.
    expect(skyBandCountForRamp("#4e93b4", "#173a5c")).toBeGreaterThan(5);
  });

  it("asks for more bands on a wider ramp", () => {
    const narrow = skyBandCountForRamp("#102030", "#152535");
    const wide = skyBandCountForRamp("#000000", "#ffffff");
    expect(wide).toBeGreaterThan(narrow);
  });

  it("never drops below two bands, because one band is the flat plane defect", () => {
    // An identical ramp needs no gradient, but a single quad is exactly what this module exists to replace.
    expect(skyBandCountForRamp("#4e93b4", "#4e93b4")).toBe(2);
    expect(skyBandCountForRamp("#4e93b4", "#4e93b4", 999)).toBe(2);
  });

  it("produces a count the planner accepts without clamping it away", () => {
    /*
     * A derived count is useless if `planSkyBackdrop` silently clamps it. The planner's upper bound was
     * raised from 12 to 32 for exactly this reason, so assert the round trip rather than the bound.
     */
    const derived = skyBandCountForRamp("#4e93b4", "#173a5c");
    const plan = planSkyBackdrop({ span: [0, 6], depth: -6.5, horizonY: 0, height: 20, bands: derived });
    expect(plan.bands.filter((band) => band.side === "sky").length).toBe(derived);
  });

  it("keeps the rendered ramp monotonic across every derived band", () => {
    // Bands must darken in one direction; a non-monotonic ramp reads as a stripe, not a gradient.
    const derived = skyBandCountForRamp("#4e93b4", "#173a5c");
    const plan = planSkyBackdrop({ span: [0, 6], depth: -6.5, horizonY: 0, height: 20, bands: derived });
    const luma = plan.bands
      .filter((band) => band.side === "sky")
      .map((band) => {
        const hex = blendSkyBandColor("#4e93b4", "#173a5c", band.blend).slice(1);
        return [0, 2, 4].reduce((sum, offset) => sum + Number.parseInt(hex.slice(offset, offset + 2), 16), 0);
      });
    for (let index = 1; index < luma.length; index += 1) {
      expect(luma[index]!).toBeLessThan(luma[index - 1]!);
    }
  });
});


describe("the sky backdrop is reusable across materially different scenes, not Skyline-shaped", () => {
  /**
   * ## Why this suite exists separately
   *
   * Every other `planSkyBackdrop` assertion in this file uses Skyline's own span, height and colour ramp, which
   * proves the planner works *for Skyline*. The brief requires reusability be proven through a second
   * configuration or generated scene, and a planner validated only against its first consumer is exactly the
   * "moved the code without making it reusable" failure the brief warns about.
   *
   * These are generated scenes at materially different scales -- a tiny arena, a wide open-world strip, a
   * high-altitude scene with a non-zero horizon, and a dark night ramp -- asserted on the *invariants* rather
   * than on any expected numbers, so they cannot pass by encoding one scene's constants.
   */
  interface Scene {
    readonly name: string;
    readonly span: readonly [number, number];
    readonly depth: number;
    readonly horizonY: number;
    readonly height: number;
    readonly belowHorizonHeight?: number;
    readonly ramp: readonly [string, string];
  }

  const SCENES: readonly Scene[] = [
    // Skyline's own shape, kept as the control.
    { name: "side-scroller", span: [-0.309, 6.091], depth: -6.5, horizonY: 0, height: 20, belowHorizonHeight: 14, ramp: ["#4e93b4", "#173a5c"] },
    // A small arena: span narrower than the backdrop's minimum widening.
    { name: "tiny arena", span: [-1.5, 1.5], depth: -4, horizonY: 0.25, height: 6, ramp: ["#c9e7f2", "#5f8fb0"] },
    // A wide open strip, ~14x the side-scroller span.
    { name: "wide open world", span: [-45, 45], depth: -60, horizonY: -2, height: 90, belowHorizonHeight: 40, ramp: ["#ffd9a8", "#3c2a52"] },
    // Non-zero, negative horizon with a tall sky: a scene looking up from a valley floor.
    { name: "valley floor", span: [2, 9], depth: -12, horizonY: -6.75, height: 34, belowHorizonHeight: 3, ramp: ["#8fb8c4", "#101c33"] },
    // A nearly-black night ramp, where a derived band count must not explode or collapse.
    { name: "night", span: [-8, 8], depth: -20, horizonY: 0, height: 25, ramp: ["#1a2233", "#05070d"] }
  ];

  it.each(SCENES.map((scene) => [scene.name, scene] as const))(
    "keeps every backdrop invariant for the %s scene",
    (_name, scene) => {
      const plan = planSkyBackdrop({
        span: scene.span,
        depth: scene.depth,
        horizonY: scene.horizonY,
        height: scene.height,
        bands: skyBandCountForRamp(...scene.ramp),
        ...(scene.belowHorizonHeight === undefined ? {} : { belowHorizonHeight: scene.belowHorizonHeight })
      });
      const sky = plan.bands.filter((band) => band.side === "sky");
      const ground = plan.bands.filter((band) => band.side === "ground");

      // Never a single flat plane, which is the defect the module exists to remove.
      expect(sky.length, "sky bands").toBeGreaterThanOrEqual(2);

      // Horizon and zenith are where the caller asked for them.
      expect(plan.horizonY).toBeCloseTo(scene.horizonY, 3);
      expect(plan.zenithY).toBeCloseTo(scene.horizonY + scene.height, 3);

      // Contiguous upward from the horizon: no gap showing the scene through, no overlap to z-fight.
      let cursor = plan.horizonY;
      for (const band of sky) {
        expect(band.centerY - band.height / 2).toBeCloseTo(cursor, 3);
        cursor = band.centerY + band.height / 2;
      }
      expect(cursor).toBeCloseTo(plan.zenithY, 3);

      // Ground side only when requested, and contiguous downward when present.
      if (scene.belowHorizonHeight === undefined) {
        expect(ground).toHaveLength(0);
        expect(plan.nadirY).toBe(plan.horizonY);
      } else {
        expect(ground.length).toBeGreaterThanOrEqual(2);
        let downward = plan.horizonY;
        for (const band of ground) {
          expect(band.centerY + band.height / 2).toBeCloseTo(downward, 3);
          downward = band.centerY - band.height / 2;
        }
        expect(downward).toBeCloseTo(plan.nadirY, 3);
      }

      // Blend spans the full ramp, monotonically, so a colour ramp is always derivable.
      expect(sky[0]!.blend).toBe(0);
      expect(sky[sky.length - 1]!.blend).toBe(1);
      for (let index = 1; index < sky.length; index += 1) {
        expect(sky[index]!.blend).toBeGreaterThan(sky[index - 1]!.blend);
      }

      // Wider than the requested span at every scale, so the backdrop edge cannot enter frame.
      const spanWidth = Math.abs(scene.span[1] - scene.span[0]);
      for (const band of plan.bands) {
        expect(band.width).toBeGreaterThan(spanWidth);
        expect(band.z).toBe(Math.round(scene.depth * 10_000) / 10_000);
        expect(band.height).toBeGreaterThan(0);
        expect(band.emissiveIntensity).toBeGreaterThan(0);
      }

      // The per-band colour step stays inside the banding budget for this scene's own ramp.
      const channelRange = Math.max(...[0, 2, 4].map((offset) => Math.abs(
        Number.parseInt(scene.ramp[0].slice(1).slice(offset, offset + 2), 16) -
        Number.parseInt(scene.ramp[1].slice(1).slice(offset, offset + 2), 16)
      )));
      expect(channelRange / (sky.length - 1)).toBeLessThanOrEqual(8);
    }
  );

  it("scales band geometry with the scene rather than emitting one fixed size", () => {
    /*
     * The load-bearing reusability property. If the planner returned Skyline-shaped geometry regardless of input,
     * every invariant above would still pass while the module was useless to any other scene.
     */
    const plans = SCENES.map((scene) => planSkyBackdrop({
      span: scene.span, depth: scene.depth, horizonY: scene.horizonY, height: scene.height, bands: 4
    }));
    const widths = new Set(plans.map((plan) => plan.bands[0]!.width));
    const heights = new Set(plans.map((plan) => plan.bands[0]!.height));
    const depths = new Set(plans.map((plan) => plan.bands[0]!.z));
    expect(widths.size, "each scene must get its own backdrop width").toBe(SCENES.length);
    expect(heights.size, "each scene must get its own band height").toBe(SCENES.length);
    expect(depths.size, "each scene must get its own depth").toBe(SCENES.length);
  });

  it("derives different band counts for different ramps in the same scene", () => {
    // Band count must follow the ramp, not the scene, or `skyBandCountForRamp` is decoration.
    const base = { span: [-8, 8] as const, depth: -20, horizonY: 0, height: 25 };
    const wide = planSkyBackdrop({ ...base, bands: skyBandCountForRamp("#ffffff", "#000000") });
    const narrow = planSkyBackdrop({ ...base, bands: skyBandCountForRamp("#4e93b4", "#4a8fb0") });
    expect(wide.bands.length).toBeGreaterThan(narrow.bands.length);
  });

  it("is deterministic for every generated scene", () => {
    // Retained screenshot evidence is only comparable if identical intent yields identical geometry.
    for (const scene of SCENES) {
      const build = () => planSkyBackdrop({
        span: scene.span, depth: scene.depth, horizonY: scene.horizonY, height: scene.height, bands: 6,
        ...(scene.belowHorizonHeight === undefined ? {} : { belowHorizonHeight: scene.belowHorizonHeight })
      });
      expect(build(), scene.name).toEqual(build());
    }
  });
});

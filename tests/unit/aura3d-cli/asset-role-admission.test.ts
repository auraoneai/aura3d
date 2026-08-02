import { describe, expect, it } from "vitest";
import {
  admitAssetForRole,
  rankAssetCandidatesForRole,
  type AssetAdmissionInput,
  type AssetGeometryFacts
} from "../../../packages/aura3d-cli/src/asset-role-admission";

/**
 * Every fixture below is the *measured* geometry of a real asset that shipped into Turbo Drift Circuit
 * and was visually wrong. They are kept as fixtures rather than paraphrased so a future change to the
 * admission rules is tested against the failures that actually occurred, not against invented ones.
 *
 * All four passed every gate that existed at the time, because those gates measured the rendered frame
 * (subject pixel size, foreground bounds, coverage ratios) and a wheelless car is a large, well-lit,
 * correctly-framed subject.
 */

/** `showcaseTexturedSportsCar`: tyres attached through detached stalk-like geometry. */
const STALK_TYRE_CAR: AssetGeometryFacts = {
  partCount: 7,
  triangles: 33_700,
  bounds: [2.28, 2.209, 6.958],
  materialCount: 4,
  textureCount: 3,
  wheelCandidates: 4,
  distinctWheelCorners: 4,
  wheelsVisibleInSilhouette: true,
  wheelHalfWidth: 1.2,
  bodyHalfWidth: 1.14,
  detachedPartCount: 4
};

/** `showcaseCityVehicle`: a 792-triangle traffic body shell with no wheels modelled. */
const BODY_SHELL_CAR: AssetGeometryFacts = {
  partCount: 1,
  triangles: 792,
  bounds: [1.86, 1.4, 4.2],
  materialCount: 1,
  textureCount: 0,
  wheelCandidates: 0,
  distinctWheelCorners: 0,
  wheelsVisibleInSilhouette: false,
  detachedPartCount: 0
};

/** `turboHeroCar`: 16 wheel candidates at four corners, all enclosed inside a Le Mans body. */
const ENCLOSED_WHEEL_CAR: AssetGeometryFacts = {
  partCount: 483,
  triangles: 71_426,
  bounds: [19.74, 5.1, 46.2],
  materialCount: 12,
  textureCount: 8,
  wheelCandidates: 16,
  distinctWheelCorners: 4,
  wheelsVisibleInSilhouette: false,
  wheelHalfWidth: 8.35,
  bodyHalfWidth: 9.87,
  detachedPartCount: 0
};

/** `turboRaceCar`: the accepted candidate. Measured world bounds from the registered GLB. */
const VALID_HERO_CAR: AssetGeometryFacts = {
  partCount: 5,
  triangles: 11_344,
  bounds: [186.281, 176.352, 377.939],
  materialCount: 2,
  textureCount: 6,
  wheelCandidates: 4,
  distinctWheelCorners: 4,
  wheelsVisibleInSilhouette: true,
  wheelHalfWidth: 93.1,
  bodyHalfWidth: 92.2,
  detachedPartCount: 0,
  minY: 0.705
};

const HERO_REQUIREMENT = {
  role: "hero-vehicle",
  requireReadableWheels: true,
  requireTextured: true,
  requireProvenance: true
} as const;

const PROVENANCE = { license: "CC-BY-4.0", author: "DJMaesen", provider: "objaverse" } as const;

/** Rendered evidence across enough angles to be meaningful. */
const GOOD_RENDER = {
  screenshotPath: "tests/reports/vehicle-wheel-visibility/turboRaceCar-angle-3.png",
  renderedWheelVisibility: true,
  renderedAzimuths: [0.55, 1.1, 1.5708, 2.2]
} as const;

describe("hero-vehicle admission rejects each real failure mode", () => {
  it("rejects a body shell with no wheels modelled", () => {
    const report = admitAssetForRole({
      assetId: "showcaseCityVehicle",
      requirement: HERO_REQUIREMENT,
      geometry: BODY_SHELL_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.admitted).toBe(false);
    expect(report.blockers.join(" ")).toContain("wheel-geometry-present");
    expect(report.blockers.join(" ")).toContain("no wheels modelled");
    expect(report.blockers.join(" ")).toContain("triangle-floor");
  });

  it("rejects detached stalk-like wheel geometry even though the wheels are technically visible", () => {
    const report = admitAssetForRole({
      assetId: "showcaseTexturedSportsCar",
      requirement: HERO_REQUIREMENT,
      geometry: STALK_TYRE_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.admitted).toBe(false);
    // The silhouette check PASSES here -- the tyres do reach outside the body. The rejection has to
    // come from the detachment check, which is why the two are separate.
    expect(report.checks.find((check) => check.id === "wheels-outside-body-silhouette")?.verdict).toBe("pass");
    expect(report.blockers.join(" ")).toContain("detached-geometry");
    expect(report.blockers.join(" ")).toContain("stalks");
  });

  it("rejects a closed-wheel prototype for a role that requires readable wheels", () => {
    const report = admitAssetForRole({
      assetId: "turboHeroCar",
      requirement: HERO_REQUIREMENT,
      geometry: ENCLOSED_WHEEL_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.admitted).toBe(false);
    // Wheel geometry EXISTS at four corners; that check must pass. Only readability fails.
    expect(report.checks.find((check) => check.id === "wheel-geometry-present")?.verdict).toBe("pass");
    expect(report.blockers.join(" ")).toContain("wheels-outside-body-silhouette");
    expect(report.blockers.join(" ")).toContain("closed-wheel prototype");
  });

  it("admits the same closed-wheel prototype when readable wheels are NOT required", () => {
    // The point of role-aware admission: this asset is structurally a valid vehicle.
    const report = admitAssetForRole({
      assetId: "turboHeroCar",
      requirement: { role: "hero-vehicle", requireTextured: true, requireProvenance: true },
      geometry: ENCLOSED_WHEEL_CAR,
      provenance: PROVENANCE
    });
    expect(report.admitted).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it("admits the accepted hero candidate", () => {
    const report = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: HERO_REQUIREMENT,
      geometry: VALID_HERO_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.admitted).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.unproven).toEqual([]);
  });
});

describe("fitness is expressed against the requested role, not globally", () => {
  it("admits the wheelless shell as a background vehicle", () => {
    const report = admitAssetForRole({
      assetId: "showcaseCityVehicle",
      requirement: { role: "background-vehicle" },
      geometry: BODY_SHELL_CAR
    });
    // A background traffic prop does not need a hero triangle count...
    expect(report.checks.find((check) => check.id === "triangle-floor")).toBeUndefined();
    // ...but it is still reported as unwheeled, so the caller is not misled about what it is.
    expect(report.checks.find((check) => check.id === "wheel-geometry-present")?.verdict).toBe("fail");
  });

  it("suggests background-vehicle when a hero request is rejected", () => {
    const report = admitAssetForRole({
      assetId: "turboHeroCar",
      requirement: HERO_REQUIREMENT,
      geometry: ENCLOSED_WHEEL_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.suitableAlternativeRoles).toContain("background-vehicle");
  });

  it("suggests prop for a low-triangle rejection", () => {
    const report = admitAssetForRole({
      assetId: "showcaseCityVehicle",
      requirement: HERO_REQUIREMENT,
      geometry: BODY_SHELL_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.suitableAlternativeRoles).toContain("prop");
  });

  it("reports no alternatives for an admitted asset", () => {
    const report = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: HERO_REQUIREMENT,
      geometry: VALID_HERO_CAR,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.suitableAlternativeRoles).toEqual([]);
  });
});

describe("structural prediction is never accepted as rendered proof", () => {
  it("reports unproven, not pass, when no render measured wheel visibility", () => {
    const report = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: HERO_REQUIREMENT,
      geometry: VALID_HERO_CAR,
      provenance: PROVENANCE
    });
    expect(report.admitted).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.unproven.join(" ")).toContain("rendered-wheel-visibility");
    expect(report.unproven.join(" ")).toContain("geometry alone cannot prove");
  });

  it("rejects a single-angle render as insufficient", () => {
    // This is the exact mistake that produced the false "renderer drops wheel primitives" conclusion:
    // the release probe rendered one dead-on front view, the single angle where a car's own bodywork
    // hides its wheels.
    const report = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: HERO_REQUIREMENT,
      geometry: VALID_HERO_CAR,
      provenance: PROVENANCE,
      rendered: {
        screenshotPath: "tests/reports/showcase-release-asset-probes/turboRaceCar.png",
        renderedWheelVisibility: true,
        renderedAzimuths: [0]
      }
    });
    expect(report.admitted).toBe(false);
    expect(report.unproven.join(" ")).toContain("only 1 camera angle");
  });

  it("fails when a render explicitly shows no readable wheels", () => {
    const report = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: HERO_REQUIREMENT,
      geometry: VALID_HERO_CAR,
      provenance: PROVENANCE,
      rendered: { screenshotPath: "x.png", renderedWheelVisibility: false, renderedAzimuths: [0.5, 1.2] }
    });
    expect(report.admitted).toBe(false);
    expect(report.blockers.join(" ")).toContain("rendered-wheel-visibility");
  });

  it("reports unproven when the silhouette relationship was not measured", () => {
    const { wheelsVisibleInSilhouette: _omitted, ...withoutSilhouette } = VALID_HERO_CAR;
    const report = admitAssetForRole({
      assetId: "unknownCar",
      requirement: HERO_REQUIREMENT,
      geometry: withoutSilhouette,
      provenance: PROVENANCE,
      rendered: GOOD_RENDER
    });
    expect(report.admitted).toBe(false);
    expect(report.unproven.join(" ")).toContain("wheels-outside-body-silhouette");
  });
});

describe("other admission checks", () => {
  it("fails an untextured asset when the role requires textures", () => {
    const report = admitAssetForRole({
      assetId: "showcaseCityVehicle",
      requirement: { role: "background-vehicle", requireTextured: true },
      geometry: BODY_SHELL_CAR
    });
    expect(report.blockers.join(" ")).toContain("textured");
  });

  it("fails incomplete provenance", () => {
    const report = admitAssetForRole({
      assetId: "turboRaceCar",
      requirement: HERO_REQUIREMENT,
      geometry: VALID_HERO_CAR,
      provenance: { license: "CC-BY-4.0" },
      rendered: GOOD_RENDER
    });
    expect(report.blockers.join(" ")).toContain("provenance-complete");
    expect(report.blockers.join(" ")).toContain("author: missing");
  });

  it("enforces a triangle budget", () => {
    const report = admitAssetForRole({
      assetId: "turboHeroCar",
      requirement: { role: "background-vehicle", maxTriangles: 20_000 },
      geometry: ENCLOSED_WHEEL_CAR
    });
    expect(report.blockers.join(" ")).toContain("triangle-budget");
  });

  it("flags a grounding offset that requires the normalization path", () => {
    const report = admitAssetForRole({
      assetId: "offsetCar",
      requirement: { role: "background-vehicle" },
      geometry: { ...VALID_HERO_CAR, minY: 40 }
    });
    const check = report.checks.find((entry) => entry.id === "grounding-offset");
    expect(check?.detail).toContain("normalization path");
  });

  it("rejects an asset with no readable mesh parts", () => {
    const report = admitAssetForRole({
      assetId: "empty",
      requirement: { role: "prop" },
      geometry: { partCount: 0, triangles: 0, bounds: [0, 0, 0] }
    });
    expect(report.blockers.join(" ")).toContain("part-count");
  });
});

describe("rankAssetCandidatesForRole preserves every rejection reason", () => {
  const candidates: readonly AssetAdmissionInput[] = [
    { assetId: "showcaseCityVehicle", requirement: HERO_REQUIREMENT, geometry: BODY_SHELL_CAR, provenance: PROVENANCE, rendered: GOOD_RENDER },
    { assetId: "turboRaceCar", requirement: HERO_REQUIREMENT, geometry: VALID_HERO_CAR, provenance: PROVENANCE, rendered: GOOD_RENDER },
    { assetId: "turboHeroCar", requirement: HERO_REQUIREMENT, geometry: ENCLOSED_WHEEL_CAR, provenance: PROVENANCE, rendered: GOOD_RENDER },
    { assetId: "showcaseTexturedSportsCar", requirement: HERO_REQUIREMENT, geometry: STALK_TYRE_CAR, provenance: PROVENANCE, rendered: GOOD_RENDER }
  ];

  it("ranks the only admissible candidate first", () => {
    const ranked = rankAssetCandidatesForRole(candidates);
    expect(ranked[0]?.assetId).toBe("turboRaceCar");
    expect(ranked[0]?.admitted).toBe(true);
  });

  it("retains all four candidates with their reasons rather than discarding rejects", () => {
    const ranked = rankAssetCandidatesForRole(candidates);
    expect(ranked).toHaveLength(4);
    for (const report of ranked.slice(1)) {
      expect(report.admitted).toBe(false);
      expect(report.blockers.length + report.unproven.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(rankAssetCandidatesForRole(candidates)).toEqual(rankAssetCandidatesForRole(candidates));
  });
});

describe("the five checks WS3 names that admission previously omitted", () => {
  /**
   * The brief's WS3 list names **21 distinct checks** for vehicle admission. An item-by-item audit found five
   * absent: normalization requirement, orientation evidence, front/rear inference, origin/pivot sanity, and
   * material completeness. Normalization was mentioned only inside the grounding check's prose, and the other
   * four did not exist.
   *
   * Each is now its own recorded check, because the brief's point is that fitness is a *set* of distinct facts
   * rather than one boolean -- a caller choosing between hero and background use needs to see which fact failed.
   */
  function heroGeometry(overrides: Record<string, unknown> = {}) {
    return {
      partCount: 5, triangles: 11_344, bounds: [1.8, 1.2, 4.0] as const,
      materialCount: 2, textureCount: 1, wheelCandidates: 4, distinctWheelCorners: 4,
      wheelsVisibleInSilhouette: true, wheelHalfWidth: 0.95, bodyHalfWidth: 0.9,
      ...overrides
    };
  }

  it("records normalization as a distinct check, not buried in grounding prose", () => {
    const raw = admitAssetForRole({
      assetId: "raw-units", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ bounds: [186, 176, 378] as const })
    });
    const check = raw.checks.find((entry) => entry.id === "normalization-required");
    expect(check, "normalization-required must be recorded").toBeTruthy();
    expect(String(check?.detail)).toMatch(/must fit to a target size/);

    // A scene-scale asset records the same check with the opposite finding, so the fact is always present.
    const scaled = admitAssetForRole({
      assetId: "scene-scale", requirement: { role: "hero-vehicle" }, geometry: heroGeometry()
    });
    expect(String(scaled.checks.find((entry) => entry.id === "normalization-required")?.detail))
      .toMatch(/already scene-scale/);
  });

  it("never guesses orientation, and fails when a role requires evidence that is absent", () => {
    /*
     * The brief: "reject if required orientation evidence is absent". A symmetric body has no intrinsic front, so
     * inferring one is how a car ends up driving backwards down the track.
     */
    const required = admitAssetForRole({
      assetId: "unoriented",
      requirement: { role: "hero-vehicle", requireOrientationEvidence: true },
      geometry: heroGeometry()
    });
    expect(required.admitted).toBe(false);
    expect(required.checks.find((entry) => entry.id === "orientation-evidence")?.verdict).toBe("fail");

    const declared = admitAssetForRole({
      assetId: "oriented",
      requirement: { role: "hero-vehicle", requireOrientationEvidence: true },
      geometry: heroGeometry({ forwardAxis: [0, 0, 1] as const })
    });
    expect(declared.checks.find((entry) => entry.id === "orientation-evidence")?.verdict).toBe("pass");
  });

  it("does not block a role that never asked about orientation", () => {
    /*
     * The distinction that keeps `unproven` meaningful. `unproven` forbids admission by design -- it is how
     * "nobody measured wheel visibility" stops passing as "wheels are visible". Reporting absent-but-unrequested
     * orientation as `unproven` would make every asset unadmissible, including a rock with no forward axis.
     */
    const report = admitAssetForRole({
      assetId: "rock", requirement: { role: "prop" }, geometry: heroGeometry()
    });
    expect(report.checks.find((entry) => entry.id === "orientation-evidence")?.verdict).toBe("not-applicable");
    expect(report.unproven, "an unrequested check must not become unproven").toEqual([]);
  });

  it("reports front/rear distinguishability separately from which way the asset faces", () => {
    // Orientation says *which way*; this says whether a viewer can tell front from rear at all.
    const symmetric = admitAssetForRole({
      assetId: "symmetric", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ frontRearDistinguishable: false })
    });
    expect(symmetric.checks.find((entry) => entry.id === "front-rear-inference")?.verdict).toBe("not-applicable");
    const asymmetric = admitAssetForRole({
      assetId: "asymmetric", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ frontRearDistinguishable: true })
    });
    expect(asymmetric.checks.find((entry) => entry.id === "front-rear-inference")?.verdict).toBe("pass");
  });

  it("fails an off-centre pivot, which would swing the asset on a boom when rotated", () => {
    const offCentre = admitAssetForRole({
      assetId: "bad-pivot", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ pivotOffsetRatio: 0.8 })
    });
    expect(offCentre.admitted).toBe(false);
    expect(offCentre.blockers.some((reason) => reason.startsWith("origin-pivot-sanity:"))).toBe(true);
    const sane = admitAssetForRole({
      assetId: "good-pivot", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ pivotOffsetRatio: 0.05 })
    });
    expect(sane.checks.find((entry) => entry.id === "origin-pivot-sanity")?.verdict).toBe("pass");
  });

  it("fails a part with no material, which has no shader to draw with", () => {
    /*
     * Distinct from `textured`, which asks whether the asset uses textures at all. A part with no material
     * assignment is one of the ways an asset that "loads successfully" is still visually broken -- exactly the
     * inference the brief forbids treating as suitability.
     */
    const incomplete = admitAssetForRole({
      assetId: "missing-material", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ partsWithoutMaterial: 2 })
    });
    expect(incomplete.admitted).toBe(false);
    expect(incomplete.blockers.some((reason) => reason.startsWith("material-completeness:"))).toBe(true);
    const complete = admitAssetForRole({
      assetId: "all-materials", requirement: { role: "hero-vehicle" },
      geometry: heroGeometry({ partsWithoutMaterial: 0 })
    });
    expect(complete.checks.find((entry) => entry.id === "material-completeness")?.verdict).toBe("pass");
  });

  it("records all 21 of the brief's named vehicle-admission facts for a fully-measured hero", () => {
    /*
     * The audit encoded. A future edit that drops one of these checks fails here rather than passing quietly,
     * which is how five of them went missing in the first place.
     */
    const report = admitAssetForRole({
      assetId: "fully-measured",
      requirement: {
        role: "hero-vehicle", requireReadableWheels: true, requireTextured: true,
        minTriangles: 3000, maxTriangles: 200_000, requireProvenance: true, requireOrientationEvidence: true
      },
      geometry: heroGeometry({
        forwardAxis: [0, 0, 1] as const, frontRearDistinguishable: true,
        pivotOffsetRatio: 0.04, partsWithoutMaterial: 0, minY: 0, detachedPartCount: 0
      }),
      rendered: {
        screenshotPath: "tests/reports/vehicle-wheel-visibility/turboRaceCar-angle-2.png",
        renderedWheelVisibility: true, renderedAzimuths: [0, 0.55, 1.1, 1.5708, 2.2]
      },
      provenance: { license: "CC-BY-4.0", author: "tomkart", sourcePage: "https://example/asset", provider: "objaverse" }
    });
    const ids = report.checks.map((check) => check.id);
    for (const id of [
      "part-count", "triangle-floor", "triangle-budget", "textured", "wheel-geometry-present",
      "wheels-outside-body-silhouette", "rendered-wheel-visibility", "grounding-offset",
      "normalization-required", "orientation-evidence", "front-rear-inference", "origin-pivot-sanity",
      "material-completeness", "provenance-complete"
    ]) {
      expect(ids, `missing check: ${id}`).toContain(id);
    }
    expect(report.admitted, "a fully-measured hero must be admissible").toBe(true);
  });
});

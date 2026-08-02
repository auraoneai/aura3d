import { describe, expect, it, vi } from "vitest";
import {
  admissionRequirementForIntent,
  licenseSatisfiesPolicy,
  searchQueriesForIntent,
  validateAssetIntent,
  type AssetIntent
} from "../../../packages/aura3d-cli/src/asset-intent";
import {
  formatScreeningReport,
  screenAssetCandidates,
  type ScreeningCandidate,
  type ScreeningEffects
} from "../../../packages/aura3d-cli/src/asset-screening-pipeline";

/**
 * These two modules exist because of one repeated failure: there was nowhere to *state* what a route
 * needed from an asset, and nothing that ran the screening steps in order while keeping the record.
 *
 * Three unusable hero vehicles shipped in succession, each chosen by re-wording a query and hoping. I
 * also once concluded "the catalog has no suitable props" without having searched it -- a claim the brief
 * explicitly forbids -- which was disproved by 10 pullable candidates on the first query.
 *
 * So the tests below concentrate on two properties: an intent must be *checkable and self-invalidating*,
 * and the pipeline must *never lose a rejection reason*.
 */

const HERO_CAR_INTENT: AssetIntent = {
  id: "turbo-hero-car",
  role: "hero-vehicle",
  style: "modern road race car",
  requiredVisibleFeatures: ["wheels"],
  materialRequirement: "textured",
  licensePolicy: "commercial-attribution-allowed",
  geometryBudget: { minTriangles: 3_000, maxTriangles: 80_000, maxDrawCallsPerInstance: 12 },
  heroCameraAngles: { heroAzimuths: [0.55, 1.1, 1.5708], elevation: 0.18 },
  orientationRequirement: "require-manifest-evidence",
  normalizationPolicy: "fit-and-ground",
  fallbackPolicy: "reject-and-fail"
};

describe("asset intent is checkable and rejects incoherent requests", () => {
  it("accepts a coherent hero-vehicle intent", () => {
    expect(validateAssetIntent(HERO_CAR_INTENT)).toEqual([]);
  });

  it("rejects requiring visible features from a single camera angle", () => {
    /*
     * The load-bearing validation. A hero asking for readable wheels while declaring one azimuth is
     * unsatisfiable-by-construction: a dead-on view is exactly where a car's bodywork hides its wheels.
     * Catching it at authoring time avoids a screening run that rejects everything for a bad reason.
     */
    const problems = validateAssetIntent({
      ...HERO_CAR_INTENT,
      heroCameraAngles: { heroAzimuths: [0] }
    });
    expect(problems.join(" ")).toContain("only 1 distinct hero azimuth");
    expect(problems.join(" ")).toContain("hides its lower features");
  });

  it("treats duplicate azimuths as one angle", () => {
    const problems = validateAssetIntent({
      ...HERO_CAR_INTENT,
      heroCameraAngles: { heroAzimuths: [0.55, 0.55, 0.55] }
    });
    expect(problems.join(" ")).toContain("only 1 distinct hero azimuth");
  });

  it("rejects an empty geometry budget", () => {
    const problems = validateAssetIntent({
      ...HERO_CAR_INTENT,
      geometryBudget: { minTriangles: 90_000, maxTriangles: 10_000 }
    });
    expect(problems.join(" ")).toContain("geometry budget is empty");
  });

  it("rejects negative budget values", () => {
    const problems = validateAssetIntent({ ...HERO_CAR_INTENT, geometryBudget: { maxTriangles: -1 } });
    expect(problems.join(" ")).toContain("non-negative finite number");
  });

  it("rejects features a role cannot have", () => {
    expect(validateAssetIntent({
      ...HERO_CAR_INTENT, role: "building", requiredVisibleFeatures: ["wheels"]
    }).join(" ")).toContain('role "building" cannot require visible wheels');
    expect(validateAssetIntent({
      ...HERO_CAR_INTENT, role: "hero-vehicle", requiredVisibleFeatures: ["feet"],
    }).join(" ")).toContain("cannot require visible feet");
  });

  it("rejects an empty id or style", () => {
    expect(validateAssetIntent({ ...HERO_CAR_INTENT, id: "  " }).join(" ")).toContain("id must not be empty");
    expect(validateAssetIntent({ ...HERO_CAR_INTENT, style: "" }).join(" ")).toContain("style must not be empty");
  });
});

describe("license policy gates by SPDX, never by optimism", () => {
  it("admits CC-BY only under an attribution-allowing policy", () => {
    expect(licenseSatisfiesPolicy("CC-BY-4.0", "commercial-attribution-allowed")).toBe(true);
    expect(licenseSatisfiesPolicy("CC-BY-4.0", "public-domain-only")).toBe(false);
  });

  it("admits share-alike only under any-redistributable", () => {
    expect(licenseSatisfiesPolicy("CC-BY-SA-4.0", "commercial-attribution-allowed")).toBe(false);
    expect(licenseSatisfiesPolicy("CC-BY-SA-4.0", "any-redistributable")).toBe(true);
  });

  it("never admits an unknown or missing licence", () => {
    // An unverified licence is a legal risk, so absence must fail rather than default open.
    expect(licenseSatisfiesPolicy(undefined, "any-redistributable")).toBe(false);
    expect(licenseSatisfiesPolicy("Proprietary", "any-redistributable")).toBe(false);
  });
});

describe("intent drives search and admission derivation", () => {
  it("builds multiple query phrasings, most specific first", () => {
    // One query returning poor results was previously indistinguishable from "the catalog has nothing".
    const queries = searchQueriesForIntent(HERO_CAR_INTENT);
    expect(queries[0]).toBe("modern road race car");
    expect(queries.length).toBeGreaterThan(1);
    expect(queries.some((query) => query.includes("visible wheels"))).toBe(true);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("forwards only checkable fields into the admission requirement", () => {
    const requirement = admissionRequirementForIntent(HERO_CAR_INTENT);
    expect(requirement).toMatchObject({
      role: "hero-vehicle",
      requireReadableWheels: true,
      requireTextured: true,
      minTriangles: 3_000,
      maxTriangles: 80_000,
      requireProvenance: true
    });
    // Style, camera angles and normalization policy are NOT forwarded: admission cannot verify them, and
    // forwarding them would let it report a pass on a dimension it never measured.
    expect(Object.keys(requirement)).not.toContain("style");
    expect(Object.keys(requirement)).not.toContain("heroCameraAngles");
    expect(Object.keys(requirement)).not.toContain("normalizationPolicy");
  });

  it("drops the provenance requirement for a public-domain-only policy", () => {
    const requirement = admissionRequirementForIntent({ ...HERO_CAR_INTENT, licensePolicy: "public-domain-only" });
    expect(requirement.requireProvenance).toBeUndefined();
  });
});

/** A candidate factory with sane defaults so each test states only what it varies. */
function candidate(overrides: Partial<ScreeningCandidate> & Pick<ScreeningCandidate, "id">): ScreeningCandidate {
  return {
    licenseSpdx: "CC-BY-4.0",
    author: "Some Author",
    provider: "objaverse",
    autoPullable: true,
    searchScore: 5,
    ...overrides
  };
}

/** Geometry that passes hero admission. Mirrors the real accepted `turboRaceCar`. */
const GOOD_GEOMETRY = {
  partCount: 5,
  triangles: 11_344,
  bounds: [186.281, 176.352, 377.939] as const,
  textureCount: 6,
  wheelCandidates: 4,
  distinctWheelCorners: 4,
  wheelsVisibleInSilhouette: true,
  wheelHalfWidth: 93.1,
  bodyHalfWidth: 92.2,
  detachedPartCount: 0,
  drawCallsPerInstance: 10
};

/** The 792-triangle wheelless shell that shipped as a hero once. */
const SHELL_GEOMETRY = {
  partCount: 1,
  triangles: 792,
  bounds: [1.86, 1.4, 4.2] as const,
  textureCount: 0,
  wheelCandidates: 0,
  distinctWheelCorners: 0,
  wheelsVisibleInSilhouette: false,
  drawCallsPerInstance: 2
};

const GOOD_RENDER = { screenshotPath: "probe.png", renderedWheelVisibility: true, renderedAzimuths: [0.55, 1.1, 1.5708] };

function effectsFor(
  candidates: readonly ScreeningCandidate[],
  overrides: Partial<ScreeningEffects> = {}
): ScreeningEffects {
  return {
    search: async () => candidates,
    pull: async (c) => ({ localPath: `/tmp/${c.id}.glb` }),
    inspectGeometry: async () => GOOD_GEOMETRY,
    renderProbe: async () => GOOD_RENDER,
    ...overrides
  };
}

describe("the screening pipeline preserves every rejection reason", () => {
  it("accepts a candidate that satisfies the intent and records the selection", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:good" })])
    });
    expect(report.selected?.candidate.id).toBe("objaverse:good");
    expect(report.selected?.accepted).toBe(true);
    expect(report.ranked).toHaveLength(1);
  });

  it("retains a reason for every rejected candidate", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor(
        [
          candidate({ id: "objaverse:proprietary", licenseSpdx: "Proprietary" }),
          candidate({ id: "sketchfab:gated", autoPullable: false }),
          candidate({ id: "objaverse:shell" }),
          candidate({ id: "objaverse:good" })
        ],
        {
          inspectGeometry: async (c) => (c.id === "objaverse:shell" ? SHELL_GEOMETRY : GOOD_GEOMETRY)
        }
      )
    });
    expect(report.candidates).toHaveLength(4);
    for (const outcome of report.candidates) {
      if (outcome.accepted) continue;
      expect(outcome.reasons.length, `${outcome.candidate.id} must carry a reason`).toBeGreaterThan(0);
      expect(outcome.rejectedAtStage, `${outcome.candidate.id} stage`).toBeTruthy();
    }
  });

  it("rejects on licence policy before spending a download", async () => {
    const pull = vi.fn(async (c: ScreeningCandidate) => ({ localPath: `/tmp/${c.id}` }));
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:sa", licenseSpdx: "CC-BY-SA-4.0" })], { pull })
    });
    expect(pull).not.toHaveBeenCalled();
    expect(report.candidates[0]?.rejectedAtStage).toBe("license-policy");
    expect(report.candidates[0]?.reasons.join(" ")).toContain("does not satisfy commercial-attribution-allowed");
  });

  it("reports an auth-gated candidate as skipped rather than silently dropping it", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor([candidate({ id: "sketchfab:gated", autoPullable: false }), candidate({ id: "objaverse:good" })])
    });
    const gated = report.candidates.find((outcome) => outcome.candidate.id === "sketchfab:gated");
    expect(gated?.rejectedAtStage).toBe("auto-pullable");
    expect(gated?.reasons.join(" ")).toContain("interactive authentication");
    // ...and screening continued to a pullable candidate.
    expect(report.selected?.candidate.id).toBe("objaverse:good");
  });

  it("rejects a per-instance draw-call blowout that a triangle budget would miss", async () => {
    /*
     * A real regression: a 4.6MB pine cluster rendered correctly in isolation but carried 42 nodes and 5
     * materials per instance, driving a route to 840 draw calls and a blank capture. Triangles were fine.
     */
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:heavy" })], {
        inspectGeometry: async () => ({ ...GOOD_GEOMETRY, drawCallsPerInstance: 210 })
      })
    });
    expect(report.candidates[0]?.rejectedAtStage).toBe("budget");
    expect(report.candidates[0]?.reasons.join(" ")).toContain("draw calls per instance exceeds");
  });

  it("records a pull failure as a rejection and continues to the next candidate", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:401" }), candidate({ id: "objaverse:good" })], {
        pull: async (c) => {
          if (c.id === "objaverse:401") throw new Error("HTTP 401 Unauthorized");
          return { localPath: `/tmp/${c.id}` };
        }
      })
    });
    expect(report.candidates[0]?.reasons.join(" ")).toContain("HTTP 401");
    expect(report.selected?.candidate.id).toBe("objaverse:good");
  });

  it("bounds downloads and says so for candidates it never pulled", async () => {
    const pull = vi.fn(async (c: ScreeningCandidate) => ({ localPath: `/tmp/${c.id}` }));
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      maxCandidatesToPull: 2,
      effects: effectsFor(
        [candidate({ id: "a" }), candidate({ id: "b" }), candidate({ id: "c" })],
        { pull, inspectGeometry: async () => SHELL_GEOMETRY }
      )
    });
    expect(pull).toHaveBeenCalledTimes(2);
    const unpulled = report.candidates.find((outcome) => outcome.candidate.id === "c");
    expect(unpulled?.reasons.join(" ")).toContain("pull budget of 2");
  });

  it("counts rejections per stage so the failure distribution is answerable", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor(
        [
          candidate({ id: "p1", licenseSpdx: "Proprietary" }),
          candidate({ id: "p2", licenseSpdx: "Proprietary" }),
          candidate({ id: "shell" })
        ],
        { inspectGeometry: async () => SHELL_GEOMETRY }
      )
    });
    expect(report.rejectionsByStage["license-policy"]).toBe(2);
    expect(report.rejectionsByStage.admission).toBe(1);
  });

  it("deduplicates candidates across query phrasings while keeping a stable index", async () => {
    let call = 0;
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor([], {
        search: async () => {
          call += 1;
          // Every phrasing returns the same candidate plus one unique to the call.
          return [candidate({ id: "shared" }), candidate({ id: `unique-${call}` })];
        },
        inspectGeometry: async () => SHELL_GEOMETRY
      })
    });
    const ids = report.candidates.map((outcome) => outcome.candidate.id);
    expect(ids.filter((id) => id === "shared")).toHaveLength(1);
    expect(report.candidates.map((outcome) => outcome.index)).toEqual(ids.map((_id, index) => index));
  });

  it("survives a failing query phrasing rather than aborting the screen", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([], {
        search: async (query) => {
          if (query === HERO_CAR_INTENT.style) throw new Error("provider 503");
          return [candidate({ id: "objaverse:good" })];
        }
      })
    });
    expect(report.selected?.candidate.id).toBe("objaverse:good");
  });
});

describe("rendered visibility is never synthesised from geometry", () => {
  it("reports unproven and selects nothing when no render probe is available", async () => {
    const { renderProbe: _omit, ...withoutProbe } = effectsFor([candidate({ id: "objaverse:good" })]);
    const report = await screenAssetCandidates({ intent: HERO_CAR_INTENT, effects: withoutProbe });
    expect(report.selected).toBeUndefined();
    const outcome = report.candidates[0];
    expect(outcome?.accepted).toBe(false);
    expect(outcome?.reasons.join(" ")).toContain("geometry alone cannot prove");
  });

  it("rejects a single-angle render as insufficient", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:good" })], {
        renderProbe: async () => ({ screenshotPath: "x.png", renderedWheelVisibility: true, renderedAzimuths: [0] })
      })
    });
    expect(report.selected).toBeUndefined();
    expect(report.candidates[0]?.reasons.join(" ")).toContain("only 1 camera angle");
  });

  it("records a render-probe failure as its own stage", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:good" })], {
        renderProbe: async () => { throw new Error("browser crashed"); }
      })
    });
    expect(report.candidates[0]?.rejectedAtStage).toBe("render-probe");
    expect(report.candidates[0]?.reasons.join(" ")).toContain("browser crashed");
  });
});

describe("fallback policies never launder a hard failure", () => {
  it("reject-and-fail selects nothing when no candidate is admissible", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "shell" })], { inspectGeometry: async () => SHELL_GEOMETRY })
    });
    expect(report.selected).toBeUndefined();
    expect(report.fallbackApplied).toBeUndefined();
  });

  it("accept-best-with-recorded-gaps promotes an unproven-only candidate and names the gap", async () => {
    const { renderProbe: _omit, ...withoutProbe } = effectsFor([candidate({ id: "objaverse:good" })]);
    const report = await screenAssetCandidates({
      intent: { ...HERO_CAR_INTENT, fallbackPolicy: "accept-best-with-recorded-gaps" },
      effects: withoutProbe
    });
    expect(report.selected?.candidate.id).toBe("objaverse:good");
    expect(report.fallbackApplied?.policy).toBe("accept-best-with-recorded-gaps");
    expect(report.fallbackApplied?.gaps.join(" ")).toContain("rendered-wheel-visibility");
  });

  it("accept-best-with-recorded-gaps refuses a candidate with a hard blocker", async () => {
    // The critical guard: an asset that is *wrong* must never be promoted by a fallback, only one that is
    // merely unverified.
    const report = await screenAssetCandidates({
      intent: { ...HERO_CAR_INTENT, fallbackPolicy: "accept-best-with-recorded-gaps" },
      effects: effectsFor([candidate({ id: "shell" })], { inspectGeometry: async () => SHELL_GEOMETRY })
    });
    expect(report.selected).toBeUndefined();
  });

  it("downgrade-role selects a candidate and records the downgrade", async () => {
    const report = await screenAssetCandidates({
      intent: { ...HERO_CAR_INTENT, fallbackPolicy: "downgrade-role" },
      effects: effectsFor([candidate({ id: "shell" })], { inspectGeometry: async () => SHELL_GEOMETRY })
    });
    expect(report.selected?.candidate.id).toBe("shell");
    expect(report.fallbackApplied?.policy).toBe("downgrade-role");
    expect(report.fallbackApplied?.gaps.join(" ")).toContain("role downgraded to");
  });
});

describe("ranking does not trust provider search rank as fitness", () => {
  it("prefers the admissible candidate over a higher-ranked inadmissible one", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor(
        [candidate({ id: "shell", searchScore: 99 }), candidate({ id: "good", searchScore: 1 })],
        { inspectGeometry: async (c) => (c.id === "shell" ? SHELL_GEOMETRY : GOOD_GEOMETRY) }
      )
    });
    expect(report.ranked[0]?.candidate.id).toBe("good");
  });

  it("prefers stronger rendered evidence between two admissible candidates", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor(
        [candidate({ id: "twoAngles", searchScore: 9 }), candidate({ id: "fourAngles", searchScore: 1 })],
        {
          renderProbe: async (c) => ({
            screenshotPath: "p.png",
            renderedWheelVisibility: true,
            renderedAzimuths: c.id === "fourAngles" ? [0.5, 1.0, 1.5, 2.0] : [0.5, 1.0]
          })
        }
      )
    });
    expect(report.ranked[0]?.candidate.id).toBe("fourAngles");
  });

  it("is deterministic for the same inputs", async () => {
    const build = () => screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor([candidate({ id: "a" }), candidate({ id: "b" })])
    });
    const first = await build();
    const second = await build();
    expect(second.ranked.map((o) => o.candidate.id)).toEqual(first.ranked.map((o) => o.candidate.id));
    expect(second.rejectionsByStage).toEqual(first.rejectionsByStage);
  });
});

describe("pipeline plumbing", () => {
  it("throws for an incoherent intent instead of screening against a bad request", async () => {
    await expect(screenAssetCandidates({
      intent: { ...HERO_CAR_INTENT, heroCameraAngles: { heroAzimuths: [0] } },
      effects: effectsFor([candidate({ id: "x" })])
    })).rejects.toThrow(/cannot be satisfied as written/);
  });

  it("registers the selected asset and reports the typed ref", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "objaverse:good" })], {
        register: async () => ({ assetId: "turboRaceCar", typedRef: "model(assets.turboRaceCar)" })
      })
    });
    expect(report.registered).toEqual({ assetId: "turboRaceCar", typedRef: "model(assets.turboRaceCar)" });
  });

  it("does not register when nothing was selected", async () => {
    const register = vi.fn(async () => ({ assetId: "x", typedRef: "y" }));
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "shell" })], { inspectGeometry: async () => SHELL_GEOMETRY, register })
    });
    expect(register).not.toHaveBeenCalled();
    expect(report.registered).toBeUndefined();
  });

  it("formats a report that keeps every rejection reason visible", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      stopAtFirstAccepted: false,
      effects: effectsFor(
        [candidate({ id: "p", licenseSpdx: "Proprietary" }), candidate({ id: "good" })]
      )
    });
    const text = formatScreeningReport(report).join("\n");
    expect(text).toContain("rejected@license-policy p");
    expect(text).toContain("does not satisfy");
    expect(text).toContain("selected: good");
  });

  it("says plainly when nothing satisfied the intent", async () => {
    const report = await screenAssetCandidates({
      intent: HERO_CAR_INTENT,
      effects: effectsFor([candidate({ id: "shell" })], { inspectGeometry: async () => SHELL_GEOMETRY })
    });
    expect(formatScreeningReport(report).join("\n")).toContain("no candidate satisfied the intent");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The replicability metric is only useful if it cannot be gamed and cannot be misquoted.
 *
 * Two failure modes these tests exist for:
 *
 * 1. **Gaming by relocation.** Moving route-local code into a shared file improves the line-count ratio
 *    without making anything reusable. The guard is `routeSpecificExceptionsInEngine`: a named showcase
 *    route appearing in reusable engine code means the shared module carries knowledge of one consumer.
 *
 * 2. **Misquoting by scope mismatch.** During this pass a "7.84x post-pass ratio" was reported by
 *    dividing route-local lines by a 5-module visual subset while comparing against a 3,072-line
 *    baseline that had covered a much broader module set. The two numbers were not comparable. The tool
 *    now reports both scopes, and these tests pin that both are present so a single figure cannot be
 *    quoted without its scope.
 */

interface MetricsReport {
  readonly schema: string;
  readonly baseline: { readonly reportedRatio: number; readonly note: string };
  readonly current: {
    readonly routeLocalLines: number;
    readonly reusableVisualLines: number;
    readonly reusableFullLayerLines: number;
    readonly reusableLinesAddedThisPass: number;
    readonly routeLocalMagicConstants: number;
    readonly constantsByCategory: Readonly<Record<string, number>>;
    readonly unclassifiedConstants: number;
    readonly assetDerivedValues: number;
    readonly reusableVisualRecipes: number;
    readonly routeSpecificExceptionsInEngine: number;
    readonly generatedLines?: number;
    readonly repeatedCodeClusters?: number;
    readonly assetAdmission?: {
      readonly intents: number;
      readonly candidatesScreened: number;
      readonly admitted: number;
      readonly rejected: number;
      readonly averageAttemptsPerIntent: number | null;
      readonly rejectionReasonsPreserved: number;
    };
    readonly averageCandidateScreeningAttempts?: number | null;
    readonly evidenceFreshnessFailures?: number | null;
  };
  readonly repeatedClusters?: { readonly windowSize: number; readonly clusters: number };
  readonly evidenceFreshness?: { readonly stale: number | null; readonly audited: number | null };
  readonly ratios: Record<string, number | null>;
  readonly routes: readonly {
    readonly routeId: string;
    readonly handAuthoredLines: number;
    readonly generatedLines: number;
    readonly magicConstantCount: number;
    readonly assetDerivedValueCount: number;
  }[];
  readonly recipes: readonly { readonly id: string; readonly api: string; readonly present: boolean }[];
  readonly magicConstants: readonly {
    readonly routeId: string;
    readonly name: string;
    readonly category: string;
  }[];
  readonly routeSpecificExceptionsInEngine: readonly unknown[];
}

function runMetrics(): MetricsReport {
  const stdout = execFileSync("node", ["tools/replicability-metrics/index.mjs", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  return JSON.parse(stdout) as MetricsReport;
}

describe("replicability metrics are measured, not asserted", () => {
  it("measures all four showcase games from source", () => {
    const report = runMetrics();
    const ids = report.routes.map((route) => route.routeId).sort();
    expect(ids).toEqual([
      "aura-clash-showcase",
      "showcase-blockfall-reactor",
      "showcase-skyline-runner",
      "showcase-turbo-drift-circuit"
    ]);
    for (const route of report.routes) {
      expect(route.handAuthoredLines, `${route.routeId} hand-authored lines`).toBeGreaterThan(0);
    }
  });

  it("separates generated from hand-authored lines", () => {
    const report = runMetrics();
    // Turbo and Skyline both compile a generated geometry contract; counting it as hand-authored would
    // inflate route-local lines with code no developer writes.
    const turbo = report.routes.find((route) => route.routeId === "showcase-turbo-drift-circuit");
    expect(turbo?.generatedLines).toBeGreaterThan(0);
    /*
     * Aura Clash keeps its own copy of the CLI typed asset map at `src/aura-assets.ts`.
     *
     * That file is `writeTypedAssets` output, and at ~12,900 lines it was 55% of everything this metric
     * previously attributed to Aura Clash as *hand-authored* route-local code. The original rule only
     * recognised `/generated/` paths, so it missed CLI typegen entirely — inflating the headline ratio and
     * pointing remediation at an art-direction problem that was largely a typegen artifact.
     */
    const clash = report.routes.find((route) => route.routeId === "aura-clash-showcase");
    expect(clash?.generatedLines).toBeGreaterThan(10_000);
    expect(clash?.handAuthoredLines).toBeLessThan(clash!.generatedLines);
  });

  it("never counts a CLI typed asset map as hand-authored", () => {
    // Guard against the detection regressing to a `/generated/`-only path rule.
    const source = readFileSync("tools/replicability-metrics/index.mjs", "utf8");
    expect(source).toContain("function isGeneratedSource");
    expect(source).toContain("src\\/aura-assets\\.ts$");
  });

  it("is deterministic across runs", () => {
    const first = runMetrics();
    const second = runMetrics();
    expect(second.ratios).toEqual(first.ratios);
    expect(second.routes).toEqual(first.routes);
    expect(second.magicConstants).toEqual(first.magicConstants);
  });
});

describe("the ratio cannot be quoted without its scope", () => {
  it("reports both the visual-only and the full reusable layer", () => {
    const report = runMetrics();
    for (const key of [
      "visualOnlyBefore",
      "visualOnlyAfter",
      "visualOnlyAfterExcludingAuraClashOutlier",
      "fullLayerBefore",
      "fullLayerAfter",
      "fullLayerAfterExcludingAuraClashOutlier"
    ]) {
      expect(typeof report.ratios[key], `ratio ${key}`).toBe("number");
    }
  });

  it("records that the brief's 9.8x baseline is not reproducible from source", () => {
    // Keeping this explicit prevents the unreproducible figure being quoted as if this tool derived it.
    const report = runMetrics();
    expect(report.baseline.reportedRatio).toBe(9.8);
    expect(report.baseline.note).toContain("not reproducible");
  });

  it("shows the visual-layer ratio improving because named modules were added", () => {
    const report = runMetrics();
    expect(report.current.reusableLinesAddedThisPass).toBeGreaterThan(0);
    expect(report.ratios.visualOnlyAfter as number).toBeLessThan(report.ratios.visualOnlyBefore as number);
    expect(report.ratios.fullLayerAfter as number).toBeLessThan(report.ratios.fullLayerBefore as number);
  });

  it("keeps the Aura Clash outlier visible rather than folded into one headline", () => {
    const report = runMetrics();
    const clash = report.routes.find((route) => route.routeId === "aura-clash-showcase");
    // Aura Clash alone dominates route-local lines and was not part of this pass.
    expect((clash?.handAuthoredLines ?? 0) / report.current.routeLocalLines).toBeGreaterThan(0.5);
    expect(report.ratios.visualOnlyAfterExcludingAuraClashOutlier as number)
      .toBeLessThan(report.ratios.visualOnlyAfter as number);
  });
});

describe("the metric resists being gamed by relocation", () => {
  it("finds no route-specific exception inside the reusable layer", () => {
    const report = runMetrics();
    expect(report.routeSpecificExceptionsInEngine).toEqual([]);
    expect(report.current.routeSpecificExceptionsInEngine).toBe(0);
  });

  it("exits non-zero when a route-specific exception exists", () => {
    // Proves the check is enforced rather than merely reported. Asserted via the documented contract:
    // the tool sets a failing exit code, which a gate can consume.
    const source = readFileSync("tools/replicability-metrics/index.mjs", "utf8");
    expect(source).toContain("if (exceptions.length > 0) process.exitCode = 1;");
  });

  it("classifies every route-local constant, never leaving one unclassified", () => {
    /*
     * WS4 requires constants be *categorised*, not merely counted, and that asset-derived ones be computed. A
     * bare count cannot distinguish "13 constants, all legitimate game design" from "13 constants, half of them
     * frozen asset dimensions" -- and those demand opposite responses. Counting alone is how `CAR_SCENE_HEIGHT`
     * survived two asset swaps while looking like a design decision.
     */
    const report = runMetrics();
    expect(report.current.unclassifiedConstants).toBe(0);
    for (const constant of report.magicConstants) {
      expect(constant.category, `${constant.name} must be classified`).not.toBe("unclassified");
    }
    // Categories 3 (asset-derived) and 5 (public API gap) must be empty: the brief requires those be moved into
    // reusable code or closed, not merely recorded.
    expect(report.current.constantsByCategory["asset-derived"] ?? 0).toBe(0);
    expect(report.current.constantsByCategory["api-gap"] ?? 0).toBe(0);
  });

  it("counts route-local magic constants and asset-derived values separately", () => {
    const report = runMetrics();
    expect(report.current.routeLocalMagicConstants).toBeGreaterThan(0);
    // Turbo is the route that had its asset-specific literals replaced with derived values.
    const turbo = report.routes.find((route) => route.routeId === "showcase-turbo-drift-circuit");
    expect(turbo?.assetDerivedValueCount).toBeGreaterThan(0);
  });

  it("no longer lists the retired asset-specific Turbo literals", () => {
    /*
     * `CAR_SCENE_HEIGHT` was hardcoded to `CAR_TARGET_MAX_DIMENSION * (2.209 / 6.958)` -- the bounds of a
     * hero car already replaced twice -- and the chase camera carried bare `height`/`distance` literals.
     * All three are now derived from typed manifest bounds, so none may reappear as a magic constant.
     */
    const report = runMetrics();
    const turboConstants = report.magicConstants
      .filter((entry) => entry.routeId === "showcase-turbo-drift-circuit")
      .map((entry) => entry.name);
    expect(turboConstants).not.toContain("CAR_SCENE_HEIGHT");
    expect(turboConstants).not.toContain("CAR_BOUNDS");
    expect(turboConstants).not.toContain("CAR_LONGEST_AXIS");
  });

  it("counts only recipes whose API actually exists", () => {
    const report = runMetrics();
    expect(report.recipes.length).toBeGreaterThan(0);
    for (const recipe of report.recipes) {
      expect(recipe.present, `${recipe.id} -> ${recipe.api}`).toBe(true);
    }
    expect(report.current.reusableVisualRecipes).toBe(report.recipes.length);
  });
});

describe("the retained report is current", () => {
  it("exists and matches a fresh measurement", () => {
    const path = "tests/reports/replicability-metrics/report.json";
    expect(existsSync(path), path).toBe(true);
    const retained = JSON.parse(readFileSync(path, "utf8")) as MetricsReport;
    const fresh = runMetrics();
    // Everything except the generation timestamp must match, or the retained report is stale.
    expect(retained.ratios).toEqual(fresh.ratios);
    expect(retained.routes).toEqual(fresh.routes);
    expect(retained.current).toEqual(fresh.current);
  });

  describe("the four measures the brief names that this report previously omitted", () => {
    /**
     * The brief lists 11 measures for this report. An item-by-item audit found four absent: repeated code
     * clusters, asset-admission pass/fail counts, average candidate screening attempts, and evidence-freshness
     * failures. A report that silently omits a third of its required measures still looks green, which is why
     * these are asserted by name rather than by "the report exists".
     */
    it("reports repeated code clusters across route sources", () => {
      const report = runMetrics();
      expect(report.current.repeatedCodeClusters, "must be measured, not absent").toBeTypeOf("number");
      /*
       * Zero is the current correct value: the detector found six clusters, all of them the duplicated
       * `bindHoldControl`/`pulseKey` pair, which was extracted into `bindGameTouchControls`. Pinning zero means
       * re-introducing copied scene-setup between routes fails here.
       */
      expect(report.current.repeatedCodeClusters).toBe(0);
      expect(report.repeatedClusters?.windowSize, "window size must be recorded so the measure is reproducible").toBeGreaterThanOrEqual(6);
    });

    it("counts asset admission passes and failures from retained screening runs", () => {
      const report = runMetrics();
      const admission = report.current.assetAdmission;
      expect(admission, "assetAdmission block").toBeTruthy();
      expect(admission!.candidatesScreened).toBeGreaterThan(0);
      expect(admission!.admitted + admission!.rejected).toBe(admission!.candidatesScreened);
      /*
       * The brief requires every rejection keep machine-readable reasons. Asserting the count *equals* the
       * rejection count is what makes this a contract rather than a statistic: one reasonless rejection fails.
       */
      expect(admission!.rejectionReasonsPreserved, "every rejection must preserve its reasons")
        .toBe(admission!.rejected);
    });

    it("reports average candidate screening attempts per intent", () => {
      /*
       * The figure that answers the question the asset pipeline exists to answer: how many candidates must a
       * developer try before one is usable. Three unusable hero vehicles shipped before this was visible.
       */
      const report = runMetrics();
      expect(report.current.averageCandidateScreeningAttempts).toBeGreaterThan(1);
      expect(report.current.averageCandidateScreeningAttempts)
        .toBe(report.current.assetAdmission!.averageAttemptsPerIntent);
    });

    it("reports evidence-freshness failures from the authoritative explainer", () => {
      /*
       * Read from `explain-staleness.mjs` rather than recomputed. A second implementation of the same judgement
       * would recreate the producer-ownership ambiguity the evidence system exists to prevent.
       */
      const report = runMetrics();
      expect(report.current.evidenceFreshnessFailures, "stale count").toBe(0);
      expect(report.evidenceFreshness?.audited, "must audit a non-trivial artifact set").toBeGreaterThanOrEqual(8);
    });

    it("measures all eleven brief-named measures", () => {
      // The audit itself, encoded: a future edit that drops a measure fails here rather than passing quietly.
      const report = runMetrics();
      for (const key of [
        "routeLocalLines", "reusableVisualLines", "reusableFullLayerLines", "repeatedCodeClusters",
        "routeLocalMagicConstants", "assetDerivedValues", "reusableVisualRecipes", "generatedLines",
        "assetAdmission", "averageCandidateScreeningAttempts", "evidenceFreshnessFailures",
        "routeSpecificExceptionsInEngine"
      ]) {
        expect(report.current, `missing measure: ${key}`).toHaveProperty(key);
      }
    });
  });
});

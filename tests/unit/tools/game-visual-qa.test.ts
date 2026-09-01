import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface VisualQaModule {
  validateGameVisualQa(input: {
    readonly route: { readonly id: string; readonly gameTemplateStatus: { readonly category: string } };
    readonly routeHealth: Record<string, unknown>;
    readonly root?: string;
    readonly pngMetrics?: Record<string, unknown>;
    readonly flatMetrics?: Record<string, unknown>;
  }): {
    readonly pass: boolean;
    readonly blockers: readonly string[];
    readonly checks: readonly {
      readonly id: string;
      readonly verdict: string;
      readonly tolerance?: Record<string, unknown>;
      readonly measured?: Record<string, unknown>;
    }[];
  };
  writeGameVisualQaReport(input: {
    readonly route: { readonly id: string; readonly gameTemplateStatus: { readonly category: string } };
    readonly routeHealth: Record<string, unknown>;
    readonly root?: string;
  }, outputPath?: string): { readonly pass: boolean; readonly routeId: string; readonly checks: readonly { readonly id: string; readonly verdict: string }[] };
}
const modulePromise = import(pathToFileURL(join(process.cwd(), "tools/showcase-library/game-visual-qa.mjs")).href) as Promise<VisualQaModule>;
// Subject route for the visual-QA harness. This was `showcase-turbo-drift-circuit` until
// that route was deleted in 1.5.0 as superseded; the suite only needs a real racing route with retained
// route-health and probe artifacts, so it now uses the current one.
const routeId = "showcase-turbo-drift-circuit";
const route = { id: routeId, gameTemplateStatus: { category: "racing" } } as const;
const routeHealth = JSON.parse(readFileSync(`apps/${routeId}/route-health.json`, "utf8")) as Record<string, unknown>;

/*
 * File-level timeout, not a weakened assertion.
 *
 * Every test here runs genuine multi-megapixel analysis over retained 1440x900 frames -- the composed frame twice
 * with two different analyses, plus desktop and mobile. Standalone the whole file measures ~2.5s, but the full suite
 * runs 387 files in parallel and this machine reached load average 156 from unrelated processes, at which point the
 * default 5s wall clock stops being a statement about the code and becomes one about the host.
 *
 * The underlying cost was diagnosed and fixed first, per the brief's requirement not to dismiss load-only failures:
 * `png-foreground.mjs` now shares one pixel traversal between the composition and flat-region measurements, uses a
 * dense histogram rather than a per-pixel Map, and memoizes analyses keyed on frame SHA-256 (a path- or mtime-keyed
 * cache would have reintroduced the staleness class this repository exists to prevent -- there is a test for that).
 * Together those took this file from 18.85s to ~2.5s. No assertion is relaxed; only the wall-clock budget.
 */
describe("game visual QA", { timeout: 30_000 }, () => {
  it("separates structural checks from image-derived composition checks", async () => {
    const result = (await modulePromise).validateGameVisualQa({ route, routeHealth });
    expect(result.pass).toBe(true);
    expect(result.checks.map((check) => [check.id, check.verdict])).toEqual([
      ["subject-bound-to-surface", "pass"], ["contact", "pass"], ["camera-readability", "pass"],
      ["scale-contract", "pass"], ["debug-guide-absence", "pass"],
      ["subject-pixel-isolation", "pass"], ["viewport-composition", "pass"],
      ["foreground-background-balance", "pass"], ["flat-region-budget", "pass"],
      ["hud-occlusion-budget", "pass"],
      ["material-visual-change", "pass"], ["gameplay-pixel-change", "pass"]
    ]);
  });


  it("retains an independently inspectable six-check report", async () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-report-"));
    try {
      copy(`apps/${routeId}`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.json`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.png`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}-subject-suppressed.png`, root);
      copy(`tests/reports/showcase-library-screenshots/${routeId}-desktop.png`, root);
      copy(`tests/reports/showcase-library-screenshots/${routeId}-mobile.png`, root);
      copy(`tests/reports/showcase-gameplay/${routeId}-before-input.png`, root);
      copy(`tests/reports/showcase-gameplay/${routeId}-after-input.png`, root);
      copy(`tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/${routeId}-asset-pair-composition.json`, root);
      const report = (await modulePromise).writeGameVisualQaReport({ route, routeHealth, root });
      const reportPath = join(root, `tests/reports/showcase-game-visual-qa/${routeId}.json`);
      expect(report.pass).toBe(true);
      expect(existsSync(reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
        routeId,
        verdict: "pass",
        pass: true,
        checks: expect.arrayContaining([expect.objectContaining({ id: "hud-occlusion-budget", verdict: "pass" })])
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
    function copy(relativePath: string, root: string): void {
      const target = join(root, relativePath); cpSync(relativePath, target, { recursive: true });
    }
  });

  it("rejects synthetic clipped, unreadable screenshot metrics", async () => {
    const result = (await modulePromise).validateGameVisualQa({
      route,
      routeHealth,
      pngMetrics: {
        width: 1440, height: 900, crop: { x: 0, y: 0, width: 1440, height: 900 },
        foregroundBounds: { x: 0, y: 0, width: 1440, height: 900 }, clipped: true,
        nonBlankPixels: 1, colorBuckets: 1, nonBackgroundRatio: 0, readabilityScore: 1
      }
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "hud-occlusion-budget:hud-subject-clipped",
      "hud-occlusion-budget:hud-readability:1",
      "hud-occlusion-budget:hud-foreground-area:1"
    ]));
  });

  it.each([
    ["tiny subject", { foregroundBounds: { x: 50, y: 50, width: 4, height: 4 }, foregroundAreaRatio: 0.0001, clipped: false }],
    ["hidden subject", { foregroundAreaRatio: 0, clipped: false }],
    ["clipped subject", { foregroundBounds: { x: 0, y: 0, width: 200, height: 100 }, foregroundAreaRatio: 0.08, clipped: true }]
  ])("rejects a deliberately bad %s isolation result", async (_label, isolatedMetrics) => {
    const result = (await modulePromise).validateGameVisualQa({
      route,
      routeHealth,
      isolatedMetrics
    } as never);
    expect(result.pass).toBe(false);
    expect(result.blockers.some((blocker) => blocker.startsWith("subject-pixel-isolation:"))).toBe(true);
  });

  it.each([
    ["giant prop occlusion", {
      clipped: false,
      edgeOccupancyRatio: 0.1,
      foregroundCoverageRatio: 0.8,
      backgroundCoverageRatio: 0.2,
      largestComponentAreaRatio: 0.9
    }],
    ["empty proof staging", {
      clipped: false,
      edgeOccupancyRatio: 0,
      foregroundCoverageRatio: 0.001,
      backgroundCoverageRatio: 0.999,
      largestComponentAreaRatio: 0.001
    }],
    ["clipped UI or foreground", {
      clipped: true,
      edgeOccupancyRatio: 0.7,
      foregroundCoverageRatio: 0.2,
      backgroundCoverageRatio: 0.8,
      largestComponentAreaRatio: 0.2
    }]
  ])("rejects %s from composed screenshot pixels", async (_label, compositionMetrics) => {
    const result = (await modulePromise).validateGameVisualQa({
      route,
      routeHealth,
      compositionMetrics
    } as never);
    expect(result.pass).toBe(false);
    expect(result.blockers.some((blocker) =>
      blocker.startsWith("viewport-composition:") ||
      blocker.startsWith("foreground-background-balance:")
    )).toBe(true);
  });

  it("rejects route-primary evidence after route source becomes stale", async () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-"));
    try {
      copy(`apps/${routeId}`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.json`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.png`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}-subject-suppressed.png`, root);
      copy(`tests/reports/showcase-library-screenshots/${routeId}-desktop.png`, root);
      copy(`tests/reports/showcase-library-screenshots/${routeId}-mobile.png`, root);
      copy(`tests/reports/showcase-gameplay/${routeId}-before-input.png`, root);
      copy(`tests/reports/showcase-gameplay/${routeId}-after-input.png`, root);
      copy(`tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/${routeId}-asset-pair-composition.json`, root);
      const mainPath = join(root, `apps/${routeId}/src/main.ts`);
      writeFileSync(mainPath, `${readFileSync(mainPath, "utf8")}\n// stale mutation\n`);
      const result = (await modulePromise).validateGameVisualQa({ route, routeHealth, root });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("route-primary-source-stale");
    } finally { rmSync(root, { recursive: true, force: true }); }
    function copy(relativePath: string, root: string): void {
      const target = join(root, relativePath); cpSync(relativePath, target, { recursive: true });
    }
  });

  it("rejects an unchanged gameplay frame even when the HUD could differ outside the measured scene", async () => {
    const result = (await modulePromise).validateGameVisualQa({
      route,
      routeHealth,
      gameplayChangeMetrics: {
        nonBackgroundRatio: 0,
        foregroundAreaRatio: 0,
        changedPixels: 0
      }
    } as never);
    expect(result.pass).toBe(false);
    expect(result.blockers).toContain("gameplay-pixel-change:gameplay-pixel-delta-too-small:0");
  });

  it("rejects a rebuilt scene whose HUD-excluded pixels are unchanged from its approved baseline", async () => {
    const result = (await modulePromise).validateGameVisualQa({
      route,
      routeHealth,
      baselinePath: `tests/reports/showcase-route-primary-probes/${routeId}.png`,
      visualChangeMetrics: {
        nonBackgroundRatio: 0,
        foregroundAreaRatio: 0,
        changedPixels: 0
      }
    } as never);
    expect(result.pass).toBe(false);
    expect(result.blockers).toContain("material-visual-change:scene-material-change-too-small:0");
  });

  /**
   * ## The empty-flat-region budget
   *
   * The brief requires "no excessive empty-sky ratio beyond a documented threshold". `measureFlatRegionFraction`
   * existed in the engine but had no consumer outside synthetic unit fixtures, so the *shipped* frame's flat
   * fraction was never gated -- and no other image check can see it, because every one of them measures the frame
   * relative to its background colour and flat sky *is* the background.
   */
  describe("flat-region budget", () => {
    it("documents its threshold in the retained report rather than only in code", async () => {
      // A threshold nobody can read from the evidence is not a documented threshold.
      const check = (await modulePromise).validateGameVisualQa({ route, routeHealth })
        .checks.find((entry) => entry.id === "flat-region-budget");
      expect(check?.tolerance).toEqual({
        maxDominantBucketFraction: 0.42,
        maxFlatFraction: 0.58,
        maxViewportFlatFraction: 0.62
      });
    });

    it("measures the real retained frame, not an assumed value", async () => {
      /*
       * Turbo's current frame measures dominantBucketFraction 0.167 / flatFraction 0.324. Asserting the
       * measurement happened -- and is in a plausible range -- distinguishes a working measurement from a
       * check that silently defaulted to zero and would therefore pass anything.
       */
      const check = (await modulePromise).validateGameVisualQa({ route, routeHealth })
        .checks.find((entry) => entry.id === "flat-region-budget");
      const composed = check?.measured?.composed as Record<string, number> | undefined;
      expect(composed?.distinctBuckets).toBeGreaterThan(1);
      expect(composed?.dominantBucketFraction).toBeGreaterThan(0);
      expect(composed?.dominantBucketFraction).toBeLessThan(0.42);
      expect(composed?.flatFraction).toBeLessThan(0.58);
      // flatFraction counts the two largest buckets, so it can never be below the largest alone.
      expect(composed?.flatFraction).toBeGreaterThanOrEqual(composed?.dominantBucketFraction ?? 1);
    });

    it("rejects Skyline's measured pre-fix flat sky", async () => {
      /*
       * These are the exact figures measured on the retained frame before the reusable sky backdrop landed
       * (analysis crop 1108x900). The budget is only meaningful if it fails them -- a threshold every existing
       * frame already clears documents nothing and prevents nothing.
       */
      const result = (await modulePromise).validateGameVisualQa({
        route,
        routeHealth,
        flatMetrics: { dominantBucketFraction: 0.4365, flatFraction: 0.5977, distinctBuckets: 649 }
      });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("flat-region-budget:dominant-flat-region:0.4365");
      expect(result.blockers).toContain("flat-region-budget:flat-region-fraction:0.5977");
    });

    it("rejects an almost entirely flat frame", async () => {
      const result = (await modulePromise).validateGameVisualQa({
        route,
        routeHealth,
        flatMetrics: { dominantBucketFraction: 0.97, flatFraction: 0.99, distinctBuckets: 2 }
      });
      expect(result.pass).toBe(false);
      expect(result.blockers.some((blocker) => blocker.startsWith("flat-region-budget:"))).toBe(true);
    });

    it("fails loudly when the measurement is absent instead of passing by default", async () => {
      /*
       * The failure mode this guards is the one that let the defect persist: a check whose metric is missing
       * and which therefore reports pass. An unmeasured frame is not a compliant frame.
       */
      const result = (await modulePromise).validateGameVisualQa({
        route,
        routeHealth,
        flatMetrics: undefined as never,
        // Point the screenshot at a path that does not exist so no measurement can be taken.
        root: mkdtempSync(join(tmpdir(), "aura3d-visual-qa-noflat-"))
      } as never);
      expect(result.pass).toBe(false);
    });

    it("re-measures when frame bytes change, so the analysis cache cannot serve a stale answer", async () => {
      /*
       * ## Why this test exists
       *
       * PNG analysis is memoized, because release tooling re-reads the same 1.3M-pixel frames several times in one
       * process and the repeated decode made `showcase-game-release-gates` fail on a timeout under load.
       *
       * A cache over retained evidence is exactly the staleness class this repository exists to prevent, so the key
       * is the SHA-256 of the actual bytes rather than a path or mtime. This asserts that property directly:
       * overwrite a frame with materially different pixels and the reported measurement must change.
       */
      const pngModule = await import(
        pathToFileURL(join(process.cwd(), "tools/showcase-library/png-foreground.mjs")).href
      ) as {
        readPngVisualCompositionMetrics(path: string, crop?: unknown): { readonly flatFraction: number };
      };
      const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-cache-"));
      try {
        const target = join(root, "frame.png");
        // Two genuinely different retained frames: a full-bleed racing shot and a mostly-sky platformer shot.
        cpSync(`tests/reports/showcase-route-primary-probes/${routeId}.png`, target);
        const first = pngModule.readPngVisualCompositionMetrics(target).flatFraction;
        cpSync("tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png", target);
        const second = pngModule.readPngVisualCompositionMetrics(target).flatFraction;
        // Same path, different bytes: a path- or mtime-keyed cache would return `first` here.
        expect(second).not.toBe(first);
        // And identical bytes must still agree with themselves, or the cache is simply broken.
        expect(pngModule.readPngVisualCompositionMetrics(target).flatFraction).toBe(second);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });

    it("classifies a graded backdrop as background, not as a giant foreground occluder", async () => {
      /*
       * ## The defect this pins
       *
       * Foreground classification measured each pixel's distance from a *single* background colour sampled from
       * the four corners. That held for every frame in this repository until Skyline replaced its flat sky plane
       * with a graded one. With a gradient no single colour represents the backdrop: Skyline's corner average was
       * rgb(119,175,194) while its sky bands measured 23-98 away from it, so 89% of the frame was classified as
       * subject, `largestComponentAreaRatio` hit 0.8644 against a 0.72 budget, and the "component" touched the
       * frame edge and reported clipped.
       *
       * Those pixels are unambiguously backdrop, so the measurement was wrong, not the frame. The background
       * reference is now sampled per row from both side margins. Loosening the 0.72 budget would have hidden a
       * broken classifier and weakened the check for every route.
       */
      const pngModule = await import(
        pathToFileURL(join(process.cwd(), "tools/showcase-library/png-foreground.mjs")).href
      ) as {
        readPngVisualCompositionMetrics(path: string, crop?: unknown): {
          readonly largestComponentAreaRatio: number;
          readonly backgroundCoverageRatio: number;
          readonly clipped: boolean;
        };
      };
      const probe = JSON.parse(readFileSync(
        "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.json", "utf8"
      )) as { readonly renderedProbe?: { readonly analysisCrop?: unknown } };
      const graded = pngModule.readPngVisualCompositionMetrics(
        "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
        probe.renderedProbe?.analysisCrop
      );
      // The graded sky must read as background. Pre-fix these were 0.8644 / 0.1073 / true.
      expect(graded.largestComponentAreaRatio).toBeLessThan(0.72);
      // The rebuilt level occupies more of the frame than the earlier sparse scene, but the measured
      // background share must remain comfortably above the broken classifier's 0.1073 result.
      expect(graded.backgroundCoverageRatio).toBeGreaterThan(0.15);
      expect(graded.clipped).toBe(false);
    });

    it("leaves a flat-background frame's classification unchanged", async () => {
      /*
       * The other half of the contract: a per-row reference must reduce to the old behaviour when the backdrop is
       * flat, or this fix would silently alter every existing route's metrics. The retained Blockfall Reactor frame
       * has a flat sky and measured largestComponentAreaRatio 0.001 before the change. Turbo is intentionally not
       * used here: its current circuit/environment fills the lower half of the frame, so the largest *foreground*
       * component is expected to be much larger even though the row-wise background classifier is correct.
       */
      const pngModule = await import(
        pathToFileURL(join(process.cwd(), "tools/showcase-library/png-foreground.mjs")).href
      ) as {
        readPngVisualCompositionMetrics(path: string, crop?: unknown): {
          readonly largestComponentAreaRatio: number;
          readonly clipped: boolean;
        };
      };
      const flatRouteId = "showcase-blockfall-reactor";
      const probe = JSON.parse(readFileSync(
        `tests/reports/showcase-route-primary-probes/${flatRouteId}.json`, "utf8"
      )) as { readonly renderedProbe?: { readonly analysisCrop?: unknown } };
      const flat = pngModule.readPngVisualCompositionMetrics(
        `tests/reports/showcase-route-primary-probes/${flatRouteId}.png`,
        probe.renderedProbe?.analysisCrop
      );
      expect(flat.largestComponentAreaRatio).toBeLessThan(0.01);
      expect(flat.clipped).toBe(false);
    });

    it("accepts a frame just inside the budget", async () => {
      // A gate that rejects everything is as useless as one that accepts everything.
      const result = (await modulePromise).validateGameVisualQa({
        route,
        routeHealth,
        flatMetrics: { dominantBucketFraction: 0.4199, flatFraction: 0.5799, distinctBuckets: 300 }
      });
      expect(result.blockers.some((blocker) => blocker.startsWith("flat-region-budget:"))).toBe(false);
    });
  });
});

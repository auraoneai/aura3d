import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for the composition-gate non-determinism found while verifying defect 102.
 *
 * ## The defect
 *
 * Skyline previously expressed hero locomotion as a 28% peak-to-peak scale
 * cycle while the composition probe declared a static `targetSize: 0.52`.
 * The `scale-contract` check compared different poses as a result.
 *
 * Consequence: across four consecutive probe runs the measured hero height was 119, 122, 141 and 154px, and
 * `scaleDelta` straddled its `maxPlatformerScaleDelta: 0.18` threshold. One run failed composition at 0.1892
 * with nothing about the route changed. The gate was measuring animation phase, not scale correctness.
 *
 * ## Why it is fixed in the contract rather than the threshold
 *
 * Widening the threshold would have hidden a real contract mismatch and weakened the check for every route,
 * including ones whose subject does not animate. Instead the probe contract gained an optional
 * `settleSubjectPose`, and this route implements it by pausing and restoring unit scale -- bob = 0, which is
 * exactly the pose `targetSize` declares.
 *
 * These assertions read the retained artifact rather than only the source, because the property that matters
 * is what the *producer measured*, not what the route appears to declare.
 */
describe("Skyline's composition subject is measured in a deterministic pose", () => {
  const PROBE_PATH = "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.json";
  const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");

  interface Probe {
    readonly pass?: boolean;
    readonly compositionProbe?: {
      readonly subjectBounds?: { readonly height?: number };
      readonly projectedSubjectHeight?: number;
      readonly subjectTargetSize?: number;
    };
  }

  function probe(): Probe {
    return JSON.parse(readFileSync(PROBE_PATH, "utf8")) as Probe;
  }

  it("implements the settle hook the probe calls before capturing", () => {
    /*
     * The hook is optional in the contract, so a route that animates its subject and *omits* it silently
     * reintroduces the flakiness. Skyline animates its subject, so for this route it is required.
     */
    expect(source).toContain("settleSubjectPose:");
    // The old independent 14% scale cycle is intentionally gone. The hook must
    // still pin both unit scale and a deterministic imported-clip capture frame.
    expect(source).not.toMatch(/Math\.sin\(cycle\) \* 0\.14/);
    expect(source).toContain("compositionPoseSettled = true");
    expect(source).toContain("captureTime: 0.4");
    expect(source).toMatch(/if \(compositionPoseSettled\)[\s\S]*player\.play\(HERO_LOCOMOTION_CLIP_MAP\.idle, \{ loop: false, captureTime: 0\.4 \}\)/);
    expect(source).toContain("player.setVisible(true)");
    expect(source).toContain("compositionSubjectSuppressed");
    expect(source).toContain("? 0.0001");
  });

  it("keeps the retained scaleDelta well inside the composition threshold", () => {
    /*
     * `maxPlatformerScaleDelta` is 0.18. Before the fix the retained value reached 0.1892 (a fail) and varied
     * run to run; settled it measures 0.035-0.089. Asserting a margin rather than the bare threshold is what
     * makes this a determinism check: a value that merely squeaks under 0.18 is the flaky state returning.
     */
    const measured = probe().compositionProbe;
    const height = measured?.subjectBounds?.height ?? 0;
    const projected = measured?.projectedSubjectHeight ?? 0;
    expect(height, "measured subject height").toBeGreaterThan(0);
    expect(projected, "projected subject height").toBeGreaterThan(0);
    const scaleDelta = Math.abs(projected - height) / projected;
    expect(scaleDelta, `scaleDelta ${scaleDelta} must keep margin below the 0.18 threshold`).toBeLessThan(0.13);
  });

  it("measures a height consistent with the unbobbed target, not a bob extreme", () => {
    /*
     * The load-bearing property. At bob = +0.14 the hero measures ~14% *taller* than its declared size; the
     * old 154px capture against a 129.5px projection is exactly that. A settled capture must sit near or below
     * the projection, never above it by the bob amplitude.
     */
    const measured = probe().compositionProbe;
    const height = measured?.subjectBounds?.height ?? 0;
    const projected = measured?.projectedSubjectHeight ?? 1;
    /*
     * Bound 1.15 (was 1.1 before the 2.5-distance camera): the settled capture
     * is bit-identical across probe runs, so this is systematic projection
     * geometry, not phase — the closer camera magnifies the live-vs-declared
     * depth delta and the depth-offset accessories (8.5% at 3.55 becomes ~12%
     * at 2.5). The margin philosophy matches the sibling scaleDelta test
     * (0.13). Still catches the historical defect class (154 vs 129.5 = 1.19)
     * and any runBob-phase capture (>= ~1.17: 12% systematic + 5% stride bob).
     */
    expect(height, "a capture taller than projection + settled-geometry margin means the pose was not settled")
      .toBeLessThan(projected * 1.15);
  });

  it("still passes its route gate with the pose settled", () => {
    // Settling must not have cost the route its probe: the hero has to remain present and readable.
    expect(probe().pass).toBe(true);
  });
});

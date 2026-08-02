import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("showcase visual-review source contract", () => {
  it("keeps public release approval hash-bound and downward-only", () => {
    const gate = readFileSync("tools/showcase-library/showcase-manual-review-gate.mjs", "utf8");
    const build = readFileSync("tools/showcase-library/build-and-check.mjs", "utf8");
    expect(gate).toContain("aura3d-showcase-visual-review/2.0");
    expect(gate).toContain("route-visual-review-source-hash");
    expect(gate).toContain("route-visual-review-route-health-hash");
    expect(gate).toContain("route-visual-review-screenshot-hash");
    expect(gate).toContain("route-visual-review-stale-source");
    expect(gate).toContain("visual-review-human-reviewer-required");
    expect(build).toContain("loadAndValidateShowcaseVisualReview");
    expect(build).not.toContain(
      'review.failures.filter((failure) => !failure.startsWith("visual-review-overall-verdict:"))'
    );
  });
});

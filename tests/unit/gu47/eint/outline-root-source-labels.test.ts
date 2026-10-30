import { describe, expect, it } from "vitest";
import { outlineTargetLabelMatches } from "../../../../packages/rendering/src/renderer/OutlineTargets";

// GU47 pass 4 (g20 NR-09): TypedGLBActors drawn as a root render source label items `<actor id>:<node>:<geometry>`.
describe("outline targets match root-source actor labels", () => {
  const set = new Set(["ninja-hero", "oni"]);

  it("matches `<target>:` and `<target>-<n>:` actor ids", () => {
    expect(outlineTargetLabelMatches("ninja-hero-0:Body:geometry-2", set)).toBe(true);
    expect(outlineTargetLabelMatches("ninja-hero:Body", set)).toBe(true);
    expect(outlineTargetLabelMatches("oni-12:Head", set)).toBe(true);
  });

  it("does not match a longer id or a non-numeric suffix", () => {
    expect(outlineTargetLabelMatches("ninja-hero-sidekick-0:Body", set)).toBe(false);
    expect(outlineTargetLabelMatches("ninja-heroine-0:Body", set)).toBe(false);
    expect(outlineTargetLabelMatches("oni-x:Head", set)).toBe(false);
    expect(outlineTargetLabelMatches("ninja-hero-0", set)).toBe(false);
  });

  it("keeps the scene-item rules (a primitive whose resource names a target is not a match)", () => {
    expect(outlineTargetLabelMatches("primitive-9:oni:crate", set)).toBe(false);
    expect(outlineTargetLabelMatches("actor-0:mesh-1:oni:Head:geometry-1", set)).toBe(true);
  });
});

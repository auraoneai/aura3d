import { describe, expect, it } from "vitest";
import { heroCharacter, requiredLocomotionActions } from "../../../packages/create-aura3d/templates/animation-studio/src/character";
import { createAnimationProfile, validateAnimationStudioCharacter } from "../../../packages/create-aura3d/templates/animation-studio/src/profile";

describe("animation-studio template profile pipeline", () => {
  it("hero character is ready (all required locomotion clips mapped, typed asset key)", () => {
    const readiness = validateAnimationStudioCharacter(heroCharacter);
    expect(readiness.ok).toBe(true);
    expect(readiness.missingActions).toEqual([]);
    expect(readiness.requiredActions).toEqual(requiredLocomotionActions);
  });

  it("builds an exportable animation-profile with state graph, blend tree, and IK chains", () => {
    const profile = createAnimationProfile(heroCharacter);
    expect(profile.schema).toBe("aura-animation-profile/v1");
    expect(profile.stateGraph.states).toEqual(["idle", "walk", "run"]);
    expect(profile.blendTree.children.map((c) => c.threshold)).toEqual([0, heroCharacter.walkSpeed, heroCharacter.runSpeed]);
    expect(profile.ikChains.length).toBeGreaterThan(0);
    expect(profile.rootMotion.suppressed).toBe(true);
  });

  it("fails readiness when a required clip is unmapped", () => {
    const broken = { ...heroCharacter, clipMap: { ...heroCharacter.clipMap, run: "" } };
    const readiness = validateAnimationStudioCharacter(broken);
    expect(readiness.ok).toBe(false);
    expect(readiness.missingActions).toContain("run");
  });

  it("fails readiness when runSpeed is not greater than walkSpeed", () => {
    const broken = { ...heroCharacter, walkSpeed: 4, runSpeed: 4 };
    const readiness = validateAnimationStudioCharacter(broken);
    expect(readiness.ok).toBe(false);
    expect(readiness.errors.join(" ")).toMatch(/runSpeed/);
  });
});

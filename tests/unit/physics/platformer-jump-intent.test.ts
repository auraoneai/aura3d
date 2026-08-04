import { describe, expect, it } from "vitest";
import {
  platformerFeelProfile,
  solvePlatformerMotion
} from "../../../packages/engine/src/agent-api/PlatformerMotion";

/** Platforms at nearly the same height — the shape that broke the old solver. */
function nearLevelCourse() {
  return [
    { x: 0, y: 0, width: 2 },
    { x: 2.4, y: 0.03, width: 2 },
    { x: 4.8, y: 0.05, width: 2 },
    { x: 7.2, y: 0.02, width: 2 }
  ];
}

function steppedCourse() {
  return [
    { x: 0, y: 0, width: 2 },
    { x: 2.5, y: 0.8, width: 2 },
    { x: 5, y: 1.6, width: 2 }
  ];
}

describe("apex comes from intent, not from whatever the level happens to contain", () => {
  it("gives a near-level course a usable jump instead of collapsing to minApex", () => {
    /*
     * This is the reported Skyline defect, as a test.
     *
     * The old rule was apex = max(minApex, geometry.maxRise * apexHeadroom). maxRise is
     * the step-up between consecutive platforms, so on this course it is 0.03 and
     * 0.03 * 1.6 = 0.048 — far below minApex, so every level like this got the floor
     * value and the character barely left the ground.
     */
    const level = nearLevelCourse();
    const declared = solvePlatformerMotion(level, { jumpHeight: 1.4 });
    expect(declared.apex).toBeCloseTo(1.4, 3);

    // And it is genuinely larger than what geometry alone would have produced.
    const geometryOnly = solvePlatformerMotion(level, {});
    expect(declared.apex).toBeGreaterThan(geometryOnly.apex * 2);
  });

  it("scales a feel preset by character height, so the same feel works at any scale", () => {
    const level = nearLevelCourse();
    const small = solvePlatformerMotion(level, { feel: "responsive", characterHeight: 0.5 });
    const large = solvePlatformerMotion(level, { feel: "responsive", characterHeight: 2 });
    // Four times the character, four times the apex: the jump reads the same relative
    // to the character, which is what "the same feel" means.
    expect(large.apex / small.apex).toBeCloseTo(4, 2);
  });

  it("distinguishes the three feels by rise time and fall asymmetry", () => {
    const level = nearLevelCourse();
    const snappy = solvePlatformerMotion(level, { feel: "snappy", characterHeight: 0.5 });
    const floaty = solvePlatformerMotion(level, { feel: "floaty", characterHeight: 0.5 });

    // Snappy rises faster and falls harder relative to its rise.
    expect(snappy.airtime).toBeLessThan(floaty.airtime);
    expect(snappy.fallGravityMultiplier).toBeGreaterThan(floaty.fallGravityMultiplier);
    expect(platformerFeelProfile("snappy").riseSeconds).toBeLessThan(platformerFeelProfile("floaty").riseSeconds);
  });

  it("rejects an unknown feel by name", () => {
    // @ts-expect-error deliberately invalid feel
    expect(() => platformerFeelProfile("bouncy")).toThrow(/Unknown platformer feel/);
  });
});

describe("validation against the level, loudly", () => {
  it("throws with the offending geometry named when the declared jump cannot clear a step", () => {
    /*
     * Silent degradation is how the barely-there jump shipped: the solver quietly produced
     * a number that satisfied its own constraint, and no gate compared it to anything a
     * player would notice. A level the character cannot traverse is a level-design bug, and
     * only the developer can decide whether to lower the platform or raise the jump.
     */
    expect(() => solvePlatformerMotion(steppedCourse(), { jumpHeight: 0.2 }))
      .toThrow(/cannot clear this level/);
    // The message must name the numbers, not just fail.
    expect(() => solvePlatformerMotion(steppedCourse(), { jumpHeight: 0.2 }))
      .toThrow(/tallest step is 0\.8/);
  });

  it("accepts a jump that clears the tallest step with margin", () => {
    const solution = solvePlatformerMotion(steppedCourse(), { jumpHeight: 1.2 });
    expect(solution.apex).toBeCloseTo(1.2, 3);
    expect(solution.apex).toBeGreaterThan(solution.geometry.maxRise);
  });

  it("raises the apex to a clearable value when strict is off, rather than shipping a broken level", () => {
    const solution = solvePlatformerMotion(steppedCourse(), { jumpHeight: 0.2, strict: false });
    expect(solution.apex).toBeGreaterThanOrEqual(solution.geometry.maxRise);
  });
});

describe("mechanics that make a jump feel like a jump", () => {
  const solution = solvePlatformerMotion(nearLevelCourse(), { feel: "responsive", characterHeight: 0.5 });

  it("falls faster than it rises", () => {
    expect(solution.fallGravityMultiplier).toBeGreaterThan(1);
  });

  it("reduces gravity near the apex to produce hang time", () => {
    expect(solution.apexGravityMultiplier).toBeGreaterThan(0);
    expect(solution.apexGravityMultiplier).toBeLessThan(1);
    expect(solution.apexHangThreshold).toBeGreaterThan(0);
  });

  it("supports a short hop meaningfully lower than a full jump", () => {
    expect(solution.shortHopApex).toBeGreaterThan(0);
    expect(solution.shortHopApex).toBeLessThan(solution.apex);
    // A short hop that is 95% of a full jump gives the player no real control.
    expect(solution.shortHopApex).toBeLessThan(solution.apex * 0.6);
    expect(solution.releaseVelocityScale).toBeGreaterThan(0);
    expect(solution.releaseVelocityScale).toBeLessThan(1);
  });

  it("keeps coyote time and jump buffering proportional to airtime", () => {
    const snappy = solvePlatformerMotion(nearLevelCourse(), { feel: "snappy", characterHeight: 0.5 });
    const floaty = solvePlatformerMotion(nearLevelCourse(), { feel: "floaty", characterHeight: 0.5 });
    // A fixed 110ms window is a large fraction of a snappy jump and a small one of a
    // floaty jump, so the grace windows scale with the arc.
    expect(snappy.coyoteMs).toBeLessThan(floaty.coyoteMs);
    expect(snappy.jumpBufferMs).toBeLessThan(floaty.jumpBufferMs);
  });

  it("keeps projectile maths self-consistent", () => {
    // apex = v^2 / 2g must hold for the emitted numbers, or the reported apex is fiction.
    const g = Math.abs(solution.gravity);
    const derivedApex = (solution.jumpVelocity * solution.jumpVelocity) / (2 * g);
    expect(derivedApex).toBeCloseTo(solution.apex, 2);
  });
});

describe("backwards compatibility", () => {
  it("still derives from geometry when no intent is expressed", () => {
    const stepped = solvePlatformerMotion(steppedCourse(), {});
    // maxRise 0.8 * default headroom 1.6 = 1.28.
    expect(stepped.apex).toBeCloseTo(1.28, 2);
  });
});

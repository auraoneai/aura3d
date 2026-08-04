import { describe, expect, it } from "vitest";
import { solvePlatformerMotion, validatePlatformerMotion } from "@aura3d/engine";
import { gameGeometryContract } from "../../../apps/showcase-skyline-runner/src/generated/game-geometry";
import { SKYLINE_CHARACTER_HEIGHT, skylineMotion } from "../../../apps/showcase-skyline-runner/src/level";

/**
 * WS-4.2 / WS-4.4: the character motion test, against the **real committed level**.
 *
 * The reported defect was "the jumping still sucks and barely jumps at all". The cause was
 * the solver's objective function, not the route's numbers: apex came from
 * `max(minApex, geometry.maxRise * apexHeadroom)`, where `maxRise` is the largest step-up
 * between *consecutive* platforms. Skyline's platforms are near-level, so `maxRise` collapsed
 * to 0.36 against a 0.52-unit character, and the apex fell out at 0.684 — a jump that rises
 * barely one and a third times the character's own height, which does not read as a jump.
 *
 * The solver now takes apex from declared intent and *validates* it against geometry, so a
 * level with tiny steps still produces a usable jump, and an unclearable level fails loudly
 * instead of silently shrinking.
 */
const platforms = gameGeometryContract.level.platforms ?? [];

describe("skyline motion comes from intent, not from the tallest step", () => {
  it("the level really does have steps too small to size a jump from", () => {
    // If this stops being true the defect's premise has changed and the numbers below should
    // be re-derived rather than adjusted.
    expect(skylineMotion.geometry.maxRise).toBeLessThan(SKYLINE_CHARACTER_HEIGHT);
  });

  it("the apex is a multiple of the character's height, not of a 0.36 step", () => {
    const ratio = skylineMotion.apex / SKYLINE_CHARACTER_HEIGHT;
    // A jump should clear noticeably more than the character is tall to read as a jump.
    expect(ratio).toBeGreaterThanOrEqual(1.8);
    expect(skylineMotion.apex).toBeGreaterThan(0.9);
  });

  it("beats the geometry-derived apex it replaced, measurably", () => {
    // The exact previous configuration, kept as the comparison rather than a remembered number.
    const previous = solvePlatformerMotion(platforms, { riseSeconds: 0.26, apexHeadroom: 1.9 });
    expect(previous.apex).toBeLessThan(0.7);
    expect(skylineMotion.apex).toBeGreaterThan(previous.apex * 1.4);
  });

  it("every motion invariant passes against the real level", () => {
    const report = validatePlatformerMotion(platforms, skylineMotion, {
      characterHeight: SKYLINE_CHARACTER_HEIGHT
    });
    const failed = report.checks.filter((check) => !check.passes).map((check) => `${check.id}: ${check.detail}`);
    expect(failed).toEqual([]);
    expect(report.passes).toBe(true);
  });

  it("still clears the tallest step and the widest gap it must", () => {
    // Intent leading must not mean geometry ignored.
    expect(skylineMotion.apex).toBeGreaterThan(skylineMotion.geometry.maxRise);
    expect(skylineMotion.jumpReach).toBeGreaterThan(skylineMotion.geometry.maxGap);
  });

  it("has the mechanics that make a jump feel like one", () => {
    // WS-3.7. A jump with no coyote window and a symmetric arc reads as unresponsive even at
    // the right height.
    expect(skylineMotion.coyoteMs).toBeGreaterThan(0);
    expect(skylineMotion.jumpBufferMs).toBeGreaterThan(0);
    expect(skylineMotion.fallGravityMultiplier).toBeGreaterThan(1);
  });

  it("fails loudly when declared intent cannot clear the level", () => {
    // The behaviour that replaced silent shrinking: name the geometry that cannot be cleared.
    expect(() =>
      solvePlatformerMotion(
        [
          { x: 0, y: 0, width: 1, height: 0.1 },
          { x: 2, y: 9, width: 1, height: 0.1 }
        ] as never,
        { jumpHeight: 0.2 }
      )
    ).toThrow();
  });
});

describe("WS-4.2 rule 1: skyline holds no motion constants", () => {
  it("the route and level declare intent only, never gravity or jump velocity", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "apps/showcase-skyline-runner/src/main.ts",
      "apps/showcase-skyline-runner/src/level.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      // Reading a solved value back out for evidence is not tuning; assigning one is. The
      // ban is on the route *choosing* these numbers.
      const assignments = [...code.matchAll(/\b(gravity|jumpVelocity)\s*:\s*([^,\n}]+)/g)];
      for (const [, key, value] of assignments) {
        expect(
          value!.trim().startsWith("solvedMotion.") || value!.trim().startsWith("skylineMotion."),
          `${file} assigns ${key} to a literal (${value!.trim()}); it must come from the solver`
        ).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  measurePlatformerGeometry,
  solvePlatformerMotion,
  validatePlatformerMotion,
  type PlatformerPlatformLike
} from "../../../packages/engine/src/agent-api/PlatformerMotion";

/**
 * Regression cases for the reported Skyline defects: an unnatural, floaty jump,
 * unreliable landings, a world that reads as disconnected strips, and a session that
 * ends arbitrarily.
 *
 * Three of those follow from one number. Skyline ships `jumpVelocity: 7.4` and inherits
 * `gravity: -22`, giving an apex of 1.245 units and 0.673s of airtime, against
 * platforms that step up by at most 0.36 units across gaps of at most 0.30. Every jump
 * rises 3.5x higher than the tallest step it must clear.
 *
 * Nothing in the engine related jump tuning to level geometry, so the level shipped
 * physically inconsistent with its own platforms while every gate passed: it is
 * solvable, and no metric compared apex to step height.
 */

/** Skyline's real extracted platform layout. */
const SKYLINE_PLATFORMS: readonly PlatformerPlatformLike[] = [
  { id: "asset-main-ground", x: 0, y: 0, width: 1.62, height: 0.22 },
  { id: "asset-platform-01", x: 1.65, y: 0.216, width: 1.2, height: 0.22 },
  { id: "asset-platform-02", x: 2.73, y: 0.432, width: 1.2, height: 0.22 },
  { id: "asset-platform-03", x: 3.81, y: 0.234, width: 1.2, height: 0.22 },
  { id: "asset-platform-04", x: 5.1, y: 0.45, width: 1.2, height: 0.22 },
  { id: "asset-platform-05", x: 6.4, y: 0.63, width: 1.2, height: 0.22 },
  { id: "asset-platform-06", x: 7.8, y: 0.45, width: 1.2, height: 0.22 },
  { id: "asset-platform-07", x: 9.2, y: 0.63, width: 1.2, height: 0.22 },
  { id: "asset-platform-08", x: 10.6, y: 0.81, width: 1.2, height: 0.22 },
  { id: "asset-platform-09", x: 12, y: 0.63, width: 1.2, height: 0.22 },
  { id: "asset-platform-10", x: 13.5, y: 0.45, width: 1.2, height: 0.22 },
  { id: "asset-platform-11", x: 15.44, y: 0.216, width: 1.2, height: 0.22 }
];

describe("measurePlatformerGeometry", () => {
  it("measures what the level actually asks the player to do", () => {
    const geometry = measurePlatformerGeometry(SKYLINE_PLATFORMS);
    expect(geometry.platformCount).toBe(12);
    expect(geometry.maxRise).toBeCloseTo(0.216, 3);
    expect(geometry.maxGap).toBeGreaterThan(0);
    expect(geometry.courseLength).toBeGreaterThan(15);
    expect(geometry.minPlatformWidth).toBeCloseTo(1.2, 6);
  });

  it("orders platforms by x rather than trusting declaration order", () => {
    const shuffled = [...SKYLINE_PLATFORMS].reverse();
    expect(measurePlatformerGeometry(shuffled)).toEqual(measurePlatformerGeometry(SKYLINE_PLATFORMS));
  });

  it("returns zeroed facts for an empty level instead of NaN", () => {
    const geometry = measurePlatformerGeometry([]);
    expect(geometry.maxRise).toBe(0);
    expect(geometry.courseLength).toBe(0);
  });
});

describe("validatePlatformerMotion", () => {
  it("rejects Skyline's shipped tuning as floaty", () => {
    // The exact numbers the route shipped. This is the check that did not exist.
    const report = validatePlatformerMotion(SKYLINE_PLATFORMS, {
      gravity: -22,
      jumpVelocity: 7.4,
      moveSpeed: 1.15
    });
    expect(report.passes).toBe(false);
    expect(report.measured.apex).toBeCloseTo(1.2445, 3);
    expect(report.measured.airtime).toBeCloseTo(0.6727, 3);
    // The apex is more than five times the tallest step it needs to clear.
    expect(report.measured.apexToRiseRatio).toBeGreaterThan(5);
    expect(report.checks.find((check) => check.id === "jump-not-floaty")?.passes).toBe(false);
  });

  it("also rejects an under-powered jump that cannot clear a step", () => {
    const report = validatePlatformerMotion(SKYLINE_PLATFORMS, {
      gravity: -60,
      jumpVelocity: 3,
      moveSpeed: 4
    });
    expect(report.checks.find((check) => check.id === "jump-clears-tallest-step")?.passes).toBe(false);
  });

  it("accepts tuning derived from the level's own geometry", () => {
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS, { targetSessionSeconds: 150 });
    const report = validatePlatformerMotion(SKYLINE_PLATFORMS, solved);
    expect(report.passes, JSON.stringify(report.checks.filter((check) => !check.passes))).toBe(true);
  });

  it("flags an airtime that reads as floaty even when the ratios pass", () => {
    // Low gravity with a proportionate apex: ratios are fine, the jump still hangs.
    const report = validatePlatformerMotion(
      [{ x: 0, y: 0, width: 2, height: 0.2 }, { x: 3, y: 2, width: 2, height: 0.2 }],
      { gravity: -2, jumpVelocity: 3.1, moveSpeed: 3 }
    );
    expect(report.checks.find((check) => check.id === "airtime-readable")?.passes).toBe(false);
  });

  it("treats a level with no rises as unconstrained on apex", () => {
    const flat = [{ x: 0, y: 0, width: 4, height: 0.2 }, { x: 5, y: 0, width: 4, height: 0.2 }];
    const report = validatePlatformerMotion(flat, { gravity: -30, jumpVelocity: 6, moveSpeed: 6 });
    expect(report.checks.find((check) => check.id === "jump-not-floaty")?.passes).toBe(true);
  });
});

describe("solvePlatformerMotion", () => {
  it("sizes the apex to the level's tallest step rather than freely", () => {
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS);
    const geometry = measurePlatformerGeometry(SKYLINE_PLATFORMS);
    // Headroom above the step, not a multiple of it large enough to float.
    expect(solved.apex).toBeGreaterThan(geometry.maxRise);
    expect(solved.apex).toBeLessThan(geometry.maxRise * 2.6);
  });

  it("produces a much tighter jump than the shipped tuning", () => {
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS, { targetSessionSeconds: 150 });
    expect(solved.apex).toBeLessThan(1.2445);
    expect(solved.airtime).toBeLessThan(0.6727);
  });

  it("clears the widest gap with margin", () => {
    const geometry = measurePlatformerGeometry(SKYLINE_PLATFORMS);
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS);
    expect(solved.jumpReach).toBeGreaterThan(geometry.maxGap);
  });

  it("derives move speed from an intended session length", () => {
    const short = solvePlatformerMotion(SKYLINE_PLATFORMS, { targetSessionSeconds: 60 });
    const long = solvePlatformerMotion(SKYLINE_PLATFORMS, { targetSessionSeconds: 240 });
    // A longer intended session means a slower pace across the same course.
    expect(long.moveSpeed).toBeLessThanOrEqual(short.moveSpeed);
    expect(short.estimatedSessionSeconds).toBeLessThan(long.estimatedSessionSeconds + 1);
  });

  it("never makes a gap unclearable in service of a slow target pace", () => {
    const geometry = measurePlatformerGeometry(SKYLINE_PLATFORMS);
    // An absurdly long target session would imply a crawl; gap clearance must win.
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS, { targetSessionSeconds: 100_000 });
    expect(solved.jumpReach).toBeGreaterThan(geometry.maxGap);
  });

  it("scales coyote time and jump buffer with airtime rather than fixing them", () => {
    const snappy = solvePlatformerMotion(SKYLINE_PLATFORMS, { riseSeconds: 0.16 });
    const floaty = solvePlatformerMotion(SKYLINE_PLATFORMS, { riseSeconds: 0.42 });
    expect(floaty.coyoteMs).toBeGreaterThan(snappy.coyoteMs);
    expect(floaty.jumpBufferMs).toBeGreaterThan(snappy.jumpBufferMs);
  });

  it("gives a flat level a usable jump instead of a zero apex", () => {
    const solved = solvePlatformerMotion([{ x: 0, y: 0, width: 20, height: 0.2 }]);
    expect(solved.apex).toBeGreaterThan(0.1);
    expect(solved.jumpVelocity).toBeGreaterThan(0);
    expect(solved.gravity).toBeLessThan(0);
  });

  it("is internally consistent: apex, gravity and jump velocity agree", () => {
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS, { riseSeconds: 0.28 });
    const gravityMagnitude = Math.abs(solved.gravity);
    expect((solved.jumpVelocity * solved.jumpVelocity) / (2 * gravityMagnitude)).toBeCloseTo(solved.apex, 3);
    expect(solved.jumpVelocity / gravityMagnitude).toBeCloseTo(0.28, 3);
  });

  it("caps terminal velocity so a long fall stays readable", () => {
    const solved = solvePlatformerMotion(SKYLINE_PLATFORMS);
    expect(solved.terminalVelocity).toBeLessThan(0);
    expect(Math.abs(solved.terminalVelocity)).toBeCloseTo(solved.jumpVelocity * 2, 3);
  });
});

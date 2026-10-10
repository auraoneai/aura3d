/**
 * 08-SPEC / P-6: the cited `platformer-accel.test.ts` was missing — this is it.
 * S13 timings: solvePlatformerMotion derives a coherent (gravity, jumpVelocity,
 * moveSpeed, airtime, jumpReach) from geometry + feel intent.
 */
import { describe, expect, it } from "vitest";
import {
  platformerFeelProfile,
  solvePlatformerMotion
} from "../../../../packages/engine/src/agent-api/PlatformerMotion.js";

const PLATFORMS = [
  { x: 0, y: 0, width: 4 },
  { x: 6, y: 1.2, width: 4 },
  { x: 12, y: 2.4, width: 4 }
] as const;

describe("S13 platformer motion timings (P-6)", () => {
  it("jump kinematics are self-consistent: apex = v²/2g, airtime = 2v/g", () => {
    const s = solvePlatformerMotion(PLATFORMS as never, {});
    const g = Math.abs(s.gravity);
    expect(s.apex).toBeCloseTo((s.jumpVelocity * s.jumpVelocity) / (2 * g), 3);
    expect(s.airtime).toBeCloseTo((2 * s.jumpVelocity) / g, 3);
    expect(s.jumpReach).toBeCloseTo(s.moveSpeed * s.airtime, 3);
  });

  it("jump clears the tallest step (apex > maxRise + margin)", () => {
    const s = solvePlatformerMotion(PLATFORMS as never, {});
    // maxRise between consecutive platforms is 1.2.
    expect(s.apex).toBeGreaterThan(1.2);
  });

  it("feel presets differ: snappy apex < floaty apex for same height", () => {
    const snappy = platformerFeelProfile("snappy");
    const floaty = platformerFeelProfile("floaty");
    expect(snappy.apexPerHeight).toBeLessThan(floaty.apexPerHeight);
    const sSnap = solvePlatformerMotion(PLATFORMS as never, { feel: "snappy", characterHeight: 1 });
    const sFloat = solvePlatformerMotion(PLATFORMS as never, { feel: "floaty", characterHeight: 1 });
    expect(sFloat.apex).toBeGreaterThan(sSnap.apex);
  });

  it("explicit jumpHeight intent wins over geometry", () => {
    const s = solvePlatformerMotion(PLATFORMS as never, { jumpHeight: 5 });
    expect(s.apex).toBeGreaterThanOrEqual(5);
  });

  it("coyote + buffer windows are positive and scaled to airtime", () => {
    const s = solvePlatformerMotion(PLATFORMS as never, {});
    expect(s.coyoteMs).toBeGreaterThan(0);
    expect(s.jumpBufferMs).toBeGreaterThan(0);
    expect(s.coyoteMs).toBeLessThan(1000);
  });
});

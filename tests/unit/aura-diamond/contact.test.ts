import { describe, expect, it } from "vitest";
import { batContact, blendAngle } from "../../../apps/showcase-aura-diamond-3d/src/contact";

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe("batContact", () => {
  const ball: [number, number, number] = [0, 0, 40];

  it("a level swing sends a straight pitch straight back at the pitcher", () => {
    const hit = batContact({ axis: [1, 0, 0], sweetVelocity: [0, 0, -30], ballVelocity: ball });
    expect(hit).not.toBeNull();
    expect(hit!.sprayDeg).toBeCloseTo(0, 6);
    expect(hit!.launchDeg).toBeCloseTo(0, 6);
    expect(hit!.velocity[2]).toBeLessThan(-60);
  });

  it("the speed along the face normal drives the exit speed", () => {
    const slow = batContact({ axis: [1, 0, 0], sweetVelocity: [0, 0, -15], ballVelocity: ball })!;
    const fast = batContact({ axis: [1, 0, 0], sweetVelocity: [0, 0, -35], ballVelocity: ball })!;
    expect(Math.hypot(...fast.velocity)).toBeGreaterThan(Math.hypot(...slow.velocity));
    expect(fast.normalBatSpeed).toBeGreaterThan(slow.normalBatSpeed);
  });

  it("an upward sweep launches the ball up and a downward sweep drives it into the ground", () => {
    const up = batContact({ axis: norm([1, 0, 0]), sweetVelocity: norm([0, 0.35, -1]).map((n) => n * 32) as [number, number, number], ballVelocity: ball })!;
    const down = batContact({ axis: norm([1, 0, 0]), sweetVelocity: norm([0, -0.35, -1]).map((n) => n * 32) as [number, number, number], ballVelocity: ball })!;
    expect(up.launchDeg).toBeGreaterThan(5);
    expect(down.launchDeg).toBeLessThan(-5);
  });

  it("yawing the bat head toward the pitcher or the catcher flips the spray direction", () => {
    const early = batContact({ axis: norm([1, 0, -0.35]), sweetVelocity: [0, 0, -30], ballVelocity: ball })!;
    const late = batContact({ axis: norm([1, 0, 0.35]), sweetVelocity: [0, 0, -30], ballVelocity: ball })!;
    expect(Math.sign(early.sprayDeg)).toBe(-Math.sign(late.sprayDeg));
    expect(Math.abs(early.sprayDeg)).toBeGreaterThan(5);
  });

  it("returns null when the bat is not moving or the ball is leaving the face", () => {
    expect(batContact({ axis: [1, 0, 0], sweetVelocity: [0, 0, 0], ballVelocity: ball })).toBeNull();
    expect(batContact({ axis: [1, 0, 0], sweetVelocity: [0, 0, -30], ballVelocity: [0, 0, -80] })).toBeNull();
  });
});

describe("blendAngle", () => {
  it("clamps the weight and interpolates", () => {
    expect(blendAngle(10, 30, 0)).toBe(10);
    expect(blendAngle(10, 30, 1)).toBe(30);
    expect(blendAngle(10, 30, 0.5)).toBe(20);
    expect(blendAngle(10, 30, 2)).toBe(30);
    expect(blendAngle(10, 30, -1)).toBe(10);
  });
});

import { boundedBlend } from "../../../apps/showcase-aura-diamond-3d/src/contact";

describe("boundedBlend", () => {
  it("never moves the model angle by more than the bound", () => {
    expect(boundedBlend(0, 60, 0.5, 14)).toBe(14);
    expect(boundedBlend(10, -80, 0.5, 9)).toBe(1);
    expect(boundedBlend(20, 26, 0.5, 14)).toBe(23);
  });
});

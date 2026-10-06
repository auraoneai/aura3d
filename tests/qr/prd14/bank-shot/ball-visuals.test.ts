// tests/qr/prd14/bank-shot/ball-visuals.test.ts — T1.12 (Bank Shot): the ball
// visual euler tracks the physics body's roll (the pose no longer publishes a
// hardcoded identity quaternion).
import { describe, expect, it } from "vitest";
import { ballEulerFromBody } from "../../../../apps/showcase-bank-shot/src/gameplay/ball-visuals";

const IDENTITY = [0, 0, 0, 1] as const;

function axisAngleQuat(axis: readonly [number, number, number], angle: number): readonly [number, number, number, number] {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

describe("ballEulerFromBody (T1.12)", () => {
  it("identity quaternion yields zero euler", () => {
    expect(ballEulerFromBody(IDENTITY)).toEqual([0, 0, 0]);
  });

  it("rolling 1 m along +x with radius r rotates -1/r rad about z within 1%", () => {
    const r = 0.028575; // BALL_RADIUS
    const angle = -1 / r; // roll +x on the felt => negative z rotation
    const q = axisAngleQuat([0, 0, 1], angle);
    const [ex, ey, ez] = ballEulerFromBody(q);
    expect(ex).toBeCloseTo(0, 4);
    expect(ey).toBeCloseTo(0, 4);
    // Euler output wraps to [-pi, pi]; compare the wrapped angular delta.
    const wrapped = (((ez - angle) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    expect(Math.abs(wrapped) / Math.abs(angle)).toBeLessThan(0.01);
  });

  it("yaw-only roll heading stays on the y axis", () => {
    const q = axisAngleQuat([0, 1, 0], Math.PI / 3);
    const [ex, ey, ez] = ballEulerFromBody(q);
    expect(ey).toBeCloseTo(Math.PI / 3, 6);
    expect(ex).toBeCloseTo(0, 6);
    expect(ez).toBeCloseTo(0, 6);
  });
});

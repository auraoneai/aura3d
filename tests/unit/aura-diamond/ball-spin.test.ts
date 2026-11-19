import { describe, expect, it } from "vitest";
import { BallSpin, MAX_REV_PER_S } from "../../../apps/showcase-aura-diamond-3d/art/ballSpin";

describe("Aura Diamond ball spin (visible seams turn with travel)", () => {
  it("rotates while the ball moves, at a readable capped rate, and holds still at rest, in a glove or on a teleport", () => {
    const s = new BallSpin();
    const dt = 1 / 60;
    let last = s.step([0, 1.8, -18], dt);
    const angles: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const e = s.step([0, 1.8 - i * 0.004, -18 + i * 0.6], dt); // ~36 m/s pitch toward home
      expect(e).not.toEqual(last);
      last = e;
      angles.push(s.angle);
    }
    expect(angles.at(-1)! / (30 * dt)).toBeLessThanOrEqual(MAX_REV_PER_S * 2 * Math.PI + 1e-6);
    expect(angles.at(-1)!).toBeGreaterThan(Math.PI);
    const a = s.angle;
    expect(s.step([0, 1.68, 0], dt)).toEqual(s.step([0, 1.68, 0], dt)); // at rest
    s.step([5, 1, 5], dt, true); // held in a glove
    s.step([40, 1, -80], dt); // teleport
    expect(s.angle).toBe(a);
  });
});

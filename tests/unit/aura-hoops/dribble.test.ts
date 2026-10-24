import { describe, expect, it } from "vitest";
import { BALL_R, DRIB_BALL_GAP, DRIB_FLOOR_Y, dribbleBallXZ, dribbleContactWeight, dribbleCycleY } from "../../../apps/showcase-aura-hoops-3d/src/dribble";

const SHOULDER = 1.2;

describe("Aura Hoops dribble", () => {
  it("is in contact at the meet and the catch, free in the air in between", () => {
    expect(dribbleContactWeight(0)).toBe(1);
    expect(dribbleContactWeight(0.3)).toBe(1);
    expect(dribbleContactWeight(0.95)).toBe(1);
    expect(dribbleContactWeight(0.8)).toBeLessThan(0.99);
    const mid = Math.min(...[0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75].map(dribbleContactWeight));
    expect(mid).toBeLessThan(0.05);
  });

  it("keeps the ball on the palm at contact however fast the handler runs", () => {
    const holder = { x: 0, z: 0 };
    for (const speed of [0, 1.5, 3.7, 5]) {
      for (const phase of [0, 0.1, 0.25, 0.33, 0.9995]) {
        const cyc = dribbleCycleY(phase, SHOULDER);
        const palm: [number, number, number] = [0.25, cyc.palmY, 0.3];
        const at = dribbleBallXZ(palm, { ...holder, vx: speed, vz: 0 }, phase);
        const d = Math.hypot(palm[0] - at.x, cyc.palmY - cyc.ballY, palm[2] - at.z);
        // palm centroid to ball centre = the designed 0.11 m, which is inside the 0.13 m ball: the palm touches the ball
        expect(d).toBeLessThan(BALL_R);
        expect(Math.abs(d - DRIB_BALL_GAP)).toBeLessThan(0.005);
      }
    }
  });

  it("lets the stride carry the ball only while it is in the air, and reaches the floor", () => {
    const palm: [number, number, number] = [0, 1, 0];
    const free = dribbleBallXZ(palm, { x: 0, z: 0, vx: 4, vz: 0 }, 0.6);
    expect(free.x).toBeGreaterThan(0.1);
    const ys = Array.from({ length: 100 }, (_, i) => dribbleCycleY(i / 100, SHOULDER).ballY);
    expect(Math.min(...ys)).toBeCloseTo(DRIB_FLOOR_Y, 2);
  });
});

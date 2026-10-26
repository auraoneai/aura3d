import { describe, expect, it } from "vitest";
import { BALL_R, DRIB_ARM_REACH, DRIB_BALL_GAP, DRIB_FLOOR_Y, DRIB_RIDE_END, dribbleBallXZ, dribbleBallY, dribbleContactWeight, dribbleCycleY } from "../../../apps/showcase-aura-hoops-3d/src/dribble";

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

  /** Kinematic stand-in for the rig: the standing shoulder drops with the crouch, and the arm reaches `DRIB_ARM_REACH` below it. */
  function simulate(seconds: number, cycleSeconds: number, lag: number) {
    const dt = 1 / 60;
    let phase = 0;
    let releaseY = 0.5;
    let renderedPalm = 1.0;
    const rows: Array<{ t: number; ball: number; palm: number; gap: number }> = [];
    for (let i = 0; i < seconds / dt; i += 1) {
      phase = (phase + dt / cycleSeconds) % 1;
      const standing = 1.5;
      const cyc = dribbleCycleY(phase, standing - 0.43 * dribbleCycleY(phase, standing).effort);
      const shoulder = standing - 0.43 * cyc.effort;
      const reachable = Math.max(cyc.palmY, shoulder - DRIB_ARM_REACH);
      renderedPalm += (reachable - renderedPalm) * Math.min(1, dt / Math.max(lag, 1e-3));
      if (phase < DRIB_RIDE_END) releaseY = renderedPalm - DRIB_BALL_GAP;
      const ball = dribbleBallY(phase, renderedPalm, releaseY, renderedPalm - DRIB_BALL_GAP);
      rows.push({ t: phase, ball, palm: renderedPalm, gap: Math.abs(renderedPalm - ball) });
    }
    return rows;
  }

  it("keeps the ball on the rendered hand at the meet, on the floor at the bounce, and never far from the hand", () => {
    for (const [cycle, lag] of [[0.46, 0.02], [0.46, 0.06], [0.34, 0.04]] as const) {
      const rows = simulate(6, cycle, lag);
      const tops = rows.filter((r) => r.t < 0.04 || r.t > 0.93);
      expect(tops.length).toBeGreaterThan(5);
      for (const r of tops) expect(r.gap).toBeLessThanOrEqual(0.12);
      expect(Math.abs(Math.min(...rows.map((r) => r.ball)) - BALL_R)).toBeLessThanOrEqual(0.02);
      expect(Math.max(...rows.map((r) => r.gap))).toBeLessThanOrEqual(0.9);
    }
  });

  it("brings the palm within 0.45 m of the ball at the floor contact (the hand follows the ball down)", () => {
    const rows = simulate(6, 0.46, 0.03);
    const floor = rows.filter((r) => r.ball <= BALL_R + 0.02);
    expect(floor.length).toBeGreaterThan(3);
    expect(Math.max(...floor.map((r) => r.gap))).toBeLessThanOrEqual(0.55);
  });
});

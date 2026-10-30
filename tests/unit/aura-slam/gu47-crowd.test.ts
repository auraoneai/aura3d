/**
 * GU47 TT-AN1 / TT-A4: the World Tour crowd. Heads follow the ball with an 80-200 ms per-seat lag, clamped to a neck range,
 * the crowd stands on a cheer (not under reduced motion), and 240 spectators draw in 2 instanced calls.
 */
import { describe, expect, it } from "vitest";
import { CROWD_SEAT_COUNT, FOLLOW_LAG, NECK_LIMIT, createWorldTourCrowd, crowdSeats, wrapAngle, yawToward } from "../../../examples/aura-slam/view/crowd";

const DEG = 180 / Math.PI;
const settle = (crowd: ReturnType<typeof createWorldTourCrowd>, x: number, z: number, seconds: number, cheering = false, reducedMotion = false): void => {
  for (let t = 0; t < seconds; t += 1 / 60) crowd.follow(x, z, 1 / 60, cheering, reducedMotion);
};
const headYaws = (crowd: ReturnType<typeof createWorldTourCrowd>): Float32Array => Float32Array.from(crowd.heads.yaws);
const meanAbsDelta = (a: Float32Array, b: Float32Array): number => a.reduce((s, v, i) => s + Math.abs(wrapAngle(b[i]! - v)), 0) / a.length;

describe("GU47 TT-A4: 240 seated spectators in two instanced crowds", () => {
  it("240 seats on the bleacher tiers, 2 draws for the whole crowd", () => {
    expect(CROWD_SEAT_COUNT).toBe(240);
    expect(crowdSeats()).toHaveLength(240);
    const crowd = createWorldTourCrowd();
    expect(crowd.bodies.drawPlan().draws + crowd.heads.drawPlan().draws).toBe(2);
    expect(crowd.bodies.nodeIds).toEqual(["crowd-bodies:pose-0"]);
    expect(crowd.heads.nodeIds).toEqual(["crowd-heads:pose-0"]);
  });

  it("the layout is deterministic (no random seat or colour between loads)", () => {
    const a = createWorldTourCrowd();
    const b = createWorldTourCrowd();
    expect(Array.from(a.bodies.positions)).toEqual(Array.from(b.bodies.positions));
    expect(Array.from(a.bodies.colors)).toEqual(Array.from(b.bodies.colors));
  });

  it("every seat faces the court at rest", () => {
    for (const seat of crowdSeats()) {
      const toCentre = wrapAngle(yawToward(seat.position[0], seat.position[2], 0, 0) - seat.yaw);
      expect(Math.abs(toCentre) * DEG).toBeLessThan(80);
    }
  });
});

describe("GU47 TT-AN1: heads follow the rally", () => {
  it("per-seat lags span 80-200 ms", () => {
    const crowd = createWorldTourCrowd();
    for (const lag of crowd.lag) {
      expect(lag).toBeGreaterThanOrEqual(FOLLOW_LAG[0]);
      expect(lag).toBeLessThanOrEqual(FOLLOW_LAG[1]);
    }
    expect(Math.max(...crowd.lag) - Math.min(...crowd.lag)).toBeGreaterThan(0.08);
  });

  it("mean head yaw moves >= 25 degrees within 0.3 s of a cross-court shot", () => {
    const crowd = createWorldTourCrowd();
    settle(crowd, -4, -5, 2);
    const before = headYaws(crowd);
    settle(crowd, 4, 5, 0.3);
    expect(meanAbsDelta(before, headYaws(crowd)) * DEG).toBeGreaterThanOrEqual(25);
  });

  it("two rally frames 1 s apart differ by >= 10 degrees (ball crossing the court)", () => {
    const crowd = createWorldTourCrowd();
    const ballAt = (t: number): [number, number] => [3.5 * Math.sin(t * 1.6), 7 * Math.sin(t * Math.PI * 0.5)];
    let t = 0;
    for (; t < 3; t += 1 / 60) { const [x, z] = ballAt(t); crowd.follow(x, z, 1 / 60, false); }
    const a = headYaws(crowd);
    for (const end = t + 1; t < end; t += 1 / 60) { const [x, z] = ballAt(t); crowd.follow(x, z, 1 / 60, false); }
    expect(meanAbsDelta(a, headYaws(crowd)) * DEG).toBeGreaterThanOrEqual(10);
  });

  it("heads stay inside the neck range around the body's facing", () => {
    const crowd = createWorldTourCrowd();
    const seats = crowdSeats();
    for (const [x, z] of [[-30, 0], [30, 0], [0, -30], [0, 40]] as const) {
      settle(crowd, x, z, 1.5);
      seats.forEach((seat, i) => expect(Math.abs(wrapAngle(crowd.heads.yaws[i]! - seat.yaw))).toBeLessThanOrEqual(NECK_LIMIT + 1e-5));
    }
  });

  it("the follow writes in place (same buffers every frame) and dt 0 changes nothing", () => {
    const crowd = createWorldTourCrowd();
    const yaws = crowd.heads.yaws;
    const positions = crowd.bodies.positions;
    settle(crowd, 2, 3, 0.5);
    expect(crowd.heads.yaws).toBe(yaws);
    expect(crowd.bodies.positions).toBe(positions);
    const frozen = headYaws(crowd);
    crowd.follow(-5, -5, 0, false);
    expect(headYaws(crowd)).toEqual(frozen);
  });

  it("the crowd stands on a cheer, and not under reduced motion (PRD §6.3)", () => {
    const crowd = createWorldTourCrowd();
    const seatedY = crowd.bodies.positions[1]!;
    settle(crowd, 0, 0, 1.5, true);
    expect(crowd.standing()).toBeGreaterThan(0.95);
    expect(crowd.bodies.positions[1]!).toBeGreaterThan(seatedY + 0.15);
    settle(crowd, 0, 0, 2, false);
    expect(crowd.standing()).toBeLessThan(0.01);
    const calm = createWorldTourCrowd();
    settle(calm, 0, 0, 1.5, true, true);
    expect(calm.standing()).toBe(0);
  });

  it("the crowd update pushes both instanced nodes through the app's node store", () => {
    const crowd = createWorldTourCrowd();
    const writes: { id: string; count: number }[] = [];
    const target = { nodes: { get: (id: string) => ({ setInstanceMatrices: (_m: Float32Array, count: number) => { writes.push({ id, count }); }, setVisible: () => undefined }) } };
    crowd.follow(1, 1, 1 / 60, false);
    expect(crowd.update(target, 0)).toBe(2);
    expect(writes).toEqual([{ id: "crowd-bodies:pose-0", count: 240 }, { id: "crowd-heads:pose-0", count: 240 }]);
  });
});

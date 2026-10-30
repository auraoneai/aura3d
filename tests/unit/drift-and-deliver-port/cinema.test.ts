import { describe, expect, it } from "vitest";
import { FLARE, INTRO, ORBIT, SIDE_SHOT, headlightFlare, introPose, introWanted, orbitPose, sideShotPose, sideShotWanted } from "../../../examples/drift-and-deliver-port/cinema";

const car = { x: 30, z: -90, heading: 0 };
const chase = { position: [30, 2.1, -95] as [number, number, number], target: [30, 1.2, -80] as [number, number, number], fov: 60 };

describe("gridlock courier intro and results orbit (GU47 WP-28 GC-C1)", () => {
  it("opens over the harbour, rails down the avenue and lands exactly on the chase pose", () => {
    expect(introPose(0, car, chase).position[2]).toBeGreaterThan(500);
    const rail = introPose((INTRO.harbour + INTRO.rail) / 2, car, chase);
    expect(rail.position[0]).toBeCloseTo(car.x, 6);
    expect(rail.position[2]).toBeGreaterThan(car.z);
    const end = introPose(INTRO.seconds, car, chase);
    expect(end.position).toEqual(chase.position);
    expect(end.target).toEqual(chase.target);
    expect(end.fov).toBe(chase.fov);
  });

  it("skips for QA starts and under reduced motion", () => {
    expect(introWanted(true, false, false, false)).toBe(true);
    expect(introWanted(true, true, false, false)).toBe(false);
    expect(introWanted(true, false, true, false)).toBe(false);
    expect(introWanted(true, false, false, true)).toBe(false);
    expect(introWanted(false, false, false, false)).toBe(false);
  });

  it("orbits the courier, holds still under reduced motion and pulls in when blocked", () => {
    const a = orbitPose(0, car, false), b = orbitPose(2, car, false);
    expect(Math.hypot(a.position[0] - car.x, a.position[2] - car.z)).toBeCloseTo(ORBIT.radius, 6);
    expect(a.position).not.toEqual(b.position);
    expect(orbitPose(0, car, true).position).toEqual(orbitPose(5, car, true).position);
    const near = orbitPose(0, car, false, (x, _y, z) => Math.hypot(x - car.x, z - car.z) > 8);
    expect(Math.hypot(near.position[0] - car.x, near.position[2] - car.z)).toBeCloseTo(6, 6);
  });
});

describe("gridlock courier results headlight flare (GU47 WP-28 GC-L5)", () => {
  it("sits between the lamps ahead of the car", () => {
    const f = headlightFlare(car, [30, 6, -70], 1);
    expect(f.position[0]).toBeCloseTo(30, 6);
    expect(f.position[1]).toBe(FLARE.height);
    expect(f.position[2]).toBeCloseTo(-90 + FLARE.ahead, 6);
  });

  it("shows only with the beams on and the eye in front of the car", () => {
    expect(headlightFlare(car, [30, 6, -70], 1).visible).toBe(true);
    expect(headlightFlare(car, [30, 6, -110], 1).visible).toBe(false);
    expect(headlightFlare(car, [30, 6, -70], 0).visible).toBe(false);
  });
});

describe("gridlock courier first-delivery side shot (GU47 WP-28 GC-C1)", () => {
  it("plays only on the first delivery of a player run with motion allowed", () => {
    expect(sideShotWanted(true, 1, false, false, false)).toBe(true);
    expect(sideShotWanted(true, 2, false, false, false)).toBe(false);
    expect(sideShotWanted(false, 1, false, false, false)).toBe(false);
    expect(sideShotWanted(true, 1, true, false, false)).toBe(false);
    expect(sideShotWanted(true, 1, false, true, false)).toBe(false);
    expect(sideShotWanted(true, 1, false, false, true)).toBe(false);
  });

  it("stands 7 m beside the car, falls to the other side, and gives up when both are blocked", () => {
    const right = sideShotPose(0, car)!;
    expect(Math.hypot(right.position[0] - car.x, right.position[2] - car.z)).toBeCloseTo(Math.hypot(SIDE_SHOT.side, SIDE_SHOT.lead), 6);
    expect(right.target).toEqual([car.x, 1, car.z]);
    const left = sideShotPose(0, car, (x) => x > car.x)!;
    expect(left.position[0]).toBeLessThan(car.x);
    expect(sideShotPose(0, car, () => true)).toBeNull();
  });
});

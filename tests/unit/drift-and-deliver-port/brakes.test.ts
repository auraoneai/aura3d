import { describe, expect, it } from "vitest";
import { BRAKE_EPS, HALO, PITCH_MAX, courierBraking, createPitch, haloCount, placeHalos, stepPitch, trafficBraking } from "../../../examples/drift-and-deliver-port/brakes";

describe("gridlock courier body pitch and brake halos (GU47 WP-28 GC-AN1, GC-L5)", () => {
  it("pitches the nose down under braking, up under throttle, capped at 2.5 deg, and holds on manual frames", () => {
    const p = createPitch();
    p.speed = 30;
    for (let i = 0; i < 30; i++) stepPitch(p, 30 - (i + 1) * 0.25, 1 / 60);
    expect(p.pitch).toBeGreaterThan(0);
    expect(p.pitch).toBeLessThanOrEqual(PITCH_MAX + 1e-9);
    const held = p.pitch;
    expect(stepPitch(p, 10, 0)).toBe(held);
    const q = createPitch();
    for (let i = 0; i < 30; i++) stepPitch(q, (i + 1) * 0.1, 1 / 60);
    expect(q.pitch).toBeLessThan(0);
  });

  it("is 0 at a steady speed and halves under reduced motion", () => {
    const p = createPitch();
    p.speed = 20;
    for (let i = 0; i < 60; i++) stepPitch(p, 20, 1 / 60);
    expect(Math.abs(p.pitch)).toBeLessThan(1e-9);
    const full = createPitch();
    const calm = createPitch();
    full.speed = calm.speed = 30;
    for (let i = 0; i < 120; i++) {
      stepPitch(full, 30 - (i + 1) * 0.25, 1 / 60);
      stepPitch(calm, 30 - (i + 1) * 0.25, 1 / 60, true);
    }
    expect(calm.pitch).toBeCloseTo(full.pitch / 2, 6);
  });

  it("reads braking from the sim without writing it", () => {
    const t = Object.freeze({ v: 5, speed: 10, hw: 0.9, hd: 2.1 });
    expect(trafficBraking(t)).toBe(true);
    expect(trafficBraking({ v: 10 - BRAKE_EPS / 2, speed: 10 })).toBe(false);
    expect(courierBraking(true, 10)).toBe(true);
    expect(courierBraking(true, -3)).toBe(false);
    expect(courierBraking(false, 10)).toBe(false);
  });

  it("lights two halos behind each braking car and hides the rest under the road", () => {
    const cars = [{ v: 2, speed: 9, hw: 0.9, hd: 2 }, { v: 9, speed: 9, hw: 0.9, hd: 2 }];
    const traffic = new Float64Array([10, 20, 0, 50, 60, Math.PI / 2]);
    const writes = new Map<number, number[]>();
    const lit = placeHalos({ x: 0, z: 0, yaw: 0, halfW: 1, halfD: 2.1, braking: true }, traffic, cars, (i, x, y, z, yaw, sx, sy, sz) => writes.set(i, [x, y, z, yaw, sx, sy, sz]));
    expect(lit).toBe(4);
    expect(writes.size).toBe(haloCount(cars.length));
    // courier halos sit behind the car (yaw 0 faces +z) at lamp height
    expect(writes.get(0)![2]).toBeLessThan(-2);
    expect(writes.get(0)![1]).toBe(HALO.y);
    expect(writes.get(0)![0]).toBeLessThan(0);
    expect(writes.get(1)![0]).toBeGreaterThan(0);
    // braking traffic car 0 behind (10, 20)
    expect(writes.get(2)![2]).toBeCloseTo(20 - 2.02, 6);
    // cruising traffic car 1: hidden
    expect(writes.get(4)![1]).toBe(-50);
    expect(writes.get(5)![4]).toBe(0);
  });
});

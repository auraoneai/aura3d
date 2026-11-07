import { describe, expect, it } from "vitest";
import { BOB_METRES, DRIVE_SECONDS, LEAN_RADIANS, MAX_DRIVE, NO_MOTION, bodyMotion, followDrive } from "../../../examples/where-the-wind-wanders-port/gait-motion";
import { WIND_VFX_PRESETS } from "../../../examples/where-the-wind-wanders-port/vfx";

describe("hero secondary motion", () => {
  it("is exactly zero when idle", () => {
    for (let p = 0; p <= 1; p += 0.1) expect(bodyMotion(p, 0)).toBe(NO_MOTION);
  });
  it("bobs at twice the step frequency, leans with speed and rolls once per cycle", () => {
    const at = (p: number) => bodyMotion(p, 1);
    expect(at(0.06).bob).toBeCloseTo(BOB_METRES, 6);
    expect(at(0.56).bob).toBeCloseTo(BOB_METRES, 6);
    expect(at(0.31).bob).toBeCloseTo(-BOB_METRES, 6);
    expect(at(0.3).pitch).toBeCloseTo(LEAN_RADIANS, 9);
    expect(bodyMotion(0.3, 2).pitch).toBeCloseTo(2 * LEAN_RADIANS, 9);
    expect(bodyMotion(0.3, 9).pitch).toBeCloseTo(MAX_DRIVE * LEAN_RADIANS, 9);
    expect(Math.sign(at(0.3).roll)).toBe(-Math.sign(at(0.8).roll));
  });
  it("is continuous when the drive changes across a gait switch and when the phase wraps", () => {
    const a = bodyMotion(0.999999, 1.4), b = bodyMotion(0, 1.4);
    expect(Math.abs(a.bob - b.bob)).toBeLessThan(1e-5);
    expect(Math.abs(a.roll - b.roll)).toBeLessThan(1e-5);
    const lo = bodyMotion(0.2, 0.999), hi = bodyMotion(0.2, 1.001);
    expect(Math.abs(lo.pitch - hi.pitch)).toBeLessThan(1e-3);
    expect(Math.abs(lo.bob - hi.bob)).toBeLessThan(1e-4);
  });
  it("follows the drive identically at 30 to 240 Hz cadences", () => {
    const run = (hz: number) => { let d = 0; for (let i = 0; i < hz * 0.5; i++) d = followDrive(d, 1, 1 / hz); return d; };
    const ref = run(240);
    for (const hz of [30, 60, 120, 144]) expect(run(hz)).toBeCloseTo(ref, 9);
    expect(ref).toBeCloseTo(1 - Math.exp(-0.5 / DRIVE_SECONDS), 9);
    expect(followDrive(0.7, 0, 0)).toBe(0.7);
    expect(followDrive(1, 0, 5)).toBeLessThan(1e-6);
  });
  it("registers a small footfall puff preset", () => {
    const layer = WIND_VFX_PRESETS["wind-footfall"]!.layers[0] as unknown as { count: number };
    expect(layer.count).toBeLessThanOrEqual(8);
  });
});

import { describe, expect, it } from "vitest";
import { createCameraDirector, eventKick } from "../../../examples/roadster-hours-port/camera";

const car = (l = 0, h = 0, v = 40) => ({ l, h, v, grounded: true, phase: "running" as const, boosting: false, nitro: 0 });
const FRAME = 1 / 60;

describe("Saltwind Highway chase camera (audit C7)", () => {
  it("snaps on the first frame, then smooths a 1.8 m hazard push instead of jumping 1.44 m", () => {
    const d = createCameraDirector({ reducedMotion: true });
    const first = d.step(car(0), [], FRAME);
    expect(first.cut).toBe(true);
    expect(first.eyeL).toBe(0);
    for (let i = 0; i < 30; i++) d.step(car(0), [], FRAME);
    const pushed = d.step(car(1.8), [{ type: "impact" }], FRAME);
    expect(pushed.cut).toBe(false);
    expect(pushed.eyeL).toBeGreaterThan(0);
    expect(pushed.eyeL).toBeLessThan(0.3);
    let f = pushed;
    for (let i = 0; i < 60; i++) f = d.step(car(1.8), [], FRAME);
    expect(f.eyeL).toBeCloseTo(1.44, 2);
  });
  it("cuts on recover and on begin", () => {
    const d = createCameraDirector({ reducedMotion: true });
    for (let i = 0; i < 10; i++) d.step(car(5), [], FRAME);
    const r = d.step(car(0), [{ type: "recover" }], FRAME);
    expect(r.cut).toBe(true);
    expect(r.eyeL).toBe(0);
    d.step(car(3), [], FRAME);
    d.cut();
    expect(d.step(car(-2), [], FRAME).eyeL).toBeCloseTo(-1.6, 9);
  });
  it("adds trauma shake and FOV kicks for events, decaying over time", () => {
    const d = createCameraDirector();
    d.step(car(), [], FRAME);
    const hit = d.step(car(), [{ type: "launch", kicker: true, big: true }], FRAME);
    expect(d.trauma).toBeGreaterThan(0.25);
    expect(hit.fovKick).toBeGreaterThan((40 / 74) * 8);
    let shook = false;
    for (let i = 0; i < 20; i++) { const f = d.step(car(), [], FRAME); if (Math.abs(f.shakeRight) + Math.abs(f.shakeUp) > 0.005) shook = true; }
    expect(shook).toBe(true);
    for (let i = 0; i < 120; i++) d.step(car(), [], FRAME);
    expect(d.trauma).toBe(0);
  });
  it("reduced motion turns shake and kicks off", () => {
    const d = createCameraDirector({ reducedMotion: true });
    d.step(car(), [], FRAME);
    for (let i = 0; i < 20; i++) {
      const f = d.step(car(), [{ type: "impact" }, { type: "nitro", level: 3 }], FRAME);
      expect(Math.abs(f.shakeRight)).toBe(0);
      expect(Math.abs(f.shakeUp)).toBe(0);
    }
    expect(d.trauma).toBe(0);
  });
  it("ports the original's trauma table", () => {
    expect(eventKick({ type: "impact" }).trauma).toBe(0.55);
    expect(eventKick({ type: "recover" }).trauma).toBe(0.45);
    expect(eventKick({ type: "land", strength: 1 }).trauma).toBeCloseTo(0.62, 9);
    expect(eventKick({ type: "launch", kicker: false }).trauma).toBe(0);
  });
});

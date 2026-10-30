import { describe, expect, it } from "vitest";
import { FINISH_TRACKSIDE_SECONDS, HANG_FOV_PUSH, HANG_SLOWMO, INTRO_SECONDS, createShotDirector, orbitEye } from "../../../examples/roadster-hours-port/art/shots";

const car = { s: 100, l: 0, grounded: true };
const air = { s: 140, l: 0, grounded: false };
const run = (d: ReturnType<typeof createShotDirector>, seconds: number, state = car, events: { type: string; [k: string]: unknown }[] = []) => {
  let f = d.step(1 / 60, state, events);
  for (let t = 1 / 60; t < seconds; t += 1 / 60) f = d.step(1 / 60, state, []);
  return f;
};

describe("Saltwind Highway shots (RH47-16)", () => {
  it("plays a 6 s letterboxed intro rail that ends on its own with a cut", () => {
    const d = createShotDirector();
    d.startIntro();
    const first = d.step(1 / 60, car, []);
    expect(first.mode).toBe("intro");
    expect(first.eye!.h).toBeGreaterThan(20);
    const mid = run(d, 3);
    expect(mid.bars).toBeGreaterThan(0.9);
    let f = mid;
    for (let t = 0; t < INTRO_SECONDS; t += 1 / 60) { f = d.step(1 / 60, car, []); if (f.mode === "play") break; }
    expect(f.mode).toBe("play");
    expect(f.cut).toBe(true);
    expect(f.eye).toBeNull();
  });

  it("any input ends the intro on that frame", () => {
    const d = createShotDirector();
    d.startIntro();
    run(d, 1);
    d.skipIntro();
    const f = d.step(1 / 60, car, []);
    expect(f.mode).toBe("play");
    expect(f.cut).toBe(true);
    expect(f.eye).toBeNull();
  });

  it("finish: trackside then an orbit around the car", () => {
    const d = createShotDirector();
    d.startFinish();
    const side = d.step(1 / 60, car, []);
    expect(side.mode).toBe("finish");
    expect(side.eye).not.toBeNull();
    const orbit = run(d, FINISH_TRACKSIDE_SECONDS + 1);
    expect(orbit.orbit).not.toBeNull();
    const eye = orbitEye([0, 0, 0], orbit.orbit!);
    expect(Math.hypot(eye[0], eye[2])).toBeCloseTo(orbit.orbit!.radius, 9);
  });

  it("kicker hang time pushes the FOV and slows the wall clock; landing restores both", () => {
    const d = createShotDirector();
    d.step(1 / 60, air, [{ type: "launch", kicker: true }]);
    const hang = run(d, 1, air);
    expect(hang.fovPush).toBeGreaterThan(HANG_FOV_PUSH * 0.9);
    expect(hang.timeScale).toBeLessThan(HANG_SLOWMO + 0.05);
    d.step(1 / 60, car, [{ type: "land", strength: 0.5 }]);
    const landed = run(d, 1);
    expect(landed.fovPush).toBeLessThan(0.1);
    expect(landed.timeScale).toBeGreaterThan(0.99);
  });

  it("reduced motion: no rail, no bars, static finish, no slow-mo or FOV push", () => {
    const d = createShotDirector({ reducedMotion: true });
    d.startIntro();
    const f = d.step(1 / 60, car, []);
    expect(f.mode).toBe("play");
    expect(f.bars).toBe(0);
    d.step(1 / 60, air, [{ type: "launch", kicker: true }]);
    const hang = run(d, 1, air);
    expect(hang.timeScale).toBe(1);
    expect(hang.fovPush).toBe(0);
    d.startFinish();
    const fin = run(d, FINISH_TRACKSIDE_SECONDS + 2);
    expect(fin.orbit).toBeNull();
    expect(fin.eye).not.toBeNull();
    // switching reduced motion on mid-intro cuts to the chase camera
    const e = createShotDirector();
    e.startIntro();
    run(e, 1);
    e.setReducedMotion(true);
    expect(e.step(1 / 60, car, []).mode).toBe("play");
  });
});

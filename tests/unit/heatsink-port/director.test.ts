import { describe, expect, it } from "vitest";
import { afterburnerKick, AFTERBURNER_KICK, directCamera, SWEEP, vignettePulse } from "../../../examples/heatsink-port/art/director";
import { LOOKS } from "../../../examples/heatsink-port/art/look";

const base = { target: [0, 1, 0] as const, eye: [-7.6, 3, 0] as const, look: [20, 1.8, 0] as const, finishedFor: 0 };
const run = (row = LOOKS.twilight, enabled = true, extra: Partial<Parameters<typeof directCamera>[2]> = {}) => {
  const eye: [number, number, number] = [0, 0, 0], look: [number, number, number] = [0, 0, 0];
  const w = directCamera(row, enabled, { state: "race", countdown: 0, ...base, ...extra }, eye, look);
  return { w, eye, look };
};

describe("heatsink-port IC-22 camera direction", () => {
  it("race state and the original look keep the chase pose exactly", () => {
    for (const r of [run(), run(LOOKS.original, true, { state: "countdown", countdown: 3.2 })]) {
      expect(r.w).toBe(0);
      expect(r.eye).toEqual([...base.eye]);
      expect(r.look).toEqual([...base.look]);
    }
  });

  it("reduced motion or manual (disabled) is a cut: no sweep", () => {
    const r = run(LOOKS.twilight, false, { state: "countdown", countdown: SWEEP.seconds });
    expect(r.w).toBe(0);
    expect(r.eye).toEqual([...base.eye]);
  });

  it("the countdown sweep starts off to the side and lands on the chase pose", () => {
    const start = run(LOOKS.twilight, true, { state: "countdown", countdown: SWEEP.seconds });
    expect(start.w).toBe(1);
    expect(Math.hypot(start.eye[0] - base.eye[0], start.eye[2] - base.eye[2])).toBeGreaterThan(8);
    const end = run(LOOKS.twilight, true, { state: "countdown", countdown: 0 });
    expect(end.w).toBe(0);
    expect(end.eye).toEqual([...base.eye]);
  });

  it("the finish orbit blends in and keeps moving", () => {
    const a = run(LOOKS.twilight, true, { state: "finished", finishedFor: 2 });
    const b = run(LOOKS.twilight, true, { state: "finished", finishedFor: 4 });
    expect(a.w).toBe(1);
    expect(Math.hypot(a.eye[0] - b.eye[0], a.eye[2] - b.eye[2])).toBeGreaterThan(1);
    expect(a.look[0]).toBeCloseTo(0);
  });

  it("afterburner kick only on the twilight row", () => {
    expect(afterburnerKick(LOOKS.twilight, true)).toBe(AFTERBURNER_KICK);
    expect(afterburnerKick(LOOKS.twilight, false)).toBe(0);
    expect(afterburnerKick(LOOKS.original, true)).toBe(0);
  });

  it("IC-08 vignette pulse rises under the afterburner, decays after, and is 0 on reduced motion or original", () => {
    let e = 0;
    for (let i = 0; i < 30; i++) e = vignettePulse(LOOKS.twilight, false, true, e, 1 / 60);
    expect(e).toBeGreaterThan(0.9);
    const after = vignettePulse(LOOKS.twilight, false, false, e, 0.5);
    expect(after).toBeLessThan(e);
    expect(vignettePulse(LOOKS.twilight, true, true, e, 1 / 60)).toBe(0);
    expect(vignettePulse(LOOKS.original, false, true, 0, 1)).toBe(0);
  });
});

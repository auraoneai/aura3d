import { describe, expect, it } from "vitest";
import { createLocomotion } from "../../../packages/game/src/motion/locomotion";
import { LEG_BONES, LEG_CLIPS, LEG_SAMPLES } from "../../../examples/kid-goku-beyond-the-clouds-port/legcycle";
import { CLIP_FOOT_SPEED, MAX_RATE, touchdowns } from "../../../examples/kid-goku-beyond-the-clouds-port/locomotion";

describe("Cumulus Dash clip locomotion", () => {
  it("has a full sampled cycle for every leg bone, foot, hips and both clips", () => {
    for (const clip of ["run", "walk"] as const) {
      expect(LEG_CLIPS[clip].duration).toBeGreaterThan(0.5);
      for (const bone of LEG_BONES) {
        const frames = LEG_CLIPS[clip].bones[bone];
        expect(frames).toHaveLength(LEG_SAMPLES);
        for (const q of frames) expect(Math.hypot(...q)).toBeCloseTo(1, 4);
      }
      expect(LEG_CLIPS[clip].hipsT).toHaveLength(LEG_SAMPLES);
      expect(LEG_CLIPS[clip].hipsR).toHaveLength(LEG_SAMPLES);
      for (const foot of ["LeftFoot", "RightFoot"] as const) expect(LEG_CLIPS[clip].feet[foot]).toHaveLength(LEG_SAMPLES);
    }
  });

  it("plays the run clip at the library rate: 1x at the clip's own foot speed, capped at MAX_RATE", () => {
    const loco = createLocomotion({ gaits: [{ name: "idle", speed: 0, cycle: 4.03 }, { name: "run", speed: CLIP_FOOT_SPEED.run, cycle: LEG_CLIPS.run.duration }], minRate: 0.6, maxRate: MAX_RATE });
    let r = 1;
    for (let i = 0; i < 40; i++) r = loco.update(CLIP_FOOT_SPEED.run, 1 / 60).rates.run ?? 1;
    expect(r).toBeCloseTo(1, 3);
    for (let i = 0; i < 40; i++) r = loco.update(14.5, 1 / 60).rates.run ?? 1;
    expect(r).toBe(MAX_RATE);
  });

  it("counts one touchdown per foot per cycle, including across a cycle wrap", () => {
    let left = 0, right = 0;
    for (let i = 0; i < 200; i++) { const td = touchdowns("run", i * 0.05, (i + 1) * 0.05); left += td.left; right += td.right; }
    expect(left).toBe(10);
    expect(right).toBe(10);
    expect(touchdowns("run", 0.3, 0.45)).toEqual({ left: 1, right: 0 });
    expect(touchdowns("run", 0.8, 1.4)).toEqual({ left: 1, right: 1 });
  });
});

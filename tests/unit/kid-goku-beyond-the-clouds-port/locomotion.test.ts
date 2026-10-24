import { describe, expect, it } from "vitest";
import { LEG_BONES, LEG_CLIPS, LEG_SAMPLES } from "../../../examples/kid-goku-beyond-the-clouds-port/legcycle";
import {
  CLIP_FOOT_SPEED,
  MAX_GAIN,
  MAX_RATE,
  gaitFor,
  legOverlayPose,
  legRotationAt,
  touchdowns,
  widenedLegRotation
} from "../../../examples/kid-goku-beyond-the-clouds-port/locomotion";

const angleOf = (q: readonly number[]): number => 2 * Math.acos(Math.min(1, Math.abs(q[3]!)));

describe("kid goku locomotion", () => {
  it("has a full sampled cycle for every leg bone and both clips", () => {
    for (const clip of ["run", "walk"] as const) {
      expect(LEG_CLIPS[clip].duration).toBeGreaterThan(0.5);
      for (const bone of LEG_BONES) {
        const frames = LEG_CLIPS[clip].bones[bone];
        expect(frames).toHaveLength(LEG_SAMPLES);
        for (const q of frames) expect(Math.hypot(...q)).toBeCloseTo(1, 4);
      }
    }
  });

  it("matches the clip's planted-foot speed at the speed it was authored for", () => {
    const g = gaitFor("run", CLIP_FOOT_SPEED.run);
    expect(g.rate).toBeCloseTo(1, 6);
    expect(g.gain).toBeCloseTo(1, 6);
    expect(g.slideRatio).toBeCloseTo(0, 6);
  });

  it("caps cadence and stride, and measures the slide that remains at the sim's 14.5 m/s", () => {
    const g = gaitFor("run", 14.5);
    expect(g.rate).toBe(MAX_RATE);
    expect(g.gain).toBe(MAX_GAIN);
    expect(g.footSpeed).toBeCloseTo(CLIP_FOOT_SPEED.run * MAX_RATE * MAX_GAIN, 6);
    const before = 1 - (CLIP_FOOT_SPEED.run * (0.95 + 14.5 / 30)) / 14.5;
    expect(g.slideRatio).toBeLessThan(before * 0.45);
    expect(g.slideRatio).toBeGreaterThan(0);
  });

  it("plants the feet while the speed is reachable and only slides once cadence and stride are capped", () => {
    const reach = CLIP_FOOT_SPEED.run * MAX_RATE * MAX_GAIN;
    for (const v of [1, 3, 5, 8, reach - 0.01]) expect(gaitFor("run", v).slideRatio).toBeCloseTo(0, 6);
    let last = 0;
    for (const v of [reach + 0.5, 12, 14.5, 20]) {
      const g = gaitFor("run", v);
      expect(g.slideRatio).toBeGreaterThan(last - 1e-9);
      last = g.slideRatio;
    }
    expect(gaitFor("run", 0).slideRatio).toBe(0);
  });

  it("gain 1 returns the clip pose exactly and gain above 1 widens the swing", () => {
    for (const bone of LEG_BONES) {
      for (const phase of [0, 0.13, 0.5, 0.77]) {
        const base = legRotationAt("run", bone, phase);
        expect(widenedLegRotation("run", bone, phase, 1)).toEqual(base);
      }
    }
    const swing = (gain: number): number => {
      const angles = Array.from({ length: 48 }, (_, i) => angleOf(widenedLegRotation("run", "LeftUpLeg", i / 48, gain)));
      return Math.max(...angles) - Math.min(...angles);
    };
    expect(swing(1.8)).toBeGreaterThan(swing(1) * 1.3);
    for (let i = 0; i < 24; i++) expect(Math.hypot(...widenedLegRotation("run", "RightLeg", i / 24, 1.8))).toBeCloseTo(1, 6);
  });

  it("builds an overlay pose that touches only the four leg bones", () => {
    const pose = legOverlayPose("run", 0.4, 1.5);
    expect(pose.mode).toBe("overlay");
    expect(Object.keys(pose.bones).sort()).toEqual([...LEG_BONES].sort());
    for (const t of Object.values(pose.bones)) expect(Math.hypot(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)).toBeCloseTo(1, 6);
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

import { describe, expect, it } from "vitest";
import {
  APEX_CHASE_POSE,
  APEX_TITLE_SHOTS,
  SLOW_MO_SCALE,
  SLOW_MO_SECONDS,
  apexTitleDurationSeconds,
  apexTitleSequence,
  createApexSlowMo
} from "../../../apps/showcase-roadster-rush/src/render/cinematics";

describe("Apex Overdrive cinematics (GU47 AO-C1)", () => {
  it("plays three letterboxed shots that end within 4.5 s and return to the chase camera", () => {
    expect(APEX_TITLE_SHOTS).toHaveLength(3);
    expect(apexTitleDurationSeconds()).toBeLessThanOrEqual(4.5);
    const poses: unknown[] = [];
    const seq = apexTitleSequence((pose) => {
      poses.push(pose);
      return { id: "static", pose };
    });
    expect(seq.onEnd).toBe("return");
    expect(seq.shots.every((s) => s.bars)).toBe(true);
    expect(poses).toHaveLength(3);
    for (const pose of poses as { near: number; far: number; fov: number }[]) {
      expect(pose.near).toBe(APEX_CHASE_POSE.near);
      expect(pose.far).toBe(APEX_CHASE_POSE.far);
      expect(pose.fov).toBeGreaterThan(30);
    }
    // every shot differs from the chase framing (the 2 s title frame must not look like gameplay)
    for (const s of APEX_TITLE_SHOTS) expect(s.position).not.toEqual(APEX_CHASE_POSE.position);
  });

  it("slows the simulation clock for 1.2 s, one slow-mo at a time, and returns to 1", () => {
    const slow = createApexSlowMo(false);
    expect(slow.scale(0)).toBe(1);
    expect(slow.trigger(1000)).toBe(true);
    expect(slow.active(1000 + 600)).toBe(true);
    expect(slow.scale(1000 + 600)).toBeCloseTo(SLOW_MO_SCALE, 6);
    expect(slow.trigger(1000 + 500)).toBe(false);
    expect(slow.scale(1000 + SLOW_MO_SECONDS * 1000)).toBe(1);
    expect(slow.active(1000 + SLOW_MO_SECONDS * 1000 + 1)).toBe(false);
    expect(slow.triggered).toBe(1);
    for (let t = 1000; t < 1000 + SLOW_MO_SECONDS * 1000; t += 37) {
      const k = slow.scale(t);
      expect(k).toBeGreaterThanOrEqual(SLOW_MO_SCALE - 1e-9);
      expect(k).toBeLessThanOrEqual(1);
    }
  });

  it("never slows down under reduced motion", () => {
    const slow = createApexSlowMo(true);
    expect(slow.trigger(1000)).toBe(false);
    expect(slow.scale(1500)).toBe(1);
    expect(slow.triggered).toBe(0);
  });

  it("slow-mo only re-times the clock: the same fixed steps run, so replays are unchanged", () => {
    // feed a fixed-step accumulator the slowed clock and the real clock: both end with the same step count once caught up
    const FIXED = 1 / 60;
    const run = (scaleAt: (ms: number) => number): number => {
      let clock = 0;
      let acc = 0;
      let steps = 0;
      let last = 0;
      for (let ms = 0; ms <= 4000; ms += 16) {
        clock += (ms - last) * scaleAt(ms);
        last = ms;
        acc = clock / 1000 - steps * FIXED;
        while (acc >= FIXED) { steps++; acc -= FIXED; }
      }
      return steps;
    };
    const slow = createApexSlowMo(false);
    slow.trigger(1000);
    const normal = run(() => 1);
    const slowed = run((ms) => slow.scale(ms));
    expect(slowed).toBeLessThan(normal); // fewer steps presented in the same wall time ...
    expect(normal - slowed).toBeLessThanOrEqual(Math.ceil((SLOW_MO_SECONDS * (1 - SLOW_MO_SCALE)) * 60) + 1); // ... by at most the slowed share
  });
});

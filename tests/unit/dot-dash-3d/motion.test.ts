import { describe, expect, it } from "vitest";
import { BANK_MAX, REDUCED_AMPLITUDE, stepCourierPose, waveLevel, WAVE_SECONDS, YAW_MAX_STEP } from "../../../apps/showcase-dot-dash-3d/src/game/motion";

const deg = (r: number): number => (r * 180) / Math.PI;

/** DD47-AN1 courier bank and yaw easing, DD47-AN2 power-up wave; reduced-motion probe. */
describe("dot-dash-3d courier motion", () => {
  it("banks at least 8 degrees in a turn and never steps the yaw more than 45 degrees a frame", () => {
    let pose = { yaw: 0, roll: 0 };
    let maxRoll = 0;
    for (let f = 0; f < 60; f++) {
      const next = stepCourierPose(pose, Math.PI / 2, 1 / 60, false);
      expect(Math.abs(next.yaw - pose.yaw)).toBeLessThanOrEqual(YAW_MAX_STEP + 1e-9);
      maxRoll = Math.max(maxRoll, Math.abs(next.roll));
      pose = next;
    }
    expect(deg(maxRoll)).toBeGreaterThanOrEqual(8);
    expect(deg(maxRoll)).toBeLessThanOrEqual(deg(BANK_MAX) + 1e-9);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2, 2);
    expect(Math.abs(pose.roll)).toBeLessThan(0.01);
    // a long frame (tab hitch) still caps the step
    const hitch = stepCourierPose({ yaw: 0, roll: 0 }, Math.PI, 0.5, false);
    expect(Math.abs(hitch.yaw)).toBeLessThanOrEqual(YAW_MAX_STEP + 1e-9);
  });

  it("draws 30% of the bank on reduced motion", () => {
    const full = stepCourierPose({ yaw: 0, roll: 0 }, Math.PI / 2, 1 / 60, false);
    const calm = stepCourierPose({ yaw: 0, roll: 0 }, Math.PI / 2, 1 / 60, true);
    expect(calm.yaw).toBeCloseTo(full.yaw, 9);
    expect(calm.roll).toBeCloseTo(full.roll * REDUCED_AMPLITUDE, 9);
  });

  it("power-up wave lights the spawn half first and the whole board once done; uniform on reduced motion", () => {
    const max = 20;
    const t = 0.6 * WAVE_SECONDS / 1.2;
    expect(waveLevel(2, t, max, false)).toBeGreaterThanOrEqual(3 * Math.max(waveLevel(18, t, max, false), 0.01) - 1e-9);
    expect(waveLevel(18, WAVE_SECONDS + 0.2, max, false)).toBe(1);
    expect(waveLevel(2, t, max, true)).toBe(waveLevel(18, t, max, true));
  });
});

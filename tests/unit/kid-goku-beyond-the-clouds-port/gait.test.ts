import { describe, expect, it } from "vitest";
import { ANKLE_HEIGHT, GAIT_BONES, LEG_LENGTHS, LEG_REACH, advanceGaitPhase, gaitParams, gaitTouchdowns, gaitWeight, plantedGaitPose } from "../../../examples/kid-goku-beyond-the-clouds-port/gait";
import { legPositions, measure, newGaitStream } from "./footslide-fk";

/** Speeds the sim produces: ramp-up, brake (10.2), the 14.5 m/s base, boost (17.1) and boosted combo (19.6). */
const SPEEDS = [4.2, 6, 8, 10.2, 12, 14.5, 17.1, 19.6];
const LIBRARY_THRESHOLD = 0.15;

describe("Cumulus Dash planted-foot gait", () => {
  it("keeps the planted foot under the library foot-slide threshold at every sim speed, at 30, 60 and 120 Hz", () => {
    for (const hz of [30, 60, 120]) {
      for (const v of SPEEDS) {
        const m = measure(v, 6, newGaitStream(v), 1 / hz);
        expect(m.p95, `p95 at ${v} m/s, ${hz} Hz`).toBeLessThanOrEqual(LIBRARY_THRESHOLD);
        expect(m.passed, `meter passed at ${v} m/s, ${hz} Hz`).toBe(true);
      }
    }
  });

  it("really touches down: planted samples exist at every sim speed (a foot that never lands would pass the slide check trivially)", () => {
    for (const v of SPEEDS) {
      const m = measure(v, 6, newGaitStream(v));
      expect(m.left.plantedSamples, `left at ${v}`).toBeGreaterThanOrEqual(15);
      expect(m.right.plantedSamples, `right at ${v}`).toBeGreaterThanOrEqual(15);
      expect(m.left.liftRange).toBeGreaterThan(0.1);
    }
  });

  it("keeps the knees forward, the feet on the floor, the legs within reach and the knees bent anatomically", () => {
    for (const v of SPEEDS) {
      const m = measure(v, 4, newGaitStream(v));
      expect(m.forwardKnee, `knee forward at ${v}`).toBe(true);
      expect(m.lowestAnkle).toBeGreaterThanOrEqual(ANKLE_HEIGHT - 0.01);
      expect(m.minKneeBend).toBeGreaterThanOrEqual(20);
    }
  });

  it("holds each stance for at least two frames at 60 Hz while the speed allows it, and the hips stay at a plausible height", () => {
    for (const v of SPEEDS.filter((s) => s <= 17.1)) expect(gaitParams(v).stance).toBeGreaterThanOrEqual(2 / 60);
    for (const v of SPEEDS) {
      let phase = 0;
      for (let i = 0; i < 120; i++) {
        phase = advanceGaitPhase(phase, v, 1 / 60);
        const pose = plantedGaitPose(v, phase, 1)!;
        const p = legPositions(pose as never, { t: [0, 0, 0], r: [0, 0, 0, 1] });
        expect(p.left.hip[1]).toBeGreaterThan(0.4);
        expect(p.left.hip[1]).toBeLessThan(0.68);
      }
    }
  });

  it("uses each side's own bone lengths (the Meshy skeleton is not symmetric) and never asks a leg to overreach", () => {
    expect(LEG_LENGTHS.left.thigh).not.toBeCloseTo(LEG_LENGTHS.right.thigh, 3);
    expect(LEG_REACH).toBeCloseTo(Math.min(LEG_LENGTHS.left.thigh + LEG_LENGTHS.left.shin, LEG_LENGTHS.right.thigh + LEG_LENGTHS.right.shin), 9);
    for (const v of SPEEDS) {
      let phase = 0;
      for (let i = 0; i < 90; i++) {
        phase = advanceGaitPhase(phase, v, 1 / 60);
        const pose = plantedGaitPose(v, phase, 1)!;
        const p = legPositions(pose as never, { t: [0, 0, 0], r: [0, 0, 0, 1] });
        for (const side of ["left", "right"] as const) {
          const d = Math.hypot(p[side].ankle[0] - p[side].hip[0], p[side].ankle[1] - p[side].hip[1], p[side].ankle[2] - p[side].hip[2]);
          expect(d).toBeLessThanOrEqual(LEG_LENGTHS[side].thigh + LEG_LENGTHS[side].shin + 1e-6);
        }
      }
    }
  });

  it("blends in with ground speed: clip only below 2.2 m/s, fully planted from 4.2 m/s", () => {
    expect(gaitWeight(0)).toBe(0);
    expect(gaitWeight(2.2)).toBe(0);
    expect(gaitWeight(4.2)).toBe(1);
    expect(gaitWeight(14.5)).toBe(1);
    let last = 0;
    for (let v = 2.2; v <= 4.2; v += 0.1) { const w = gaitWeight(v); expect(w).toBeGreaterThanOrEqual(last); last = w; }
    expect(plantedGaitPose(3, 0.2, 0)).toBeUndefined();
  });

  it("writes the hips and both legs as unit-quaternion overlay bones", () => {
    const pose = plantedGaitPose(14.5, 0.37, 1)!;
    expect(pose.mode).toBe("overlay");
    expect(Object.keys(pose.bones).sort()).toEqual([...GAIT_BONES].sort());
    expect(pose.bones.Hips!.position).toBeDefined();
    for (const t of Object.values(pose.bones)) expect(Math.hypot(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)).toBeCloseTo(1, 6);
  });

  it("raises cadence and lean with speed and counts one touchdown per foot per cycle", () => {
    expect(gaitParams(14.5).cadence).toBeGreaterThan(gaitParams(6).cadence);
    expect(gaitParams(14.5).lean).toBeGreaterThan(gaitParams(6).lean);
    let phase = 0, left = 0, right = 0;
    for (let i = 0; i < 600; i++) { const next = advanceGaitPhase(phase, 14.5, 1 / 60); const td = gaitTouchdowns(phase, next); left += td.left; right += td.right; phase = next; }
    const cycles = Math.floor(phase);
    expect(left).toBe(cycles);
    expect(Math.abs(right - cycles)).toBeLessThanOrEqual(1);
  });
});

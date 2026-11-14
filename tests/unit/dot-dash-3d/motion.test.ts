import { describe, expect, it } from "vitest";
import { BANK_MAX, localPoseToEulerZYX, REDUCED_AMPLITUDE, stepCourierPose, waveLevel, WAVE_SECONDS, YAW_MAX_STEP } from "../../../apps/showcase-dot-dash-3d/src/game/motion";

const deg = (r: number): number => (r * 180) / Math.PI;

function applyEulerZYX([ex, ey, ez]: readonly [number, number, number], [vx, vy, vz]: readonly [number, number, number]): [number, number, number] {
  const cx = Math.cos(ex), sx = Math.sin(ex);
  const cy = Math.cos(ey), sy = Math.sin(ey);
  const cz = Math.cos(ez), sz = Math.sin(ez);
  // Rx(ex)
  const y1 = vy * cx - vz * sx;
  const z1 = vy * sx + vz * cx;
  // Ry(ey)
  const x2 = vx * cy + z1 * sy;
  const z2 = -vx * sy + z1 * cy;
  // Rz(ez)
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
}

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

  it("composes local pitch & bank before compass yaw in ZYX order without gimbal flips across 90-degree corridor turns", () => {
    for (const yaw of [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5, 0.73, -2.41]) {
      for (const roll of [-BANK_MAX, 0, BANK_MAX]) {
        for (const pitch of [-0.05, 0, 0.05]) {
          const e = localPoseToEulerZYX(pitch, yaw, roll);
          const up = applyEulerZYX(e, [0, 1, 0]);
          const fwd = applyEulerZYX(e, [0, 0, 1]);
          expect(up[1]).toBeGreaterThan(0.95);
          // Forward horizontal projection stays aligned with compass heading (sin(yaw), cos(yaw))
          expect(fwd[0]).toBeCloseTo(Math.sin(yaw) * Math.cos(pitch) + Math.cos(yaw) * Math.sin(roll) * Math.sin(pitch), 5);
          expect(fwd[2]).toBeCloseTo(Math.cos(yaw) * Math.cos(pitch) - Math.sin(yaw) * Math.sin(roll) * Math.sin(pitch), 5);
        }
      }
    }
  });
});

import { cinematicsAllowed, clearOrbitShot, introShots } from "../../../apps/showcase-dot-dash-3d/src/game/motion";

describe("dot-dash-3d camera sequences (DD47-C1)", () => {
  const rig = { position: [0, 17.2, 13.8] as const, target: [0, 0, 0] as const };
  it("intro lands on the play rig and the clear orbit keeps its height and distance over 2 s", () => {
    const shots = introShots([0, 0, 5], rig);
    expect(shots).toHaveLength(2);
    expect(shots.reduce((t, s) => t + s.duration, 0)).toBeLessThanOrEqual(1.5);
    expect(shots[1]!.points.at(-1)).toEqual([0, 17.2, 13.8]);
    const orbit = clearOrbitShot(rig);
    expect(orbit.duration).toBe(2);
    for (const p of orbit.points) expect(Math.hypot(p[0], p[2])).toBeCloseTo(13.8, 6);
  });
  it("skips sequences on reduced motion and on captures", () => {
    expect(cinematicsAllowed(false, "?maze=spiral", false)).toBe(true);
    expect(cinematicsAllowed(true, "", false)).toBe(false);
    expect(cinematicsAllowed(false, "", true)).toBe(false);
    expect(cinematicsAllowed(false, "?freeze=4000", false)).toBe(false);
    expect(cinematicsAllowed(false, "?autoplay=1", false)).toBe(false);
  });
});

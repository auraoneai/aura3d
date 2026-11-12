import { describe, expect, it } from "vitest";
import { CLIP_SECONDS } from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";
import { computeFootballerJointPose, type FootballerJointPose } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";

const KICKS = ["KickTap", "KickPass", "KickShot"] as const;

/** Forward kinematics for the footballer's legs in model space (`+Y` up, `+Z` forward). */
function sampleFootKinematics(pose: FootballerJointPose) {
  const hipY = pose.pelvisOffsetY - 0.02;
  const hipZ = pose.pelvisOffsetZ;
  const fk = (hipRx: number, kneeRx: number, bootRx: number, x: number) => {
    const a1 = hipRx;
    const kneeY = hipY - 0.43 * Math.cos(a1);
    const kneeZ = hipZ - 0.43 * Math.sin(a1);
    const a2 = hipRx + kneeRx;
    const ankleY = kneeY - 0.41 * Math.cos(a2);
    const ankleZ = kneeZ - 0.41 * Math.sin(a2);
    const a3 = a2 + bootRx;
    // Toe tip at `[0, -0.075, +0.188]` in boot local space
    const dy = -0.075 * Math.cos(a3) - 0.188 * Math.sin(a3);
    const dz = -0.075 * Math.sin(a3) + 0.188 * Math.cos(a3);
    return {
      ankle: [x, ankleY, ankleZ] as [number, number, number],
      toe: [x, ankleY + dy, ankleZ + dz] as [number, number, number]
    };
  };
  return {
    left: fk(pose.legL[0], pose.calfL[0], pose.bootL[0], 0.102),
    right: fk(pose.legR[0], pose.calfR[0], pose.bootR[0], -0.102)
  };
}

describe.each([
  ["striker", false],
  ["keeper", true]
] as const)("%s procedural kick kinematics", (_label, isKeeper) => {
  for (const clip of KICKS) {
    it(`${clip}: whips the striking boot forward along the +Z kick line through contact and follow-through`, () => {
      const dur = CLIP_SECONDS[clip]!;
      expect(dur).toBeCloseTo(0.6, 3);
      const n = 36;
      const dt = dur / n;
      const frames = Array.from({ length: n + 1 }, (_, k) =>
        sampleFootKinematics(computeFootballerJointPose({ clip, phase: (dur * k) / n, duration: dur, isKeeper }))
      );
      const contactIdx = Math.round(0.56 * n);
      const a = frames[contactIdx - 1]!.right.toe;
      const b = frames[contactIdx + 1]!.right.toe;
      const v = [(b[0] - a[0]) / (2 * dt), (b[1] - a[1]) / (2 * dt), (b[2] - a[2]) / (2 * dt)];
      const yawDeg = Math.abs((Math.atan2(v[0], v[2]) * 180) / Math.PI);
      expect(yawDeg).toBeLessThan(5);
      expect(v[2]).toBeGreaterThan(2.5);
    });

    it(`${clip}: standing foot stays planted, ankles stay above the turf, and backswing precedes the strike`, () => {
      const dur = CLIP_SECONDS[clip]!;
      const n = 36;
      const frames = Array.from({ length: n + 1 }, (_, k) =>
        sampleFootKinematics(computeFootballerJointPose({ clip, phase: (dur * k) / n, duration: dur, isKeeper }))
      );
      const left0 = frames[0]!.left.ankle;
      let drift = 0;
      let minAnkle = 9;
      for (const f of frames) {
        const l = f.left.ankle;
        const r = f.right.ankle;
        drift = Math.max(drift, Math.hypot(l[0] - left0[0], l[1] - left0[1], l[2] - left0[2]));
        minAnkle = Math.min(minAnkle, l[1], r[1]);
      }
      expect(drift).toBeLessThan(0.005);
      expect(minAnkle).toBeGreaterThan(0.08);
      const z = frames.map((f) => f.right.ankle[2]);
      const kc = Math.round(0.58 * n);
      expect(Math.min(...z.slice(0, kc))).toBeLessThan(-0.2);
      expect(z[kc]!).toBeGreaterThan(Math.min(...z) + 0.25);
      expect(z.at(-1)!).toBeGreaterThan(z[kc]!);
    });
  }

  it("poses are purely stateless (identical phase produces identical joint Euler angles regardless of call order)", () => {
    const a = computeFootballerJointPose({ clip: "KickShot", phase: 0.33, duration: 0.6, isKeeper });
    computeFootballerJointPose({ clip: "Sprint_Loop", phase: 0.21, duration: 0.48, isKeeper });
    const b = computeFootballerJointPose({ clip: "KickShot", phase: 0.33, duration: 0.6, isKeeper });
    expect(b).toEqual(a);
  });
});

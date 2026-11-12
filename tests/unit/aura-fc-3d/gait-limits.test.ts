import { describe, expect, it } from "vitest";
import { CLIP_SECONDS } from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";
import { computeFootballerJointPose } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";

const RAD2DEG = 180 / Math.PI;

function sampleJointLimits(isKeeper: boolean, clip: string) {
  const dur = CLIP_SECONDS[clip] ?? 0.6;
  let hipFlexMin = Infinity;
  let hipFlexMax = -Infinity;
  let kneeMax = 0;
  let kneeForwardFrames = 0;
  let twistMax = 0;
  let abdMax = 0;

  for (let i = 0; i <= 60; i += 1) {
    const phase = (dur * i) / 60;
    const p = computeFootballerJointPose({ clip, phase, duration: dur, isKeeper });
    for (const leg of [p.legL, p.legR]) {
      // Forward swing (`-rx`) is positive hip flexion; backward extension (`+rx`) is negative hip flexion
      const flexDeg = -leg[0] * RAD2DEG;
      hipFlexMin = Math.min(hipFlexMin, flexDeg);
      hipFlexMax = Math.max(hipFlexMax, flexDeg);
      twistMax = Math.max(twistMax, Math.abs(leg[1] * RAD2DEG), Math.abs(p.pelvis[1] * RAD2DEG));
      abdMax = Math.max(abdMax, Math.abs(leg[2] * RAD2DEG));
    }
    for (const calf of [p.calfL, p.calfR]) {
      const kneeDeg = calf[0] * RAD2DEG;
      if (kneeDeg < -1e-4) kneeForwardFrames += 1;
      kneeMax = Math.max(kneeMax, kneeDeg);
    }
  }
  return { hipFlexMin, hipFlexMax, kneeMax, kneeForwardFrames, twistMax, abdMax };
}

describe.each([
  ["striker", false],
  ["goalkeeper", true]
] as const)("%s procedural articulated run & kick cycles stay inside human joint ranges", (_role, isKeeper) => {
  it.each([
    ["Walk_Loop", 35, 45],
    ["Run", 45, 55],
    ["Sprint_Loop", 60, 60]
  ] as const)("%s: hip swing, knee bend, twist", (clip, back, front) => {
    const c = sampleJointLimits(isKeeper, clip);
    expect(c.hipFlexMin).toBeGreaterThanOrEqual(-back);
    expect(c.hipFlexMax).toBeLessThanOrEqual(front);
    expect(c.kneeMax).toBeLessThanOrEqual(110);
    expect(c.kneeForwardFrames).toBe(0);
    expect(c.twistMax).toBeLessThanOrEqual(8);
    expect(c.abdMax).toBeLessThanOrEqual(10);
  });

  it("kick clips bend the knee backward only and stay under 110 degrees", () => {
    for (const clip of ["KickTap", "KickPass", "KickShot"] as const) {
      const c = sampleJointLimits(isKeeper, clip);
      expect(c.kneeMax).toBeLessThanOrEqual(110);
      expect(c.kneeForwardFrames).toBe(0);
    }
  });
});

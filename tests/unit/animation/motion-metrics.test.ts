import { describe, expect, it } from "vitest";
import {
  footSlide,
  isHumanoidMotionBone,
  locomotionPhaseError,
  motionSampleFromMatrix,
  quatAngleDegrees,
  transitionContinuity,
  type MotionFrame,
  type MotionQuat
} from "../../../packages/animation/src/lanes/prd06";

const HZ = 60;

function quatAxisAngle(axis: [number, number, number], deg: number): MotionQuat {
  const half = (deg * Math.PI) / 360;
  const s = Math.sin(half);
  const [x, y, z] = axis;
  const len = Math.hypot(x, y, z) || 1;
  return [(x / len) * s, (y / len) * s, (z / len) * s, Math.cos(half)];
}

function quatMul(a: MotionQuat, b: MotionQuat): MotionQuat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

/** Rotating limb + planted feet + calm spine — a plausible humanoid frame. */
function frame(t: number, armDeg: number, foot: [number, number, number]): MotionFrame {
  return {
    time: t,
    bones: {
      mixamorigSpine: { rotation: quatAxisAngle([0, 0, 1], 2 * Math.sin(t)), position: [0, 1.0, 0] },
      mixamorigLeftArm: { rotation: quatAxisAngle([1, 0, 0], armDeg), position: [-0.2, 1.4, 0] },
      mixamorigRightArm: { rotation: quatAxisAngle([1, 0, 0], -armDeg), position: [0.2, 1.4, 0] },
      mixamorigLeftFoot: { rotation: quatAxisAngle([0, 1, 0], 0), position: foot },
      mixamorigLeftFootMiddleFinger1: { rotation: quatAxisAngle([0, 0, 1], 180), position: foot } // finger noise — must be ignored
    }
  };
}

/** n frames at 60 Hz where the arm eases through `degPerSec`. */
function armSwingSeries(n: number, degPerSec: number, foot: [number, number, number] = [-0.2, 0, 0.3]): MotionFrame[] {
  const out: MotionFrame[] = [];
  for (let i = 0; i < n; i += 1) out.push(frame(i / HZ, degPerSec * i * (1 / HZ), foot));
  return out;
}

describe("MotionMetrics (T1.14, §17.3)", () => {
  it("motionSampleFromMatrix decomposes rotation and translation", () => {
    // Rotation 90° about Y (cos θ=0, sin θ=1), translation (1, 2, 3).
    const m = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 2, 3, 1];
    const s = motionSampleFromMatrix(m);
    expect(s.position).toEqual([1, 2, 3]);
    const angle = quatAngleDegrees(s.rotation, [0, 0, 0, 1]);
    expect(angle).toBeCloseTo(90, 3);
  });

  it("isHumanoidMotionBone keeps limbs/spine and drops fingers/toes", () => {
    expect(isHumanoidMotionBone("mixamorigLeftArm")).toBe(true);
    expect(isHumanoidMotionBone("Spine2")).toBe(true);
    expect(isHumanoidMotionBone("mixamorigLeftFootMiddleFinger1")).toBe(false);
    expect(isHumanoidMotionBone("LeftToe_End")).toBe(false);
    expect(isHumanoidMotionBone("WeaponProp")).toBe(false);
  });

  it("transitionContinuity: a smooth blend passes C ≤ 1.5", () => {
    // Idle→walk: baseline windows either side of t0 = 0.5 hold gentle motion.
    const frames = armSwingSeries(240, 45); // 0–4 s, arm at 45°/s everywhere
    const result = transitionContinuity(frames, {
      transitionTime: 0.5,
      baselineWindows: [[0, 0.4], [0.9, 4]]
    });
    expect(result.maxAngularSpeedDegPerSec).toBeCloseTo(45, 0);
    // baseline is max(45, 90 floor) = 90 → C = 0.5
    expect(result.continuity).toBeLessThanOrEqual(1.5);
  });

  it("transitionContinuity failing control: a snapped transition fails C ≤ 1.5", () => {
    const frames = armSwingSeries(120, 0); // static pose
    // Snap the arm 160° at t0 = 0.5 over a single frame (§17.3's known-bad);
    // >180° would wrap to the shortest arc, so stay at 160°.
    for (let i = 0; i < frames.length; i += 1) {
      if (frames[i]!.time >= 0.5) {
        const arm = frames[i]!.bones.mixamorigLeftArm!;
        frames[i] = {
          ...frames[i]!,
          bones: {
            ...frames[i]!.bones,
            mixamorigLeftArm: { ...arm, rotation: quatMul(quatAxisAngle([0, 0, 1], 160), arm.rotation) }
          }
        };
      }
    }
    const result = transitionContinuity(frames, {
      transitionTime: 0.5,
      baselineWindows: [[0, 0.4]]
    });
    expect(result.maxAngularSpeedDegPerSec).toBeGreaterThan(9000); // ~160° in 1/60 s
    expect(result.continuity).toBeGreaterThan(1.5);
  });

  it("footSlide: a planted walk contact phase stays under 2 cm", () => {
    // Foot planted at ground level for 0.5 s with 5 mm drift.
    const frames: MotionFrame[] = [];
    for (let i = 0; i < 30; i += 1) {
      frames.push(frame(i / HZ, 10, [-0.2 + 0.005 * Math.sin(i / 6), 0.01, 0.3]));
    }
    const result = footSlide(frames, { footBones: ["mixamorigLeftFoot"] });
    expect(result.phases.length).toBe(1);
    expect(result.maxSlideM).toBeLessThanOrEqual(0.02);
  });

  it("footSlide failing control: a root-translated in-place walk fails", () => {
    // Contact flag set (foot low + slow) while the foot slides 6 cm — the
    // classic skate. Height 0.01 < 3 cm, horizontal speed ramps in below 0.1 m/s
    // so the inferred contact flag stays set while it slides.
    const frames: MotionFrame[] = [];
    for (let i = 0; i < 60; i += 1) {
      const x = -0.2 + 0.06 * (i / 59);
      frames.push(frame(i / HZ, 10, [x, 0.01, 0.3]));
    }
    const result = footSlide(frames, { footBones: ["mixamorigLeftFoot"] });
    // 0.06 m over 59 frames ≈ 0.061 m/s < 0.1 — contact stays latched; slide ≈ 6 cm.
    expect(result.maxSlideM).toBeGreaterThan(0.02);
    expect(result.maxSlideM).toBeGreaterThan(0.05);
  });

  it("footSlide: explicit contact windows honour clip footstep events", () => {
    const frames: MotionFrame[] = [];
    for (let i = 0; i < 60; i += 1) {
      frames.push(frame(i / HZ, 10, [-0.2, 0.4 + i * 0.01, 0.3])); // foot airborne + moving up
    }
    // Without events the foot is never inferred as in contact (height > 3 cm).
    const inferred = footSlide(frames, { footBones: ["mixamorigLeftFoot"] });
    expect(inferred.phases.length).toBe(0);
    // With a clip footstep event the whole window counts as contact: slide is
    // measured on XZ only, so a vertical rise contributes 0.
    const explicit = footSlide(frames, {
      footBones: ["mixamorigLeftFoot"],
      contactWindows: { mixamorigLeftFoot: [[0, 1]] }
    });
    expect(explicit.phases.length).toBe(1);
    expect(explicit.maxSlideM).toBe(0);
  });

  it("locomotionPhaseError: synced walk/run pass the ≤ 1% bar", () => {
    const samples = [];
    for (let i = 0; i < 120; i += 1) {
      const phase = (i / 120) % 1;
      samples.push({
        time: i / HZ,
        a: { phase, weight: 0.5 },
        b: { phase: phase + 0.005, weight: 0.4 }
      });
    }
    const result = locomotionPhaseError(samples);
    expect(result.comparedFrames).toBe(120);
    expect(result.maxPhaseError).toBeLessThanOrEqual(0.01);
  });

  it("locomotionPhaseError skips frames where an action is faded out", () => {
    const samples = [
      { time: 0, a: { phase: 0.5, weight: 0.01 }, b: { phase: 0.9, weight: 1 } }, // skipped
      { time: 1 / HZ, a: { phase: 0.5, weight: 0.2 }, b: { phase: 0.5, weight: 0.2 } }
    ];
    const result = locomotionPhaseError(samples);
    expect(result.comparedFrames).toBe(1);
    expect(result.maxPhaseError).toBe(0);
  });

  it("locomotionPhaseError failing control: half-cycle offset fails the bar", () => {
    const samples = [{ time: 0, a: { phase: 0.25, weight: 0.6 }, b: { phase: 0.75, weight: 0.6 } }];
    const result = locomotionPhaseError(samples);
    expect(result.maxPhaseError).toBeGreaterThan(0.01);
    expect(result.maxPhaseError).toBeCloseTo(0.5, 6);
  });
});

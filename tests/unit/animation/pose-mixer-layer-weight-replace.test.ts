import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { bindSkeleton, compileClip, createBoneMask, PoseMixer } from "@aura3d/animation/lanes";
import { createPoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

/**
 * anim-phys-02: `playLayer` applied `weight` twice (layer and action), so weight 0.5 gave a
 * quarter of the clip. anim-phys-03: a second `playLayer` on the same layer kept the first mask
 * and kept the first clip playing underneath.
 */
const JOINTS = ["Hips", "Spine", "Head"] as const;
const WAVE_HALF_ANGLE = 0.4; // quaternion half-angle: a 0.8 rad rotation about X

function rotationClip(name: string, halfAngle: number): AnimationClip {
  const q: [number, number, number, number] = [Math.sin(halfAngle), 0, 0, Math.cos(halfAngle)];
  const track = (bone: string) =>
    new AnimationTrack<[number, number, number, number]>({
      target: `${bone}.rotation`,
      valueType: "quaternion",
      keyframes: [{ time: 0, value: q }, { time: 2, value: q }]
    });
  return new AnimationClip({ name, duration: 2, tracks: [track("Hips"), track("Spine"), track("Head")] });
}

function setup() {
  const skeleton = bindSkeleton({
    joints: [0, 1, 2],
    jointNames: [...JOINTS],
    parentIndices: [-1, 0, 1],
    resolveNode: (index) => ({ name: JOINTS[index]!, position: [0, index, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })
  });
  const mixer = new PoseMixer({ skeleton });
  for (const clip of [rotationClip("Idle", 0), rotationClip("Wave", WAVE_HALF_ANGLE), rotationClip("Nod", -WAVE_HALF_ANGLE)]) {
    mixer.addCompiledClip(clip.name, compileClip(clip), clip);
  }
  return { skeleton, mixer };
}

/** Signed X rotation angle (radians) of a bone in the pose. */
const xAngle = (rotations: ArrayLike<number>, bone: number): number =>
  2 * Math.atan2(rotations[bone * 4]!, rotations[bone * 4 + 3]!);

const evaluate = (mixer: PoseMixer, boneCount: number) => {
  const pose = createPoseBuffer(boneCount);
  mixer.evaluate(pose);
  return pose;
};

describe("PoseMixer playLayer weight and replacement", () => {
  it("applies weight once: half weight gives half the clip's rotation", () => {
    const { skeleton, mixer } = setup();
    mixer.crossFadeTo("Idle", 0);
    const mask = createBoneMask({ include: ["Head"] }, { jointNames: skeleton.jointNames });
    const action = mixer.playLayer("upper", "Wave", { weight: 0.5, mask });
    mixer.update(0.1);
    const pose = evaluate(mixer, skeleton.boneCount);
    expect(xAngle(pose.rotations, 2)).toBeCloseTo(0.4, 4); // half of 0.8 rad (was 0.2)
    expect(action.effectiveWeight).toBeCloseTo(0.5, 6);
  });

  it("a second playLayer on the same layer uses the new mask and replaces the old clip", () => {
    const { skeleton, mixer } = setup();
    mixer.crossFadeTo("Idle", 0);
    const head = createBoneMask({ include: ["Head"] }, { jointNames: skeleton.jointNames });
    const spine = createBoneMask({ include: ["Spine"] }, { jointNames: skeleton.jointNames });
    mixer.playLayer("upper", "Wave", { weight: 1, mask: head });
    mixer.update(0.1);
    mixer.playLayer("upper", "Nod", { weight: 1, mask: spine });
    mixer.update(0.1);
    const pose = evaluate(mixer, skeleton.boneCount);
    expect(xAngle(pose.rotations, 2)).toBeCloseTo(0, 4); // Head back on the base (was -0.8 via the old mask)
    expect(xAngle(pose.rotations, 1)).toBeCloseTo(-0.8, 4); // Spine follows the new clip (was 0)
    expect(xAngle(pose.rotations, 0)).toBeCloseTo(0, 4);
    const layerClips = mixer.activeActionEntries().filter((entry) => entry.layer === "upper").map((entry) => entry.action.clipName);
    expect(layerClips).toEqual(["Nod"]);
  });

  it("fadeOutPrevious fades the replaced clip through its own mask", () => {
    const { skeleton, mixer } = setup();
    mixer.crossFadeTo("Idle", 0);
    const head = createBoneMask({ include: ["Head"] }, { jointNames: skeleton.jointNames });
    const spine = createBoneMask({ include: ["Spine"] }, { jointNames: skeleton.jointNames });
    mixer.playLayer("upper", "Wave", { weight: 1, mask: head });
    mixer.update(0.1);
    mixer.playLayer("upper", "Nod", { weight: 1, mask: spine, fadeOutPrevious: 1 }).fadeIn(1);
    mixer.update(0.5);
    const mid = evaluate(mixer, skeleton.boneCount);
    expect(xAngle(mid.rotations, 2)).toBeGreaterThan(0.1); // Wave still fading on Head only
    expect(xAngle(mid.rotations, 2)).toBeLessThan(0.7);
    expect(xAngle(mid.rotations, 1)).toBeLessThan(-0.1); // Nod fading in on Spine only
    mixer.update(1);
    mixer.update(0.1);
    const done = evaluate(mixer, skeleton.boneCount);
    expect(xAngle(done.rotations, 2)).toBeCloseTo(0, 4);
    expect(xAngle(done.rotations, 1)).toBeCloseTo(-0.8, 4);
    expect(mixer.activeActionEntries().filter((entry) => entry.layer === "upper").map((entry) => entry.action.clipName)).toEqual(["Nod"]);
  });

  it("replaced clips do not pile up on the layer", () => {
    const { skeleton, mixer } = setup();
    const head = createBoneMask({ include: ["Head"] }, { jointNames: skeleton.jointNames });
    for (let i = 0; i < 20; i += 1) {
      mixer.playLayer("upper", i % 2 === 0 ? "Wave" : "Nod", { mask: head });
      mixer.update(0.05);
    }
    expect(mixer.activeActionEntries().filter((entry) => entry.layer === "upper")).toHaveLength(1);
  });
});

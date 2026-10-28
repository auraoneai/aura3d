import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { bindSkeleton, compileClip, createBoneMask, PoseMixer } from "@aura3d/animation/lanes";
import { createPoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

const JOINTS = ["Hips", "Spine", "Head"] as const;
const HALF_ANGLE = 0.25; // quarter-turn-ish quaternion: sin/cos of 0.25 rad about X

function rotationClip(name: string, angle: number): AnimationClip {
  const q: [number, number, number, number] = [Math.sin(angle), 0, 0, Math.cos(angle)];
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
  for (const clip of [rotationClip("Idle", 0), rotationClip("Wave", HALF_ANGLE)]) {
    mixer.addCompiledClip(clip.name, compileClip(clip), clip);
  }
  return { skeleton, mixer };
}

const xRotation = (rotations: ArrayLike<number>, bone: number): number => rotations[bone * 4]!;

describe("PoseMixer layers", () => {
  it("evaluate a layer clip only through its mask, never as a second base action", () => {
    const { skeleton, mixer } = setup();
    mixer.crossFadeTo("Idle", 0);
    const mask = createBoneMask({ include: ["Head"] }, { jointNames: skeleton.jointNames });
    mixer.playLayer("upper", "Wave", { weight: 1, mask });
    mixer.update(0.1);
    const pose = createPoseBuffer(skeleton.boneCount);
    mixer.evaluate(pose);

    // Head follows the layer; Hips and Spine stay on the Idle base.
    expect(xRotation(pose.rotations, 2)).toBeCloseTo(Math.sin(HALF_ANGLE), 4);
    expect(xRotation(pose.rotations, 0)).toBeCloseTo(0, 4);
    expect(xRotation(pose.rotations, 1)).toBeCloseTo(0, 4);

    // The layer clip is listed once, under its layer, and the base holds only Idle.
    const entries = mixer.activeActionEntries();
    expect(entries.filter((entry) => entry.action.clipName === "Wave")).toEqual([expect.objectContaining({ layer: "upper" })]);
    expect(entries.filter((entry) => entry.layer === "").map((entry) => entry.action.clipName)).toEqual(["Idle"]);
  });

  it("stopLayer returns the masked bones to the base pose", () => {
    const { skeleton, mixer } = setup();
    mixer.crossFadeTo("Idle", 0);
    const mask = createBoneMask({ include: ["Head"] }, { jointNames: skeleton.jointNames });
    mixer.playLayer("upper", "Wave", { weight: 1, mask });
    mixer.update(0.1);
    mixer.stopLayer("upper", 0);
    mixer.update(0.1);
    const pose = createPoseBuffer(skeleton.boneCount);
    mixer.evaluate(pose);
    expect(xRotation(pose.rotations, 2)).toBeCloseTo(0, 4);
    expect(mixer.activeActionEntries().map((entry) => entry.action.clipName)).toEqual(["Idle"]);
  });
});

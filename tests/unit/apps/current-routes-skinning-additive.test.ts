import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "../../../packages/animation/src";
import {
  createAdditiveLayerController,
  createMaskedAdditiveClips
} from "../../../apps/skinning-additive/src/additiveLayers";

describe("CurrentRoutes skinning additive layer masks", () => {
  it("keeps upper-body, right-arm, and expression masks scoped to their intended tracks", () => {
    const clips = [
      clip("Walking", ["Root.translation", "Body.rotation", "UpperArm.R.rotation", "UpperArm.L.rotation", "Head.rotation"]),
      clip("Wave", ["Root.translation", "Body.rotation", "Shoulder.R.rotation", "UpperArm.R.rotation", "LowerArm.R.rotation", "Head.rotation", "Leg.L.rotation"])
    ];

    const masked = createMaskedAdditiveClips(clips);
    const upper = masked.find((item) => item.name === "Wave [upper body]");
    const rightArm = masked.find((item) => item.name === "Wave [right arm]");
    const expression = masked.find((item) => item.name === "Wave [expression]");

    expect(upper?.tracks.map((track) => track.target).sort()).toEqual([
      "Head.rotation",
      "LowerArm.R.rotation",
      "Shoulder.R.rotation",
      "UpperArm.R.rotation"
    ]);
    expect(rightArm?.tracks.map((track) => track.target).sort()).toEqual([
      "LowerArm.R.rotation",
      "Shoulder.R.rotation",
      "UpperArm.R.rotation"
    ]);
    expect(expression?.tracks.map((track) => track.target)).toEqual(["Head.rotation"]);
    expect(masked.flatMap((item) => item.tracks.map((track) => track.target))).not.toContain("Leg.L.rotation");
  });

  it("reports masked sample count and falls back to known clips only", () => {
    const clips = [
      clip("Walking", ["Body.rotation"]),
      clip("Wave", ["UpperArm.R.rotation", "Head.rotation"])
    ];
    const controller = createAdditiveLayerController(clips);

    const selection = controller.resolve({
      playing: true,
      speed: 1,
      orbitYaw: 0,
      baseClip: "Unknown",
      additiveClip: "Unknown",
      maskName: "right arm",
      layerWeight: 0.5
    });

    expect(selection).toMatchObject({
      baseClipName: "Walking",
      additiveClipName: "Wave",
      maskedClipName: "Wave [right arm]",
      maskName: "right arm",
      maskedTrackCount: 1,
      sampleCount: 2
    });
  });
});

function clip(name: string, targets: readonly string[]): AnimationClip {
  return new AnimationClip({
    name,
    duration: 1,
    tracks: targets.map((target) => new AnimationTrack({
      target,
      valueType: "quaternion",
      keyframes: [
        { time: 0, value: [0, 0, 0, 1], interpolation: "linear" },
        { time: 1, value: [0, 0.1, 0, 0.995], interpolation: "linear" }
      ]
    }))
  });
}

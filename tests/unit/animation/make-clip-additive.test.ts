import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack.js";
import { makeClipAdditive } from "../../../packages/animation/src/pose/makeClipAdditive.js";
import type { Quat, Vec3 } from "../../../packages/animation/src/Keyframe.js";

const TIMES = [0, 0.5, 1.0, 1.7];
const QUATS: Quat[] = [
  [0, 0, 0, 1],
  [0, Math.sin(0.2), 0, Math.cos(0.2)],
  [Math.sin(0.35), 0, 0, Math.cos(0.35)],
  [0, 0, Math.sin(0.5), Math.cos(0.5)]
];
const VECS: Vec3[] = [
  [0, 0, 0],
  [0.5, 1.0, -0.25],
  [1.2, 0.4, 0.9],
  [-0.3, 2.0, 0.1]
];
const SCALES: Vec3[] = [
  [1, 1, 1],
  [1.1, 0.9, 1.0],
  [0.8, 1.2, 1.4],
  [1.0, 1.0, 0.7]
];
const WEIGHTS = [0, 0.4, 1.0, 0.2];

function auraClip(): AnimationClip {
  return new AnimationClip({
    name: "test",
    tracks: [
      new AnimationTrack<Quat>({
        target: "boneA.rotation",
        valueType: "quaternion",
        keyframes: TIMES.map((time, i) => ({ time, value: QUATS[i]! }))
      }),
      new AnimationTrack<Vec3>({
        target: "boneA.translation",
        valueType: "vector3",
        keyframes: TIMES.map((time, i) => ({ time, value: VECS[i]! }))
      }),
      new AnimationTrack<Vec3>({
        target: "boneA.scale",
        valueType: "vector3",
        keyframes: TIMES.map((time, i) => ({ time, value: SCALES[i]! }))
      }),
      new AnimationTrack<number>({
        target: "mesh.weights",
        valueType: "scalar",
        keyframes: TIMES.map((time, i) => ({ time, value: WEIGHTS[i]! }))
      })
    ]
  });
}

function threeClip() {
  return import("three").then((THREE) => new THREE.AnimationClip("test", -1, [
    new THREE.QuaternionKeyframeTrack("boneA.quaternion", TIMES, QUATS.flat()),
    new THREE.VectorKeyframeTrack("boneA.position", TIMES, VECS.flat()),
    new THREE.VectorKeyframeTrack("boneA.scale", TIMES, SCALES.flat()),
    new THREE.NumberKeyframeTrack("mesh.morphTargetInfluences[w]", TIMES, WEIGHTS)
  ]));
}

describe("makeClipAdditive (PRD-06 T1.4)", () => {
  it("matches three r185 AnimationUtils.makeClipAdditive within 1e-5", async () => {
    const THREE = await import("three");
    const referenceFrame = 0;
    const aura = makeClipAdditive(auraClip(), referenceFrame);
    const three = THREE.AnimationUtils.makeClipAdditive(await threeClip(), referenceFrame, await threeClip());

    const byTarget = new Map(aura.tracks.map((track) => [track.target, track]));
    const threeByName = new Map(three.tracks.map((track) => [track.name, track]));

    const quatThree = threeByName.get("boneA.quaternion")!;
    const quatAura = byTarget.get("boneA.rotation")!;
    quatAura.keyframes.forEach((keyframe, index) => {
      for (let axis = 0; axis < 4; axis += 1) {
        expect((keyframe.value as Quat)[axis], `quat[${index}][${axis}]`)
          .toBeCloseTo(quatThree.values[index * 4 + axis]!, 5);
      }
    });

    const posThree = threeByName.get("boneA.position")!;
    const posAura = byTarget.get("boneA.translation")!;
    posAura.keyframes.forEach((keyframe, index) => {
      for (let axis = 0; axis < 3; axis += 1) {
        expect((keyframe.value as Vec3)[axis], `pos[${index}][${axis}]`)
          .toBeCloseTo(posThree.values[index * 3 + axis]!, 5);
      }
    });

    // Scale tracks subtract like translations in three r185 (§6.4) — not
    // multiplicative.
    const scaleThree = threeByName.get("boneA.scale")!;
    const scaleAura = byTarget.get("boneA.scale")!;
    scaleAura.keyframes.forEach((keyframe, index) => {
      for (let axis = 0; axis < 3; axis += 1) {
        expect((keyframe.value as Vec3)[axis], `scale[${index}][${axis}]`)
          .toBeCloseTo(scaleThree.values[index * 3 + axis]!, 5);
      }
    });
  });

  it("subtracts an explicit {clip, time} reference", () => {
    const clip = auraClip();
    const additive = makeClipAdditive(clip, { clip, time: 1.0 });
    // Rotation at t=1.0 is the reference → delta must be identity.
    const quat = additive.tracks[0]!.keyframes[2]!.value as Quat;
    expect(Math.abs(quat[3])).toBeCloseTo(1, 5);
  });
});

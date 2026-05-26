import { describe, expect, it } from "vitest";
import {
  AnimationClipCompat,
  AnimationMixerCompat,
  MorphTargetMixerCompat,
  SkeletonCompat,
  SkinnedMeshCompat
} from "../../../packages/three-compat/src";
import { LocomotionController, createRootMotionWalkClip, createThreeCompatAnimationDiagnostics, inspectThreeCompatAnimatedAssets } from "../../../packages/animation/src";

describe("ThreeCompat animation ThreeCompat", () => {
  it("supports mixer actions, crossfade, pause/play/scrub, skinning, morph targets, and animated asset diagnostics", () => {
    const idle = new AnimationClipCompat("idle", 2, [{ target: "root", property: "rotation.y", times: [0, 2], values: [0, 1] }]);
    const run = new AnimationClipCompat("run", 1, [{ target: "root", property: "position.z", times: [0, 1], values: [0, 3] }]);
    const mixer = new AnimationMixerCompat();
    const idleAction = mixer.clipAction(idle).play();
    const runAction = mixer.clipAction(run);
    idleAction.crossFadeTo(runAction, 0.65);
    mixer.update(0.5);
    runAction.pause().scrub(0.25).play();
    const skeleton = new SkeletonCompat([{ name: "hips", parentIndex: -1 }, { name: "spine", parentIndex: 0 }, { name: "head", parentIndex: 1 }]);
    const skinned = new SkinnedMeshCompat(skeleton);
    skinned.pose();
    const morphs = new MorphTargetMixerCompat();
    morphs.setWeight("smile", 0.8);
    morphs.setWeight("blink", 0.25);
    const diagnostics = createThreeCompatAnimationDiagnostics(mixer, skinned, morphs);

    expect(inspectThreeCompatAnimatedAssets().filter((asset) => asset.loaded)).toHaveLength(5);
    expect(runAction.playing).toBe(true);
    expect(runAction.time).toBeGreaterThan(0);
    expect(idleAction.weight).toBeCloseTo(0.35);
    expect(runAction.weight).toBeCloseTo(0.65);
    expect(skinned.skeleton.boneCount).toBe(3);
    expect(skinned.bindMatrixVersion).toBe(2);
    expect(morphs.getWeights()).toHaveLength(2);
    expect(diagnostics.loadedAnimatedAssets).toBeGreaterThanOrEqual(5);
    expect(diagnostics.supportsCrossfade).toBe(true);
    expect(diagnostics.supportsScrub).toBe(true);
    expect(diagnostics.warnings).toEqual([]);
  });

  it("exposes reusable root-motion locomotion controls for walk-style routes", () => {
    const clip = createRootMotionWalkClip({ duration: 1, distance: 2 });
    const locomotion = new LocomotionController({
      clip,
      speed: 2,
      pathRadius: 1.25,
      rootMotionScale: 0.5
    });

    const moving = locomotion.sample(0.5);
    locomotion.setInPlace(true);
    const inPlace = locomotion.sample(0.5);

    expect(moving.clipName).toBe("a3d-procedural-root-walk");
    expect(moving.clipTime).toBeCloseTo(0);
    expect(moving.rootMotionDistance).toBeGreaterThan(0);
    expect(Math.hypot(moving.worldX, moving.worldZ)).toBeCloseTo(1.25);
    expect(inPlace.worldX).toBe(0);
    expect(inPlace.worldZ).toBe(0);
    expect(inPlace.rootMotionDistance).toBe(0);
  });
});

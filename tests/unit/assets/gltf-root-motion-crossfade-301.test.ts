import { describe, expect, it, vi } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Scene, SceneNode, identityMat4 as mat4Identity } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src";

function fixture() {
  const scene = new Scene();
  const root = new SceneNode({ name: "hips" });
  const hand = new SceneNode({ name: "hand" });
  scene.root.addChild(root); root.addChild(hand);
  const clips = [2, 4, 8].map(distance => new AnimationClip({ name: `walk${distance}`, duration: 1, tracks: [
    new AnimationTrack({ target: "hips.translation", valueType: "vector3", keyframes: [{ time: 0, value: [0, 1, 0] }, { time: 1, value: [0, 1, distance] }] }),
    new AnimationTrack({ target: "hand.translation", valueType: "vector3", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [distance, 0, 0] }] })
  ] }));
  return { root, hand, runtime: createGLTFSceneAnimationRuntime({ scene, clips }) };
}
const sample = (distance: number, weight = 1) => ({ clipName: `walk${distance}`, fromTime: 0, toTime: 0.5, target: "hips.translation", weight });

describe("GLTF consumed root motion crossfades", () => {
  it("normalizes base displacement and pose together and invokes physical authority once", () => {
    const { runtime, root, hand } = fixture();
    const move = vi.fn((requested: readonly [number, number, number]) => requested);
    const result = runtime.applyRootMotionClips([sample(2, 2), sample(4, 6)], { worldFromLocal: mat4Identity(), move });
    expect(move).toHaveBeenCalledTimes(1);
    expect(result.motion.requested).toEqual([0, 0, 1.75]);
    expect([...root.transform.position]).toEqual([0, 1, 0]);
    expect([...hand.transform.position]).toEqual([1.75, 0, 0]);
  });
  it("retains full loops and adds additive motion without renormalizing base weights", () => {
    const { runtime, root } = fixture();
    const result = runtime.applyRootMotionClips([
      { ...sample(2), fromTime: 0.75, toTime: 3.25, loop: true },
      { ...sample(4), fromTime: 0.75, toTime: 3.25, loop: true },
      { ...sample(8, 0.25), additive: true }
    ], { worldFromLocal: mat4Identity(), move: () => [0, 0, 2] });
    expect(result.motion).toEqual({ requested: [0, 0, 8.5], accepted: [0, 0, 2], rejected: [0, 0, 6.5] });
    expect(root.transform.position[2]).toBe(0);
    const next = runtime.applyRootMotionClips([sample(2)], { worldFromLocal: mat4Identity(), move: requested => requested });
    expect(next.motion.requested).toEqual([0, 0, 1]);
  });
  it("rejects malformed later samples before committing any movement", () => {
    const { runtime } = fixture(); const move = vi.fn(() => [0, 0, 0] as const);
    for (const invalid of [{ ...sample(4), target: "absent.translation" }, { ...sample(4), weight: NaN }, { ...sample(4), toTime: Infinity }, { ...sample(4), clipName: "missing" }]) {
      expect(() => runtime.applyRootMotionClips([sample(2), invalid], { worldFromLocal: mat4Identity(), move })).toThrow();
    }
    expect(move).not.toHaveBeenCalled();
  });
  it("all-zero weights request zero motion and single-clip API consumes its local root", () => {
    const { runtime, root } = fixture();
    const options = { worldFromLocal: mat4Identity(), move: (requested: readonly [number, number, number]) => requested };
    expect(runtime.applyRootMotionClips([sample(2, 0)], options).motion.requested).toEqual([0, 0, 0]);
    expect(runtime.applyRootMotionClip("walk2", { ...sample(2), ...options }).motion.requested).toEqual([0, 0, 1]);
    expect([...root.transform.position]).toEqual([0, 1, 0]);
  });
});

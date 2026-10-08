/**
 * T3.5 (PRD-06 §7.1) — actor constraint list: evaluated after the mixer and
 * before the palette build. Covers the C-19 `ik.add`/`clear` semantics at the
 * runtime seam plus the lane spec→entry factory:
 *   - constraint ORDER is respected (later constraints read earlier writes)
 *   - weight 0 equals the pure clip bitwise
 *   - `add` returns a disposer that removes exactly that constraint
 */
import { describe, expect, it } from "vitest";
import { Scene, SceneNode } from "@aura3d/scene";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src";
import type { GLTFPoseConstraint } from "../../../packages/assets/src/GLTFAnimationRuntime";
import {
  addPrd06ActorConstraint,
  clearPrd06ActorConstraints
} from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";


/** Chain: seg0(y=0) → seg1(+0.5) → seg2(+0.5), plus a clip animating seg1's rotation. */
function buildChainScene(): Scene {
  const scene = new Scene();
  const seg0 = new SceneNode({ name: "seg0" });
  const seg1 = new SceneNode({ name: "seg1" });
  const seg2 = new SceneNode({ name: "seg2" });
  seg1.transform.setPosition(0, 0.5, 0);
  seg2.transform.setPosition(0, 0.5, 0);
  seg0.addChild(seg1);
  seg1.addChild(seg2);
  scene.root.addChild(seg0);
  return scene;
}

const ROT_90_Z: readonly [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function rotationClip(name: string, nodeName: string): AnimationClip {
  return new AnimationClip({
    name,
    duration: 1,
    tracks: [new AnimationTrack({
      target: `${nodeName}.rotation`,
      valueType: "quaternion",
      keyframes: [{ time: 0, value: ROT_90_Z }, { time: 1, value: ROT_90_Z }]
    })]
  });
}

function nodeRotation(scene: Scene, name: string): readonly number[] {
  return Array.from(scene.findByName(name)[0]!.transform.rotation);
}

describe("T3.5 — pose constraints on the runtime", () => {
  it("evaluates constraints in insertion order (later sees earlier writes)", () => {
    const scene = buildChainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [rotationClip("anim", "seg1")] });
    scene.updateWorldTransforms();

    const seen: string[] = [];
    // Constraint A rotates seg2's local by 90° about +Z… and records.
    const seg2Index = runtime.skeletons()[0]!.jointIndicesByName.get("seg2")![0]!;
    const a: GLTFPoseConstraint = {
      bones: [seg2Index],
      evaluate(pose) {
        seen.push("a");
        pose.rotations[seg2Index * 4 + 2] = Math.SQRT1_2;
        pose.rotations[seg2Index * 4 + 3] = Math.SQRT1_2;
      }
    };
    // Constraint B records whether A's write is already visible (seg2's local
    // rotation must already carry the 90° Z quat when B runs).
    const b: GLTFPoseConstraint = {
      bones: [seg2Index],
      evaluate(pose) {
        seen.push("b");
        const z = pose.rotations[seg2Index * 4 + 2]!;
        seen.push(z > 0.7 ? "a-visible" : "a-missing");
      }
    };

    runtime.addPoseConstraint(a);
    runtime.addPoseConstraint(b);
    runtime.applyClips([{ clipName: "anim", time: 0.5, weight: 1 }]);

    expect(seen).toEqual(["a", "b", "a-visible"]);
    // And the constraint write actually lands on the node (seg2 local is now 90°Z).
    scene.updateWorldTransforms();
    expect(nodeRotation(scene, "seg2")[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("constraint order matters: reversing registration changes the composed result", () => {
    const scene = buildChainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    scene.updateWorldTransforms();
    const seg1 = runtime.skeletons()[0]!.jointIndicesByName.get("seg1")![0]!;
    const rotX = (axis: "x" | "z"): GLTFPoseConstraint => ({
      bones: [seg1],
      evaluate(pose) {
        const q = axis === "x" ? [Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, Math.SQRT1_2, Math.SQRT1_2];
        const c = seg1 * 4;
        const [ax, ay, az, aw] = [pose.rotations[c]!, pose.rotations[c + 1]!, pose.rotations[c + 2]!, pose.rotations[c + 3]!];
        const [bx, by, bz, bw] = q;
        pose.rotations[c] = ax * bw + aw * bx + ay * bz - az * by;
        pose.rotations[c + 1] = ay * bw + aw * by + az * bx - ax * bz;
        pose.rotations[c + 2] = az * bw + aw * bz + ax * by - ay * bx;
        pose.rotations[c + 3] = aw * bw - ax * bx - ay * by - az * bz;
      }
    });
    const xThenZ = { x: rotX("x"), z: rotX("z") };
    runtime.addPoseConstraint(xThenZ.x);
    runtime.addPoseConstraint(xThenZ.z);
    runtime.applyPoseMixer(1 / 60);
    scene.updateWorldTransforms();
    const xz = nodeRotation(scene, "seg1");

    const scene2 = buildChainScene();
    const runtime2 = createGLTFSceneAnimationRuntime({ scene: scene2, clips: [] });
    scene2.updateWorldTransforms();
    runtime2.addPoseConstraint(rotX("z"));
    runtime2.addPoseConstraint(rotX("x"));
    runtime2.applyPoseMixer(1 / 60);
    scene2.updateWorldTransforms();
    const zx = nodeRotation(scene2, "seg1");

    // Quat composition is non-commutative → different results prove order.
    expect(xz).not.toEqual(zx);
  });

  it("weight 0 equals the pure clip bitwise", () => {
    const scene = buildChainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [rotationClip("anim", "seg1")] });
    scene.updateWorldTransforms();

    // Pure clip reference.
    runtime.applyClips([{ clipName: "anim", time: 0.5, weight: 1 }]);
    scene.updateWorldTransforms();
    const pure = {
      seg0: nodeRotation(scene, "seg0"),
      seg1: nodeRotation(scene, "seg1"),
      seg2: nodeRotation(scene, "seg2")
    };

    // Add an inert (weight 0) two-bone spec via the lane factory path.
    const actor = { animation: runtime } as unknown as TypedGLBActor;
    addPrd06ActorConstraint(actor, {
      kind: "two-bone",
      root: "seg0",
      mid: "seg1",
      tip: "seg2",
      weight: 0,
      target: [0.3, 0.3, 0]
    });
    expect(runtime.poseConstraintCount()).toBe(1);

    // Reset seg1's local (constraint registration must not have touched it),
    // re-apply the clip, compare bitwise.
    const seg1Node = scene.findByName("seg1")[0]!;
    seg1Node.transform.setRotation(0, 0, 0, 1);
    runtime.applyClips([{ clipName: "anim", time: 0.5, weight: 1 }]);
    scene.updateWorldTransforms();
    expect(nodeRotation(scene, "seg0")).toEqual(pure.seg0);
    expect(nodeRotation(scene, "seg1")).toEqual(pure.seg1);
    expect(nodeRotation(scene, "seg2")).toEqual(pure.seg2);
  });

  it("the disposer removes exactly that constraint", () => {
    const scene = buildChainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    scene.updateWorldTransforms();
    const actor = { animation: runtime } as unknown as TypedGLBActor;
    const calls: string[] = [];

    const disposeA = addPrd06ActorConstraint(actor, {
      kind: "ccd",
      chain: ["seg0", "seg1", "seg2"],
      target: [0.5, 0.5, 0]
    });
    const disposeB = addPrd06ActorConstraint(actor, {
      kind: "two-bone",
      root: "seg0",
      mid: "seg1",
      tip: "seg2",
      weight: 0, // inert — observable only by its presence in the list
      target: [0, 0, 0]
    });
    expect(runtime.poseConstraintCount()).toBe(2);

    disposeA(); // removes exactly the CCD constraint
    expect(runtime.poseConstraintCount()).toBe(1);
    disposeA(); // second call is a no-op (identity removal)
    expect(runtime.poseConstraintCount()).toBe(1);

    disposeB();
    expect(runtime.poseConstraintCount()).toBe(0);
    expect(calls).toEqual([]); // nothing wrote through — inert entry stays put
  });

  it("clear() empties the constraint list", () => {
    const scene = buildChainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    scene.updateWorldTransforms();
    const actor = { animation: runtime } as unknown as TypedGLBActor;
    addPrd06ActorConstraint(actor, {
      kind: "ccd",
      chain: ["seg0", "seg1", "seg2"],
      target: [0.5, 0.5, 0]
    });
    addPrd06ActorConstraint(actor, {
      kind: "look-at",
      bones: [{ bone: "seg1", weight: 1 }],
      target: [1, 0.5, 0]
    });
    expect(runtime.poseConstraintCount()).toBe(2);
    clearPrd06ActorConstraints(actor);
    expect(runtime.poseConstraintCount()).toBe(0);
  });

  it("a live two-bone constraint bends the chain toward its target post-mixer", () => {
    const scene = buildChainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [rotationClip("anim", "seg1")] });
    scene.updateWorldTransforms();
    const actor = { animation: runtime } as unknown as TypedGLBActor;

    addPrd06ActorConstraint(actor, {
      kind: "two-bone",
      root: "seg0",
      mid: "seg1",
      tip: "seg2",
      target: [0.8, 0.3, 0] // world-space (model matrix = scene root world = identity here)
    });

    // Clip overrides seg1's rotation each apply; the constraint must still
    // land — it evaluates after the mixer write.
    runtime.applyClips([{ clipName: "anim", time: 0.5, weight: 1 }]);
    scene.updateWorldTransforms();
    const tip = scene.findByName("seg2")[0]!;
    const tipWorld = tip.transform.worldMatrix;
    const dist = Math.hypot(tipWorld[12]! - 0.8, tipWorld[13]! - 0.3, tipWorld[14]!);
    expect(dist).toBeLessThan(0.02); // reachable target, ≤ 2 cm
  });

  it("constraints cover bones the clip never touches", () => {
    const scene = buildChainScene();
    // Clip animates only seg0; constraint touches seg1/seg2 — they must still
    // emit (unioned into the write-back), not fall through to stale values.
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [rotationClip("anim", "seg0")] });
    scene.updateWorldTransforms();
    const actor = { animation: runtime } as unknown as TypedGLBActor;

    addPrd06ActorConstraint(actor, {
      kind: "two-bone",
      root: "seg0",
      mid: "seg1",
      tip: "seg2",
      target: [0.8, 0.3, 0]
    });
    runtime.applyClips([{ clipName: "anim", time: 0.5, weight: 1 }]);
    scene.updateWorldTransforms();
    const tipWorld = scene.findByName("seg2")[0]!.transform.worldMatrix;
    expect(Math.hypot(tipWorld[12]! - 0.8, tipWorld[13]! - 0.3, tipWorld[14]!)).toBeLessThan(0.02);
  });
});

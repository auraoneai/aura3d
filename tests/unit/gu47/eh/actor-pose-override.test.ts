/**
 * GU47 E-H (WP-8) item 3: `node.animation.pose.setLocalRotation(bone, quat)`
 * procedural bone override (`agent-api/app/actorAnimationHandle.ts`). One pose
 * constraint per actor writes the overrides after the mixer, IK and spring
 * bones (it is re-appended whenever another constraint registers), so the
 * override is the final pose-space write before skinning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scene, SceneNode } from "@aura3d/scene";
import { AnimationClip } from "../../../../packages/animation/src/AnimationClip";
import { AnimationTrack } from "../../../../packages/animation/src/AnimationTrack";
import { createGLTFSceneAnimationRuntime } from "../../../../packages/assets/src";
import {
  ANIMATION_POSE_UNKNOWN_BONE,
  createPrd06ActorAnimationApi,
  registerPrd06AnimationActor,
  resetActorClipInfoSources,
  resetQrAnimationFlags,
  setQrAnimationFlags
} from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle.js";
import type { AuraRuntimeNodeHandle } from "../../../../packages/engine/src/agent-api/index.js";

const ROT_90_Z = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
const ROT_90_X = [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const;

function chainScene(): Scene {
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

function rotationClip(): AnimationClip {
  return new AnimationClip({
    name: "anim",
    duration: 1,
    tracks: [new AnimationTrack({ target: "seg1.rotation", valueType: "quaternion", keyframes: [{ time: 0, value: ROT_90_Z }, { time: 1, value: ROT_90_Z }] })]
  });
}

const handle = (id: string) => ({ kind: "model", id }) as unknown as AuraRuntimeNodeHandle;
const actorFor = (id: string, animation: unknown) => ({ id, animation, pipeline: { resources: { scene: { traverse: () => {} } } } }) as never;

interface Entry { readonly bones: readonly number[]; evaluate(pose: { rotations: Float32Array }): void }

/** Insertion-ordered constraint list with the runtime's seams (skeletons, add, clear). */
function fakeRuntime(names: readonly string[]) {
  const constraints: Entry[] = [];
  const jointIndicesByName = new Map(names.map((name, index) => [name, [index]] as const));
  return {
    constraints,
    skeletons: () => [{ jointIndicesByName, jointNames: names, boneCount: names.length }],
    addPoseConstraint(entry: Entry) {
      constraints.push(entry);
      return () => {
        const index = constraints.indexOf(entry);
        if (index >= 0) constraints.splice(index, 1);
      };
    },
    clearPoseConstraints() {
      constraints.length = 0;
    },
    evaluate(): Float32Array {
      const rotations = new Float32Array(names.length * 4);
      for (let i = 0; i < names.length; i += 1) rotations[i * 4 + 3] = 1;
      for (const entry of constraints) entry.evaluate({ rotations });
      return rotations;
    }
  };
}

describe("GU47 E-H actor.pose.setLocalRotation", () => {
  beforeEach(() => {
    resetActorClipInfoSources();
    setQrAnimationFlags({ values: {}, on: (flag: string) => flag === "A3D_QR_ANIMATION" } as never);
  });
  afterEach(() => {
    resetQrAnimationFlags();
    vi.restoreAllMocks();
  });

  it("overrides a clip-driven bone on the real runtime, set before the actor loads", () => {
    const scene = chainScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [rotationClip()] });
    scene.updateWorldTransforms();
    const api = createPrd06ActorAnimationApi(handle("hero"));
    api.pose.setLocalRotation("seg1", [2 * ROT_90_X[0], 0, 0, 2 * ROT_90_X[3]]); // normalised on write
    expect(runtime.poseConstraintCount()).toBe(0);

    registerPrd06AnimationActor(actorFor("hero", runtime));
    expect(runtime.poseConstraintCount()).toBe(1);
    runtime.applyClips([{ clipName: "anim", time: 0.5, weight: 1 }]);
    const rotation = Array.from(scene.findByName("seg1")[0]!.transform.rotation);
    expect(rotation[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(rotation[2]).toBeCloseTo(0, 5);
    expect(rotation[3]).toBeCloseTo(Math.SQRT1_2, 5);

    // Released: the clip drives the bone again.
    api.pose.clear("seg1");
    expect(runtime.poseConstraintCount()).toBe(0);
    runtime.applyClips([{ clipName: "anim", time: 0.6, weight: 1 }]);
    expect(scene.findByName("seg1")[0]!.transform.rotation[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("per-frame updates change the value without re-registering", () => {
    const runtime = fakeRuntime(["hips", "spine", "head"]);
    registerPrd06AnimationActor(actorFor("hero", runtime));
    const api = createPrd06ActorAnimationApi(handle("hero"));
    api.pose.setLocalRotation("head", ROT_90_Z);
    const entry = runtime.constraints[0];
    api.pose.setLocalRotation("head", ROT_90_X);
    expect(runtime.constraints).toHaveLength(1);
    expect(runtime.constraints[0]).toBe(entry);
    const rotations = runtime.evaluate();
    expect(Array.from(rotations.subarray(8, 12)).map((v) => Number(v.toFixed(5)))).toEqual([0.70711, 0, 0, 0.70711]);
    expect(entry!.bones).toEqual([2]);
  });

  it("stays the last constraint after ik.add / springBones.add and survives ik.clear", () => {
    const runtime = fakeRuntime(["upper", "lower", "hand", "tail0", "tail1"]);
    registerPrd06AnimationActor(actorFor("hero", runtime));
    const api = createPrd06ActorAnimationApi(handle("hero"));
    api.pose.setLocalRotation("upper", ROT_90_Z);
    const overrideBones = (): readonly number[] => runtime.constraints[runtime.constraints.length - 1]!.bones;

    // Weight 0 IK registers an inert constraint; the override must move behind it.
    api.ik.add({ kind: "two-bone", root: "upper", mid: "lower", tip: "hand", target: [0, 0, 1], weight: 0 });
    expect(runtime.constraints).toHaveLength(2);
    expect(overrideBones()).toEqual([0]);

    api.springBones.add({ chains: [{ bones: ["tail0", "tail1"] }] });
    expect(runtime.constraints).toHaveLength(3);
    expect(overrideBones()).toEqual([0]);

    // An IK write to the same bone never wins over the override.
    runtime.constraints.splice(0, 0, { bones: [0], evaluate: (pose) => pose.rotations.set(ROT_90_X, 0) });
    api.ik.add({ kind: "two-bone", root: "upper", mid: "lower", tip: "hand", target: [0, 0, 1], weight: 0 });
    expect(Array.from(runtime.evaluate().subarray(0, 4)).map((v) => Number(v.toFixed(5)))).toEqual([0, 0, 0.70711, 0.70711]);

    api.ik.clear(); // drops every constraint on the runtime ...
    expect(runtime.constraints).toHaveLength(1); // ... and the override re-registers
    expect(overrideBones()).toEqual([0]);
  });

  it("warns once for a bone the rig does not have and registers nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtime = fakeRuntime(["hips"]);
    registerPrd06AnimationActor(actorFor("hero", runtime));
    const api = createPrd06ActorAnimationApi(handle("hero"));
    api.pose.setLocalRotation("tail", ROT_90_Z);
    api.pose.setLocalRotation("tail", ROT_90_X);
    expect(runtime.constraints).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(ANIMATION_POSE_UNKNOWN_BONE);
  });

  it("clear() releases every override; degenerate quats are ignored", () => {
    const runtime = fakeRuntime(["hips", "head"]);
    registerPrd06AnimationActor(actorFor("hero", runtime));
    const api = createPrd06ActorAnimationApi(handle("hero"));
    api.pose.setLocalRotation("hips", [0, 0, 0, 0]);
    api.pose.setLocalRotation("head", [Number.NaN, 0, 0, 1]);
    expect(runtime.constraints).toHaveLength(0);
    api.pose.setLocalRotation("hips", ROT_90_Z);
    api.pose.setLocalRotation("head", ROT_90_X);
    expect(runtime.constraints[0]!.bones).toEqual([0, 1]);
    api.pose.clear("hips");
    expect(runtime.constraints[0]!.bones).toEqual([1]);
    api.pose.clear();
    expect(runtime.constraints).toHaveLength(0);
  });

  it("overrides last for the loaded actor's lifetime (dispose drops them)", () => {
    const first = fakeRuntime(["head"]);
    const unregister = registerPrd06AnimationActor(actorFor("hero", first));
    createPrd06ActorAnimationApi(handle("hero")).pose.setLocalRotation("head", ROT_90_Z);
    expect(first.constraints).toHaveLength(1);
    unregister();
    const second = fakeRuntime(["head"]);
    registerPrd06AnimationActor(actorFor("hero", second));
    expect(second.constraints).toHaveLength(0);
  });

  it("is a no-op while A3D_QR_ANIMATION is off", () => {
    setQrAnimationFlags({ values: {}, on: () => false } as never);
    const runtime = fakeRuntime(["head"]);
    registerPrd06AnimationActor(actorFor("hero", runtime));
    createPrd06ActorAnimationApi(handle("hero")).pose.setLocalRotation("head", ROT_90_Z);
    expect(runtime.constraints).toHaveLength(0);
  });
});

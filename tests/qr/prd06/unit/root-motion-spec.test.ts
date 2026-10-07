/**
 * PRD-06 T3.7 (§6.8) — C-19 `play(clip, {rootMotion: AuraRootMotionSpec})` on the
 * spec path: `node.animation.rootMotion` removes the authored delta from the
 * pose and `mode: "apply"` integrates it into the node transform (runtime-node
 * handle when mutable, else the model matrix), `"extract-only"` only reports it
 * on `entry.rootMotionReport`. `axes` masks the applied delta; "yaw" extracts
 * the root rotation track's Y-rotation. Flag-off stays on the legacy path.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Scene, SceneNode, identityMat4 } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime } from "../../../../packages/assets/src";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { ProductionRuntimeActorEntry } from "../../../../packages/engine/src/agent-api/index";
import {
  resetQrAnimationFlags,
  setQrAnimationFlags
} from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import {
  applyProductionActorAnimation,
  applySpecRootMotionTransform,
  resetProductionActorPoseStates
} from "../../../../packages/engine/src/agent-api/compiler/animation";

const qrFlags = (...shortNames: string[]) => resolveQrFlags({ options: shortNames, env: {} });

function fixture() {
  const scene = new Scene();
  const hips = new SceneNode({ name: "hips" });
  scene.root.addChild(hips);
  const clips = [
    // Walk: 1 m/cycle forward Z, hips height held at 1.
    new AnimationClip({ name: "walk", duration: 1, tracks: [
      new AnimationTrack({ target: "hips.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 1, 0] }, { time: 1, value: [0, 1, 1] }
      ] })
    ] }),
    // Turn: no translation, 90° yaw over one cycle.
    new AnimationClip({ name: "turn", duration: 1, tracks: [
      new AnimationTrack({ target: "hips.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 1, 0] }, { time: 1, value: [0, 1, 0] }
      ] }),
      new AnimationTrack({ target: "hips.rotation", valueType: "quaternion", keyframes: [
        { time: 0, value: [0, 0, 0, 1] }, { time: 1, value: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }
      ] })
    ] })
  ];
  return { hips, runtime: createGLTFSceneAnimationRuntime({ scene, clips }) };
}

function specEntry(clip = "walk", rootMotion: unknown = { mode: "apply" }, runtimeId?: string) {
  const { hips, runtime } = fixture();
  const playClip = vi.fn();
  const actor = {
    id: "actor-1",
    animation: runtime,
    playClip,
    playRootMotionClips: (samples: unknown, options: unknown) =>
      (runtime as { applyRootMotionClips: (s: never, o: never) => unknown }).applyRootMotionClips(samples as never, options as never),
    applyRetargetedPose: () => ({}),
    applyMorphTargets: () => undefined
  };
  const entry = {
    node: {
      kind: "model",
      asset: { id: "a" },
      animation: { clip, rootMotion },
      ...(runtimeId !== undefined ? { runtime: { id: runtimeId } } : {})
    },
    actor
  } as unknown as ProductionRuntimeActorEntry;
  return { entry, playClip, hips };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const applyAt = (
  entry: ProductionRuntimeActorEntry,
  time: number,
  runtimeNodes?: { get(id: string): unknown },
  refresh: () => void = () => undefined
) => applyProductionActorAnimation(entry, entry.node, undefined, time, new Set<string>(), IDENTITY, refresh, runtimeNodes as never);

afterEach(() => {
  resetQrAnimationFlags();
  resetProductionActorPoseStates();
});

describe("T3.7 spec-level rootMotion (C-19 AuraRootMotionSpec)", () => {
  it("apply mode moves the runtime node by the clip's displacement per cycle, hips XZ fixed", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const { entry, hips } = specEntry("walk", { mode: "apply", axes: ["x", "z", "yaw"] }, "hero");
    const translates: number[][] = [];
    const handle = {
      rotation: [0, 0, 0] as [number, number, number],
      translate: (x: number, y: number, z: number) => { translates.push([x, y, z]); },
      setRotation: (x: number, y: number, z: number) => { handle.rotation = [x, y, z]; }
    };
    const runtimeNodes = { get: (id: string) => id === "hero" ? handle : undefined };
    // Three frames: 0->0.5s, 0.5->1.5s (wraps a cycle), 1.5->2.5s.
    applyAt(entry, 500, runtimeNodes);
    applyAt(entry, 1500, runtimeNodes);
    applyAt(entry, 2500, runtimeNodes);
    const movedZ = translates.reduce((sum, t) => sum + t[2]!, 0);
    // 2.5 s at 1 m/cycle = 2.5 cycles of forward displacement.
    expect(movedZ).toBeGreaterThanOrEqual(2.5 - 0.01);
    expect(movedZ).toBeLessThanOrEqual(2.5 + 0.01);
    expect(translates.every(t => Math.abs(t[0]!) < 1e-9 && Math.abs(t[1]!) < 1e-9)).toBe(true);
    // Pose hips XZ stays at the authored t=0 sample.
    expect([...hips.transform.position]).toEqual([0, 1, 0]);
    expect(entry.rootMotionReport?.rejected).toEqual([0, 0, 0]);
  });

  it("apply mode without a runtime node folds offset + yaw into the model matrix", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const { entry } = specEntry("turn", { mode: "apply" }); // no runtime id
    applyAt(entry, 1000);
    applyAt(entry, 2000); // second full cycle
    expect(entry.rootMotionYaw ?? 0).toBeCloseTo(Math.PI, 1);
    const m = [...IDENTITY];
    applySpecRootMotionTransform(entry, m);
    // yaw ≈ 2π/2? turn rotates 90°/cycle → 180° over two cycles: basis X → -X.
    expect(m[0]!).toBeCloseTo(-1, 1);
    expect(m[2]!).toBeCloseTo(0, 1);
  });

  it("extract-only reports the delta without moving the node", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const { entry } = specEntry("walk", { mode: "extract-only" }, "hero");
    const translate = vi.fn();
    const runtimeNodes = { get: () => ({ translate, rotation: [0, 0, 0] }) };
    applyAt(entry, 1000, runtimeNodes);
    expect(translate).not.toHaveBeenCalled();
    expect(entry.rootMotionOffset).toBeUndefined();
    expect(entry.rootMotionReport?.accepted).toEqual([0, 0, 0]);
    expect(entry.rootMotionReport?.rejected?.[2]).toBeCloseTo(1, 5);
    expect(entry.rootMotionReport?.requested?.[2]).toBeCloseTo(1, 5);
  });

  it("axes masks which delta components apply", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const { entry } = specEntry("walk", { mode: "apply", axes: ["x"] }, "hero");
    const translates: number[][] = [];
    const runtimeNodes = { get: () => ({ translate: (x: number, y: number, z: number) => translates.push([x, y, z]) }) };
    applyAt(entry, 1000, runtimeNodes);
    expect(translates.length).toBeGreaterThan(0);
    expect(translates.every(t => t[2] === 0)).toBe(true);
    // Masked components are reported as rejected, never silently carried.
    expect(entry.rootMotionReport?.rejected?.[2]).toBeCloseTo(1, 5);
  });

  it("flag-off keeps the legacy playClip path (no extraction, no report)", () => {
    setQrAnimationFlags(qrFlags());
    const { entry, playClip } = specEntry("walk", { mode: "apply" }, "hero");
    const translate = vi.fn();
    applyAt(entry, 1000, { get: () => ({ translate }) });
    expect(playClip).toHaveBeenCalledTimes(1);
    expect(translate).not.toHaveBeenCalled();
    expect(entry.rootMotionReport).toBeUndefined();
  });

  it("rootMotion: false stays off the root-motion path under the flag", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const { entry, playClip } = specEntry("walk", false, "hero");
    const translate = vi.fn();
    applyAt(entry, 1000, { get: () => ({ translate }) });
    // The flag-on valid-clip path is the PoseMixer (T1.9), not playClip; either
    // way no root-motion state is produced.
    expect(entry.rootMotionReport).toBeUndefined();
    expect(entry.rootMotionOffset).toBeUndefined();
    expect(translate).not.toHaveBeenCalled();
    expect(playClip).not.toHaveBeenCalled();
  });
});

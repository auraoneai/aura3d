/**
 * PRD-06 T0.1 + T0.3 — `dispatchActorAnimation` (the PRD-15 call-site seam) and
 * the flag-gated `clipSamples` dispatch: an empty stored pose falls back to clip
 * playback, a live pose reaches `applyRetargetedPose`, and bound controller
 * clip samples drive the GLB `applyClips` blend with weights intact.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { AnimationPose } from "@aura3d/animation";
import { createAnimationController } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { AuraRuntimeNodeAnimationBindingMetadata } from "../../../packages/engine/src/agent-api/RuntimeNodeHandle";
import type { ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/index";
import {
  ANIMATION_EMPTY_POSE,
  resetEmptyPoseRejections,
  resetQrAnimationFlags,
  setActorRuntimeAnimationPose,
  setQrAnimationFlags
} from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import {
  applyProductionActorAnimation,
  dispatchActorAnimation
} from "../../../packages/engine/src/agent-api/compiler/animation";

const BONE_POSE: AnimationPose = {
  bones: {
    Hips: {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    }
  },
  morphTargets: {}
};

const IDENTITY_MAT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const FAKE_NODE = { kind: "model", asset: { id: "a" }, animation: { clip: "walk" } } as never;

function qrFlags(...shortNames: string[]) {
  return resolveQrFlags({ options: shortNames, env: {} });
}

function fakeActorEntry(calls: { applyClips?: unknown[]; playClip?: unknown[]; applyRetargetedPose?: unknown[] }) {
  const actor = {
    id: "actor-1",
    animation: {
      resolveClipName: (name: string) => (name === "walk" || name === "idle" || name === "run" ? name : undefined),
      applyClips: (samples: unknown) => {
        calls.applyClips?.push(samples);
        return {};
      }
    },
    applyRetargetedPose: (pose: AnimationPose, time: number) => {
      calls.applyRetargetedPose?.push([pose, time]);
      return {};
    },
    playClip: (name: string, time: number) => {
      calls.playClip?.push([name, time]);
      return {};
    },
    playRootMotionClips: () => ({ motion: {} }),
    applyMorphTargets: () => undefined
  };
  const entry = {
    node: { kind: "model", asset: { id: "a" }, animation: { clip: "walk" } },
    actor,
    rootMotionCursors: new Map<string, number>([["p1", 3]])
  } as unknown as ProductionRuntimeActorEntry;
  return entry;
}

afterEach(() => {
  resetQrAnimationFlags();
  resetEmptyPoseRejections();
});

describe("dispatchActorAnimation (T0.1)", () => {
  it("rejects a stored empty pose, warns, and falls back to clip playback", () => {
    const calls = { applyRetargetedPose: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    const warnings = new Set<string>();
    dispatchActorAnimation(
      entry,
      { animationPose: { bones: {}, morphTargets: {} } },
      FAKE_NODE,
      1000,
      warnings,
      IDENTITY_MAT4,
      () => undefined
    );
    expect(calls.applyRetargetedPose).toHaveLength(0);
    expect(calls.playClip).toHaveLength(1);
    expect([...warnings].some((w) => w.includes("empty animation pose"))).toBe(true);
  });

  it("applies a non-empty pose and clears root-motion cursors", () => {
    const calls = { applyRetargetedPose: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    const warnings = new Set<string>();
    dispatchActorAnimation(
      entry,
      { animationPose: BONE_POSE, animationPoseTime: 0.5 },
      FAKE_NODE,
      1000,
      warnings,
      IDENTITY_MAT4,
      () => undefined
    );
    expect(calls.applyRetargetedPose).toEqual([[BONE_POSE, 0.5]]);
    expect(calls.playClip).toHaveLength(0);
    expect(entry.rootMotionCursors).toBeUndefined();
    expect(warnings.size).toBe(0);
  });

  it("keeps a stored morph-only pose on the retargeted-pose path", () => {
    const morphPose = { bones: {}, morphTargets: { blink: 1 } } as unknown as AnimationPose;
    const calls = { applyRetargetedPose: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    dispatchActorAnimation(entry, { animationPose: morphPose }, FAKE_NODE, 0, new Set(), IDENTITY_MAT4, () => undefined);
    expect(calls.applyRetargetedPose).toEqual([[morphPose, 0]]);
  });

  it("surfaces a pending empty-pose rejection as ANIMATION_EMPTY_POSE once per node", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const calls = { applyRetargetedPose: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    const node = { kind: "model", asset: { id: "a" }, animation: { clip: "walk" }, runtime: { id: "hero" } } as never;
    // Simulate the rejected setAnimationPose that ran before this render pass.
    setActorRuntimeAnimationPose(
      { setAnimationPose: () => undefined },
      { bones: {}, morphTargets: {} },
      undefined,
      { nodeId: "hero" }
    );
    const warnings = new Set<string>();
    dispatchActorAnimation(entry, {}, node, 0, warnings, IDENTITY_MAT4, () => undefined);
    expect([...warnings].some((w) => w.startsWith(ANIMATION_EMPTY_POSE))).toBe(true);
    // Consumed: a second pass does not re-warn.
    const second = new Set<string>();
    dispatchActorAnimation(entry, {}, node, 0, second, IDENTITY_MAT4, () => undefined);
    expect([...second].some((w) => w.startsWith(ANIMATION_EMPTY_POSE))).toBe(false);
  });
});

describe("clipSamples dispatch (T0.3, flag-gated)", () => {
  const bindingWithSamples = {
    kind: "aura-runtime-node-animation-binding",
    clipSamples: [
      { clipName: "walk", localTime: 0.4, weight: 0.75 },
      { clipName: "run", localTime: 1.1, weight: 0.25, additive: true, mask: { include: ["Spine"] } },
      { clipName: "missing", localTime: 0, weight: 0.1 }
    ]
  } as unknown as AuraRuntimeNodeAnimationBindingMetadata;

  it("routes bound clip samples to the GLB applyClips blend when the flag is on", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const calls = { applyClips: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    const warnings = new Set<string>();
    applyProductionActorAnimation(entry, FAKE_NODE, bindingWithSamples, 2000, warnings, IDENTITY_MAT4, () => undefined);
    expect(calls.playClip).toHaveLength(0);
    expect(calls.applyClips).toEqual([[
      { clipName: "walk", time: 0.4, weight: 0.75, additive: undefined, mask: undefined },
      { clipName: "run", time: 1.1, weight: 0.25, additive: true, mask: { include: ["Spine"], exclude: undefined } }
    ]]);
    expect([...warnings].some((w) => w.startsWith("ANIMATION_CLIP_NOT_FOUND") && w.includes('"missing"'))).toBe(true);
    expect(entry.rootMotionCursors).toBeUndefined();
  });

  it("keeps the single-clip path when the flag is off", () => {
    setQrAnimationFlags(qrFlags());
    const calls = { applyClips: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    applyProductionActorAnimation(entry, FAKE_NODE, bindingWithSamples, 2000, new Set(), IDENTITY_MAT4, () => undefined);
    expect(calls.applyClips).toHaveLength(0);
    expect(calls.playClip).toEqual([["walk", 2]]);
  });

  it("drives a real controller crossfade into applyClips with ~0.5/0.5 weights (T0.3 spec)", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const controller = createAnimationController({ id: "ctrl-dispatch" });
    controller.registerEmbeddedGLBClips({
      assetId: "asset-1",
      clips: [
        { id: "idle", duration: 2, tracks: [] },
        { id: "walk", duration: 2, tracks: [] }
      ]
    });
    const bindings: (AuraRuntimeNodeAnimationBindingMetadata | undefined)[] = [];
    const node = {
      id: "hero",
      setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined) { bindings.push(binding); return this; },
      setAnimationPose() { return this; },
      setMorphTargets() { return this; }
    };
    controller.play("idle");
    controller.bindRuntimeNode(node as never, {});
    controller.crossFade("walk", 0.2);
    controller.update(0.1);
    const binding = bindings.at(-1) as { clipSamples?: { clipName: string; weight: number }[] } | undefined;
    expect(binding?.clipSamples?.length).toBe(2);

    const calls = { applyClips: [] as { clipName: string; weight?: number }[][], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls as never);
    applyProductionActorAnimation(entry, FAKE_NODE, binding as never, 0, new Set(), IDENTITY_MAT4, () => undefined);
    expect(calls.playClip).toHaveLength(0);
    const samples = calls.applyClips[0];
    expect(samples?.map((s) => s.clipName).sort()).toEqual(["idle", "walk"]);
    for (const sample of samples ?? []) {
      expect(sample.weight).toBeGreaterThan(0.49);
      expect(sample.weight).toBeLessThan(0.51);
    }
  });
});

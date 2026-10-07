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
  dispatchActorAnimation,
  resetProductionActorPoseStates,
  setActorAnimationAppTimeScale,
  takeClipApplyDegradations
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
const FAKE_NODE_BASE = { kind: "model", asset: { id: "a" }, animation: { clip: "walk" } };
const FAKE_NODE = FAKE_NODE_BASE as never;

function qrFlags(...shortNames: string[]) {
  return resolveQrFlags({ options: shortNames, env: {} });
}

type FakePoseAction = {
  clipName: string;
  playing: boolean;
  time: number;
  timeScale: number;
  additive: boolean;
  bindings: { readonly boneIndex: number }[];
  effectiveWeight: number;
  clip: { readonly duration: number };
  fadeSeconds: number | undefined;
  warp: boolean | undefined;
  clampWhenFinished: boolean;
  setEffectiveTimeScale(value: number): void;
  setLoop(mode: string, repetitions?: number): void;
};

function makeFakePoseMixer() {
  const actions: FakePoseAction[] = [];
  return {
    actions,
    crossFadeTo(clipName: string, seconds: number, options: { readonly warp?: boolean } = {}) {
      const action: FakePoseAction = {
        clipName,
        playing: true,
        time: 0,
        timeScale: 1,
        additive: false,
        bindings: [],
        effectiveWeight: 1,
        clip: { duration: 2 },
        fadeSeconds: seconds,
        warp: options.warp,
        clampWhenFinished: false,
        setEffectiveTimeScale(value) {
          action.timeScale = value;
        },
        setLoop() {}
      };
      actions.push(action);
      return action;
    },
    update(dt: number) {
      for (const action of actions) if (action.playing) action.time += dt * action.timeScale;
      return [];
    },
    activeActions() {
      return actions.filter((action) => action.playing);
    }
  };
}

function fakeActorEntry(calls: { applyClips?: unknown[]; playClip?: unknown[]; applyRetargetedPose?: unknown[]; mixer?: ReturnType<typeof makeFakePoseMixer>; applyPoseMixer?: unknown[] }) {
  const actor = {
    id: "actor-1",
    animation: {
      resolveClipName: (name: string, options?: { readonly fallback?: "error" | "first" }) =>
        name === "walk" || name === "idle" || name === "run"
          ? name
          : options?.fallback === "error" ? undefined : "walk",
      clipNames: () => ["walk", "idle", "run"],
      applyClips: (samples: unknown) => {
        calls.applyClips?.push(samples);
        return {};
      },
      ...(calls.mixer === undefined ? {} : {
        mixer: () => calls.mixer,
        applyPoseMixer: (dt: number, options: unknown) => {
          calls.applyPoseMixer?.push([dt, options]);
          calls.mixer?.update(dt);
          return {};
        }
      })
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
  resetProductionActorPoseStates();
  setActorAnimationAppTimeScale(undefined);
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

  it("records a clip-apply-failed degradation + ANIMATION_CLIP_NOT_FOUND on a top-level miss (T1.8)", () => {
    setQrAnimationFlags(qrFlags("animation"));
    takeClipApplyDegradations();
    const calls = { applyClips: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    const warnings = new Set<string>();
    const node = { ...FAKE_NODE_BASE, animation: { clip: "missing" } } as never;
    applyProductionActorAnimation(entry, node, bindingWithSamples, 2000, warnings, IDENTITY_MAT4, () => undefined);
    expect(calls.playClip).toHaveLength(0);
    expect(calls.applyClips).toHaveLength(0);
    expect([...warnings].some((w) => w.startsWith("ANIMATION_CLIP_NOT_FOUND") && w.includes('"missing"') && w.includes("walk"))).toBe(true);
    const degradations = takeClipApplyDegradations();
    expect(degradations.some((d) => d.code === "clip-apply-failed" && d.message.includes('"missing"'))).toBe(true);
  });

  it("keeps the first-clip fallback for a top-level miss when the flag is off (T1.8)", () => {
    setQrAnimationFlags(qrFlags());
    takeClipApplyDegradations();
    const calls = { applyClips: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry(calls);
    const node = { ...FAKE_NODE_BASE, animation: { clip: "missing" } } as never;
    applyProductionActorAnimation(entry, node, bindingWithSamples, 2000, new Set(), IDENTITY_MAT4, () => undefined);
    // Flag off: the miss fuzzy-resolves to the first clip ("walk" in the stub)
    // and plays — no warning, no clip-apply-failed degradation.
    expect(calls.applyClips).toHaveLength(0);
    expect(calls.playClip).toEqual([["walk", 2]]);
    expect(takeClipApplyDegradations().some((d) => d.code === "clip-apply-failed")).toBe(false);
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

describe("applyProductionActorAnimation — T1.9 stateful PoseMixer (A3D_QR_ANIMATION)", () => {
  const applyAt = (
    entry: ProductionRuntimeActorEntry,
    animation: Record<string, unknown>,
    timeMs: number,
    runtimeNodes?: never
  ) =>
    applyProductionActorAnimation(
      entry,
      { kind: "model", asset: { id: "a" }, animation, runtime: { id: "node-1" } } as never,
      undefined,
      timeMs,
      new Set<string>(),
      IDENTITY_MAT4,
      () => undefined,
      runtimeNodes as never
    );

  it("crossfades Idle→Walk over 0.2s yielding two-clip evaluation during the fade", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const mixer = makeFakePoseMixer();
    const calls = { applyPoseMixer: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry({ ...calls, mixer });
    applyAt(entry, { clip: "idle" }, 0);
    applyAt(entry, { clip: "walk" }, 500);
    expect(mixer.actions.map((a) => a.clipName)).toEqual(["idle", "walk"]);
    expect(mixer.actions[1]?.fadeSeconds).toBe(0.2);
    // The fading-out base action and the fading-in action are both playing →
    // the mixer evaluates two clips until the 0.2s fade completes.
    expect(mixer.activeActions()).toHaveLength(2);
    expect(calls.applyPoseMixer).toHaveLength(2);
    expect(calls.playClip).toHaveLength(0);
  });

  it("honours speed: 0.5 by halving clip-time advance", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const mixer = makeFakePoseMixer();
    const calls = { applyPoseMixer: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry({ ...calls, mixer });
    applyAt(entry, { clip: "walk", speed: 0.5 }, 1000);
    applyAt(entry, { clip: "walk", speed: 0.5 }, 2000);
    const action = mixer.actions[0];
    expect(action?.timeScale).toBe(0.5);
    // rawDt = 1.0s → action.time advanced by 1.0 * 0.5.
    expect(action?.time).toBe(0.5);
    expect(calls.applyPoseMixer.at(-1)?.[0]).toBe(1);
  });

  it("freezes clip advance when handle.timeScale is 0 (C-23 hit-stop)", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const mixer = makeFakePoseMixer();
    const calls = { applyPoseMixer: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry({ ...calls, mixer });
    const runtimeNodes = { get: () => ({ timeScale: 0 }) } as never;
    applyAt(entry, { clip: "walk" }, 1000, runtimeNodes);
    applyAt(entry, { clip: "walk" }, 2000, runtimeNodes);
    expect(calls.applyPoseMixer.at(-1)?.[0]).toBe(0);
    expect(mixer.actions[0]?.time).toBe(0);
  });

  it("composes app.time.scale into the per-actor dt", () => {
    setQrAnimationFlags(qrFlags("animation"));
    setActorAnimationAppTimeScale(() => 0.25);
    const mixer = makeFakePoseMixer();
    const calls = { applyPoseMixer: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry({ ...calls, mixer });
    applyAt(entry, { clip: "walk" }, 1000);
    applyAt(entry, { clip: "walk" }, 2000);
    expect(calls.applyPoseMixer.at(-1)?.[0]).toBe(0.25);
  });

  it("flag-off reproduces today's playClip call sequence exactly (mixer never touched)", () => {
    setQrAnimationFlags(qrFlags());
    const mixer = makeFakePoseMixer();
    const calls = { applyPoseMixer: [] as unknown[], playClip: [] as unknown[] };
    const entry = fakeActorEntry({ ...calls, mixer });
    applyAt(entry, { clip: "walk" }, 2000);
    expect(calls.playClip).toEqual([["walk", 2]]);
    expect(calls.applyPoseMixer).toHaveLength(0);
    expect(mixer.actions).toHaveLength(0);
  });
});

/**
 * PRD-06 T0.18 — C-19 `animationState()` + `socket()` on the `prd06.animation`
 * handle extension, and the C-31 `animation` diagnostics collect.
 *
 * The actor-side sources (last apply result, bone→world-matrix lookup) are
 * published by the `prd06.animation` TypedGLBActor extension at load; these
 * tests register them directly, so they exercise the merge logic without a
 * loaded GLB. `bones?` per-bone samples wait on CCR-06-4 — sockets are the
 * interim read.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GLTFSceneAnimationApplyResult } from "@aura3d/assets/gltf-runtime";
import {
  ANIMATION_SOCKET_UNKNOWN_BONE,
  collectPrd06AnimationDiagnostics,
  createPrd06ActorAnimationApi,
  registerPrd06AnimationActor,
  registerActorAnimationApplySource,
  registerActorBoneMatrixSource,
  resetActorAnimationStateSources,
  resetActorClipInfoSources
} from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle.js";
import type { AuraRuntimeNodeHandle } from "../../../../packages/engine/src/agent-api/index.js";

function applyResult(overrides: Partial<GLTFSceneAnimationApplyResult> = {}): GLTFSceneAnimationApplyResult {
  return {
    clipName: "Walk",
    time: 0.4,
    blendedClipCount: 1,
    tracksApplied: 42,
    transformTracksApplied: 40,
    morphWeightTracksApplied: 2,
    materialTracksApplied: 0,
    lightTracksApplied: 0,
    skinningPalettesUpdated: 1,
    missingTargets: [],
    unsupportedTracks: [],
    ...overrides
  };
}

interface FakeHandleOptions {
  readonly clip?: string;
  readonly binding?: {
    readonly activeClipId?: string;
    readonly speed?: number;
    readonly clipSamples?: readonly { clipName: string; localTime: number; weight: number; layer?: string }[];
  };
}

function fakeModelHandle(id: string, options: FakeHandleOptions = {}): AuraRuntimeNodeHandle {
  return {
    kind: "model",
    id,
    snapshot: () => ({
      id,
      kind: "model",
      ...(options.clip !== undefined ? { animation: { clip: options.clip } } : {}),
      ...(options.binding !== undefined
        ? { animationBinding: { kind: "aura-runtime-node-animation-binding", ...options.binding } }
        : {})
    })
  } as unknown as AuraRuntimeNodeHandle;
}

function fakePrimitiveHandle(id: string): AuraRuntimeNodeHandle {
  return { kind: "primitive", id, snapshot: () => ({ id, kind: "primitive" }) } as unknown as AuraRuntimeNodeHandle;
}

describe("prd06 animationState() (T0.18, C-19)", () => {
  beforeEach(() => {
    resetActorAnimationStateSources();
    resetActorClipInfoSources();
  });

  it("returns undefined before the actor has applied or bound anything", () => {
    const api = createPrd06ActorAnimationApi(fakeModelHandle("actor-a"));
    expect(api.animationState()).toBeUndefined();
  });

  it("returns undefined for non-model nodes even with sources registered", () => {
    registerActorAnimationApplySource("prim-1", () => applyResult());
    const api = createPrd06ActorAnimationApi(fakePrimitiveHandle("prim-1"));
    expect(api.animationState()).toBeUndefined();
  });

  it("reports activeClip + tracksApplied from the actor's last apply result", () => {
    registerActorAnimationApplySource("hero", () => applyResult({ clipName: "Walk", tracksApplied: 42 }));
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero"));
    const state = api.animationState();
    expect(state).toBeDefined();
    expect(state!.activeClip).toBe("Walk");
    expect(state!.tracksApplied).toBe(42);
  });

  it("projects bound clipSamples into activeActions and reads speed as timeScale", () => {
    registerActorAnimationApplySource("hero", () => applyResult());
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero", {
      binding: {
        activeClipId: "Walk",
        speed: 1.5,
        clipSamples: [
          { clipName: "Idle", localTime: 0.2, weight: 0.5, layer: "base" },
          { clipName: "Walk", localTime: 0.4, weight: 0.5 }
        ]
      }
    }));
    const state = api.animationState()!;
    expect(state.timeScale).toBe(1.5);
    expect(state.activeActions).toEqual([
      { clip: "Idle", layer: "base", weight: 0.5, time: 0.2 },
      { clip: "Walk", layer: "base", weight: 0.5, time: 0.4 }
    ]);
  });

  it("falls back to binding.activeClipId then the node animation spec for activeClip", () => {
    const boundOnly = createPrd06ActorAnimationApi(fakeModelHandle("bound", { binding: { activeClipId: "Run" } }));
    expect(boundOnly.animationState()!.activeClip).toBe("Run");
    const specOnly = createPrd06ActorAnimationApi(fakeModelHandle("specd", { clip: "Idle" }));
    expect(specOnly.animationState()!.activeClip).toBe("Idle");
  });

  it("reflects a live apply result on every call (tracksApplied moves between frames)", () => {
    let apply = applyResult({ tracksApplied: 10 });
    registerActorAnimationApplySource("hero", () => apply);
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero"));
    expect(api.animationState()!.tracksApplied).toBe(10);
    apply = applyResult({ tracksApplied: 44 });
    expect(api.animationState()!.tracksApplied).toBe(44);
  });
});

describe("prd06 socket() (T0.18 interim bone read, C-19)", () => {
  beforeEach(() => {
    resetActorAnimationStateSources();
  });

  it("returns the live bone world matrix and updates between frames", () => {
    let hips = new Float32Array(16);
    hips.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1]);
    registerActorBoneMatrixSource("hero", (bone) => (bone === "Hips" ? hips : null));
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero"));
    const socket = api.socket("Hips");
    expect(socket.valid).toBe(true);
    const first = socket.worldMatrix();
    expect(first[13]).toBe(1);
    hips = new Float32Array(16);
    hips.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.3, 0.2, 1]);
    const second = socket.worldMatrix();
    expect(second[13]).toBeCloseTo(1.3, 5);
    expect(second[14]).toBeCloseTo(0.2, 5);
    expect([...second]).not.toEqual([...first]);
  });

  it("writes into the caller's out array and honours valid=false for unknown bones", () => {
    registerActorBoneMatrixSource("hero", (bone) => (bone === "Hips" ? new Float32Array(16).fill(2) : null));
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero"));
    const out = new Float32Array(16);
    const returned = api.socket("Hips").worldMatrix(out);
    expect(returned).toBe(out);
    expect(out[0]).toBe(2);
    const missing = api.socket("NoSuchBone");
    expect(missing.valid).toBe(false);
    expect(missing.worldMatrix()[15]).toBe(0);
  });

  it("T3.6 — ANIMATION_SOCKET_UNKNOWN_BONE warns once per (node, bone) once loaded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Actor loaded (registered) but the bone lookup knows no "Nope".
    registerPrd06AnimationActor({ id: "hero", animation: undefined, pipeline: { resources: { scene: { traverse: () => {} } } } } as never);
    registerActorBoneMatrixSource("hero", () => null);
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero"));
    const missing = api.socket("Nope");
    expect(missing.valid).toBe(false);
    missing.worldMatrix();
    missing.worldMatrix();
    const calls = warn.mock.calls.filter((c) => String(c[0]).includes(ANIMATION_SOCKET_UNKNOWN_BONE));
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toContain("hero");
    expect(String(calls[0]![0])).toContain("Nope");
    // A different bone warns separately (per-bone keying).
    api.socket("Other").valid;
    expect(warn.mock.calls.filter((c) => String(c[0]).includes(ANIMATION_SOCKET_UNKNOWN_BONE))).toHaveLength(2);
    warn.mockRestore();
  });

  it("T3.6 — socket reads post-constraint values (bone matrix source is live)", () => {
    // The extension's bone source reads node.transform.worldMatrix per call,
    // which the runtime updates after constraints write the pose — so the
    // socket matrix automatically reflects post-constraint values.
    const hips = new Float32Array(16);
    hips.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 9, 0, 1]);
    let source: Record<string, Float32Array | null> = { Hips: hips };
    registerActorBoneMatrixSource("hero", (bone) => source[bone] ?? null);
    const api = createPrd06ActorAnimationApi(fakeModelHandle("hero"));
    expect(api.socket("Hips").worldMatrix()[13]).toBe(9);
    // Simulate a constraint having rewritten the node transform: the next
    // read sees the new value without re-registration.
    const moved = new Float32Array(16);
    moved.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 4.5, 0, 1]);
    source = { Hips: moved };
    expect(api.socket("Hips").worldMatrix()[13]).toBeCloseTo(4.5, 5);
  });
});

describe("prd06 C-31 animation diagnostics collect (T0.18)", () => {
  beforeEach(() => {
    resetActorAnimationStateSources();
  });

  it("emits one row per registered actor with lastApply fields mapped", () => {
    registerActorAnimationApplySource("thief", () => applyResult({ clipName: "sprint", tracksApplied: 65, blendedClipCount: 2, morphWeightTracksApplied: 3, missingTargets: ["morphX"] }));
    registerActorAnimationApplySource("guard-2", () => null);
    const diagnostics = collectPrd06AnimationDiagnostics();
    expect(diagnostics.actors.map((a) => a.id).sort()).toEqual(["guard-2", "thief"]);
    const thief = diagnostics.actors.find((a) => a.id === "thief")!;
    expect(thief.activeClip).toBe("sprint");
    expect(thief.tracksApplied).toBe(65);
    expect(thief.activeActions).toBe(2);
    expect(thief.morphActive).toBe(3);
    expect(thief.morphDropped).toBe(1);
    const guard = diagnostics.actors.find((a) => a.id === "guard-2")!;
    expect(guard.tracksApplied).toBe(0);
    expect(guard.activeClip).toBeNull();
  });

  it("reports 0 for the not-yet-instrumented timing fields (diagnosticOnly.prd06)", () => {
    registerActorAnimationApplySource("thief", () => applyResult());
    const [row] = collectPrd06AnimationDiagnostics().actors;
    expect(row!.mixerMs).toBe(0);
    expect(row!.constraintsMs).toBe(0);
    expect(row!.springsMs).toBe(0);
    expect(row!.paletteBytes).toBe(0);
    expect(row!.cpuMs).toBe(0);
  });
});

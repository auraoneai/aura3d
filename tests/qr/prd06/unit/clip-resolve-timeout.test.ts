// 06-HANG (PRD-16 §4.6, #409): the actor clip-resolve wait is bounded. A
// binding whose `resolveAnimationClips()` never settles publishes with
// registry durations after ANIMATION_CLIP_RESOLVE_TIMEOUT_MS (2 s) and queues
// an `ANIMATION_CLIP_RESOLVE_TIMEOUT` C-36 degradation; a rejected resolve
// publishes too and queues `ANIMATION_CLIP_RESOLVE_FAILED`.

import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationController } from "../../../../packages/engine/src/agent-api/AnimationController";
import type { RuntimeNodeHandleLike, RuntimeNodeVec3 } from "../../../../packages/engine/src/agent-api/RuntimeNodeHandle";
import type { AuraResolvedClipInfo } from "../../../../packages/engine/src/contracts/animation";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { takeClipApplyDegradations } from "../../../../packages/engine/src/agent-api/compiler/animation";
import {
  resetActorClipInfoSources,
  resetQrAnimationFlags,
  setQrAnimationFlags
} from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle";

type StubNode = RuntimeNodeHandleLike & { latestAnimation?: unknown };

function nodeStub(id: string, resolveAnimationClips: () => Promise<readonly AuraResolvedClipInfo[]>): StubNode {
  const node = {
    id,
    kind: "model",
    tags: [],
    position: [0, 0, 0] as RuntimeNodeVec3,
    rotation: [0, 0, 0] as RuntimeNodeVec3,
    scale: 1,
    visible: true,
    resolveAnimationClips,
    setPosition: () => node,
    translate: () => node,
    setRotation: () => node,
    setScale: () => node,
    setVisible: () => node,
    play(clip: string, options = {}) {
      node.latestAnimation = { clip, ...options };
      return node;
    },
    setAnimation(animation: unknown) {
      node.latestAnimation = animation;
      return node;
    },
    setAnimationBinding: () => node,
    setAnimationPose: () => node,
    setMorphTarget: () => node,
    setMorphTargets: () => node,
    morphTargets: () => ({}),
    snapshot: () => ({ id })
  } as unknown as StubNode;
  return node;
}

afterEach(() => {
  vi.useRealTimers();
  resetQrAnimationFlags();
  resetActorClipInfoSources();
  takeClipApplyDegradations();
});

describe("06-HANG bounded clip-resolve wait", () => {
  it("publishes with registry durations and queues ANIMATION_CLIP_RESOLVE_TIMEOUT after 2 s", async () => {
    vi.useFakeTimers();
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"], env: {} }));
    const controller = new AnimationController<string>();
    controller.registerEmbeddedGLBClips({ assetId: "glb-1", clips: ["Walk"] });
    const never = new Promise<readonly AuraResolvedClipInfo[]>(() => undefined);
    const node = nodeStub("actor-hang", () => never);
    controller.play("Walk", { loop: "loop" });
    controller.bindRuntimeNode(node, { defaultClipId: "Walk" });
    controller.update(0.1);
    expect(node.latestAnimation).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_999);
    expect(node.latestAnimation).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(node.latestAnimation).toMatchObject({ clip: "Walk" });

    const degradations = takeClipApplyDegradations();
    expect(degradations).toHaveLength(1);
    expect(degradations[0]).toMatchObject({ code: "clip-apply-failed", nodeId: "actor-hang" });
    expect(degradations[0]!.message.startsWith("ANIMATION_CLIP_RESOLVE_TIMEOUT:")).toBe(true);
  });

  it("does not fire the timeout when clips resolve in time", async () => {
    vi.useFakeTimers();
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"], env: {} }));
    const controller = new AnimationController<string>();
    controller.registerEmbeddedGLBClips({ assetId: "glb-1", clips: ["Walk"] });
    const node = nodeStub("actor-ok", async () => [{ name: "Walk", duration: 2.367, channelCount: 6, hasRootMotionCandidate: false }]);
    controller.play("Walk", { loop: "loop" });
    controller.bindRuntimeNode(node, { defaultClipId: "Walk" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(node.latestAnimation).toMatchObject({ clip: "Walk" });
    expect(takeClipApplyDegradations()).toHaveLength(0);
  });

  it("publishes and queues ANIMATION_CLIP_RESOLVE_FAILED when the resolve rejects", async () => {
    setQrAnimationFlags(resolveQrFlags({ options: ["animation"], env: {} }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = new AnimationController<string>();
    controller.registerEmbeddedGLBClips({ assetId: "glb-1", clips: ["Walk"] });
    const node = nodeStub("actor-fail", () => Promise.reject(new Error("no clip source")));
    controller.play("Walk", { loop: "loop" });
    controller.bindRuntimeNode(node, { defaultClipId: "Walk" });
    await vi.waitFor(() => expect(node.latestAnimation).toMatchObject({ clip: "Walk" }));
    const degradations = takeClipApplyDegradations();
    expect(degradations).toHaveLength(1);
    expect(degradations[0]!.message.startsWith("ANIMATION_CLIP_RESOLVE_FAILED:")).toBe(true);
    warn.mockRestore();
  });
});

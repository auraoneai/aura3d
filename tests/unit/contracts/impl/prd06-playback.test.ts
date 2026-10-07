/**
 * PRD-06 impl evidence (C-19 real, T0.3) — the runtime-node animation binding
 * publishes the controller's weighted clip samples (with per-sample layer and
 * body mask) while `A3D_QR_ANIMATION` is on, and its shape is byte-identical
 * when the flag is off. The field lands on
 * `AuraRuntimeNodeAnimationBindingMetadata` via CCR-06-5.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createAnimationController } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { AuraRuntimeNodeAnimationBindingMetadata } from "../../../../packages/engine/src/agent-api/RuntimeNodeHandle";
import {
  QR_EMPTY_FLAGS,
  qrAnimationFlags,
  resetQrAnimationFlags,
  setQrAnimationFlags
} from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle";

function qrFlags(...shortNames: string[]) {
  return resolveQrFlags({ options: shortNames, env: {} });
}

function fakeRuntimeNode() {
  const calls: { bindings: (AuraRuntimeNodeAnimationBindingMetadata | undefined)[] } = { bindings: [] };
  const node = {
    id: "node-1",
    setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined) { calls.bindings.push(binding); return this; },
    setAnimationPose() { return this; },
    setMorphTargets() { return this; }
  };
  return { node, calls };
}

function controllerWithClips(id: string) {
  const controller = createAnimationController({ id });
  controller.registerEmbeddedGLBClips({
    assetId: "asset-1",
    clips: [{ id: "walk", duration: 2, tracks: [] }]
  });
  return controller;
}

afterEach(() => {
  resetQrAnimationFlags();
});

describe("runtime binding clipSamples metadata (T0.3)", () => {
  it("publishes weighted clip samples on the binding while the flag is on", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const controller = controllerWithClips("ctrl-impl-1");
    const { node, calls } = fakeRuntimeNode();
    controller.play("walk");
    controller.bindRuntimeNode(node as never, {});
    const last = calls.bindings.at(-1) as { clipSamples?: unknown[] } | undefined;
    expect(last?.clipSamples).toEqual([
      { clipId: "walk", clipName: "walk", localTime: 0, weight: 1, layer: "base", additive: undefined, mask: undefined }
    ]);
  });

  it("carries the layer body mask onto each published sample", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const controller = controllerWithClips("ctrl-impl-2");
    controller.registerLayerMetadata({
      id: "upper",
      role: "upper-body",
      bodyMask: "upper-body",
      bones: ["Spine", "Spine1", "Neck", "Head"],
      excludedBones: ["Hips"]
    });
    const { node, calls } = fakeRuntimeNode();
    controller.play("walk", { layer: "upper" });
    controller.bindRuntimeNode(node as never, {});
    const last = calls.bindings.at(-1) as { clipSamples?: { mask?: unknown }[] } | undefined;
    expect(last?.clipSamples?.[0]?.mask).toEqual({
      include: ["Spine", "Spine1", "Neck", "Head"],
      exclude: ["Hips"],
      humanoid: "upper-body"
    });
  });

  it("leaves the binding metadata shape unchanged when the flag is off", () => {
    setQrAnimationFlags(qrFlags());
    const controller = controllerWithClips("ctrl-impl-3");
    const { node, calls } = fakeRuntimeNode();
    controller.play("walk");
    controller.bindRuntimeNode(node as never, {});
    const last = calls.bindings.at(-1) as { clipSamples?: unknown[] } | undefined;
    expect(last?.clipSamples).toBeUndefined();
  });
});

describe("qrAnimationFlags plumbing", () => {
  it("honours the installed flags, the empty seam, and resets cleanly", () => {
    setQrAnimationFlags(qrFlags("animation"));
    expect(qrAnimationFlags().on("A3D_QR_ANIMATION")).toBe(true);
    setQrAnimationFlags(QR_EMPTY_FLAGS);
    expect(qrAnimationFlags().on("A3D_QR_ANIMATION")).toBe(false);
    resetQrAnimationFlags();
    expect(qrAnimationFlags().on("A3D_QR_ANIMATION")).toBe(false);
  });
});

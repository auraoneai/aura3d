import { describe, expect, it } from "vitest";
import { createEmbeddedGLBAnimationClipRegistryMetadata } from "../../../packages/engine/src/agent-api/AnimationController";

describe("embedded GLB clip registry from a generated typed asset", () => {
  it("prefers animationClipDetails objects over the animationClips name list so durations survive", () => {
    const asset = {
      kind: "aura-asset-ref", id: "windmill", type: "model", url: "/aura-assets/windmill.glb",
      metadata: {
        animationClips: ["rotor_spin"],
        animationClipDetails: [{ name: "rotor_spin", duration: 4, channelCount: 1 }]
      }
    };
    const registry = createEmbeddedGLBAnimationClipRegistryMetadata(asset as never);
    expect(registry.clips).toEqual([{ name: "rotor_spin", duration: 4, channelCount: 1 }]);
  });

  it("falls back to the name list when no details are present", () => {
    const asset = { kind: "aura-asset-ref", id: "a", type: "model", metadata: { animationClips: ["idle"] } };
    expect(createEmbeddedGLBAnimationClipRegistryMetadata(asset as never).clips).toEqual(["idle"]);
  });
});

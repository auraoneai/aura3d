// PRD-06 T0.3 harness: binds an animation controller to a runtime node inside a
// real createAuraApp and reports what reached the runtime-node animation
// binding. Flags come from `?a3d-qr=<list>` exactly like the capture tooling.

import { createAnimationController, createAuraApp, lights, model, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __PRD06_CLIP_SAMPLES__?: {
      readonly status: "ready" | "error";
      readonly clipSamples?: readonly unknown[];
      readonly bindingKind?: string;
      readonly error?: string;
    };
  }
}

try {
  const flags = (new URL(location.href).searchParams.get("a3d-qr") ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const app = createAuraApp("#app", {
    scene: scene()
      .add(model({
        type: "model",
        format: "glb",
        url: "/fixtures/threejs-parity/assets/character/soldier.glb",
        metadata: { animations: ["Idle", "Walk", "Run", "TPose"] }
      }).runtime({ id: "hero" }))
      .add(lights.studio()),
    qualityRebuild: { flags }
  });

  const hero = app.nodes.require("hero");
  const controller = createAnimationController({
    id: "prd06-harness-controller",
    clipRegistry: {
      assetId: "soldier",
      clips: [
        { id: "Walk", duration: 2.5 },
        { id: "Idle", duration: 3 }
      ]
    }
  });
  controller.play("Walk");
  controller.bindRuntimeNode(hero as never, { id: "hero-animation" });

  const binding = hero.snapshot().animationBinding as { readonly kind?: string; readonly clipSamples?: readonly unknown[] } | undefined;
  window.__PRD06_CLIP_SAMPLES__ = {
    status: "ready",
    bindingKind: binding?.kind,
    clipSamples: binding?.clipSamples
  };
} catch (error) {
  window.__PRD06_CLIP_SAMPLES__ = {
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  };
}

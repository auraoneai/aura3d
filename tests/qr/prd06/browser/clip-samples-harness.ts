// PRD-06 T0.3 harness: binds an animation controller to a runtime node inside a
// real createAuraApp and reports what reached the runtime-node animation
// binding. Flags come from `?a3d-qr=<list>` exactly like the capture tooling.

import { createAnimationController, createAuraApp, defineAuraAssets, lights, model, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __PRD06_CLIP_SAMPLES__?: {
      readonly status: "ready" | "error";
      readonly clipSamples?: readonly { clipName?: string; weight?: number }[];
      readonly bindingKind?: string;
      readonly error?: string;
    };
  }
}

const harnessAssets = defineAuraAssets({
  soldier: {
    type: "model",
    format: "glb",
    url: "/fixtures/threejs-parity/assets/character/soldier.glb",
    metadata: { animations: ["Idle", "Walk", "Run", "TPose"] }
  }
} as const);

try {
  const flags = (new URL(location.href).searchParams.get("a3d-qr") ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const app = createAuraApp("#app", {
    scene: scene()
      .add(model(harnessAssets.soldier).runtime({ id: "hero" }))
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

  // Flag-on `bindRuntimeNode` defers the binding publish until
  // `resolveAnimationClips` settles (the C-19 api needs the actor loaded, i.e.
  // mount). Poll the snapshot instead of reading once — the flag-off leg has
  // no pendingClips and publishes synchronously, so this resolves on the
  // first tick there.
  const deadline = Date.now() + 240_000;
  const readBinding = () => hero.snapshot().animationBinding as
    | { readonly kind?: string; readonly clipSamples?: readonly unknown[] }
    | undefined;
  const waitForBinding = async (): Promise<void> => {
    while (Date.now() < deadline) {
      if (readBinding()?.kind !== undefined) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };
  waitForBinding()
    .then(() => {
      const binding = readBinding();
      window.__PRD06_CLIP_SAMPLES__ = {
        status: "ready",
        bindingKind: binding?.kind,
        clipSamples: binding?.clipSamples as readonly { clipName?: string; weight?: number }[] | undefined
      };
    })
    .catch((error: unknown) => {
      window.__PRD06_CLIP_SAMPLES__ = {
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    });
} catch (error) {
  window.__PRD06_CLIP_SAMPLES__ = {
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  };
}

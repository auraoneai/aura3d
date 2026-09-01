import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";

declare global {
  interface Window {
    __PULSE_TUNNEL_V2_ART_REVIEW__?: {
      readonly ready: boolean;
      readonly backend: string | undefined;
      readonly drawCalls: number;
      readonly errors: readonly string[];
    };
    __PULSE_TUNNEL_V2_ART_REVIEW_ERROR__?: string;
  }
}

const interceptorUrl = new URL("../assets/models/pulseV2InterceptorCraft.glb", import.meta.url).href;
const dreadnoughtUrl = new URL("../assets/models/pulseV2TerminalDreadnought.glb", import.meta.url).href;

// These page-local refs exist only to exercise root createAuraApp's GLB bridge.
// They are deliberately not added to any manifest or generated type map.
const interceptor: AuraAssetRef<"model", "pulseV2InterceptorCraftArtCandidate"> = {
  type: "model",
  format: "glb",
  url: interceptorUrl,
  hash: "sha256-38cc96855c425ee860ded1f87c6e17e1bbb336503bac8855e7616a521f74390c",
  bounds: [3.301, 0.989, 2.978],
  sizeBytes: 197584,
  metadata: { license: "CC0-1.0", role: "unregistered art candidate" }
};
const dreadnought: AuraAssetRef<"model", "pulseV2TerminalDreadnoughtArtCandidate"> = {
  type: "model",
  format: "glb",
  url: dreadnoughtUrl,
  hash: "sha256-a690527be6d60dd8d3c45b62bdaa4f13a1ad39df4772d91d4f59c9d7e9f79fc0",
  bounds: [5.499, 2.77, 2.571],
  sizeBytes: 263940,
  metadata: { license: "CC0-1.0", role: "unregistered art candidate" }
};

void render().catch((error: unknown) => {
  window.__PULSE_TUNNEL_V2_ART_REVIEW_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function render(): Promise<void> {
  const stage = document.querySelector<HTMLElement>("#stage");
  if (!stage) throw new Error("Pulse Tunnel V2 art-review stage is missing.");
  const app = createAuraApp("#stage", {
    pixelRatio: 1,
    resize: true,
    // Safe-basic is intentional for this unregistered art review. Production
    // correctly rejects raw candidate URLs until a later registration lane.
    renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
    scene: scene()
      .background("#07101c")
      .camera(camera.perspective({
        position: [0.2, 1.88, 8.9],
        target: [0.38, 0.78, -3.8],
        fov: 50
      }))
      .add(primitives.box({
        name: "neutral review deck",
        material: material.pbr({
          name: "review deck gunmetal",
          color: "#0d1826",
          metallic: 0.72,
          roughness: 0.36
        })
      }).position(0, -0.12, -2.8).scale([4.8, 0.09, 9.6]))
      .add(model(interceptor, { name: "unregistered V2 interceptor candidate" })
        .position(-1.34, 0.42, 0.55)
        .rotate(0, -0.04, 0)
        .scale(1.5))
      .add(model(dreadnought, { name: "unregistered V2 terminal dreadnought candidate" })
        .position(1.16, 0.12, -3.95)
        .rotate(0, 0.05, 0)
        .scale(2.9))
      .add(effects.neonBloom({ intensity: 0.52, threshold: 0.74, maxIntensity: 1.05, antiBlowout: true }))
      .add(lights.ambient({ name: "review ambient", color: "#71849f", intensity: 1.8 }))
      .add(lights.directional({ name: "review neutral key", color: "#d9edff", intensity: 2.8 }).position(-4.5, 8.5, 6.2))
      .add(lights.point({ name: "interceptor cyan rim", color: "#49ddff", intensity: 4.2 }).position(-2.1, 1.25, 2.6))
      .add(lights.point({ name: "dreadnought warm key", color: "#ffad66", intensity: 5.2 }).position(3.0, 2.8, -3.2))
      .add(lights.point({ name: "dreadnought rose rim", color: "#ff4d8f", intensity: 3.0 }).position(-1.6, 2.1, -4.5))
  });

  const mirrorDiagnostics = window.setInterval(() => {
    const diagnostics = app.diagnostics();
    stage.dataset.reviewDiagnostics = JSON.stringify({
      backend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      assets: diagnostics.assets,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors
    });
  }, 250);

  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 30_000);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.clearInterval(mirrorDiagnostics);
  const diagnostics = app.diagnostics();
  window.__PULSE_TUNNEL_V2_ART_REVIEW__ = {
    ready: diagnostics.drawCalls > 0 && diagnostics.errors.length === 0,
    backend: diagnostics.renderer?.runtime.backend,
    drawCalls: diagnostics.drawCalls,
    errors: diagnostics.errors
  };
  stage.dataset.reviewReady = JSON.stringify(window.__PULSE_TUNNEL_V2_ART_REVIEW__);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the Pulse Tunnel V2 art-review render.");
}

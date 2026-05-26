import { createDiagnosticsPanel, createEnvironment, createA3DApp, workflows } from "@aura3d/engine";

declare global {
  interface Window {
    __A3D_TEMPLATE_PRODUCT_VIEWER__?: unknown;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Missing #app canvas.");

const app = await createA3DApp({ canvas, quality: "production", width: 1280, height: 720 });
const environment = createEnvironment({ target: "gallery-neutral-hdr", intensity: 1.2, backgroundIntensity: 0.72 });
const workflow = await workflows.sceneShowcase({ preset: "gallery" });
const render = app.renderer?.render(workflow.source, workflow.camera);
const diagnostics = app.diagnostics();
const panel = createDiagnosticsPanel({ render });
window.__A3D_TEMPLATE_PRODUCT_VIEWER__ = {
  status: "ready",
  template: "external-parity-product-viewer",
  workflowKind: workflow.kind,
  environmentTarget: environment.target,
  environmentCapabilities: environment.capabilities,
  diagnosticsPanel: panel.snapshot(),
  quality: diagnostics.quality.preset,
  drawCalls: render?.drawCalls ?? 0,
  claimBoundary: "Installable template proof for V4 Milestone 14. Same-scene Three.js parity remains required."
};

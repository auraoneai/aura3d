import { createDiagnosticsPanel, createG3DApp, workflows } from "@galileo3d/engine";

declare global {
  interface Window {
    __G3D_V4_POSTPROCESS_EXAMPLE__?: unknown;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
const status = document.getElementById("status");
if (!canvas) throw new Error("Missing #app canvas.");

const app = await createG3DApp({ canvas, quality: "production", width: 1280, height: 720 });
const workflow = await workflows.sceneShowcase({ preset: "gallery" });
const render = app.renderer?.render({
  ...workflow.source,
  postprocess: {
    toneMapping: "aces",
    exposure: 1.08,
    bloom: { threshold: 1.05, intensity: 0.18 },
    ssao: { radius: 0.58, intensity: 0.34 },
    depthOfField: { focusDistance: 3.4, aperture: 0.02 },
    colorGrade: { contrast: 1.08, saturation: 1.04 }
  }
}, workflow.camera);
const panel = createDiagnosticsPanel({ render });
const state = {
  status: "ready",
  example: "postprocess-v4",
  workflowKind: workflow.kind,
  effects: ["tone-mapping", "bloom", "ssao", "depth-of-field", "color-grade"],
  diagnosticsPanel: panel.snapshot(),
  drawCalls: render?.drawCalls ?? 0,
  claimBoundary: "Postprocess tutorial example for supported V4 workflows; effects must not hide poor lighting or material failures."
};
window.__G3D_V4_POSTPROCESS_EXAMPLE__ = state;
if (status) status.textContent = JSON.stringify(state, null, 2);

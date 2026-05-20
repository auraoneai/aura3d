import { createDiagnosticsPanel, createEnvironment, createG3DApp, workflows } from "@galileo3d/engine";

declare global {
  interface Window {
    __G3D_TEMPLATE_MATERIAL_STUDIO__?: unknown;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
const status = document.getElementById("status");
if (!canvas) throw new Error("Missing #app canvas.");

const app = await createG3DApp({ canvas, quality: "production", width: 1280, height: 720 });
const environment = createEnvironment({ target: "studio-softbox-hdr", intensity: 1.28, backgroundIntensity: 0.62 });
const workflow = await workflows.materialStudio({ mode: "metals" });
const render = app.renderer?.render(workflow.source);
const diagnostics = app.diagnostics();
const panel = createDiagnosticsPanel({ render });
const state = {
  status: "ready",
  template: "v4-material-studio",
  workflowKind: workflow.kind,
  environmentTarget: environment.target,
  environmentCapabilities: environment.capabilities,
  diagnosticsPanel: panel.snapshot(),
  quality: diagnostics.quality.preset,
  drawCalls: render?.drawCalls ?? 0,
  claimBoundary: "Installable material-studio template proof. Three.js parity and broad renderer replacement remain bounded."
};
window.__G3D_TEMPLATE_MATERIAL_STUDIO__ = state;
if (status) status.textContent = JSON.stringify(state, null, 2);

import { createG3DApp } from "@galileo3d/apps";

declare global {
  interface Window {
    __G3D_V4_PUBLIC_API_APP__?: unknown;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='hr4-public-api-canvas']");
const state = document.querySelector<HTMLElement>("[data-testid='hr4-public-api-state']");
if (!canvas || !state) throw new Error("Missing public API test app DOM.");

const app = await createG3DApp({ canvas, quality: "balanced", width: 960, height: 540 });
const workflow = await app.renderWorkflow("scene-showcase", { preset: "gallery" });
const diagnostics = app.diagnostics();
window.__G3D_V4_PUBLIC_API_APP__ = {
  status: "ready",
  workflowKind: workflow.kind,
  appState: diagnostics.appState,
  quality: diagnostics.quality,
  workflowRuns: diagnostics.workflowRuns,
  lastWorkflow: diagnostics.lastWorkflow,
  drawCalls: diagnostics.lastRender?.drawCalls ?? 0,
  claimBoundary: "Milestone 13 public API proof only; installable templates, external package proof, and Three.js parity remain required."
};
state.textContent = JSON.stringify(window.__G3D_V4_PUBLIC_API_APP__, null, 2);

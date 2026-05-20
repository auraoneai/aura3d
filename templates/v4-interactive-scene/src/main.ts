import { createDiagnosticsPanel, createEnvironment, createG3DApp, workflows } from "@galileo3d/engine";

declare global {
  interface Window {
    __G3D_TEMPLATE_INTERACTIVE_SCENE__?: unknown;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
const status = document.getElementById("status");
const step = document.getElementById("step");
if (!canvas) throw new Error("Missing #app canvas.");

const app = await createG3DApp({ canvas, quality: "production", width: 1280, height: 720 });
const environment = createEnvironment({ target: "warehouse-industrial-hdr", intensity: 1.12, backgroundIntensity: 0.64 });
const workflow = await workflows.interactiveScene({ preset: "orbiting-products" });
let timeSeconds = 0;

function renderState(): void {
  const source = workflow.update(timeSeconds);
  const render = app.renderer?.render(source);
  const diagnostics = app.diagnostics();
  const panel = createDiagnosticsPanel({ render });
  const state = {
    status: "ready",
    template: "v4-interactive-scene",
    workflowKind: workflow.kind,
    environmentTarget: environment.target,
    environmentCapabilities: environment.capabilities,
    diagnosticsPanel: panel.snapshot(),
    quality: diagnostics.quality.preset,
    drawCalls: render?.drawCalls ?? 0,
    timeSeconds,
    claimBoundary: "Installable interactive-scene template proof. It proves public workflow setup, not broad game-engine replacement."
  };
  window.__G3D_TEMPLATE_INTERACTIVE_SCENE__ = state;
  if (status) status.textContent = JSON.stringify(state, null, 2);
}

step?.addEventListener("click", () => {
  timeSeconds += 0.75;
  renderState();
});
renderState();

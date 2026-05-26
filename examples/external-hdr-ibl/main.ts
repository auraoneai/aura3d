import { createDiagnosticsPanel, createEnvironment, createA3DApp, workflows } from "@aura3d/engine";

declare global {
  interface Window {
    __A3D_EXTERNAL_PARITY_HDR_IBL_EXAMPLE__?: unknown;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
const status = document.getElementById("status");
if (!canvas) throw new Error("Missing #app canvas.");

const app = await createA3DApp({ canvas, quality: "production", width: 1280, height: 720 });
const environments = [
  createEnvironment({ target: "studio-softbox-hdr", intensity: 1.28 }),
  createEnvironment({ target: "gallery-neutral-hdr", intensity: 1.1 }),
  createEnvironment({ target: "outdoor-overcast-hdr", intensity: 1.0 })
];
const workflow = await workflows.materialStudio({ mode: "metals" });
const render = app.renderer?.render(workflow.source);
const panel = createDiagnosticsPanel({ render });
const state = {
  status: "ready",
  example: "external-hdr-ibl",
  workflowKind: workflow.kind,
  environmentTargets: environments.map((environment) => environment.target),
  capabilities: environments.flatMap((environment) => environment.capabilities),
  diagnosticsPanel: panel.snapshot(),
  drawCalls: render?.drawCalls ?? 0,
  claimBoundary: "HDR/IBL tutorial example for supported ExternalParity workflows; not a full HDR renderer parity claim."
};
window.__A3D_EXTERNAL_PARITY_HDR_IBL_EXAMPLE__ = state;
if (status) status.textContent = JSON.stringify(state, null, 2);

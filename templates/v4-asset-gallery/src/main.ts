import { createAssetDiagnostics, createDiagnosticsPanel, createEnvironment, createG3DApp, workflows } from "@galileo3d/engine";

declare global {
  interface Window {
    __G3D_TEMPLATE_ASSET_GALLERY__?: unknown;
  }
}

const canvas = document.getElementById("app") as HTMLCanvasElement | null;
const status = document.getElementById("status");
if (!canvas) throw new Error("Missing #app canvas.");

const app = await createG3DApp({ canvas, quality: "production", width: 1280, height: 720 });
const environment = createEnvironment({ target: "gallery-neutral-hdr", intensity: 1.15, backgroundIntensity: 0.7 });
const workflow = await workflows.assetViewer({
  url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/BoomBox/glTF-Binary/BoomBox.glb",
  type: "gltf"
});
const render = app.renderer?.render(workflow.source, workflow.camera);
const diagnostics = app.diagnostics();
const assetDiagnostics = createAssetDiagnostics(workflow.asset);
const panel = createDiagnosticsPanel({ render, asset: assetDiagnostics });
const state = {
  status: "ready",
  template: "v4-asset-gallery",
  workflowKind: workflow.kind,
  environmentTarget: environment.target,
  environmentCapabilities: environment.capabilities,
  diagnosticsPanel: panel.snapshot(),
  assetDiagnostics,
  quality: diagnostics.quality.preset,
  drawCalls: render?.drawCalls ?? 0,
  claimBoundary: "Installable asset-gallery template proof. It uses a public Khronos sample asset and public package APIs only."
};
window.__G3D_TEMPLATE_ASSET_GALLERY__ = state;
if (status) status.textContent = JSON.stringify(state, null, 2);

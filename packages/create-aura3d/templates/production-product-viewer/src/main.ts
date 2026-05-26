import { createProductViewer, loadGltfScene, loadHdrEnvironment } from "@aura3d/engine/production-runtime";

const canvas = document.getElementById("viewport");
const metrics = document.getElementById("metrics");
if (!(canvas instanceof HTMLCanvasElement) || !(metrics instanceof HTMLElement)) {
  throw new Error("A3D V6 Product Viewer requires canvas#viewport and #metrics.");
}

const asset = await loadGltfScene({
  url: "/fixtures/asset-corpus/damaged-helmet.glb",
  assetId: "damaged-helmet",
  assetName: "Damaged Helmet",
  viewport: { width: canvas.width, height: canvas.height }
});
const environment = await loadHdrEnvironment({
  url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
  id: "studio-small-08",
  label: "Studio Small 08",
  intensity: 1.2,
  toneMapping: { operator: "filmic", exposure: 1.08, whitePoint: 11.2 }
});
const viewer = await createProductViewer({
  canvas,
  asset,
  environment,
  width: canvas.width,
  height: canvas.height,
  camera: { preset: "product-hero", orbit: true },
  lighting: { ibl: true, shadows: true },
  postprocess: { toneMapping: "filmic", bloom: true, fxaa: true }
});

function render(label = "ready"): void {
  const result = viewer.render();
  const diagnostics = viewer.diagnostics();
  metrics.innerHTML = `
    <span>${label}</span>
    <span>${result.proof.diagnostics.drawCalls} draw calls</span>
    <span>${asset.metadata.materialCount} materials</span>
    <span>${asset.metadata.textureCount} textures</span>
    <span>${diagnostics.settings.exposure.toFixed(2)} exposure</span>
    <span>${diagnostics.settings.iblIntensity.toFixed(2)} IBL</span>
  `;
}

document.getElementById("exposure")?.addEventListener("input", (event) => {
  viewer.setSettings({ exposure: Number((event.target as HTMLInputElement).value) });
  render("exposure changed");
});
document.getElementById("ibl")?.addEventListener("input", (event) => {
  viewer.setSettings({ iblIntensity: Number((event.target as HTMLInputElement).value) });
  render("IBL changed");
});
document.getElementById("orbit")?.addEventListener("click", () => {
  viewer.controls.rotate(0.2, 0);
  render("orbit");
});
document.getElementById("capture")?.addEventListener("click", () => {
  window.__a3dProductViewerCapture = viewer.captureScreenshot();
  render("captured");
});

declare global {
  interface Window {
    __a3dProductViewerCapture?: string;
  }
}

render();

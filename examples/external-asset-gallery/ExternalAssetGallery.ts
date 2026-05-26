import { createGLTFCorpusReport, type GLTFCorpusAsset, type GLTFCorpusManifest } from "@aura3d/assets";

declare global {
  interface Window {
    __AURA3D_ASSET_STUDIO__?: unknown;
  }
}

const manifestPath = "/tests/assets/corpus/gltf-corpus.manifest.json";
const claimBoundary = "Asset Studio Pro proof only; release claims require current rendered screenshots, same-scene Three.js parity, and final package/template proof.";

export async function mountExternalAssetGallery(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:360px 1fr;height:100vh;background:#101317;color:#f5f1e8;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #303843;padding:18px;overflow:auto">
        <h1 style="font-size:20px;margin:0 0 14px">Asset Studio Pro</h1>
        <label>Asset <select data-testid="hr4-asset-select"></select></label>
        <pre data-testid="hr4-asset-status" style="white-space:pre-wrap;background:#171d24;padding:12px;margin-top:16px;max-height:42vh;overflow:auto">loading</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 190px;min-width:0">
        <canvas data-testid="hr4-asset-canvas" width="1280" height="720" style="width:100%;height:100%;display:block;background:#14181e"></canvas>
        <div data-testid="hr4-asset-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px;border-top:1px solid #303843;overflow:hidden"></div>
      </section>
    </main>`;

  const manifest = await fetch(manifestPath).then((response) => {
    if (!response.ok) throw new Error(`Failed to load ${manifestPath}: ${response.status}`);
    return response.json() as Promise<GLTFCorpusManifest>;
  });
  const report = createGLTFCorpusReport(manifest, "2026-05-06T00:00:00.000Z");
  const select = root.querySelector<HTMLSelectElement>("[data-testid='hr4-asset-select']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-asset-status']")!;
  const grid = root.querySelector<HTMLElement>("[data-testid='hr4-asset-grid']")!;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='hr4-asset-canvas']")!;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Asset Studio Pro requires a 2D preview canvas.");

  select.innerHTML = manifest.assets.map((asset) => `<option value="${asset.id}">${asset.id}</option>`).join("");
  grid.innerHTML = manifest.assets.slice(0, 18).map((asset) => `
    <button data-asset-id="${asset.id}" style="text-align:left;border:1px solid #303843;background:#19202a;color:#f5f1e8;padding:8px;min-height:68px">
      <strong>${asset.id}</strong><br><span style="color:#aeb7c2">${asset.tags.slice(0, 3).join(", ")}</span>
    </button>`).join("");

  function render(): void {
    const selected = manifest.assets.find((asset) => asset.id === select.value) ?? manifest.assets[0]!;
    drawAssetPreview(context, canvas, selected);
    const diagnostics = createAssetDiagnostics(selected, manifest);
    const visualEvidenceSlots = manifest.assets.filter((asset) => asset.expectedStatus === "pass").length;
    const advancedMaterialAssets = manifest.assets.filter((asset) => asset.tags.some((tag) => /material|pbr|texture|extension/i.test(tag))).length;
    const animationSkinMorphAssets = manifest.assets.filter((asset) => asset.tags.some((tag) => /animation|skin|skinning|morph/i.test(tag))).length;
    const licenseReviewRequired = manifest.assets.filter((asset) => /trademark|review/i.test(asset.license)).length;
    const state = {
      id,
      status: "ready",
      productSurface: "asset-studio-pro",
      corpusManifest: manifestPath,
      sourceRepository: manifest.generatedFrom.repository,
      sourceRevision: manifest.generatedFrom.revision,
      assetCount: report.sourceManifest.assetCount,
      visualEvidenceSlots,
      advancedMaterialAssets,
      animationSkinMorphAssets,
      licenseReviewRequired,
      pass: report.summary.pass,
      warn: report.summary.warn,
      expectedFail: report.summary.expectedFail,
      featureCoverage: [...new Set(manifest.assets.flatMap((asset) => asset.tags))].sort(),
      selectedAsset: diagnostics,
      corpusBrowserUi: true,
      diagnosticsUi: true,
      releaseProofComplete: false,
      featureChecklist: ["corpus-browser", "asset-diagnostics", "license-provenance", "feature-coverage", "visual-evidence-slots", "app-ui"],
      claimBoundary
    };
    window.__AURA3D_ASSET_STUDIO__ = state;
    status.textContent = JSON.stringify(state, null, 2);
  }

  select.addEventListener("change", render);
  for (const button of grid.querySelectorAll<HTMLButtonElement>("button[data-asset-id]")) {
    button.addEventListener("click", () => {
      select.value = button.dataset.assetId ?? select.value;
      render();
    });
  }
  render();
}

function createAssetDiagnostics(asset: GLTFCorpusAsset, manifest: GLTFCorpusManifest) {
  return {
    id: asset.id,
    license: asset.license,
    provenance: asset.source.uri,
    features: asset.tags,
    visualEvidenceSlot: true,
    advancedMaterial: asset.tags.some((tag) => /material|pbr|texture/i.test(tag)),
    animationSkinMorph: asset.tags.some((tag) => /animation|skin|morph/i.test(tag)),
    licenseReviewRequired: /trademark|review/i.test(asset.license),
    sourceRevision: manifest.generatedFrom.revision,
    renderStatus: "queued-for-threejs-parity"
  };
}

function drawAssetPreview(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, asset: GLTFCorpusAsset): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#151a22");
  gradient.addColorStop(1, asset.tags.some((tag) => /material|pbr|texture/i.test(tag)) ? "#293136" : "#22283a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#222a34";
  context.fillRect(120, 96, 1040, 480);
  context.strokeStyle = "#5d6876";
  context.lineWidth = 4;
  context.strokeRect(120, 96, 1040, 480);
  const features = asset.tags;
  for (let index = 0; index < features.length; index += 1) {
    const x = 190 + (index % 5) * 190;
    const y = 172 + Math.floor(index / 5) * 120;
    context.fillStyle = colorForFeature(features[index] ?? "core");
    context.beginPath();
    context.roundRect(x, y, 132, 72, 12);
    context.fill();
    context.fillStyle = "#f8f3e7";
    context.font = "18px system-ui";
    context.fillText(features[index] ?? "", x + 14, y + 43);
  }
  context.fillStyle = "#f8f3e7";
  context.font = "42px system-ui";
  context.fillText(asset.id, 160, 645);
  context.font = "22px system-ui";
  context.fillStyle = "#bdc7d2";
  context.fillText(asset.license, 160, 682);
}

function colorForFeature(feature: string): string {
  if (feature.includes("extension")) return "#7957d5";
  if (feature.includes("animation") || feature.includes("skinning") || feature.includes("morph")) return "#2f8f74";
  if (feature.includes("texture") || feature.includes("pbr")) return "#a86f2d";
  if (feature.includes("glb")) return "#315f9f";
  return "#3e596d";
}

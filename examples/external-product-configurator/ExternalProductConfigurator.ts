import { Renderer } from "@aura3d/rendering";
import { createProductConfiguratorWorkflow } from "@aura3d/workflows";

declare global {
  interface Window {
    __A3D_EXTERNAL_PARITY_PRODUCT_CONFIGURATOR__?: unknown;
  }
}

const productUrl = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/BoomBox/glTF-Binary/BoomBox.glb";

export async function mountExternalProductConfigurator(id: string): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root.");
  root.innerHTML = `
    <main style="display:grid;grid-template-columns:320px 1fr;height:100vh;background:#101214;color:#f4f4ef;font-family:Inter,system-ui,sans-serif">
      <aside style="border-right:1px solid #2d3338;padding:18px">
        <h1 style="font-size:20px;margin:0 0 14px">Product Studio Pro</h1>
        <label>Material <select data-testid="hr4-product-material"><option value="asset">Asset</option><option value="contrast">Contrast</option><option value="metal-check">Metal check</option></select></label>
        <label style="display:block;margin-top:12px">Lighting <select data-testid="hr4-product-lighting"><option value="catalog-softbox">Catalog softbox</option><option value="hero-contrast">Hero contrast</option><option value="inspection-bay">Inspection bay</option></select></label>
        <pre data-testid="hr4-product-status" style="white-space:pre-wrap;background:#171b20;padding:12px;margin-top:18px">loading</pre>
      </aside>
      <section style="display:grid;grid-template-rows:1fr 44px;min-width:0">
        <canvas data-testid="hr4-product-canvas" width="1280" height="900" style="width:100%;height:100%;display:block"></canvas>
        <div style="border-top:1px solid #2d3338;padding:10px 14px">Public workflow: createProductConfiguratorWorkflow</div>
      </section>
    </main>`;
  const canvas = root.querySelector<HTMLCanvasElement>("[data-testid='hr4-product-canvas']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='hr4-product-status']")!;
  const material = root.querySelector<HTMLSelectElement>("[data-testid='hr4-product-material']")!;
  const lighting = root.querySelector<HTMLSelectElement>("[data-testid='hr4-product-lighting']")!;
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 1280, height: 900, clearColor: [0.02, 0.022, 0.026, 1], preserveDrawingBuffer: true });
  let disposePrevious: (() => void) | undefined;

  async function render(): Promise<void> {
    disposePrevious?.();
    const workflow = await createProductConfiguratorWorkflow({
      asset: {
        id: "premium-boom-box",
        title: "Premium Boom Box",
        category: "consumer-audio",
        url: productUrl,
        manifestUrl: `${location.origin}/fixtures/product-studio/products/speaker/manifest.json`
      },
      materialMode: material.value as "asset" | "contrast" | "metal-check",
      lighting: lighting.value as "catalog-softbox" | "hero-contrast" | "inspection-bay",
      camera: "front-three-quarter"
    });
    disposePrevious = workflow.dispose;
    const diagnostics = renderer.render(workflow.source, workflow.camera);
    const state = {
      id,
      status: "ready",
      productId: workflow.asset.id,
      sourceLicense: "CC0-1.0",
      publicWorkflow: true,
      workflowKind: workflow.kind,
      meshCount: workflow.asset.gltf.meshes.length,
      materialCount: workflow.asset.gltf.materials.length,
      textureCount: workflow.asset.gltf.textures.length,
      drawCalls: diagnostics.drawCalls,
      materialMode: material.value,
      lighting: lighting.value,
      featureChecklist: workflow.diagnostics.featureChecklist,
      externalSource: productUrl,
      claimBoundary: "Milestone 7 product proof only; ExternalParity release still requires package/templates and Three.js parity."
    };
    window.__A3D_EXTERNAL_PARITY_PRODUCT_CONFIGURATOR__ = state;
    status.textContent = JSON.stringify(state, null, 2);
  }

  material.addEventListener("change", () => void render());
  lighting.addEventListener("change", () => void render());
  await render();
}

import {
  createProductCameraFrame,
  createProductDiagnostics,
  createProductLightingPreset,
  createProductMaterialMode,
  createProductRenderScene,
  createProductStudio,
  loadProductAsset,
  type ProductAssetId,
  type ProductCameraPreset,
  type ProductLightingPreset,
  type ProductMaterialModeId,
  type ProductStudio
} from "@aura3d/product-studio";
import { renderProductStudioControls } from "./ProductStudioControls";
import { exportCurrentProductRender } from "./ProductStudioExports";
import { createProductStudioState, selectedProduct, type ProductStudioAppState } from "./ProductStudioState";
import { createProductStudioViewport, type ProductStudioViewport } from "./ProductStudioViewport";

export class ProductStudioApp {
  private readonly state: ProductStudioAppState = createProductStudioState();
  private readonly viewport: ProductStudioViewport = createProductStudioViewport();
  private readonly shell = document.createElement("main");
  private readonly toolbar = document.createElement("aside");
  private readonly stage = document.createElement("section");
  private studio?: ProductStudio;
  private resizeObserver?: ResizeObserver;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    installProductStudioStyles();
    this.shell.className = "product-studio-shell";
    this.toolbar.className = "product-studio-toolbar";
    this.stage.className = "product-studio-stage";
    this.root.replaceChildren(this.shell);
    this.shell.append(this.toolbar, this.stage);
    this.viewport.mount(this.stage);
    this.studio = await createProductStudio({ canvas: this.viewport.canvas, width: 1280, height: 900 });
    this.resizeObserver = new ResizeObserver(() => this.rebuildScene());
    this.resizeObserver.observe(this.stage);
    exposeState(this.state, {
      reloadProduct: (id) => this.loadProduct(id),
      setLighting: (preset) => this.setLighting(preset),
      setCamera: (preset) => this.setCamera(preset),
      setMaterialMode: (mode) => this.setMaterialMode(mode),
      exportPng: () => this.exportPng()
    });
    await this.loadProduct(this.state.selectedProductId);
  }

  async loadProduct(id: ProductAssetId): Promise<void> {
    this.state.status = "loading";
    this.state.selectedProductId = id;
    this.state.error = undefined;
    this.renderControls();
    try {
      const product = selectedProduct(this.state);
      this.state.asset = await loadProductAsset({
        id: product.id,
        url: product.url,
        manifestUrl: product.manifestUrl
      });
      this.state.status = "ready";
      this.rebuildScene();
    } catch (error) {
      this.state.status = "error";
      this.state.error = error instanceof Error ? error.message : String(error);
      this.renderControls();
    }
  }

  async setLighting(preset: ProductLightingPreset): Promise<void> {
    this.state.lightingPreset = preset;
    this.rebuildScene();
  }

  async setCamera(preset: ProductCameraPreset): Promise<void> {
    this.state.cameraPreset = preset;
    this.rebuildScene();
  }

  async setMaterialMode(mode: ProductMaterialModeId): Promise<void> {
    this.state.materialMode = mode;
    this.rebuildScene();
  }

  async exportPng() {
    if (!this.studio || !this.state.scene) return undefined;
    const result = await exportCurrentProductRender(this.studio, this.state.scene);
    this.state.latestExport = result;
    exposeState(this.state);
    this.renderControls();
    return result;
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.studio?.dispose();
    this.viewport.dispose();
  }

  private rebuildScene(): void {
    if (!this.studio || !this.state.asset) return;
    const viewport = this.viewport.resize(this.studio);
    const lighting = createProductLightingPreset(this.state.lightingPreset);
    const camera = createProductCameraFrame(this.state.asset, {
      preset: this.state.cameraPreset,
      viewport
    });
    const materialMode = createProductMaterialMode(this.state.materialMode);
    this.state.scene = createProductRenderScene(this.state.asset, {
      lighting,
      camera,
      materialMode,
      floor: this.state.floorEnabled
    });
    const renderDiagnostics = this.studio.render(this.state.scene);
    this.state.diagnostics = createProductDiagnostics(this.state.asset, renderDiagnostics);
    exposeState(this.state);
    this.renderControls();
  }

  private renderControls(): void {
    exposeState(this.state);
    renderProductStudioControls(this.toolbar, this.state, {
      onProduct: (id) => void this.loadProduct(id),
      onLighting: (preset) => void this.setLighting(preset),
      onCamera: (preset) => void this.setCamera(preset),
      onMaterialMode: (mode) => void this.setMaterialMode(mode),
      onFloor: (enabled) => {
        this.state.floorEnabled = enabled;
        this.rebuildScene();
      },
      onExport: () => void this.exportPng()
    });
  }
}

function exposeState(state: ProductStudioAppState, methods: Partial<NonNullable<typeof window.__A3D_PRODUCT_STUDIO__>> = {}): void {
  window.__A3D_PRODUCT_STUDIO__ = Object.assign(state, methods);
}

function installProductStudioStyles(): void {
  if (document.getElementById("product-studio-styles")) return;
  const style = document.createElement("style");
  style.id = "product-studio-styles";
  style.textContent = `
    html, body, #app {
      height: 100%;
      margin: 0;
    }

    body {
      overflow: hidden;
      background: #151716;
      color: #f2f0e8;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button, input {
      font: inherit;
    }

    .product-studio-shell {
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      height: 100%;
      background: #151716;
    }

    .product-studio-toolbar {
      overflow: auto;
      border-right: 1px solid #30332f;
      background: #20231f;
      padding: 18px;
    }

    .product-studio-stage {
      min-width: 0;
      min-height: 0;
      position: relative;
      background: #101211;
    }

    .product-studio-canvas {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 420px;
    }

    .control-section, .diagnostics {
      border-bottom: 1px solid #353934;
      padding: 0 0 16px;
      margin: 0 0 16px;
    }

    .control-section h2, .diagnostics h2 {
      color: #a9ada4;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      margin: 0 0 10px;
      text-transform: uppercase;
    }

    .segmented {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }

    .segmented button, .control-footer button {
      min-height: 34px;
      border: 1px solid #41463f;
      border-radius: 6px;
      background: #292d28;
      color: #eceae2;
      cursor: pointer;
      padding: 7px 10px;
    }

    .segmented button.is-active {
      border-color: #c5b26e;
      background: #4a4430;
      color: #fff7d2;
    }

    .diagnostics dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 12px;
      margin: 0;
      font-size: 13px;
    }

    .diagnostics dt {
      color: #a9ada4;
    }

    .diagnostics dd {
      margin: 0;
      color: #f2f0e8;
      font-variant-numeric: tabular-nums;
    }

    .error {
      color: #ff9a87;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .control-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .control-footer label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #d6d3c8;
      font-size: 13px;
    }

    .control-footer button.primary {
      background: #b9973f;
      border-color: #d1b256;
      color: #171613;
      font-weight: 700;
    }

    @media (max-width: 820px) {
      .product-studio-shell {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(0, 1fr) auto;
      }

      .product-studio-stage {
        grid-row: 1;
      }

      .product-studio-toolbar {
        grid-row: 2;
        max-height: 44vh;
        border-right: 0;
        border-top: 1px solid #30332f;
      }
    }
  `;
  document.head.append(style);
}

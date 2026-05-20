import { Renderer } from "@galileo3d/rendering";
import { createProductCameraFrame } from "./ProductCamera";
import { exportProductRender, exportProductSceneManifest } from "./ProductExport";
import { createProductLightingPreset } from "./ProductLighting";
import { createProductMaterialMode } from "./ProductMaterials";
import type {
  ProductAsset,
  ProductCameraFrame,
  ProductCameraPreset,
  ProductExportResult,
  ProductLightingConfig,
  ProductLightingPreset,
  ProductMaterialMode,
  ProductMaterialModeId,
  ProductRenderScene,
  ProductSceneManifest,
  ProductStudio,
  ProductStudioOptions
} from "./ProductTypes";

export async function createProductStudio(options: ProductStudioOptions = {}): Promise<ProductStudio> {
  const renderer = await Renderer.create({
    clearColor: [0.03, 0.035, 0.038, 1],
    width: options.width ?? 1280,
    height: options.height ?? 900,
    ...options
  });
  return new ProductStudioRuntime(renderer, options.canvas);
}

class ProductStudioRuntime implements ProductStudio {
  constructor(
    public readonly renderer: Renderer,
    private readonly canvas?: HTMLCanvasElement | OffscreenCanvas
  ) {}

  render(scene: ProductRenderScene) {
    return this.renderer.render(scene.source, scene.camera);
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  setLighting(preset: ProductLightingPreset): ProductLightingConfig {
    return createProductLightingPreset(preset);
  }

  setCamera(asset: ProductAsset, preset: ProductCameraPreset, viewport = { width: 1280, height: 900 }): ProductCameraFrame {
    return createProductCameraFrame(asset, { preset, viewport });
  }

  setMaterialMode(mode: ProductMaterialModeId): ProductMaterialMode {
    return createProductMaterialMode(mode);
  }

  async exportPng(scene: ProductRenderScene): Promise<ProductExportResult> {
    if (!this.canvas) {
      throw new Error("ProductStudio exportPng requires a canvas-backed studio.");
    }
    this.render(scene);
    return exportProductRender(this.canvas, scene);
  }

  exportSceneManifest(scene: ProductRenderScene): ProductSceneManifest {
    return exportProductSceneManifest(scene);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

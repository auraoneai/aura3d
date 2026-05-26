import {
  createProductCameraFrame,
  createProductLightingPreset,
  createProductMaterialMode,
  createProductRenderScene,
  loadProductAsset
} from "@aura3d/product-studio";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { ProductConfiguratorWorkflowOptions, ProductConfiguratorWorkflowResult } from "./WorkflowTypes";

export async function createProductConfiguratorWorkflow(options: ProductConfiguratorWorkflowOptions): Promise<ProductConfiguratorWorkflowResult> {
  const asset = await loadProductAsset(options.asset);
  const lighting = createProductLightingPreset(options.lighting ?? "catalog-softbox");
  const camera = createProductCameraFrame(asset, {
    preset: options.camera ?? "front-three-quarter",
    viewport: options.viewport ?? { width: 1280, height: 900 }
  });
  const materialMode = createProductMaterialMode(options.materialMode ?? "asset");
  const scene = createProductRenderScene(asset, { lighting, camera, materialMode });
  return {
    kind: "product-configurator",
    asset,
    scene,
    source: scene.source,
    camera: scene.camera,
    diagnostics: createWorkflowDiagnostics("product-configurator", {
      asset,
      featureChecklist: ["product-asset", "material-modes", "lighting-presets", "camera-presets", "export-ready"]
    }),
    dispose: () => asset.resources.dispose()
  };
}

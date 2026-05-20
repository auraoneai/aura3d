import { createRenderableScene, loadRenderableAsset } from "@galileo3d/assets";
import type { LoadRenderableAssetOptions } from "@galileo3d/assets";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { AssetViewerWorkflowOptions, AssetViewerWorkflowResult } from "./WorkflowTypes";

export async function createAssetViewerWorkflow(options: AssetViewerWorkflowOptions): Promise<AssetViewerWorkflowResult> {
  const loadOptions: LoadRenderableAssetOptions = {
    baseUrl: options.baseUrl,
    signal: options.signal,
    dependencyChain: options.dependencyChain,
    manager: options.manager,
    type: options.type
  };
  const asset = await loadRenderableAsset(options.url, loadOptions);
  const scene = await createRenderableScene(asset, {
    camera: options.camera ?? "auto-frame",
    lighting: options.lighting ?? "studioProduct",
    shadows: options.shadows ?? true,
    postprocess: options.postprocess ?? "product-default",
    viewport: options.viewport,
    qualityPreset: options.qualityPreset,
    renderResources: options.renderResources
  });
  return {
    kind: "asset-viewer",
    asset,
    scene,
    source: scene.source,
    camera: scene.rendererInput?.camera,
    diagnostics: createWorkflowDiagnostics("asset-viewer", {
      asset,
      warnings: scene.warnings,
      featureChecklist: ["asset-loading", "render-resources", "auto-camera", "lighting", "shadows", "postprocess"]
    }),
    dispose: () => scene.dispose()
  };
}

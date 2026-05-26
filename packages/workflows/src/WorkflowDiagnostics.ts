import type { RenderDeviceDiagnostics } from "@aura3d/rendering";
import type { RenderableAsset } from "@aura3d/assets";
import type { ProductAsset } from "@aura3d/product-studio";
import type { A3DWorkflowDiagnostics, A3DWorkflowKind } from "./WorkflowTypes";

export function createWorkflowDiagnostics(
  workflow: A3DWorkflowKind,
  options: {
    readonly warnings?: readonly string[];
    readonly featureChecklist?: readonly string[];
    readonly asset?: RenderableAsset | ProductAsset;
    readonly renderDiagnostics?: RenderDeviceDiagnostics;
  } = {}
): A3DWorkflowDiagnostics {
  return {
    workflow,
    warnings: options.warnings ?? [],
    featureChecklist: options.featureChecklist ?? [],
    ...(options.asset ? { asset: summarizeAsset(options.asset) } : {}),
    ...(options.renderDiagnostics ? { renderDiagnostics: options.renderDiagnostics } : {})
  };
}

function summarizeAsset(asset: RenderableAsset | ProductAsset): A3DWorkflowDiagnostics["asset"] {
  if ("gltf" in asset && asset.gltf) {
    return {
      kind: "gltf",
      meshCount: asset.gltf.loaderDiagnostics.meshCount,
      materialCount: asset.gltf.loaderDiagnostics.materialCount,
      textureCount: asset.gltf.loaderDiagnostics.textureCount
    };
  }
  if ("resources" in asset) {
    return {
      kind: asset.category,
      meshCount: asset.gltf.loaderDiagnostics.meshCount,
      materialCount: asset.gltf.loaderDiagnostics.materialCount,
      textureCount: asset.gltf.loaderDiagnostics.textureCount
    };
  }
  return {
    kind: asset.kind,
    meshCount: 0,
    materialCount: 0,
    textureCount: 0
  };
}

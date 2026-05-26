import type { CameraLike, RenderSource } from "@aura3d/rendering";
import { GLTFLoader, type GLTFAsset, type GLTFDracoDecoder, type GLTFLoaderDiagnostics, type GLTFMeshoptDecoder } from "../GLTFLoader";
import { createGLTFRenderResources, type GLTFImageDecoder, type GLTFRenderResourceOptions, type GLTFRenderResources, type GLTFRendererInputOptions } from "../GLTFRenderResources";
import { LoadContext } from "../LoadContext";

export interface V6GLTFRenderPipelineOptions {
  readonly url: string;
  readonly assetId: string;
  readonly assetName?: string;
  readonly imageDecoder?: GLTFImageDecoder;
  readonly dracoDecoder?: GLTFDracoDecoder;
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
  readonly materialVariant?: GLTFRenderResourceOptions["materialVariant"];
  readonly sceneIndex?: GLTFRenderResourceOptions["sceneIndex"];
  readonly sceneName?: GLTFRenderResourceOptions["sceneName"];
  readonly materialRenderStateOverrides?: GLTFRenderResourceOptions["materialRenderStateOverrides"];
  readonly rendererInput?: GLTFRendererInputOptions;
  readonly width?: number;
  readonly height?: number;
}

export interface V6GLTFRenderMetadata {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetUri: string;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly pbrTextureCount: number;
  readonly normalMapCount: number;
  readonly ormTextureCount: number;
  readonly emissiveTextureCount: number;
  readonly materialExtensionCoverage: readonly string[];
  readonly warnings: readonly V6GLTFRenderWarning[];
  readonly hasPbr: boolean;
  readonly hasSkinning: boolean;
  readonly hasMorphTargets: boolean;
  readonly hasAnimation: boolean;
}

export interface V6GLTFRenderWarning {
  readonly code: string;
  readonly severity: "info" | "warning";
  readonly message: string;
  readonly nextAction: string;
}

export interface V6GLTFRenderPipeline {
  readonly asset: GLTFAsset;
  readonly resources: GLTFRenderResources;
  readonly source: RenderSource;
  readonly camera: CameraLike;
  readonly metadata: V6GLTFRenderMetadata;
  dispose(): void;
}

export async function loadV6GLTFRenderPipeline(options: V6GLTFRenderPipelineOptions): Promise<V6GLTFRenderPipeline> {
  const asset = await new GLTFLoader({
    ...(options.dracoDecoder ? { dracoDecoder: options.dracoDecoder } : {}),
    ...(options.meshoptDecoder ? { meshoptDecoder: options.meshoptDecoder } : {})
  }).load({ url: options.url }, new LoadContext());
  const resources = await createGLTFRenderResources(asset, {
    ...(options.imageDecoder ? { imageDecoder: options.imageDecoder } : {}),
    ...(options.materialVariant !== undefined ? { materialVariant: options.materialVariant } : {}),
    ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
    ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {}),
    ...(options.materialRenderStateOverrides ? { materialRenderStateOverrides: options.materialRenderStateOverrides } : {})
  });
  const rendererInput = resources.toRendererInput(
    { width: options.width ?? 512, height: options.height ?? 512 },
    {
      qualityPreset: "hdr-studio-preview",
      cameraPolicy: "require",
      ...options.rendererInput
    }
  );
  return {
    asset,
    resources,
    source: rendererInput.source,
    camera: rendererInput.camera,
    metadata: createV6GLTFRenderMetadata(asset, options.assetId, options.assetName ?? options.assetId),
    dispose: () => {
      resources.dispose();
      if ("dispose" in asset && typeof asset.dispose === "function") {
        asset.dispose();
      }
    }
  };
}

export function createV6GLTFRenderMetadata(asset: GLTFAsset, assetId: string, assetName: string): V6GLTFRenderMetadata {
  const diagnostics: GLTFLoaderDiagnostics = asset.loaderDiagnostics;
  const materialExtensionCoverage = [...new Set(asset.materials.flatMap((material) => [
    ...(material.clearcoat ? ["KHR_materials_clearcoat"] : []),
    ...(material.sheen ? ["KHR_materials_sheen"] : []),
    ...(material.specular ? ["KHR_materials_specular"] : []),
    ...(material.transmission ? ["KHR_materials_transmission"] : []),
    ...(material.volume ? ["KHR_materials_volume"] : []),
    ...(material.ior !== undefined ? ["KHR_materials_ior"] : []),
    ...(material.anisotropy ? ["KHR_materials_anisotropy"] : []),
    ...(material.iridescence ? ["KHR_materials_iridescence"] : []),
    ...(material.dispersion !== undefined ? ["KHR_materials_dispersion"] : [])
  ]))].sort();
  const pbrTextureCount = asset.materials.filter((material) => material.baseColorTexture || material.metallicRoughnessTexture).length;
  return {
    assetId,
    assetName,
    assetUri: asset.url,
    meshCount: diagnostics.meshCount,
    primitiveCount: diagnostics.primitiveCount,
    materialCount: diagnostics.materialCount,
    textureCount: diagnostics.textureCount,
    imageCount: diagnostics.imageCount,
    animationCount: diagnostics.animationCount,
    skinCount: diagnostics.skinCount,
    morphTargetCount: diagnostics.morphTargetCount,
    vertexCount: diagnostics.vertexCount,
    indexCount: diagnostics.indexCount,
    textureSlots: diagnostics.textureSlots,
    materialFeatures: diagnostics.materialFeatures,
    extensionsUsed: diagnostics.extensionsUsed,
    extensionsRequired: diagnostics.extensionsRequired,
    unsupportedExtensions: diagnostics.unsupportedExtensions,
    pbrTextureCount,
    normalMapCount: asset.materials.filter((material) => material.normalTexture).length,
    ormTextureCount: asset.materials.filter((material) => material.metallicRoughnessTexture || material.occlusionTexture).length,
    emissiveTextureCount: asset.materials.filter((material) => material.emissiveTexture).length,
    materialExtensionCoverage,
    warnings: createV6GLTFRenderWarnings(diagnostics, materialExtensionCoverage),
    hasPbr: asset.materials.some((material) => !material.unlit),
    hasSkinning: diagnostics.skinCount > 0 || asset.meshes.some((mesh) => mesh.skinIndex !== undefined),
    hasMorphTargets: diagnostics.morphTargetCount > 0,
    hasAnimation: diagnostics.animationCount > 0
  };
}

function createV6GLTFRenderWarnings(
  diagnostics: GLTFLoaderDiagnostics,
  materialExtensionCoverage: readonly string[]
): readonly V6GLTFRenderWarning[] {
  const warnings: V6GLTFRenderWarning[] = [];
  for (const extension of diagnostics.unsupportedExtensions) {
    warnings.push({
      code: "unsupported-gltf-extension",
      severity: "warning",
      message: `Optional glTF extension ${extension} was present but is not supported by the A3D render path.`,
      nextAction: "Keep the asset loaded if the extension is optional, but inspect the visual output and document the missing feature before claiming parity."
    });
  }
  for (const extension of materialExtensionCoverage) {
    if (extension === "KHR_materials_transmission" || extension === "KHR_materials_volume") {
      warnings.push({
        code: "bounded-material-extension",
        severity: "info",
        message: `${extension} data is imported, but current V6 visual parity is bounded and must be checked against the product-viewer comparison output.`,
        nextAction: "Use a focused material-extension scene before claiming full glass/transmission/volume parity."
      });
    }
  }
  if (diagnostics.animationCount > 0 || diagnostics.skinCount > 0 || diagnostics.morphTargetCount > 0) {
    warnings.push({
      code: "animation-skin-morph-readiness",
      severity: "info",
      message: "The asset contains animation, skinning, or morph data; V6 metadata preserves it, but the product viewer must explicitly enable the workflow before claiming interactive character parity.",
      nextAction: "Run animation/skinning/morph browser evidence for this asset."
    });
  }
  return warnings;
}

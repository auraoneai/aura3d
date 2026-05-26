import {
  type CollectedLight,
  createCanonicalProductSceneRenderKit,
  type CameraFrameViewport,
  type RenderSource,
  type RendererPostProcessOptions,
  type RendererShadowOptions
} from "@aura3d/rendering";
import { DirectionalLight } from "@aura3d/scene";
import { createAssetRenderDefaults, type AssetRenderLightingPreset } from "./AssetRenderDefaults";
import { createGLTFRenderResources, type GLTFRendererInput, type GLTFRenderQualityPreset, type GLTFRenderResourceOptions, type GLTFRenderResources } from "./GLTFRenderResources";
import type { RenderableAsset } from "./loadRenderableAsset";

export interface CreateRenderableSceneOptions {
  readonly camera?: "auto-frame";
  readonly lighting?: AssetRenderLightingPreset;
  readonly shadows?: boolean | RendererShadowOptions;
  readonly postprocess?: "product-default" | RendererPostProcessOptions | false;
  readonly viewport?: CameraFrameViewport;
  readonly qualityPreset?: GLTFRenderQualityPreset;
  readonly renderResources?: GLTFRenderResourceOptions;
}

export interface RenderableScene {
  readonly source: RenderSource;
  readonly rendererInput?: GLTFRendererInput;
  readonly kind: RenderableAsset["kind"];
  readonly setupLineBudget: number;
  readonly warnings: readonly string[];
  dispose(): void;
}

export async function createRenderableScene(
  asset: RenderableAsset,
  options: CreateRenderableSceneOptions = {}
): Promise<RenderableScene> {
  const defaults = createAssetRenderDefaults(options.lighting);
  if (asset.kind === "canonical-product-scene") {
    const kit = createCanonicalProductSceneRenderKit({
      lightingPreset: canonicalLightingPreset(options.lighting)
    });
    return {
      kind: asset.kind,
      source: {
        ...kit.source,
        ...(options.shadows === false ? { shadow: false } : {}),
        ...(typeof options.shadows === "object" ? { shadow: options.shadows } : {}),
        ...(options.postprocess === false ? { postprocess: false } : {}),
        ...(typeof options.postprocess === "object" ? { postprocess: options.postprocess } : {})
      },
      setupLineBudget: kit.canonical.publicSetupLineBudget,
      warnings: asset.warnings,
      dispose: () => kit.dispose()
    };
  }

  if (!asset.gltf) {
    throw new Error("Renderable glTF asset is missing its parsed GLTFAsset payload.");
  }
  const resources = await createGLTFRenderResources(asset.gltf, options.renderResources);
  const viewport = options.viewport ?? defaults.viewport;
  const shadow = options.shadows === false
    ? false
    : typeof options.shadows === "object"
      ? options.shadows
      : defaults.shadows;
  const postprocess = options.postprocess === false
    ? false
    : typeof options.postprocess === "object"
      ? options.postprocess
      : defaults.postprocess;
  const rendererInput = resources.toRendererInput(viewport, {
    qualityPreset: options.qualityPreset ?? "studio-preview",
    frame: defaults.frame,
    shadow,
    postprocess
  });
  const source = {
    ...rendererInput.source,
    ...(shadow !== false ? { collectedLights: createAssetDefaultCollectedLights() } : {})
  };
  return gltfRenderableScene(asset, resources, { ...rendererInput, source });
}

function canonicalLightingPreset(lighting: AssetRenderLightingPreset | undefined): "studio" | "soft" | "inspection" | "dramatic" | "neutral" {
  switch (lighting) {
    case "gameNight":
      return "dramatic";
    case "outdoorDay":
      return "inspection";
    case "interiorGallery":
      return "soft";
    case "studioProduct":
    case undefined:
      return "studio";
  }
}

function createAssetDefaultCollectedLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("asset-default-key-light");
  key.intensity = 2.4;
  key.color = [1, 0.93, 0.8];
  key.castsShadow = true;
  return [{
    kind: "directional",
    color: [1, 0.93, 0.8],
    intensity: 2.4,
    position: [0, 0, 0],
    direction: [0.42, -0.7, -0.58],
    range: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: true,
    layerMask: 0xffffffff,
    source: key
  }];
}

function gltfRenderableScene(asset: RenderableAsset, resources: GLTFRenderResources, rendererInput: GLTFRendererInput): RenderableScene {
  return {
    kind: asset.kind,
    source: rendererInput.source,
    rendererInput,
    setupLineBudget: 30,
    warnings: asset.warnings,
    dispose: () => resources.dispose()
  };
}

import { GLTFLoader } from "/packages/assets/src/GLTFLoader.js";
import { LoadContext } from "/packages/assets/src/LoadContext.js";
import { createGLTFRenderResources } from "/packages/assets/src/GLTFRenderResources.js";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/v6/index.js";
import {
  createV6ComposedProductionStageScene,
  createV6HeroShaderLibrary
} from "/tests/browser/v6-production-scene-tools.js";

declare global {
  interface Window {
    __V7_MATERIAL_EXTENSIONS__?: unknown;
  }
}

const materialExtensionAssets = [
  {
    id: "compare-anisotropy",
    file: "compare-anisotropy.glb",
    expectedExtension: "KHR_materials_anisotropy",
    expectedFeature: "anisotropy"
  },
  {
    id: "compare-iridescence",
    file: "compare-iridescence.glb",
    expectedExtension: "KHR_materials_iridescence",
    expectedFeature: "iridescence"
  },
  {
    id: "compare-transmission",
    file: "compare-transmission.glb",
    expectedExtension: "KHR_materials_transmission",
    expectedFeature: "transmission"
  },
  {
    id: "compare-volume",
    file: "compare-volume.glb",
    expectedExtension: "KHR_materials_volume",
    expectedFeature: "volume"
  },
  {
    id: "compare-clearcoat",
    file: "compare-clearcoat.glb",
    expectedExtension: "KHR_materials_clearcoat",
    expectedFeature: "clearcoat"
  },
  {
    id: "compare-sheen",
    file: "compare-sheen.glb",
    expectedExtension: "KHR_materials_sheen",
    expectedFeature: "sheen"
  },
  {
    id: "compare-specular",
    file: "compare-specular.glb",
    expectedExtension: "KHR_materials_specular",
    expectedFeature: "specular"
  },
  {
    id: "compare-ior",
    file: "compare-ior.glb",
    expectedExtension: "KHR_materials_ior",
    expectedFeature: "ior"
  },
  {
    id: "compare-dispersion",
    file: "compare-dispersion.glb",
    expectedExtension: "KHR_materials_dispersion",
    expectedFeature: "dispersion"
  },
  {
    id: "compare-emissive-strength",
    file: "compare-emissive-strength.glb",
    expectedExtension: "KHR_materials_emissive_strength",
    expectedFeature: "emissive"
  },
  {
    id: "diffuse-transmission-test",
    file: "diffuse-transmission-test.glb",
    expectedExtension: "KHR_materials_diffuse_transmission",
    expectedFeature: "diffuse-transmission"
  }
] as const;

async function run(): Promise<void> {
  const canvas = document.getElementById("v7-material-extensions");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("V7 material extension canvas is missing.");
  }

  const hdrUri = `${location.origin}/fixtures/v6/environments/hdri/industrial_high_contrast_1k.hdr`;
  const hdr = await fetchBytes(hdrUri);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "v7-extension-industrial-hdr",
    label: "V7 Extension HDR",
    intensity: 1.38,
    backgroundIntensity: 0.92,
    rotation: 0.29,
    toneMapping: { operator: "filmic", exposure: 1.02, whitePoint: 10.8 }
  });
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const requestedAssetId = new URLSearchParams(location.search).get("asset");
  const selectedAssets = requestedAssetId
    ? materialExtensionAssets.filter((asset) => asset.id === requestedAssetId)
    : materialExtensionAssets;
  if (selectedAssets.length === 0) {
    throw new Error(`Unknown V7 material extension asset: ${requestedAssetId}`);
  }
  const assets = await Promise.all(selectedAssets.map((asset) => loadExtensionAsset(asset, canvas, lighting.lighting)));
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.008, 0.012, 1],
    shaderLibrary: createV6HeroShaderLibrary()
  });

  const staged = createV6ComposedProductionStageScene(assets.map((asset) => asset.pipeline), {
    width: canvas.width,
    height: canvas.height
  }, {
    yawRadians: -0.48,
    pitchRadians: -0.12,
    paddingRatio: assets.length === 1 ? 0.22 : 0.045,
    floorColor: [0.025, 0.027, 0.032, 1],
    backdropColor: [0.045, 0.052, 0.065, 1],
    includeBackdrop: true,
    includeSoftboxes: true,
    environmentLighting: lighting.lighting,
    postprocess: assets[0]?.pipeline.source.postprocess,
    hdrSkybox: lighting.lighting.environmentMapTexture ? {
      texture: lighting.lighting.environmentMapTexture,
      rotation: 0.29,
      exposure: 0.76
    } : undefined
  });

  const extensionsUsed = [...new Set(assets.flatMap((asset) => asset.asset.loaderDiagnostics.extensionsUsed))].sort();
  const materialFeatures = [...new Set(assets.flatMap((asset) => asset.asset.loaderDiagnostics.materialFeatures))].sort();
  const metadata = {
    assetId: "v7-material-extension-suite",
    assetName: "V7 material extension suite",
    assetUri: "fixtures/v7/assets/material-extensions",
    meshCount: assets.reduce((total, asset) => total + asset.asset.meshes.length, 0),
    primitiveCount: assets.reduce((total, asset) => total + asset.asset.meshes.length, 0),
    materialCount: assets.reduce((total, asset) => total + asset.asset.materials.length, 0),
    textureCount: assets.reduce((total, asset) => total + asset.asset.textures.length, 0),
    imageCount: assets.reduce((total, asset) => total + asset.asset.images.length, 0),
    animationCount: assets.reduce((total, asset) => total + asset.asset.animations.length, 0),
    skinCount: assets.reduce((total, asset) => total + asset.asset.skins.length, 0),
    morphTargetCount: assets.reduce((total, asset) => total + asset.asset.meshes.reduce((meshTotal, mesh) => meshTotal + mesh.morphTargets.length, 0), 0),
    vertexCount: assets.reduce((total, asset) => total + asset.asset.loaderDiagnostics.vertexCount, 0),
    indexCount: assets.reduce((total, asset) => total + asset.asset.loaderDiagnostics.indexCount, 0),
    extensionsUsed,
    environmentId: hdrPipeline.id,
    hdrEnvironmentUri: hdrUri
  };
  const proof = renderer.renderImportedAsset({
    source: staged.source,
    camera: staged.camera,
    metadata
  });

  window.__V7_MATERIAL_EXTENSIONS__ = {
    status: "ready",
    mode: assets.length === 1 ? "dedicated-extension-artifact" : "extension-suite",
    assets: assets.map((asset) => ({
      id: asset.id,
      expectedExtension: asset.expectedExtension,
      expectedFeature: asset.expectedFeature,
      extensionsUsed: asset.asset.loaderDiagnostics.extensionsUsed,
      materialFeatures: asset.asset.loaderDiagnostics.materialFeatures,
      unsupportedExtensions: asset.asset.loaderDiagnostics.unsupportedExtensions,
      materialCount: asset.asset.materials.length,
      textureCount: asset.asset.textures.length
    })),
    expectedExtensions: materialExtensionAssets.map((asset) => asset.expectedExtension),
    expectedFeatures: materialExtensionAssets.map((asset) => asset.expectedFeature),
    extensionsUsed,
    materialFeatures,
    proof,
    summary: summarizeV6WebGL2Proof(proof),
    hdrPipeline: hdrPipeline.diagnostics
  };
}

async function loadExtensionAsset(
  definition: typeof materialExtensionAssets[number],
  canvas: HTMLCanvasElement,
  environmentLighting: NonNullable<Parameters<typeof createV6ComposedProductionStageScene>[2]["environmentLighting"]>
) {
  const assetUri = definition.url ? `${location.origin}${definition.url}` : `${location.origin}/fixtures/v7/assets/material-extensions/${definition.file}`;
  const asset = await new GLTFLoader().load({ url: assetUri }, new LoadContext());
  const resources = await createGLTFRenderResources(asset);
  const input = resources.toRendererInput({ width: canvas.width, height: canvas.height }, {
    qualityPreset: "hdr-studio-preview",
    environmentLighting,
    cameraPolicy: "require"
  });
  return {
    id: definition.id,
    expectedExtension: definition.expectedExtension,
    expectedFeature: definition.expectedFeature,
    asset,
    pipeline: {
      source: input.source,
      resources,
      metadata: { assetId: definition.id, assetName: definition.id }
    }
  };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V7_MATERIAL_EXTENSIONS__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

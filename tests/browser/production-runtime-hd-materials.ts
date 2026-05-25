import { GLTFLoader } from "/packages/assets/src/GLTFLoader.js";
import { LoadContext } from "/packages/assets/src/LoadContext.js";
import { createGLTFRenderResources } from "/packages/assets/src/GLTFRenderResources.js";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/production-runtime/index.js";
import {
  createV6ComposedProductionStageScene,
  createV6HeroShaderLibrary,
  createV6PbrReferenceItems
} from "/tests/browser/production-runtime-production-scene-tools.js";

declare global {
  interface Window {
    __V6_HD_MATERIALS__?: unknown;
  }
}

async function run(): Promise<void> {
  const canvas = document.getElementById("production-runtime-hd-materials");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("V6 HD materials harness canvas is missing.");
  }
  const hdrUri = `${location.origin}/fixtures/environment-corpus/hdri/industrial_high_contrast_1k.hdr`;
  const hdr = await fetchBytes(hdrUri);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "industrial-high-contrast",
    label: "Industrial High Contrast",
    intensity: 1.32,
    backgroundIntensity: 0.9,
    rotation: 0.34,
    toneMapping: { operator: "filmic", exposure: 0.98, whitePoint: 10.8 }
  });
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const assets = await Promise.all([
    loadSceneAsset("damaged-helmet", "damaged-helmet.glb", "Damaged Helmet", canvas, lighting.lighting),
    loadSceneAsset("clear-coat-test", "clear-coat-test.glb", "Clear Coat Test", canvas, lighting.lighting),
    loadSceneAsset("sheen-test-grid", "sheen-test-grid.glb", "Sheen Test Grid", canvas, lighting.lighting),
    loadSceneAsset("specular-test", "specular-test.glb", "Specular Test", canvas, lighting.lighting)
  ]);
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.014, 0.018, 1],
    shaderLibrary: createV6HeroShaderLibrary()
  });
  const skyboxTexture = lighting.lighting.environmentMapTexture;
  if (!skyboxTexture) {
    throw new Error("V6 HD materials requires a sampled HDR environment texture for the visible skybox.");
  }
  const staged = createV6ComposedProductionStageScene([assets[0]!.pipeline], {
    width: canvas.width,
    height: canvas.height
  }, {
    yawRadians: -0.52,
    pitchRadians: -0.1,
    paddingRatio: 0.018,
    floorColor: [0.028, 0.03, 0.035, 1],
    includeBackdrop: false,
    environmentLighting: lighting.lighting,
    postprocess: assets[0]!.pipeline.source.postprocess,
    hdrSkybox: {
      texture: skyboxTexture,
      rotation: 0.34,
      exposure: 0.72
    }
  });
  const materialReferenceItems = createV6PbrReferenceItems(staged.frameBounds, lighting.lighting);
  const extensionsUsed = [...new Set(assets.flatMap((item) => item.asset.loaderDiagnostics.extensionsUsed))];
  const renderedReferenceVertexCount = materialReferenceItems.reduce((total, item) => total + item.geometry.vertexBuffer.vertexCount, 0);
  const renderedReferenceIndexCount = materialReferenceItems.reduce((total, item) => total + (item.geometry.indexBuffer?.count ?? 0), 0);
  const metadata = {
    assetId: "hd-pbr-material-composed-proof",
    assetName: "HD PBR material hero scene",
    assetUri: assets[0]!.assetUri,
    meshCount: assets[0]!.asset.meshes.length,
    primitiveCount: assets[0]!.asset.meshes.length,
    materialCount: assets[0]!.asset.materials.length,
    textureCount: assets[0]!.asset.textures.length,
    imageCount: assets[0]!.asset.images.length,
    animationCount: assets[0]!.asset.animations.length,
    skinCount: assets[0]!.asset.skins.length,
    morphTargetCount: assets[0]!.asset.meshes.reduce((meshTotal, mesh) => meshTotal + mesh.morphTargets.length, 0),
    vertexCount: assets[0]!.asset.loaderDiagnostics.vertexCount,
    indexCount: assets[0]!.asset.loaderDiagnostics.indexCount,
    referencePrimitiveCount: materialReferenceItems.length,
    referenceMaterialCount: materialReferenceItems.length,
    referenceVertexCount: renderedReferenceVertexCount,
    referenceIndexCount: renderedReferenceIndexCount,
    extensionsUsed,
    environmentId: "industrial-high-contrast",
    hdrEnvironmentUri: hdrUri
  };
  const proof = renderer.renderImportedAsset({
    source: {
      ...staged.source,
      renderItems: [...(staged.source.renderItems ? [...staged.source.renderItems] : []), ...materialReferenceItems]
    },
    camera: staged.camera,
    metadata
  });

  window.__V6_HD_MATERIALS__ = {
    status: "ready",
    assetIds: assets.map((asset) => asset.id),
    proof,
    summary: summarizeV6WebGL2Proof(proof),
    hdrPipeline: hdrPipeline.diagnostics,
    materialExtensionCoverage: extensionsUsed.filter((extension) => extension.startsWith("KHR_materials_"))
  };
}

async function loadSceneAsset(
  id: string,
  file: string,
  label: string,
  canvas: HTMLCanvasElement,
  environmentLighting: NonNullable<Parameters<typeof createV6ComposedProductionStageScene>[2]["environmentLighting"]>
) {
  const assetUri = `${location.origin}/fixtures/asset-corpus/${file}`;
  const asset = await new GLTFLoader().load({ url: assetUri }, new LoadContext());
  const resources = await createGLTFRenderResources(asset);
  const input = resources.toRendererInput({ width: canvas.width, height: canvas.height }, {
    qualityPreset: "hdr-studio-preview",
    environmentLighting,
    cameraPolicy: "require"
  });
  return {
    id,
    assetUri,
    asset,
    pipeline: {
      source: input.source,
      resources,
      metadata: { assetId: id, assetName: label }
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
  window.__V6_HD_MATERIALS__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

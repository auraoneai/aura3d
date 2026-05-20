import { GLTFLoader } from "/packages/assets/src/GLTFLoader.js";
import { LoadContext } from "/packages/assets/src/LoadContext.js";
import { createGLTFRenderResources } from "/packages/assets/src/GLTFRenderResources.js";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/v6/index.js";
import { createV6ComposedProductionStageScene } from "/tests/browser/v6-production-scene-tools.js";

declare global {
  interface Window {
    __V6_PBR_HDR__?: unknown;
  }
}

async function run(): Promise<void> {
  const studioCanvas = requireCanvas("studio");
  const sunsetCanvas = requireCanvas("sunset");
  const studioHdr = await fetchBytes(`${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`);
  const sunsetHdr = await fetchBytes(`${location.origin}/fixtures/v6/environments/hdri/venice_sunset_1k.hdr`);
  const studioPipeline = createV6PbrHdrPipelineFromRadiance(studioHdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.15,
    backgroundIntensity: 0.85,
    rotation: 0.15,
    toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
  });
  const sunsetPipeline = createV6PbrHdrPipelineFromRadiance(sunsetHdr, {
    id: "venice-sunset",
    label: "Venice Sunset",
    intensity: 1.35,
    backgroundIntensity: 0.95,
    rotation: 0.62,
    toneMapping: { operator: "aces", exposure: 0.9, whitePoint: 10.4 }
  });
  const studioLighting = createV6EnvironmentLightingResources(studioPipeline);
  const sunsetLighting = createV6EnvironmentLightingResources(sunsetPipeline);
  const studioAssets = await Promise.all([
    loadSceneAsset("damaged-helmet", "damaged-helmet.glb", "Damaged Helmet", studioCanvas, studioLighting.lighting),
    loadSceneAsset("boom-box", "boom-box.glb", "Boom Box", studioCanvas, studioLighting.lighting),
    loadSceneAsset("antique-camera", "antique-camera.glb", "Antique Camera", studioCanvas, studioLighting.lighting)
  ]);
  const sunsetAssets = await Promise.all([
    loadSceneAsset("damaged-helmet", "damaged-helmet.glb", "Damaged Helmet", sunsetCanvas, sunsetLighting.lighting),
    loadSceneAsset("lantern", "lantern.glb", "Lantern", sunsetCanvas, sunsetLighting.lighting),
    loadSceneAsset("antique-camera", "antique-camera.glb", "Antique Camera", sunsetCanvas, sunsetLighting.lighting)
  ]);
  const studioRenderer = await ProductionWebGL2Renderer.create({
    canvas: studioCanvas,
    width: studioCanvas.width,
    height: studioCanvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.015, 0.018, 0.024, 1]
  });
  const sunsetRenderer = await ProductionWebGL2Renderer.create({
    canvas: sunsetCanvas,
    width: sunsetCanvas.width,
    height: sunsetCanvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.015, 0.018, 0.024, 1]
  });
  const metadata = {
    assetId: "composed-pbr-hdr-proof",
    assetName: "Composed PBR/HDR product scene",
    assetUri: studioAssets[0]!.assetUri,
    meshCount: studioAssets.reduce((total, item) => total + item.asset.meshes.length, 0),
    primitiveCount: studioAssets.reduce((total, item) => total + item.asset.meshes.length, 0),
    materialCount: studioAssets.reduce((total, item) => total + item.asset.materials.length, 0),
    textureCount: studioAssets.reduce((total, item) => total + item.asset.textures.length, 0),
    imageCount: studioAssets.reduce((total, item) => total + item.asset.images.length, 0),
    animationCount: studioAssets.reduce((total, item) => total + item.asset.animations.length, 0),
    skinCount: studioAssets.reduce((total, item) => total + item.asset.skins.length, 0),
    morphTargetCount: studioAssets.reduce((total, item) => total + item.asset.meshes.reduce((meshTotal, mesh) => meshTotal + mesh.morphTargets.length, 0), 0),
    extensionsUsed: [...new Set(studioAssets.flatMap((item) => item.asset.loaderDiagnostics.extensionsUsed))],
    vertexCount: studioAssets.reduce((total, item) => total + item.asset.loaderDiagnostics.vertexCount, 0),
    indexCount: studioAssets.reduce((total, item) => total + item.asset.loaderDiagnostics.indexCount, 0)
  };
  const studioStage = createV6ComposedProductionStageScene(studioAssets.map((asset) => asset.pipeline), {
    width: studioCanvas.width,
    height: studioCanvas.height
  }, {
    yawRadians: -0.34,
    pitchRadians: -0.15,
    paddingRatio: 0.06,
    floorColor: [0.36, 0.37, 0.36, 1],
    backdropColor: [0.16, 0.18, 0.2, 1],
    environmentLighting: studioLighting.lighting,
    postprocess: studioAssets[0]!.pipeline.source.postprocess
  });
  const sunsetStage = createV6ComposedProductionStageScene(sunsetAssets.map((asset) => asset.pipeline), {
    width: sunsetCanvas.width,
    height: sunsetCanvas.height
  }, {
    yawRadians: -0.42,
    pitchRadians: -0.14,
    paddingRatio: 0.06,
    floorColor: [0.42, 0.31, 0.26, 1],
    backdropColor: [0.18, 0.13, 0.16, 1],
    environmentLighting: sunsetLighting.lighting,
    postprocess: sunsetAssets[0]!.pipeline.source.postprocess
  });
  const studioProof = studioRenderer.renderImportedAsset({
    source: studioStage.source,
    camera: studioStage.camera,
    metadata: {
      ...metadata,
      environmentId: "studio-small-08",
      hdrEnvironmentUri: `${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`
    }
  });
  const sunsetProof = sunsetRenderer.renderImportedAsset({
    source: sunsetStage.source,
    camera: sunsetStage.camera,
    metadata: {
      ...metadata,
      environmentId: "venice-sunset",
      hdrEnvironmentUri: `${location.origin}/fixtures/v6/environments/hdri/venice_sunset_1k.hdr`
    }
  });

  window.__V6_PBR_HDR__ = {
    status: "ready",
    studioAssetIds: studioAssets.map((asset) => asset.id),
    sunsetAssetIds: sunsetAssets.map((asset) => asset.id),
    studioProof,
    sunsetProof,
    studioSummary: summarizeV6WebGL2Proof(studioProof),
    sunsetSummary: summarizeV6WebGL2Proof(sunsetProof),
    studioPipeline: studioPipeline.diagnostics,
    sunsetPipeline: sunsetPipeline.diagnostics,
    pixelDelta: Math.abs(studioProof.pixels.averageLuma - sunsetProof.pixels.averageLuma)
      + Math.abs(studioProof.pixels.uniqueColorBuckets - sunsetProof.pixels.uniqueColorBuckets)
  };
}

async function loadSceneAsset(
  id: string,
  file: string,
  label: string,
  canvas: HTMLCanvasElement,
  environmentLighting: NonNullable<Parameters<typeof createV6ComposedProductionStageScene>[2]["environmentLighting"]>
) {
  const assetUri = `${location.origin}/fixtures/v6/assets/corpus/${file}`;
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

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing canvas ${id}`);
  }
  return canvas;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V6_PBR_HDR__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

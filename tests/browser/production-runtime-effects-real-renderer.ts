import { loadV6GLTFRenderPipeline } from "/packages/assets/src/asset-corpus/V6GLTFRenderPipeline.js";
import {
  Geometry,
  PBRMaterial,
  ProductionWebGL2Renderer,
  createV6EffectsRenderSource,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6EffectsProof,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/index.js";
import { createV6ProductionStageScene } from "/tests/browser/production-runtime-production-scene-tools.js";

declare global {
  interface Window {
    __V6_EFFECTS__?: unknown;
  }
}

async function run(): Promise<void> {
  const canvas = document.getElementById("effects");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing effects canvas");
  const hdr = await fetchBytes(`${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.15,
    backgroundIntensity: 0.85,
    rotation: 0.15,
    toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
  });
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const pipeline = await loadV6GLTFRenderPipeline({
    url: `${location.origin}/fixtures/asset-corpus/damaged-helmet.glb`,
    assetId: "damaged-helmet",
    assetName: "Damaged Helmet",
    width: canvas.width,
    height: canvas.height,
    rendererInput: {
      qualityPreset: "hdr-studio-preview",
      environmentLighting: lighting.lighting,
      cameraPolicy: "require"
    }
  });
  const key = pipeline.resources.scene.createLight("directional", "production-runtime-shadow-key");
  key.castsShadow = true;
  key.intensity = 1.2;
  key.color = [1, 0.94, 0.84];
  pipeline.resources.scene.root.addChild(key);
  const transparentOverlay = {
    geometry: Geometry.uvSphere(0.38, 24, 12),
    material: new PBRMaterial({
      baseColor: [0.25, 0.65, 1, 0.36],
      roughness: 0.18,
      metallic: 0,
      renderState: {
        blend: true,
        depthWrite: false,
        cullMode: "none"
      }
    }),
    label: "production-runtime-transparent-overlay",
    includeInAutoFrame: false
  };
  const source = createV6EffectsRenderSource({
    ...pipeline.source,
    renderItems: [...(pipeline.source.renderItems ?? []), transparentOverlay]
  }, { transparentItemCount: 1 });
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.015, 0.018, 0.024, 1]
  });
  const staged = createV6ProductionStageScene(source, pipeline.resources.bounds, {
    width: canvas.width,
    height: canvas.height
  }, {
    yawRadians: -0.38,
    pitchRadians: -0.14,
    paddingRatio: 0.06,
    floorColor: [0.31, 0.34, 0.36, 1],
    backdropColor: [0.13, 0.16, 0.19, 1]
  });
  const proof = renderer.renderImportedAsset({
    source: staged.source,
    camera: staged.camera,
    metadata: {
      assetId: pipeline.metadata.assetId,
      assetName: pipeline.metadata.assetName,
      assetUri: pipeline.metadata.assetUri,
      meshCount: pipeline.metadata.meshCount,
      primitiveCount: pipeline.metadata.primitiveCount + 1,
      materialCount: pipeline.metadata.materialCount + 1,
      textureCount: pipeline.metadata.textureCount,
      imageCount: pipeline.metadata.imageCount,
      animationCount: pipeline.metadata.animationCount,
      skinCount: pipeline.metadata.skinCount,
      morphTargetCount: pipeline.metadata.morphTargetCount,
      vertexCount: pipeline.metadata.vertexCount,
      indexCount: pipeline.metadata.indexCount,
      extensionsUsed: pipeline.metadata.extensionsUsed,
      environmentId: "studio-small-08",
      hdrEnvironmentUri: `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`
    }
  });
  const effectsSummary = summarizeV6EffectsProof(proof, { transparentItemCount: 1 });
  window.__V6_EFFECTS__ = {
    status: "ready",
    webglSummary: summarizeV6WebGL2Proof(proof),
    effectsSummary,
    proof,
    importedMetadata: pipeline.metadata,
    hdr: hdrPipeline.diagnostics
  };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V6_EFFECTS__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

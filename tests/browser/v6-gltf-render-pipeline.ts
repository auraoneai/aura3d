import { loadV6GLTFRenderPipeline } from "/packages/assets/src/v6/V6GLTFRenderPipeline.js";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/v6/index.js";
import { createV6ProductionStageScene } from "/tests/browser/v6-production-scene-tools.js";

declare global {
  interface Window {
    __V6_GLTF_RENDER__?: unknown;
  }
}

async function run(): Promise<void> {
  const hdr = await fetchBytes(`${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.15,
    backgroundIntensity: 0.85,
    rotation: 0.15,
    toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
  });
  const assets = [
    { id: "damaged-helmet", name: "Damaged Helmet", path: "damaged-helmet.glb", canvas: "damaged-helmet" },
    { id: "clear-coat-test", name: "Clear Coat Test", path: "clear-coat-test.glb", canvas: "clearcoat" },
    { id: "cesium-man", name: "Cesium Man", path: "cesium-man.glb", canvas: "cesium-man" }
  ] as const;
  const results = [];
  for (const item of assets) {
    const canvas = requireCanvas(item.canvas);
    const lighting = createV6EnvironmentLightingResources(hdrPipeline);
    const pipeline = await loadV6GLTFRenderPipeline({
      url: `${location.origin}/fixtures/v6/assets/corpus/${item.path}`,
      assetId: item.id,
      assetName: item.name,
      width: canvas.width,
      height: canvas.height,
      rendererInput: {
        environmentLighting: lighting.lighting,
        qualityPreset: "hdr-studio-preview",
        cameraPolicy: "require"
      }
    });
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width: canvas.width,
      height: canvas.height,
      preserveDrawingBuffer: true,
      clearColor: [0.015, 0.018, 0.024, 1]
    });
    const staged = createV6ProductionStageScene(pipeline.source, pipeline.resources.bounds, {
      width: canvas.width,
      height: canvas.height
    }, {
      yawRadians: item.id === "clear-coat-test" ? -0.22 : -0.36,
      pitchRadians: item.id === "clear-coat-test" ? -0.08 : -0.15,
      paddingRatio: item.id === "clear-coat-test" ? 0.02 : 0.07,
      floorColor: item.id === "clear-coat-test" ? [0.38, 0.39, 0.4, 1] : [0.34, 0.36, 0.37, 1],
      backdropColor: [0.15, 0.17, 0.19, 1]
    });
    const proof = renderer.renderImportedAsset({
      source: staged.source,
      camera: staged.camera,
      metadata: {
        assetId: pipeline.metadata.assetId,
        assetName: pipeline.metadata.assetName,
        assetUri: pipeline.metadata.assetUri,
        meshCount: pipeline.metadata.meshCount,
        primitiveCount: pipeline.metadata.primitiveCount,
        materialCount: pipeline.metadata.materialCount,
        textureCount: pipeline.metadata.textureCount,
        imageCount: pipeline.metadata.imageCount,
        animationCount: pipeline.metadata.animationCount,
        skinCount: pipeline.metadata.skinCount,
        morphTargetCount: pipeline.metadata.morphTargetCount,
        vertexCount: pipeline.metadata.vertexCount,
        indexCount: pipeline.metadata.indexCount,
        extensionsUsed: pipeline.metadata.extensionsUsed,
        environmentId: "studio-small-08",
        hdrEnvironmentUri: `${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`
      }
    });
    results.push({
      id: item.id,
      metadata: pipeline.metadata,
      summary: summarizeV6WebGL2Proof(proof),
      proof
    });
  }
  window.__V6_GLTF_RENDER__ = {
    status: "ready",
    hdr: hdrPipeline.diagnostics,
    results
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
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V6_GLTF_RENDER__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

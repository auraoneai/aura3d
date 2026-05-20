import { loadV6GLTFRenderPipeline } from "/packages/assets/src/v6/V6GLTFRenderPipeline.js";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6OrbitControlPreset,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6AnimationWorkflow,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/v6/index.js";
import { createV6ProductionStageScene } from "/tests/browser/v6-production-scene-tools.js";

declare global {
  interface Window {
    __V6_ANIMATION_CONTROLS__?: unknown;
  }
}

async function run(): Promise<void> {
  const hdr = await fetchBytes(`${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.2,
    backgroundIntensity: 0.85,
    rotation: 0.25,
    toneMapping: { operator: "filmic", exposure: 1.05, whitePoint: 11.2 }
  });
  const assets = [
    {
      id: "cesium-man",
      name: "Cesium Man",
      path: "cesium-man.glb",
      canvas: "cesium-man",
      yawRadians: -0.38,
      pitchRadians: -0.12,
      expected: "skinning"
    },
    {
      id: "animated-morph-cube",
      name: "Animated Morph Cube",
      path: "animated-morph-cube.glb",
      canvas: "animated-morph-cube",
      yawRadians: 0.42,
      pitchRadians: -0.2,
      expected: "morph-targets"
    }
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
        qualityPreset: "studio-preview",
        cameraPolicy: "require",
        frame: { yawRadians: item.yawRadians, pitchRadians: item.pitchRadians, paddingRatio: 0.18 },
        postprocess: false
      }
    });
    const orbit = createV6OrbitControlPreset(
      pipeline.resources.bounds,
      { width: canvas.width, height: canvas.height },
      { yawRadians: item.yawRadians, pitchRadians: item.pitchRadians, paddingRatio: 0.22 }
    );
    const animation = summarizeV6AnimationWorkflow({
      assetId: pipeline.metadata.assetId,
      animationCount: pipeline.metadata.animationCount,
      skinCount: pipeline.metadata.skinCount,
      morphTargetCount: pipeline.metadata.morphTargetCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount
    });
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width: canvas.width,
      height: canvas.height,
      preserveDrawingBuffer: true,
      clearColor: [0.012, 0.015, 0.02, 1]
    });
    const staged = createV6ProductionStageScene(pipeline.source, pipeline.resources.bounds, {
      width: canvas.width,
      height: canvas.height
    }, {
      yawRadians: item.yawRadians,
      pitchRadians: item.pitchRadians,
      paddingRatio: item.id === "cesium-man" ? 0.04 : 0.08,
      floorColor: [0.34, 0.36, 0.37, 1],
      backdropColor: [0.15, 0.17, 0.19, 1]
    });
    const proof = renderWithAssetContext(renderer, pipeline, staged, `${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`);
    results.push({
      id: item.id,
      expected: item.expected,
      metadata: pipeline.metadata,
      animation,
      orbit: {
        target: orbit.target,
        distance: orbit.distance,
        yawRadians: orbit.yawRadians,
        pitchRadians: orbit.pitchRadians,
        minDistance: orbit.minDistance,
        maxDistance: orbit.maxDistance,
        near: orbit.frame.near,
        far: orbit.frame.far,
        viewMatrixFinite: orbit.frame.viewMatrix.every(Number.isFinite),
        projectionMatrixFinite: orbit.frame.projectionMatrix.every(Number.isFinite),
        viewProjectionMatrixFinite: orbit.frame.viewProjectionMatrix.every(Number.isFinite)
      },
      summary: summarizeV6WebGL2Proof(proof),
      proof
    });
  }

  window.__V6_ANIMATION_CONTROLS__ = {
    status: "ready",
    hdr: hdrPipeline.diagnostics,
    results
  };
}

function renderWithAssetContext(
  renderer: ProductionWebGL2Renderer,
  pipeline: Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>,
  staged: ReturnType<typeof createV6ProductionStageScene>,
  hdrEnvironmentUri: string
) {
  try {
    return renderer.renderImportedAsset({
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
        hdrEnvironmentUri
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    throw new Error(`V6 animation-controls render failed for ${pipeline.metadata.assetId}: ${message}`);
  }
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
  window.__V6_ANIMATION_CONTROLS__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

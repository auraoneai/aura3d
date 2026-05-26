import { loadProductionGLTFRenderPipeline } from "/packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import {
  ProductionWebGL2Renderer,
  createProductionEnvironmentLightingResources,
  createProductionOrbitControlPreset,
  createProductionPbrHdrPipelineFromRadiance,
  summarizeProductionAnimationWorkflow,
  summarizeProductionWebGL2Proof
} from "/packages/rendering/src/production-runtime/index.js";
import { createProductionProductionStageScene } from "/tests/browser/production-runtime-production-scene-tools.js";

declare global {
  interface Window {
    __PRODUCTION_ANIMATION_CONTROLS__?: unknown;
  }
}

async function run(): Promise<void> {
  const hdr = await fetchBytes(`${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`);
  const hdrPipeline = createProductionPbrHdrPipelineFromRadiance(hdr, {
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
      url: `${location.origin}/fixtures/three-compat/assets/corpus/cesium-man.glb`,
      canvas: "cesium-man",
      yawRadians: -0.38,
      pitchRadians: -0.12,
      expected: "skinning"
    },
    {
      id: "external-parity-morph-expression",
      name: "Morph Expression",
      url: `${location.origin}/fixtures/external-parity-assets/morph/external-parity-morph-expression/external-parity-morph-expression.gltf`,
      canvas: "animated-morph-cube",
      yawRadians: 0.42,
      pitchRadians: -0.2,
      expected: "morph-targets"
    }
  ] as const;

  const results = [];
  for (const item of assets) {
    const canvas = requireCanvas(item.canvas);
    const lighting = createProductionEnvironmentLightingResources(hdrPipeline);
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: item.url,
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
    const orbit = createProductionOrbitControlPreset(
      pipeline.resources.bounds,
      { width: canvas.width, height: canvas.height },
      { yawRadians: item.yawRadians, pitchRadians: item.pitchRadians, paddingRatio: 0.22 }
    );
    const animation = summarizeProductionAnimationWorkflow({
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
    const staged = createProductionProductionStageScene(pipeline.source, pipeline.resources.bounds, {
      width: canvas.width,
      height: canvas.height
    }, {
      yawRadians: item.yawRadians,
      pitchRadians: item.pitchRadians,
      paddingRatio: item.id === "cesium-man" ? 0.04 : 0.08,
      floorColor: [0.34, 0.36, 0.37, 1],
      backdropColor: [0.15, 0.17, 0.19, 1]
    });
    const proof = renderWithAssetContext(renderer, pipeline, staged, `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`);
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
      summary: summarizeProductionWebGL2Proof(proof),
      proof
    });
  }

  window.__PRODUCTION_ANIMATION_CONTROLS__ = {
    status: "ready",
    hdr: hdrPipeline.diagnostics,
    results
  };
}

function renderWithAssetContext(
  renderer: ProductionWebGL2Renderer,
  pipeline: Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>,
  staged: ReturnType<typeof createProductionProductionStageScene>,
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
    throw new Error(`Production animation-controls render failed for ${pipeline.metadata.assetId}: ${message}`);
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
  window.__PRODUCTION_ANIMATION_CONTROLS__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

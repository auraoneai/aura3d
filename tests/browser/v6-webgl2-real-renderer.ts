import { GLTFLoader } from "/packages/assets/src/GLTFLoader.js";
import { LoadContext } from "/packages/assets/src/LoadContext.js";
import { createGLTFRenderResources } from "/packages/assets/src/GLTFRenderResources.js";
import {
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  ProductionWebGL2Renderer,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/v6/index.js";
import { createV6ComposedProductionStageScene } from "/tests/browser/v6-production-scene-tools.js";

declare global {
  interface Window {
    __V6_WEBGL2__?: unknown;
  }
}

async function run(): Promise<void> {
  const canvas = document.getElementById("v6-webgl2");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("V6 WebGL2 harness canvas is missing.");
  }

  const hdrUri = `${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`;
  const hdr = await fetchBytes(hdrUri);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.75,
    backgroundIntensity: 0.82,
    rotation: -0.18,
    toneMapping: { operator: "filmic", exposure: 1.16, whitePoint: 9.6 }
  });
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const assets = await Promise.all([
    loadSceneAsset("damaged-helmet", "damaged-helmet.glb", "Damaged Helmet", canvas, lighting.lighting),
    loadSceneAsset("boom-box", "boom-box.glb", "Boom Box", canvas, lighting.lighting),
    loadSceneAsset("antique-camera", "antique-camera.glb", "Antique Camera", canvas, lighting.lighting)
  ]);
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.015, 0.018, 0.024, 1]
  });
  const staged = createV6ComposedProductionStageScene(assets.map((asset) => asset.pipeline), {
    width: canvas.width,
    height: canvas.height
  }, {
    yawRadians: -0.42,
    pitchRadians: -0.13,
    paddingRatio: 0.028,
    floorColor: [0.105, 0.112, 0.12, 1],
    backdropColor: [0.035, 0.04, 0.05, 1],
    includeSoftboxes: false,
    environmentLighting: lighting.lighting,
    postprocess: {
      targetFormat: "rgba16f",
      toneMapping: {
        exposure: 1.18,
        whitePoint: 1.35,
        operator: "filmic",
        inputColorSpace: "linear",
        outputColorSpace: "srgb"
      },
      colorGrade: {
        contrast: 1.18,
        saturation: 1.08,
        vibrance: 0.18,
        vignette: 0.12,
        sharpening: 0.42
      },
      bloom: {
        threshold: 0.86,
        intensity: 0.1,
        radius: 1
      },
      fxaa: {
        edgeThreshold: 0.08,
        subpixelBlend: 0.55
      }
    }
  });
  const primary = assets[0]!;
  const proof = renderer.renderImportedAsset({
    source: staged.source,
    camera: staged.camera,
    metadata: {
      assetId: "damaged-helmet-composed-proof",
      assetName: "Damaged Helmet, Boom Box, and Antique Camera",
      assetUri: primary.assetUri,
      meshCount: assets.reduce((total, item) => total + item.asset.meshes.length, 0),
      primitiveCount: assets.reduce((total, item) => total + item.asset.meshes.length, 0),
      materialCount: assets.reduce((total, item) => total + item.asset.materials.length, 0),
      textureCount: assets.reduce((total, item) => total + item.asset.textures.length, 0),
      imageCount: assets.reduce((total, item) => total + item.asset.images.length, 0),
      animationCount: assets.reduce((total, item) => total + item.asset.animations.length, 0),
      skinCount: assets.reduce((total, item) => total + item.asset.skins.length, 0),
      morphTargetCount: assets.reduce((total, item) => total + item.asset.meshes.reduce((meshTotal, mesh) => meshTotal + mesh.morphTargets.length, 0), 0),
      vertexCount: assets.reduce((total, item) => total + item.asset.loaderDiagnostics.vertexCount, 0),
      indexCount: assets.reduce((total, item) => total + item.asset.loaderDiagnostics.indexCount, 0),
      extensionsUsed: [...new Set(assets.flatMap((item) => item.asset.loaderDiagnostics.extensionsUsed))],
      environmentId: "studio-small-08",
      hdrEnvironmentUri: hdrUri
    }
  });

  window.__V6_WEBGL2__ = {
    status: "ready",
    assetIds: assets.map((asset) => asset.id),
    proof,
    summary: summarizeV6WebGL2Proof(proof)
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

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V6_WEBGL2__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

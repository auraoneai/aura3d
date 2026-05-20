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
  createV6HeroShaderLibrary,
  createV6PbrReferenceItems
} from "/tests/browser/v6-production-scene-tools.js";

declare global {
  interface Window {
    __V6_HD_PRODUCT_HERO__?: unknown;
  }
}

async function run(): Promise<void> {
  const canvas = document.getElementById("v6-hd-product-hero");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("V6 HD product hero canvas is missing.");
  }

  const hdrUri = `${location.origin}/fixtures/v6/environments/hdri/studio_small_08_1k.hdr`;
  const hdr = await fetchBytes(hdrUri);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.52,
    backgroundIntensity: 0.78,
    rotation: -0.22,
    toneMapping: { operator: "filmic", exposure: 1, whitePoint: 8.8 }
  });
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const assetUri = `${location.origin}/fixtures/v6/assets/corpus/damaged-helmet.glb`;
  const asset = await new GLTFLoader().load({ url: assetUri }, new LoadContext());
  const resources = await createGLTFRenderResources(asset);
  const input = resources.toRendererInput({ width: canvas.width, height: canvas.height }, {
    qualityPreset: "hdr-studio-preview",
    environmentLighting: lighting.lighting,
    cameraPolicy: "require",
    postprocess: {
      targetFormat: "rgba16f",
      toneMapping: {
        exposure: 1.08,
        whitePoint: 2.25,
        operator: "filmic",
        inputColorSpace: "linear",
        outputColorSpace: "srgb"
      },
      colorGrade: {
        contrast: 1.36,
        saturation: 1.1,
        vibrance: 0.18,
        vignette: 0.08,
        sharpening: 0.84
      },
      bloom: {
        threshold: 0.82,
        intensity: 0.11,
        radius: 1
      },
      fxaa: {
        edgeThreshold: 0.08,
        subpixelBlend: 0.5
      }
    }
  });
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.008, 0.012, 1],
    shaderLibrary: createV6HeroShaderLibrary()
  });
  const skyboxTexture = lighting.lighting.environmentMapTexture;
  if (!skyboxTexture) {
    throw new Error("V6 HD product hero requires a sampled HDR environment texture for the visible skybox.");
  }
  const staged = createV6ComposedProductionStageScene([{
    source: input.source,
    resources,
    metadata: { assetId: "damaged-helmet" }
  }], {
    width: canvas.width,
    height: canvas.height
  }, {
    yawRadians: -0.46,
    pitchRadians: 0.03,
    paddingRatio: 0.012,
    floorColor: [0.025, 0.027, 0.031, 1],
    includeSoftboxes: false,
    includeBackdrop: false,
    environmentLighting: lighting.lighting,
    hdrSkybox: {
      texture: skyboxTexture,
      rotation: -0.22,
      exposure: 0.62
    }
  });
  const heroReferenceItems = createV6PbrReferenceItems(staged.frameBounds, lighting.lighting);
  const proof = renderer.renderImportedAsset({
    source: {
      ...staged.source,
      renderItems: [...(staged.source.renderItems ? [...staged.source.renderItems] : []), ...heroReferenceItems]
    },
    camera: staged.camera,
    metadata: {
      assetId: "damaged-helmet-hd-product-hero",
      assetName: "Damaged Helmet HD product hero",
      assetUri,
      meshCount: asset.meshes.length,
      primitiveCount: asset.meshes.length,
      materialCount: asset.materials.length,
      textureCount: asset.textures.length,
      imageCount: asset.images.length,
      animationCount: asset.animations.length,
      skinCount: asset.skins.length,
      morphTargetCount: asset.meshes.reduce((total, mesh) => total + mesh.morphTargets.length, 0),
      vertexCount: asset.loaderDiagnostics.vertexCount,
      indexCount: asset.loaderDiagnostics.indexCount,
      extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
      environmentId: "studio-small-08",
      hdrEnvironmentUri: hdrUri
    }
  });

  window.__V6_HD_PRODUCT_HERO__ = {
    status: "ready",
    assetId: "damaged-helmet",
    proof,
    summary: summarizeV6WebGL2Proof(proof),
    hdrPipeline: hdrPipeline.diagnostics
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
  window.__V6_HD_PRODUCT_HERO__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

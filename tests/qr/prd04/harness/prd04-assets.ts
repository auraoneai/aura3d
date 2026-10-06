// PRD-04 pipeline driver — exercises loadProductionGLTFRenderPipeline options
// directly (C-27 texture budget, P5-1 colour-space intent, C-16 decoders,
// R11 variants) without going through the agent-api scene.
//
// URL params:
//   asset=<url>                  (required) GLB to load, e.g. /fixtures/asset-corpus/damaged-helmet.glb
//   flags=<csv>                  a3d-qr flags (`materials`, `none`, ...)
//   textureBudget=<bytes>        C-27 budget policy (maps to textureBudgetBytes)
//   maxTextureSize=<px>          C-27 per-texture dimension cap
//   materialsR185=1|0            pipeline materialsR185 toggle (default: flags contains "materials"|"all")
//   materialsTransmission=1|0    pipeline materialsTransmission toggle (default same)
//   transmission=auto|env|off    pipeline transmission option
//   tangents=0|1                 override pipeline tangents
//   variant=<name>               materialVariant select at load; variantSelect=<name> rebinds after
//   decoders=<basePath>          decoders.basePath for wasm/draco/ktx2 modules
//   forceColorSpace=srgb|linear  wrap the image decoder to lie about decoded colorSpace (control)
//   render=1                     render one frame via the production renderer (contextLost probe)
//   pixels=1                     capture renderer framebuffer pixels into extra.frame
//   width|height=px              render size (default 512)
//   assetId=<name>               GLTFAsset id (default derived from URL)

import { loadProductionGLTFRenderPipeline } from "/packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import { decodeImageInBrowser } from "/packages/assets/src/gltf/ImageDecode.js";
import { imageColorSpaceIntent } from "/packages/assets/src/GLTFRenderResources.js";
import {
  ProductionWebGL2Renderer,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  summarizeProductionWebGL2Proof
} from "/packages/rendering/src/production-runtime/index.js";
import { createProductionProductionStageScene } from "/tests/browser/production-runtime-production-scene-tools.js";
import { resetTextureBudgetLedger, textureBudgetReport } from "/packages/rendering/src/textures/TextureBudget.js";
import { canvasPixels } from "/benchmarks/quality-rebuild/scenes/prd04/metrics.js";

declare global {
  interface Window {
    __QR_READY__?: unknown;
    __QR_ERROR__?: string;
  }
}

const params = new URLSearchParams(globalThis.location.search);
const stage = document.getElementById("stage") ?? document.body;
const canvas = document.createElement("canvas");
stage.appendChild(canvas);

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url} failed: HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function main(): Promise<void> {
  const assetUrl = params.get("asset");
  if (!assetUrl) throw new Error("asset param required");
  const flags = (params.get("flags") ?? "").split(",").filter((flag) => flag.length > 0);
  const flagOn = flags.includes("materials") || flags.includes("all");
  const width = Number(params.get("width") ?? 512);
  const height = Number(params.get("height") ?? 512);
  const wantRender = params.get("render") === "1" || params.get("pixels") === "1";
  const forceColorSpace = params.get("forceColorSpace") as "srgb" | "linear" | null;

  resetTextureBudgetLedger();

  const materialsR185 = params.has("materialsR185") ? params.get("materialsR185") === "1" : flagOn;
  const materialsTransmission = params.has("materialsTransmission")
    ? params.get("materialsTransmission") === "1"
    : flagOn;

  // forceColorSpace wraps the real decoder to lie about the decoded colour
  // space: under the lie the pipeline uploads with the wrong space, which is
  // the §16.1 S10 negative control (deltaE against the honest decode blows).
  const imageDecoder = forceColorSpace
    ? async (
        image: Parameters<typeof decodeImageInBrowser>[0],
        index: number,
        asset: Parameters<typeof decodeImageInBrowser>[2],
        options: Parameters<typeof decodeImageInBrowser>[3]
      ) => {
        const decoded = await decodeImageInBrowser(image, index, asset, options);
        return { ...decoded, colorSpace: forceColorSpace };
      }
    : decodeImageInBrowser;

  const hdr = wantRender
    ? await fetchBytes(`${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`)
    : null;
  const hdrPipeline = hdr
    ? createProductionPbrHdrPipelineFromRadiance(hdr, {
        id: "studio-small-08",
        label: "Studio Small 08",
        intensity: 1.2,
        backgroundIntensity: 0.85,
        rotation: 0.25,
        toneMapping: { operator: "filmic", exposure: 1.05, whitePoint: 11.2 }
      })
    : null;
  const lighting = hdrPipeline ? createProductionEnvironmentLightingResources(hdrPipeline) : null;

  canvas.width = width;
  canvas.height = height;
  const pipeline = await loadProductionGLTFRenderPipeline({
    url: assetUrl,
    assetId: params.get("assetId") ?? assetUrl.split("/").pop() ?? "probe-asset",
    imageDecoder,
    decoders: {
      basePath: params.get("decoders") ?? "/node_modules/@loaders.gl/textures/dist/libs",
      ktx2: true,
      draco: true,
      meshopt: true
    },
    compressedTextureCapabilities: { astc: true, bptc: false, etc2: true, s3tc: true, s3tcSrgb: true },
    materialsR185,
    materialsTransmission,
    ...(params.has("transmission") ? { transmission: params.get("transmission") as "auto" | "env" | "off" } : {}),
    ...(params.has("tangents") ? { tangents: params.get("tangents") === "1" } : {}),
    ...(params.has("textureBudget") ? { textureBudget: Number(params.get("textureBudget")) } : {}),
    ...(params.has("maxTextureSize") ? { maxTextureSize: Number(params.get("maxTextureSize")) } : {}),
    ...(params.get("variant") ? { materialVariant: params.get("variant")! } : {}),
    ...(wantRender
      ? {
          width,
          height,
          rendererInput: {
            environmentLighting: lighting!.lighting,
            qualityPreset: "studio-preview" as const,
            cameraPolicy: "require" as const,
            frame: { yawRadians: -0.34, pitchRadians: -0.16, paddingRatio: 0.18 },
            postprocess: false
          }
        }
      : {})
  });

  const variantResult = params.get("variantSelect")
    ? await pipeline.resources.setMaterialVariant(params.get("variantSelect"))
    : null;

  const budget = textureBudgetReport();
  const intent = imageColorSpaceIntent(pipeline.asset);
  const warnings = [
    ...pipeline.metadata.warnings.map((warning) => warning.code),
    ...pipeline.resources.loadIssues.map((issue) => issue.kind)
  ];

  const report: Record<string, unknown> & { extra: Record<string, unknown>; warnings: string[] } = {
    scene: `prd04-assets:${assetUrl}`,
    engine: "aura3d",
    flags,
    warnings,
    extra: {
      textureBytes: budget.textureBytes,
      downscaledTextures: budget.downscaled,
      imageCount: pipeline.metadata.imageCount,
      textureCount: pipeline.metadata.textureCount,
      colorSpaceByImage: [...intent.intent.values()],
      conflicts: intent.conflicts.map((conflict) => conflict.kind),
      variants: [...new Set(pipeline.resources.materialVariants.map((v) => v.variant))],
      variantSelect: variantResult,
      materialsR185,
      materialsTransmission
    }
  };

  if (wantRender) {
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width,
      height,
      preserveDrawingBuffer: params.get("pixels") === "1",
      clearColor: [0.012, 0.015, 0.02, 1]
    });
    const staged = createProductionProductionStageScene(
      pipeline.source,
      pipeline.resources.bounds,
      { width, height },
      { yawRadians: -0.34, pitchRadians: -0.16, paddingRatio: 0.08 }
    );
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
        hdrEnvironmentUri: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"
      }
    });
    const gl2 = canvas.getContext("webgl2");
    const contextLost = gl2 ? gl2.isContextLost() : false;
    report.extra.contextLost = contextLost;
    report.extra.renderSummary = summarizeProductionWebGL2Proof(proof);
    if (params.get("pixels") === "1") {
      report.extra.frame = { width, height, pixels: await canvasPixels(canvas) };
    }
    if (contextLost) report.warnings.push("context-lost");
    renderer.dispose();
  }

  window.__QR_READY__ = report;
}

main().catch((error) => {
  window.__QR_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}
${error.stack ?? ""}` : String(error);
});

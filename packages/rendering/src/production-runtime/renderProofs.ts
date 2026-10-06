/**
 * PRD-15 T2.6 — proof helpers moved verbatim out of `ProductionWebGL2Renderer.ts`
 * before that wrapper file was deleted (0 changed logic lines). `analyzePixels`,
 * `summarizeProductionWebGL2Proof` and `summarizeProductionProductionProof` keep
 * their public identities here so existing imports through the
 * `production-runtime` barrel resolve unchanged.
 */
import { Renderer } from "../Renderer";
import { Texture } from "../Texture";
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import {
  bindTransmissionBackdropCapture,
  createTransmissionBackdropSource,
  createSceneColorMipLevels,
  normalizeTransmissionBackdropCapture
} from "./TransmissionBackdropCapture";
import {
  PRODUCTION_WEBGL2_REQUIRED_FEATURES,
  RUNTIME_PARITY_WEBGPU_REQUIRED_FEATURES,
  type ProductionImportedAssetRenderMetadata,
  type ProductionPixelMetrics,
  type ProductionRenderProof,
  type ProductionRendererBackend,
  type ProductionRendererFeature,
  type ProductionRendererInput,
  type CurrentRoutesRendererTimingDiagnostics,
  type RuntimeParityTransmissionBackdropCaptureProof
} from "./ProductionRendererTypes";

export function summarizeProductionWebGL2Proof(proof: ProductionRenderProof) {
  const missing = PRODUCTION_WEBGL2_REQUIRED_FEATURES.filter((feature) => {
    const state = proof.features.find((item) => item.id === feature)?.state;
    return state !== "supported";
  });
  return {
    pass: missing.length === 0 && proof.realWebGL2 && !proof.mockDevice && !proof.canvas2dProof && proof.diagnostics.drawCalls > 0 && proof.pixels.nonBlackPixels > 0,
    missing,
    drawCalls: proof.diagnostics.drawCalls,
    liveTextures: proof.diagnostics.textures ?? 0,
    textureBytes: proof.diagnostics.textureBytes ?? 0,
    nonBlackPixels: proof.pixels.nonBlackPixels,
    averageLuma: proof.pixels.averageLuma,
    maxLuma: proof.pixels.maxLuma,
    uniqueColorBuckets: proof.pixels.uniqueColorBuckets
  };
}

export function summarizeProductionProductionProof(proof: ProductionRenderProof) {
  const requiredFeatures = proof.backend === "webgpu"
    ? RUNTIME_PARITY_WEBGPU_REQUIRED_FEATURES
    : PRODUCTION_WEBGL2_REQUIRED_FEATURES;
  const missing = requiredFeatures.filter((feature) => {
    const state = proof.features.find((item) => item.id === feature)?.state;
    return state !== "supported";
  });
  return {
    pass: missing.length === 0 && !proof.mockDevice && !proof.canvas2dProof && proof.diagnostics.drawCalls > 0 && proof.pixels.nonBlackPixels > 0,
    backend: proof.backend,
    missing,
    drawCalls: proof.diagnostics.drawCalls,
    liveTextures: proof.diagnostics.textures ?? 0,
    textureBytes: proof.diagnostics.textureBytes ?? 0,
    nonBlackPixels: proof.pixels.nonBlackPixels,
    averageLuma: proof.pixels.averageLuma,
    maxLuma: proof.pixels.maxLuma,
    uniqueColorBuckets: proof.pixels.uniqueColorBuckets
  };
}

export function analyzePixels(pixels: Uint8Array, width: number, height: number): ProductionPixelMetrics {
  let nonTransparentPixels = 0;
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let maxLuma = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    const a = pixels[offset + 3] ?? 0;
    if (a > 0) nonTransparentPixels += 1;
    if (r + g + b > 12) nonBlackPixels += 1;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaTotal += luma;
    maxLuma = Math.max(maxLuma, luma);
    buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  const centerOffset = ((Math.floor(height / 2) * width) + Math.floor(width / 2)) * 4;
  return {
    width,
    height,
    nonTransparentPixels,
    nonBlackPixels,
    averageLuma: pixels.length > 0 ? lumaTotal / (pixels.length / 4) : 0,
    maxLuma,
    uniqueColorBuckets: buckets.size,
    centerPixel: [
      pixels[centerOffset] ?? 0,
      pixels[centerOffset + 1] ?? 0,
      pixels[centerOffset + 2] ?? 0,
      pixels[centerOffset + 3] ?? 0
    ]
  };
}

// ---------------------------------------------------------------------------
// T2.5 — moved member bodies (was `ProductionWebGL2Renderer`'s :102-197 block
// plus its private timing/validation helpers). `this.renderer` → the `renderer`
// parameter; the wrapper's stored `width`/`height` → `input.viewport` or the
// device's canvas surface.

interface CurrentRoutesTimingAccumulator {
  now(): number;
  addRender(start: number): void;
  addReadback(start: number): void;
  addPixelAnalysis(start: number): void;
  addTransmissionBackdropCapture(start: number): void;
  snapshot(): CurrentRoutesRendererTimingDiagnostics;
}

function createCurrentRoutesTimingAccumulator(): CurrentRoutesTimingAccumulator {
  const source = hasPerformanceNow() ? "performance-now" : "date-now";
  const startedAt = readCurrentRoutesNow(source);
  let renderMs = 0;
  let readbackMs = 0;
  let pixelAnalysisMs = 0;
  let transmissionBackdropCaptureMs = 0;
  let hasReadback = false;
  let hasPixelAnalysis = false;
  let hasTransmissionBackdropCapture = false;
  const elapsed = (start: number) => Math.max(0, readCurrentRoutesNow(source) - start);
  return {
    now: () => readCurrentRoutesNow(source),
    addRender(start) {
      renderMs += elapsed(start);
    },
    addReadback(start) {
      hasReadback = true;
      readbackMs += elapsed(start);
    },
    addPixelAnalysis(start) {
      hasPixelAnalysis = true;
      pixelAnalysisMs += elapsed(start);
    },
    addTransmissionBackdropCapture(start) {
      hasTransmissionBackdropCapture = true;
      transmissionBackdropCaptureMs += elapsed(start);
    },
    snapshot() {
      return {
        source,
        totalMs: elapsed(startedAt),
        renderMs,
        ...(hasReadback ? { readbackMs } : {}),
        ...(hasPixelAnalysis ? { pixelAnalysisMs } : {}),
        ...(hasTransmissionBackdropCapture ? { transmissionBackdropCaptureMs } : {})
      };
    }
  };
}

function hasPerformanceNow(): boolean {
  return typeof globalThis.performance?.now === "function";
}

function readCurrentRoutesNow(source: CurrentRoutesRendererTimingDiagnostics["source"]): number {
  return source === "performance-now" ? globalThis.performance.now() : Date.now();
}

export function validateProductionRendererInput(input: ProductionRendererInput): void {
  if (input.metadata.primitiveCount <= 0 || input.metadata.meshCount <= 0) {
    throw new Error("Production render path requires at least one real mesh primitive.");
  }
  if (input.metadata.materialCount <= 0) {
    throw new Error("Production render path requires at least one real material.");
  }
}

export function rendererFeatureReport(
  renderer: Renderer,
  diagnostics = renderer.getDiagnostics(),
  input?: ProductionRendererInput,
  pixels?: ProductionPixelMetrics
): readonly ProductionRendererFeature[] {
  const capabilities = new Set(renderer.device.info.capabilities ?? []);
  const feature = (id: string, state: ProductionRendererFeature["state"], detail: string): ProductionRendererFeature => ({ id, state, detail });
  return [
    feature("real-webgl2-context", renderer.device.kind === "webgl2" ? "supported" : "blocked", `backend=${renderer.device.kind}`),
    feature("no-canvas2d-proof", "supported", "Render proof is produced by Renderer/WebGL2 and readPixels, not Canvas 2D drawing."),
    feature("no-mock-device", renderer.device.kind === "mock" ? "blocked" : "supported", "Production renderer creation refuses mock backend creation."),
    feature("imported-gltf-render-source", input && input.metadata.primitiveCount > 0 ? "supported" : "partial", input ? `${input.metadata.assetId}: ${input.metadata.primitiveCount} primitives` : "Awaiting imported asset render input."),
    feature("pbr-materials", input && input.metadata.materialCount > 0 ? "supported" : "partial", input ? `${input.metadata.materialCount} glTF materials in render metadata` : "Awaiting imported asset metadata."),
    feature("texture-upload-diagnostics", (diagnostics.textures ?? 0) > 0 ? "supported" : "partial", `${diagnostics.textures ?? 0} live textures, ${diagnostics.textureBytes ?? 0} bytes`),
    feature("render-target-diagnostics", diagnostics.renderTargets !== undefined ? "supported" : "partial", `${diagnostics.renderTargets ?? 0} live render targets`),
    feature("draw-call-diagnostics", diagnostics.drawCalls > 0 ? "supported" : "partial", `${diagnostics.drawCalls} draw calls in last frame`),
    feature("pixel-readback", pixels && pixels.nonBlackPixels > 0 ? "supported" : "partial", pixels ? `${pixels.nonBlackPixels} non-black pixels` : "Awaiting frame readback."),
    feature("hdr-ibl-ready", capabilities.has("hdr-image-based-lighting") ? "supported" : "partial", `capabilities=${[...capabilities].join(",")}`),
    feature("anisotropic-texture-filtering", capabilities.has("anisotropic-texture-filtering") ? "supported" : "partial", "WebGL EXT_texture_filter_anisotropic for sharper angled PBR texture sampling."),
    feature(
      "scene-color-transmission-capture",
      input?.transmissionBackdropCapture ? "supported" : "partial",
      input?.transmissionBackdropCapture
        ? "Renderer-owned first-pass scene-color readback is rebound as u_transmissionBackdropTexture for the final A3D transmission pass."
        : "Transmission backdrop capture was not requested for this proof."
    )
  ];
}

export function rendererInteractiveFeatureReport(renderer: Renderer, diagnostics: RenderDeviceDiagnostics, input: ProductionRendererInput): readonly ProductionRendererFeature[] {
  return rendererFeatureReport(renderer, diagnostics, input).filter(
    (feature) => feature.id !== "pixel-readback" && feature.id !== "scene-color-transmission-capture"
  );
}

export function rendererShadowReport(renderer: Renderer): Readonly<Record<string, unknown>> | null {
  return renderer.getShadowEvidence();
}

function rendererFrameSize(renderer: Renderer, input: ProductionRendererInput): { width: number; height: number } {
  const canvas = (renderer.device as { canvas?: { width: number; height: number } }).canvas;
  const width = input.viewport?.width ?? canvas?.width;
  const height = input.viewport?.height ?? canvas?.height;
  if (width === undefined || height === undefined) {
    throw new Error("rendererProofCapture needs input.viewport when the render device exposes no canvas surface.");
  }
  return { width, height };
}

export function rendererProofCapture(renderer: Renderer, input: ProductionRendererInput): ProductionRenderProof {
  validateProductionRendererInput(input);
  const { width, height } = rendererFrameSize(renderer, input);
  const timing = createCurrentRoutesTimingAccumulator();
  let transmissionBackdropCapture: RuntimeParityTransmissionBackdropCaptureProof | undefined;
  let transmissionBackdropTexture: Texture | undefined;
  const captureOptions = normalizeTransmissionBackdropCapture(input.transmissionBackdropCapture);
  if (captureOptions) {
    const backdrop = createTransmissionBackdropSource(input.source);
    const captureStart = timing.now();
    const captureRenderStart = timing.now();
    renderer.render(backdrop.source, input.camera);
    timing.addRender(captureRenderStart);
    const captureReadbackStart = timing.now();
    const scenePixels = renderer.device.readPixels(0, 0, width, height);
    timing.addReadback(captureReadbackStart);
    const mipLevels = createSceneColorMipLevels(scenePixels, width, height);
    transmissionBackdropTexture = new Texture({
      width,
      height,
      colorSpace: "srgb",
      mipLevels,
      label: "a3d-renderer-owned-scene-color-transmission-backdrop"
    });
    const materialBindings = bindTransmissionBackdropCapture(input.source, transmissionBackdropTexture, captureOptions);
    transmissionBackdropCapture = {
      mode: "renderer-owned-scene-color-readback",
      width,
      height,
      byteLength: scenePixels.byteLength,
      mipCount: mipLevels.length,
      strength: captureOptions.strength,
      refractionScale: captureOptions.refractionScale,
      materialBindings,
      excludedTransmissionItems: backdrop.excludedTransmissionItems
    };
    timing.addTransmissionBackdropCapture(captureStart);
  }
  const renderStart = timing.now();
  const diagnostics = renderer.render(input.source, input.camera);
  timing.addRender(renderStart);
  const readbackStart = timing.now();
  const pixelBytes = renderer.device.readPixels(0, 0, width, height);
  timing.addReadback(readbackStart);
  const analysisStart = timing.now();
  const pixels = analyzePixels(pixelBytes, width, height);
  timing.addPixelAnalysis(analysisStart);
  transmissionBackdropTexture?.dispose();
  const features = rendererFeatureReport(renderer, diagnostics, input, pixels);
  return {
    backend: renderer.device.kind as ProductionRendererBackend,
    realWebGL2: renderer.device.kind === "webgl2",
    mockDevice: renderer.device.kind === "mock",
    canvas2dProof: false,
    importedAsset: input.metadata as ProductionImportedAssetRenderMetadata,
    diagnostics,
    features,
    pixels,
    timing: timing.snapshot(),
    ...(transmissionBackdropCapture ? { transmissionBackdropCapture } : {})
  };
}

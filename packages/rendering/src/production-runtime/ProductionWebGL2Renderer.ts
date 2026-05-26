import { Renderer, type RendererOptions } from "../Renderer";
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import { Texture } from "../Texture";
import {
  bindTransmissionBackdropCapture,
  createSceneColorMipLevels,
  normalizeTransmissionBackdropCapture
} from "./TransmissionBackdropCapture";
import {
  PRODUCTION_WEBGL2_REQUIRED_FEATURES,
  RUNTIME_PARITY_WEBGPU_REQUIRED_FEATURES,
  type ProductionPixelMetrics,
  type ProductionRenderProof,
  type ProductionRendererFeature,
  type ProductionRendererInput,
  type CurrentRoutesProductionRenderer,
  type CurrentRoutesRendererTimingDiagnostics,
  type RuntimeParityFrameRenderResult,
  type RuntimeParityTransmissionBackdropCaptureProof
} from "./ProductionRendererTypes";

export interface ProductionWebGL2RendererOptions extends Omit<RendererOptions, "backend"> {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
}

export class ProductionWebGL2Renderer implements CurrentRoutesProductionRenderer {
  readonly backend = "webgl2" as const;

  private constructor(private readonly renderer: Renderer, private width: number, private height: number) {}

  static async create(options: ProductionWebGL2RendererOptions): Promise<ProductionWebGL2Renderer> {
    const renderer = await Renderer.create({
      ...options,
      backend: "webgl2",
      requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
    });
    if (renderer.device.kind !== "webgl2") {
      renderer.dispose();
      throw new Error(`Production production renderer requires a real WebGL2 device, got ${renderer.device.kind}.`);
    }
    return new ProductionWebGL2Renderer(renderer, options.width, options.height);
  }

  renderInteractiveFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    this.validateImportedAsset(input);
    const timing = createCurrentRoutesTimingAccumulator();
    const renderStart = timing.now();
    const diagnostics = this.renderer.render(input.source, input.camera);
    timing.addRender(renderStart);
    return {
      backend: "webgl2",
      diagnostics,
      features: this.getInteractiveFeatures(diagnostics, input),
      timing: timing.snapshot()
    };
  }

  renderFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    return this.renderInteractiveFrame(input);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.resize(width, height);
  }

  captureProof(input: ProductionRendererInput): ProductionRenderProof {
    this.validateImportedAsset(input);
    const timing = createCurrentRoutesTimingAccumulator();
    let transmissionBackdropCapture: RuntimeParityTransmissionBackdropCaptureProof | undefined;
    let transmissionBackdropTexture: Texture | undefined;
    const captureOptions = normalizeTransmissionBackdropCapture(input.transmissionBackdropCapture);
    if (captureOptions) {
      const captureStart = timing.now();
      const captureRenderStart = timing.now();
      this.renderer.render(input.source, input.camera);
      timing.addRender(captureRenderStart);
      const captureReadbackStart = timing.now();
      const scenePixels = this.renderer.device.readPixels(0, 0, this.width, this.height);
      timing.addReadback(captureReadbackStart);
      const mipLevels = createSceneColorMipLevels(scenePixels, this.width, this.height);
      transmissionBackdropTexture = new Texture({
        width: this.width,
        height: this.height,
        colorSpace: "srgb",
        mipLevels,
        label: "a3d-renderer-owned-scene-color-transmission-backdrop"
      });
      const materialBindings = bindTransmissionBackdropCapture(input.source, transmissionBackdropTexture, captureOptions);
      transmissionBackdropCapture = {
        mode: "renderer-owned-scene-color-readback",
        width: this.width,
        height: this.height,
        byteLength: scenePixels.byteLength,
        mipCount: mipLevels.length,
        strength: captureOptions.strength,
        refractionScale: captureOptions.refractionScale,
        materialBindings
      };
      timing.addTransmissionBackdropCapture(captureStart);
    }
    const renderStart = timing.now();
    const diagnostics = this.renderer.render(input.source, input.camera);
    timing.addRender(renderStart);
    const readbackStart = timing.now();
    const pixelBytes = this.renderer.device.readPixels(0, 0, this.width, this.height);
    timing.addReadback(readbackStart);
    const analysisStart = timing.now();
    const pixels = analyzePixels(pixelBytes, this.width, this.height);
    timing.addPixelAnalysis(analysisStart);
    transmissionBackdropTexture?.dispose();
    const features = this.getFeatures(diagnostics, input, pixels);
    return {
      backend: "webgl2",
      realWebGL2: this.renderer.device.kind === "webgl2",
      mockDevice: this.renderer.device.kind === "mock",
      canvas2dProof: false,
      importedAsset: input.metadata,
      diagnostics,
      features,
      pixels,
      timing: timing.snapshot(),
      ...(transmissionBackdropCapture ? { transmissionBackdropCapture } : {})
    };
  }

  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof {
    return this.captureProof(input);
  }

  getFeatures(diagnostics = this.getDiagnostics(), input?: ProductionRendererInput, pixels?: ProductionPixelMetrics): readonly ProductionRendererFeature[] {
    const capabilities = new Set(this.renderer.device.info.capabilities ?? []);
    const feature = (id: string, state: ProductionRendererFeature["state"], detail: string): ProductionRendererFeature => ({ id, state, detail });
    return [
      feature("real-webgl2-context", this.renderer.device.kind === "webgl2" ? "supported" : "blocked", `backend=${this.renderer.device.kind}`),
      feature("no-canvas2d-proof", "supported", "Render proof is produced by Renderer/WebGL2 and readPixels, not Canvas 2D drawing."),
      feature("no-mock-device", this.renderer.device.kind === "mock" ? "blocked" : "supported", "ProductionWebGL2Renderer refuses mock backend creation."),
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

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  dispose(): void {
    this.renderer.dispose();
  }

  private validateImportedAsset(input: ProductionRendererInput): void {
    if (input.metadata.primitiveCount <= 0 || input.metadata.meshCount <= 0) {
      throw new Error("Production imported-asset render path requires real glTF mesh primitives.");
    }
    if (input.metadata.materialCount <= 0) {
      throw new Error("Production imported-asset render path requires real material data.");
    }
  }

  private getInteractiveFeatures(diagnostics: RenderDeviceDiagnostics, input: ProductionRendererInput): readonly ProductionRendererFeature[] {
    return this.getFeatures(diagnostics, input).filter((feature) => feature.id !== "pixel-readback" && feature.id !== "scene-color-transmission-capture");
  }
}

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

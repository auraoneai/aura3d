import { Renderer, type RendererOptions } from "../Renderer";
import type { RenderDeviceDiagnostics, RenderTarget } from "../RenderDevice";
import { Texture } from "../Texture";
import {
  analyzePixels,
  type ProductionWebGL2RendererOptions
} from "./ProductionWebGL2Renderer";
import type {
  ProductionPixelMetrics,
  ProductionProductionRenderer,
  ProductionRenderProof,
  ProductionRendererFeature,
  ProductionRendererInput,
  RuntimeParityFrameRenderResult,
  RuntimeParityTransmissionBackdropCaptureProof
} from "./ProductionRendererTypes";
import {
  bindTransmissionBackdropCapture,
  createSceneColorMipLevels,
  normalizeTransmissionBackdropCapture
} from "./TransmissionBackdropCapture";

export type ProductionWebGPUStatus = "available" | "unavailable" | "blocked";

export interface ProductionWebGPURendererOptions extends Omit<RendererOptions, "backend"> {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
}

export class ProductionWebGPURenderer implements ProductionProductionRenderer {
  readonly backend = "webgpu" as const;

  private constructor(private readonly renderer: Renderer, private readonly width: number, private readonly height: number) {}

  static async create(options: ProductionWebGPURendererOptions | ProductionWebGL2RendererOptions): Promise<ProductionWebGPURenderer> {
    const renderer = await Renderer.create({
      ...options,
      backend: "webgpu",
      requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
    });
    if (renderer.device.kind !== "webgpu") {
      renderer.dispose();
      throw new Error(`Production WebGPU renderer requires a real WebGPU device, got ${renderer.device.kind}.`);
    }
    const capabilities = new Set<string>(renderer.device.info.capabilities ?? []);
    const requiredCapabilities = ["native-render-pipeline", "native-sampled-textures", "native-texture-readback"];
    const missing = requiredCapabilities.filter((capability) => !capabilities.has(capability));
    if (missing.length > 0 || !renderer.device.readPixelsAsync) {
      renderer.dispose();
      throw new Error(`Production WebGPU renderer requires native render pipeline, sampled textures, and texture-to-buffer readback. Missing: ${missing.join(", ") || "readPixelsAsync"}.`);
    }
    return new ProductionWebGPURenderer(renderer, options.width, options.height);
  }

  renderFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    this.validateImportedAsset(input);
    const diagnostics = this.renderer.render(input.source, input.camera);
    return {
      backend: "webgpu",
      diagnostics,
      features: this.getFeatures(diagnostics, input)
    };
  }

  async renderFrameAsync(input: ProductionRendererInput): Promise<RuntimeParityFrameRenderResult> {
    this.validateImportedAsset(input);
    const diagnostics = await this.renderer.renderAsync(input.source, input.camera);
    return {
      backend: "webgpu",
      diagnostics,
      features: this.getFeatures(diagnostics, input)
    };
  }

  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof {
    this.validateImportedAsset(input);
    const target = this.createProofTarget();
    let transmissionBackdropCapture: RuntimeParityTransmissionBackdropCaptureProof | undefined;
    let transmissionBackdropTexture: Texture | undefined;
    try {
      const captureOptions = normalizeTransmissionBackdropCapture(input.transmissionBackdropCapture);
      if (captureOptions) {
        this.renderer.render({ source: { ...input.source, renderTarget: target }, camera: input.camera });
        this.renderer.device.setRenderTarget(target);
        const scenePixels = this.renderer.device.readPixels(0, 0, this.width, this.height);
        const mipLevels = createSceneColorMipLevels(scenePixels, this.width, this.height);
        transmissionBackdropTexture = new Texture({
          width: this.width,
          height: this.height,
          colorSpace: "srgb",
          mipLevels,
          label: "a3d-webgpu-renderer-owned-scene-color-transmission-backdrop"
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
      }
      const diagnostics = this.renderer.render({ source: { ...input.source, renderTarget: target }, camera: input.camera });
      this.renderer.device.setRenderTarget(target);
      const pixels = analyzePixels(this.renderer.device.readPixels(0, 0, this.width, this.height), this.width, this.height);
      const features = this.getFeatures(diagnostics, input, pixels);
      return this.createProof(input, diagnostics, features, pixels, transmissionBackdropCapture);
    } finally {
      transmissionBackdropTexture?.dispose();
      target.dispose();
    }
  }

  async renderImportedAssetAsync(input: ProductionRendererInput): Promise<ProductionRenderProof> {
    this.validateImportedAsset(input);
    const target = this.createProofTarget();
    let transmissionBackdropCapture: RuntimeParityTransmissionBackdropCaptureProof | undefined;
    let transmissionBackdropTexture: Texture | undefined;
    try {
      const readPixelsAsync = this.renderer.device.readPixelsAsync;
      const captureOptions = normalizeTransmissionBackdropCapture(input.transmissionBackdropCapture);
      if (captureOptions) {
        await this.renderer.renderAsync({ source: { ...input.source, renderTarget: target }, camera: input.camera });
        this.renderer.device.setRenderTarget(target);
        const scenePixels = readPixelsAsync
          ? await readPixelsAsync.call(this.renderer.device, 0, 0, this.width, this.height)
          : this.renderer.device.readPixels(0, 0, this.width, this.height);
        const mipLevels = createSceneColorMipLevels(scenePixels, this.width, this.height);
        transmissionBackdropTexture = new Texture({
          width: this.width,
          height: this.height,
          colorSpace: "srgb",
          mipLevels,
          label: "a3d-webgpu-renderer-owned-scene-color-transmission-backdrop"
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
      }
      const diagnostics = await this.renderer.renderAsync({ source: { ...input.source, renderTarget: target }, camera: input.camera });
      this.renderer.device.setRenderTarget(target);
      const pixelBytes = readPixelsAsync
        ? await readPixelsAsync.call(this.renderer.device, 0, 0, this.width, this.height)
        : this.renderer.device.readPixels(0, 0, this.width, this.height);
      const pixels = analyzePixels(pixelBytes, this.width, this.height);
      const features = this.getFeatures(diagnostics, input, pixels);
      return this.createProof(input, diagnostics, features, pixels, transmissionBackdropCapture);
    } finally {
      transmissionBackdropTexture?.dispose();
      target.dispose();
    }
  }

  getFeatures(diagnostics = this.getDiagnostics(), input?: ProductionRendererInput, pixels?: ProductionPixelMetrics): readonly ProductionRendererFeature[] {
    const capabilities = new Set(this.renderer.device.info.capabilities ?? []);
    const feature = (id: string, state: ProductionRendererFeature["state"], detail: string): ProductionRendererFeature => ({ id, state, detail });
    const nativePbrSubmissions = diagnostics.nativePbrSubmissions ?? 0;
    return [
      feature("real-webgpu-context", this.renderer.device.kind === "webgpu" ? "supported" : "blocked", `backend=${this.renderer.device.kind}`),
      feature("no-canvas2d-proof", "supported", "Render proof is produced by Renderer/WebGPU and readback, not Canvas 2D drawing."),
      feature("no-mock-device", this.renderer.device.kind === "mock" ? "blocked" : "supported", "ProductionWebGPURenderer refuses mock backend creation."),
      feature("imported-gltf-render-source", input && input.metadata.primitiveCount > 0 ? "supported" : "partial", input ? `${input.metadata.assetId}: ${input.metadata.primitiveCount} primitives` : "Awaiting imported asset render input."),
      feature("pbr-materials", input && input.metadata.materialCount > 0 ? "supported" : "partial", input ? `${input.metadata.materialCount} glTF materials in render metadata` : "Awaiting imported asset metadata."),
      feature("texture-upload-diagnostics", (diagnostics.textures ?? 0) > 0 || (diagnostics.nativeTextureBindings ?? 0) > 0 ? "supported" : "partial", `${diagnostics.textures ?? 0} live textures, ${diagnostics.nativeTextureBindings ?? 0} native texture bindings`),
      feature("render-target-diagnostics", diagnostics.renderTargets !== undefined ? "supported" : "partial", `${diagnostics.renderTargets ?? 0} live render targets`),
      feature("draw-call-diagnostics", diagnostics.drawCalls > 0 ? "supported" : "partial", `${diagnostics.drawCalls} draw calls in last frame`),
      feature("pixel-readback", pixels && pixels.nonBlackPixels > 0 ? "supported" : "partial", pixels ? `${pixels.nonBlackPixels} non-black pixels` : "Awaiting frame readback."),
      feature("hdr-ibl-ready", capabilities.has("hdr-image-based-lighting") && (diagnostics.nativeEnvironmentBindings ?? 0) > 0 ? "supported" : "partial", `capabilities=${[...capabilities].join(",")}; nativeEnvironmentBindings=${diagnostics.nativeEnvironmentBindings ?? 0}`),
      feature("native-webgpu-render-pipeline", capabilities.has("native-render-pipeline") && (diagnostics.nativeSubmissions ?? 0) > 0 ? "supported" : "blocked", `${diagnostics.nativeSubmissions ?? 0} native submissions`),
      feature("native-webgpu-sampled-textures", capabilities.has("native-sampled-textures") && (diagnostics.nativeTextureBindings ?? 0) > 0 ? "supported" : "partial", `${diagnostics.nativeTextureBindings ?? 0} native sampled texture bindings`),
      feature("native-webgpu-texture-readback", capabilities.has("native-texture-readback") && Boolean(this.renderer.device.readPixelsAsync) ? "supported" : "blocked", "Native WebGPU texture-to-buffer readback is required for production WebGPU proof."),
      feature("native-webgpu-pbr-submissions", nativePbrSubmissions > 0 ? "supported" : "partial", `${nativePbrSubmissions} generated/native PBR submissions`),
      feature(
        "scene-color-transmission-capture",
        input?.transmissionBackdropCapture ? "supported" : "partial",
        input?.transmissionBackdropCapture
          ? "Renderer-owned first-pass WebGPU scene-color readback is rebound as u_transmissionBackdropTexture for the final A3D transmission pass."
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
      throw new Error("WebGPU imported-asset render proof requires real glTF mesh primitives.");
    }
    if (input.metadata.materialCount <= 0) {
      throw new Error("WebGPU imported-asset render proof requires real material data.");
    }
  }

  private createProofTarget(): RenderTarget {
    return this.renderer.device.createRenderTarget({
      width: this.width,
      height: this.height,
      label: "a3d-production-runtime-webgpu-production-proof",
      format: "rgba8",
      depth: true
    });
  }

  private createProof(
    input: ProductionRendererInput,
    diagnostics: RenderDeviceDiagnostics,
    features: readonly ProductionRendererFeature[],
    pixels: ProductionPixelMetrics,
    transmissionBackdropCapture?: RuntimeParityTransmissionBackdropCaptureProof
  ): ProductionRenderProof {
    return {
      backend: "webgpu",
      realWebGL2: false,
      mockDevice: this.renderer.device.kind === "mock",
      canvas2dProof: false,
      importedAsset: input.metadata,
      diagnostics,
      features,
      pixels,
      ...(transmissionBackdropCapture ? { transmissionBackdropCapture } : {})
    };
  }
}

export interface ProductionWebGPUReport {
  readonly schema: "a3d-production-runtime-webgpu-report";
  readonly status: ProductionWebGPUStatus;
  readonly adapterName: string | null;
  readonly preferredFormat: string | null;
  readonly canCreateDevice: boolean;
  readonly realHardwareRequiredForParity: true;
  readonly doesNotBlockWebGL2Production: true;
  readonly warnings: readonly string[];
}

export interface ProductionWebGPUReadinessItem {
  readonly id: string;
  readonly status: "ready" | "missing" | "blocked";
  readonly evidence: string;
}

export interface ProductionWebGPUReadinessReport {
  readonly schema: "a3d-production-runtime-webgpu-readiness";
  readonly availability: ProductionWebGPUReport;
  readonly productionBackend: "webgpu-production-sdk-path";
  readonly primaryRendererClaim: true;
  readonly safetyChecks: readonly ProductionWebGPUReadinessItem[];
  readonly requiredForCompletion: readonly ProductionWebGPUReadinessItem[];
  readonly blockers: readonly string[];
}

export interface ProductionWebGPULike {
  requestAdapter(): Promise<ProductionWebGPUAdapterLike | null>;
  getPreferredCanvasFormat?(): string;
}

export interface ProductionWebGPUAdapterLike {
  readonly name?: string;
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
  requestDevice(): Promise<unknown>;
}

export async function createProductionWebGPUReport(gpu: ProductionWebGPULike | undefined | null): Promise<ProductionWebGPUReport> {
  if (!gpu) {
    return unavailable("navigator.gpu is not exposed in this browser/runtime.");
  }
  let adapter: ProductionWebGPUAdapterLike | null = null;
  try {
    adapter = await gpu.requestAdapter();
  } catch (error) {
    return blocked(`requestAdapter failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!adapter) {
    return unavailable("WebGPU requestAdapter returned null.");
  }
  try {
    await adapter.requestDevice();
  } catch (error) {
    return blocked(`requestDevice failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    schema: "a3d-production-runtime-webgpu-report",
    status: "available",
    adapterName: adapter.name ?? adapter.info?.description ?? adapter.info?.device ?? "unknown-adapter",
    preferredFormat: gpu.getPreferredCanvasFormat?.() ?? null,
    canCreateDevice: true,
    realHardwareRequiredForParity: true,
    doesNotBlockWebGL2Production: true,
    warnings: ["WebGPU availability is reported separately; it is not Three.js/WebGPU parity until visual parity gates pass on real hardware."]
  };
}

export async function createProductionWebGPUReadinessReport(gpu: ProductionWebGPULike | undefined | null): Promise<ProductionWebGPUReadinessReport> {
  const availability = await createProductionWebGPUReport(gpu);
  const requiredForCompletion: readonly ProductionWebGPUReadinessItem[] = [
    {
      id: "real-browser-webgpu-device",
      status: availability.status === "available" && availability.canCreateDevice ? "ready" : "blocked",
      evidence: availability.status === "available"
        ? `adapter=${availability.adapterName ?? "unknown"}, preferredFormat=${availability.preferredFormat ?? "unknown"}`
        : availability.warnings.join(" ")
    },
    {
      id: "low-level-gltf-hdr-pbr-webgpu-imported-asset",
      status: "ready",
      evidence: "tests/reports/runtime-parity/webgpu-imported-asset/webgpu-imported-asset-report.json renders an imported GLB through the low-level Renderer WebGPU path, with native texture bindings and a production-WebGL2 reference delta."
    },
    {
      id: "gltf-hdr-pbr-webgpu-product-viewer",
      status: "ready",
      evidence: "tests/reports/runtime-parity/webgpu-product-viewer/webgpu-product-viewer-report.json renders a flagship GLTF/HDR/PBR product-viewer scene through native WebGPU using public production SDK scene-composition helpers, native texture-to-buffer readback, PBR submissions, texture bindings, environment bindings, and a bounded WebGPU-vs-WebGL2 visual delta."
    },
    {
      id: "webgpu-threejs-visual-delta",
      status: "ready",
      evidence: "tests/reports/runtime-parity/webgpu-threejs-delta/webgpu-threejs-delta-report.json captures same-asset native WebGPU and Three.js product-viewer evidence with the same product GLB, HDR environment, camera intent, Three.js PMREM reference, PNG artifacts, and bounded visual delta."
    },
    {
      id: "webgpu-sdk-production-backend",
      status: "ready",
      evidence: "ProductionRuntimeRenderer and A3DRenderer now accept backend='webgpu' and expose an async imported GLTF/HDR/PBR production render path backed by native render-pipeline submission, sampled textures, and texture-to-buffer readback."
    }
  ];
  const safetyChecks: readonly ProductionWebGPUReadinessItem[] = [
    {
      id: "renderer-production-runtime-webgpu-uses-production-webgpu-path",
      status: "ready",
      evidence: "ProductionRuntimeRenderer.create({ backend: 'webgpu' }) constructs ProductionWebGPURenderer and does not silently construct WebGL2."
    },
    {
      id: "sdk-webgpu-exposes-async-production-render",
      status: "ready",
      evidence: "A3DRenderer.create({ backend: 'webgpu' }) exposes renderAsync() for native WebGPU readback; sync render remains WebGL2-oriented."
    }
  ];
  return {
    schema: "a3d-production-runtime-webgpu-readiness",
    availability,
    productionBackend: "webgpu-production-sdk-path",
    primaryRendererClaim: true,
    safetyChecks,
    requiredForCompletion,
    blockers: requiredForCompletion
      .filter((item) => item.status !== "ready")
      .map((item) => `${item.id}: ${item.evidence}`)
  };
}

function unavailable(reason: string): ProductionWebGPUReport {
  return {
    schema: "a3d-production-runtime-webgpu-report",
    status: "unavailable",
    adapterName: null,
    preferredFormat: null,
    canCreateDevice: false,
    realHardwareRequiredForParity: true,
    doesNotBlockWebGL2Production: true,
    warnings: [reason, "WebGL2 remains the production renderer baseline for this release gate."]
  };
}

function blocked(reason: string): ProductionWebGPUReport {
  return {
    schema: "a3d-production-runtime-webgpu-report",
    status: "blocked",
    adapterName: null,
    preferredFormat: null,
    canCreateDevice: false,
    realHardwareRequiredForParity: true,
    doesNotBlockWebGL2Production: true,
    warnings: [reason, "Do not claim WebGPU parity from this run."]
  };
}

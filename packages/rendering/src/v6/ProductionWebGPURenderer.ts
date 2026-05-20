import { Renderer, type RendererOptions } from "../Renderer";
import type { RenderDeviceDiagnostics, RenderTarget } from "../RenderDevice";
import { Texture } from "../Texture";
import {
  analyzePixels,
  type ProductionWebGL2RendererOptions
} from "./ProductionWebGL2Renderer";
import type {
  V6PixelMetrics,
  V6ProductionRenderer,
  V6RenderProof,
  V6RendererFeature,
  V6RendererInput,
  V7FrameRenderResult,
  V7TransmissionBackdropCaptureProof
} from "./ProductionRendererTypes";
import {
  bindTransmissionBackdropCapture,
  createSceneColorMipLevels,
  normalizeTransmissionBackdropCapture
} from "./TransmissionBackdropCapture";

export type V6WebGPUStatus = "available" | "unavailable" | "blocked";

export interface ProductionWebGPURendererOptions extends Omit<RendererOptions, "backend"> {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
}

export class ProductionWebGPURenderer implements V6ProductionRenderer {
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
      throw new Error(`V7 production WebGPU renderer requires a real WebGPU device, got ${renderer.device.kind}.`);
    }
    const capabilities = new Set<string>(renderer.device.info.capabilities ?? []);
    const requiredCapabilities = ["native-render-pipeline", "native-sampled-textures", "native-texture-readback"];
    const missing = requiredCapabilities.filter((capability) => !capabilities.has(capability));
    if (missing.length > 0 || !renderer.device.readPixelsAsync) {
      renderer.dispose();
      throw new Error(`V7 production WebGPU renderer requires native render pipeline, sampled textures, and texture-to-buffer readback. Missing: ${missing.join(", ") || "readPixelsAsync"}.`);
    }
    return new ProductionWebGPURenderer(renderer, options.width, options.height);
  }

  renderFrame(input: V6RendererInput): V7FrameRenderResult {
    this.validateImportedAsset(input);
    const diagnostics = this.renderer.render(input.source, input.camera);
    return {
      backend: "webgpu",
      diagnostics,
      features: this.getFeatures(diagnostics, input)
    };
  }

  async renderFrameAsync(input: V6RendererInput): Promise<V7FrameRenderResult> {
    this.validateImportedAsset(input);
    const diagnostics = await this.renderer.renderAsync(input.source, input.camera);
    return {
      backend: "webgpu",
      diagnostics,
      features: this.getFeatures(diagnostics, input)
    };
  }

  renderImportedAsset(input: V6RendererInput): V6RenderProof {
    this.validateImportedAsset(input);
    const target = this.createProofTarget();
    let transmissionBackdropCapture: V7TransmissionBackdropCaptureProof | undefined;
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
          label: "g3d-webgpu-renderer-owned-scene-color-transmission-backdrop"
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

  async renderImportedAssetAsync(input: V6RendererInput): Promise<V6RenderProof> {
    this.validateImportedAsset(input);
    const target = this.createProofTarget();
    let transmissionBackdropCapture: V7TransmissionBackdropCaptureProof | undefined;
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
          label: "g3d-webgpu-renderer-owned-scene-color-transmission-backdrop"
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

  getFeatures(diagnostics = this.getDiagnostics(), input?: V6RendererInput, pixels?: V6PixelMetrics): readonly V6RendererFeature[] {
    const capabilities = new Set(this.renderer.device.info.capabilities ?? []);
    const feature = (id: string, state: V6RendererFeature["state"], detail: string): V6RendererFeature => ({ id, state, detail });
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
          ? "Renderer-owned first-pass WebGPU scene-color readback is rebound as u_transmissionBackdropTexture for the final G3D transmission pass."
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

  private validateImportedAsset(input: V6RendererInput): void {
    if (input.metadata.primitiveCount <= 0 || input.metadata.meshCount <= 0) {
      throw new Error("V7 WebGPU imported-asset render proof requires real glTF mesh primitives.");
    }
    if (input.metadata.materialCount <= 0) {
      throw new Error("V7 WebGPU imported-asset render proof requires real material data.");
    }
  }

  private createProofTarget(): RenderTarget {
    return this.renderer.device.createRenderTarget({
      width: this.width,
      height: this.height,
      label: "g3d-v6-webgpu-production-proof",
      format: "rgba8",
      depth: true
    });
  }

  private createProof(
    input: V6RendererInput,
    diagnostics: RenderDeviceDiagnostics,
    features: readonly V6RendererFeature[],
    pixels: V6PixelMetrics,
    transmissionBackdropCapture?: V7TransmissionBackdropCaptureProof
  ): V6RenderProof {
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

export interface V6WebGPUReport {
  readonly schema: "g3d-v6-webgpu-report/v1";
  readonly status: V6WebGPUStatus;
  readonly adapterName: string | null;
  readonly preferredFormat: string | null;
  readonly canCreateDevice: boolean;
  readonly realHardwareRequiredForParity: true;
  readonly doesNotBlockWebGL2Production: true;
  readonly warnings: readonly string[];
}

export interface V7WebGPUReadinessItem {
  readonly id: string;
  readonly status: "ready" | "missing" | "blocked";
  readonly evidence: string;
}

export interface V7WebGPUReadinessReport {
  readonly schema: "g3d-v7-webgpu-readiness/v1";
  readonly availability: V6WebGPUReport;
  readonly productionBackend: "webgpu-production-sdk-path";
  readonly primaryRendererClaim: true;
  readonly safetyChecks: readonly V7WebGPUReadinessItem[];
  readonly requiredForCompletion: readonly V7WebGPUReadinessItem[];
  readonly blockers: readonly string[];
}

export interface V6WebGPULike {
  requestAdapter(): Promise<V6WebGPUAdapterLike | null>;
  getPreferredCanvasFormat?(): string;
}

export interface V6WebGPUAdapterLike {
  readonly name?: string;
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
  requestDevice(): Promise<unknown>;
}

export async function createV6WebGPUReport(gpu: V6WebGPULike | undefined | null): Promise<V6WebGPUReport> {
  if (!gpu) {
    return unavailable("navigator.gpu is not exposed in this browser/runtime.");
  }
  let adapter: V6WebGPUAdapterLike | null = null;
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
    schema: "g3d-v6-webgpu-report/v1",
    status: "available",
    adapterName: adapter.name ?? adapter.info?.description ?? adapter.info?.device ?? "unknown-adapter",
    preferredFormat: gpu.getPreferredCanvasFormat?.() ?? null,
    canCreateDevice: true,
    realHardwareRequiredForParity: true,
    doesNotBlockWebGL2Production: true,
    warnings: ["WebGPU availability is reported separately; it is not Three.js/WebGPU parity until visual parity gates pass on real hardware."]
  };
}

export async function createV7WebGPUReadinessReport(gpu: V6WebGPULike | undefined | null): Promise<V7WebGPUReadinessReport> {
  const availability = await createV6WebGPUReport(gpu);
  const requiredForCompletion: readonly V7WebGPUReadinessItem[] = [
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
      evidence: "tests/reports/v7/webgpu-imported-asset/webgpu-imported-asset-report.json renders an imported GLB through the low-level Renderer WebGPU path, with native texture bindings and a production-WebGL2 reference delta."
    },
    {
      id: "gltf-hdr-pbr-webgpu-product-viewer",
      status: "ready",
      evidence: "tests/reports/v7/webgpu-product-viewer/webgpu-product-viewer-report.json renders a flagship chronograph GLTF/HDR/PBR product-viewer scene through native WebGPU using public V6 SDK scene-composition helpers, native texture-to-buffer readback, PBR submissions, texture bindings, environment bindings, and a bounded WebGPU-vs-WebGL2 visual delta."
    },
    {
      id: "webgpu-threejs-visual-delta",
      status: "ready",
      evidence: "tests/reports/v7/webgpu-threejs-delta/webgpu-threejs-delta-report.json captures same-asset native WebGPU and Three.js product-viewer evidence with the same chronograph GLB, HDR environment, camera intent, Three.js PMREM reference, PNG artifacts, and bounded visual delta."
    },
    {
      id: "webgpu-sdk-production-backend",
      status: "ready",
      evidence: "RendererV6 and G3DRenderer now accept backend='webgpu' and expose an async imported GLTF/HDR/PBR production render path backed by native render-pipeline submission, sampled textures, and texture-to-buffer readback."
    }
  ];
  const safetyChecks: readonly V7WebGPUReadinessItem[] = [
    {
      id: "renderer-v6-webgpu-uses-production-webgpu-path",
      status: "ready",
      evidence: "RendererV6.create({ backend: 'webgpu' }) constructs ProductionWebGPURenderer and does not silently construct WebGL2."
    },
    {
      id: "sdk-webgpu-exposes-async-production-render",
      status: "ready",
      evidence: "G3DRenderer.create({ backend: 'webgpu' }) exposes renderAsync() for native WebGPU readback; sync render remains WebGL2-oriented."
    }
  ];
  return {
    schema: "g3d-v7-webgpu-readiness/v1",
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

function unavailable(reason: string): V6WebGPUReport {
  return {
    schema: "g3d-v6-webgpu-report/v1",
    status: "unavailable",
    adapterName: null,
    preferredFormat: null,
    canCreateDevice: false,
    realHardwareRequiredForParity: true,
    doesNotBlockWebGL2Production: true,
    warnings: [reason, "WebGL2 remains the V6 production renderer baseline for this release gate."]
  };
}

function blocked(reason: string): V6WebGPUReport {
  return {
    schema: "g3d-v6-webgpu-report/v1",
    status: "blocked",
    adapterName: null,
    preferredFormat: null,
    canCreateDevice: false,
    realHardwareRequiredForParity: true,
    doesNotBlockWebGL2Production: true,
    warnings: [reason, "Do not claim WebGPU parity from this run."]
  };
}

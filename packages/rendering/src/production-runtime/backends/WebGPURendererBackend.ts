import { Renderer, type RendererOptions } from "../../Renderer";
import type { CameraLike, RenderSource } from "../../Renderer";
import type { RenderDeviceDiagnostics } from "../../RenderDevice";
import type { ProductionRenderProof, ProductionRendererFeature, ProductionRendererInput } from "../ProductionRendererTypes";
import { analyzePixels, rendererFeatureReport, rendererInteractiveFeatureReport, validateProductionRendererInput } from "../renderProofs";
import type { RendererBackend, RendererBackendDiagnostics } from "./RendererBackend";

/**
 * Native production renderer with the same scene, material, light and shadow
 * inputs used by the WebGL renderer. Rendering is submitted to the selected
 * WebGPU device; async readback is available through that device.
 */
export class WebGPURendererBackend implements RendererBackend {
  readonly backend = "webgpu" as const;
  readonly contextType = "webgpu";
  private disposed = false;
  private disposalInProgress = false;

  private constructor(readonly renderer: Renderer, private width: number, private height: number) {}

  static async create(options: Omit<RendererOptions, "backend">): Promise<WebGPURendererBackend> {
    const renderer = await Renderer.create({ ...options, backend: "webgpu", requireNativeRendering: true } as RendererOptions);
    const capabilities = new Set<string>(renderer.device.info.capabilities ?? []);
    const required = ["native-render-pipeline", ...(options.canvas ? ["canvas-surface"] : [])];
    const missing = required.filter((feature) => !capabilities.has(feature));
    if (renderer.device.kind !== "webgpu" || missing.length) {
      renderer.dispose();
      throw new Error(`WEBGPU_RENDERING_UNAVAILABLE: ${missing.join(", ") || "native WebGPU device required"}`);
    }
    return new WebGPURendererBackend(renderer, options.width ?? options.canvas?.width ?? 1, options.height ?? options.canvas?.height ?? 1);
  }

  render(source: RenderSource, camera?: CameraLike): RenderDeviceDiagnostics {
    this.assertAlive();
    return this.renderer.render(source, camera);
  }

  renderAsync(source: RenderSource, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    this.assertAlive();
    return this.renderer.renderAsync(source, camera);
  }

  renderFrame(input: ProductionRendererInput): RenderDeviceDiagnostics {
    return this.render(input.source, input.camera);
  }

  async renderFrameAsync(input: ProductionRendererInput): Promise<RenderDeviceDiagnostics> {
    return this.renderAsync(input.source, input.camera);
  }

  /** Native WebGPU has no synchronous texture readback. */
  renderImportedAsset(_input: ProductionRendererInput): ProductionRenderProof {
    this.assertAlive();
    throw new Error("WEBGPU_SYNC_READBACK_UNSUPPORTED: use renderImportedAssetAsync for native GPU pixels");
  }

  async renderImportedAssetAsync(input: ProductionRendererInput): Promise<ProductionRenderProof> {
    this.assertAlive();
    validateProductionRendererInput(input);
    if (input.transmissionBackdropCapture) throw new Error("WEBGPU_PROOF_TRANSMISSION_UNSUPPORTED: use ProductionWebGPURenderer.renderImportedAssetAsync for transmission capture");
    const device = this.renderer.device;
    if (!device.readPixelsAsync) throw new Error("WEBGPU_READBACK_UNAVAILABLE: device cannot read textures asynchronously");
    const target = device.createRenderTarget({ width: this.width, height: this.height, format: "rgba8", depth: true, label: "aura-webgpu-proof" });
    const previous = device.getRenderTarget?.() ?? null;
    try {
      await this.renderer.renderAsync({ source: { ...input.source, renderTarget: target }, camera: input.camera });
      device.setRenderTarget(target);
      const bytes = await device.readPixelsAsync(0, 0, this.width, this.height);
      const diagnostics = this.renderer.getDiagnostics();
      const pixels = analyzePixels(bytes, this.width, this.height);
      return {
        backend: "webgpu", realWebGL2: false, mockDevice: false, canvas2dProof: false,
        importedAsset: input.metadata, diagnostics, pixels,
        features: rendererFeatureReport(this.renderer, diagnostics, input, pixels)
      };
    } finally {
      try { device.setRenderTarget(previous); } finally { target.dispose(); }
    }
  }

  getFeatures(input?: ProductionRendererInput): readonly ProductionRendererFeature[] {
    this.assertAlive();
    return input ? rendererInteractiveFeatureReport(this.renderer, this.renderer.getDiagnostics(), input) : rendererFeatureReport(this.renderer);
  }

  getDiagnostics(): RendererBackendDiagnostics {
    return { backend: this.backend, contextType: this.contextType, realDevice: !this.disposed && this.renderer.device.kind === "webgpu" };
  }

  resize(width: number, height: number): void {
    this.assertAlive();
    this.renderer.resize(width, height);
    this.width = width;
    this.height = height;
  }

  onDeviceLost(listener: () => void): () => void { return this.renderer.onDeviceLost(listener); }
  deviceLost(): boolean { return this.renderer.isDeviceLost(); }

  dispose(): void {
    if (this.disposalInProgress) return;
    this.disposed = true;
    this.disposalInProgress = true;
    try {
      // The renderer retains its own failed and late in-flight cleanup, so a
      // disposed device (even with no pending device work) is not a renderer
      // completion receipt. It handles the device pending protocol and shared
      // owner checks when retrying; do not repeat those decisions here.
      this.renderer.dispose();
    } finally {
      this.disposalInProgress = false;
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("WEBGPU_BACKEND_DISPOSED: backend has been disposed");
  }
}

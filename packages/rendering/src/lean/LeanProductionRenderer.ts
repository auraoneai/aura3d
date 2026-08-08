import { ForwardPass, type RenderItem } from "../ForwardPass.js";
import type { RenderDeviceDiagnostics } from "../RenderDevice.js";
import { createLeanCoreShaderLibrary } from "../ShaderLibraryCore.js";
import { WebGL2Device } from "../WebGL2Device.js";
import type {
  ProductionRendererFeature,
  ProductionRendererInput,
  RuntimeParityFrameRenderResult
} from "../production-runtime/ProductionRendererTypes.js";

export interface LeanProductionRendererOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
  readonly clearColor?: readonly [number, number, number, number];
  readonly antialias?: boolean;
  readonly preserveDrawingBuffer?: boolean;
}

/**
 * WebGL2 renderer for the documented lean primitive entry.
 *
 * The broad Renderer remains the compatibility owner for shadows, postprocess, environment maps,
 * advanced material families, WebGPU selection, capture/readback, and scene traversal. The lean
 * scene builder cannot author any of those features, so routing it through that owner made a cube
 * statically download code it could never call. This adapter owns only a device, the core shader
 * profile, and one forward pass; product/model callers inject the broad production renderer.
 */
export class LeanProductionRenderer {
  readonly backend = "webgl2" as const;
  private readonly device: WebGL2Device;
  private readonly shaderLibrary = createLeanCoreShaderLibrary();
  private width: number;
  private height: number;
  private readonly clearColor: readonly [number, number, number, number];

  private constructor(options: LeanProductionRendererOptions) {
    this.width = options.width;
    this.height = options.height;
    this.clearColor = options.clearColor ?? [0, 0, 0, 1];
    this.device = WebGL2Device.create({
      canvas: options.canvas,
      antialias: options.antialias,
      preserveDrawingBuffer: options.preserveDrawingBuffer
    });
  }

  static async create(options: LeanProductionRendererOptions): Promise<LeanProductionRenderer> {
    return new LeanProductionRenderer(options);
  }

  renderInteractiveFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    const items: readonly RenderItem[] = [...(input.source.collectRenderItems?.() ?? [])];
    this.device.beginFrame(this.width, this.height);
    try {
      this.device.setRenderTarget(null);
      this.device.clear(this.clearColor);
      new ForwardPass({
        items,
        cameraViewProjectionMatrix: input.camera?.viewProjectionMatrix ?? IDENTITY_MATRIX,
        shaderLibrary: this.shaderLibrary
      }).execute({ device: this.device, width: this.width, height: this.height });
    } finally {
      this.device.endFrame();
    }
    return {
      backend: this.backend,
      diagnostics: this.device.getDiagnostics(),
      features: this.getFeatures()
    };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  getFeatures(): readonly ProductionRendererFeature[] {
    return [
      { id: "real-webgl2-context", state: "supported", detail: "Lean renderer owns a real WebGL2Device." },
      { id: "no-canvas2d-proof", state: "supported", detail: "Frames are submitted through ForwardPass/WebGL2." },
      { id: "no-mock-device", state: "supported", detail: "The lean renderer has no mock backend branch." },
      { id: "pbr-materials", state: "supported", detail: "The lean shader profile contains PBR and unlit programs." }
    ];
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.device.getDiagnostics();
  }

  onDeviceLost(listener: () => void): () => void {
    return this.device.onDeviceLost(listener);
  }

  onDeviceRestored(listener: () => void): () => void {
    return this.device.onDeviceRestored(listener);
  }

  deviceLost(): boolean {
    return this.device.isDeviceLost();
  }

  dispose(): void {
    this.device.dispose();
  }
}

const IDENTITY_MATRIX = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

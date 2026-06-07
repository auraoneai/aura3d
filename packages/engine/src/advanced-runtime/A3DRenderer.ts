import { Scene } from "@aura3d/scene";
import {
  Renderer,
  type CameraLike,
  type ProductionRendererFeature,
  type ProductionRendererInput,
  type RuntimeParityFrameRenderResult,
  type RenderDevice,
  type RenderDeviceDiagnostics,
  type RendererAnimationLoop,
  type RendererFrameCaptureWithMetadata,
  type RendererInput,
  type RendererOptions,
  type RenderItem,
  type RenderSource,
  type ResizeToDisplayOptions,
  type ResizeToDisplayResult
} from "@aura3d/rendering";
import { A3DScene } from "./A3DScene.js";

export type A3DRendererOptions = RendererOptions;

export interface A3DRendererEvidenceOptions {
  readonly assetFailures?: readonly string[];
}

export interface A3DRendererEvidence {
  readonly backend: RenderDevice["kind"];
  readonly drawCalls: number;
  readonly frameTimeMs: number;
  readonly renderSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly assetFailures: readonly string[];
  readonly contextLost: boolean;
  readonly disposed: boolean;
  readonly lastError: string | null;
}

export class A3DRenderer {
  private lastDiagnostics: RenderDeviceDiagnostics | null = null;
  private lastFrameTimeMs = 0;
  private renderSize: { width: number; height: number };
  private disposed = false;

  private constructor(readonly renderer: Renderer, initialSize: { width: number; height: number }) {
    this.renderSize = initialSize;
  }

  static async create(options: A3DRendererOptions = {}): Promise<A3DRenderer> {
    return new A3DRenderer(await Renderer.create(options), initialRenderSize(options));
  }

  get device() {
    return this.renderer.device;
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
    this.renderSize = { width, height };
  }

  resizeToDisplay(options: ResizeToDisplayOptions = {}): ResizeToDisplayResult {
    const result = this.renderer.resizeToDisplay(options);
    this.renderSize = { width: result.width, height: result.height };
    return result;
  }

  startAnimationLoop(callback: (timeMs: number, renderer: A3DRenderer) => void): RendererAnimationLoop {
    return this.renderer.startAnimationLoop((timeMs) => callback(timeMs, this));
  }

  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: RendererInput | A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    const start = nowMs();
    let diagnostics: RenderDeviceDiagnostics;
    if (isRendererInput(sourceOrInput)) {
      diagnostics = this.renderer.render({
        ...sourceOrInput,
        source: normalizeSource(sourceOrInput.source)
      });
    } else {
      diagnostics = this.renderer.render(normalizeSource(sourceOrInput), camera);
    }
    this.recordFrame(diagnostics, nowMs() - start);
    return diagnostics;
  }

  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  async renderAsync(sourceOrInput: RendererInput | A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    const start = nowMs();
    let diagnostics: RenderDeviceDiagnostics;
    if (isRendererInput(sourceOrInput)) {
      diagnostics = await this.renderer.renderAsync({
        ...sourceOrInput,
        source: normalizeSource(sourceOrInput.source)
      });
    } else {
      diagnostics = await this.renderer.renderAsync(normalizeSource(sourceOrInput), camera);
    }
    this.recordFrame(diagnostics, nowMs() - start);
    return diagnostics;
  }

  renderFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    const diagnostics = this.render({ source: input.source, camera: input.camera });
    return {
      backend: this.device.kind === "webgpu" ? "webgpu" : "webgl2",
      diagnostics,
      features: createPublicFrameFeatures(diagnostics, input)
    };
  }

  captureFrame(source?: A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RendererFrameCaptureWithMetadata {
    const start = nowMs();
    const frame = this.renderer.captureFrame(source ? normalizeSource(source) : undefined, camera);
    this.renderSize = { width: frame.width, height: frame.height };
    this.recordFrame(frame.diagnostics, nowMs() - start);
    return frame;
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  evidence(options: A3DRendererEvidenceOptions = {}): A3DRendererEvidence {
    const diagnostics = this.disposed
      ? this.lastDiagnostics ?? this.renderer.getDiagnostics()
      : this.renderer.getDiagnostics();
    return {
      backend: this.device.kind,
      drawCalls: diagnostics.drawCalls,
      frameTimeMs: this.lastFrameTimeMs,
      renderSize: { ...this.renderSize },
      assetFailures: [...(options.assetFailures ?? [])],
      contextLost: diagnostics.contextLost || this.device.contextLost,
      disposed: this.disposed || this.device.disposed,
      lastError: diagnostics.lastError
    };
  }

  dispose(): void {
    this.lastDiagnostics = this.renderer.getDiagnostics();
    this.renderer.dispose();
    this.disposed = true;
  }

  private recordFrame(diagnostics: RenderDeviceDiagnostics, frameTimeMs: number): void {
    this.lastDiagnostics = diagnostics;
    this.lastFrameTimeMs = roundFrameTime(frameTimeMs);
  }
}

function normalizeSource(source: A3DScene | RenderSource | Iterable<RenderItem> | Scene): RenderSource | Iterable<RenderItem> | Scene {
  return source instanceof A3DScene ? source.toRenderSource() : source;
}

function isRendererInput(value: RendererInput | A3DScene | RenderSource | Iterable<RenderItem> | Scene): value is RendererInput {
  return typeof value === "object" && value !== null && "source" in value;
}

function initialRenderSize(options: A3DRendererOptions): { width: number; height: number } {
  return {
    width: options.width ?? canvasDimension(options.canvas, "width"),
    height: options.height ?? canvasDimension(options.canvas, "height")
  };
}

function canvasDimension(canvas: A3DRendererOptions["canvas"], axis: "width" | "height"): number {
  const value = canvas?.[axis];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundFrameTime(value: number): number {
  return Number(value.toFixed(3));
}

function createPublicFrameFeatures(
  diagnostics: RenderDeviceDiagnostics,
  input: ProductionRendererInput
): readonly ProductionRendererFeature[] {
  return [
    {
      id: "public-a3d-renderer-frame",
      state: "supported",
      detail: "Frame rendered through @aura3d/engine/advanced-runtime A3DRenderer."
    },
    {
      id: "render-source",
      state: input.metadata.primitiveCount > 0 ? "supported" : "partial",
      detail: `${input.metadata.assetId}: ${input.metadata.primitiveCount} primitives`
    },
    {
      id: "draw-call-diagnostics",
      state: diagnostics.drawCalls > 0 ? "supported" : "partial",
      detail: `${diagnostics.drawCalls} draw calls`
    }
  ];
}

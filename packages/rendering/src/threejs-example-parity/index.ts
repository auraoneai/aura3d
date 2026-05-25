import { RendererV6, resolveRendererV6Backend, type RendererV6BackendPreference, type RendererV6BackendSelection } from "../production-runtime/RendererV6";
import type { V6RendererInput, V7FrameRenderResult } from "../production-runtime/ProductionRendererTypes";
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import type { RendererPostProcessOptions } from "../Renderer";

export interface V8InteractiveRendererOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
  readonly backend?: RendererV6BackendPreference;
  readonly preserveDrawingBuffer?: boolean;
  readonly errorCheckMode?: "strict" | "frame";
  readonly clearColor?: readonly [number, number, number, number];
}

export interface V8RuntimeMetrics {
  readonly frameCount: number;
  readonly lastFrameMs: number;
  readonly averageFrameMs: number;
  readonly lastRenderMs: number;
  readonly averageRenderMs: number;
  readonly drawCalls: number;
  readonly textures: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly backend: "webgl2" | "webgpu";
  readonly stateCacheIssued?: number;
  readonly stateCacheSkipped?: number;
  readonly stateCacheProgramSwitches?: number;
  readonly stateCacheTextureBinds?: number;
  readonly stateCacheBufferBinds?: number;
  readonly stateCacheVertexArrayBinds?: number;
  readonly stateCacheSamplerBinds?: number;
}

export interface V8Screenshot {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export class V8InteractiveRenderer {
  readonly backend: "webgl2" | "webgpu";
  readonly backendSelection: RendererV6BackendSelection;

  private readonly metrics = createV8RuntimeMetrics();

  private constructor(
    private readonly renderer: RendererV6,
    readonly canvas: HTMLCanvasElement | OffscreenCanvas
  ) {
    this.backend = renderer.backend;
    this.backendSelection = renderer.backendSelection;
  }

  static async create(options: V8InteractiveRendererOptions): Promise<V8InteractiveRenderer> {
    const selection = resolveRendererV6Backend(options);
    const renderer = await RendererV6.create({
      ...options,
      backend: selection.requestedBackend
    });
    return new V8InteractiveRenderer(renderer, options.canvas);
  }

  async renderFrame(input: V6RendererInput): Promise<V7FrameRenderResult> {
    const started = now();
    const result = await this.renderer.renderInteractiveFrameAsync(input);
    this.metrics.record({
      frameMs: now() - started,
      renderMs: result.timing?.renderMs ?? 0,
      diagnostics: result.diagnostics,
      backend: result.backend
    });
    return result;
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  getMetrics(): V8RuntimeMetrics {
    return this.metrics.snapshot(this.backend);
  }

  screenshot(): V8Screenshot {
    return captureV8CanvasScreenshot(this.canvas);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function createV8InteractiveRenderer(options: V8InteractiveRendererOptions): Promise<V8InteractiveRenderer> {
  return V8InteractiveRenderer.create(options);
}

export function createV8Postprocess(exposure: number): RendererPostProcessOptions {
  return {
    targetFormat: "rgba16f",
    toneMapping: {
      operator: "filmic",
      exposure: clamp(exposure, 0.1, 4),
      whitePoint: 1.25,
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    },
    colorGrade: {
      contrast: 1.08,
      saturation: 1.05,
      vibrance: 0.1,
      vignette: 0.12,
      sharpening: 0.22
    },
    bloom: {
      threshold: 0.92,
      intensity: 0.08,
      radius: 1
    },
    fxaa: {
      edgeThreshold: 0.08,
      subpixelBlend: 0.55
    }
  };
}

export function captureV8CanvasScreenshot(canvas: HTMLCanvasElement | OffscreenCanvas): V8Screenshot {
  if (!("toDataURL" in canvas) || typeof canvas.toDataURL !== "function") {
    throw new Error("V8 screenshot capture requires an HTMLCanvasElement with preserveDrawingBuffer enabled.");
  }
  return {
    mimeType: "image/png",
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height
  };
}

interface V8MetricsRecorder {
  record(sample: {
    readonly frameMs: number;
    readonly renderMs: number;
    readonly diagnostics: RenderDeviceDiagnostics;
    readonly backend: "webgl2" | "webgpu";
  }): void;
  snapshot(backend: "webgl2" | "webgpu"): V8RuntimeMetrics;
}

function createV8RuntimeMetrics(): V8MetricsRecorder {
  let frameCount = 0;
  let lastFrameMs = 0;
  let averageFrameMs = 0;
  let lastRenderMs = 0;
  let averageRenderMs = 0;
  let diagnostics: RenderDeviceDiagnostics = { drawCalls: 0, buffers: 0, shaders: 0, lastError: null, contextLost: false };

  return {
    record(sample) {
      frameCount += 1;
      lastFrameMs = sample.frameMs;
      lastRenderMs = sample.renderMs;
      averageFrameMs += (sample.frameMs - averageFrameMs) / frameCount;
      averageRenderMs += (sample.renderMs - averageRenderMs) / frameCount;
      diagnostics = sample.diagnostics;
    },
    snapshot(backend) {
      return {
        frameCount,
        lastFrameMs: round(lastFrameMs),
        averageFrameMs: round(averageFrameMs),
        lastRenderMs: round(lastRenderMs),
        averageRenderMs: round(averageRenderMs),
        drawCalls: diagnostics.drawCalls,
        textures: diagnostics.textures ?? 0,
        buffers: diagnostics.buffers,
        shaders: diagnostics.shaders,
        backend,
        ...(diagnostics.stateCacheIssued !== undefined ? { stateCacheIssued: diagnostics.stateCacheIssued } : {}),
        ...(diagnostics.stateCacheSkipped !== undefined ? { stateCacheSkipped: diagnostics.stateCacheSkipped } : {}),
        ...(diagnostics.stateCacheProgramSwitches !== undefined ? { stateCacheProgramSwitches: diagnostics.stateCacheProgramSwitches } : {}),
        ...(diagnostics.stateCacheTextureBinds !== undefined ? { stateCacheTextureBinds: diagnostics.stateCacheTextureBinds } : {}),
        ...(diagnostics.stateCacheBufferBinds !== undefined ? { stateCacheBufferBinds: diagnostics.stateCacheBufferBinds } : {}),
        ...(diagnostics.stateCacheVertexArrayBinds !== undefined ? { stateCacheVertexArrayBinds: diagnostics.stateCacheVertexArrayBinds } : {}),
        ...(diagnostics.stateCacheSamplerBinds !== undefined ? { stateCacheSamplerBinds: diagnostics.stateCacheSamplerBinds } : {})
      };
    }
  };
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import { Scene } from "@aura3d/scene";
import {
  Renderer,
  type CameraLike,
  type V6RendererFeature,
  type V6RendererInput,
  type V7FrameRenderResult,
  type RenderDeviceDiagnostics,
  type RendererAnimationLoop,
  type RendererFrameCapture,
  type RendererInput,
  type RendererOptions,
  type RenderItem,
  type RenderSource,
  type ResizeToDisplayOptions,
  type ResizeToDisplayResult
} from "@aura3d/rendering";
import { A3DScene } from "./A3DScene.js";

export type A3DRendererOptions = RendererOptions;

export class A3DRenderer {
  private constructor(readonly renderer: Renderer) {}

  static async create(options: A3DRendererOptions = {}): Promise<A3DRenderer> {
    return new A3DRenderer(await Renderer.create(options));
  }

  get device() {
    return this.renderer.device;
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  resizeToDisplay(options: ResizeToDisplayOptions = {}): ResizeToDisplayResult {
    return this.renderer.resizeToDisplay(options);
  }

  startAnimationLoop(callback: (timeMs: number, renderer: A3DRenderer) => void): RendererAnimationLoop {
    return this.renderer.startAnimationLoop((timeMs) => callback(timeMs, this));
  }

  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: RendererInput | A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    if (isRendererInput(sourceOrInput)) {
      return this.renderer.render({
        ...sourceOrInput,
        source: normalizeSource(sourceOrInput.source)
      });
    }
    return this.renderer.render(normalizeSource(sourceOrInput), camera);
  }

  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  renderAsync(sourceOrInput: RendererInput | A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    if (isRendererInput(sourceOrInput)) {
      return this.renderer.renderAsync({
        ...sourceOrInput,
        source: normalizeSource(sourceOrInput.source)
      });
    }
    return this.renderer.renderAsync(normalizeSource(sourceOrInput), camera);
  }

  renderFrame(input: V6RendererInput): V7FrameRenderResult {
    const diagnostics = this.render({ source: input.source, camera: input.camera });
    return {
      backend: this.device.kind === "webgpu" ? "webgpu" : "webgl2",
      diagnostics,
      features: createPublicFrameFeatures(diagnostics, input)
    };
  }

  captureFrame(source?: A3DScene | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RendererFrameCapture {
    return this.renderer.captureFrame(source ? normalizeSource(source) : undefined, camera);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

function normalizeSource(source: A3DScene | RenderSource | Iterable<RenderItem> | Scene): RenderSource | Iterable<RenderItem> | Scene {
  return source instanceof A3DScene ? source.toRenderSource() : source;
}

function isRendererInput(value: RendererInput | A3DScene | RenderSource | Iterable<RenderItem> | Scene): value is RendererInput {
  return typeof value === "object" && value !== null && "source" in value;
}

function createPublicFrameFeatures(
  diagnostics: RenderDeviceDiagnostics,
  input: V6RendererInput
): readonly V6RendererFeature[] {
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

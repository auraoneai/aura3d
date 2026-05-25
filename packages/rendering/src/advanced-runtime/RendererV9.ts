import {
  Renderer,
  type CameraLike,
  type RendererAnimationLoop,
  type RendererFrameCapture,
  type RendererInput,
  type RendererOptions,
  type RenderSource,
  type ResizeToDisplayOptions,
  type ResizeToDisplayResult
} from "../Renderer";
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import type { RenderItem } from "../ForwardPass";
import type { Scene } from "@galileo3d/scene";

export type RendererV9Options = RendererOptions;
export type RendererV9Source = RendererInput | RenderSource | Iterable<RenderItem> | Scene;

export class RendererV9 {
  private constructor(readonly renderer: Renderer) {}

  static async create(options: RendererV9Options = {}): Promise<RendererV9> {
    return new RendererV9(await Renderer.create(options));
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

  startAnimationLoop(callback: (timeMs: number, renderer: RendererV9) => void): RendererAnimationLoop {
    return this.renderer.startAnimationLoop((timeMs) => callback(timeMs, this));
  }

  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: RendererV9Source, camera?: CameraLike): RenderDeviceDiagnostics {
    return isRendererInput(sourceOrInput)
      ? this.renderer.render(sourceOrInput)
      : this.renderer.render(sourceOrInput, camera);
  }

  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  renderAsync(sourceOrInput: RendererV9Source, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    return isRendererInput(sourceOrInput)
      ? this.renderer.renderAsync(sourceOrInput)
      : this.renderer.renderAsync(sourceOrInput, camera);
  }

  captureFrame(source?: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RendererFrameCapture {
    return this.renderer.captureFrame(source, camera);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

function isRendererInput(value: RendererV9Source): value is RendererInput {
  return typeof value === "object" && value !== null && "source" in value;
}

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
import type { Scene } from "@aura3d/scene";

export type AdvancedRendererOptions = RendererOptions;
export type AdvancedRendererSource = RendererInput | RenderSource | Iterable<RenderItem> | Scene;

export class AdvancedRenderer {
  private constructor(readonly renderer: Renderer) {}

  static async create(options: AdvancedRendererOptions = {}): Promise<AdvancedRenderer> {
    return new AdvancedRenderer(await Renderer.create(options));
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

  startAnimationLoop(callback: (timeMs: number, renderer: AdvancedRenderer) => void): RendererAnimationLoop {
    return this.renderer.startAnimationLoop((timeMs) => callback(timeMs, this));
  }

  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: AdvancedRendererSource, camera?: CameraLike): RenderDeviceDiagnostics {
    return isRendererInput(sourceOrInput)
      ? this.renderer.render(sourceOrInput)
      : this.renderer.render(sourceOrInput, camera);
  }

  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  renderAsync(sourceOrInput: AdvancedRendererSource, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
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

function isRendererInput(value: AdvancedRendererSource): value is RendererInput {
  return typeof value === "object" && value !== null && "source" in value;
}

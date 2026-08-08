/**
 * Interactive-only WebGL2 renderer for the lean product entry.
 *
 * The product entry cannot call compatibility screenshot/readback or multi-backend proof APIs, so
 * keep those families outside its critical path while retaining the full shader profile required
 * by imported glTF materials.
 */
import { Renderer, type CameraLike, type RendererOptions, type RenderSource } from "../Renderer.js";
import { createDefaultShaderLibrary } from "../ShaderLibrary.js";

export interface LeanProductRendererOptions extends Omit<RendererOptions, "backend"> {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
}

export class LeanProductRenderer {
  private constructor(private readonly renderer: Renderer) {}

  static async create(options: LeanProductRendererOptions): Promise<LeanProductRenderer> {
    const renderer = await Renderer.create({
      ...options,
      backend: "webgl2",
      requiredFeatures: ["basic-rendering", "render-targets", "hdr-image-based-lighting"],
      shaderLibrary: options.shaderLibrary ?? createDefaultShaderLibrary()
    });
    if (renderer.device.kind !== "webgl2") {
      renderer.dispose();
      throw new Error(`Lean product renderer requires a real WebGL2 device, got ${renderer.device.kind}.`);
    }
    return new LeanProductRenderer(renderer);
  }

  renderInteractiveFrame(input: { readonly source: RenderSource; readonly camera?: CameraLike }): { readonly diagnostics: { readonly drawCalls: number } } {
    return { diagnostics: this.renderer.render(input.source, input.camera) };
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

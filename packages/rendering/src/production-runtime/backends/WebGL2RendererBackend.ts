import { ProductionWebGL2Renderer, type ProductionWebGL2RendererOptions } from '../ProductionWebGL2Renderer';
import type { ProductionRenderProof, ProductionRendererFeature, ProductionRendererInput } from "../ProductionRendererTypes";
import type { RendererBackend, RendererBackendDiagnostics } from './RendererBackend';

export class WebGL2RendererBackend implements RendererBackend {
  readonly backend = "webgl2" as const;
  readonly contextType = 'webgl2';

  private constructor(private readonly renderer: ProductionWebGL2Renderer) {}

  static async create(options: ProductionWebGL2RendererOptions): Promise<WebGL2RendererBackend> {
    return new WebGL2RendererBackend(await ProductionWebGL2Renderer.create(options));
  }

  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof {
    return this.renderer.renderImportedAsset(input);
  }

  getFeatures(): readonly ProductionRendererFeature[] {
    return this.renderer.getFeatures();
  }

  getDiagnostics(): RendererBackendDiagnostics {
    return { backend: "webgl2", contextType: this.contextType, realDevice: true };
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

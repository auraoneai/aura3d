// T2.6 (prd15): wrapper class deleted — `ProductionWebGL2Renderer` aliased to the
// C-29 `Renderer`; imported-asset proofs/features go through the moved
// `rendererProofCapture`/`rendererFeatureReport` free functions.
import { Renderer } from "../../Renderer";
import { rendererProofCapture, rendererFeatureReport } from "../renderProofs";
import type { ProductionWebGL2RendererOptions } from "../backendSelection";
import type { ProductionRenderProof, ProductionRendererFeature, ProductionRendererInput } from "../ProductionRendererTypes";
import type { RendererBackend, RendererBackendDiagnostics } from './RendererBackend';

export class WebGL2RendererBackend implements RendererBackend {
  readonly backend = "webgl2" as const;
  readonly contextType = 'webgl2';

  private constructor(private readonly renderer: Renderer) {}

  static async create(options: ProductionWebGL2RendererOptions): Promise<WebGL2RendererBackend> {
    return new WebGL2RendererBackend(await Renderer.create(options));
  }

  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof {
    return rendererProofCapture(this.renderer, input);
  }

  getFeatures(): readonly ProductionRendererFeature[] {
    return rendererFeatureReport(this.renderer);
  }

  getDiagnostics(): RendererBackendDiagnostics {
    return { backend: "webgl2", contextType: this.contextType, realDevice: true };
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

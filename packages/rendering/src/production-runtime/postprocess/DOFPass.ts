import {
  depthOfFieldPixels,
  type DepthOfFieldOptions,
  type DepthOfFieldResult
} from "../../PostProcessPass";
import {
  createProductionDepthProxy,
  createProductionPostProcessOutput,
  type ProductionPostProcessInput,
  type ProductionPostProcessOutput,
  type ProductionPostProcessPass
} from "./ProductionPostProcessTypes";

export interface DOFPassOptions extends DepthOfFieldOptions {
  readonly enabled?: boolean;
  readonly intensity?: number;
}

export class DOFPass implements ProductionPostProcessPass {
  readonly name = "production-depth-of-field";
  readonly enabled: boolean;
  private lastResult: DepthOfFieldResult | null = null;

  constructor(public readonly options: DOFPassOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  apply(input: ProductionPostProcessInput): ProductionPostProcessOutput {
    const intensity = this.enabled ? this.options.intensity ?? 1 : 0;
    const result = depthOfFieldPixels(input.pixels, input.width, input.height, {
      depth: this.options.depth ?? input.depth ?? createProductionDepthProxy(input.width, input.height),
      focusDepth: this.options.focusDepth ?? 0.44,
      focusRange: this.options.focusRange ?? 0.09,
      maxRadius: this.options.maxRadius ?? Math.max(0, Math.round(3 * intensity))
    });
    this.lastResult = result;
    return createProductionPostProcessOutput(input, this.name, result.pixels, {
      blurredPixels: result.blurredPixels,
      maxBlurRadius: result.maxBlurRadius,
      focusDepth: result.focusDepth
    }, ["DOFPass applies the renderer depth-of-field pixel kernel with supplied or generated depth evidence."]);
  }

  getLastResult(): DepthOfFieldResult | null {
    return this.lastResult ? { ...this.lastResult, pixels: new Uint8Array(this.lastResult.pixels) } : null;
  }
}

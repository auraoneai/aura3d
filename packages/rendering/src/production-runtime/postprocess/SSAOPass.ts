import {
  ssaoPixels,
  type SSAOOptions,
  type SSAOResult
} from "../../PostProcessPass";
import {
  createProductionDepthProxy,
  createProductionPostProcessOutput,
  type ProductionPostProcessInput,
  type ProductionPostProcessOutput,
  type ProductionPostProcessPass
} from "./ProductionPostProcessTypes";

export interface SSAOPassOptions extends SSAOOptions {
  readonly enabled?: boolean;
}

export class SSAOPass implements ProductionPostProcessPass {
  readonly name = "production-ssao";
  readonly enabled: boolean;
  private lastResult: SSAOResult | null = null;

  constructor(public readonly options: SSAOPassOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  apply(input: ProductionPostProcessInput): ProductionPostProcessOutput {
    const result = ssaoPixels(input.pixels, input.width, input.height, {
      depth: this.options.depth ?? input.depth ?? createProductionDepthProxy(input.width, input.height),
      radius: this.options.radius ?? 2,
      intensity: this.enabled ? this.options.intensity ?? 0.58 : 0,
      bias: this.options.bias ?? 0.01
    });
    this.lastResult = result;
    return createProductionPostProcessOutput(input, this.name, result.pixels, {
      occludedPixels: result.occludedPixels,
      averageOcclusion: result.averageOcclusion,
      radius: result.radius
    }, ["SSAOPass applies the renderer SSAO pixel kernel with supplied or generated depth evidence."]);
  }

  getLastResult(): SSAOResult | null {
    return this.lastResult ? { ...this.lastResult, pixels: new Uint8Array(this.lastResult.pixels) } : null;
  }
}

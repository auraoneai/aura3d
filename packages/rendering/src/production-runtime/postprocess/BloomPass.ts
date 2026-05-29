import {
  bloomPixels,
  type BloomOptions,
  type BloomResult
} from "../../PostProcessPass";
import {
  createProductionPostProcessOutput,
  type ProductionPostProcessInput,
  type ProductionPostProcessOutput,
  type ProductionPostProcessPass
} from "./ProductionPostProcessTypes";

export interface BloomPassOptions extends BloomOptions {
  readonly enabled?: boolean;
}

export class BloomPass implements ProductionPostProcessPass {
  readonly name = "production-bloom";
  readonly enabled: boolean;
  private lastResult: BloomResult | null = null;

  constructor(public readonly options: BloomPassOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  apply(input: ProductionPostProcessInput): ProductionPostProcessOutput {
    const result = bloomPixels(input.pixels, input.width, input.height, {
      threshold: this.options.threshold ?? 0.62,
      intensity: this.enabled ? this.options.intensity ?? 0.36 : 0,
      radius: this.options.radius ?? 2
    });
    this.lastResult = result;
    return createProductionPostProcessOutput(input, this.name, result.pixels, {
      brightPixelCount: result.brightPixelCount,
      changedPixels: result.changedPixels,
      maxNeighborBoost: result.maxNeighborBoost
    }, ["BloomPass applies the renderer bloom pixel kernel; it is not an option-only placeholder."]);
  }

  getLastResult(): BloomResult | null {
    return this.lastResult
      ? {
          ...this.lastResult,
          pixels: new Uint8Array(this.lastResult.pixels),
          brightPixels: new Uint8Array(this.lastResult.brightPixels),
          horizontalBlurPixels: new Uint8Array(this.lastResult.horizontalBlurPixels),
          verticalBlurPixels: new Uint8Array(this.lastResult.verticalBlurPixels)
        }
      : null;
  }
}

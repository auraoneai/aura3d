import {
  fxaaPixels,
  type FXAAOptions,
  type FXAAResult
} from "../../PostProcessPass";
import {
  createProductionPostProcessOutput,
  type ProductionPostProcessInput,
  type ProductionPostProcessOutput,
  type ProductionPostProcessPass
} from "./ProductionPostProcessTypes";

export interface FXAAPassOptions extends FXAAOptions {
  readonly enabled?: boolean;
  readonly intensity?: number;
}

export class FXAAPass implements ProductionPostProcessPass {
  readonly name = "production-fxaa";
  readonly enabled: boolean;
  private lastResult: FXAAResult | null = null;

  constructor(public readonly options: FXAAPassOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  apply(input: ProductionPostProcessInput): ProductionPostProcessOutput {
    const result = fxaaPixels(input.pixels, input.width, input.height, {
      edgeThreshold: this.enabled ? this.options.edgeThreshold ?? 0.08 : 1,
      subpixelBlend: this.enabled ? this.options.subpixelBlend ?? this.options.intensity ?? 0.68 : 0
    });
    this.lastResult = result;
    return createProductionPostProcessOutput(input, this.name, result.pixels, {
      edgePixels: countNonZero(result.edgeMask)
    }, ["FXAAPass applies the renderer FXAA pixel kernel; it is not an option-only placeholder."]);
  }

  getLastResult(): FXAAResult | null {
    return this.lastResult
      ? {
          ...this.lastResult,
          pixels: new Uint8Array(this.lastResult.pixels),
          edgeMask: new Uint8Array(this.lastResult.edgeMask)
        }
      : null;
  }
}

function countNonZero(values: Uint8Array): number {
  let count = 0;
  for (const value of values) if (value > 0) count += 1;
  return count;
}

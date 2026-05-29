import {
  colorGradePixels,
  type ColorGradeOptions,
  type ColorGradeResult
} from "../../PostProcessPass";
import {
  createProductionPostProcessOutput,
  type ProductionPostProcessInput,
  type ProductionPostProcessOutput,
  type ProductionPostProcessPass
} from "./ProductionPostProcessTypes";

export interface ColorGradingPassOptions extends ColorGradeOptions {
  readonly enabled?: boolean;
  readonly intensity?: number;
}

export class ColorGradingPass implements ProductionPostProcessPass {
  readonly name = "production-color-grading";
  readonly enabled: boolean;
  private lastResult: ColorGradeResult | null = null;

  constructor(public readonly options: ColorGradingPassOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  apply(input: ProductionPostProcessInput): ProductionPostProcessOutput {
    const intensity = this.enabled ? this.options.intensity ?? 1 : 0;
    const result = colorGradePixels(input.pixels, input.width, input.height, {
      contrast: this.options.contrast ?? 1 + 0.14 * intensity,
      saturation: this.options.saturation ?? 1 + 0.08 * intensity,
      vibrance: this.options.vibrance ?? 0.12 * intensity,
      vignette: this.options.vignette ?? 0.16 * intensity,
      sharpening: this.options.sharpening ?? 0.16 * intensity,
      temperature: this.options.temperature ?? 0,
      tint: this.options.tint ?? 0
    });
    this.lastResult = result;
    return createProductionPostProcessOutput(input, this.name, result.pixels, {
      changedPixels: result.changedPixels,
      vignetteDarkenedPixels: result.vignetteDarkenedPixels,
      sharpenedPixels: result.sharpenedPixels
    }, ["ColorGradingPass applies the renderer color-grade pixel kernel; it is not an option-only placeholder."]);
  }

  getLastResult(): ColorGradeResult | null {
    return this.lastResult ? { ...this.lastResult, pixels: new Uint8Array(this.lastResult.pixels), settings: { ...this.lastResult.settings } } : null;
  }
}

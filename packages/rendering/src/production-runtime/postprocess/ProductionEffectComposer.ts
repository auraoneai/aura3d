import { BloomPass } from "./BloomPass";
import { ColorGradingPass } from "./ColorGradingPass";
import { FXAAPass } from "./FXAAPass";
import {
  createProductionPostProcessInput,
  type ProductionPostProcessInput,
  type ProductionPostProcessOutput,
  type ProductionPostProcessPass
} from "./ProductionPostProcessTypes";

export interface ProductionEffectComposerOptions {
  readonly enabled?: boolean;
  readonly intensity?: number;
  readonly passes?: readonly ProductionPostProcessPass[];
}

export interface ProductionEffectComposerResult extends ProductionPostProcessInput {
  readonly passOutputs: readonly ProductionPostProcessOutput[];
  readonly totalChangedPixels: number;
  readonly diagnostics: readonly string[];
}

export class ProductionEffectComposer {
  readonly enabled: boolean;
  readonly passes: ProductionPostProcessPass[];

  constructor(public readonly options: ProductionEffectComposerOptions = {}) {
    this.enabled = options.enabled ?? true;
    const intensity = options.intensity ?? 1;
    this.passes = [...(options.passes ?? [
      new ColorGradingPass({ intensity }),
      new BloomPass({ intensity: 0.32 * intensity, threshold: 0.62, radius: 2 }),
      new FXAAPass({ subpixelBlend: 0.65 })
    ])];
  }

  addPass(pass: ProductionPostProcessPass): this {
    this.passes.push(pass);
    return this;
  }

  render(input: ProductionPostProcessInput): ProductionEffectComposerResult;
  render(pixels: Uint8Array, width: number, height: number, options?: Omit<ProductionPostProcessInput, "pixels" | "width" | "height">): ProductionEffectComposerResult;
  render(
    inputOrPixels: ProductionPostProcessInput | Uint8Array,
    width?: number,
    height?: number,
    options: Omit<ProductionPostProcessInput, "pixels" | "width" | "height"> = {}
  ): ProductionEffectComposerResult {
    const input = inputOrPixels instanceof Uint8Array
      ? createProductionPostProcessInput(inputOrPixels, requireDimension(width, "width"), requireDimension(height, "height"), options)
      : inputOrPixels;
    if (!this.enabled) {
      return { ...input, passOutputs: [], totalChangedPixels: 0, diagnostics: ["ProductionEffectComposer disabled; source pixels returned unchanged."] };
    }
    const passOutputs: ProductionPostProcessOutput[] = [];
    let current: ProductionPostProcessInput = input;
    for (const pass of this.passes) {
      if (!pass.enabled) continue;
      const output = pass.apply(current);
      passOutputs.push(output);
      current = output;
    }
    return {
      ...current,
      passOutputs,
      totalChangedPixels: passOutputs.reduce((sum, output) => sum + output.changedPixels, 0),
      diagnostics: passOutputs.flatMap((output) => output.diagnostics)
    };
  }
}

function requireDimension(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw new Error(`ProductionEffectComposer ${label} must be a positive integer when rendering raw pixels.`);
  }
  return value;
}

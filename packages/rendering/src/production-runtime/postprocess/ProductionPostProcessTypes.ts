import type {
  DepthTextureBinding,
  PostProcessColorSpace,
  ToneMappingOperator
} from "../../PostProcessPass";

export interface ProductionPostProcessInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly depth?: DepthTextureBinding;
  readonly history?: Uint8Array;
  readonly velocity?: Float32Array;
}

export interface ProductionPostProcessOutput extends ProductionPostProcessInput {
  readonly passName: string;
  readonly changedPixels: number;
  readonly metrics: Readonly<Record<string, number | string | boolean>>;
  readonly diagnostics: readonly string[];
}

export interface ProductionPostProcessPass {
  readonly name: string;
  readonly enabled: boolean;
  apply(input: ProductionPostProcessInput): ProductionPostProcessOutput;
}

export interface ProductionToneMapOptions {
  readonly exposure?: number;
  readonly whitePoint?: number;
  readonly gamma?: number;
  readonly operator?: ToneMappingOperator;
  readonly inputColorSpace?: PostProcessColorSpace;
  readonly outputColorSpace?: PostProcessColorSpace;
}

export function createProductionPostProcessInput(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: Omit<ProductionPostProcessInput, "pixels" | "width" | "height"> = {}
): ProductionPostProcessInput {
  validateProductionPixels(pixels, width, height);
  return {
    width,
    height,
    pixels: new Uint8Array(pixels),
    ...options
  };
}

export function createProductionDemoPostProcessInput(width = 64, height = 48): ProductionPostProcessInput {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let red = 18 + Math.round(x * 1.9);
      let green = 22 + Math.round(y * 2.2);
      let blue = 36 + Math.round((x + y) * 0.72);
      if (x >= width * 0.16 && x <= width * 0.36 && y >= height * 0.18 && y <= height * 0.52) {
        red = 248;
        green = 196;
        blue = 72;
      }
      if (x >= width * 0.58 && x <= width * 0.82 && y >= height * 0.24 && y <= height * 0.62) {
        red = 44;
        green = 188;
        blue = 248;
      }
      if ((Math.abs(x - width * 0.48) < 1.2 || Math.abs(y - height * 0.72) < 1.2) && x > width * 0.12 && x < width * 0.88) {
        red = 246;
        green = 246;
        blue = 240;
      }
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = 255;
    }
  }
  return {
    width,
    height,
    pixels,
    depth: createProductionDepthProxy(width, height),
    history: createProductionHistoryProxy(pixels, width, height),
    velocity: createProductionVelocityProxy(width, height)
  };
}

export function createProductionPostProcessOutput(
  input: ProductionPostProcessInput,
  passName: string,
  pixels: Uint8Array,
  metrics: Readonly<Record<string, number | string | boolean>>,
  diagnostics: readonly string[]
): ProductionPostProcessOutput {
  validateProductionPixels(pixels, input.width, input.height);
  return {
    ...input,
    pixels,
    passName,
    changedPixels: countChangedRgb(input.pixels, pixels),
    metrics,
    diagnostics
  };
}

export function createProductionDepthProxy(width: number, height: number): DepthTextureBinding {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = Math.hypot((x / Math.max(1, width - 1)) * 2 - 1, (y / Math.max(1, height - 1)) * 2 - 1);
      let depth = 0.76 - Math.max(0, 0.34 - center * 0.16);
      if (y > height * 0.68) depth = 0.56;
      if (x >= width * 0.16 && x <= width * 0.36 && y >= height * 0.18 && y <= height * 0.52) depth = 0.28;
      if (x >= width * 0.58 && x <= width * 0.82 && y >= height * 0.24 && y <= height * 0.62) depth = 0.42;
      data[y * width + x] = depth;
    }
  }
  return { label: "production-postprocess-depth-proxy", width, height, format: "depth24", data };
}

export function createProductionHistoryProxy(pixels: Uint8Array, width: number, height: number): Uint8Array {
  validateProductionPixels(pixels, width, height);
  const history = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(0, x - 2);
      const source = (y * width + sourceX) * 4;
      const target = (y * width + x) * 4;
      history[target] = Math.max(0, (pixels[source] ?? 0) - 14);
      history[target + 1] = Math.max(0, (pixels[source + 1] ?? 0) - 10);
      history[target + 2] = Math.max(0, (pixels[source + 2] ?? 0) - 8);
      history[target + 3] = pixels[source + 3] ?? 255;
    }
  }
  return history;
}

export function createProductionVelocityProxy(width: number, height: number): Float32Array {
  const velocity = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < width * 0.78 && y > height * 0.16 && y < height * 0.7) {
        const index = (y * width + x) * 2;
        velocity[index] = 1.5;
        velocity[index + 1] = x > width * 0.48 ? -0.5 : 0.25;
      }
    }
  }
  return velocity;
}

export function countChangedRgb(a: Uint8Array, b: Uint8Array): number {
  let changed = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 4) {
    const delta = Math.abs((a[index] ?? 0) - (b[index] ?? 0))
      + Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0))
      + Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0));
    if (delta > 0) changed += 1;
  }
  return changed;
}

export function validateProductionPixels(pixels: Uint8Array, width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Production postprocess dimensions must be positive integers.");
  }
  if (pixels.byteLength !== width * height * 4) {
    throw new Error("Production postprocess input must contain width * height * 4 RGBA bytes.");
  }
}

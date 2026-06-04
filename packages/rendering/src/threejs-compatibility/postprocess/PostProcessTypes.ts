import type { DepthTextureBinding } from "../../PostProcessPass";
import { countChangedRgb } from "../../production-runtime/postprocess/ProductionPostProcessTypes";

export interface ThreeCompatPostProcessFrame {
  readonly label: string;
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly bloom: number;
  readonly ambientOcclusion: number;
  readonly sharpness: number;
  readonly blur: number;
  readonly vignette: number;
  readonly outlines: number;
  readonly width?: number;
  readonly height?: number;
  readonly pixels?: Uint8Array;
  readonly depth?: DepthTextureBinding;
  readonly history?: Uint8Array;
  readonly velocity?: Float32Array;
  readonly visualChangedPixels?: number;
  readonly visualPasses?: readonly string[];
  readonly visualDiagnostics?: readonly string[];
}

export interface ThreeCompatPostProcessPass {
  readonly name: string;
  readonly enabled: boolean;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame;
}

export interface ThreeCompatBaseFrameOptions {
  readonly width?: number;
  readonly height?: number;
  readonly pixels?: Uint8Array;
  readonly depth?: DepthTextureBinding;
  readonly history?: Uint8Array;
  readonly velocity?: Float32Array;
}

export function createThreeCompatBaseFrame(label = "source", options: ThreeCompatBaseFrameOptions = {}): ThreeCompatPostProcessFrame {
  return {
    label,
    exposure: 1,
    contrast: 1,
    saturation: 1,
    bloom: 0,
    ambientOcclusion: 0,
    sharpness: 0,
    blur: 0,
    vignette: 0,
    outlines: 0,
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.height !== undefined ? { height: options.height } : {}),
    ...(options.pixels !== undefined ? { pixels: new Uint8Array(options.pixels) } : {}),
    ...(options.depth !== undefined ? { depth: options.depth } : {}),
    ...(options.history !== undefined ? { history: new Uint8Array(options.history) } : {}),
    ...(options.velocity !== undefined ? { velocity: new Float32Array(options.velocity) } : {}),
    visualChangedPixels: 0,
    visualPasses: [],
    visualDiagnostics: []
  };
}

export function createThreeCompatDemoFrame(label = "source", width = 64, height = 48): ThreeCompatPostProcessFrame {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let red = 20 + Math.round(x * 2.1);
      let green = 24 + Math.round(y * 2);
      let blue = 40 + Math.round((x + y) * 0.68);
      if (x >= width * 0.18 && x <= width * 0.36 && y >= height * 0.16 && y <= height * 0.52) {
        red = 248;
        green = 202;
        blue = 90;
      }
      if (x >= width * 0.58 && x <= width * 0.82 && y >= height * 0.22 && y <= height * 0.64) {
        red = 54;
        green = 190;
        blue = 250;
      }
      if ((Math.abs(x - width * 0.49) < 1.2 || Math.abs(y - height * 0.72) < 1.2) && x > width * 0.1 && x < width * 0.9) {
        red = 248;
        green = 248;
        blue = 242;
      }
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = 255;
    }
  }
  return createThreeCompatBaseFrame(label, {
    width,
    height,
    pixels,
    depth: createThreeCompatDepthProxy(width, height),
    history: createThreeCompatHistoryProxy(pixels, width, height),
    velocity: createThreeCompatVelocityProxy(width, height)
  });
}

export function applyThreeCompatPixelKernel(
  frame: ThreeCompatPostProcessFrame,
  passName: string,
  transform: (pixels: Uint8Array, width: number, height: number) => Uint8Array,
  diagnostic: string
): ThreeCompatPostProcessFrame {
  if (!frame.pixels || !frame.width || !frame.height) {
    return {
      ...frame,
      visualDiagnostics: [...(frame.visualDiagnostics ?? []), `${passName}: no pixel buffer supplied; metrics updated only.`]
    };
  }
  const before = frame.pixels;
  const after = transform(before, frame.width, frame.height);
  const changed = countChangedRgb(before, after);
  return {
    ...frame,
    pixels: after,
    visualChangedPixels: (frame.visualChangedPixels ?? 0) + changed,
    visualPasses: [...(frame.visualPasses ?? []), passName],
    visualDiagnostics: [...(frame.visualDiagnostics ?? []), `${passName}: ${diagnostic}; changedPixels=${changed}`]
  };
}

export function createThreeCompatDepthProxy(width: number, height: number): DepthTextureBinding {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let depth = y > height * 0.68 ? 0.58 : 0.82;
      if (x >= width * 0.18 && x <= width * 0.36 && y >= height * 0.16 && y <= height * 0.52) depth = 0.28;
      if (x >= width * 0.58 && x <= width * 0.82 && y >= height * 0.22 && y <= height * 0.64) depth = 0.42;
      data[y * width + x] = depth;
    }
  }
  return { label: "three-compat-postprocess-depth-proxy", width, height, format: "depth24", data };
}

export function createThreeCompatHistoryProxy(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const history = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(0, x - 2);
      const source = (y * width + sourceX) * 4;
      const target = (y * width + x) * 4;
      history[target] = Math.max(0, (pixels[source] ?? 0) - 12);
      history[target + 1] = Math.max(0, (pixels[source + 1] ?? 0) - 10);
      history[target + 2] = Math.max(0, (pixels[source + 2] ?? 0) - 8);
      history[target + 3] = pixels[source + 3] ?? 255;
    }
  }
  return history;
}

export function createThreeCompatVelocityProxy(width: number, height: number): Float32Array {
  const velocity = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < width * 0.78 && y > height * 0.14 && y < height * 0.7) {
        const index = (y * width + x) * 2;
        velocity[index] = 1.7;
        velocity[index + 1] = x > width * 0.48 ? -0.65 : 0.32;
      }
    }
  }
  return velocity;
}

import { type TextureMipLevelDescriptor } from "./Texture";

export interface Rgba8EnvironmentMapSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface EnvironmentMipGenerationOptions {
  readonly levels?: number;
  readonly blurRadius?: number;
}

export interface BrdfLutDescriptor {
  readonly width?: number;
  readonly height?: number;
}

export function generateRgba8EnvironmentMipLevels(
  source: Rgba8EnvironmentMapSource,
  options: EnvironmentMipGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment mip levels must be a positive integer");
  }
  const blurRadius = options.blurRadius ?? 1;
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    throw new RangeError("Environment mip blurRadius must be a non-negative integer");
  }

  const levels: TextureMipLevelDescriptor[] = [{
    width: source.width,
    height: source.height,
    data: new Uint8Array(source.data)
  }];
  while (levels.length < Math.min(requestedLevels, maxLevels)) {
    const previous = levels[levels.length - 1]!;
    levels.push(downsampleEnvironmentLevel(previous, blurRadius + levels.length - 1));
  }
  return levels;
}

export function generateApproximateBrdfLutPixels(descriptor: BrdfLutDescriptor = {}): Rgba8EnvironmentMapSource {
  const width = descriptor.width ?? 32;
  const height = descriptor.height ?? 32;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Environment BRDF LUT dimensions must be positive integers");
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const roughness = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nDotV = x / Math.max(1, width - 1);
      const fresnel = Math.pow(1 - nDotV, 5);
      const visibility = lerp(1, 0.42, roughness) * lerp(0.72, 1, nDotV);
      const energy = Math.max(0.18, visibility * (1 - fresnel * 0.35));
      const value = Math.round(energy * 255);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function downsampleEnvironmentLevel(level: TextureMipLevelDescriptor, blurRadius: number): TextureMipLevelDescriptor {
  const width = Math.max(1, Math.floor(level.width / 2));
  const height = Math.max(1, Math.floor(level.height / 2));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = sampleBox(level, x * 2, y * 2, Math.max(1, blurRadius));
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = color[3];
    }
  }
  return { width, height, data };
}

function sampleBox(level: TextureMipLevelDescriptor, centerX: number, centerY: number, radius: number): readonly [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    const wrappedY = clamp(y, 0, level.height - 1);
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const wrappedX = modulo(x, level.width);
      const index = (wrappedY * level.width + wrappedX) * 4;
      r += level.data[index] ?? 0;
      g += level.data[index + 1] ?? 0;
      b += level.data[index + 2] ?? 0;
      a += level.data[index + 3] ?? 255;
      count += 1;
    }
  }
  return [
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count),
    Math.round(a / count)
  ];
}

function validateSource(source: Rgba8EnvironmentMapSource): void {
  if (!Number.isInteger(source.width) || source.width <= 0 || !Number.isInteger(source.height) || source.height <= 0) {
    throw new RangeError("Environment map dimensions must be positive integers");
  }
  if (source.data.byteLength !== source.width * source.height * 4) {
    throw new RangeError("Environment map data must contain exactly width * height * 4 RGBA8 bytes");
  }
}

function maxMipLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

import { generateApproximateBrdfLutPixels, type Rgba8EnvironmentMapSource } from "./EnvironmentMapResources";

export interface V4BrdfLut {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly textureLabel: string;
  readonly diagnostics: {
    readonly byteLength: number;
    readonly nonZeroPixels: number;
    readonly monotonicRoughnessTrend: boolean;
  };
}

export function createV4BrdfLut(size = 64): V4BrdfLut {
  if (!Number.isInteger(size) || size < 16) {
    throw new RangeError("V4 BRDF LUT size must be an integer >= 16.");
  }
  const source = generateApproximateBrdfLutPixels({ width: size, height: size });
  return {
    width: source.width,
    height: source.height,
    data: new Uint8Array(source.data),
    textureLabel: "v4-brdf-lut",
    diagnostics: {
      byteLength: source.data.byteLength,
      nonZeroPixels: countNonZeroPixels(source),
      monotonicRoughnessTrend: roughnessTrend(source)
    }
  };
}

function countNonZeroPixels(source: Rgba8EnvironmentMapSource): number {
  let count = 0;
  for (let index = 0; index < source.data.length; index += 4) {
    if ((source.data[index] ?? 0) + (source.data[index + 1] ?? 0) + (source.data[index + 2] ?? 0) > 0) count += 1;
  }
  return count;
}

function roughnessTrend(source: Rgba8EnvironmentMapSource): boolean {
  const sampleX = Math.max(0, Math.min(source.width - 1, Math.floor(source.width * 0.5)));
  const firstRow = source.data[sampleX * 4] ?? 0;
  const lastRowOffset = ((source.height - 1) * source.width + sampleX) * 4;
  const lastRow = source.data[lastRowOffset] ?? 0;
  return firstRow !== lastRow;
}

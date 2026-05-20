import { bloomFloatPixels, bloomPixels, type BloomOptions, type BloomResult, type HdrBloomResult } from "../PostProcessPass";

export interface V4BloomEvidence {
  readonly mode: "ldr" | "hdr";
  readonly brightPixelCount: number;
  readonly changedPixels: number;
  readonly maxNeighborBoost: number;
  readonly diagnostic: string;
}

export function runV4Bloom(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
  options: BloomOptions = {}
): BloomResult | HdrBloomResult {
  return pixels instanceof Float32Array ? bloomFloatPixels(pixels, width, height, options) : bloomPixels(pixels, width, height, options);
}

export function createV4BloomEvidence(result: BloomResult | HdrBloomResult): V4BloomEvidence {
  return {
    mode: result.pixels instanceof Float32Array ? "hdr" : "ldr",
    brightPixelCount: result.brightPixelCount,
    changedPixels: result.changedPixels,
    maxNeighborBoost: result.maxNeighborBoost,
    diagnostic: "Bloom evidence must improve highlights without hiding poor lighting or material failures."
  };
}

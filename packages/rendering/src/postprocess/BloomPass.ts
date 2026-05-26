import { bloomFloatPixels, bloomPixels, type BloomOptions, type BloomResult, type HdrBloomResult } from "../PostProcessPass";

export interface ExternalParityBloomEvidence {
  readonly mode: "ldr" | "hdr";
  readonly brightPixelCount: number;
  readonly changedPixels: number;
  readonly maxNeighborBoost: number;
  readonly diagnostic: string;
}

export function runExternalParityBloom(
  pixels: Uint8Array | Float32Array,
  width: number,
  height: number,
  options: BloomOptions = {}
): BloomResult | HdrBloomResult {
  return pixels instanceof Float32Array ? bloomFloatPixels(pixels, width, height, options) : bloomPixels(pixels, width, height, options);
}

export function createExternalParityBloomEvidence(result: BloomResult | HdrBloomResult): ExternalParityBloomEvidence {
  return {
    mode: result.pixels instanceof Float32Array ? "hdr" : "ldr",
    brightPixelCount: result.brightPixelCount,
    changedPixels: result.changedPixels,
    maxNeighborBoost: result.maxNeighborBoost,
    diagnostic: "Bloom evidence must improve highlights without hiding poor lighting or material failures."
  };
}

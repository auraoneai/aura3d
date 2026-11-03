/**
 * Shared KTX2/Basis transcode driver (PRD-05 §7.4). Consumes an initialised
 * Basis Universal `BASIS` module — the same instance shape in a worker
 * (`importScripts` + `wasmBinary`) and on the main thread (node, vendored
 * UMD evaluated as CJS). Never touches the network itself: the wasm binary
 * and module are provided by the caller.
 */

/** Public numeric targets from the Basis Universal transcoder API. */
export const BASIS_TRANSCODER_FORMAT = {
  ETC1: 0,
  ETC2: 1,
  BC1: 2,
  BC3: 3,
  BC7_M6_OPAQUE_ONLY: 6,
  BC7_M5: 7,
  ASTC_4x4: 10,
  RGBA32: 13
} as const;

import type { KTX2BasisTargetFormat } from "./KTX2TargetSelection.js";

export function basisTranscoderFormat(target: KTX2BasisTargetFormat): number {
  switch (target) {
    case "astc-4x4-rgba-unorm": return BASIS_TRANSCODER_FORMAT.ASTC_4x4;
    case "bc7-rgba-unorm": return BASIS_TRANSCODER_FORMAT.BC7_M5;
    case "etc2-rgba8unorm": return BASIS_TRANSCODER_FORMAT.ETC2;
    case "etc2-rgb8unorm": return BASIS_TRANSCODER_FORMAT.ETC2;
    case "bc3-rgba-unorm": return BASIS_TRANSCODER_FORMAT.BC3;
    case "bc1-rgb-unorm": return BASIS_TRANSCODER_FORMAT.BC1;
    case "rgba8": return BASIS_TRANSCODER_FORMAT.RGBA32;
    default: throw new Error(`KTX2/Basis target format ${String(target)} is unsupported`);
  }
}

export interface BasisKTX2FileLike {
  isValid(): boolean;
  isUASTC(): boolean;
  isETC1S(): boolean;
  isHDR?(): boolean;
  getWidth(): number;
  getHeight(): number;
  getLayers(): number;
  getLevels(): number;
  getFaces(): number;
  getHasAlpha(): boolean;
  getDFDFlags?(): number;
  getImageLevelInfo(level: number, layer: number, face: number): { readonly width: number; readonly height: number; readonly origWidth: number; readonly origHeight: number; readonly numBlocksX?: number; readonly numBlocksY?: number };
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
  startTranscoding(): boolean;
  transcodeImage(dst: Uint8Array, level: number, layer: number, face: number, format: number, unused0: number, unused1: number, unused2: number): boolean;
  close(): void;
  delete(): void;
}

export interface BasisModuleLike {
  initializeBasis(): void;
  readonly KTX2File: new (data: Uint8Array) => BasisKTX2FileLike;
}

export interface KTX2TranscodedLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface KTX2TranscodeResult {
  readonly width: number;
  readonly height: number;
  readonly isUASTC: boolean;
  readonly hasAlpha: boolean;
  readonly levels: readonly KTX2TranscodedLevel[];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("KTX2 transcode aborted");
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Transcodes every mip level (largest first) of a KTX2 container to
 * `transcoderFormat` (a `BASIS_TRANSCODER_FORMAT` value). Levels whose true
 * dimensions exceed `maxDimension` are skipped — `startTranscoding` avoids
 * touching their payloads entirely.
 */
export function transcodeKTX2Levels(
  basis: BasisModuleLike,
  bytes: Uint8Array,
  transcoderFormat: number,
  maxDimension?: number,
  maxOutputBytes = 256 * 1024 * 1024,
  signal?: AbortSignal
): KTX2TranscodeResult {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) throw new Error("Invalid KTX2 output byte limit");
  if (maxDimension !== undefined && (!Number.isSafeInteger(maxDimension) || maxDimension <= 0)) throw new Error("Invalid KTX2 maximum dimension");
  throwIfAborted(signal);
  const file = new basis.KTX2File(bytes);
  try {
    if (!file.isValid()) {
      throw new Error("Invalid or unsupported .ktx2 file");
    }
    if (!file.isUASTC() && !file.isETC1S() && !(file.isHDR?.() ?? false)) {
      throw new Error("Unknown Basis encoding (expected UASTC or ETC1S)");
    }
    const width = file.getWidth();
    const height = file.getHeight();
    const layerCount = file.getLayers() || 1;
    const levelCount = file.getLevels();
    const faceCount = file.getFaces();
    const hasAlpha = file.getHasAlpha();
    if (![width, height, layerCount, levelCount, faceCount].every(Number.isSafeInteger) ||
        width <= 0 || height <= 0 || width > 32768 || height > 32768 ||
        layerCount <= 0 || layerCount > 2048 || levelCount <= 0 || levelCount > 32 ||
        (faceCount !== 1 && faceCount !== 6)) {
      throw new Error("Invalid texture");
    }
    if (!file.startTranscoding()) {
      throw new Error(".startTranscoding failed");
    }
    const levels: KTX2TranscodedLevel[] = [];
    let totalBytes = 0;
    for (let face = 0; face < faceCount; face += 1) {
      for (let level = 0; level < levelCount; level += 1) {
        throwIfAborted(signal);
        const levelInfo = file.getImageLevelInfo(level, 0, face);
        if (maxDimension !== undefined && Math.max(levelInfo.origWidth, levelInfo.origHeight) > maxDimension) {
          continue;
        }
        if (![levelInfo.origWidth, levelInfo.origHeight].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Invalid KTX2 mip dimensions");
        const sizes: number[] = [];
        for (let layer = 0; layer < layerCount; layer += 1) {
          const size = file.getImageTranscodedSizeInBytes(level, layer, face, transcoderFormat);
          if (!Number.isSafeInteger(size) || size <= 0 || size > maxOutputBytes - totalBytes) throw new Error("KTX2 output exceeds byte limit");
          totalBytes += size;
          sizes.push(size);
        }
        const data = new Uint8Array(sizes.reduce((sum, size) => sum + size, 0));
        let offset = 0;
        for (let layer = 0; layer < layerCount; layer += 1) {
          throwIfAborted(signal);
          const destination = data.subarray(offset, offset + sizes[layer]!);
          if (!file.transcodeImage(destination, level, layer, face, transcoderFormat, 0, -1, -1)) {
            throw new Error(".transcodeImage failed");
          }
          offset += sizes[layer]!;
        }
        levels.push({ width: levelInfo.origWidth, height: levelInfo.origHeight, data });
      }
    }
    if (levels.length === 0) {
      throw new Error(`maxDimension ${maxDimension} skipped every mip level`);
    }
    return { width: levels[0]!.width, height: levels[0]!.height, isUASTC: file.isUASTC(), hasAlpha, levels };
  } finally {
    try { file.close(); } finally { file.delete(); }
  }
}

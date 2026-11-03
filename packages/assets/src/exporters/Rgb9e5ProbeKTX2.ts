import {
  KHR_DF_CHANNEL_RGBSDA_BLUE,
  KHR_DF_CHANNEL_RGBSDA_GREEN,
  KHR_DF_CHANNEL_RGBSDA_RED,
  KHR_DF_FLAG_ALPHA_STRAIGHT,
  KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT,
  KHR_DF_MODEL_RGBSDA,
  KHR_DF_PRIMARIES_BT709,
  KHR_DF_PRIMARIES_UNSPECIFIED,
  KHR_DF_SAMPLE_DATATYPE_EXPONENT,
  KHR_DF_TRANSFER_LINEAR,
  KHR_DF_VENDORID_KHRONOS,
  KHR_DF_VERSION,
  KHR_SUPERCOMPRESSION_NONE,
  VK_FORMAT_E5B9G9R9_UFLOAT_PACK32,
  write,
  type KTX2BasicFormatSample,
  type KTX2Container,
} from "ktx-parse";

/** A single cubemap mip, with faces ordered +X, -X, +Y, -Y, +Z, -Z. */
export interface Rgb9e5ProbeLevel {
  readonly size: number;
  readonly channels: 3 | 4;
  /** Row-major, tightly interleaved linear RGB or RGBA floats. */
  readonly faces: readonly Float32Array[];
}

export interface Rgb9e5ProbeKTX2Options {
  /**
   * The caller must identify the source primaries; this encoder does not
   * convert them. The current Aura probe reader accepts bt709 only.
   */
  readonly colorPrimaries: "bt709" | "unspecified";
}

const MAX_CHANNEL = 65_408;
const MAX_MANTISSA = 511;
const MAX_EXPONENT = 31;
// The runtime preset reader accepts faces up to 1024. The in-memory baker has
// a lower work bound, but the shared serializer can also encode CLI output.
const MAX_FACE_SIZE = 1_024;

function roundTiesToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

/**
 * Pack linear RGB to an unsigned shared-exponent word. Red occupies bits 0–8,
 * green 9–17, blue 18–26, and the exponent 27–31. Each represented channel is
 * `mantissa * 2 ** (exponent - 24)`. Values outside the finite representable
 * non-negative range are rejected instead of being silently clipped.
 */
export function packRgb9e5(red: number, green: number, blue: number): number {
  for (const channel of [red, green, blue]) {
    if (!Number.isFinite(channel) || channel < 0 || channel > MAX_CHANNEL) {
      throw new RangeError(`RGB9E5 channels must be finite and between 0 and ${MAX_CHANNEL}`);
    }
  }
  const maximum = Math.max(red, green, blue);
  if (maximum === 0) return 0;
  let exponent = Math.max(0, Math.min(MAX_EXPONENT, Math.floor(Math.log2(maximum)) + 16));
  while (exponent > 0 && maximum < 2 ** (exponent - 16)) exponent -= 1;
  while (exponent < MAX_EXPONENT && maximum >= 2 ** (exponent - 15)) exponent += 1;
  let quantum = 2 ** (exponent - 24);
  if (roundTiesToEven(maximum / quantum) > MAX_MANTISSA) {
    exponent += 1;
    if (exponent > MAX_EXPONENT) throw new RangeError("RGB9E5 exponent exceeds its representable range");
    quantum *= 2;
  }
  const r = roundTiesToEven(red / quantum);
  const g = roundTiesToEven(green / quantum);
  const b = roundTiesToEven(blue / quantum);
  return (r | (g << 9) | (b << 18) | (exponent << 27)) >>> 0;
}

/**
 * Encode six float faces as a face-major little-endian RGB9E5 payload.
 * RGBA input requires alpha exactly 1 because this format has no alpha.
 * This produces texels only, without a KTX container or descriptor.
 */
export function encodeRgb9e5Faces(
  faces: readonly Float32Array[],
  faceSize: number,
  channels: 3 | 4,
): Uint8Array {
  if (!Number.isSafeInteger(faceSize) || faceSize < 1 || faceSize > MAX_FACE_SIZE) {
    throw new RangeError(`RGB9E5 face size must be an integer from 1 through ${MAX_FACE_SIZE}`);
  }
  if (channels !== 3 && channels !== 4) throw new RangeError("RGB9E5 faces must have three or four channels");
  if (!Array.isArray(faces) || faces.length !== 6) throw new RangeError("RGB9E5 cube payload requires exactly six faces");
  const pixelsPerFace = faceSize * faceSize;
  for (const face of faces) {
    if (!(face instanceof Float32Array) || face.length !== pixelsPerFace * channels) {
      throw new RangeError("RGB9E5 cube faces must contain tightly packed float RGB or RGBA pixels");
    }
  }
  const output = new Uint8Array(6 * pixelsPerFace * 4);
  const view = new DataView(output.buffer);
  let byteOffset = 0;
  for (const face of faces) {
    for (let pixel = 0; pixel < pixelsPerFace; pixel += 1) {
      const offset = pixel * channels;
      if (channels === 4 && face[offset + 3] !== 1) throw new RangeError("RGB9E5 cannot encode non-opaque alpha");
      view.setUint32(byteOffset, packRgb9e5(face[offset]!, face[offset + 1]!, face[offset + 2]!), true);
      byteOffset += 4;
    }
  }
  return output;
}

function sample(bitOffset: number, bitLength: number, channelType: number, exponent: boolean): KTX2BasicFormatSample {
  return {
    bitOffset,
    bitLength: bitLength - 1,
    channelType,
    samplePosition: [0, 0, 0, 0],
    sampleLower: exponent ? 15 : 0,
    sampleUpper: exponent ? 31 : 8_448,
  };
}

/**
 * Construct a standard in-memory KTX2 RGB9E5 cube. The existing MIT-licensed
 * KTX2 serializer writes the container; shared-exponent sample records follow
 * Khronos Data Format 1.4 Table 102:
 * https://registry.khronos.org/DataFormat/specs/1.4/dataformat.1.4.html
 * This function neither writes a file nor emits the historical private probe
 * container. The caller must explicitly describe, and if needed convert, its
 * source primaries before calling.
 */
export function encodeRgb9e5ProbeKTX2(
  mipLevels: readonly Rgb9e5ProbeLevel[],
  options: Rgb9e5ProbeKTX2Options,
): Uint8Array {
  if (!options || (options.colorPrimaries !== "bt709" && options.colorPrimaries !== "unspecified")) {
    throw new RangeError("probe KTX2 requires explicit bt709 or unspecified color primaries");
  }
  if (!Array.isArray(mipLevels) || mipLevels.length === 0) throw new RangeError("probe KTX2 requires at least one cube mip");
  const faceSize = mipLevels[0]?.size;
  if (!Number.isSafeInteger(faceSize) || faceSize! < 1 || faceSize! > MAX_FACE_SIZE) {
    throw new RangeError(`probe KTX2 face size must be an integer from 1 through ${MAX_FACE_SIZE}`);
  }
  if (mipLevels.length > Math.floor(Math.log2(faceSize!)) + 1) throw new RangeError("probe KTX2 has too many mip levels");
  let expectedSize = faceSize!;
  const levels: KTX2Container["levels"] = [];
  for (const mip of mipLevels) {
    if (!mip || mip.size !== expectedSize) throw new RangeError("probe KTX2 mip dimensions are inconsistent");
    const levelData = encodeRgb9e5Faces(mip.faces, expectedSize, mip.channels);
    levels.push({ levelData, uncompressedByteLength: levelData.byteLength });
    expectedSize = Math.max(1, Math.floor(expectedSize / 2));
  }
  const channels = [KHR_DF_CHANNEL_RGBSDA_RED, KHR_DF_CHANNEL_RGBSDA_GREEN, KHR_DF_CHANNEL_RGBSDA_BLUE];
  const samples: KTX2BasicFormatSample[] = [];
  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index]!;
    samples.push(sample(index * 9, 9, channel, false));
    samples.push(sample(27, 5, channel | KHR_DF_SAMPLE_DATATYPE_EXPONENT, true));
  }
  const container: KTX2Container = {
    vkFormat: VK_FORMAT_E5B9G9R9_UFLOAT_PACK32,
    typeSize: 4,
    pixelWidth: faceSize!,
    pixelHeight: faceSize!,
    pixelDepth: 0,
    layerCount: 0,
    faceCount: 6,
    supercompressionScheme: KHR_SUPERCOMPRESSION_NONE,
    levels,
    dataFormatDescriptor: [{
      vendorId: KHR_DF_VENDORID_KHRONOS,
      descriptorType: KHR_DF_KHR_DESCRIPTORTYPE_BASICFORMAT,
      versionNumber: KHR_DF_VERSION,
      colorModel: KHR_DF_MODEL_RGBSDA,
      colorPrimaries: options.colorPrimaries === "bt709" ? KHR_DF_PRIMARIES_BT709 : KHR_DF_PRIMARIES_UNSPECIFIED,
      transferFunction: KHR_DF_TRANSFER_LINEAR,
      flags: KHR_DF_FLAG_ALPHA_STRAIGHT,
      texelBlockDimension: [0, 0, 0, 0],
      bytesPlane: [4, 0, 0, 0, 0, 0, 0, 0],
      samples,
    }],
    keyValue: { KTXwriter: "Aura3D independent probe baker" },
    globalData: null,
  };
  return write(container, { keepWriter: true });
}

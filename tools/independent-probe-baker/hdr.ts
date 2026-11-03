export interface RadianceDecodeOptions {
  /** Select the lower edge or midpoint of each encoded mantissa bin. */
  readonly reconstruction: "lower" | "midpoint";
  /** Preserve stored RGB by default, or divide out declared exposure factors. */
  readonly exposure?: "preserve" | "remove";
  readonly maxInputBytes?: number;
  readonly maxHeaderBytes?: number;
  readonly maxPixels?: number;
  readonly maxDecodedBytes?: number;
}

export interface RadianceHdrMetadata {
  /** Product of left-justified EXPOSURE entries; no exposure means 1. */
  readonly exposure: number;
  readonly exposureMode: "preserve" | "remove";
  readonly reconstruction: "lower" | "midpoint";
  /** No gamut conversion has been performed or implied by this value. */
  readonly colorSpace: "rgb-unconverted";
  /** Recorded COLORCORR entries, in header order; they are not applied. */
  readonly colorCorrections: readonly (readonly [number, number, number])[];
  readonly primaries?: readonly number[];
  readonly gamma?: number;
  /** Original information-header lines, including unrecognized metadata. */
  readonly headerLines: readonly string[];
}

export interface DecodedRadianceHdr {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
  readonly metadata: RadianceHdrMetadata;
}

const HARD_INPUT_BYTES = 64 * 1024 * 1024;
const HARD_HEADER_BYTES = 64 * 1024;
const HARD_PIXELS = 4_194_304;
const HARD_DECODED_BYTES = HARD_PIXELS * 3 * Float32Array.BYTES_PER_ELEMENT;

function bound(value: number | undefined, fallback: number, hardLimit: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > hardLimit) {
    throw new RangeError(`${label} must be an integer from 1 through ${hardLimit}`);
  }
  return resolved;
}

function numericValues(text: string, count: number, label: string, positive: boolean): number[] {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== count || parts.some((part) => part.length === 0)) {
    throw new RangeError(`${label} must contain ${count} numeric value${count === 1 ? "" : "s"}`);
  }
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value) || (positive && value <= 0))) {
    throw new RangeError(`${label} values must be finite${positive ? " and positive" : ""}`);
  }
  return values;
}

/**
 * Decode a bounded subset of a Radiance RGBE byte stream to row-major float
 * RGB. Information-header fields are active only when left-justified. Common
 * `-Y height +X width` orientation and modern per-channel scanline RLE are
 * supported. Raw rows without old-style run markers are also accepted.
 *
 * The primary picture-format note defines the header, RGBE representation
 * and scanline organization:
 * https://radsite.lbl.gov/radiance/refer/Notes/picture_format.html
 * Modern packet counts are independently documented at:
 * https://docs.rs/oxideav-hdr/latest/oxideav_hdr/rle/index.html
 * Quantization-bin reconstruction is explicit because both lower-edge and
 * midpoint interpretations are in use. This adapter does not assert that
 * either choice is an exact reproduction of every Radiance implementation.
 * XYZE, other orientations and old-style RLE are intentionally rejected.
 */
export function decodeRadianceHdr(bytes: Uint8Array, options: RadianceDecodeOptions): DecodedRadianceHdr {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Radiance input must be a Uint8Array");
  if (!options || (options.reconstruction !== "lower" && options.reconstruction !== "midpoint")) {
    throw new RangeError("Radiance reconstruction must be lower or midpoint");
  }
  const exposureMode = options.exposure ?? "preserve";
  if (exposureMode !== "preserve" && exposureMode !== "remove") {
    throw new RangeError("Radiance exposure mode must be preserve or remove");
  }
  const maxInputBytes = bound(options.maxInputBytes, HARD_INPUT_BYTES, HARD_INPUT_BYTES, "input byte limit");
  const maxHeaderBytes = bound(options.maxHeaderBytes, 16 * 1024, HARD_HEADER_BYTES, "header byte limit");
  const maxPixels = bound(options.maxPixels, HARD_PIXELS, HARD_PIXELS, "pixel limit");
  const maxDecodedBytes = bound(options.maxDecodedBytes, HARD_DECODED_BYTES, HARD_DECODED_BYTES, "decoded byte limit");
  if (bytes.byteLength > maxInputBytes) throw new RangeError("Radiance input exceeds the byte limit");

  let offset = 0;
  function readHeaderLine(): string {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== 10) {
      const byte = bytes[offset]!;
      if (byte !== 9 && byte !== 13 && (byte < 32 || byte > 126)) {
        throw new RangeError("Radiance header must contain printable ASCII");
      }
      offset += 1;
      if (offset > maxHeaderBytes) throw new RangeError("Radiance header exceeds the byte limit");
    }
    if (offset >= bytes.length) throw new RangeError("Radiance header is truncated");
    const end = offset > start && bytes[offset - 1] === 13 ? offset - 1 : offset;
    offset += 1;
    if (offset > maxHeaderBytes) throw new RangeError("Radiance header exceeds the byte limit");
    let line = "";
    for (let index = start; index < end; index += 1) line += String.fromCharCode(bytes[index]!);
    return line;
  }

  const magic = readHeaderLine();
  if (magic !== "#?RADIANCE" && magic !== "#?RGBE") throw new RangeError("unsupported Radiance magic");
  const headerLines = [magic];
  const colorCorrections: Array<readonly [number, number, number]> = [];
  let exposure = 1;
  let format: string | undefined;
  let gamma: number | undefined;
  let primaries: readonly number[] | undefined;
  for (;;) {
    const line = readHeaderLine();
    if (line.length === 0) break;
    headerLines.push(line);
    if (line.startsWith("FORMAT=")) {
      if (format !== undefined) throw new RangeError("multiple Radiance FORMAT entries are unsupported");
      format = line.slice(7);
    } else if (line.startsWith("EXPOSURE=")) {
      exposure *= numericValues(line.slice(9), 1, "EXPOSURE", true)[0]!;
      if (!Number.isFinite(exposure) || exposure <= 0) throw new RangeError("Radiance cumulative exposure is out of range");
    } else if (line.startsWith("COLORCORR=")) {
      const values = numericValues(line.slice(10), 3, "COLORCORR", true);
      colorCorrections.push([values[0]!, values[1]!, values[2]!]);
    } else if (line.startsWith("PRIMARIES=")) {
      if (primaries !== undefined) throw new RangeError("multiple Radiance PRIMARIES entries are unsupported");
      primaries = numericValues(line.slice(10), 8, "PRIMARIES", false);
    } else if (line.startsWith("GAMMA=")) {
      if (gamma !== undefined) throw new RangeError("multiple Radiance GAMMA entries are unsupported");
      gamma = numericValues(line.slice(6), 1, "GAMMA", true)[0]!;
    }
  }
  if (format !== "32-bit_rle_rgbe") throw new RangeError("only Radiance 32-bit_rle_rgbe is supported");
  if (exposureMode === "remove" && colorCorrections.length !== 0) {
    throw new RangeError("removing Radiance exposure with COLORCORR is unsupported");
  }
  const resolution = readHeaderLine();
  const match = /^-Y\s+([1-9]\d*)\s+\+X\s+([1-9]\d*)$/.exec(resolution);
  if (!match) throw new RangeError("only Radiance -Y height +X width orientation is supported");
  const height = Number(match[1]), width = Number(match[2]);
  const pixels = width * height;
  const decodedBytes = pixels * 3 * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(pixels) ||
      pixels > maxPixels || !Number.isSafeInteger(decodedBytes) || decodedBytes > maxDecodedBytes) {
    throw new RangeError("Radiance image exceeds the pixel or decoded-byte limit");
  }
  const data = new Float32Array(pixels * 3);
  const row = new Uint8Array(width * 4);
  const divisor = exposureMode === "remove" ? exposure : 1;
  const midpoint = options.reconstruction === "midpoint" ? 0.5 : 0;

  function nextByte(): number {
    if (offset >= bytes.length) throw new RangeError("Radiance pixel data is truncated");
    return bytes[offset++]!;
  }

  for (let y = 0; y < height; y += 1) {
    const modern = width >= 8 && width <= 32_767 && offset + 4 <= bytes.length &&
      bytes[offset] === 2 && bytes[offset + 1] === 2 && (bytes[offset + 2]! & 0x80) === 0;
    if (modern) {
      offset += 2;
      const encodedWidth = nextByte() * 256 + nextByte();
      if (encodedWidth !== width) throw new RangeError("Radiance RLE scanline width does not match the header");
      for (let channel = 0; channel < 4; channel += 1) {
        let x = 0;
        while (x < width) {
          const control = nextByte();
          if (control === 0) throw new RangeError("Radiance RLE contains a zero-length packet");
          const count = control > 128 ? control - 128 : control;
          if (x + count > width) throw new RangeError("Radiance RLE packet exceeds the scanline width");
          if (control > 128) {
            const value = nextByte();
            row.fill(value, channel * width + x, channel * width + x + count);
            x += count;
          } else {
            for (let i = 0; i < count; i += 1) row[channel * width + x++] = nextByte();
          }
        }
      }
    } else {
      for (let x = 0; x < width; x += 1) {
        const r = nextByte(), g = nextByte(), b = nextByte(), e = nextByte();
        if (r === 1 && g === 1 && b === 1) throw new RangeError("old-style Radiance RLE is unsupported");
        row[x] = r;
        row[width + x] = g;
        row[width * 2 + x] = b;
        row[width * 3 + x] = e;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const exponent = row[width * 3 + x]!;
      const scale = exponent === 0 ? 0 : 2 ** (exponent - 136) / divisor;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = exponent === 0 ? 0 : (row[channel * width + x]! + midpoint) * scale;
        const converted = Math.fround(value);
        if (!Number.isFinite(converted)) throw new RangeError("Radiance sample exceeds the finite float32 range");
        data[(y * width + x) * 3 + channel] = converted;
      }
    }
  }
  if (offset !== bytes.length) throw new RangeError("trailing Radiance pixel data is unsupported");
  return {
    width,
    height,
    data,
    metadata: {
      exposure,
      exposureMode,
      reconstruction: options.reconstruction,
      colorSpace: "rgb-unconverted",
      colorCorrections,
      ...(primaries === undefined ? {} : { primaries }),
      ...(gamma === undefined ? {} : { gamma }),
      headerLines,
    },
  };
}

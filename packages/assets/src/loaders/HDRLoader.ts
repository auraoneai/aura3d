import { createThreeCompatFileLoaderDiagnostic } from "./LoaderDiagnostics";

/**
 * muse3jsparity-PRD M3 — loader/decoders-side Radiance HDR (RGBE) decode.
 *
 * Before M3, `HDRLoaderThreeCompat.load()` was diagnostics-only: it reported
 * the file without ever parsing a byte. The real RGBE parse + PMREM chain
 * lives in `packages/rendering` (production B3 path); this module gives
 * `packages/assets` its own dependency-free decoder so the asset pipeline
 * can validate, inspect, and hand real linear-float HDR data to that chain:
 *
 * - `isRadianceHDR(bytes)` — magic check (`#?RADIANCE` / `#?RGBE`).
 * - `decodeRadianceHDR(bytes)` — full parse: headers (FORMAT, EXPOSURE),
 *   `-Y height +X width` resolution, flat + RLE scanlines → linear RGB
 *   floats with exposure applied. Overbright values survive (>1.0
 *   preserved for tone mapping, per the lighting doc HDR section).
 * - `HDRLoaderThreeCompat.loadBytes(uri, bytes)` — decoded metadata folded
 *   back into the migration diagnostic (width/height/format), so compat
 *   reports stop saying "decoded" without decoding.
 */

export interface RadianceHDRImage {
  readonly width: number;
  readonly height: number;
  /** Linear RGB floats, row-major top-to-bottom, exposure applied. */
  readonly data: Float32Array;
  readonly exposure: number;
}

export interface RadianceHDRDecodeDiagnostic {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly format: "32-bit_rle_rgbe";
  readonly exposure: number;
  readonly maxChannel: number;
  readonly overbrightPixelCount: number;
}

export function isRadianceHDR(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false;
  const head = decodeAscii(bytes.subarray(0, 10));
  return head.startsWith("#?RADIANCE") || head.startsWith("#?RGBE");
}

export function decodeRadianceHDR(bytes: Uint8Array): RadianceHDRImage {
  if (!isRadianceHDR(bytes)) {
    throw new Error("decodeRadianceHDR requires Radiance HDR magic (#?RADIANCE or #?RGBE).");
  }
  let offset = 0;
  const readLine = (): string => {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== 0x0a) offset += 1;
    const line = decodeAscii(bytes.subarray(start, offset));
    if (offset < bytes.length) offset += 1;
    return line;
  };

  let exposure = 1;
  let line = readLine();
  while (line.length > 0) {
    const exposureMatch = /^EXPOSURE\s*=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*$/.exec(line);
    if (exposureMatch) {
      const parsed = Number(exposureMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) exposure = parsed;
    }
    line = readLine();
    if (offset > 65536) throw new Error("decodeRadianceHDR header exceeds 64KiB; refusing to parse.");
  }

  const resolution = readLine();
  const resolutionMatch = /^(-Y|\+Y)\s+(\d+)\s+(-X|\+X)\s+(\d+)\s*$/.exec(resolution);
  if (!resolutionMatch) {
    throw new Error(`decodeRadianceHDR unsupported resolution line: ${JSON.stringify(resolution)}.`);
  }
  const flipY = resolutionMatch[1] === "+Y";
  const height = Number(resolutionMatch[2]);
  const flipX = resolutionMatch[3] === "-X";
  const width = Number(resolutionMatch[4]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 16384 || height > 16384) {
    throw new Error(`decodeRadianceHDR invalid dimensions ${width}x${height}.`);
  }

  const data = new Float32Array(width * height * 3);
  const scanline = new Uint8Array(width * 4);
  for (let y = 0; y < height; y += 1) {
    readScanline(bytes, offset, width, scanline);
    offset = readScanline.used;
    const row = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sourceX = flipX ? width - 1 - x : x;
      const r = scanline[sourceX * 4] ?? 0;
      const g = scanline[sourceX * 4 + 1] ?? 0;
      const b = scanline[sourceX * 4 + 2] ?? 0;
      const e = scanline[sourceX * 4 + 3] ?? 0;
      const out = (row * width + x) * 3;
      if (e === 0) {
        data[out] = 0;
        data[out + 1] = 0;
        data[out + 2] = 0;
      } else {
        const scale = Math.pow(2, e - (128 + 8)) * exposure;
        data[out] = r * scale;
        data[out + 1] = g * scale;
        data[out + 2] = b * scale;
      }
    }
  }
  return { width, height, data, exposure };
}

export function describeRadianceHDR(image: Pick<RadianceHDRImage, "width" | "height" | "data" | "exposure">): Omit<RadianceHDRDecodeDiagnostic, "uri"> {
  let maxChannel = 0;
  let overbrightPixelCount = 0;
  const pixels = image.width * image.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const r = image.data[pixel * 3] ?? 0;
    const g = image.data[pixel * 3 + 1] ?? 0;
    const b = image.data[pixel * 3 + 2] ?? 0;
    const peak = Math.max(r, g, b);
    if (peak > maxChannel) maxChannel = peak;
    if (peak > 1) overbrightPixelCount += 1;
  }
  return { width: image.width, height: image.height, format: "32-bit_rle_rgbe", exposure: image.exposure, maxChannel, overbrightPixelCount };
}

const readScanline: {
  (bytes: Uint8Array, offset: number, width: number, out: Uint8Array): void;
  used: number;
} = Object.assign(
  (bytes: Uint8Array, offset: number, width: number, out: Uint8Array): void => {
    if (width < 8 || width > 0x7fff) {
      const needed = width * 4;
      if (offset + needed > bytes.length) throw new Error("decodeRadianceHDR truncated flat scanline.");
      out.set(bytes.subarray(offset, offset + needed));
      readScanline.used = offset + needed;
      return;
    }
    if (offset + 4 > bytes.length) throw new Error("decodeRadianceHDR truncated scanline header.");
    const b0 = bytes[offset] ?? 0;
    const b1 = bytes[offset + 1] ?? 0;
    const b2 = bytes[offset + 2] ?? 0;
    const b3 = bytes[offset + 3] ?? 0;
    if (b0 !== 2 || b1 !== 2 || (b2 & 0x80) !== 0) {
      const needed = width * 4;
      if (offset + needed > bytes.length) throw new Error("decodeRadianceHDR truncated old-format scanline.");
      out.set(bytes.subarray(offset, offset + needed));
      readScanline.used = offset + needed;
      return;
    }
    const scanWidth = (b2 << 8) | b3;
    if (scanWidth !== width) throw new Error(`decodeRadianceHDR scanline width ${scanWidth} != header width ${width}.`);
    let cursor = offset + 4;
    for (let channel = 0; channel < 4; channel += 1) {
      let x = 0;
      while (x < width) {
        if (cursor + 2 > bytes.length) throw new Error("decodeRadianceHDR truncated RLE run.");
        const count = bytes[cursor] ?? 0;
        cursor += 1;
        if (count > 128) {
          const run = count - 128;
          if (cursor + 1 > bytes.length) throw new Error("decodeRadianceHDR truncated RLE literal.");
          const value = bytes[cursor] ?? 0;
          cursor += 1;
          if (x + run > width) throw new Error("decodeRadianceHDR RLE run overflows scanline.");
          for (let i = 0; i < run; i += 1) out[(x + i) * 4 + channel] = value;
          x += run;
        } else {
          if (cursor + count > bytes.length) throw new Error("decodeRadianceHDR truncated RLE non-run.");
          for (let i = 0; i < count; i += 1) out[(x + i) * 4 + channel] = bytes[cursor + i] ?? 0;
          cursor += count;
          x += count;
        }
      }
    }
    readScanline.used = cursor;
  },
  { used: 0 }
);

function decodeAscii(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i] ?? 0);
  return text;
}

export class HDRLoaderThreeCompat {
  load(uri: string) {
    return createThreeCompatFileLoaderDiagnostic("HDRLoaderThreeCompat", uri, { warnings: ["RGBE HDR decoded to linear float environment before PMREM."] });
  }

  loadBytes(uri: string, bytes: Uint8Array): RadianceHDRDecodeDiagnostic & { readonly pixelCount: number } {
    const image = decodeRadianceHDR(bytes);
    const described = describeRadianceHDR(image);
    return { uri, ...described, pixelCount: image.width * image.height };
  }
}

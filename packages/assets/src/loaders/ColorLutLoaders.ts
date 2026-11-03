import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { fetchBytes } from "../LoaderFetch";
import type { LoadContext } from "../LoadContext";

/**
 * Bounded color-table import. The canonical storage is RGBA float in
 * red-fastest order (`r + size * (g + size * b)`) for Aura3D 3D textures.
 * Parsing a 3DL or image never performs an implicit color-space conversion.
 */

export type LutColor = readonly [number, number, number];
export type LutRowOrder = "blue-fastest" | "red-fastest";

export interface ColorLutDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface ColorLut3D {
  readonly size: number;
  readonly data: Float32Array;
  /** Minimum and maximum input color values, before the optional input grid. */
  readonly domainMin: LutColor;
  readonly domainMax: LutColor;
  /** Shared input lattice, normalized to [0, 1], possibly non-uniform. */
  readonly inputGrid: readonly number[];
  readonly diagnostics: readonly ColorLutDiagnostic[];
}

export interface Parse3DLOptions {
  /** Explicit integer output maximum (e.g. 4095). Takes precedence over Mesh header. */
  readonly outputMax?: number;
  /** Axis changing fastest in the source. 3DL's common convention is blue-fastest. */
  readonly rowOrder?: LutRowOrder;
  readonly domainMin?: LutColor;
  readonly domainMax?: LutColor;
  readonly maxSize?: number;
  readonly maxBytes?: number;
}

export interface ImageLutOptions {
  readonly size: number;
  readonly width: number;
  readonly height: number;
  /** Row-major RGB or RGBA pixels; integer arrays are normalized to their full range. */
  readonly pixels: Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
  readonly channels?: 3 | 4;
  /** Number of blue-slice tiles across the image. Defaults to a horizontal strip. */
  readonly columns?: number;
  /** Flip the image's rows before reading, e.g. for bottom-origin image data. */
  readonly flipY?: boolean;
  readonly domainMin?: LutColor;
  readonly domainMax?: LutColor;
  readonly maxSize?: number;
}

const MAX_SIZE = 65;
const MAX_3DL_BYTES = 8 * 1024 * 1024;

function sizeLimit(value: number | undefined): number {
  const size = value ?? MAX_SIZE;
  if (!Number.isInteger(size) || size < 2 || size > MAX_SIZE) {
    throw new RangeError(`COLOR_LUT_LIMIT: maxSize must be an integer from 2 to ${MAX_SIZE}.`);
  }
  return size;
}

function validateSize(size: number, limit: number): void {
  if (!Number.isInteger(size) || size < 2 || size > limit) {
    throw new RangeError(`COLOR_LUT_SIZE: expected a size from 2 to ${limit}, got ${size}.`);
  }
}

function validateDomain(min: LutColor, max: LutColor): void {
  if (min.length !== 3 || max.length !== 3 || min.some((v) => !Number.isFinite(v)) ||
      max.some((v, i) => !Number.isFinite(v) || v <= min[i]!)) {
    throw new RangeError("COLOR_LUT_DOMAIN: each finite domain maximum must exceed its minimum.");
  }
}

function finiteParts(line: string, lineNo: number): number[] {
  const parts = line.trim().split(/\s+/);
  if (parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(part))) {
    throw new Error(`COLOR_LUT_MALFORMED: invalid numeric value on line ${lineNo}.`);
  }
  const values = parts.map(Number);
  if (values.some((v) => !Number.isFinite(v))) throw new Error(`COLOR_LUT_MALFORMED: non-finite value on line ${lineNo}.`);
  return values;
}

/**
 * Parse text 3DL lattice files, including optional `3DMESH` / `Mesh` headers.
 * Source rows are blue-fastest by default. Integer output code values are
 * normalized by the declared bit depth, `outputMax`, or an inferred bit depth
 * (the latter emits COLOR_LUT_OUTPUT_RANGE_INFERRED). Input lattice values may
 * be uneven; sampling below respects them rather than silently treating them as
 * uniformly spaced. Unknown directives are rejected.
 */
export function parse3DLCube(text: string, options: Parse3DLOptions = {}): ColorLut3D {
  const limit = sizeLimit(options.maxSize);
  const maxBytes = options.maxBytes ?? MAX_3DL_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_3DL_BYTES) {
    throw new RangeError(`COLOR_LUT_LIMIT: maxBytes must be between 1 and ${MAX_3DL_BYTES}.`);
  }
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RangeError("COLOR_LUT_LIMIT: source exceeds maxBytes.");
  }
  if (options.rowOrder !== undefined && options.rowOrder !== "blue-fastest" && options.rowOrder !== "red-fastest") {
    throw new Error("COLOR_LUT_ORDER: unknown source row order.");
  }
  let declaredBits: number | undefined;
  let declaredSize: number | undefined;
  const numeric: number[][] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.split("#", 1)[0]!.trim();
    if (!line) continue;
    if (/^3DMESH$/i.test(line)) continue;
    const mesh = /^Mesh\s+(\d+)\s+(\d+)$/i.exec(line);
    if (mesh) {
      if (declaredBits !== undefined) throw new Error("COLOR_LUT_MALFORMED: duplicate Mesh header.");
      const exponent = Number(mesh[1]);
      declaredBits = Number(mesh[2]);
      if (!Number.isInteger(exponent) || exponent < 1 || exponent > 6 || declaredBits < 1 || declaredBits > 24) {
        throw new Error("COLOR_LUT_MALFORMED: invalid Mesh grid exponent or output bit depth.");
      }
      declaredSize = 2 ** exponent + 1;
      continue;
    }
    if (/^[a-z]/i.test(line)) throw new Error(`COLOR_LUT_UNSUPPORTED_DIRECTIVE: ${line.slice(0, 80)}.`);
    numeric.push(finiteParts(line, index + 1));
    if (numeric.length > limit ** 3 + 1) throw new RangeError("COLOR_LUT_LIMIT: too many rows.");
  }
  if (numeric.length < 2) throw new Error("COLOR_LUT_MALFORMED: missing grid or RGB rows.");
  // The first numeric row is the input shaper grid. Its length establishes
  // the cube size, including the otherwise ambiguous three-value grid.
  const grid = numeric[0]!;
  const size = grid.length;
  validateSize(size, limit);
  if (declaredSize !== undefined && declaredSize !== size) {
    throw new Error(`COLOR_LUT_MALFORMED: Mesh declares ${declaredSize} grid points, found ${size}.`);
  }
  if (grid.some((v, i) => i > 0 && v <= grid[i - 1]!)) {
    throw new Error("COLOR_LUT_GRID: input lattice must be strictly increasing.");
  }
  if (numeric.length - 1 !== size ** 3 || numeric.slice(1).some((row) => row.length !== 3)) {
    throw new Error(`COLOR_LUT_MALFORMED: expected ${size ** 3} RGB rows after the input lattice.`);
  }
  const domainMin = options.domainMin ?? [0, 0, 0];
  const domainMax = options.domainMax ?? [1, 1, 1];
  validateDomain(domainMin, domainMax);
  const maximum = numeric.slice(1).reduce((max, row) => Math.max(max, ...row), 0);
  if (numeric.slice(1).some((row) => row.some((v) => v < 0))) {
    throw new Error("COLOR_LUT_RANGE: 3DL code values must be non-negative.");
  }
  let scale = options.outputMax;
  const diagnostics: ColorLutDiagnostic[] = [];
  if (scale === undefined && declaredBits !== undefined) scale = 2 ** declaredBits - 1;
  if (scale === undefined) {
    scale = maximum <= 1 ? 1 : 2 ** Math.ceil(Math.log2(maximum + 1)) - 1;
    if (maximum > 1) diagnostics.push({ code: "COLOR_LUT_OUTPUT_RANGE_INFERRED", message: `Output maximum ${scale} was inferred; supply outputMax for a known range.` });
  }
  if (!Number.isFinite(scale) || scale <= 0 || maximum > scale) {
    throw new RangeError("COLOR_LUT_RANGE: outputMax must be positive and cover every code value.");
  }
  const data = new Float32Array(size ** 3 * 4);
  const order = options.rowOrder ?? "blue-fastest";
  for (let i = 0; i < size ** 3; i += 1) {
    const r = order === "red-fastest" ? i % size : Math.floor(i / (size * size));
    const g = Math.floor(i / size) % size;
    const b = order === "red-fastest" ? Math.floor(i / (size * size)) : i % size;
    const offset = (r + size * (g + size * b)) * 4;
    const row = numeric[i + 1]!;
    data[offset] = row[0]! / scale;
    data[offset + 1] = row[1]! / scale;
    data[offset + 2] = row[2]! / scale;
    data[offset + 3] = 1;
  }
  const width = grid[size - 1]! - grid[0]!;
  const inputGrid = grid.map((value) => (value - grid[0]!) / width);
  return { size, data, domainMin, domainMax, inputGrid, diagnostics };
}

/** Construct a 3D LUT from a decoded tile image (blue slices left-to-right, then top-to-bottom). */
export function colorLutFromImage(options: ImageLutOptions): ColorLut3D {
  const { size, width, height, pixels } = options;
  validateSize(size, sizeLimit(options.maxSize));
  const channels = options.channels ?? 4;
  const columns = options.columns ?? size;
  if ((channels !== 3 && channels !== 4) || !Number.isInteger(columns) || columns < 1 || columns > size) {
    throw new Error("COLOR_LUT_IMAGE_LAYOUT: invalid channel count or tile columns.");
  }
  const tileRows = Math.ceil(size / columns);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width !== columns * size || height !== tileRows * size || pixels.length !== width * height * channels) {
    throw new Error("COLOR_LUT_IMAGE_LAYOUT: dimensions or pixel count do not match the tile layout.");
  }
  const domainMin = options.domainMin ?? [0, 0, 0];
  const domainMax = options.domainMax ?? [1, 1, 1];
  validateDomain(domainMin, domainMax);
  const denominator = pixels instanceof Uint16Array ? 65535 : pixels instanceof Float32Array ? 1 : 255;
  const data = new Float32Array(size ** 3 * 4);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const x = (b % columns) * size + r;
        const row = Math.floor(b / columns) * size + g;
        const y = options.flipY ? height - 1 - row : row;
        const source = (y * width + x) * channels;
        const target = (r + size * (g + size * b)) * 4;
        for (let c = 0; c < 3; c += 1) {
          const value = pixels[source + c]! / denominator;
          if (!Number.isFinite(value)) throw new Error("COLOR_LUT_IMAGE_VALUE: pixel channels must be finite.");
          data[target + c] = value;
        }
        data[target + 3] = 1;
      }
    }
  }
  return { size, data, domainMin, domainMax, inputGrid: Array.from({ length: size }, (_, i) => i / (size - 1)), diagnostics: [] };
}

/** Trilinear interpolation, clamping outside the source domain. */
export function sampleColorLut(lut: ColorLut3D, color: LutColor): LutColor {
  validateSize(lut.size, MAX_SIZE);
  validateDomain(lut.domainMin, lut.domainMax);
  if (lut.data.length !== lut.size ** 3 * 4 || lut.inputGrid.length !== lut.size ||
      lut.inputGrid.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= lut.inputGrid[i - 1]!)) ||
      lut.inputGrid[0] !== 0 || lut.inputGrid[lut.size - 1] !== 1 ||
      color.length !== 3 || color.some((v) => !Number.isFinite(v))) {
    throw new Error("COLOR_LUT_INVALID: invalid data, grid or input color.");
  }
  const lower: number[] = [];
  const weights: number[] = [];
  for (let c = 0; c < 3; c += 1) {
    const value = Math.max(0, Math.min(1, (color[c]! - lut.domainMin[c]!) / (lut.domainMax[c]! - lut.domainMin[c]!)));
    let low = 0;
    let high = lut.size - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (lut.inputGrid[middle]! <= value) low = middle;
      else high = middle;
    }
    lower.push(low);
    weights.push((value - lut.inputGrid[low]!) / (lut.inputGrid[high]! - lut.inputGrid[low]!));
  }
  const result: [number, number, number] = [0, 0, 0];
  for (let z = 0; z < 2; z += 1) for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) {
    const factor = (x ? weights[0]! : 1 - weights[0]!) * (y ? weights[1]! : 1 - weights[1]!) * (z ? weights[2]! : 1 - weights[2]!);
    const offset = (lower[0]! + x + lut.size * (lower[1]! + y + lut.size * (lower[2]! + z))) * 4;
    for (let c = 0; c < 3; c += 1) {
      const value = lut.data[offset + c]!;
      if (!Number.isFinite(value)) throw new Error("COLOR_LUT_INVALID: table contains non-finite values.");
      result[c] += value * factor;
    }
  }
  return result;
}

/** Bake the table into the uniform, [0,1]-domain RGBA texture used by Aura3D's display LUT. */
export function bakeColorLutTexture(lut: ColorLut3D, size = lut.size): { readonly size: number; readonly data: Float32Array } {
  validateSize(size, MAX_SIZE);
  const data = new Float32Array(size ** 3 * 4);
  for (let b = 0; b < size; b += 1) for (let g = 0; g < size; g += 1) for (let r = 0; r < size; r += 1) {
    const sample = sampleColorLut(lut, [r / (size - 1), g / (size - 1), b / (size - 1)]);
    const offset = (r + size * (g + size * b)) * 4;
    data.set([...sample, 1], offset);
  }
  return { size, data };
}

/** An opt-in 3DL asset adapter using the shared request, integrity and cancellation policy. */
export class ColorLutLoader implements AssetLoader<ColorLut3D> {
  readonly type = "3dl";
  constructor(private readonly options: Parse3DLOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return request.type === this.type || /\.3dl(?:[?#]|$)/i.test(request.url); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<ColorLut3D> {
    const options = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const maxBytes = Math.min(options.maxBytes ?? MAX_3DL_BYTES, this.options.maxBytes ?? MAX_3DL_BYTES, MAX_3DL_BYTES);
    context.throwIfAborted(request.url);
    const bytes = await fetchBytes(request.url, context.signalFor(request.signal), request.onProgress ? (progress) => request.onProgress!({
      url: request.url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {})
    }) : undefined, { ...options, maxBytes });
    context.throwIfAborted(request.url);
    return parse3DLCube(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { ...this.options, maxBytes });
  }
}

export interface DecodedColorLutImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
  readonly channels?: 3 | 4;
}

export interface ImageColorLutLoaderOptions extends Omit<ImageLutOptions, "width" | "height" | "pixels" | "channels"> {
  /** Independently provided decoder; must enforce its own pre-decode dimension/allocation limits. */
  readonly decodeImage: (bytes: ArrayBuffer, url: string, signal?: AbortSignal) => Promise<DecodedColorLutImage> | DecodedColorLutImage;
  readonly maxBytes?: number;
}

/**
 * Explicitly-selected image LUT adapter. The injected image decoder makes codec
 * and color-space choices explicit, and returns owned raw pixels (not a DOM canvas).
 */
export class ImageColorLutLoader implements AssetLoader<ColorLut3D> {
  readonly type = "lut-image";
  constructor(private readonly options: ImageColorLutLoaderOptions) {
    validateSize(options.size, sizeLimit(options.maxSize));
    if (typeof options.decodeImage !== "function") throw new TypeError("COLOR_LUT_IMAGE_DECODER: decoder is required.");
  }
  canLoad(request: AssetLoadRequest): boolean { return request.type === this.type; }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<ColorLut3D> {
    const options = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const maxBytes = Math.min(options.maxBytes ?? MAX_3DL_BYTES, this.options.maxBytes ?? MAX_3DL_BYTES, MAX_3DL_BYTES);
    const signal = context.signalFor(request.signal);
    context.throwIfAborted(request.url);
    const bytes = await fetchBytes(request.url, signal, request.onProgress ? (progress) => request.onProgress!({
      url: request.url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {})
    }) : undefined, { ...options, maxBytes });
    const decoded = await this.options.decodeImage(bytes, request.url, signal);
    context.throwIfAborted(request.url);
    if (signal?.aborted) throw signal.reason ?? new Error("COLOR_LUT_ABORTED: request was aborted.");
    return colorLutFromImage({ ...this.options, ...decoded });
  }
}

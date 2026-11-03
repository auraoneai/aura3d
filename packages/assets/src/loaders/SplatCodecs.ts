/**
 * Bundled, independently authored Aura3D decoders for the two Gaussian splat
 * containers that have no formal standard: KSPLAT and the chunk-quantized
 * ("compressed") PLY. Both are implemented from the wire layouts written out
 * below, not from another engine's source. Interoperability with third-party
 * producers is limited to exactly these layouts; any other variant is rejected
 * with a stable diagnostic instead of being guessed.
 *
 * Decoders allocate through the caller-supplied `allocate` callback, which
 * enforces maxPoints and maxDecodedBytes before any per-splat array exists,
 * and return unvalidated data that the loader passes to validateGaussianSplat.
 */

export interface SplatCodecTarget {
  readonly count: number;
  readonly shDegree: 0 | 1 | 2 | 3 | 4;
  readonly positions: Float32Array;
  readonly scales: Float32Array;
  /** x, y, z, w. */
  readonly rotations: Float32Array;
  readonly colors: Float32Array;
  readonly opacities: Float32Array;
  /** Per point, coefficient-major RGB triples, excluding degree zero. */
  readonly sphericalHarmonics?: Float32Array;
}
export type SplatAllocate = (count: number, degree: 0 | 1 | 2 | 3) => SplatCodecTarget;

/** Stable error type for the bundled splat codecs; `code` never changes for a given failure. */
export class SplatCodecError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "SplatCodecError";
  }
}
function fail(code: string, message: string): never { throw new SplatCodecError(code, message); }
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}
const SH_PER_DEGREE: Readonly<Record<number, number>> = { 0: 0, 1: 9, 2: 24, 3: 45 };

function halfFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1, exponent = bits >>> 10 & 31, fraction = bits & 1023;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * (exponent ? 1 + fraction / 1024 : fraction / 1024) * 2 ** (exponent ? exponent - 15 : -14);
}
function finite(value: number, what: string): number {
  if (!Number.isFinite(value)) fail("KSPLAT_NON_FINITE", `${what} is not finite`);
  return value;
}

/*
 * Compressed PLY wire layout implemented here (binary_little_endian 1.0 only):
 *
 *   element chunk C        float properties, any order:
 *                            min_x min_y min_z max_x max_y max_z
 *                            min_scale_x min_scale_y min_scale_z max_scale_x max_scale_y max_scale_z
 *                            optional, all six or none: min_r min_g min_b max_r max_g max_b
 *   element vertex N       uint properties, exactly: packed_position packed_rotation packed_scale packed_color
 *   element sh N           optional; uchar f_rest_0 .. f_rest_{K-1}, K in {9, 24, 45}
 *
 * C must equal ceil(N / 256): vertex i belongs to chunk floor(i / 256).
 * Bodies are the element rows concatenated in header order, no trailing bytes.
 *
 *   unorm(v, bits) = v / (2^bits - 1)
 *   packed_position / packed_scale: 11-10-11 bits, x = bits 21..31, y = bits 11..20, z = bits 0..10;
 *     position = lerp(chunk min, chunk max, unorm); scale = exp(lerp(chunk min_scale, max_scale, unorm))
 *     (chunk scale bounds are natural-log scales).
 *   packed_color: 8-8-8-8, r = bits 24..31, g = 16..23, b = 8..15, a = 0..7.
 *     RGB is the reconstructed degree-zero colour (0.5 + C0 * f_dc); it is lerped
 *     in the chunk colour bounds when present, else used directly. a is opacity
 *     after the logistic function.
 *   packed_rotation: "smallest three", 2-10-10-10. Bits 30..31 hold the index
 *     (0..3, in x, y, z, w order) of the omitted largest component, assumed
 *     non-negative. The three remaining components, in ascending index order,
 *     occupy bits 20..29, 10..19 and 0..9 as unorm(v, 10) mapped from
 *     [-1/sqrt(2), 1/sqrt(2)]: c = (unorm - 0.5) * sqrt(2). The omitted
 *     component is sqrt(max(0, 1 - sum of squares)).
 *   sh f_rest_k: channel-major like ordinary PLY (all red coefficients, then
 *     green, then blue); value = (u / 255 - 0.5) * 8.
 */

export interface CompressedPlyHeaderElement {
  readonly name: string;
  readonly count: number;
  readonly properties: readonly ({ readonly name: string; readonly scalar: string } | { readonly name: string; readonly count: string; readonly item: string })[];
}

const CHUNK_REQUIRED = ["min_x", "min_y", "min_z", "max_x", "max_y", "max_z", "min_scale_x", "min_scale_y", "min_scale_z", "max_scale_x", "max_scale_y", "max_scale_z"];
const CHUNK_COLOR = ["min_r", "min_g", "min_b", "max_r", "max_g", "max_b"];
const PACKED = ["packed_position", "packed_rotation", "packed_scale", "packed_color"];

export function decodeCompressedPly(
  bytes: Uint8Array,
  bodyOffset: number,
  format: string,
  elements: readonly CompressedPlyHeaderElement[],
  allocate: SplatAllocate,
  signal?: AbortSignal
): SplatCodecTarget {
  if (format !== "binary_little_endian") fail("COMPRESSED_PLY_UNSUPPORTED_ENCODING", `compressed PLY must be binary_little_endian, not ${format}`);
  const allowed = new Set(["chunk", "vertex", "sh"]);
  for (const element of elements) {
    if (!allowed.has(element.name)) fail("COMPRESSED_PLY_UNSUPPORTED_ELEMENT", `unexpected element ${element.name}`);
    if (elements.filter((other) => other.name === element.name).length !== 1) fail("COMPRESSED_PLY_DUPLICATE_ELEMENT", `duplicate element ${element.name}`);
  }
  const chunk = elements.find((element) => element.name === "chunk")!;
  const vertex = elements.find((element) => element.name === "vertex")!;
  const sh = elements.find((element) => element.name === "sh");
  const scalarNames = (element: CompressedPlyHeaderElement, type: string): string[] => element.properties.map((property) => {
    if (!("scalar" in property) || property.scalar !== type) fail("COMPRESSED_PLY_PROPERTY_TYPE", `${element.name}.${property.name} must be a ${type} scalar`);
    return property.name;
  });
  const chunkNames = scalarNames(chunk, "float");
  const hasColor = CHUNK_COLOR.some((name) => chunkNames.includes(name));
  const expectedChunk = [...CHUNK_REQUIRED, ...(hasColor ? CHUNK_COLOR : [])];
  if (chunkNames.length !== expectedChunk.length || expectedChunk.some((name) => !chunkNames.includes(name))) {
    fail("COMPRESSED_PLY_CHUNK_LAYOUT", "chunk element must declare the position and scale bounds, plus all six colour bounds or none");
  }
  const vertexNames = scalarNames(vertex, "uint");
  if (vertexNames.length !== PACKED.length || PACKED.some((name) => !vertexNames.includes(name))) {
    fail("COMPRESSED_PLY_VERTEX_LAYOUT", "vertex element must declare exactly packed_position, packed_rotation, packed_scale and packed_color");
  }
  let degree: 0 | 1 | 2 | 3 = 0;
  let shNames: string[] = [];
  if (sh) {
    shNames = scalarNames(sh, "uchar");
    const found = ([1, 2, 3] as const).find((d) => SH_PER_DEGREE[d] === shNames.length);
    if (found === undefined || shNames.some((name, i) => name !== `f_rest_${i}`)) fail("COMPRESSED_PLY_SH_LAYOUT", "sh element must declare f_rest_0.. in order with 9, 24 or 45 uchar coefficients");
    if (sh.count !== vertex.count) fail("COMPRESSED_PLY_SH_LAYOUT", "sh element count must equal the vertex count");
    degree = found;
  }
  const n = vertex.count;
  if (n < 1) fail("COMPRESSED_PLY_EMPTY", "compressed PLY has no vertices");
  if (chunk.count !== Math.ceil(n / 256)) fail("COMPRESSED_PLY_CHUNK_COUNT", `expected ${Math.ceil(n / 256)} chunks for ${n} vertices, found ${chunk.count}`);
  const expectedBytes = chunk.count * chunkNames.length * 4 + n * 16 + (sh ? n * shNames.length : 0);
  if (bytes.length - bodyOffset < expectedBytes) fail("COMPRESSED_PLY_TRUNCATED", "compressed PLY body is truncated");
  if (bytes.length - bodyOffset > expectedBytes) fail("COMPRESSED_PLY_TRAILING_DATA", "unexpected trailing compressed PLY data");
  const data = allocate(n, degree);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Element bodies are laid out in header order.
  const offsets = new Map<string, number>();
  let cursor = bodyOffset;
  for (const element of elements) {
    offsets.set(element.name, cursor);
    cursor += element.count * (element.name === "chunk" ? chunkNames.length * 4 : element.name === "vertex" ? 16 : shNames.length);
  }
  const chunkStart = offsets.get("chunk")!, vertexStart = offsets.get("vertex")!, shStart = offsets.get("sh") ?? 0;
  const chunkField = chunkNames.map((name) => name);
  const chunkValues = new Float32Array(chunk.count * chunkNames.length);
  for (let c = 0; c < chunk.count; c++) for (let k = 0; k < chunkNames.length; k++) {
    const value = view.getFloat32(chunkStart + (c * chunkNames.length + k) * 4, true);
    if (!Number.isFinite(value)) fail("COMPRESSED_PLY_NON_FINITE", `chunk ${c} ${chunkField[k]} is not finite`);
    chunkValues[c * chunkNames.length + k] = value;
  }
  const field = (c: number, name: string): number => chunkValues[c * chunkNames.length + chunkNames.indexOf(name)]!;
  const vertexIndex = PACKED.map((name) => vertexNames.indexOf(name));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const coeff = SH_PER_DEGREE[degree]! / 3;
  for (let i = 0; i < n; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    const c = i >>> 8, row = vertexStart + i * 16;
    const read = (slot: number) => view.getUint32(row + vertexIndex[slot]! * 4, true);
    const position = read(0), rotation = read(1), scale = read(2), color = read(3);
    const p = i * 3, q = i * 4;
    const unpack111011 = (v: number) => [(v >>> 21 & 2047) / 2047, (v >>> 11 & 1023) / 1023, (v & 2047) / 2047] as const;
    const pt = unpack111011(position), st = unpack111011(scale);
    const axes = ["x", "y", "z"] as const;
    for (let j = 0; j < 3; j++) {
      data.positions[p + j] = lerp(field(c, `min_${axes[j]}`), field(c, `max_${axes[j]}`), pt[j]!);
      data.scales[p + j] = Math.exp(lerp(field(c, `min_scale_${axes[j]}`), field(c, `max_scale_${axes[j]}`), st[j]!));
    }
    const rgb = [(color >>> 24 & 255) / 255, (color >>> 16 & 255) / 255, (color >>> 8 & 255) / 255];
    const channels = ["r", "g", "b"] as const;
    for (let j = 0; j < 3; j++) data.colors[p + j] = hasColor ? lerp(field(c, `min_${channels[j]}`), field(c, `max_${channels[j]}`), rgb[j]!) : rgb[j]!;
    data.opacities[i] = (color & 255) / 255;
    const largest = rotation >>> 30;
    let sum = 0, slot = 0;
    for (let j = 0; j < 4; j++) {
      if (j === largest) continue;
      const value = ((rotation >>> (20 - slot * 10) & 1023) / 1023 - 0.5) * Math.SQRT2;
      data.rotations[q + j] = value; sum += value * value; slot++;
    }
    data.rotations[q + largest] = Math.sqrt(Math.max(0, 1 - sum));
    if (sh) {
      const shRow = shStart + i * shNames.length;
      for (let j = 0; j < 3; j++) for (let k = 0; k < coeff; k++) {
        data.sphericalHarmonics![i * coeff * 3 + k * 3 + j] = (bytes[shRow + j * coeff + k]! / 255 - 0.5) * 8;
      }
    }
  }
  return data;
}

/*
 * KSPLAT wire layout implemented here (version 0.1, all values little-endian):
 *
 *   Main header, 4096 bytes:
 *     u8  @0  versionMajor (0)       u8  @1  versionMinor (1)
 *     u32 @4  maxSectionCount        u32 @8  sectionCount
 *     u32 @12 maxSplatCount          u32 @16 splatCount
 *     u16 @20 compressionLevel (0, 1 or 2)
 *     f32 @24/28/32 scene centre (informational)
 *     f32 @36 minSphericalHarmonicsCoeff, f32 @40 maxSphericalHarmonicsCoeff (level 2 SH range)
 *   Section headers, 1024 bytes each, maxSectionCount of them:
 *     u32 @0  splatCount             u32 @4  maxSplatCount
 *     u32 @8  bucketSize             u32 @12 bucketCount
 *     f32 @16 bucketBlockSize        u16 @20 bucketStorageSizeBytes (12 = three f32 centres)
 *     u32 @24 compressionScaleRange  u32 @32 fullBucketCount
 *     u32 @36 partiallyFilledBucketCount
 *     u16 @40 sphericalHarmonicsDegree (0..3)
 *   Section bodies, in section order, starting at 4096 + maxSectionCount * 1024:
 *     partiallyFilledBucketCount u32 bucket lengths
 *     bucketCount bucket centres (bucketStorageSizeBytes each)
 *     maxSplatCount splat records; the first splatCount are valid.
 *   Splat record, fields in order (level 0 / levels 1-2):
 *     centre    3 x f32 absolute       / 3 x u16 q, position = (q - range) * (blockSize / 2 / range) + bucket centre
 *     scale     3 x f32 linear         / 3 x f16
 *     rotation  4 x f32 (w, x, y, z)   / 4 x f16 (w, x, y, z)
 *     colour    4 x u8 RGBA; RGB = degree-zero colour * 255, A = opacity * 255
 *     SH        K x f32 / K x f16 (level 1) / K x u8 (level 2, min + (max - min) * u / 255),
 *               K = 0, 9, 24, 45 for degree 0..3, coefficient-major RGB triples.
 *   Bucket of record j: j < fullBucketCount * bucketSize ? floor(j / bucketSize)
 *     : the partially filled bucket (after the full ones) whose running length covers j.
 */

const KSPLAT_HEADER = 4096;
const KSPLAT_SECTION_HEADER = 1024;

export interface KSplatLimits {
  readonly maxPoints: number;
  readonly maxDecodedBytes: number;
}

export function decodeKSplat(bytes: Uint8Array, limits: KSplatLimits, allocate: SplatAllocate, signal?: AbortSignal): SplatCodecTarget {
  if (bytes.length < KSPLAT_HEADER) fail("KSPLAT_TRUNCATED", "KSPLAT main header is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const major = bytes[0]!, minor = bytes[1]!;
  if (major !== 0 || minor !== 1) fail("KSPLAT_UNSUPPORTED_VERSION", `unsupported KSPLAT version ${major}.${minor}`);
  const maxSectionCount = view.getUint32(4, true), sectionCount = view.getUint32(8, true);
  const splatCount = view.getUint32(16, true), level = view.getUint16(20, true);
  if (level > 2) fail("KSPLAT_UNSUPPORTED_COMPRESSION", `unsupported KSPLAT compression level ${level}`);
  if (sectionCount < 1 || sectionCount > maxSectionCount) fail("KSPLAT_SECTION_COUNT", "KSPLAT section count is invalid");
  if (splatCount < 1 || splatCount > limits.maxPoints) fail("KSPLAT_POINT_LIMIT", `splat count exceeds limit or is empty: ${splatCount}`);
  if (KSPLAT_HEADER + maxSectionCount * KSPLAT_SECTION_HEADER > bytes.length) fail("KSPLAT_TRUNCATED", "KSPLAT section headers are truncated");
  const shMin = finite(view.getFloat32(36, true), "SH minimum"), shMax = finite(view.getFloat32(40, true), "SH maximum");
  const shBytes = level === 0 ? 4 : level === 1 ? 2 : 1;
  const base = level === 0 ? 12 + 12 + 16 + 4 : 6 + 6 + 8 + 4;
  interface Section { count: number; max: number; bucketSize: number; bucketCount: number; blockSize: number; bucketBytes: number; range: number; full: number; partial: number; degree: 0 | 1 | 2 | 3; start: number }
  const sections: Section[] = [];
  let offset = KSPLAT_HEADER + maxSectionCount * KSPLAT_SECTION_HEADER, total = 0, degree: 0 | 1 | 2 | 3 = 0;
  for (let s = 0; s < sectionCount; s++) {
    const h = KSPLAT_HEADER + s * KSPLAT_SECTION_HEADER;
    const shDegree = view.getUint16(h + 40, true);
    if (shDegree > 3) fail("KSPLAT_SH_DEGREE", `unsupported KSPLAT spherical-harmonic degree ${shDegree}`);
    const section: Section = {
      count: view.getUint32(h, true), max: view.getUint32(h + 4, true), bucketSize: view.getUint32(h + 8, true),
      bucketCount: view.getUint32(h + 12, true), blockSize: view.getFloat32(h + 16, true), bucketBytes: view.getUint16(h + 20, true),
      range: view.getUint32(h + 24, true), full: view.getUint32(h + 32, true), partial: view.getUint32(h + 36, true),
      degree: shDegree as 0 | 1 | 2 | 3, start: offset
    };
    if (section.count > section.max) fail("KSPLAT_SECTION_LAYOUT", `section ${s} splat count exceeds its capacity`);
    if (level > 0) {
      if (section.bucketBytes !== 12) fail("KSPLAT_SECTION_LAYOUT", `section ${s} bucket centres must be three float32 values`);
      if (section.range < 1 || !(section.blockSize > 0) || !Number.isFinite(section.blockSize)) fail("KSPLAT_SECTION_LAYOUT", `section ${s} has an invalid quantization range`);
      if (section.full + section.partial > section.bucketCount) fail("KSPLAT_SECTION_LAYOUT", `section ${s} bucket counts are inconsistent`);
      if (section.count > 0 && section.bucketSize < 1) fail("KSPLAT_SECTION_LAYOUT", `section ${s} bucket size is zero`);
    }
    const recordBytes = base + SH_PER_DEGREE[shDegree]! * shBytes;
    const size = section.partial * 4 + section.bucketCount * section.bucketBytes + section.max * recordBytes;
    if (!Number.isSafeInteger(size) || offset + size > bytes.length) fail("KSPLAT_TRUNCATED", `section ${s} body is truncated`);
    offset += size; total += section.count;
    if (shDegree > degree) degree = shDegree as 0 | 1 | 2 | 3;
    sections.push(section);
  }
  if (total !== splatCount) fail("KSPLAT_COUNT_MISMATCH", "section splat counts do not sum to the header splat count");
  if (offset !== bytes.length) fail("KSPLAT_TRAILING_DATA", "unexpected trailing KSPLAT data");
  if (splatCount * (14 + SH_PER_DEGREE[degree]!) * 4 > limits.maxDecodedBytes) fail("KSPLAT_DECODED_LIMIT", "splat decoded byte limit exceeded");
  const data = allocate(splatCount, degree);
  const outCoefficients = SH_PER_DEGREE[degree]!;
  let out = 0;
  for (const section of sections) {
    const recordBytes = base + SH_PER_DEGREE[section.degree]! * shBytes;
    const partialLengths: number[] = [];
    let covered = section.full * section.bucketSize;
    for (let b = 0; b < section.partial; b++) {
      const length = view.getUint32(section.start + b * 4, true);
      partialLengths.push(length); covered += length;
    }
    if (level > 0 && covered < section.count) fail("KSPLAT_SECTION_LAYOUT", "bucket lengths do not cover the section splats");
    const centres = section.start + section.partial * 4;
    const records = centres + section.bucketCount * section.bucketBytes;
    const scaleFactor = level > 0 ? section.blockSize / 2 / section.range : 0;
    let partialBucket = 0, partialEnd = section.full * section.bucketSize + (partialLengths[0] ?? 0);
    for (let j = 0; j < section.count; j++, out++) {
      if ((out & 16383) === 0) checkAbort(signal);
      const r = records + j * recordBytes, p = out * 3, q = out * 4;
      if (level === 0) {
        for (let k = 0; k < 3; k++) {
          data.positions[p + k] = view.getFloat32(r + k * 4, true);
          data.scales[p + k] = view.getFloat32(r + 12 + k * 4, true);
        }
        const w = view.getFloat32(r + 24, true);
        for (let k = 0; k < 3; k++) data.rotations[q + k] = view.getFloat32(r + 28 + k * 4, true);
        data.rotations[q + 3] = w;
      } else {
        let bucket: number;
        if (j < section.full * section.bucketSize) bucket = Math.floor(j / section.bucketSize);
        else {
          while (j >= partialEnd) { partialBucket++; partialEnd += partialLengths[partialBucket] ?? 0; }
          bucket = section.full + partialBucket;
        }
        const centre = centres + bucket * section.bucketBytes;
        for (let k = 0; k < 3; k++) {
          data.positions[p + k] = (view.getUint16(r + k * 2, true) - section.range) * scaleFactor + finite(view.getFloat32(centre + k * 4, true), "bucket centre");
          data.scales[p + k] = halfFloat(view.getUint16(r + 6 + k * 2, true));
        }
        const w = halfFloat(view.getUint16(r + 12, true));
        for (let k = 0; k < 3; k++) data.rotations[q + k] = halfFloat(view.getUint16(r + 14 + k * 2, true));
        data.rotations[q + 3] = w;
      }
      const colour = r + (level === 0 ? 40 : 20);
      for (let k = 0; k < 3; k++) data.colors[p + k] = bytes[colour + k]! / 255;
      data.opacities[out] = bytes[colour + 3]! / 255;
      const coefficients = SH_PER_DEGREE[section.degree]!;
      const sh = colour + 4;
      for (let k = 0; k < coefficients; k++) {
        const value = level === 0 ? view.getFloat32(sh + k * 4, true)
          : level === 1 ? halfFloat(view.getUint16(sh + k * 2, true))
          : shMin + (shMax - shMin) * bytes[sh + k]! / 255;
        data.sphericalHarmonics![out * outCoefficients + k] = value;
      }
      // Lower-degree sections leave their higher coefficients at zero.
    }
  }
  return data;
}

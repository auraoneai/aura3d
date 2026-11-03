/**
 * Numerical evidence for a narrowly scoped pair of ordinary WebGL2 unlit
 * triangle draws. This module never reads a RenderItem or a device and never
 * authorizes a submission. Its caller must supply private copies of the bytes
 * currently resident in the selected GPU buffers, the effective ordinary MVP
 * uniforms, and the actual raster state. It must revalidate those facts before
 * submitting, including pending uploads and context/resource generations.
 */

export interface StaticUnlitPairRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** An integer pixel rectangle with exclusive maximum coordinates. */
export interface StaticUnlitPairEnvelope {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface StaticUnlitPairPlanInput {
  /** Copies of the actual resident position and index buffer bytes. */
  readonly positions: Uint8Array;
  readonly indices: Uint8Array;
  /** Byte order used by the vertex and element fetches for these buffers. */
  readonly byteOrder: "little-endian" | "big-endian";
  readonly positionLayout: {
    readonly byteOffset: number;
    /** Zero denotes the WebGL tightly packed float32x3 stride. */
    readonly byteStride: number;
    readonly vertexCount: number;
  };
  readonly indexType: "uint16" | "uint32";
  /** Actual element draw byte offset, including the ordinary firstIndex. */
  readonly indexByteOffset: number;
  readonly indexCount: number;
  /** Two effective column-major float32 MVPs, in original draw order. */
  readonly effectiveMvpPair: Float32Array;
  readonly viewport: StaticUnlitPairRect;
  /** The enabled scissor, or null when scissor testing is disabled. */
  readonly scissor: StaticUnlitPairRect | null;
  /** VERTEX_SHADER/HIGH_FLOAT from the current context. */
  readonly vertexPrecision: {
    readonly precision: number;
    readonly rangeMin: number;
    readonly rangeMax: number;
  };
  /** Current WebGL SUBPIXEL_BITS. */
  readonly subpixelBits: number;
}

export type StaticUnlitPairFallbackReason =
  | "unsupported-precision"
  | "unsupported-raster"
  | "invalid-viewport"
  | "invalid-scissor"
  | "invalid-buffer"
  | "invalid-position-layout"
  | "invalid-index-range"
  | "invalid-position"
  | "invalid-mvp"
  | "unstable-transform"
  | "clipped-or-degenerate"
  | "empty-coverage"
  | "overlap";

export type StaticUnlitPairPlan =
  | { readonly kind: "disjoint"; readonly envelopes: readonly [StaticUnlitPairEnvelope, StaticUnlitPairEnvelope] }
  | { readonly kind: "fallback"; readonly reason: StaticUnlitPairFallbackReason };

type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Bounds = { readonly min: Vec3; readonly max: Vec3 };
type ByteView = { readonly buffer: ArrayBuffer; readonly byteOffset: number; readonly byteLength: number };

// Keep the viewport arithmetic in a range where float32 raster coordinate
// rounding is far below the two-pixel margin below. Large/unknown viewports
// remain ordinary draws. Bound the index scan as well as its memory source.
const MAX_RASTER_COORDINATE = 32768;
const MAX_INDEX_COUNT = 65536;
const MIN_CLIP_W = 1 / 1024;
const MAX_CLIP_TERM_SUM = 2 ** 120;
const PIXEL_MARGIN = 2;

// The supported highp shader has at least 23 fraction bits. A mat4/vec4
// multiply contains four products and three additions per component. This
// margin is over a thousand times one float32 ulp of the sum of absolute
// terms, covers either fused or separately rounded evaluation and flushed
// subnormals, and also covers the double-precision host calculation. Input
// magnitude is capped separately so no highp intermediate can overflow. The
// same bound is used for both the ordinary and derived pair shader; clipping
// and projection are declined unless the entire interval is well behaved.
const CLIP_ERROR_FACTOR = 2 ** -12;

const arrayBufferIsView = ArrayBuffer.isView;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const typedArrayByteOffset = getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const typedArrayByteLength = getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const typedArrayLength = getOwnPropertyDescriptor(typedArrayPrototype, "length")!.get!;
const arrayBufferByteLength = getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const DataViewIntrinsic = DataView;
const dataViewGetFloat32 = DataView.prototype.getFloat32;
const dataViewGetUint16 = DataView.prototype.getUint16;
const dataViewGetUint32 = DataView.prototype.getUint32;
const reflectApply = Reflect.apply;

function fallback(reason: StaticUnlitPairFallbackReason): StaticUnlitPairPlan {
  return { kind: "fallback", reason };
}

/** Reject proxies, shared views and custom typed-array accessors. */
function viewInfo(value: unknown, prototype: object): ByteView | null {
  if (!arrayBufferIsView(value) || getPrototypeOf(value) !== prototype) return null;
  if (["buffer", "byteOffset", "byteLength", "length"].some((name) => getOwnPropertyDescriptor(value, name) !== undefined)) return null;
  try {
    const buffer: unknown = reflectApply(typedArrayBuffer, value, []);
    // This native ArrayBuffer getter rejects SharedArrayBuffer. A copied
    // snapshot must not be writable concurrently while it is being scanned.
    reflectApply(arrayBufferByteLength, buffer, []);
    const byteOffset = reflectApply(typedArrayByteOffset, value, []) as number;
    const byteLength = reflectApply(typedArrayByteLength, value, []) as number;
    return { buffer: buffer as ArrayBuffer, byteOffset, byteLength };
  } catch {
    return null;
  }
}

function validRect(rect: StaticUnlitPairRect | null | undefined): rect is StaticUnlitPairRect {
  if (!rect || typeof rect !== "object") return false;
  const { x, y, width, height } = rect;
  return [x, y, width, height].every(Number.isSafeInteger)
    && width > 0 && height > 0
    && x >= -MAX_RASTER_COORDINATE && y >= -MAX_RASTER_COORDINATE
    && x + width <= MAX_RASTER_COORDINATE && y + height <= MAX_RASTER_COORDINATE;
}

function validPrecision(input: StaticUnlitPairPlanInput): boolean {
  const reported = input.vertexPrecision;
  if (!reported || typeof reported !== "object") return false;
  const { precision, rangeMin, rangeMax } = reported;
  return Number.isSafeInteger(precision) && precision >= 23
    && Number.isSafeInteger(rangeMin) && rangeMin >= 126
    && Number.isSafeInteger(rangeMax) && rangeMax >= 126;
}

function indexedBounds(input: StaticUnlitPairPlanInput, positionView: ByteView, indexView: ByteView): Bounds | StaticUnlitPairFallbackReason {
  if (!input.positionLayout || typeof input.positionLayout !== "object") return "invalid-position-layout";
  const { byteOffset, byteStride, vertexCount } = input.positionLayout;
  const stride = byteStride === 0 ? 12 : byteStride;
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset % 4 !== 0
    || !Number.isSafeInteger(stride) || stride < 12 || stride % 4 !== 0
    || !Number.isSafeInteger(vertexCount) || vertexCount <= 0) return "invalid-position-layout";

  const elementBytes = input.indexType === "uint16" ? 2 : input.indexType === "uint32" ? 4 : 0;
  const { indexByteOffset, indexCount } = input;
  if (elementBytes === 0 || !Number.isSafeInteger(indexByteOffset) || indexByteOffset < 0 || indexByteOffset % elementBytes !== 0
    || !Number.isSafeInteger(indexCount) || indexCount <= 0 || indexCount > MAX_INDEX_COUNT || indexCount % 3 !== 0
    || !Number.isSafeInteger(indexByteOffset + indexCount * elementBytes)
    || indexByteOffset + indexCount * elementBytes > indexView.byteLength) return "invalid-index-range";

  const littleEndian = input.byteOrder === "little-endian";
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  try {
    const positions = new DataViewIntrinsic(positionView.buffer, positionView.byteOffset, positionView.byteLength);
    const indices = new DataViewIntrinsic(indexView.buffer, indexView.byteOffset, indexView.byteLength);
    for (let i = 0; i < indexCount; i += 1) {
      const offset = indexByteOffset + i * elementBytes;
      const index = reflectApply(elementBytes === 2 ? dataViewGetUint16 : dataViewGetUint32, indices, [offset, littleEndian]) as number;
      const positionOffset = byteOffset + index * stride;
      if (index >= vertexCount || !Number.isSafeInteger(positionOffset) || positionOffset + 12 > positionView.byteLength) return "invalid-index-range";
      for (let axis = 0; axis < 3; axis += 1) {
        const coordinate = reflectApply(dataViewGetFloat32, positions, [positionOffset + axis * 4, littleEndian]) as number;
        if (!Number.isFinite(coordinate)) return "invalid-position";
        min[axis] = Math.min(min[axis]!, coordinate);
        max[axis] = Math.max(max[axis]!, coordinate);
      }
    }
  } catch {
    // A detached or otherwise invalid snapshot is not evidence for a draw.
    return "invalid-buffer";
  }
  return { min, max };
}

function projectedEnvelope(bounds: Bounds, matrices: Float32Array, matrixOffset: number, viewport: StaticUnlitPairRect): StaticUnlitPairEnvelope | StaticUnlitPairFallbackReason {
  const maxPosition: Vec3 = [
    Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])),
    Math.max(Math.abs(bounds.min[1]), Math.abs(bounds.max[1])),
    Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))
  ];
  const errors: Vec4 = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    let sum = Math.abs(matrices[matrixOffset + 12 + row]!);
    for (let axis = 0; axis < 3; axis += 1) sum += Math.abs(matrices[matrixOffset + axis * 4 + row]!) * maxPosition[axis]!;
    if (!Number.isFinite(sum) || sum > MAX_CLIP_TERM_SUM) return "unstable-transform";
    errors[row] = (1 + sum) * CLIP_ERROR_FACTOR;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    const position: Vec4 = [
      corner & 1 ? bounds.max[0] : bounds.min[0],
      corner & 2 ? bounds.max[1] : bounds.min[1],
      corner & 4 ? bounds.max[2] : bounds.min[2],
      1
    ];
    const clip: Vec4 = [0, 0, 0, 0];
    for (let row = 0; row < 4; row += 1) {
      for (let axis = 0; axis < 4; axis += 1) clip[row] += matrices[matrixOffset + axis * 4 + row]! * position[axis]!;
    }
    const wMin = clip[3] - errors[3];
    const wMax = clip[3] + errors[3];
    if (!Number.isFinite(wMin) || !Number.isFinite(wMax) || wMin <= MIN_CLIP_W) return "clipped-or-degenerate";
    for (let axis = 0; axis < 3; axis += 1) {
      if (!Number.isFinite(clip[axis]) || clip[axis]! - errors[axis]! <= -wMin || clip[axis]! + errors[axis]! >= wMin) {
        return "clipped-or-degenerate";
      }
    }

    // w is strictly positive for the entire box. A linear-fractional
    // coordinate over a box reaches its extrema at a corner. Evaluate both
    // interval endpoints of x/y and w to enclose rounding of each vertex.
    const xLow = clip[0] - errors[0], xHigh = clip[0] + errors[0];
    const yLow = clip[1] - errors[1], yHigh = clip[1] + errors[1];
    minX = Math.min(minX, xLow / wMin, xLow / wMax, xHigh / wMin, xHigh / wMax);
    maxX = Math.max(maxX, xLow / wMin, xLow / wMax, xHigh / wMin, xHigh / wMax);
    minY = Math.min(minY, yLow / wMin, yLow / wMax, yHigh / wMin, yHigh / wMax);
    maxY = Math.max(maxY, yLow / wMin, yLow / wMax, yHigh / wMin, yHigh / wMax);
  }

  return {
    minX: Math.floor(viewport.x + (minX + 1) * viewport.width / 2) - PIXEL_MARGIN,
    minY: Math.floor(viewport.y + (minY + 1) * viewport.height / 2) - PIXEL_MARGIN,
    maxX: Math.ceil(viewport.x + (maxX + 1) * viewport.width / 2) + PIXEL_MARGIN,
    maxY: Math.ceil(viewport.y + (maxY + 1) * viewport.height / 2) + PIXEL_MARGIN
  };
}

function intersectScissor(envelope: StaticUnlitPairEnvelope, scissor: StaticUnlitPairRect | null): StaticUnlitPairEnvelope {
  if (scissor === null) return envelope;
  return {
    minX: Math.max(envelope.minX, scissor.x),
    minY: Math.max(envelope.minY, scissor.y),
    maxX: Math.min(envelope.maxX, scissor.x + scissor.width),
    maxY: Math.min(envelope.maxY, scissor.y + scissor.height)
  };
}

/**
 * Scan the submitted indexed positions and conservatively enclose each
 * triangle draw in target pixels. Inputs are private backend-created records;
 * successful planning is evidence only and does not authorize rendering.
 */
export function planStaticUnlitPair(input: StaticUnlitPairPlanInput): StaticUnlitPairPlan {
  if (!validPrecision(input)) return fallback("unsupported-precision");
  if (!Number.isSafeInteger(input.subpixelBits) || input.subpixelBits < 4) return fallback("unsupported-raster");
  if (!validRect(input.viewport)) return fallback("invalid-viewport");
  if (input.scissor !== null && !validRect(input.scissor)) return fallback("invalid-scissor");
  if (input.byteOrder !== "little-endian" && input.byteOrder !== "big-endian") return fallback("invalid-buffer");
  const positionView = viewInfo(input.positions, Uint8Array.prototype);
  const indexView = viewInfo(input.indices, Uint8Array.prototype);
  if (!positionView || !indexView) return fallback("invalid-buffer");
  const matrixView = viewInfo(input.effectiveMvpPair, Float32Array.prototype);
  if (!matrixView || reflectApply(typedArrayLength, input.effectiveMvpPair, []) !== 32) return fallback("invalid-mvp");
  for (let i = 0; i < 32; i += 1) if (!Number.isFinite(input.effectiveMvpPair[i])) return fallback("invalid-mvp");

  const bounds = indexedBounds(input, positionView, indexView);
  if (typeof bounds === "string") return fallback(bounds);
  const first = projectedEnvelope(bounds, input.effectiveMvpPair, 0, input.viewport);
  if (typeof first === "string") return fallback(first);
  const second = projectedEnvelope(bounds, input.effectiveMvpPair, 16, input.viewport);
  if (typeof second === "string") return fallback(second);
  const a = intersectScissor(first, input.scissor);
  const b = intersectScissor(second, input.scissor);
  if (a.minX >= a.maxX || a.minY >= a.maxY || b.minX >= b.maxX || b.minY >= b.maxY) return fallback("empty-coverage");
  if (a.maxX > b.minX && b.maxX > a.minX && a.maxY > b.minY && b.maxY > a.minY) return fallback("overlap");
  const pair: [StaticUnlitPairEnvelope, StaticUnlitPairEnvelope] = [Object.freeze(a), Object.freeze(b)];
  return { kind: "disjoint", envelopes: Object.freeze(pair) };
}

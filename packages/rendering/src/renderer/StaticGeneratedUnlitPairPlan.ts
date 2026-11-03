import type { StaticUnlitPairEnvelope, StaticUnlitPairPlan, StaticUnlitPairPlanInput, StaticUnlitPairRect } from "./StaticUnlitPairPlan";

/**
 * Evidence inputs for two generated-unlit draws with the same indexed geometry.
 * The matrices are the effective float32 uniforms and AuraFrame value, not
 * authored values or a CPU-precomposed MVP. The backend must independently
 * authenticate the shader, buffer contents, raster state and frame, and
 * revalidate every snapshot before submitting a pair.
 */
export interface StaticGeneratedUnlitPairPlanInput extends Omit<StaticUnlitPairPlanInput, "effectiveMvpPair"> {
  readonly geometryMatrix: Float32Array;
  readonly modelMatrixPair: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
}

type Bounds = { min: [number, number, number]; max: [number, number, number] };
type Interval = { lo: number; hi: number };
type Interval4 = [Interval, Interval, Interval, Interval];
type BufferView = { buffer: ArrayBuffer; offset: number; byteLength: number; length: number };
type Failure = Extract<StaticUnlitPairPlan, { kind: "fallback" }>["reason"];

const MAX_COORDINATE = 32768;
const MAX_INDICES = 65536;
const MIN_W = 2 ** -10;
const MAX_STAGE_MAGNITUDE = 2 ** 120;
const RASTER_PADDING = 2;
// A row has four products and three additions. This margin is much larger than
// their highp binary32 rounding, including fused evaluation and host rounding.
// The absolute term also encloses flush-to-zero for subnormal inputs and ops.
const ROUNDING_FACTOR = 2 ** -12;
const ABSOLUTE_MARGIN = 2 ** -120;

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")!.get!;
const arrayBufferLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const isView = ArrayBuffer.isView;
const NativeDataView = DataView;
const readFloat32 = DataView.prototype.getFloat32;
const readUint16 = DataView.prototype.getUint16;
const readUint32 = DataView.prototype.getUint32;
const apply = Reflect.apply;

function rejected(reason: Failure): StaticUnlitPairPlan {
  return { kind: "fallback", reason };
}

/** A private non-shared ordinary typed-array view, without shadow accessors. */
function view(value: unknown, prototype: object): BufferView | undefined {
  if (!isView(value)) return undefined;
  try {
    if (Object.getPrototypeOf(value) !== prototype) return undefined;
    for (const key of ["buffer", "byteOffset", "byteLength", "length"]) {
      if (Object.getOwnPropertyDescriptor(value, key) !== undefined) return undefined;
    }
    const buffer = apply(bufferGetter, value, []) as ArrayBuffer;
    apply(arrayBufferLengthGetter, buffer, []); // rejects SharedArrayBuffer
    return {
      buffer,
      offset: apply(offsetGetter, value, []) as number,
      byteLength: apply(byteLengthGetter, value, []) as number,
      length: apply(lengthGetter, value, []) as number
    };
  } catch { return undefined; }
}

function matrix(value: unknown, expectedLength: number): value is Float32Array {
  const info = view(value, Float32Array.prototype);
  if (!info || info.length !== expectedLength) return false;
  const values = value as Float32Array;
  for (let index = 0; index < expectedLength; index += 1) {
    if (!Number.isFinite(values[index])) return false;
  }
  return true;
}

function rectangle(value: StaticUnlitPairRect | null | undefined): value is StaticUnlitPairRect {
  if (!value || typeof value !== "object") return false;
  const { x, y, width, height } = value;
  return [x, y, width, height].every(Number.isSafeInteger)
    && width > 0 && height > 0 && x >= -MAX_COORDINATE && y >= -MAX_COORDINATE
    && x + width <= MAX_COORDINATE && y + height <= MAX_COORDINATE;
}

function indexedBounds(input: StaticGeneratedUnlitPairPlanInput, positions: BufferView, indices: BufferView): Bounds | Failure {
  const layout = input.positionLayout;
  if (!layout || typeof layout !== "object") return "invalid-position-layout";
  const stride = layout.byteStride === 0 ? 12 : layout.byteStride;
  if (!Number.isSafeInteger(layout.byteOffset) || layout.byteOffset < 0 || layout.byteOffset % 4 !== 0
    || !Number.isSafeInteger(stride) || stride < 12 || stride % 4 !== 0
    || !Number.isSafeInteger(layout.vertexCount) || layout.vertexCount <= 0) return "invalid-position-layout";
  const size = input.indexType === "uint16" ? 2 : input.indexType === "uint32" ? 4 : 0;
  if (size === 0 || !Number.isSafeInteger(input.indexByteOffset) || input.indexByteOffset < 0 || input.indexByteOffset % size !== 0
    || !Number.isSafeInteger(input.indexCount) || input.indexCount <= 0 || input.indexCount > MAX_INDICES || input.indexCount % 3 !== 0
    || !Number.isSafeInteger(input.indexByteOffset + input.indexCount * size)
    || input.indexByteOffset + input.indexCount * size > indices.byteLength) return "invalid-index-range";

  try {
    const vertexData = new NativeDataView(positions.buffer, positions.offset, positions.byteLength);
    const indexData = new NativeDataView(indices.buffer, indices.offset, indices.byteLength);
    const little = input.byteOrder === "little-endian";
    const bounds: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let element = 0; element < input.indexCount; element += 1) {
      const byteOffset = input.indexByteOffset + element * size;
      const vertex = apply(size === 2 ? readUint16 : readUint32, indexData, [byteOffset, little]) as number;
      const address = layout.byteOffset + vertex * stride;
      if (vertex >= layout.vertexCount || !Number.isSafeInteger(address) || address + 12 > positions.byteLength) return "invalid-index-range";
      for (let component = 0; component < 3; component += 1) {
        const value = apply(readFloat32, vertexData, [address + 4 * component, little]) as number;
        if (!Number.isFinite(value)) return "invalid-position";
        if (Math.abs(value) > MAX_STAGE_MAGNITUDE) return "unstable-transform";
        bounds.min[component] = Math.min(bounds.min[component]!, value);
        bounds.max[component] = Math.max(bounds.max[component]!, value);
      }
    }
    return bounds;
  } catch { return "invalid-buffer"; }
}

/** Enclose one component product, including uncertain matrix coefficients. */
function product(a: Interval, b: Interval): Interval {
  const p0 = a.lo * b.lo, p1 = a.lo * b.hi, p2 = a.hi * b.lo, p3 = a.hi * b.hi;
  return { lo: Math.min(p0, p1, p2, p3), hi: Math.max(p0, p1, p2, p3) };
}

/**
 * Interval matrix-vector multiplication. `identityProduct` additionally
 * encloses the shader's `model * mat4(1.0)` matrix multiplication. Coefficient
 * margins also cover hardware flushing subnormal uniform values to zero.
 */
function transform(values: Float32Array, offset: number, input: Interval4, identityProduct: boolean): Interval4 | undefined {
  const output: Interval[] = [];
  for (let row = 0; row < 4; row += 1) {
    let low = 0, high = 0, sumMagnitude = 0;
    for (let column = 0; column < 4; column += 1) {
      const coefficient = values[offset + column * 4 + row]!;
      if (Math.abs(coefficient) > MAX_STAGE_MAGNITUDE) return undefined;
      const coefficientError = (identityProduct ? Math.abs(coefficient) * ROUNDING_FACTOR : 0) + ABSOLUTE_MARGIN;
      const term = product({ lo: coefficient - coefficientError, hi: coefficient + coefficientError }, input[column]!);
      const magnitude = Math.max(Math.abs(term.lo), Math.abs(term.hi));
      if (!Number.isFinite(magnitude) || magnitude > MAX_STAGE_MAGNITUDE) return undefined;
      sumMagnitude += magnitude;
      low += term.lo;
      high += term.hi;
    }
    if (!Number.isFinite(sumMagnitude) || sumMagnitude > MAX_STAGE_MAGNITUDE) return undefined;
    const error = sumMagnitude * ROUNDING_FACTOR + ABSOLUTE_MARGIN;
    if (!Number.isFinite(low - error) || !Number.isFinite(high + error)) return undefined;
    output.push({ lo: low - error, hi: high + error });
  }
  return output as Interval4;
}

/** Enclose either retained or optimized-away multiplication by identity. */
function throughIdentity(input: Interval4): Interval4 {
  return input.map(({ lo, hi }) => {
    const error = Math.max(Math.abs(lo), Math.abs(hi)) * ROUNDING_FACTOR + ABSOLUTE_MARGIN;
    return { lo: lo - error, hi: hi + error };
  }) as Interval4;
}

function projectedEnvelope(
  bounds: Bounds, geometry: Float32Array, models: Float32Array, modelOffset: number,
  viewProjection: Float32Array, viewport: StaticUnlitPairRect
): StaticUnlitPairEnvelope | Failure {
  const position: Interval4 = [
    { lo: bounds.min[0] - ABSOLUTE_MARGIN, hi: bounds.max[0] + ABSOLUTE_MARGIN },
    { lo: bounds.min[1] - ABSOLUTE_MARGIN, hi: bounds.max[1] + ABSOLUTE_MARGIN },
    { lo: bounds.min[2] - ABSOLUTE_MARGIN, hi: bounds.max[2] + ABSOLUTE_MARGIN },
    { lo: 1, hi: 1 }
  ];
  const local = transform(geometry, 0, position, false);
  if (!local) return "unstable-transform";
  const world = transform(models, modelOffset, throughIdentity(local), true);
  if (!world) return "unstable-transform";
  const clip = transform(viewProjection, 0, world, false);
  if (!clip) return "unstable-transform";
  const w = clip[3];
  if (w.lo <= MIN_W) return "clipped-or-degenerate";
  for (let axis = 0; axis < 3; axis += 1) {
    if (clip[axis]!.lo <= -w.lo || clip[axis]!.hi >= w.lo) return "clipped-or-degenerate";
  }
  const projected = (axis: Interval): readonly [number, number] => {
    const values = [axis.lo / w.lo, axis.lo / w.hi, axis.hi / w.lo, axis.hi / w.hi];
    return [Math.min(...values), Math.max(...values)];
  };
  const x = projected(clip[0]), y = projected(clip[1]);
  return {
    minX: Math.floor(viewport.x + (x[0] + 1) * viewport.width / 2) - RASTER_PADDING,
    minY: Math.floor(viewport.y + (y[0] + 1) * viewport.height / 2) - RASTER_PADDING,
    maxX: Math.ceil(viewport.x + (x[1] + 1) * viewport.width / 2) + RASTER_PADDING,
    maxY: Math.ceil(viewport.y + (y[1] + 1) * viewport.height / 2) + RASTER_PADDING
  };
}

function applyScissor(bounds: StaticUnlitPairEnvelope, scissor: StaticUnlitPairRect | null): StaticUnlitPairEnvelope {
  if (!scissor) return bounds;
  return {
    minX: Math.max(bounds.minX, scissor.x), minY: Math.max(bounds.minY, scissor.y),
    maxX: Math.min(bounds.maxX, scissor.x + scissor.width), maxY: Math.min(bounds.maxY, scissor.y + scissor.height)
  };
}

/** Pure conservative screen-space evidence; a successful plan is not permission to draw. */
export function planStaticGeneratedUnlitPair(input: StaticGeneratedUnlitPairPlanInput): StaticUnlitPairPlan {
  try {
    const precision = input.vertexPrecision;
    if (!precision || !Number.isSafeInteger(precision.precision) || precision.precision < 23
      || !Number.isSafeInteger(precision.rangeMin) || precision.rangeMin < 126
      || !Number.isSafeInteger(precision.rangeMax) || precision.rangeMax < 126) return rejected("unsupported-precision");
    if (!Number.isSafeInteger(input.subpixelBits) || input.subpixelBits < 4) return rejected("unsupported-raster");
    if (!rectangle(input.viewport)) return rejected("invalid-viewport");
    if (input.scissor !== null && !rectangle(input.scissor)) return rejected("invalid-scissor");
    if (input.byteOrder !== "little-endian" && input.byteOrder !== "big-endian") return rejected("invalid-buffer");
    const positions = view(input.positions, Uint8Array.prototype), indices = view(input.indices, Uint8Array.prototype);
    if (!positions || !indices) return rejected("invalid-buffer");
    if (!matrix(input.geometryMatrix, 16) || !matrix(input.modelMatrixPair, 32) || !matrix(input.viewProjectionMatrix, 16)) {
      return rejected("invalid-mvp");
    }
    const bounds = indexedBounds(input, positions, indices);
    if (typeof bounds === "string") return rejected(bounds);
    const first = projectedEnvelope(bounds, input.geometryMatrix, input.modelMatrixPair, 0, input.viewProjectionMatrix, input.viewport);
    if (typeof first === "string") return rejected(first);
    const second = projectedEnvelope(bounds, input.geometryMatrix, input.modelMatrixPair, 16, input.viewProjectionMatrix, input.viewport);
    if (typeof second === "string") return rejected(second);
    const a = applyScissor(first, input.scissor), b = applyScissor(second, input.scissor);
    if (a.minX >= a.maxX || a.minY >= a.maxY || b.minX >= b.maxX || b.minY >= b.maxY) return rejected("empty-coverage");
    if (a.maxX > b.minX && b.maxX > a.minX && a.maxY > b.minY && b.maxY > a.minY) return rejected("overlap");
    const envelopes: [StaticUnlitPairEnvelope, StaticUnlitPairEnvelope] = [Object.freeze(a), Object.freeze(b)];
    return { kind: "disjoint", envelopes: Object.freeze(envelopes) };
  } catch {
    // Invalid, detached or otherwise unreadable evidence never grants a pair.
    return rejected("invalid-buffer");
  }
}

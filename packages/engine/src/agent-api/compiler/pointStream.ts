// E6-00 §4 typed point path (gaps P-01, P-02, U-06): the engine-owned CPU mirror + GPU geometry of one
// `points.stream` node, and a typed builder for static `points()` clouds.
//
// Invariants (covered by tests/unit/agent-api/point-stream.test.ts):
//  - the VertexBuffer, Geometry and (lazily) the lease staging arrays are allocated once; a write allocates nothing
//    proportional to N and never re-creates a GPU resource;
//  - a write marks exactly the touched byte range dirty, so the renderer uploads only that range;
//  - the CPU mirror is the source of truth: after context loss / device generation change `VertexBuffer.upload`
//    re-creates the GPU buffer from it;
//  - bounds are exact (replace) or conservative (partial write grows them): a visible cloud is never culled by stale bounds.

import { Geometry, VertexBuffer, VertexFormat } from "@aura3d/rendering";
import type { AuraRuntimeNodeHandle } from "../nodes/types.js";
import type {
  AuraPointStreamDirtyRange,
  AuraPointStreamLease,
  AuraPointStreamNodeSpec,
  AuraPointStreamStats,
  AuraPointStreamWriteOptions
} from "../nodes/pointStream.js";

type ColorSource = Uint8Array | Uint8ClampedArray | Uint32Array | Float32Array;
type Layout = "none" | "u8" | "f32";

const FORMAT_P3 = VertexFormat.P3;
const FORMAT_P3_C4U8 = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "color", components: 4, offset: 12, type: "uint8", normalized: true }
], 16);
const FORMAT_P3_C4F32 = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "color", components: 4, offset: 12 }
]);

/** sRGB byte -> linear [0, 1]. */
const SRGB_TO_LINEAR = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();
const SRGB_TO_LINEAR_U8 = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) table[i] = Math.round(SRGB_TO_LINEAR[i]! * 255);
  return table;
})();

export interface PointStreamControllerOptions {
  /** `"webgpu"` stores colors as f32x4 (the layout the native point-quad path is verified with). */
  readonly backend?: string;
}

const streamControllers = new WeakMap<object, PointStreamController>();

/** The controller mounted for a stream node declaration (undefined before mount / after dispose). */
export function pointStreamControllerFor(stream: AuraPointStreamNodeSpec | undefined): PointStreamController | undefined {
  return stream ? streamControllers.get(stream) : undefined;
}

export function mountPointStreamController(stream: AuraPointStreamNodeSpec, options: PointStreamControllerOptions = {}): PointStreamController {
  streamControllers.get(stream)?.dispose();
  const controller = new PointStreamController(stream, options);
  streamControllers.set(stream, controller);
  return controller;
}

export function disposePointStreamController(stream: AuraPointStreamNodeSpec | undefined): void {
  if (!stream) return;
  const controller = streamControllers.get(stream);
  if (controller) {
    streamControllers.delete(stream);
    controller.dispose();
  }
}

export class PointStreamController {
  readonly capacity: number;
  readonly vertices: VertexBuffer;
  readonly geometry: Geometry;
  readonly layout: Layout;
  private readonly sourceColorFormat: "u8x4n" | "f32x4" | undefined;
  private readonly srgb: boolean;
  private readonly strideBytes: number;
  private readonly strideWords: number;
  private readonly f32: Float32Array;
  private readonly bytes: Uint8Array;
  private readonly u32: Uint32Array;
  private readonly hint: boolean;
  private readonly min: [number, number, number];
  private readonly max: [number, number, number];
  private stagedPositions: Float32Array | undefined;
  private stagedColors: Uint8Array | Float32Array | undefined;
  private leaseObject: AuraPointStreamLease | undefined;
  private drawn = 0;
  private commitCount = 0;
  private copied = 0;
  private allocationCount = 0;
  private disposed = false;

  constructor(stream: AuraPointStreamNodeSpec, options: PointStreamControllerOptions = {}) {
    this.capacity = stream.capacity;
    this.sourceColorFormat = stream.colors;
    this.srgb = stream.colorSpace === "srgb";
    this.layout = stream.colors === undefined ? "none" : stream.colors === "u8x4n" && options.backend !== "webgpu" ? "u8" : "f32";
    const format = this.layout === "none" ? FORMAT_P3 : this.layout === "u8" ? FORMAT_P3_C4U8 : FORMAT_P3_C4F32;
    this.vertices = new VertexBuffer(format, this.capacity);
    this.strideBytes = format.stride;
    this.strideWords = format.stride / 4;
    this.f32 = this.vertices.floats;
    this.bytes = new Uint8Array(this.vertices.data);
    this.u32 = new Uint32Array(this.vertices.data);
    this.hint = stream.bounds !== undefined;
    this.min = stream.bounds ? [...stream.bounds.min] : [0, 0, 0];
    this.max = stream.bounds ? [...stream.bounds.max] : [0, 0, 0];
    // Explicit bounds skip the O(capacity) scan Geometry would otherwise run on zeros.
    this.geometry = new Geometry(this.vertices, null, "points", { min: this.min, max: this.max });
    // The first upload ships the whole (empty) mirror once; every later upload is a dirty range.
    this.allocationCount = 0;
  }

  get drawCount(): number {
    return this.drawn;
  }

  get stats(): AuraPointStreamStats {
    const dirty = this.vertices.getDirtyRange();
    return { commits: this.commitCount, bytesCopied: this.copied, allocations: this.allocationCount, dirtyBytes: dirty ? dirty.end - dirty.start : null };
  }

  write(positions: Float32Array, options: AuraPointStreamWriteOptions = {}): void {
    this.assertLive();
    if (!(positions instanceof Float32Array)) throw new TypeError("POINT_STREAM_TYPE: write(positions) expects a Float32Array (x,y,z per point)");
    const count = options.count ?? Math.floor(positions.length / 3);
    const partial = options.offset !== undefined;
    const offset = options.offset ?? 0;
    this.assertRange(offset, count);
    if (positions.length < count * 3) throw new RangeError(`POINT_STREAM_SHORT_INPUT: positions has ${positions.length} values, need ${count * 3}`);
    const colors = options.colors;
    if (colors !== undefined) {
      if (this.layout === "none") throw new TypeError("POINT_STREAM_NO_COLORS: the stream was declared without per-point colors");
      this.assertColors(colors, count);
    }
    if (options.validate === true) {
      for (let i = 0, n = count * 3; i < n; i += 1) {
        if (!Number.isFinite(positions[i]!)) throw new RangeError(`POINT_STREAM_NON_FINITE: positions[${i}] is not finite`);
      }
    }
    if (!this.hint) this.beginBounds(partial);
    if (this.layout === "none") {
      if (positions.length === count * 3) this.f32.set(positions, offset * 3);
      else this.f32.set(positions.subarray(0, count * 3), offset * 3);
      if (!this.hint) this.growBounds(this.f32, offset * 3, count);
    } else {
      this.copyInterleaved(positions, 0, offset, count, !this.hint);
    }
    if (colors !== undefined) this.copyColors(colors, 0, offset, count);
    this.finish(partial, offset, count, colors !== undefined);
  }

  setDrawCount(count: number): void {
    this.assertLive();
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`POINT_STREAM_CAPACITY_EXCEEDED: draw count ${count} is outside [0, ${this.capacity}]`);
    }
    this.drawn = count;
  }

  lease(): AuraPointStreamLease {
    this.assertLive();
    if (this.leaseObject) return this.leaseObject;
    let positions: Float32Array;
    if (this.layout === "none") {
      positions = this.f32; // zero-copy: the CPU mirror itself
    } else {
      positions = this.stagedPositions = new Float32Array(this.capacity * 3);
      this.allocationCount += 1;
      if (this.layout === "u8") this.stagedColors = new Uint8Array(this.capacity * 4);
      else this.stagedColors = new Float32Array(this.capacity * 4);
      this.allocationCount += 1;
    }
    const controller = this;
    this.leaseObject = {
      positions,
      colors: this.stagedColors,
      commit(count: number, dirty?: AuraPointStreamDirtyRange): void {
        controller.commitLease(count, dirty);
      }
    };
    return this.leaseObject;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.leaseObject = undefined;
    this.stagedPositions = undefined;
    this.stagedColors = undefined;
    this.geometry.dispose();
  }

  private commitLease(count: number, dirty?: AuraPointStreamDirtyRange): void {
    this.assertLive();
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`POINT_STREAM_CAPACITY_EXCEEDED: commit count ${count} exceeds capacity ${this.capacity}`);
    }
    const start = dirty?.start ?? 0;
    const length = dirty?.count ?? count;
    this.assertRange(start, length);
    const partial = dirty !== undefined;
    if (!this.hint) this.beginBounds(partial);
    if (this.layout === "none") {
      // Positions were written in place; only bounds and the dirty range remain.
      if (!this.hint) this.growBounds(this.f32, start * 3, length);
      this.finish(partial, start, length, false, count);
    } else {
      this.copyInterleaved(this.stagedPositions!, start, start, length, !this.hint);
      this.copyColors(this.stagedColors!, start, start, length);
      this.finish(partial, start, length, true, count);
    }
  }

  private beginBounds(partial: boolean): void {
    if (partial && this.drawn > 0) return; // grow-only
    this.min[0] = this.min[1] = this.min[2] = Number.POSITIVE_INFINITY;
    this.max[0] = this.max[1] = this.max[2] = Number.NEGATIVE_INFINITY;
  }

  /** Grow bounds over `count` tightly packed points starting at float index `from` of `array`. */
  private growBounds(array: Float32Array, from: number, count: number): void {
    let x0 = this.min[0], y0 = this.min[1], z0 = this.min[2], x1 = this.max[0], y1 = this.max[1], z1 = this.max[2];
    for (let i = from, end = from + count * 3; i < end; i += 3) {
      const x = array[i]!, y = array[i + 1]!, z = array[i + 2]!;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    this.min[0] = x0; this.min[1] = y0; this.min[2] = z0; this.max[0] = x1; this.max[1] = y1; this.max[2] = z1;
  }

  /** Positions into the interleaved mirror: source point `srcStart..` -> destination point `dstStart..`. */
  private copyInterleaved(source: Float32Array, srcStart: number, dstStart: number, count: number, trackBounds: boolean): void {
    const f32 = this.f32, sw = this.strideWords;
    let x0 = this.min[0], y0 = this.min[1], z0 = this.min[2], x1 = this.max[0], y1 = this.max[1], z1 = this.max[2];
    for (let i = 0, s = srcStart * 3, d = dstStart * sw; i < count; i += 1, s += 3, d += sw) {
      const x = source[s]!, y = source[s + 1]!, z = source[s + 2]!;
      f32[d] = x; f32[d + 1] = y; f32[d + 2] = z;
      if (trackBounds) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
    }
    if (trackBounds) { this.min[0] = x0; this.min[1] = y0; this.min[2] = z0; this.max[0] = x1; this.max[1] = y1; this.max[2] = z1; }
  }

  /** RGBA into the interleaved mirror, converting between source and storage formats with no per-call allocation. */
  private copyColors(source: ColorSource, srcStart: number, dstStart: number, count: number): void {
    const sw = this.strideWords;
    if (this.layout === "u8") {
      const bytes = this.bytes, stride = this.strideBytes, u32 = this.u32;
      if (source instanceof Uint32Array) {
        for (let i = 0, s = srcStart, d = dstStart * sw + 3; i < count; i += 1, s += 1, d += sw) {
          if (this.srgb) {
            const v = source[s]!;
            u32[d] = (SRGB_TO_LINEAR_U8[v & 255]! | (SRGB_TO_LINEAR_U8[(v >>> 8) & 255]! << 8) | (SRGB_TO_LINEAR_U8[(v >>> 16) & 255]! << 16) | (v & 0xff000000)) >>> 0;
          } else u32[d] = source[s]!;
        }
      } else if (source instanceof Float32Array) {
        for (let i = 0, s = srcStart * 4, d = dstStart * stride + 12; i < count; i += 1, s += 4, d += stride) {
          for (let c = 0; c < 4; c += 1) {
            const v = source[s + c]!;
            bytes[d + c] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
          }
        }
      } else if (this.srgb) {
        for (let i = 0, s = srcStart * 4, d = dstStart * stride + 12; i < count; i += 1, s += 4, d += stride) {
          bytes[d] = SRGB_TO_LINEAR_U8[source[s]!]!; bytes[d + 1] = SRGB_TO_LINEAR_U8[source[s + 1]!]!;
          bytes[d + 2] = SRGB_TO_LINEAR_U8[source[s + 2]!]!; bytes[d + 3] = source[s + 3]!;
        }
      } else {
        for (let i = 0, s = srcStart * 4, d = dstStart * stride + 12; i < count; i += 1, s += 4, d += stride) {
          bytes[d] = source[s]!; bytes[d + 1] = source[s + 1]!; bytes[d + 2] = source[s + 2]!; bytes[d + 3] = source[s + 3]!;
        }
      }
    } else if (this.layout === "f32") {
      const f32 = this.f32;
      if (source instanceof Float32Array) {
        for (let i = 0, s = srcStart * 4, d = dstStart * sw + 3; i < count; i += 1, s += 4, d += sw) {
          f32[d] = source[s]!; f32[d + 1] = source[s + 1]!; f32[d + 2] = source[s + 2]!; f32[d + 3] = source[s + 3]!;
        }
      } else if (source instanceof Uint32Array) {
        for (let i = 0, s = srcStart, d = dstStart * sw + 3; i < count; i += 1, s += 1, d += sw) {
          const v = source[s]!;
          f32[d] = this.byteToUnit(v & 255); f32[d + 1] = this.byteToUnit((v >>> 8) & 255);
          f32[d + 2] = this.byteToUnit((v >>> 16) & 255); f32[d + 3] = ((v >>> 24) & 255) / 255;
        }
      } else {
        for (let i = 0, s = srcStart * 4, d = dstStart * sw + 3; i < count; i += 1, s += 4, d += sw) {
          f32[d] = this.byteToUnit(source[s]!); f32[d + 1] = this.byteToUnit(source[s + 1]!);
          f32[d + 2] = this.byteToUnit(source[s + 2]!); f32[d + 3] = source[s + 3]! / 255;
        }
      }
    }
  }

  private byteToUnit(value: number): number {
    return this.srgb ? SRGB_TO_LINEAR[value]! : value / 255;
  }

  private finish(partial: boolean, start: number, count: number, colorsWritten: boolean, replaceCount?: number): void {
    // `replaceCount` is only passed by lease commits, which publish an absolute count.
    if (replaceCount !== undefined) this.drawn = replaceCount;
    else this.drawn = partial ? Math.max(this.drawn, start + count) : count;
    if (this.drawn === 0 && !this.hint) {
      this.min[0] = this.min[1] = this.min[2] = 0;
      this.max[0] = this.max[1] = this.max[2] = 0;
    }
    if (count > 0) {
      if (this.layout === "none") {
        this.vertices.markDirtyRange(start * 12, count * 12);
        this.copied += count * 12;
      } else {
        this.vertices.markDirtyRange(start * this.strideBytes, count * this.strideBytes);
        this.copied += count * (12 + (colorsWritten ? this.layout === "u8" ? 4 : 16 : 0));
      }
    }
    this.commitCount += 1;
  }

  private assertRange(offset: number, count: number): void {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(count) || count < 0) {
      throw new RangeError(`POINT_STREAM_RANGE: offset ${offset} and count ${count} must be non-negative integers`);
    }
    if (offset + count > this.capacity) {
      throw new RangeError(`POINT_STREAM_CAPACITY_EXCEEDED: ${offset} + ${count} points exceed capacity ${this.capacity}`);
    }
  }

  private assertColors(colors: ColorSource, count: number): void {
    const perPoint = colors instanceof Uint32Array ? 1 : 4;
    if (colors.length < count * perPoint) throw new RangeError(`POINT_STREAM_SHORT_INPUT: colors has ${colors.length} values, need ${count * perPoint}`);
    if (colors instanceof Float32Array && this.sourceColorFormat === undefined) throw new TypeError("POINT_STREAM_NO_COLORS");
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("POINT_STREAM_DISPOSED: the node was removed or the scene was remounted; request a fresh handle");
  }
}

/** Attach `write` / `lease` / `setDrawCount` / `capacity` / `drawCount` / `stats` to a `points.stream` runtime handle. */
export function attachPointStreamControls(handle: AuraRuntimeNodeHandle, stream: AuraPointStreamNodeSpec, bumpVersion: () => void): void {
  const live = (): PointStreamController => {
    const controller = streamControllers.get(stream);
    if (!controller) throw new Error("POINT_STREAM_NOT_MOUNTED: the stream is not mounted (call after createAuraApp resolves; handles are invalid after setScene/remove)");
    return controller;
  };
  Object.defineProperties(handle, {
    capacity: { value: stream.capacity, enumerable: true },
    drawCount: { get: () => streamControllers.get(stream)?.drawCount ?? 0, enumerable: true },
    stats: { get: () => live().stats, enumerable: true },
    write: { value(positions: Float32Array, options?: AuraPointStreamWriteOptions) { live().write(positions, options); bumpVersion(); }, enumerable: true },
    setDrawCount: { value(count: number) { live().setDrawCount(count); bumpVersion(); }, enumerable: true },
    lease: {
      value(): AuraPointStreamLease {
        const inner = live().lease();
        return {
          positions: inner.positions,
          colors: inner.colors,
          commit(count: number, dirty?: AuraPointStreamDirtyRange) { inner.commit(count, dirty); bumpVersion(); }
        };
      },
      enumerable: true
    }
  });
}

// ── Typed static `points()` (P-01) ─────────────────────────────────────────────────────────────────────

/**
 * Static cloud geometry straight from typed arrays: one pass over the input, no per-point JS objects and no CSS
 * color parsing. `colors` is packed RGBA bytes (`Uint8Array`/`Uint8ClampedArray`, 4 per point), packed `Uint32Array`
 * (one little-endian RGBA word per point) or linear `Float32Array` RGBA, all interpreted as linear values.
 */
export function createTypedPointsGeometry(positions: Float32Array, colors?: ColorSource): Geometry {
  const count = Math.floor(positions.length / 3);
  if (count === 0) throw new Error("Point geometry requires at least one position");
  const stream: AuraPointStreamNodeSpec = {
    capacity: count,
    ...(colors === undefined ? {} : { colors: colors instanceof Float32Array ? "f32x4" as const : "u8x4n" as const })
  };
  const controller = new PointStreamController(stream);
  controller.write(positions, { count, ...(colors === undefined ? {} : { colors }), validate: true });
  // The geometry (and its CPU mirror) is handed to the caller; the controller wrapper is dropped.
  return controller.geometry;
}

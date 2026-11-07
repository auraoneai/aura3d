// E6-00 §4 / gaps P-01, P-02, U-06: typed mutable point streams.
//
// `points.stream(spec)` declares a point cloud by capacity and layout only (no data), and the runtime
// handle (`app.nodes.require(id)`) owns the bulk writes: `write` (copy-in), `lease` (engine-owned views +
// `commit`) and `setDrawCount`. Writes go straight into the node's CPU vertex mirror and mark a dirty byte
// range; the renderer uploads only that range. Nothing allocates per write and the scene is never recompiled.

import { AuraNodeBuilder } from "./builder.js";
import type { AuraMaterialSpec, AuraMaterialTextureInput, AuraPointsNode, AuraRuntimeNodeHandle, AuraRuntimeNodeSpec, AuraVec3 } from "./types.js";

/** Per-point color storage. Omitted = one uniform color from `material`. */
export type AuraPointStreamColorFormat = "u8x4n" | "f32x4";

export interface AuraPointStreamSpec {
  /** Maximum number of points (fixed per mount). Writes beyond it throw `POINT_STREAM_CAPACITY_EXCEEDED`. */
  readonly capacity: number;
  /**
   * Per-point RGBA storage: `"u8x4n"` (4 bytes/point, the compact default for sensor data) or `"f32x4"`.
   * Values are linear, like `three.js` vertex colors, unless `colorSpace: "srgb"` is set (u8 sources only).
   */
  readonly colors?: AuraPointStreamColorFormat;
  /** How `u8x4n` source bytes are interpreted. `"srgb"` decodes through a 256-entry table on write. Default `"linear"`. */
  readonly colorSpace?: "linear" | "srgb";
  /** Point size in CSS pixels (same meaning as `points({ size })`). Default 1. */
  readonly size?: number;
  readonly sizeAttenuation?: boolean;
  readonly map?: AuraMaterialTextureInput;
  readonly alphaTest?: number;
  readonly transparent?: boolean;
  readonly material?: AuraMaterialSpec;
  /**
   * Fixed local bounds. With a hint the engine never scans positions; without one it tracks exact bounds
   * while it copies (a full write resets them, a partial write only grows them), so a visible cloud is
   * never culled by stale bounds.
   */
  readonly bounds?: { readonly min: AuraVec3; readonly max: AuraVec3 };
  readonly name?: string;
  readonly visible?: boolean;
  /** Required: the runtime id is the handle key. */
  readonly runtime: AuraRuntimeNodeSpec;
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
}

/** The serialisable stream declaration carried on the node: capacity and layout, no payload. */
export interface AuraPointStreamNodeSpec {
  readonly capacity: number;
  readonly colors?: AuraPointStreamColorFormat;
  readonly colorSpace?: "linear" | "srgb";
  readonly bounds?: { readonly min: AuraVec3; readonly max: AuraVec3 };
}

export interface AuraPointStreamWriteOptions {
  /** Number of points to write (default `positions.length / 3`). */
  readonly count?: number;
  /**
   * Destination start index. Omitted = replace the cloud (the draw count becomes `count`). Given (even 0) = partial update:
   * only `[offset, offset + count)` is written and the draw count only grows.
   */
  readonly offset?: number;
  /** RGBA, 4 values per point, for the same `[offset, offset + count)` range. Omitted = existing colors stay. */
  readonly colors?: Uint8Array | Uint8ClampedArray | Uint32Array | Float32Array;
  /** Reject non-finite positions (an O(count) scan; off by default). */
  readonly validate?: boolean;
}

export interface AuraPointStreamDirtyRange {
  readonly start: number;
  readonly count: number;
}

/** Engine-owned writable views. Fill them, then `commit`. */
export interface AuraPointStreamLease {
  /** `capacity * 3` floats. */
  readonly positions: Float32Array;
  /** `capacity * 4` values (u8 or f32 per the declared format); absent when the stream has no per-point colors. */
  readonly colors: Uint8Array | Float32Array | undefined;
  /** Publish `count` points (default: replace) and optionally only the `dirty` index range. */
  commit(count: number, dirty?: AuraPointStreamDirtyRange): void;
}

export interface AuraPointStreamStats {
  /** Completed `write`/`commit` calls. */
  readonly commits: number;
  /** Bytes copied into the CPU mirror over the node's lifetime. */
  readonly bytesCopied: number;
  /** Typed-array allocations made by the stream after mount (0 in steady state; lease staging counts once). */
  readonly allocations: number;
  /** Currently pending dirty byte range in the CPU mirror, or null. */
  readonly dirtyBytes: number | null;
}

export interface AuraPointStreamControls {
  readonly capacity: number;
  /** Points currently drawn. */
  readonly drawCount: number;
  write(positions: Float32Array, options?: AuraPointStreamWriteOptions): void;
  lease(): AuraPointStreamLease;
  /** Change the drawn count without touching data (a draw range change, not a reallocation). */
  setDrawCount(count: number): void;
  readonly stats: AuraPointStreamStats;
}

/** A runtime handle of a `points.stream` node. */
export type AuraPointStreamHandle = AuraRuntimeNodeHandle & AuraPointStreamControls;

function assertSpec(spec: AuraPointStreamSpec): void {
  if (!Number.isSafeInteger(spec.capacity) || spec.capacity <= 0) {
    throw new RangeError("points.stream capacity must be a positive integer");
  }
  if (spec.colors !== undefined && spec.colors !== "u8x4n" && spec.colors !== "f32x4") {
    throw new TypeError('points.stream colors must be "u8x4n" or "f32x4"');
  }
  if (spec.colorSpace !== undefined && spec.colorSpace !== "linear" && spec.colorSpace !== "srgb") {
    throw new TypeError('points.stream colorSpace must be "linear" or "srgb"');
  }
  if (spec.colorSpace === "srgb" && spec.colors !== "u8x4n") {
    throw new TypeError('points.stream colorSpace "srgb" applies to colors: "u8x4n" only');
  }
  if (!spec.runtime || typeof spec.runtime.id !== "string" || spec.runtime.id.length === 0) {
    throw new TypeError("points.stream requires runtime: { id } (the id is the handle key for write/lease)");
  }
  const size = spec.size ?? 1;
  if (!Number.isFinite(size) || size <= 0) throw new Error("points size must be a positive finite number (GL clamps oversize to ALIASED_POINT_SIZE_RANGE)");
  if (spec.alphaTest !== undefined && (!Number.isFinite(spec.alphaTest) || spec.alphaTest < 0 || spec.alphaTest > 1)) {
    throw new Error("points alphaTest must be finite in [0, 1]");
  }
  if (spec.bounds) {
    for (const v of [...spec.bounds.min, ...spec.bounds.max]) if (!Number.isFinite(v)) throw new RangeError("points.stream bounds must be finite");
  }
}

/** `points.stream({ capacity, colors?, size?, runtime: { id } })`: a mutable typed point cloud (E6-00 §4). */
export function pointStream(spec: AuraPointStreamSpec): AuraNodeBuilder<AuraPointsNode> {
  assertSpec(spec);
  const stream: AuraPointStreamNodeSpec = {
    capacity: spec.capacity,
    ...(spec.colors ? { colors: spec.colors } : {}),
    ...(spec.colorSpace ? { colorSpace: spec.colorSpace } : {}),
    ...(spec.bounds ? { bounds: spec.bounds } : {})
  };
  return new AuraNodeBuilder<AuraPointsNode>({
    kind: "points",
    name: spec.name,
    positions: [],
    stream,
    size: spec.size ?? 1,
    sizeAttenuation: spec.sizeAttenuation,
    map: spec.map,
    alphaTest: spec.alphaTest,
    transparent: spec.transparent,
    material: spec.material,
    visible: spec.visible,
    runtime: spec.runtime,
    position: spec.position,
    rotation: spec.rotation,
    scale: spec.scale
  });
}

/** Narrow a runtime handle to a point-stream handle; throws when the node is not a `points.stream`. */
export function pointStreamOf(handle: AuraRuntimeNodeHandle | undefined): AuraPointStreamHandle {
  const candidate = handle as Partial<AuraPointStreamHandle> | undefined;
  if (!candidate || typeof candidate.write !== "function" || typeof candidate.lease !== "function") {
    throw new TypeError("POINT_STREAM_REQUIRED: the handle is not a points.stream node");
  }
  return candidate as AuraPointStreamHandle;
}


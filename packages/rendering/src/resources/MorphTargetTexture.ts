/**
 * C-18 (PRD-06): `buildMorphTargetTexture` — packs morph-target deltas into a
 * `sampler2DArray` texture, the GPU path that lifts the uniform-array cap
 * (E-17/E-19). Layout follows §8.2: texel index `j = vertexId * stride + attr`
 * flattens into `(x = j % width, y = j / width)` and `z = target` (one array
 * layer per morph target), where `attr` is 0 = position delta, 1 = normal
 * delta, 2 = tangent delta and `stride` the layer count. Target counts are
 * bucketed into {4, 8, 16, 32}; beyond 32 the set is truncated with a
 * `MORPH_TARGETS_TRUNCATED` warning (C-18 invariants).
 *
 * The result is a `Texture` with `dimension: "2d-array"`: on `update()`
 * revision bumps `webgl2/TextureUpload.ts` re-uploads per layer via
 * `texSubImage3D` instead of reallocating (T0.10a).
 */

import type { Geometry } from "../Geometry";
import type { MorphTargetDelta } from "../MorphTarget";
import { Texture, type TextureFormat } from "../Texture";

export const MORPH_TARGET_COUNT_BUCKETS = [4, 8, 16, 32] as const;
export type MorphTargetCountBucket = (typeof MORPH_TARGET_COUNT_BUCKETS)[number];

export const MORPH_LAYER_POSITION = 0;
export const MORPH_LAYER_NORMAL = 1;
export const MORPH_LAYER_TANGENT = 2;
export const MORPH_MAX_TEXTURE_LAYERS = 3;

export interface MorphTextureLimits {
  readonly maxTextureSize: number;
  readonly maxArrayLayers: number;
}

export type MorphTargetTextureResult =
  | {
      readonly texture: Texture;
      readonly targetCount: number;
      readonly hasNormals: boolean;
      readonly hasTangents: boolean;
      /** Texels per vertex (1 = positions, 2 = +normals, 3 = +tangents) — shader `u_morphStride`. */
      readonly stride: number;
      readonly bucket: MorphTargetCountBucket;
      /** Bucketed targets actually packed (index order preserved, truncation applied). */
      readonly targets: readonly MorphTargetDelta[];
    }
  | { readonly fallback: "cpu"; readonly reason: string };

/** Smallest bucket that can hold `count` targets; `null` when it exceeds 32. */
export function morphTargetBucket(count: number): MorphTargetCountBucket | null {
  for (const bucket of MORPH_TARGET_COUNT_BUCKETS) {
    if (count <= bucket) return bucket;
  }
  return null;
}

let truncationsWarned = 0;

/**
 * Build the morph-delta array texture for a geometry/target set. Contract-doc
 * signature (`geometry, targets, limits, format`); the PR-0a
 * `contracts/deform.ts` stub keeps `PRD06_PENDING` until owner 01 re-points it
 * (qr-request Q-01-CCR-06-6).
 */
export function buildMorphTargetTexture(
  geometry: Geometry,
  targets: readonly MorphTargetDelta[],
  limits: MorphTextureLimits,
  format: "rgba16f" | "rgba32f" = "rgba16f"
): MorphTargetTextureResult {
  const vertexCount = geometry.vertexBuffer.vertexCount;
  if (vertexCount <= 0) {
    return { fallback: "cpu", reason: "geometry has no vertices" };
  }
  if (vertexCount > limits.maxTextureSize) {
    return { fallback: "cpu", reason: `vertexCount ${vertexCount} exceeds maxTextureSize ${limits.maxTextureSize}` };
  }
  let packedTargets: readonly MorphTargetDelta[] = targets;
  if (targets.length > 32) {
    packedTargets = targets.slice(0, 32);
    if (truncationsWarned < 8 && typeof console !== "undefined") {
      truncationsWarned += 1;
      console.warn(`MORPH_TARGETS_TRUNCATED:${targets.length}->32`);
    }
  }
  const bucket = morphTargetBucket(packedTargets.length);
  if (!bucket) {
    return { fallback: "cpu", reason: `targetCount ${packedTargets.length} exceeds the {4,8,16,32} bucket ceiling` };
  }
  if (bucket > limits.maxArrayLayers) {
    return { fallback: "cpu", reason: `target bucket ${bucket} exceeds maxArrayLayers ${limits.maxArrayLayers}` };
  }
  const hasNormals = packedTargets.some((target) => (target.normals?.length ?? 0) > 0);
  const hasTangents = packedTargets.some((target) => (target.tangents?.length ?? 0) > 0);
  const stride = 1 + (hasNormals ? 1 : 0) + (hasTangents ? 1 : 0);
  // §8.2: texel j = vertexId*stride+attr flattened over (width, height); z = target.
  const texelsPerLayer = vertexCount * stride;
  const width = Math.min(limits.maxTextureSize, texelsPerLayer);
  const height = Math.ceil(texelsPerLayer / width);
  if (height > limits.maxTextureSize) {
    return { fallback: "cpu", reason: `morph texel height ${height} exceeds maxTextureSize ${limits.maxTextureSize}` };
  }
  const data = new Float32Array(width * height * 4 * bucket);
  const layerStride = width * height * 4;
  for (let t = 0; t < packedTargets.length; t += 1) {
    const target = packedTargets[t]!;
    const layerOffset = t * layerStride;
    for (let v = 0; v < vertexCount; v += 1) {
      writeDelta(data, layerOffset + (v * stride + MORPH_LAYER_POSITION) * 4, target.positions?.[v]);
      if (hasNormals) {
        writeDelta(data, layerOffset + (v * stride + MORPH_LAYER_NORMAL) * 4, target.normals?.[v]);
      }
      if (hasTangents) {
        writeDelta(data, layerOffset + (v * stride + MORPH_LAYER_TANGENT) * 4, target.tangents?.[v]);
      }
    }
  }
  const texture = new Texture({
    width,
    height,
    layers: bucket,
    dimension: "2d-array",
    format: format as TextureFormat,
    colorSpace: "linear",
    label: `aura3d-morph-targets-${vertexCount}x${bucket}x${stride}`,
    // rgba16f uploads take Uint16Array half-floats (Texture.ts validation);
    // rgba32f takes the Float32Array as packed.
    data: format === "rgba16f" ? float32ArrayToFloat16(data) : data
  });
  return {
    texture,
    targetCount: packedTargets.length,
    hasNormals,
    hasTangents,
    stride,
    bucket,
    targets: packedTargets
  };
}

function writeDelta(out: Float32Array, offset: number, delta: readonly number[] | undefined): void {
  out[offset] = delta?.[0] ?? 0;
  out[offset + 1] = delta?.[1] ?? 0;
  out[offset + 2] = delta?.[2] ?? 0;
  out[offset + 3] = delta?.[3] ?? 0;
}

/** IEEE-754 binary32 → binary16 for every element (round-half-up; subnormals flush to zero). */
export function float32ArrayToFloat16(input: Float32Array): Uint16Array {
  const out = new Uint16Array(input.length);
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  for (let i = 0; i < input.length; i += 1) {
    f32[0] = input[i]!;
    const x = u32[0]!;
    const sign = (x >>> 16) & 0x8000;
    const exponent = ((x >>> 23) & 0xff) - 112;
    if (exponent <= 0) {
      out[i] = sign; // underflow to signed zero (morph deltas are small; subnormals unnecessary)
    } else if (exponent >= 31) {
      out[i] = sign | 0x7bff; // saturate to max half
    } else {
      const mantissa = (x & 0x7fffff) + 0x1000; // round-half-up on the dropped bits
      out[i] = sign | (exponent << 10) | (mantissa >> 13);
    }
  }
  return out;
}

/**
 * Native Aura3D directional-albedo fixture adapter.
 *
 * Provenance: `packages/rendering/src/program/DFGLutData.ts` integrates an
 * isotropic GGX distribution using 65536 Hammersley samples per texel,
 * height-correlated Smith masking and Schlick's fifth-power Fresnel factor.
 * `generateDfgLut()` reproduces the baked `DFG_LUT_RG16F` used here; this
 * adapter neither embeds a second table nor reads a comparison fixture.
 *
 * The 16 x 16 texture is row-major, two IEEE 754 binary16 words per texel.
 * X is perceptual roughness and Y is N·V, both sampled at (index + 0.5) / 16.
 * R is coefficient A and G is B, combined as `F0 * A + F90 * B`.
 * Native forward rendering widens RG to linear RGBA16F (blue=0, alpha=1) and
 * samples RG with LINEAR min/mag and CLAMP_TO_EDGE on both axes, without
 * mipmap filtering. Native deferred rendering decodes the same pairs to
 * float32 and performs the equivalent clamped bilinear lookup in shader.
 *
 * Reproduction digest: SHA-256 of all 512 RG words serialized in row-major
 * order, each word least-significant byte first (1024 bytes total), regardless
 * of host endianness. Regenerate with `generateDfgLut()` before hashing.
 * SHA-256: 99849ad3e80ccc5ee6ee4343c55de42a75493bfa94a498148dca5006eae58362
 *
 * The CPU sampler below uses binary16 decoding and floating-point bilinear
 * arithmetic; it is a reference for the stated layout and sampler behavior,
 * not a claim about hardware filtering precision or rendered pixels.
 */
import {
  DFG_LUT_RG16F,
  DFG_LUT_SAMPLES,
  DFG_LUT_SIZE
} from "../../../../packages/rendering/src/program/DFGLutData";

export const NATIVE_DFG_LUT_SIZE = DFG_LUT_SIZE;
export const NATIVE_DFG_LUT_SAMPLES = DFG_LUT_SAMPLES;
export const NATIVE_DFG_LUT_SHA256 = "99849ad3e80ccc5ee6ee4343c55de42a75493bfa94a498148dca5006eae58362";

// Keep the snapshot private: neither callers nor the renderer's exported
// mutable typed array can mutate this module's subsequent sampling results.
const nativeWords = new Uint16Array(DFG_LUT_RG16F);

/** Return an owned copy of the row-major RG binary16 words. */
export function nativeDfgLutRg16f(): Uint16Array {
  return nativeWords.slice();
}

/** Decode one IEEE 754 binary16 bit pattern, including zero and specials. */
export function decodeNativeDfgFloat16(bits: number): number {
  if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) {
    throw new RangeError("binary16 input must be an unsigned 16-bit integer");
  }
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;
  return sign * (1024 + fraction) * 2 ** (exponent - 25);
}

/** Return an owned float32 copy with the same RG channel and row order. */
export function nativeDfgLutRg32f(): Float32Array {
  return Float32Array.from(nativeWords, decodeNativeDfgFloat16);
}

/** Sample the native texture's clamped bilinear RG coefficients on the CPU. */
export function sampleNativeDfgLut(roughness: number, ndotv: number): readonly [number, number] {
  if (!Number.isFinite(roughness) || !Number.isFinite(ndotv)) {
    throw new RangeError("DFG fixture coordinates must be finite");
  }
  const max = NATIVE_DFG_LUT_SIZE - 1;
  const px = Math.max(0, Math.min(max, roughness * NATIVE_DFG_LUT_SIZE - 0.5));
  const py = Math.max(0, Math.min(max, ndotv * NATIVE_DFG_LUT_SIZE - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, max), y1 = Math.min(y0 + 1, max);
  const fx = px - x0, fy = py - y0;
  const channel = (x: number, y: number, component: number): number =>
    decodeNativeDfgFloat16(nativeWords[2 * (y * NATIVE_DFG_LUT_SIZE + x) + component]!);
  const interpolate = (component: number): number => {
    const lower = channel(x0, y0, component) * (1 - fx) + channel(x1, y0, component) * fx;
    const upper = channel(x0, y1, component) * (1 - fx) + channel(x1, y1, component) * fx;
    return lower * (1 - fy) + upper * fy;
  };
  return [interpolate(0), interpolate(1)];
}

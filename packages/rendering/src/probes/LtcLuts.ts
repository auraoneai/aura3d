// PRD-02 §8.5 — LTC lookup tables for rect area lights on High/Ultra.
// Two 64×64 RGBA16F LUTs from three.js `RectAreaLightTexturesLib.js` (MIT);
// fetched lazily at first use — never bundled — and cached per device.
// Low/Medium tiers use the Gauss–Legendre 4-tap integrator instead
// (`gaussLegendreRectDiffuse`, the CPU twin of the chunk's
// `a3d_rectGaussDiffuse`), so no fetch happens on those tiers.

import type { RenderDevice } from "../RenderDevice";
import { Texture } from "../Texture";

export interface LtcLutTextures {
  /** (MInv elements, packed) — u_prd02LtcMInv. */
  readonly mInv: Texture;
  /** BRDF fresnel scale/bias — u_prd02LtcFresnel. */
  readonly fresnel: Texture;
}

/** Canonical LUT source (three.js r160+, MIT): RectAreaLightTexturesLib.js. */
export const LTC_LUT_SOURCE_URL =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/lights/RectAreaLightTexturesLib.js";
export const LTC_LUT_SIZE = 64;
/** Byte length of each 64×64 RGBA float32 table (256 KiB per LUT). */
export const LTC_LUT_BYTES = LTC_LUT_SIZE * LTC_LUT_SIZE * 4 * 4;

export interface LtcLutLoader {
  /** Fetch one LUT as raw float32 (RGBA, row-major). */
  fetch(name: "mInv" | "fresnel"): Promise<Float32Array>;
}

const perDevice = new WeakMap<RenderDevice, Promise<LtcLutTextures>>();

/**
 * Lazily fetch + create the two LUT textures for a device. Subsequent calls
 * return the cached promise. The default loader fetches `LTC_LUT_SOURCE_URL`
 * and verifies each table is exactly `LTC_LUT_BYTES`; a custom loader may
 * vendor the tables locally instead.
 */
export function fetchLtcLutTextures(
  device: RenderDevice,
  loader: LtcLutLoader = defaultLoader
): Promise<LtcLutTextures> {
  const cached = perDevice.get(device);
  if (cached) return cached;
  const promise = (async (): Promise<LtcLutTextures> => {
    const [mInv, fresnel] = await Promise.all([loader.fetch("mInv"), loader.fetch("fresnel")]);
    for (const [name, data] of [["mInv", mInv], ["fresnel", fresnel]] as const) {
      if (data.length !== LTC_LUT_SIZE * LTC_LUT_SIZE * 4) {
        throw new Error(`LTC LUT ${name} size mismatch: ${data.length} floats (expected ${LTC_LUT_SIZE * LTC_LUT_SIZE * 4})`);
      }
    }
    return {
      mInv: lutTexture(mInv, "u_prd02LtcMInv"),
      fresnel: lutTexture(fresnel, "u_prd02LtcFresnel")
    };
  })();
  perDevice.set(device, promise);
  return promise;
}

function lutTexture(data: Float32Array, label: string): Texture {
  return new Texture({
    width: LTC_LUT_SIZE,
    height: LTC_LUT_SIZE,
    format: "rgba32f",
    label,
    mipLevels: [{ width: LTC_LUT_SIZE, height: LTC_LUT_SIZE, data }]
  });
}

const defaultLoader: LtcLutLoader = {
  async fetch(name: "mInv" | "fresnel"): Promise<Float32Array> {
    const url = `${LTC_LUT_SOURCE_URL}/${name === "mInv" ? "ltc_mat" : "ltc_amp"}.f32`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LTC LUT fetch failed (${res.status})`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== LTC_LUT_BYTES) {
      throw new Error(`LTC LUT ${name} byte length ${buf.byteLength} ≠ ${LTC_LUT_BYTES}`);
    }
    return new Float32Array(buf);
  }
};

// ---------- CPU Gauss–Legendre integrator (twin of the GLSL 4-tap) ----------

/** Diffuse irradiance (×π-normalized nits→radiance) of a rect light via the
 *  quadrant-centroid 4-tap — same math as `a3d_rectGaussDiffuse`. */
export function gaussLegendreRectDiffuse(
  center: readonly [number, number, number],
  right: readonly [number, number, number],
  up: readonly [number, number, number],
  halfSize: readonly [number, number],
  rgb: readonly [number, number, number],
  worldPos: readonly [number, number, number],
  worldNormal: readonly [number, number, number]
): [number, number, number] {
  const nAxis = normalize(cross3(right, up));
  const quadrant = halfSize[0] * halfSize[1];
  const acc: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 4; i += 1) {
    const sx = i === 0 || i === 3 ? -0.25 : 0.25;
    const sy = i < 2 ? -0.25 : 0.25;
    const c: [number, number, number] = [
      center[0] + right[0] * halfSize[0] * 2 * sx + up[0] * halfSize[1] * 2 * sy,
      center[1] + right[1] * halfSize[0] * 2 * sx + up[1] * halfSize[1] * 2 * sy,
      center[2] + right[2] * halfSize[0] * 2 * sx + up[2] * halfSize[1] * 2 * sy
    ];
    const to = sub3(c, worldPos);
    const d2 = dot3(to, to);
    const l = scale3(to, 1 / Math.sqrt(Math.max(d2, 1e-6)));
    const nl = Math.max(dot3(worldNormal, l), 0);
    const cosS = Math.max(dot3(neg3(l), nAxis), 0);
    for (let ch = 0; ch < 3; ch += 1) acc[ch] += rgb[ch] * nl * quadrant * cosS / Math.max(d2, 1e-6);
  }
  return [acc[0] / Math.PI, acc[1] / Math.PI, acc[2] / Math.PI];
}

/** Dense-grid reference integration of the same rect (for the ≤10% energy check). */
export function rectDiffuseReference(
  center: readonly [number, number, number],
  right: readonly [number, number, number],
  up: readonly [number, number, number],
  halfSize: readonly [number, number],
  rgb: readonly [number, number, number],
  worldPos: readonly [number, number, number],
  worldNormal: readonly [number, number, number],
  samples = 32
): [number, number, number] {
  const nAxis = normalize(cross3(right, up));
  const area = (2 * halfSize[0]) * (2 * halfSize[1]);
  const acc: [number, number, number] = [0, 0, 0];
  for (let iy = 0; iy < samples; iy += 1) {
    for (let ix = 0; ix < samples; ix += 1) {
      const fx = ((ix + 0.5) / samples) * 2 - 1;
      const fy = ((iy + 0.5) / samples) * 2 - 1;
      const c: [number, number, number] = [
        center[0] + right[0] * halfSize[0] * fx + up[0] * halfSize[1] * fy,
        center[1] + right[1] * halfSize[0] * fx + up[1] * halfSize[1] * fy,
        center[2] + right[2] * halfSize[0] * fx + up[2] * halfSize[1] * fy
      ];
      const to = sub3(c, worldPos);
      const d2 = dot3(to, to);
      const l = scale3(to, 1 / Math.sqrt(Math.max(d2, 1e-6)));
      const nl = Math.max(dot3(worldNormal, l), 0);
      const cosS = Math.max(dot3(neg3(l), nAxis), 0);
      for (let ch = 0; ch < 3; ch += 1) acc[ch] += rgb[ch] * nl * cosS / Math.max(d2, 1e-6);
    }
  }
  const dw = area / (samples * samples);
  return [acc[0] * dw / Math.PI, acc[1] * dw / Math.PI, acc[2] * dw / Math.PI];
}

function cross3(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
function dot3(a: readonly number[], b: readonly number[]): number { return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!; }
function sub3(a: readonly number[], b: readonly number[]): [number, number, number] { return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]; }
function neg3(a: readonly number[]): [number, number, number] { return [-a[0]!, -a[1]!, -a[2]!]; }
function scale3(a: readonly number[], s: number): [number, number, number] { return [a[0]! * s, a[1]! * s, a[2]! * s]; }
function normalize(a: readonly number[]): [number, number, number] { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; }

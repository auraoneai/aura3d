/**
 * Locally generated rectangle-light lookup data.
 *
 * The coefficients are an Aura3D approximation to a linearly transformed
 * cosine density, fitted to an isotropic GGX/height-correlated-Smith lobe.
 * For direction L in the local N/V frame, the inverse transform is
 *
 *     q = (L.x + shear*L.z, stretch*L.y, scale*L.z)
 *     p(L) = scale*stretch*max(q.z,0)/(pi*dot(q,q)^2).
 *
 * This density integrates to one over the visible hemisphere. A small,
 * deterministic weighted maximum-likelihood fit over GGX importance samples
 * chooses scale/stretch/shear at a 16x16 set of roughness/view angles; the
 * stored 64x64 matrix is bilinear interpolation of those parameters. This is
 * a bounded approximation, not a claim of an exact area-light integral.
 * The companion texture stores the separately integrated GGX split-sum A/B.
 * No network, source asset, or external-engine lookup is used.
 */

import type { RenderDevice } from "../RenderDevice";
import { Texture } from "../Texture";
import { integrateGgxDfg } from "../program/DFGLutData";

export interface LtcLutTextures {
  /** Packed inverse-transform matrix (m22, m20, m11, m02). */
  readonly mInv: Texture;
  /** GGX Fresnel directional-albedo scale and bias in R/G. */
  readonly fresnel: Texture;
}

/** @deprecated The data is generated in-process; this is an identifier, not a network URL. */
export const LTC_LUT_SOURCE_URL = "aura3d:generated/ltc-v1";
export const LTC_LUT_SIZE = 64;
/** Byte length of each 64×64 RGBA float32 table. */
export const LTC_LUT_BYTES = LTC_LUT_SIZE * LTC_LUT_SIZE * 4 * 4;

export interface LtcLutLoader {
  /** Provide one validated RGBA float32 table; no fetch is required by default. */
  fetch(name: "mInv" | "fresnel"): Promise<Float32Array>;
}

export interface GeneratedLtcLuts {
  readonly mInv: Float32Array;
  readonly fresnel: Float32Array;
}

type FitSample = readonly [number, number, number, number];
type Fit = readonly [number, number, number]; // log(scale), log(stretch), shear
const FIT_SIZE = 16;
const FIT_SAMPLES = 96;

function radicalInverse(index: number): number {
  let value = index;
  let result = 0;
  let place = 0.5;
  while (value > 0) {
    result += (value % 2) * place;
    value = Math.floor(value / 2);
    place *= 0.5;
  }
  return result;
}

function samplesForFit(alpha: number, ndotv: number): FitSample[] {
  const samples: FitSample[] = [];
  const alpha2 = alpha * alpha;
  const vx = Math.sqrt(1 - ndotv * ndotv);
  const gv = Math.sqrt(alpha2 + (1 - alpha2) * ndotv * ndotv);
  for (let i = 0; i < FIT_SAMPLES; i += 1) {
    const u = (i + 0.5) / FIT_SAMPLES;
    const phi = 2 * Math.PI * radicalInverse(i);
    const nh = Math.sqrt((1 - u) / (1 + (alpha2 - 1) * u));
    const radius = Math.sqrt(Math.max(0, 1 - nh * nh));
    const hx = radius * Math.cos(phi), hy = radius * Math.sin(phi);
    const vh = vx * hx + ndotv * nh;
    if (vh <= 0) continue;
    const lx = 2 * vh * hx - vx, ly = 2 * vh * hy, lz = 2 * vh * nh - ndotv;
    if (lz <= 0) continue;
    const gl = Math.sqrt(alpha2 + (1 - alpha2) * lz * lz);
    const g = 2 * lz * ndotv / Math.max(lz * gv + ndotv * gl, 1e-12);
    const weight = g * vh / (nh * ndotv);
    samples.push([lx, ly, lz, weight]);
  }
  return samples;
}

function fitLoss(fit: Fit, samples: readonly FitSample[]): number {
  const scale = Math.exp(fit[0]), stretch = Math.exp(fit[1]), shear = fit[2];
  let score = 0;
  for (const [x, y, z, weight] of samples) {
    const qx = x + shear * z, qy = stretch * y, qz = scale * z;
    const q2 = qx * qx + qy * qy + qz * qz;
    // -log(p), omitting constants common to every candidate.
    score += weight * (2 * Math.log(Math.max(q2, 1e-24)) - 2 * fit[0] - fit[1] - Math.log(z));
  }
  return score;
}

function fitGgxLobe(alpha: number, ndotv: number): Fit {
  const samples = samplesForFit(alpha, ndotv);
  let fit: Fit = [Math.log(Math.max(0.025, alpha)), 0, Math.sqrt(1 - ndotv * ndotv) / ndotv];
  let best = fitLoss(fit, samples);
  for (const step of [1, 0.5, 0.25, 0.125, 0.0625]) {
    for (let axis = 0; axis < 3; axis += 1) {
      for (const sign of [-1, 1]) {
        const candidate = [...fit] as [number, number, number];
        candidate[axis] = candidate[axis]! + sign * step * (axis === 2 ? Math.max(1, Math.abs(fit[2])) : 1);
        candidate[0] = Math.max(-5, Math.min(2, candidate[0]));
        candidate[1] = Math.max(-4, Math.min(4, candidate[1]));
        candidate[2] = Math.max(0, Math.min(40, candidate[2]));
        const loss = fitLoss(candidate, samples);
        if (loss < best) { fit = candidate; best = loss; }
      }
    }
  }
  return fit;
}

function interpolateFit(fits: readonly Fit[], alpha: number, theta: number): Fit {
  const fx = Math.max(0, Math.min(FIT_SIZE - 1, alpha * (FIT_SIZE - 1)));
  const fy = Math.max(0, Math.min(FIT_SIZE - 1, theta * (2 / Math.PI) * (FIT_SIZE - 1)));
  const x0 = Math.floor(fx), x1 = Math.min(FIT_SIZE - 1, x0 + 1);
  const y0 = Math.floor(fy), y1 = Math.min(FIT_SIZE - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const p00 = fits[y0 * FIT_SIZE + x0]!, p10 = fits[y0 * FIT_SIZE + x1]!;
  const p01 = fits[y1 * FIT_SIZE + x0]!, p11 = fits[y1 * FIT_SIZE + x1]!;
  return [0, 1, 2].map((i) =>
    (p00[i]! * (1 - tx) + p10[i]! * tx) * (1 - ty) +
    (p01[i]! * (1 - tx) + p11[i]! * tx) * ty
  ) as [number, number, number];
}

/**
 * Build independent RGBA32F lookup tables. X is roughness², Y is acos(N·V)/π,
 * matching the current shader coordinates. The second half of Y is clamped at
 * the horizon; the view angle is never below N·V = 0.025. Matrix parameters
 * are positive and finite, and the A/B pair sums to at most one.
 */
export function generateLtcLutData(): GeneratedLtcLuts {
  const fits: Fit[] = [];
  for (let y = 0; y < FIT_SIZE; y += 1) {
    const ndotv = Math.max(0.025, Math.cos(y / (FIT_SIZE - 1) * Math.PI / 2));
    for (let x = 0; x < FIT_SIZE; x += 1) {
      fits.push(fitGgxLobe(Math.max(0.025, x / (FIT_SIZE - 1)), ndotv));
    }
  }
  const mInv = new Float32Array(LTC_LUT_SIZE * LTC_LUT_SIZE * 4);
  const fresnel = new Float32Array(mInv.length);
  let previousTheta = -1;
  for (let y = 0; y < LTC_LUT_SIZE; y += 1) {
    const theta = Math.min(Math.acos(0.025), y / (LTC_LUT_SIZE - 1) * Math.PI);
    if (theta === previousTheta) {
      const row = y * LTC_LUT_SIZE * 4, prior = row - LTC_LUT_SIZE * 4;
      mInv.copyWithin(row, prior, row);
      fresnel.copyWithin(row, prior, row);
      continue;
    }
    previousTheta = theta;
    const ndotv = Math.max(0.025, Math.cos(theta));
    for (let x = 0; x < LTC_LUT_SIZE; x += 1) {
      const alpha = x / (LTC_LUT_SIZE - 1);
      const fit = interpolateFit(fits, alpha, theta);
      const offset = (y * LTC_LUT_SIZE + x) * 4;
      mInv[offset] = Math.exp(fit[0]);
      mInv[offset + 1] = 0;
      mInv[offset + 2] = Math.exp(fit[1]);
      mInv[offset + 3] = fit[2];
      const [a, b] = integrateGgxDfg(Math.sqrt(alpha), ndotv, 1024);
      fresnel[offset] = a;
      fresnel[offset + 1] = b;
      fresnel[offset + 2] = 0;
      fresnel[offset + 3] = 1;
    }
  }
  return { mInv, fresnel };
}

interface CacheEntry {
  readonly promise: Promise<LtcLutTextures>;
  value?: LtcLutTextures;
}
const perDevice = new WeakMap<RenderDevice, CacheEntry>();
let generated: GeneratedLtcLuts | undefined;

/**
 * Lazily create the lookup textures, sharing pending/completed work per device.
 * Invalid custom data and rejected loads are evicted so callers can retry;
 * disposed texture pairs are recreated on the next request.
 */
export function fetchLtcLutTextures(device: RenderDevice, loader?: LtcLutLoader): Promise<LtcLutTextures> {
  const cached = perDevice.get(device);
  if (cached && (!cached.value || (!cached.value.mInv.disposed && !cached.value.fresnel.disposed))) return cached.promise;
  // Promise callbacks run after the entry is installed, even for synchronous
  // generation and reentrant or synchronously throwing custom loaders.
  const promise = Promise.resolve().then(async (): Promise<LtcLutTextures> => {
    let mInv: Float32Array, fresnel: Float32Array;
    if (loader) {
      [mInv, fresnel] = await Promise.all([loader.fetch("mInv"), loader.fetch("fresnel")]);
    } else {
      generated ??= generateLtcLutData();
      ({ mInv, fresnel } = generated);
    }
    for (const [name, data] of [["mInv", mInv], ["fresnel", fresnel]] as const) {
      if (!(data instanceof Float32Array) || data.length !== LTC_LUT_SIZE * LTC_LUT_SIZE * 4) {
        throw new Error(`LTC LUT ${name} size mismatch: expected ${LTC_LUT_SIZE * LTC_LUT_SIZE * 4} float32 values`);
      }
      if (!data.every(Number.isFinite)) throw new Error(`LTC LUT ${name} contains a non-finite value`);
      for (let i = 0; i < data.length; i += 4) {
        if (name === "mInv") {
          // Matrix layout is [m22,m20,m11,m02], with m00 fixed to 1.
          const determinant = data[i + 2]! * (data[i]! - data[i + 1]! * data[i + 3]!);
          if (!(determinant > 0)) throw new Error("LTC LUT mInv contains a singular or reflected matrix");
        } else if (data[i]! < 0 || data[i + 1]! < 0 || data[i]! + data[i + 1]! > 1.000001) {
          throw new Error("LTC LUT fresnel contains out-of-range coefficients");
        }
      }
    }
    const value = { mInv: lutTexture(mInv, "u_prd02LtcMInv"), fresnel: lutTexture(fresnel, "u_prd02LtcFresnel") };
    entry.value = value;
    return value;
  }).catch((error: unknown) => {
    if (perDevice.get(device) === entry) perDevice.delete(device);
    throw error;
  });
  const entry: CacheEntry = { promise };
  perDevice.set(device, entry);
  return promise;
}

function lutTexture(data: Float32Array, label: string): Texture {
  return new Texture({
    width: LTC_LUT_SIZE,
    height: LTC_LUT_SIZE,
    format: "rgba32f",
    colorSpace: "linear",
    generateMipmaps: false,
    label,
    mipLevels: [{ width: LTC_LUT_SIZE, height: LTC_LUT_SIZE, data }]
  });
}

// ---------- CPU Gauss–Legendre integrator (twin of the GLSL 4-tap) ----------

/** Diffuse radiance from a rectangular emitter using the tensor product of
 *  two-point Gauss–Legendre quadrature, matching `a3d_rectGaussDiffuse`. */
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
  const weight = halfSize[0] * halfSize[1];
  const offset = 1 / Math.sqrt(3);
  const acc: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 4; i += 1) {
    const sx = i === 0 || i === 3 ? -offset : offset;
    const sy = i < 2 ? -offset : offset;
    const c: [number, number, number] = [
      center[0] + right[0] * halfSize[0] * sx + up[0] * halfSize[1] * sy,
      center[1] + right[1] * halfSize[0] * sx + up[1] * halfSize[1] * sy,
      center[2] + right[2] * halfSize[0] * sx + up[2] * halfSize[1] * sy
    ];
    const to = sub3(c, worldPos);
    const d2 = dot3(to, to);
    const l = scale3(to, 1 / Math.sqrt(Math.max(d2, 1e-6)));
    const nl = Math.max(dot3(worldNormal, l), 0);
    const cosS = Math.max(dot3(neg3(l), nAxis), 0);
    for (let ch = 0; ch < 3; ch += 1) acc[ch] += rgb[ch] * nl * weight * cosS / Math.max(d2, 1e-6);
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

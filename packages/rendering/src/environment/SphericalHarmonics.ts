/**
 * PRD-02 §7.1 — SH9 helpers for the environment path.
 * Re-exports the C-09 working projection/evaluation from contracts and adds
 * the pieces the CPU pipeline needs: basis evaluation, the irradiance
 * basis fold (Ahat_l per-band scale), radiance evaluation, equirect
 * projection, and the cosine convolution (band multipliers π, 2π/3, π/4).
 */
import { evaluateSH9Irradiance } from "../contracts/environment.js";

export { evaluateSH9Irradiance };

/**
 * Cube → SH9 projection. Lives here (not `contracts/environment.ts`, owned by
 * lane 01) because the contract version carries a `4/(len²·F²)` weight that
 * under-weights off-axis texels by ~22%; the correct texel solid angle is
 * `4/(len³·F²)` (du=dv=2/F over the unnormalized direction). qr-request
 * `to:prd01` tracks the contract fix; until it lands the lane barrel exports
 * this corrected implementation.
 */
export function projectCubeToSH9(faces: readonly Float32Array[], faceSize: number): Float32Array {
  const out = new Float32Array(27);
  const step = 2 / faceSize;
  for (let f = 0; f < 6; f += 1) {
    const face = faces[f];
    if (!face) continue;
    const [n, u, v] = FACE_BASIS[f]!;
    for (let y = 0; y < faceSize; y += 1) {
      const fv = (y + 0.5) * step - 1;
      for (let x = 0; x < faceSize; x += 1) {
        const fu = (x + 0.5) * step - 1;
        const dx = n[0] + u[0] * fu + v[0] * fv;
        const dy = n[1] + u[1] * fu + v[1] * fv;
        const dz = n[2] + u[2] * fu + v[2] * fv;
        const len = Math.hypot(dx, dy, dz);
        const weight = 4 / (len * len * len * faceSize * faceSize);
        const i = (y * faceSize + x) * 4;
        accumulateBasis(out, dx / len, dy / len, dz / len, face[i]!, face[i + 1]!, face[i + 2]!, weight);
      }
    }
  }
  return out;
}

const FACE_BASIS = [
  [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
  [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
  [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
  [[0, 0, -1], [0, -1, 0], [1, 0, 0]]
] as const;

function accumulateBasis(out: Float32Array, x: number, y: number, z: number, r: number, g: number, b: number, w: number): void {
  const basis = [
    0.282095,
    -0.488603 * y,
    0.488603 * z,
    -0.488603 * x,
    1.092548 * x * y,
    1.092548 * y * z,
    0.315392 * (3 * z * z - 1),
    1.092548 * x * z,
    0.546274 * (x * x - y * y)
  ];
  for (let i = 0; i < 9; i += 1) {
    // Contract layout: interleaved [coefficient·3 + channel] (r,g,b per basis).
    out[i * 3] = out[i * 3]! + basis[i]! * r * w;
    out[i * 3 + 1] = out[i * 3 + 1]! + basis[i]! * g * w;
    out[i * 3 + 2] = out[i * 3 + 2]! + basis[i]! * b * w;
  }
}

export const SH9_BANDS = 9;

/**
 * Real SH basis in the contract order:
 * c0, −c1·y, c1·z, −c1·x, c2·xy, c2·yz, c3·(3z²−1), c2·xz, c4·(x²−y²).
 */
export function sh9Basis(x: number, y: number, z: number, out: Float32Array | number[] = new Float32Array(9)): Float32Array | number[] {
  const c0 = 0.282095;
  const c1 = 0.488603;
  const c2 = 1.092548;
  const c3 = 0.315392;
  const c4 = 0.546274;
  out[0] = c0;
  out[1] = -c1 * y;
  out[2] = c1 * z;
  out[3] = -c1 * x;
  out[4] = c2 * x * y;
  out[5] = c2 * y * z;
  out[6] = c3 * (3 * z * z - 1);
  out[7] = c2 * x * z;
  out[8] = c4 * (x * x - y * y);
  return out;
}

/** Cosine-convolution band multipliers A_l = {π, 2π/3, π/4} in contract coefficient order. */
export const SH9_IRRADIANCE_BASIS_SCALE: readonly number[] = [
  Math.PI,
  (2 * Math.PI) / 3, (2 * Math.PI) / 3, (2 * Math.PI) / 3,
  Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4
];

/** basis × Ahat — the folded irradiance kernel evaluated at a direction. */
export function foldIrradianceBasis(x: number, y: number, z: number): Float32Array {
  const b = sh9Basis(x, y, z) as Float32Array;
  for (let i = 0; i < 9; i += 1) b[i] *= SH9_IRRADIANCE_BASIS_SCALE[i]!;
  return b;
}

/** Radiance (unconvolved) evaluation of a 27-float SH9 coefficient set. */
export function evaluateSH9Radiance(sh: Float32Array, x: number, y: number, z: number): [number, number, number] {
  const b = sh9Basis(x, y, z);
  let r = 0, g = 0, bl = 0;
  for (let i = 0; i < 9; i += 1) {
    r += sh[i * 3]! * b[i]!;
    g += sh[i * 3 + 1]! * b[i]!;
    bl += sh[i * 3 + 2]! * b[i]!;
  }
  return [r, g, bl];
}

/**
 * Project an equirectangular radiance map to SH9. u ∈ [0,1) sweeps
 * φ ∈ [−π, π), v ∈ [0,1] sweeps θ ∈ [0, π] top-to-bottom; solid-angle
 * weight is sinθ·dφ·dθ.
 */
export function projectEquirectToSH9(
  data: Float32Array,
  width: number,
  height: number,
  channels = 4
): Float32Array {
  const sh = new Float32Array(27);
  const dPhi = (2 * Math.PI) / width;
  const dTheta = Math.PI / height;
  const basis = new Float32Array(9);
  for (let row = 0; row < height; row += 1) {
    const v = (row + 0.5) / height;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const weight = sinT * dPhi * dTheta;
    for (let col = 0; col < width; col += 1) {
      const u = (col + 0.5) / width;
      const phi = u * 2 * Math.PI - Math.PI;
      const x = -Math.cos(phi) * sinT;
      const y = Math.cos(theta);
      const z = Math.sin(phi) * sinT;
      sh9Basis(x, y, z, basis);
      const i = (row * width + col) * channels;
      for (let k = 0; k < 9; k += 1) {
        sh[k * 3] += data[i]! * basis[k]! * weight;
        sh[k * 3 + 1] += data[i + 1]! * basis[k]! * weight;
        sh[k * 3 + 2] += data[i + 2]! * basis[k]! * weight;
      }
    }
  }
  return sh;
}

/** Cosine convolution: multiply band l by A_l = {π, 2π/3, π/4}[l]. */
export function convolveSH9Irradiance(radiance: Float32Array): Float32Array {
  const bandScale = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
  const out = new Float32Array(27);
  for (let i = 0; i < 9; i += 1) {
    const l = i === 0 ? 0 : i < 4 ? 1 : 2;
    const s = bandScale[l]!;
    out[i * 3] = radiance[i * 3]! * s;
    out[i * 3 + 1] = radiance[i * 3 + 1]! * s;
    out[i * 3 + 2] = radiance[i * 3 + 2]! * s;
  }
  return out;
}

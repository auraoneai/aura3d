/**
 * PRD-02 §7.2 — spherical-harmonics helpers for the environment stack.
 *
 * The C-09 contract functions (`projectCubeToSH9`, `evaluateSH9Irradiance`)
 * are the canonical implementations — this module re-exports them so all
 * lane code has one import site, and adds the pieces the prefilter/probe
 * path needs:
 *
 *  - `projectEquirectToSH9` — same solid-angle quadrature on RGBE/float
 *    equirect inputs (HDRI sources never become cubes on the CPU path).
 *  - `irradianceConstants` / `foldIrradianceBasis` — the cosine-convolution
 *    basis weights folded into a 9-coefficient vector, so a program can
 *    upload `u_sh9[]` pre-convolved exactly as `evaluateSH9Irradiance`
 *    evaluates on the CPU (PRD-02 §8.5, "cosine constants folded").
 *  - `evaluateSH9Radiance` — band-limited *radiance* (no convolution), used
 *    by the baker's self-check.
 */
import {
  evaluateSH9Irradiance,
  projectCubeToSH9
} from "../contracts/environment";

export { evaluateSH9Irradiance, projectCubeToSH9 };

/** Number of SH bands (L0..L2) and floats per coefficient (RGB). */
export const SH9_BANDS = 9 as const;

/**
 * Real-form SH basis Y(l,m) evaluated at a unit direction, matching the
 * projection order in `accumulateSH9` (c0, -c1·y, c1·z, -c1·x, c2·xy,
 * c2·yz, c3·(3z²−1), c2·xz, c4·(x²−y²)).
 */
export function sh9Basis(x: number, y: number, z: number): Float32Array {
  const c0 = 0.282095;
  const c1 = 0.488603;
  const c2 = 1.092548;
  const c3 = 0.315392;
  const c4 = 0.546274;
  return new Float32Array([
    c0,
    -c1 * y,
    c1 * z,
    -c1 * x,
    c2 * x * y,
    c2 * y * z,
    c3 * (3 * z * z - 1),
    c2 * x * z,
    c4 * (x * x - y * y)
  ]);
}

/** Cosine-convolved basis used by `evaluateSH9Irradiance` (A(l) weighting). */
export const SH9_IRRADIANCE_BASIS_SCALE: readonly number[] = [
  0.886227,
  1.023328,
  1.023328,
  1.023328,
  0.858086,
  0.858086,
  0.247708,
  0.858086,
  0.429043
];

/**
 * The irradiance basis for a direction as raw weights on the 9 sh9
 * coefficients — i.e. `evaluateSH9Irradiance(sh, n)` equals
 * `dot(foldIrradianceBasis(n), sh)` per channel.
 */
export function foldIrradianceBasis(x: number, y: number, z: number): Float32Array {
  const basis = sh9Basis(x, y, z);
  // A(l)/Y ratios already baked into SH9_IRRADIANCE_BASIS_SCALE as emitted
  // basis values — recover weights by dividing the emitted basis by sh9Basis.
  const emitted = [
    0.886227,
    -1.023328 * y,
    1.023328 * z,
    -1.023328 * x,
    0.858086 * x * y,
    0.858086 * y * z,
    0.247708 * (3 * z * z - 1),
    0.858086 * x * z,
    0.429043 * (x * x - y * y)
  ];
  const out = new Float32Array(9);
  for (let i = 0; i < 9; i += 1) {
    out[i] = Math.abs(basis[i]!) > 1e-12 ? emitted[i]! / basis[i]! : 0;
  }
  return out;
}

/** Band-limited radiance (no cosine convolution) — used by the baker self-check. */
export function evaluateSH9Radiance(sh9: Float32Array, normal: readonly [number, number, number]): [number, number, number] {
  const basis = sh9Basis(normal[0], normal[1], normal[2]);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 9; i += 1) {
    out[0] += basis[i]! * sh9[i * 3]!;
    out[1] += basis[i]! * sh9[i * 3 + 1]!;
    out[2] += basis[i]! * sh9[i * 3 + 2]!;
  }
  return out;
}

/** Equirectangular radiance → SH9 (solid-angle-weighted; `data` is RGBA float). */
export function projectEquirectToSH9(data: Float32Array, width: number, height: number): Float32Array {
  const result = new Float32Array(27);
  const dPhi = (2 * Math.PI) / width;
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const theta = v * Math.PI;                       // 0 at top
    const sinTheta = Math.sin(theta);
    const dTheta = Math.PI / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const phi = u * 2 * Math.PI - Math.PI;         // [-π, π]
      const dirX = -Math.cos(phi) * sinTheta;        // three r185 equirect convention
      const dirY = Math.cos(theta);
      const dirZ = Math.sin(phi) * sinTheta;
      const weight = sinTheta * dPhi * dTheta;
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const basis = sh9Basis(dirX, dirY, dirZ);
      for (let c = 0; c < 9; c += 1) {
        result[c * 3] += basis[c]! * r * weight;
        result[c * 3 + 1] += basis[c]! * g * weight;
        result[c * 3 + 2] += basis[c]! * b * weight;
      }
    }
  }
  return result;
}

/** Fold the cosine-convolution weights into the sh9 itself (CPU → u_sh9 upload form). */
export function convolveSH9Irradiance(sh9: Float32Array): Float32Array {
  // Band-wise cosine convolution: l0 *= π, l1 *= 2π/3, l2 *= π/4.
  const band = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
  const out = new Float32Array(27);
  for (let i = 0; i < 9; i += 1) {
    const l = i === 0 ? 0 : i < 4 ? 1 : 2;
    for (let c = 0; c < 3; c += 1) out[i * 3 + c] = sh9[i * 3 + c]! * band[l]!;
  }
  return out;
}

/**
 * PRD-10 §8.8 / T6.6 — `SpaceSkyBake`: the `space-bake` C-09 environment source.
 *
 * CPU bake of the exact `a3d_prd10_space_bake` fragment math (constants,
 * hash functions and ramps are byte-for-byte ports — the GPU twin runs the
 * same code paths into an RGBA16F cube). Produces the 6 face planes the
 * runtime uploads and the fallback asset set under
 * `engine/assets/world/hdri/space-default-512-*`.
 *
 * Recipe (§8.8):
 * - stars: 3 magnitude bands of a hash grid, Gaussian σ=0.6 texel,
 *   peak `pow(10, -0.4·(mag−mag0))`, blackbody-ish colour ramp
 * - nebula: `fbm(domainWarp(dir·2.3), 6)` through two colour ramps, intensity
 *   clamped to 0.05–0.3 so stars stay dominant
 * - dark dust lanes subtract a second fbm term
 */
export interface SpaceSkyBakeOptions {
  readonly faceSize?: number; // default 512
  readonly seed?: number; // default 0 → u_spaceSeed
  readonly nebulaColorA?: readonly [number, number, number];
  readonly nebulaColorB?: readonly [number, number, number];
  readonly nebulaIntensity?: number; // clamped to [0.05, 0.3]
  readonly starPeak?: number; // mag0 reference luminance, default 2.4
}

export interface SpaceSkyBakeResult {
  readonly faceSize: number;
  /** Cube face order: px, nx, py, ny, pz, nz. Each `faceSize²` RGBA float32 (RGBA16F at upload). */
  readonly faces: readonly Float32Array[];
  readonly uniforms: {
    readonly seed: number;
    readonly nebulaColorA: readonly [number, number, number];
    readonly nebulaColorB: readonly [number, number, number];
    readonly nebulaIntensity: number;
    readonly starPeak: number;
  };
}

/** Manifest id the resolver probes for `space-bake` (BiomeResolver.ts). */
export const SPACE_BAKE_FALLBACK_ID = "world/space-default";

// ------------------------------------------------------- GLSL twins (CPU) --

const fract = (x: number): number => x - Math.floor(x);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const a3dHash13 = (x: number, y: number, z: number): number => {
  let px = fract(x * 0.1031), py = fract(y * 0.1031), pz = fract(z * 0.1031);
  const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32); // dot(p, p.zyx + 31.32)
  px += d; py += d; pz += d;
  return fract((px + py) * pz);
};

const a3dHash33 = (x: number, y: number, z: number): [number, number, number] => {
  let px = fract(x * 0.1031), py = fract(y * 0.1030), pz = fract(z * 0.0973);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33); // dot(p, p.yxz + 33.33)
  px += d; py += d; pz += d;
  return [fract((px + py) * pz), fract((px + pz) * py), fract((py + pz) * px)]; // (p.xxy + p.yxx) * p.zyx
};

const a3dFbm = (x0: number, y0: number, z0: number): number => {
  let sum = 0, amp = 0.5;
  let x = x0, y = y0, z = z0;
  for (let i = 0; i < 6; i++) {
    const qx = x + (a3dHash13(x + i * 0.31, y + i * 0.31, z + i * 0.31) - 0.5);
    const qy = y + (a3dHash13(y + i * 0.17, z + i * 0.17, x + i * 0.17) - 0.5); // p.yzx
    const qz = z + (a3dHash13(z + i * 0.23, x + i * 0.23, y + i * 0.23) - 0.5); // p.zxy
    sum += amp * (a3dHash13(qx, qy, qz) * 2 - 1);
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum * 0.5 + 0.5;
};

const a3dStarColor = (t: number): [number, number, number] => {
  const s = smoothstep(0, 0.5, t);
  const s2 = smoothstep(0.5, 1, t);
  return [
    mix(0.6, 1.0, s) + 0.35 * s2,
    mix(0.72, 0.95, s) + 0.1 * s2,
    mix(1.0, 0.85, s) - 0.05 * s2
  ];
};

type U = Required<SpaceSkyBakeOptions>;
const a3dSpaceStars = (dx: number, dy: number, dz: number, u: U): [number, number, number] => {
  let r = 0, g = 0, b = 0;
  for (let band = 0; band < 3; band++) {
    const cells = 24 + band * 24;
    const px = dx * cells, py = dy * cells, pz = dz * cells;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    const h = a3dHash33(cx + u.seed + band * 7.13, cy + u.seed + band * 7.13, cz + u.seed + band * 7.13);
    const mag = band * 1.6;
    const peak = Math.pow(10, -0.4 * (mag - 2.0)) * u.starPeak;
    const present = h[2] >= 0.96 - band * 0.02 ? 1 : 0; // step(0.96 - band*0.02, h.z)
    const sx = cx + 0.5 + (h[0] - 0.5) * 0.6;
    const sy = cy + 0.5 + (h[1] - 0.5) * 0.6;
    const sz = cz + 0.5 + (h[2] - 0.5) * 0.6;
    const d = Math.hypot(px - sx, py - sy, pz - sz) * cells / 24;
    const gauss = Math.exp(-(d * d) / (2 * 0.6 * 0.6));
    const c = a3dStarColor(h[1]);
    r += c[0] * gauss * peak * present;
    g += c[1] * gauss * peak * present;
    b += c[2] * gauss * peak * present;
  }
  return [r, g, b];
};

const a3dSpaceNebula = (dx: number, dy: number, dz: number, u: U): [number, number, number] => {
  const n = a3dFbm(dx * 2.3 + u.seed * 0.1, dy * 2.3 + u.seed * 0.1, dz * 2.3 + u.seed * 0.1);
  const dust = a3dFbm(dx * 1.1 - u.seed * 0.2, dy * 1.1 - u.seed * 0.2, dz * 1.1 - u.seed * 0.2);
  const A = u.nebulaColorA, B = u.nebulaColorB;
  return [
    Math.max(mix(A[0], B[0], n) * u.nebulaIntensity - dust * 0.4 * u.nebulaIntensity, 0),
    Math.max(mix(A[1], B[1], n) * u.nebulaIntensity - dust * 0.4 * u.nebulaIntensity, 0),
    Math.max(mix(A[2], B[2], n) * u.nebulaIntensity - dust * 0.4 * u.nebulaIntensity, 0)
  ];
};

const a3dSpaceBakeFace = (d: [number, number, number], u: U): [number, number, number] => {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const [x, y, z] = [d[0] / l, d[1] / l, d[2] / l];
  const s = a3dSpaceStars(x, y, z, u);
  const n = a3dSpaceNebula(x, y, z, u);
  return [s[0] + n[0], s[1] + n[1], s[2] + n[2]];
};

/** Cubemap face direction basis (px, nx, py, ny, pz, nz; row-major u→, v↓). */
export const SPACE_CUBE_FACES = [
  "px", "nx", "py", "ny", "pz", "nz"
] as const;

const faceDir = (face: number, u: number, v: number): [number, number, number] => {
  switch (face) {
    case 0: return [1, -v, -u];   // +X
    case 1: return [-1, -v, u];   // -X
    case 2: return [u, 1, v];     // +Y
    case 3: return [u, -1, -v];   // -Y
    case 4: return [u, -v, 1];    // +Z
    default: return [-u, -v, -1]; // -Z
  }
};

/**
 * Bake all 6 faces on CPU. `faceSize` ≤ 1024; `O(faceSize²·6)` — a 512 bake is
 * ~1.5 M pixel evals, fine for the one-shot fallback asset and the bake tool.
 */
export function bakeSpaceSky(options: SpaceSkyBakeOptions = {}): SpaceSkyBakeResult {
  const u: U = {
    faceSize: options.faceSize ?? 512,
    seed: options.seed ?? 0,
    nebulaColorA: options.nebulaColorA ?? [0.07, 0.09, 0.16],
    nebulaColorB: options.nebulaColorB ?? [0.35, 0.12, 0.4],
    nebulaIntensity: clamp(options.nebulaIntensity ?? 0.18, 0.05, 0.3),
    starPeak: options.starPeak ?? 2.4
  };
  const faces: Float32Array[] = [];
  for (let f = 0; f < 6; f++) {
    const data = new Float32Array(u.faceSize * u.faceSize * 4);
    for (let y = 0; y < u.faceSize; y++) {
      for (let x = 0; x < u.faceSize; x++) {
        const d = faceDir(f, (x + 0.5) / u.faceSize * 2 - 1, (y + 0.5) / u.faceSize * 2 - 1);
        const c = a3dSpaceBakeFace(d, u);
        const o = (y * u.faceSize + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 1;
      }
    }
    faces.push(data);
  }
  return {
    faceSize: u.faceSize,
    faces,
    uniforms: {
      seed: u.seed,
      nebulaColorA: u.nebulaColorA,
      nebulaColorB: u.nebulaColorB,
      nebulaIntensity: u.nebulaIntensity,
      starPeak: u.starPeak
    }
  };
}

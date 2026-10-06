/**
 * PRD-02 §7.2 / §16 — CPU GGX filtered-importance-sampling prefilter.
 * Runs in a worker (`environments bake` and the runtime fallback when
 * `EXT_color_buffer_float` is missing). No average blend anywhere (E6):
 * every mip is integrated from mip 0 with the GGX kernel, never by
 * averaging the previous level.
 *
 * Mip floor 16 px (E4): levels shrink to ≥ 16 × 16 per face.
 * `roughnessToLod`/`lodToRoughness` follow three's `(N-1)·r·(2-r)` curve
 * so chunk code and this filter agree on the same mip for a roughness.
 */

export const PREFILTER_MIP_FLOOR = 16;

export interface PrefilterCubeSource {
  readonly faceSize: number;
  readonly faces: readonly Float32Array[];   // 6 × faceSize² × 4 (RGBA float, linear)
}

export interface PrefilterResult {
  readonly faceSize: number;
  readonly mipCount: number;
  /** levels[0] is the source; levels[m] faceSize = max(PREFILTER_MIP_FLOOR, F >> m). */
  readonly levels: readonly { readonly faceSize: number; readonly faces: readonly Float32Array[] }[];
}

export function mipCountForFaceSize(faceSize: number): number {
  let count = 0;
  let size = faceSize;
  while (size >= PREFILTER_MIP_FLOOR) {
    count += 1;
    size = size >> 1;
    if (size < PREFILTER_MIP_FLOOR && count === 0) count = 1;
    if (size < PREFILTER_MIP_FLOOR) break;
  }
  return Math.max(1, count);
}

/** (N−1)·r·(2−r), same curve three's PMREM uses for textureQueryLOD. */
export function roughnessToLod(roughness: number, mipCount: number): number {
  const r = Math.min(1, Math.max(0, roughness));
  return (mipCount - 1) * r * (2 - r);
}
export function lodToRoughness(lod: number, mipCount: number): number {
  if (mipCount <= 1) return 0;
  const l = Math.min(1, Math.max(0, lod / (mipCount - 1)));
  return 1 - Math.sqrt(1 - l);
}

/** Roughness assigned to mip level m of an N-level chain (midpoint of the lod interval). */
export function mipRoughness(level: number, mipCount: number): number {
  if (mipCount <= 1) return 0;
  const lod = level - 0.5; // texel center in lod space
  return lodToRoughness(Math.max(0, lod), mipCount);
}

/** Face basis (same convention as contracts/environment.ts projectCubeToSH9). */
const FACE_BASIS = [
  [[1, 0, 0], [0, -1, 0], [0, 0, -1]],
  [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
  [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
  [[0, 0, -1], [0, -1, 0], [1, 0, 0]]
] as const;

export function faceUvToDir(face: number, u: number, v: number): [number, number, number] {
  const [n, ux, vx] = FACE_BASIS[face]!;
  const dx = n[0] + ux[0] * u + vx[0] * v;
  const dy = n[1] + ux[1] * u + vx[1] * v;
  const dz = n[2] + ux[2] * u + vx[2] * v;
  const len = Math.hypot(dx, dy, dz);
  return [dx / len, dy / len, dz / len];
}

/** Nearest-texel cube sample (FIS evaluates the source kernel, no filtering needed at these counts). */
export function sampleCube(source: PrefilterCubeSource, dir: readonly [number, number, number]): [number, number, number] {
  const ax = Math.abs(dir[0]);
  const ay = Math.abs(dir[1]);
  const az = Math.abs(dir[2]);
  let face = 0;
  let u = 0;
  let v = 0;
  if (ax >= ay && ax >= az) {
    face = dir[0] > 0 ? 0 : 1;
    u = dir[0] > 0 ? -dir[2] / ax : dir[2] / ax;
    v = -dir[1] / ax;
  } else if (ay >= ax && ay >= az) {
    face = dir[1] > 0 ? 2 : 3;
    u = dir[0] / ay;
    v = dir[1] > 0 ? dir[2] / ay : -dir[2] / ay;
  } else {
    face = dir[2] > 0 ? 4 : 5;
    u = dir[2] > 0 ? dir[0] / az : -dir[0] / az;
    v = -dir[1] / az;
  }
  const size = source.faceSize;
  const x = Math.min(size - 1, Math.max(0, Math.floor((u * 0.5 + 0.5) * size)));
  const y = Math.min(size - 1, Math.max(0, Math.floor((v * 0.5 + 0.5) * size)));
  const i = (y * size + x) * 4;
  const data = source.faces[face]!;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

/** Bilinear cube sample — used when the source is coarser than 4× the output. */
export function sampleCubeBilinear(source: PrefilterCubeSource, dir: readonly [number, number, number]): [number, number, number] {
  const ax = Math.abs(dir[0]);
  const ay = Math.abs(dir[1]);
  const az = Math.abs(dir[2]);
  let face = 0;
  let u = 0;
  let v = 0;
  if (ax >= ay && ax >= az) {
    face = dir[0] > 0 ? 0 : 1;
    u = dir[0] > 0 ? -dir[2] / ax : dir[2] / ax;
    v = -dir[1] / ax;
  } else if (ay >= ax && ay >= az) {
    face = dir[1] > 0 ? 2 : 3;
    u = dir[0] / ay;
    v = dir[1] > 0 ? dir[2] / ay : -dir[2] / ay;
  } else {
    face = dir[2] > 0 ? 4 : 5;
    u = dir[2] > 0 ? dir[0] / az : -dir[0] / az;
    v = -dir[1] / az;
  }
  const size = source.faceSize;
  const fx = (u * 0.5 + 0.5) * size - 0.5;
  const fy = (v * 0.5 + 0.5) * size - 0.5;
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(fy)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const data = source.faces[face]!;
  const at = (x: number, y: number, c: number) => data[(y * size + x) * 4 + c]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const top = at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx;
    const bottom = at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx;
    out[c] = top * (1 - ty) + bottom * ty;
  }
  return out;
}

/** Hammersley point set (radical inverse, base 2). */
function hammersley(i: number, n: number): [number, number] {
  let bits = i;
  let inv = 0;
  let denom = 0.5;
  while (bits > 0) {
    inv += (bits & 1) * denom;
    bits >>= 1;
    denom *= 0.5;
  }
  return [i / n, inv];
}

/** GGX importance sample direction around +Z (tangent space), alpha = roughness². */
function importanceSampleGGX(xi1: number, xi2: number, roughness: number): [number, number, number] {
  const alpha = roughness * roughness;
  const phi = 2 * Math.PI * xi1;
  const cosTheta = Math.sqrt((1 - xi2) / (1 + (alpha * alpha - 1) * xi2));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return [sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta];
}

function tangentBasis(n: readonly [number, number, number]): [[number, number, number], [number, number, number]] {
  const up: [number, number, number] = Math.abs(n[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
  const t: [number, number, number] = [
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0]
  ];
  const tl = Math.hypot(t[0], t[1], t[2]);
  const tn: [number, number, number] = [t[0] / tl, t[1] / tl, t[2] / tl];
  const b: [number, number, number] = [
    n[1] * tn[2] - n[2] * tn[1],
    n[2] * tn[0] - n[0] * tn[2],
    n[0] * tn[1] - n[1] * tn[0]
  ];
  return [tn, b];
}

export interface PrefilterOptions {
  /** Samples per output texel; 64 default (bake path uses 128). */
  readonly samples?: number;
  readonly onProgress?: (level: number, face: number) => void;
}

/** Full chain: mip 0 = source copy; each later level is a GGX FIS integration from mip 0. */
export function prefilterCubeGGX(source: PrefilterCubeSource, options: PrefilterOptions = {}): PrefilterResult {
  const mipCount = mipCountForFaceSize(source.faceSize);
  const levels: { faceSize: number; faces: Float32Array[] }[] = [
    { faceSize: source.faceSize, faces: source.faces.map((f) => f.slice()) }
  ];
  for (let level = 1; level < mipCount; level += 1) {
    const size = Math.max(PREFILTER_MIP_FLOOR, source.faceSize >> level);
    const roughness = mipRoughness(level, mipCount);
    const faces = prefilterLevelGGX(source, size, roughness, options.samples ?? 64, (face) => options.onProgress?.(level, face));
    levels.push({ faceSize: size, faces });
  }
  return { faceSize: source.faceSize, mipCount, levels };
}

/** One mip level: GGX FIS around each output direction, sampling mip 0 only. */
export function prefilterLevelGGX(
  source: PrefilterCubeSource,
  size: number,
  roughness: number,
  samples: number,
  onFace?: (face: number) => void
): Float32Array[] {
  const faces: Float32Array[] = [];
  const effectiveRoughness = Math.max(1e-3, roughness);
  for (let face = 0; face < 6; face += 1) {
    onFace?.(face);
    const out = new Float32Array(size * size * 4);
    const step = 2 / size;
    for (let y = 0; y < size; y += 1) {
      const v = (y + 0.5) * step - 1;
      for (let x = 0; x < size; x += 1) {
        const u = (x + 0.5) * step - 1;
        const n = faceUvToDir(face, u, v);
        const [t, b] = tangentBasis(n);
        let r = 0, g = 0, bl = 0, wSum = 0;
        for (let s = 0; s < samples; s += 1) {
          const [xi1, xi2] = hammersley(s, samples);
          const h = importanceSampleGGX(xi1, xi2, effectiveRoughness);
          // Half-vector → incident direction l = 2·(n·h)·h − n (reflect about h).
          const hw: [number, number, number] = [
            t[0] * h[0] + b[0] * h[1] + n[0] * h[2],
            t[1] * h[0] + b[1] * h[1] + n[1] * h[2],
            t[2] * h[0] + b[2] * h[1] + n[2] * h[2]
          ];
          const ndh = Math.max(0, n[0] * hw[0] + n[1] * hw[1] + n[2] * hw[2]);
          if (ndh <= 0) continue;
          const l: [number, number, number] = [
            2 * ndh * hw[0] - n[0],
            2 * ndh * hw[1] - n[1],
            2 * ndh * hw[2] - n[2]
          ];
          const ndl = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
          if (ndl <= 0) continue;
          const [sr, sg, sb] = sampleCube(source, l);
          r += sr * ndl;
          g += sg * ndl;
          bl += sb * ndl;
          wSum += ndl;
        }
        const i = (y * size + x) * 4;
        if (wSum > 0) {
          out[i] = r / wSum;
          out[i + 1] = g / wSum;
          out[i + 2] = bl / wSum;
        } else {
          const [sr, sg, sb] = sampleCube(source, n);
          out[i] = sr; out[i + 1] = sg; out[i + 2] = sb;
        }
        out[i + 3] = 1;
      }
    }
    faces.push(out);
  }
  return faces;
}

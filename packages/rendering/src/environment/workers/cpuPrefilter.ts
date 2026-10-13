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
  let count = 1;
  let size = faceSize;
  while ((size >> 1) >= PREFILTER_MIP_FLOOR) {
    count += 1;
    size >>= 1;
  }
  return count;
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

/** Roughness assigned to mip level m: the lod curve inverted at lod = m. */
export function mipRoughness(level: number, mipCount: number): number {
  if (mipCount <= 1) return 0;
  return lodToRoughness(level, mipCount);
}

/**
 * GL cube-map face basis (OpenGL ES 3.0 §3.8.10 major-axis table), shared by
 * every lane-02 cube writer and reader: face f's texel at (u, v) ∈ [-1, 1]²
 * (u → +s, v → +t, row 0 = t at −1) looks along `n + u·U + v·V`.
 *   +X: sc = −z, tc = −y   −X: sc = +z, tc = −y
 *   +Y: sc = +x, tc = +z   −Y: sc = +x, tc = −z
 *   +Z: sc = +x, tc = −y   −Z: sc = −x, tc = −y
 * This is the inverse of `sampleCube` exactly (round trip 0 mismatches) and
 * what the GPU samples, so CPU-built faces upload without transposition.
 * (The previous table had U and V swapped on every face.)
 */
export const CUBE_FACE_BASIS = [
  [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, -1, 0]]
] as const;
const FACE_BASIS = CUBE_FACE_BASIS;

export function faceUvToDir(face: number, u: number, v: number): [number, number, number] {
  const [n, ux, vx] = FACE_BASIS[face]!;
  const dx = n[0] + ux[0] * u + vx[0] * v;
  const dy = n[1] + ux[1] * u + vx[1] * v;
  const dz = n[2] + ux[2] * u + vx[2] * v;
  const len = Math.hypot(dx, dy, dz);
  return [dx / len, dy / len, dz / len];
}

/**
 * E3 parity gap — filtered importance sampling needs a footprint, not
 * pointwise mip-0 texels: with nearest sampling, a 64-sample Hammersley set
 * over a wide GGX kernel hits or misses small bright panels (room panels
 * reach ~100x the mean radiance) independently per output texel, so the
 * roughest mip's mean texel-to-texel delta measured 43% of its mean
 * radiance (the high-roughness speckle in L4 captures; three's PMREM
 * prefilters its fetches by solid angle instead). The prefilter therefore
 * samples a box-filtered pyramid of the source (within-face 2x2 means,
 * which preserve per-face mean radiance exactly) at the pyramid level
 * matching the output mip's roughness, with bilinear interpolation.
 * `sampleCube` below stays the nearest-texel inverse of `faceUvToDir`
 * (round-trip contract + probeToEquirect); only the FIS integrator
 * changes. Flag-off production never builds probes, so no legacy pixels
 * move; baked presets pick this up on their next `environments bake`.
 */
interface CubePyramidLevel { readonly faceSize: number; readonly faces: readonly Float32Array[] }
const sourcePyramids = new WeakMap<PrefilterCubeSource, readonly CubePyramidLevel[]>();

function downsampleFace2x2(face: Float32Array, size: number): Float32Array {
  const half = size >> 1;
  const out = new Float32Array(half * half * 4);
  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      const i00 = ((2 * y) * size + 2 * x) * 4;
      const o = (y * half + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        out[o + c] = 0.25 * (face[i00 + c]! + face[i00 + 4 + c]! + face[i00 + size * 4 + c]! + face[i00 + size * 4 + 4 + c]!);
      }
    }
  }
  return out;
}

function sourcePyramid(source: PrefilterCubeSource): readonly CubePyramidLevel[] {
  const cached = sourcePyramids.get(source);
  if (cached) return cached;
  const levels: CubePyramidLevel[] = [{ faceSize: source.faceSize, faces: source.faces }];
  let current = levels[0]!;
  // One octave below the output mip floor: the roughest output level
  // samples one level coarser than its own scale (see prefilterLevelGGX).
  while ((current.faceSize >> 1) >= PREFILTER_MIP_FLOOR / 2) {
    const size = current.faceSize >> 1;
    current = { faceSize: size, faces: current.faces.map((face) => downsampleFace2x2(face, size * 2)) };
    levels.push(current);
  }
  sourcePyramids.set(source, levels);
  return levels;
}

/** Bilinear cube sample on one pyramid level (same face/uv convention as `sampleCube`, edges clamped within the face). */
function sampleCubeBilinear(level: CubePyramidLevel, dir: readonly [number, number, number]): [number, number, number] {
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
  const size = level.faceSize;
  const px = Math.min(size - 1, Math.max(0, (u * 0.5 + 0.5) * size - 0.5));
  const py = Math.min(size - 1, Math.max(0, (v * 0.5 + 0.5) * size - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const fx = px - x0, fy = py - y0;
  const data = level.faces[face]!;
  const at = (x: number, y: number, c: number) => data[(y * size + x) * 4 + c]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const top = at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx;
    const bottom = at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

/** Nearest-texel cube sample (FIS evaluates the source kernel pointwise). */
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

/** GGX importance sample around +Z (tangent space), alpha = roughness². */
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

/** One mip level: GGX FIS around each output direction, sampling the
 * source pyramid level whose texel footprint matches this roughness
 * (E3 parity gap; previously pointwise mip-0 nearest — see above). */
export function prefilterLevelGGX(
  source: PrefilterCubeSource,
  size: number,
  roughness: number,
  samples: number,
  onFace?: (face: number) => void
): Float32Array[] {
  const faces: Float32Array[] = [];
  const effectiveRoughness = Math.max(1e-3, roughness);
  const pyramid = sourcePyramid(source);
  // Footprint one octave coarser than the output mip's own scale (the
  // lod curve over the *output* chain, +1 into the pyramid): a GGX kernel
  // at this roughness integrates over a solid angle wider than one output
  // texel, and three's PMREM blur likewise fetches above the output level.
  // Sampling at the output scale alone left the roughest level's neighbor
  // delta at 26% of mean (measured); the extra octave pre-averages the
  // bright panels that dominate the Monte Carlo variance.
  const outputLod = Math.round(roughnessToLod(effectiveRoughness, mipCountForFaceSize(source.faceSize)));
  const footprint = pyramid[Math.min(pyramid.length - 1, outputLod + 1)]!;
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
          const [sr, sg, sb] = sampleCubeBilinear(footprint, l);
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

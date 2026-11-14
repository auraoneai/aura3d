/**
 * ProceduralMaterialTextures.ts — R12 procedural texture kinds (PRD-04 §7.3,
 * P1-5). Pure, deterministic generators; identical (kind, params, seed)
 * produces byte-identical output (SHA-256 stable), and every field wraps
 * toroidally (column 0 vs N−1 differ by ≤1/255, same for rows) so repeat
 * sampling never seams.
 *
 * Output is RGBA8, `colorSpace: "linear"`; `slot` tells the compiler which
 * material slot the kind targets (normal / roughness / anisotropy).
 */

export type ProceduralMaterialKind =
  | "fabric-normal"
  | "rubber-roughness"
  | "brushed-metal-anisotropy"
  | "plastic-micro-scratch";

export interface ProceduralMaterialParams {
  readonly scale: number;
  readonly strength: number;
  readonly contrast?: number;
  readonly direction?: readonly [number, number, number];
  readonly seed?: number;
  readonly size?: 256 | 512 | 1024;
}

export interface ProceduralMaterialTexture {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "linear";
  readonly slot: "normal" | "roughness" | "anisotropy";
}

const TAU = Math.PI * 2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise on the unit torus: lattice cells in frequency space. */
function periodicValueNoise(u: number, v: number, freq: number, hash: (x: number, y: number) => number): number {
  const x = u * freq;
  const y = v * freq;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const w = (ix: number, iy: number) => hash(((ix % freq) + freq) % freq, ((iy % freq) + freq) % freq);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  const fu = fade(xf), fv = fade(yf);
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}

function makeHash(seed: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const table: number[] = Array.from({ length: 512 }, () => rand());
  return (x, y) => table[(x * 31 + y * 131) & 511];
}

/** fBm over `octaves` octaves of periodic value noise at powers of two. */
function periodicFbm(u: number, v: number, baseFreq: number, octaves: number, hash: (x: number, y: number) => number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += periodicValueNoise(u, v, freq, hash) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function fabricNormal(size: number, params: ProceduralMaterialParams): Uint8Array {
  // Twill height field: two periodic sine weaves at ±45°, plus weft/warp
  // frequency; Sobel over the height field → tangent-space normal.
  const scale = Math.max(1, params.scale);
  const strength = params.strength;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const warp = Math.sin(TAU * scale * u);
      const weft = Math.sin(TAU * scale * v);
      const twill = Math.sin(TAU * scale * (u + v) * 0.5);
      height[y * size + x] = 0.5 + 0.5 * (warp * weft * 0.5 + twill * 0.5);
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y % size) + size) % size * size + ((x % size) + size) % size];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(clamp01(0.5 - dx * inv * 0.5) * 255);
      data[i + 1] = Math.round(clamp01(0.5 - dy * inv * 0.5) * 255);
      data[i + 2] = Math.round(clamp01(0.5 + inv * 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

function rubberRoughness(size: number, params: ProceduralMaterialParams): Uint8Array {
  // 4-octave periodic value-noise fBm; `contrast` reshapes around mid.
  const scale = Math.max(1, params.scale);
  const hash = makeHash(params.seed ?? 0);
  const contrast = params.contrast ?? 1;
  const strength = params.strength;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = periodicFbm(x / size, y / size, scale * 4, 4, hash);
      n = clamp01(0.5 + (n - 0.5) * contrast);
      const v = Math.round(clamp01(0.4 + n * 0.6 * strength) * 255);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function brushedMetalAnisotropy(size: number, params: ProceduralMaterialParams): Uint8Array {
  // rg = `direction` projected to the tangent plane (encoded 0..1); b = 1D
  // periodic streak noise along the direction's minor axis.
  const dir = params.direction ?? [1, 0, 0];
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const tx = dir[0] / len;
  const ty = dir[1] / len;
  const scale = Math.max(1, params.scale);
  const strength = params.strength;
  const hash = makeHash(params.seed ?? 0);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // streaks run along (tx,ty): modulate with noise periodic in the
      // perpendicular coordinate so the pattern wraps on both axes.
      const along = u * tx + v * ty;
      const across = -u * ty + v * tx;
      const s = periodicValueNoise((across % 1 + 1) % 1, along * 0.02, scale * 8, hash);
      const i = (y * size + x) * 4;
      data[i] = Math.round((tx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ty * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(clamp01(s * strength) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

function plasticMicroScratch(size: number, params: ProceduralMaterialParams): Uint8Array {
  // Seeded line segments rasterised into a roughness field, wrapped so the
  // pattern tiles. Segment endpoints are drawn in toroidal space.
  const rand = mulberry32(params.seed ?? 0);
  const scale = Math.max(1, params.scale);
  const strength = params.strength;
  const count = Math.round(scale * 40);
  const rough = new Float32Array(size * size).fill(0.5);
  for (let s = 0; s < count; s++) {
    const x0 = rand();
    const y0 = rand();
    const angle = rand() * TAU;
    const length = (0.02 + rand() * 0.1) / scale;
    const depth = (rand() - 0.35) * strength;
    const steps = Math.max(4, Math.ceil(length * size));
    for (let t = 0; t < steps; t++) {
      const x = Math.round(((x0 + Math.cos(angle) * length * (t / steps)) % 1 + 1) % 1 * size) % size;
      const y = Math.round(((y0 + Math.sin(angle) * length * (t / steps)) % 1 + 1) % 1 * size) % size;
      rough[y * size + x] = clamp01(rough[y * size + x] + depth);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(clamp01(rough[i]) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const KIND_SLOT: Record<ProceduralMaterialKind, ProceduralMaterialTexture["slot"]> = {
  "fabric-normal": "normal",
  "rubber-roughness": "roughness",
  "brushed-metal-anisotropy": "anisotropy",
  "plastic-micro-scratch": "roughness"
};

/**
 * Seamless-tiling fix-up: replicate column 0 into column N−1 and row 0 into
 * row N−1 so repeat sampling sees an exact wrap (≤1/255 by construction).
 */
function sealEdges(data: Uint8Array, size: number): void {
  for (let y = 0; y < size; y++) {
    const a = (y * size) * 4;
    const b = (y * size + size - 1) * 4;
    data[b] = data[a];
    data[b + 1] = data[a + 1];
    data[b + 2] = data[a + 2];
    data[b + 3] = data[a + 3];
  }
  for (let x = 0; x < size; x++) {
    const a = x * 4;
    const b = ((size - 1) * size + x) * 4;
    data[b] = data[a];
    data[b + 1] = data[a + 1];
    data[b + 2] = data[a + 2];
    data[b + 3] = data[a + 3];
  }
}

const PROCEDURAL_MATERIAL_CACHE_MAX = 64;
const proceduralMaterialCache = new Map<string, ProceduralMaterialTexture>();

function proceduralMaterialCacheKey(kind: string, size: number, params: ProceduralMaterialParams): string {
  const d = params.direction;
  const dirKey = d ? `${d[0]},${d[1]},${d[2]}` : "";
  // `contrast` reshapes several kinds (rubber, brushed-metal grooves): specs differing only in
  // contrast must not share a cached texture. Absent and explicit default stay distinct keys.
  return `${kind}|${size}|${params.scale}|${params.strength}|${params.contrast ?? ""}|${params.seed ?? 0}|${dirKey}`;
}

function cacheProceduralMaterialTexture(cacheKey: string, built: ProceduralMaterialTexture): void {
  if (proceduralMaterialCache.size >= PROCEDURAL_MATERIAL_CACHE_MAX) {
    const oldest = proceduralMaterialCache.keys().next().value;
    if (oldest !== undefined) proceduralMaterialCache.delete(oldest);
  }
  proceduralMaterialCache.set(cacheKey, built);
}

function copyProceduralMaterialTexture(texture: ProceduralMaterialTexture): ProceduralMaterialTexture {
  return { data: texture.data.slice(), width: texture.width, height: texture.height, colorSpace: texture.colorSpace, slot: texture.slot };
}

export function generateProceduralMaterialTexture(
  kind: ProceduralMaterialKind,
  params: ProceduralMaterialParams
): ProceduralMaterialTexture {
  const size = params.size ?? 512;
  const cacheKey = proceduralMaterialCacheKey(kind, size, params);
  const cached = proceduralMaterialCache.get(cacheKey);
  if (cached) return copyProceduralMaterialTexture(cached);
  let data: Uint8Array;
  switch (kind) {
    case "fabric-normal": data = fabricNormal(size, params); break;
    case "rubber-roughness": data = rubberRoughness(size, params); break;
    case "brushed-metal-anisotropy": data = brushedMetalAnisotropy(size, params); break;
    case "plastic-micro-scratch": data = plasticMicroScratch(size, params); break;
    default: {
      const neverKind: never = kind;
      throw new Error(`Unknown procedural material kind: ${String(neverKind)}`);
    }
  }
  sealEdges(data, size);
  const built: ProceduralMaterialTexture = { data, width: size, height: size, colorSpace: "linear", slot: KIND_SLOT[kind] };
  cacheProceduralMaterialTexture(cacheKey, built);
  return copyProceduralMaterialTexture(built);
}

/** Slope gain applied to a scalar field's per-texel Sobel gradient (height range 0..1). */
export const PROCEDURAL_SCALAR_NORMAL_GAIN = 10;
/** Upper bound on the derived tangent-space slope (|xy| / z ≈ tan 26.6°). */
export const PROCEDURAL_SCALAR_NORMAL_MAX_SLOPE = 0.5;

/**
 * Converts a scalar procedural field (`slot: "roughness"`, e.g. `rubber-roughness`,
 * `plastic-micro-scratch`) into a tangent-space normal map when an author binds it to a
 * `normal` slot. The raw field is greyscale (R = G = B): decoded as a normal it gives
 * (d, d, max(d, 0.001)) with d = 2v − 1, i.e. every texel tilted 55–90° and flipping
 * direction as the noise crosses mid-grey, which mip filtering cannot fix (the average
 * sits at mid-grey, still a degenerate normal) and which reads as specular shimmer.
 * Here the field is treated as a height map: a toroidal 3×3 Sobel gradient times `gain`,
 * clamped to `maxSlope`, encoded as an upward (z > 0) unit normal with the same sign
 * convention as `fabric-normal`. Output tiles seamlessly and box-filters to flat at
 * distance, so the standard mip chain resolves it.
 */
export function proceduralScalarFieldToNormalMap(
  texture: ProceduralMaterialTexture,
  options: { readonly gain?: number; readonly maxSlope?: number; readonly channel?: 0 | 1 | 2 } = {}
): ProceduralMaterialTexture {
  const { width, height, data: source } = texture;
  const channel = options.channel ?? 0;
  const at = (x: number, y: number) => source[(((y % height) + height) % height * width + ((x % width) + width) % width) * 4 + channel] / 255;
  const data = heightFieldToNormalPixels(at, width, height, options.gain ?? PROCEDURAL_SCALAR_NORMAL_GAIN, options.maxSlope ?? PROCEDURAL_SCALAR_NORMAL_MAX_SLOPE);
  if (width === height) sealEdges(data, width);
  return { data, width, height, colorSpace: "linear", slot: "normal" };
}

/**
 * Toroidal 3×3 Sobel over a height field (`at` wraps, height range ~0..1) → RGBA8 tangent-space
 * normals: gradient × `gain`, slope clamped to `maxSlope`, z > 0, `fabric-normal` sign convention.
 */
function heightFieldToNormalPixels(
  at: (x: number, y: number) => number,
  width: number,
  height: number,
  gain: number,
  maxSlope: number
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
      let dx = gx * gain;
      let dy = gy * gain;
      const slope = Math.hypot(dx, dy);
      if (slope > maxSlope) {
        dx *= maxSlope / slope;
        dy *= maxSlope / slope;
      }
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      data[i] = Math.round(clamp01(0.5 - dx * inv * 0.5) * 255);
      data[i + 1] = Math.round(clamp01(0.5 - dy * inv * 0.5) * 255);
      data[i + 2] = Math.round(clamp01(0.5 + inv * 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Slope gain for the brushed-metal groove height field (height range ~0..1). */
export const PROCEDURAL_BRUSHED_NORMAL_GAIN = 6;
/** Upper bound on brushed-metal groove slope (|xy| / z ≈ tan 19.3°); gentler than rubber since metal mirrors it. */
export const PROCEDURAL_BRUSHED_NORMAL_MAX_SLOPE = 0.35;

/** Periodic value noise with independent integer lattice frequencies per axis (wraps on both). */
function periodicValueNoise2(u: number, v: number, freqU: number, freqV: number, hash: (x: number, y: number) => number): number {
  const x = u * freqU;
  const y = v * freqV;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fu = smootherstep(x - xi);
  const fv = smootherstep(y - yi);
  const w = (ix: number, iy: number) => hash(((ix % freqU) + freqU) % freqU, ((iy % freqV) + freqV) % freqV);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Snaps a brush direction onto the nearest small integer lattice vector (a, b), |a|,|b| ≤ 4, so
 * the along/across coordinates a·u + b·v and −b·u + a·v are whole-turn periodic on the texture
 * torus (any direction then tiles without a seam; axis-aligned directions are exact).
 */
function brushLatticeDirection(direction: readonly [number, number, number] | undefined): [number, number] {
  const dx = direction?.[0] ?? 1;
  const dy = direction?.[1] ?? 0;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return [1, 0];
  const tx = dx / len;
  const ty = dy / len;
  let best: [number, number] = [1, 0];
  let bestDot = -Infinity;
  for (let a = -4; a <= 4; a++) {
    for (let b = -4; b <= 4; b++) {
      if (a === 0 && b === 0) continue;
      const dot = (a * tx + b * ty) / Math.hypot(a, b);
      // Ties (e.g. (1,0) vs (2,0)) keep the shortest lattice vector.
      if (dot > bestDot + 1e-9 || (Math.abs(dot - bestDot) <= 1e-9 && Math.hypot(a, b) < Math.hypot(best[0], best[1]))) {
        bestDot = dot;
        best = [a, b];
      }
    }
  }
  return best;
}

/**
 * Groove height field shared by the brushed-metal normal and roughness maps: periodic value
 * noise that varies fast across the brush direction (≈`scale`×4 lattice cells per turn, plus a
 * finer half-weight octave) and slowly along it, reshaped by `contrast`, scaled by `strength`.
 * Exactly toroidal for any brush direction (see brushLatticeDirection).
 */
function brushedGrooveHeights(size: number, params: ProceduralMaterialParams): Float32Array {
  const [a, b] = brushLatticeDirection(params.direction);
  const scale = Math.max(1, params.scale);
  const contrast = params.contrast ?? 1;
  const strength = params.strength;
  const seed = params.seed ?? 0;
  const hashFine = makeHash(seed);
  const hashFiner = makeHash(seed + 0x9e37);
  // Lattice cells per whole turn of the across/along coordinates (integers so both wrap).
  const across1 = Math.max(4, Math.min(Math.round(scale * 4), Math.floor(size / 3)));
  const across2 = Math.max(4, Math.min(across1 * 2, Math.floor(size / 2)));
  const along1 = Math.max(1, Math.round(scale / 6));
  const along2 = along1 * 2 + 1;
  const fract = (t: number) => t - Math.floor(t);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const along = fract(a * u + b * v);
      const across = fract(-b * u + a * v);
      const n = periodicValueNoise2(across, along, across1, along1, hashFine) * 0.65
        + periodicValueNoise2(across, along, across2, along2, hashFiner) * 0.35;
      heights[y * size + x] = (n - 0.5) * contrast * strength;
    }
  }
  return heights;
}

/**
 * Tangent-space normal map for `brushed-metal-anisotropy` bound to a `normal` slot. The raw
 * kind is a direction field (rg = brush direction, b = streak mask): decoded as a normal it is
 * (≈1, 0, ≤0) → a near-tangent normal on every texel, which darkens and smears the shading.
 * Here a groove height field is built instead: fine periodic value-noise streaks that vary fast
 * across the brush direction (≈`scale`×4 lattice cells per turn, plus a finer half-weight
 * octave) and slowly along it (long, uneven grooves), reshaped by `contrast` and scaled by
 * `strength`, then Sobel-converted like `proceduralScalarFieldToNormalMap` with a gentler gain
 * and slope cap. Normals tilt only across the grooves (along the brush direction they stay
 * flat), z > 0, the field is exactly toroidal for any brush direction (the step from texel N−1
 * to texel 0 under repeat matches interior steps), output is deterministic
 * per (params, seed), and the mip chain box-filters it to flat so the material's analytic
 * anisotropy (anisotropy / anisotropyRotation) carries the brushed highlight at distance.
 * Pure data: binds identically on WebGL2 and WebGPU, no shader change.
 */
export function proceduralBrushedMetalNormalMap(
  params: ProceduralMaterialParams,
  options: { readonly gain?: number; readonly maxSlope?: number } = {}
): ProceduralMaterialTexture {
  const size = params.size ?? 512;
  const gain = options.gain ?? PROCEDURAL_BRUSHED_NORMAL_GAIN;
  const maxSlope = options.maxSlope ?? PROCEDURAL_BRUSHED_NORMAL_MAX_SLOPE;
  const cacheKey = `brushed-metal-normal|${proceduralMaterialCacheKey("brushed-metal-anisotropy", size, params)}|${gain}|${maxSlope}`;
  const cached = proceduralMaterialCache.get(cacheKey);
  if (cached) return copyProceduralMaterialTexture(cached);

  const heights = brushedGrooveHeights(size, params);
  const at = (x: number, y: number) => heights[((y % size) + size) % size * size + ((x % size) + size) % size];
  // No sealEdges here: the field is exactly toroidal, so texel N−1 already wraps smoothly into
  // texel 0 under repeat sampling; copying column 0 over column N−1 would double the last step
  // and show a seam line for diagonal brush directions.
  const data = heightFieldToNormalPixels(at, size, size, gain, maxSlope);
  const built: ProceduralMaterialTexture = { data, width: size, height: size, colorSpace: "linear", slot: "normal" };
  cacheProceduralMaterialTexture(cacheKey, built);
  return copyProceduralMaterialTexture(built);
}

/**
 * Roughness texel value of the raw `brushed-metal-anisotropy` field's G channel for the default
 * +X brush direction (128/255): the value `material.brushedMetal`'s roughnessMap used to sample
 * everywhere. Both shaders compute roughness = material roughness × G, so the streaky map below
 * is centred here to keep the authored look (mean effective roughness) unchanged.
 */
export const PROCEDURAL_BRUSHED_ROUGHNESS_CENTER = 128 / 255;
/** Gain from groove height to roughness-texel offset (preset fields: σ ≈ 0.046, extremes ≈ 0.36..0.63 around 0.502). */
export const PROCEDURAL_BRUSHED_ROUGHNESS_GAIN = 1;

/**
 * Streaky roughness map for `brushed-metal-anisotropy` bound to a `roughnessMap` slot. The raw
 * kind's G channel is the encoded brush direction (a constant 128 for +X), so the preset's
 * roughness map was flat. Here the same groove height field as the normal map becomes gentle
 * roughness streaks running along the brush direction (groove valleys slightly rougher, crests
 * slightly smoother), centred on {@link PROCEDURAL_BRUSHED_ROUGHNESS_CENTER} (the exact field
 * mean is removed) so the average roughness does not shift. Greyscale RGB (the compositor reads
 * G), exactly toroidal, deterministic per (params, seed).
 */
export function proceduralBrushedMetalRoughnessMap(
  params: ProceduralMaterialParams,
  options: { readonly gain?: number; readonly center?: number } = {}
): ProceduralMaterialTexture {
  const size = params.size ?? 512;
  const gain = options.gain ?? PROCEDURAL_BRUSHED_ROUGHNESS_GAIN;
  const center = options.center ?? PROCEDURAL_BRUSHED_ROUGHNESS_CENTER;
  const cacheKey = `brushed-metal-roughness|${proceduralMaterialCacheKey("brushed-metal-anisotropy", size, params)}|${gain}|${center}`;
  const cached = proceduralMaterialCache.get(cacheKey);
  if (cached) return copyProceduralMaterialTexture(cached);
  const heights = brushedGrooveHeights(size, params);
  let mean = 0;
  for (let i = 0; i < heights.length; i++) mean += heights[i];
  mean /= heights.length;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < heights.length; i++) {
    const v = Math.round(clamp01(center - (heights[i] - mean) * gain) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const built: ProceduralMaterialTexture = { data, width: size, height: size, colorSpace: "linear", slot: "roughness" };
  cacheProceduralMaterialTexture(cacheKey, built);
  return copyProceduralMaterialTexture(built);
}

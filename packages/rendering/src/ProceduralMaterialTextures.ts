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

export function generateProceduralMaterialTexture(
  kind: ProceduralMaterialKind,
  params: ProceduralMaterialParams
): ProceduralMaterialTexture {
  const size = params.size ?? 512;
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
  return { data, width: size, height: size, colorSpace: "linear", slot: KIND_SLOT[kind] };
}

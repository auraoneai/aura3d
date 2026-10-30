/**
 * Aura Diamond 3D turf and clay texels (GU47 DIA-M1). Pure, deterministic generators (no engine, no DOM) for the three
 * small textures the field uses instead of nine mow planes:
 *
 * - `mowMaskTexels`: a grey mowing mask. Two broad stripes per tile with soft edges (lit and against-the-grain cuts) and a
 *   faint cross-cut, multiplied over the park's turf colour; smooth bands, so the mip chain never shimmers.
 * - `bladeNormalTexels`: tangent-space normals of short grass blades, tiled every 2 m (the "grass PBR at 2 m" detail).
 * - `clayNormalTexels`: pebbled infield clay normals.
 *
 * Every byte comes from a seeded integer hash, so the same seed always paints the same texture (tests read them).
 */

/** Square RGBA8 texel block. */
export interface TexelBlock {
  readonly size: number;
  readonly data: Uint8ClampedArray;
}

/** Field layout the mask is drawn for: metres of turf one tile covers, and stripes per tile. */
export const TURF_LAYOUT = {
  /** The field-grass plane is 340 m square (scene.ts). */
  planeMetres: 340,
  /** One mask tile spans two stripes of 7.5 m. */
  tileMetres: 15,
  stripesPerTile: 2,
  /** Grass blade normal tile (DIA-M1: grass detail at 2 m). */
  bladeTileMetres: 2,
  /** Clay pebble normal tile. */
  clayTileMetres: 2.5
} as const;

/** Texture repeat for a tile of `tileMetres` on a plane of `planeMetres`. */
export const tileRepeat = (planeMetres: number, tileMetres: number): number => planeMetres / tileMetres;

/** 32-bit integer hash (lowbias32) of a texel coordinate and a seed, mapped to [0, 1). */
export function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise on a wrapping lattice of `cells` per side (bilinear, smoothstep), so a tile repeats seamlessly. */
function tiledNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (n: number): number => ((n % cells) + cells) % cells;
  const a = hash01(w(x0), w(y0), seed);
  const b = hash01(w(x0 + 1), w(y0), seed);
  const c = hash01(w(x0), w(y0 + 1), seed);
  const d = hash01(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Soft band: 1 inside a stripe, 0 in the other, with a cosine edge `edge` wide (fraction of a stripe). */
function band(t: number, stripes: number, edge: number): number {
  const p = (((t * stripes) % 2) + 2) % 2; // 0..2: [0,1) light stripe, [1,2) dark stripe
  const d = Math.min(Math.abs(p - 1), Math.abs(p), Math.abs(p - 2)); // distance to the nearest stripe boundary, in stripes
  const k = Math.min(1, d / edge);
  const s = 0.5 - 0.5 * Math.cos(Math.PI * k);
  return p < 1 ? 0.5 + 0.5 * s : 0.5 - 0.5 * s;
}

/**
 * Grey mowing mask (sRGB bytes): light stripes at 255, dark at about 226 (12% darker once decoded), a 30% cross-cut and
 * a few percent of large-scale wear. Multiply over the turf colour.
 */
export function mowMaskTexels(size = 256, seed = 0xd1a0, stripes: number = TURF_LAYOUT.stripesPerTile): TexelBlock {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const along = band(u, stripes, 0.18);
      const cross = band(v, stripes, 0.18);
      const wear = tiledNoise(u, v, 4, seed) - 0.5;
      const shade = 0.7 * along + 0.3 * cross;
      const value = 226 + 29 * shade + 10 * wear;
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { size, data };
}

/** Encodes a unit tangent-space normal as RGB bytes (OpenGL convention, +Y up). */
function writeNormal(data: Uint8ClampedArray, i: number, nx: number, ny: number): void {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  data[i] = Math.round((nx * 0.5 + 0.5) * 255);
  data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
  data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  data[i + 3] = 255;
}

/** Grass blades: streaky, mostly along the mowing direction, tilt up to `strength`. */
export function bladeNormalTexels(size = 256, seed = 0x6a55, strength = 0.42): TexelBlock {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // Fine streaks: high frequency across the blades (u), lower along them (v).
      const a = tiledNoise(u * 4, v, 64, seed) - 0.5;
      const b = tiledNoise(u, v * 4, 64, seed + 1) - 0.5;
      writeNormal(data, (y * size + x) * 4, 2 * strength * a, 2 * strength * 0.6 * b);
    }
  }
  return { size, data };
}

/** Pebbled clay: round bumps from a coarse noise gradient plus a fine grain. */
export function clayNormalTexels(size = 256, seed = 0xc1a7, strength = 0.35): TexelBlock {
  const data = new Uint8ClampedArray(size * size * 4);
  const h = (u: number, v: number): number => 0.7 * tiledNoise(u, v, 24, seed) + 0.3 * tiledNoise(u, v, 96, seed + 7);
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const dx = (h(u + e, v) - h(u - e, v)) * size * 0.04;
      const dy = (h(u, v + e) - h(u, v - e)) * size * 0.04;
      const l = Math.hypot(dx, dy, 1);
      writeNormal(data, (y * size + x) * 4, Math.max(-strength, Math.min(strength, -dx / l)), Math.max(-strength, Math.min(strength, -dy / l)));
    }
  }
  return { size, data };
}

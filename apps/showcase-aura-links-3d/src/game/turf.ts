/**
 * GU47 LINKS-05: Aura Links turf, sand, basalt and regolith texels and the per-theme surface table.
 *
 * Pure, deterministic generators (no engine, no DOM): every byte comes from a seeded integer hash, so the same seed always
 * paints the same tile and unit tests can read them. All tiles wrap seamlessly (the noise lattices wrap). The mesh
 * builders write uv0 in world metres (terrainMesh.ts), so a tile's repeat is 1 / its tile metres and its density in
 * texels per metre is size / tileMetres.
 *
 * - `mowStripeTexels`: grey mowing mask banded along u only. On a ribbon u runs along the line of play, so the stripes
 *   cross the fairway (the 4.6.2 longitudinal stripe ribbon rotated 90 degrees, and one draw fewer).
 * - `patchTexels`: grey tuft-scale albedo mottling for the rough (multiplied over the course's rough colour).
 * - normal tiles: fine turf blades (fairway, green, fringe), long-rough clumps, rippled sand, cracked basalt, cratered
 *   regolith.
 */
import type { CourseTheme } from "./types";

/** Square RGBA8 texel block. */
export interface TexelBlock {
  readonly size: number;
  readonly data: Uint8ClampedArray;
}

export type LinksNormalKind = "blades" | "clumps" | "sand" | "basalt" | "regolith";
export type LinksMaskKind = "mow" | "patch";

/** One texture slot: what is painted, how many metres one tile covers, and the normal strength on the material. */
export interface SurfaceMap<K extends string> {
  readonly kind: K;
  readonly tileMetres: number;
}

export interface LinksSurface {
  /** Base-colour mask multiplied over the material colour (null: plain colour). */
  readonly mask: SurfaceMap<LinksMaskKind> | null;
  /** Tangent-space normal tile (null: none). */
  readonly normal: (SurfaceMap<LinksNormalKind> & { readonly scale: number }) | null;
  readonly roughness: number;
  /** Sheen of cut grass (green and fairway only); 0 = none. */
  readonly sheen: number;
}

export type LinksSurfaceSlot = "rough" | "fairway" | "firstCut" | "green" | "fringe" | "bunker";

/** Texel sizes (square). The mow mask is a smooth low-frequency band, so 128 px is plenty for it. */
export const TEXEL_SIZE: Record<LinksMaskKind | LinksNormalKind, number> = {
  mow: 128,
  patch: 256,
  blades: 256,
  clumps: 256,
  sand: 256,
  basalt: 256,
  regolith: 256
};

/** One mow stripe pair per 18 m of the line of play (two 9 m stripes). */
export const MOW_TILE_METRES = 18;

const turf = (roughKind: LinksNormalKind, roughScale: number, bunkerKind: LinksNormalKind, opts: { roughness?: number; sheen?: number } = {}): Record<LinksSurfaceSlot, LinksSurface> => ({
  rough: { mask: { kind: "patch", tileMetres: 1 }, normal: { kind: roughKind, tileMetres: 1, scale: roughScale }, roughness: opts.roughness ?? 0.94, sheen: 0 },
  firstCut: { mask: { kind: "patch", tileMetres: 1 }, normal: { kind: "blades", tileMetres: 1, scale: 0.55 }, roughness: 0.9, sheen: 0 },
  fairway: { mask: { kind: "mow", tileMetres: MOW_TILE_METRES }, normal: { kind: "blades", tileMetres: 1, scale: 0.45 }, roughness: 0.84, sheen: opts.sheen ?? 0.25 },
  fringe: { mask: null, normal: { kind: "blades", tileMetres: 0.5, scale: 0.4 }, roughness: 0.85, sheen: opts.sheen ?? 0.25 },
  green: { mask: null, normal: { kind: "blades", tileMetres: 0.5, scale: 0.3 }, roughness: 0.74, sheen: (opts.sheen ?? 0.25) + 0.1 },
  bunker: { mask: null, normal: { kind: bunkerKind, tileMetres: bunkerKind === "regolith" ? 2 : 1, scale: 0.6 }, roughness: 0.9, sheen: 0 }
});

/**
 * The surface set per course theme: long marram-and-fescue clumps on the dunes, lush parkland clumps, cracked basalt
 * rough and ash bunkers at Cinder Rim, alpine clumps, short synthetic-looking blades on the floodlit harbour, cratered
 * regolith on Mare (dusty: no fairway sheen).
 */
export const TURF_SURFACES: Record<CourseTheme, Record<LinksSurfaceSlot, LinksSurface>> = {
  dunes: turf("clumps", 0.8, "sand"),
  parkland: turf("clumps", 0.6, "sand", { sheen: 0.3 }),
  volcanic: turf("basalt", 0.75, "sand", { roughness: 0.96 }),
  alpine: turf("clumps", 0.55, "sand"),
  nightCity: turf("blades", 0.5, "sand", { sheen: 0.35 }),
  lunar: turf("regolith", 0.7, "regolith", { roughness: 0.97, sheen: 0 })
};

/** Texels per metre of a slot (texel size / tile metres). */
export function texelsPerMetre(map: SurfaceMap<LinksMaskKind | LinksNormalKind>): number {
  return TEXEL_SIZE[map.kind] / map.tileMetres;
}

/** 32-bit integer hash (lowbias32) of a lattice coordinate and a seed, mapped to [0, 1). */
export function hash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const wrap = (n: number, cells: number) => ((n % cells) + cells) % cells;

/**
 * Value noise on a wrapping lattice of `cells` by `cellsY` (bilinear, smoothstep), seamless over the unit tile; a smaller
 * `cellsY` stretches the features along v (grass blades).
 */
export function tiledNoise(u: number, v: number, cells: number, seed: number, cellsY = cells): number {
  const x = u * cells;
  const y = v * cellsY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(wrap(x0, cells), wrap(y0, cellsY), seed);
  const b = hash01(wrap(x0 + 1, cells), wrap(y0, cellsY), seed);
  const c = hash01(wrap(x0, cells), wrap(y0 + 1, cellsY), seed);
  const d = hash01(wrap(x0 + 1, cells), wrap(y0 + 1, cellsY), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function greyBlock(size: number, value: (u: number, v: number) => number): TexelBlock {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = value((x + 0.5) / size, (y + 0.5) / size);
      const i = (y * size + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return { size, data };
}

/** Tangent-space normals (OpenGL convention, +Y up) from a wrapping height function by central differences. */
function normalBlock(size: number, height: (u: number, v: number) => number, strength: number): TexelBlock {
  const data = new Uint8ClampedArray(size * size * 4);
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const dx = (height(u + e, v) - height(u - e, v)) * strength;
      const dy = (height(u, v + e) - height(u, v - e)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return { size, data };
}

/** Soft band over `stripes` stripes per tile: 1 on a light stripe, 0 on a dark one, cosine edges `edge` stripes wide. */
function band(t: number, stripes: number, edge: number): number {
  const p = wrap(t * stripes, 2);
  const d = Math.min(Math.abs(p - 1), Math.abs(p), Math.abs(p - 2));
  const k = Math.min(1, d / edge);
  const s = 0.5 - 0.5 * Math.cos(Math.PI * k);
  return p < 1 ? 0.5 + 0.5 * s : 0.5 - 0.5 * s;
}

/** Mowing mask: light stripes near 255, dark near 222 (about 14% darker once decoded), banded along u only. */
export function mowStripeTexels(size = TEXEL_SIZE.mow, seed = 0x11a5): TexelBlock {
  return greyBlock(size, (u, v) => 222 + 33 * band(u, 2, 0.2) + 6 * (tiledNoise(u, v, 4, seed) - 0.5));
}

/** Rough mottling: tuft-scale clumps and a finer grain, 196..255 (multiplied over the rough colour). */
export function patchTexels(size = TEXEL_SIZE.patch, seed = 0x7a7c): TexelBlock {
  return greyBlock(size, (u, v) => {
    const n = 0.65 * tiledNoise(u, v, 8, seed) + 0.35 * tiledNoise(u, v, 32, seed + 3);
    return 196 + 59 * n;
  });
}

/** Normal tile of one kind (seeded per kind). */
export function normalTexels(kind: LinksNormalKind, size = TEXEL_SIZE[kind]): TexelBlock {
  switch (kind) {
    case "blades":
      // fine streaks: high frequency across the blades, lower along them
      return normalBlock(size, (u, v) => 0.6 * tiledNoise(u, v, 96, 0xb1a0) + 0.4 * tiledNoise(u, v, 128, 0xb1a1, 16), 2);
    case "clumps":
      return normalBlock(size, (u, v) => 0.6 * tiledNoise(u, v, 12, 0xc1c0) + 0.4 * tiledNoise(u, v, 64, 0xc1c1), 4);
    case "sand":
      // wind ripples with a wobble, plus grain
      return normalBlock(size, (u, v) => 0.55 * Math.sin(2 * Math.PI * (6 * v + 0.6 * (tiledNoise(u, v, 4, 0x5a0d) - 0.5))) * 0.5 + 0.3 * tiledNoise(u, v, 128, 0x5a0e), 3.5);
    case "basalt":
      return normalBlock(size, (u, v) => basaltHeight(u, v), 6);
    case "regolith":
      return normalBlock(size, (u, v) => regolithHeight(u, v), 5);
  }
}

/** Cracked basalt: jittered cells on a wrapping 6x6 lattice; height drops into the cracks (F2 - F1 small). */
function basaltHeight(u: number, v: number, cells = 6, seed = 0xba5a): number {
  const x = u * cells, y = v * cells;
  const cx = Math.floor(x), cy = Math.floor(y);
  let f1 = Infinity, f2 = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const px = gx + 0.15 + 0.7 * hash01(wrap(gx, cells), wrap(gy, cells), seed);
      const py = gy + 0.15 + 0.7 * hash01(wrap(gx, cells), wrap(gy, cells), seed + 1);
      const d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  const crack = Math.min(1, (f2 - f1) / 0.12);
  return 0.6 * crack + 0.15 * tiledNoise(u, v, 48, seed + 2);
}

/** Cratered regolith: a few rimmed bowls (wrapped) over fine dust grain. */
function regolithHeight(u: number, v: number, seed = 0x4e60): number {
  let h = 0.25 * tiledNoise(u, v, 64, seed) + 0.15 * tiledNoise(u, v, 16, seed + 1);
  for (let k = 0; k < 7; k++) {
    const cx = hash01(k, 0, seed + 2), cy = hash01(k, 1, seed + 2);
    const r = 0.05 + 0.09 * hash01(k, 2, seed + 2);
    const dx = wrap(u - cx + 0.5, 1) - 0.5, dy = wrap(v - cy + 0.5, 1) - 0.5;
    const d = Math.hypot(dx, dy) / r;
    if (d < 1.4) h += d < 1 ? -0.5 * (1 - d * d) + 0.25 * d ** 6 : 0.25 * Math.max(0, 1 - (d - 1) / 0.4);
  }
  return h;
}

/** Every texel block one course mounts (deduplicated by kind), for the texture budget. */
export function courseTextureKinds(theme: CourseTheme): readonly (LinksMaskKind | LinksNormalKind)[] {
  const set = new Set<LinksMaskKind | LinksNormalKind>();
  for (const s of Object.values(TURF_SURFACES[theme])) {
    if (s.mask) set.add(s.mask.kind);
    if (s.normal) set.add(s.normal.kind);
  }
  return [...set];
}

/** GPU bytes of a course's turf textures with a full mip chain (RGBA8, 4/3 for the mips), per distinct tile repeat. */
export function courseTextureBytes(theme: CourseTheme): number {
  const keys = new Set<string>();
  let bytes = 0;
  for (const s of Object.values(TURF_SURFACES[theme])) {
    for (const map of [s.mask, s.normal]) {
      if (!map) continue;
      const key = `${map.kind}|${map.tileMetres}`;
      if (keys.has(key)) continue;
      keys.add(key);
      bytes += Math.ceil((TEXEL_SIZE[map.kind] ** 2 * 4 * 4) / 3);
    }
  }
  return bytes;
}

/**
 * sRGB lift for a material colour under a grey mask, so the masked surface keeps about the 4.6.2 mean colour (255 over the
 * mask's mean byte: mow stripes about 238, rough patches about 228).
 */
export const MASK_COLOR_LIFT: Record<LinksMaskKind, number> = { mow: 1.07, patch: 1.12 };

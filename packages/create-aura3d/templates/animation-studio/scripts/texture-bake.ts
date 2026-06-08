/**
 * texture-bake.ts — dependency-free procedural BITMAP TEXTURE baker for the authored
 * animation-studio cast (companion to build-characters.ts, Phase M1 character fidelity).
 *
 * It paints a single 1024×1024 RGBA base-colour ATLAS per character and encodes it as a
 * real PNG (node `zlib.deflateSync` — no `sharp`, no native module, so the script stays
 * runnable standalone exactly like its sibling). The atlas is split into per-material
 * REGIONS (body / skin / dark / glow / accent); each region carries genuine shading
 * detail instead of one flat colour:
 *
 *   - skin: a vertical tone gradient (lighter forehead → warmer jaw) + soft cheek blush +
 *     subtle ambient-occlusion vignette at the region edges (crease shading),
 *   - body (clothing): a woven fabric pattern (fine warp/weft modulation) over the body
 *     colour with a top-lit vertical shade ramp + edge AO,
 *   - accent (belt/collar/hair): brushed directional streaks + edge AO,
 *   - dark (boots/pupils/mouth): near-flat dark with a faint specular sheen band,
 *   - glow (eyes): a radial hot-centre → rim falloff so eyes read as lit, not flat discs.
 *
 * build-characters.ts assigns each material's vertices PLANAR UVs into that material's
 * region (see assignAtlasUVs there), sets baseColorFactor to white, and references the
 * PNG as an embedded glTF image + texture + baseColorTexture. The result is a genuine
 * UV-mapped albedo map — honestly procedural (not scanned/artist-painted), but textured
 * rather than flat vertex colour.
 */

import { deflateSync } from "node:zlib";

export type RGBA = [number, number, number, number];

export const ATLAS_SIZE = 1024;

/** A material's rectangular slot in the shared atlas, in normalised [0,1] UV space. */
export interface AtlasRegion {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/**
 * Atlas layout: five regions on a 1024² sheet. A 4px gutter is left around each cell so
 * bilinear sampling at the edges never bleeds a neighbouring material in.
 */
export const ATLAS_REGIONS = {
  body: { u0: 0.0, v0: 0.0, u1: 0.5, v1: 0.5 },
  skin: { u0: 0.5, v0: 0.0, u1: 1.0, v1: 0.5 },
  accent: { u0: 0.0, v0: 0.5, u1: 0.5, v1: 1.0 },
  dark: { u0: 0.5, v0: 0.5, u1: 0.75, v1: 1.0 },
  glow: { u0: 0.75, v0: 0.5, u1: 1.0, v1: 1.0 }
} as const satisfies Record<string, AtlasRegion>;

export type RegionName = keyof typeof ATLAS_REGIONS;

/** Inputs the painter needs from a CharacterDesign (colours in linear 0..1). */
export interface BakeColors {
  readonly bodyColor: RGBA;
  readonly accentColor: RGBA;
  readonly skinColor: RGBA;
  readonly trimColor: RGBA;
  /** Dark material (boots/pupils/mouth) — fixed, matches the build's dark material. */
  readonly darkColor: RGBA;
}

// ---------------------------------------------------------------------------
// Tiny value-noise (deterministic) for fabric weave + brushed streaks.
// ---------------------------------------------------------------------------
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Edge ambient-occlusion factor inside a region: 1.0 in the middle, darkening toward the
 * cell borders so creases/seams read. `fx`,`fy` are 0..1 within the region.
 */
function edgeAO(fx: number, fy: number): number {
  const dx = Math.min(fx, 1 - fx);
  const dy = Math.min(fy, 1 - fy);
  const d = Math.min(dx, dy);
  // Full strength shadow within ~6% of the edge, easing to none by ~18%.
  return clamp01(0.62 + 0.38 * clamp01((d - 0.04) / 0.14));
}

// ---------------------------------------------------------------------------
// Per-region painters. Each fills its region of the RGBA buffer (row-major,
// origin top-left, 4 bytes/pixel). `put` writes one pixel.
// ---------------------------------------------------------------------------
type Painter = (fx: number, fy: number, base: RGBA) => RGBA;

/** Clothing fabric: body colour + woven warp/weft + top-lit shade ramp + edge AO. */
const paintBody: Painter = (fx, fy, base) => {
  const ao = edgeAO(fx, fy);
  // Top-lit vertical ramp (brighter near the top of the region → simulates key light).
  const shade = lerp(1.12, 0.82, fy);
  // Woven pattern: fine alternating warp (x) and weft (y) threads.
  const warp = 0.5 + 0.5 * Math.sin(fx * Math.PI * 220);
  const weft = 0.5 + 0.5 * Math.sin(fy * Math.PI * 220);
  const weave = 1 + (warp * 0.06 - 0.03) + (weft * 0.06 - 0.03);
  // A touch of broad cloth folds via low-frequency noise.
  const fold = 1 + (hash2(Math.floor(fx * 12), Math.floor(fy * 16)) - 0.5) * 0.07;
  const k = ao * shade * weave * fold;
  return [clamp01(base[0] * k), clamp01(base[1] * k), clamp01(base[2] * k), 1];
};

/** Skin: forehead→jaw tone gradient + cheek blush + edge AO (face/limb shading). */
const paintSkin: Painter = (fx, fy, base) => {
  const ao = edgeAO(fx, fy);
  // Vertical tone: a little lighter at the top (forehead), warmer/darker toward the jaw.
  const tone = lerp(1.08, 0.9, fy);
  // Cheek blush: two soft warm lobes left/right of centre, mid-height.
  const blushL = Math.exp(-(((fx - 0.34) ** 2 + (fy - 0.55) ** 2) / 0.01));
  const blushR = Math.exp(-(((fx - 0.66) ** 2 + (fy - 0.55) ** 2) / 0.01));
  const blush = (blushL + blushR) * 0.12;
  const r = base[0] * tone * ao + blush * 0.22;
  const g = base[1] * tone * ao + blush * 0.05;
  const b = base[2] * tone * ao + blush * 0.04;
  return [clamp01(r), clamp01(g), clamp01(b), 1];
};

/** Accent (belt/collar/hair): brushed directional streaks + edge AO. */
const paintAccent: Painter = (fx, fy, base) => {
  const ao = edgeAO(fx, fy);
  const shade = lerp(1.1, 0.85, fy);
  // Horizontal brushed streaks: high-frequency noise stretched along x.
  const streak = 1 + (hash2(Math.floor(fy * 160), Math.floor(fx * 6)) - 0.5) * 0.16;
  const k = ao * shade * streak;
  return [clamp01(base[0] * k), clamp01(base[1] * k), clamp01(base[2] * k), 1];
};

/** Dark (boots/pupils/mouth): near-flat dark with a faint top sheen band. */
const paintDark: Painter = (fx, fy, base) => {
  const ao = edgeAO(fx, fy);
  // Specular sheen near the top quarter (boot/pupil highlight).
  const sheen = Math.exp(-(((fy - 0.22) ** 2) / 0.006)) * 0.25;
  const k = ao;
  return [clamp01(base[0] * k + sheen), clamp01(base[1] * k + sheen), clamp01(base[2] * k + sheen), 1];
};

/** Glow (eyes): radial hot-centre → rim falloff so the iris reads as lit. */
const paintGlow: Painter = (fx, fy, base) => {
  const d = Math.hypot(fx - 0.5, fy - 0.5) / 0.7071;
  const hot = clamp01(1.0 - d * d); // bright core, soft rim
  const k = lerp(0.7, 1.25, hot);
  return [clamp01(base[0] * k), clamp01(base[1] * k), clamp01(base[2] * k), 1];
};

const PAINTERS: Record<RegionName, Painter> = {
  body: paintBody,
  skin: paintSkin,
  accent: paintAccent,
  dark: paintDark,
  glow: paintGlow
};

function regionBase(name: RegionName, colors: BakeColors): RGBA {
  switch (name) {
    case "body":
      return colors.bodyColor;
    case "skin":
      return colors.skinColor;
    case "accent":
      return colors.trimColor;
    case "dark":
      return colors.darkColor;
    case "glow":
      return colors.accentColor;
  }
}

/**
 * Bake the full RGBA atlas (ATLAS_SIZE²) for one character. Returns the raw pixel buffer.
 * Background (gutters between regions) is a neutral mid grey so any sampling outside a
 * mapped region is innocuous.
 */
export function bakeAtlasPixels(colors: BakeColors): Uint8Array {
  const N = ATLAS_SIZE;
  const px = new Uint8Array(N * N * 4);
  // Neutral background.
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 60;
    px[i + 1] = 60;
    px[i + 2] = 66;
    px[i + 3] = 255;
  }
  for (const [name, region] of Object.entries(ATLAS_REGIONS) as [RegionName, AtlasRegion][]) {
    const painter = PAINTERS[name];
    const base = regionBase(name, colors);
    const x0 = Math.round(region.u0 * N);
    const y0 = Math.round(region.v0 * N);
    const x1 = Math.round(region.u1 * N);
    const y1 = Math.round(region.v1 * N);
    const w = x1 - x0;
    const h = y1 - y0;
    for (let y = y0; y < y1; y += 1) {
      const fy = (y - y0) / (h - 1);
      for (let x = x0; x < x1; x += 1) {
        const fx = (x - x0) / (w - 1);
        const c = painter(fx, fy, base);
        const o = (y * N + x) * 4;
        px[o] = Math.round(linearToSrgb(c[0]) * 255);
        px[o + 1] = Math.round(linearToSrgb(c[1]) * 255);
        px[o + 2] = Math.round(linearToSrgb(c[2]) * 255);
        px[o + 3] = 255;
      }
    }
  }
  return px;
}

// glTF base-colour textures are sampled in sRGB; the design colours are authored as the
// same factors used for baseColorFactor (which the engine treats as sRGB-ish display
// colour), so encode straight through (identity) to keep parity with the prior flat look.
function linearToSrgb(v: number): number {
  return clamp01(v);
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA8, no external deps). Produces a standard PNG whose
// IHDR width/height the resolver's sniffImageDim reads to report textureMaxDim.
// ---------------------------------------------------------------------------
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i]!;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  dv.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

/** Encode an RGBA8 pixel buffer (row-major, top-left origin) as PNG bytes. */
export function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // IHDR.
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw scanlines with a per-row filter byte (0 = none).
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idatData = deflateSync(raw, { level: 9 });

  const sig = PNG_SIGNATURE;
  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", new Uint8Array(idatData.buffer, idatData.byteOffset, idatData.byteLength));
  const iendChunk = chunk("IEND", new Uint8Array(0));

  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let o = 0;
  png.set(sig, o); o += sig.length;
  png.set(ihdrChunk, o); o += ihdrChunk.length;
  png.set(idatChunk, o); o += idatChunk.length;
  png.set(iendChunk, o);
  return png;
}

/** Bake + PNG-encode in one call. */
export function bakeAtlasPNG(colors: BakeColors): { png: Uint8Array; size: number } {
  const px = bakeAtlasPixels(colors);
  return { png: encodePNG(px, ATLAS_SIZE, ATLAS_SIZE), size: ATLAS_SIZE };
}

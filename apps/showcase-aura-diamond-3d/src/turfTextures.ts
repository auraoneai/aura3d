/**
 * GU47 DIA-M1: the three field textures (mowing mask, grass blade normals, clay pebble normals) as live `texture.canvas`
 * handles. Canvas textures generate mipmaps (data textures do not), so the stripes and blades stay calm at distance.
 * Built once per page and shared by every park (the turf colour lives in the material, not the texture). Returns null
 * where there is no DOM (unit tests), and the field falls back to plain colours.
 */
import { texture } from "@aura3d/engine";
import { createFlipbookAtlas } from "../../showcase-port-shared/vfx-pack";
import { TURF_LAYOUT, bladeNormalTexels, clayNormalTexels, clayRoughnessTexels, hash01, mowMaskTexels, tileRepeat, type TexelBlock } from "../art/turf";

export interface TurfTextures {
  /** Grey mowing mask, multiplied over the turf colour (sRGB). */
  readonly mowMask: unknown;
  /** Grass blade normals, one tile per 2 m. */
  readonly bladeNormal: unknown;
  /** Infield clay normals. */
  readonly clayNormal: unknown;
  /** Damp-vs-dry clay roughness variation map (linear). */
  readonly clayRoughness: unknown;
}

export interface BaseballSeamMaps {
  readonly normal: unknown;
  readonly roughness: unknown;
}

let cached: TurfTextures | null | undefined;
let cachedIvyBrick: unknown | null | undefined;
let cachedBallSeams: BaseballSeamMaps | null | undefined;
const cachedBatWoods = new Map<string, unknown | null>();
const cachedFlipbookUrls = new Map<"dust" | "sparks", string | null>();

function canvasTexture(block: TexelBlock, colorSpace: "srgb" | "linear", repeat: number): unknown {
  const canvas = document.createElement("canvas");
  canvas.width = block.size;
  canvas.height = block.size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const image = ctx.createImageData(block.size, block.size);
  image.data.set(block.data);
  ctx.putImageData(image, 0, 0);
  const handle = texture.canvas({ canvas, colorSpace, flipY: false });
  handle.wrapS = "repeat";
  handle.wrapT = "repeat";
  handle.repeat = [repeat, repeat];
  handle.anisotropy = 8;
  return handle;
}

/** The shared field textures, or null without a DOM (or if a canvas cannot be made). */
export function turfTextures(): TurfTextures | null {
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return (cached = null);
  try {
    cached = {
      mowMask: canvasTexture(mowMaskTexels(), "srgb", tileRepeat(TURF_LAYOUT.planeMetres, TURF_LAYOUT.tileMetres)),
      bladeNormal: canvasTexture(bladeNormalTexels(), "linear", tileRepeat(TURF_LAYOUT.planeMetres, TURF_LAYOUT.bladeTileMetres)),
      // The infield cylinder is 26 m across; its cap maps the texture once, so the clay tile repeats about ten times.
      clayNormal: canvasTexture(clayNormalTexels(), "linear", tileRepeat(26, TURF_LAYOUT.clayTileMetres)),
      clayRoughness: canvasTexture(clayRoughnessTexels(), "linear", tileRepeat(26, TURF_LAYOUT.clayTileMetres * 2))
    };
  } catch {
    cached = null;
  }
  return cached;
}

/** Turned woodgrain map for lacquered ash, golden maple and flame-torched ember bats. */
export function batWoodTexture(tone: "ash" | "maple" | "ember"): unknown | null {
  if (cachedBatWoods.has(tone)) return cachedBatWoods.get(tone) ?? null;
  if (typeof document === "undefined") {
    cachedBatWoods.set(tone, null);
    return null;
  }
  try {
    const w = 128;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cachedBatWoods.set(tone, null);
      return null;
    }
    const image = ctx.createImageData(w, h);
    const d = image.data;
    const base: readonly [number, number, number] =
      tone === "ash" ? [232, 206, 168] : tone === "maple" ? [220, 174, 118] : [188, 96, 62];
    const ringDelta: readonly [number, number, number] =
      tone === "ash" ? [34, 30, 24] : tone === "maple" ? [40, 32, 22] : [54, 36, 26];
    for (let y = 0; y < h; y++) {
      const v = y / h;
      // Subtle flame-temper darkening toward the barrel tip on ember/maple bats.
      const barrelChar = tone === "ember" ? 0.55 + 0.45 * Math.cos(Math.min(1, v * 1.35) * Math.PI * 0.5) : 1;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const grainWave = Math.sin((u * 14 + 0.35 * Math.sin(v * Math.PI * 4) + 0.14 * (hash01(x, y >> 2, 0xba71) - 0.5)) * Math.PI * 2);
        const pore = (hash01(x, y, 0xba72) - 0.5) * 10;
        const g = 0.5 + 0.5 * grainWave;
        const i = (y * w + x) * 4;
        d[i] = Math.max(24, Math.min(255, Math.round((base[0] - ringDelta[0] * g + pore) * barrelChar)));
        d[i + 1] = Math.max(18, Math.min(255, Math.round((base[1] - ringDelta[1] * g + pore) * barrelChar)));
        d[i + 2] = Math.max(14, Math.min(255, Math.round((base[2] - ringDelta[2] * g + pore) * barrelChar)));
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const handle = texture.canvas({ canvas, colorSpace: "srgb", flipY: false });
    handle.wrapS = "repeat";
    handle.wrapT = "repeat";
    handle.repeat = [2, 1];
    handle.anisotropy = 4;
    cachedBatWoods.set(tone, handle);
    return handle;
  } catch {
    cachedBatWoods.set(tone, null);
    return null;
  }
}

/** Stitched cowhide normal + roughness maps for the baseball (keeps base color untouched). */
export function baseballSeamTextures(): BaseballSeamMaps | null {
  if (cachedBallSeams !== undefined) return cachedBallSeams;
  if (typeof document === "undefined") return (cachedBallSeams = null);
  try {
    const size = 128;
    const normCvs = document.createElement("canvas");
    const roughCvs = document.createElement("canvas");
    normCvs.width = roughCvs.width = size;
    normCvs.height = roughCvs.height = size;
    const nCtx = normCvs.getContext("2d");
    const rCtx = roughCvs.getContext("2d");
    if (!nCtx || !rCtx) return (cachedBallSeams = null);
    const nImg = nCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const v = (y + 0.5) / size;
      const lat = (v - 0.5) * Math.PI;
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        const lon = u * Math.PI * 2;
        // Two figure-8 baseball seam arcs on the sphere UV
        const seamTarget = 0.42 * Math.sin(lon * 2);
        const dist = Math.abs(lat - seamTarget);
        const seamMask = Math.max(0, 1 - dist / 0.09);
        const stitchChevron = seamMask * Math.sin(lon * 54) * 0.42;
        const ridge = (lat > seamTarget ? 1 : -1) * seamMask * 0.36;
        const pebbleX = (hash01(x, y, 0xba11) - 0.5) * 0.14;
        const pebbleY = (hash01(x + 31, y + 17, 0xba12) - 0.5) * 0.14;
        const nx = Math.max(-0.55, Math.min(0.55, stitchChevron + pebbleX));
        const ny = Math.max(-0.55, Math.min(0.55, ridge + pebbleY));
        const nz = Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny));
        const i = (y * size + x) * 4;
        nImg.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        nImg.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        nImg.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        nImg.data[i + 3] = 255;

        const roughByte = Math.round((0.40 + seamMask * 0.36 + (hash01(x, y, 0xba13) - 0.5) * 0.08) * 255);
        rImg.data[i] = roughByte;
        rImg.data[i + 1] = roughByte;
        rImg.data[i + 2] = roughByte;
        rImg.data[i + 3] = 255;
      }
    }
    nCtx.putImageData(nImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    const normal = texture.canvas({ canvas: normCvs, colorSpace: "linear", flipY: false });
    const roughness = texture.canvas({ canvas: roughCvs, colorSpace: "linear", flipY: false });
    normal.wrapS = roughness.wrapS = "repeat";
    normal.wrapT = roughness.wrapT = "clamp";
    cachedBallSeams = { normal, roughness };
    return cachedBallSeams;
  } catch {
    return (cachedBallSeams = null);
  }
}

/** Converts a shared 8x4 procedural flipbook (`dust` or `sparks`) into an in-memory PNG data URL for `effects.flipbook`. */
export function flipbookAtlasDataUrl(kind: "dust" | "sparks"): string | null {
  if (cachedFlipbookUrls.has(kind)) return cachedFlipbookUrls.get(kind) ?? null;
  if (typeof document === "undefined") {
    cachedFlipbookUrls.set(kind, null);
    return null;
  }
  try {
    const atlas = createFlipbookAtlas(kind);
    const raw = atlas.texture as unknown as { width?: number; height?: number; data?: Uint8Array };
    if (!raw.width || !raw.height || !raw.data) {
      cachedFlipbookUrls.set(kind, null);
      return null;
    }
    const { width, height, data } = raw;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cachedFlipbookUrls.set(kind, null);
      return null;
    }
    const img = ctx.createImageData(width, height);
    img.data.set(data);
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL("image/png");
    cachedFlipbookUrls.set(kind, url);
    return url;
  } catch {
    cachedFlipbookUrls.set(kind, null);
    return null;
  }
}

/**
 * DIA-M2: a small, repeating running-bond brick texture for Ivy's existing
 * wall batch. It is shared across park rebuilds and needs no extra geometry.
 */
export function ivyBrickTexture(): unknown | null {
  if (cachedIvyBrick !== undefined) return cachedIvyBrick;
  if (typeof document === "undefined") return (cachedIvyBrick = null);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return (cachedIvyBrick = null);
    ctx.fillStyle = "#8d8275";
    ctx.fillRect(0, 0, 128, 128);
    const bricks = ["#854a39", "#955746", "#794334", "#a1604c"];
    for (let row = 0; row < 8; row++) {
      for (let column = -1; column < 5; column++) {
        const x = column * 32 + (row % 2) * 16;
        ctx.fillStyle = bricks[((column + 4) * 3 + row * 5) % bricks.length]!;
        ctx.fillRect(x + 1, row * 16 + 1, 30, 14);
      }
    }
    const handle = texture.canvas({ canvas, colorSpace: "srgb", flipY: false });
    handle.wrapS = "repeat";
    handle.wrapT = "repeat";
    handle.repeat = [12, 4];
    handle.anisotropy = 4;
    cachedIvyBrick = handle;
  } catch {
    cachedIvyBrick = null;
  }
  return cachedIvyBrick;
}

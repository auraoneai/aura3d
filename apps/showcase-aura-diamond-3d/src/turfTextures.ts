/**
 * GU47 DIA-M1: the three field textures (mowing mask, grass blade normals, clay pebble normals) as live `texture.canvas`
 * handles. Canvas textures generate mipmaps (data textures do not), so the stripes and blades stay calm at distance.
 * Built once per page and shared by every park (the turf colour lives in the material, not the texture). Returns null
 * where there is no DOM (unit tests), and the field falls back to plain colours.
 */
import { texture } from "@aura3d/engine";
import { TURF_LAYOUT, bladeNormalTexels, clayNormalTexels, mowMaskTexels, tileRepeat, type TexelBlock } from "../art/turf";

export interface TurfTextures {
  /** Grey mowing mask, multiplied over the turf colour (sRGB). */
  readonly mowMask: unknown;
  /** Grass blade normals, one tile per 2 m. */
  readonly bladeNormal: unknown;
  /** Infield clay normals. */
  readonly clayNormal: unknown;
}

let cached: TurfTextures | null | undefined;
let cachedIvyBrick: unknown | null | undefined;

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
      clayNormal: canvasTexture(clayNormalTexels(), "linear", tileRepeat(26, TURF_LAYOUT.clayTileMetres))
    };
  } catch {
    cached = null;
  }
  return cached;
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

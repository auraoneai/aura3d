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

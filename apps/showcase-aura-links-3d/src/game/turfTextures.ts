/**
 * GU47 LINKS-05: the turf textures as live `texture.canvas` handles (canvas textures build a mip chain, so stripes and
 * blades stay calm at distance). One handle per (kind, tile metres), built once per page and shared by every hole and
 * course; the colour lives in the material. Returns null without a DOM (unit tests) and the surfaces fall back to plain
 * colour, as on `?look=original`.
 */
import { texture } from "@aura3d/engine";
import { mowStripeTexels, normalTexels, patchTexels, type LinksMaskKind, type LinksNormalKind, type SurfaceMap, type TexelBlock } from "./turf";

const cache = new Map<string, unknown>();
let unavailable = typeof document === "undefined";

function blockFor(kind: LinksMaskKind | LinksNormalKind): TexelBlock {
  if (kind === "mow") return mowStripeTexels();
  if (kind === "patch") return patchTexels();
  return normalTexels(kind);
}

function canvasHandle(block: TexelBlock, colorSpace: "srgb" | "linear", tileMetres: number): unknown {
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
  // uv0 is in world metres (terrainMesh.ts): one tile every `tileMetres`
  handle.repeat = [1 / tileMetres, 1 / tileMetres];
  handle.anisotropy = 8;
  return handle;
}

/** The shared handle of one surface map (masks are sRGB, normals linear), or null where canvases are unavailable. */
export function turfTexture(map: SurfaceMap<LinksMaskKind | LinksNormalKind>): unknown {
  if (unavailable) return null;
  const key = `${map.kind}|${map.tileMetres}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const isMask = map.kind === "mow" || map.kind === "patch";
    const handle = canvasHandle(blockFor(map.kind), isMask ? "srgb" : "linear", map.tileMetres);
    cache.set(key, handle);
    return handle;
  } catch {
    unavailable = true;
    return null;
  }
}

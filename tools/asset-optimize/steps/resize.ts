import { TextureResizeFilter, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";
import { recordStep } from "./common.js";

/**
 * §6.3 step 4 — downscale to the profile max, power-of-two, Lanczos3.
 * Normal maps are renormalized after resize (per-pixel XYZ → unit length).
 * Flags `texture-waste` when a texture exceeds the profile max on a mesh
 * below the profile triangle floor.
 */
export const stepResize = recordStep("resize", async (doc, ctx) => {
  const max = ctx.profile.textures.maxSize;

  // texture-waste: big textures on below-floor geometry (the 216-tri / 3×1024² case).
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      triangles += (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0) / 3;
    }
  }
  const floor = ctx.profile.triangles.floor;
  if (floor > 0 && triangles < floor) {
    for (const texture of doc.getRoot().listTextures()) {
      const size = texture.getSize() ?? [0, 0];
      if (Math.max(...size) > max) {
        ctx.flags.push("texture-waste");
        break;
      }
    }
  }

  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: "png",
      resize: [max, max],
      resizeFilter: TextureResizeFilter.LANCZOS3
    })
  );

  // Renormalize normal-map pixels post-resize.
  const normalTextures = new Set<import("@gltf-transform/core").Texture>();
  for (const material of doc.getRoot().listMaterials()) {
    const t = material.getNormalTexture();
    if (t) normalTextures.add(t);
  }
  for (const texture of normalTextures) {
    const image = texture.getImage();
    if (!image) continue;
    const meta = await sharp(image).metadata();
    const w = meta.width ?? 0, h = meta.height ?? 0;
    if (!w || !h) continue;
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = new Uint8Array(data);
    for (let i = 0; i < px.length; i += info.channels) {
      const x = (px[i] / 255) * 2 - 1, y = (px[i + 1] / 255) * 2 - 1, z = (px[i + 2] / 255) * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      px[i] = Math.round(((x / len) + 1) * 127.5);
      px[i + 1] = Math.round(((y / len) + 1) * 127.5);
      px[i + 2] = Math.round(((z / len) + 1) * 127.5);
    }
    const png = await sharp(px, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
    texture.setImage(new Uint8Array(png)).setMimeType("image/png");
  }
});

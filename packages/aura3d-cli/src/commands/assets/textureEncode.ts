/**
 * Texture encoding for `assets optimize` (file mode) and `assets merge-clips`: colour and occlusion maps become JPEG,
 * while normal maps and metallicRoughness maps are never JPEG-encoded (lessons A11, A12). JPEG's 8x8 blocks and chroma
 * loss read as dents in reflections when they land in a normal map, and as blotchy sheen when they land in roughness and
 * metalness. Lossless textures are resized as PNG; one that is already lossy (a generator that delivered JPEG) and
 * already within the size budget is left byte-for-byte as it is, since re-encoding never repairs it.
 *
 * A texture shared between a lossless slot and a colour slot (an ORM image used for occlusion and metallicRoughness)
 * stays lossless. glTF-Transform's `textureCompress` selects by slot with "any slot matches", so the exact texture sets
 * are selected through a temporary marker name matched by its `pattern` option.
 */

import { sniffImageSize } from "../../admission/texel.js";
import type { GltfToolkit, Loose } from "./gltfToolkit.js";

/** Material texture slots that are never JPEG-encoded (normalTexture, clearcoatNormalTexture, metallicRoughnessTexture). */
export const LOSSLESS_TEXTURE_SLOT = /normal|metallicRoughness/i;

export interface LosslessTextureRecord {
  readonly texture: string;
  readonly slots: readonly string[];
  /** "png": written or resized as PNG. "kept": an already-lossy source within budget, left untouched. */
  readonly result: "png" | "kept";
  readonly sourceFormat: string;
}

export interface EncodeTexturesOptions {
  /** Longest side for every texture. */
  readonly tex: number;
  /** JPEG quality for colour/occlusion textures. */
  readonly quality: number;
}

function label(doc: Loose, texture: Loose): string {
  return texture.getName() || texture.getURI() || `texture ${doc.getRoot().listTextures().indexOf(texture)}`;
}

async function withMarkedTextures(doc: Loose, textures: readonly Loose[], run: (pattern: RegExp) => Promise<void>): Promise<void> {
  if (textures.length === 0) return;
  const marker = `__aura3d_tex_${process.pid}_${Math.random().toString(36).slice(2, 8)}_`;
  const names = new Map<Loose, string>();
  textures.forEach((texture, index) => {
    names.set(texture, texture.getName());
    texture.setName(`${marker}${index}`);
  });
  try {
    await run(new RegExp(`^${marker}\\d+$`));
  } finally {
    for (const [texture, name] of names) texture.setName(name);
  }
}

/** Resize every texture to `tex`; JPEG colour/occlusion maps; keep normal and metallicRoughness maps lossless. */
export async function encodeTexturesKeepingPbrLossless(doc: Loose, toolkit: GltfToolkit, options: EncodeTexturesOptions): Promise<LosslessTextureRecord[]> {
  const { textureCompress, listTextureSlots } = toolkit.functions as Loose;
  const textures: Loose[] = doc.getRoot().listTextures();
  const lossless: Loose[] = [];
  const lossy: Loose[] = [];
  for (const texture of textures) {
    const slots = listTextureSlots(texture) as string[];
    (slots.some((slot) => LOSSLESS_TEXTURE_SLOT.test(slot)) ? lossless : lossy).push(texture);
  }
  await withMarkedTextures(doc, lossy, (pattern) =>
    doc.transform(textureCompress({ encoder: toolkit.sharp, resize: [options.tex, options.tex], targetFormat: "jpeg", quality: options.quality, pattern })));

  const records: LosslessTextureRecord[] = [];
  const toPng: Loose[] = [];
  for (const texture of lossless) {
    const mime = String(texture.getMimeType() ?? "");
    const sourceFormat = mime.replace(/^image\//, "") || "unknown";
    const record = { texture: label(doc, texture), slots: listTextureSlots(texture) as string[], sourceFormat };
    const image = texture.getImage() as Uint8Array | null;
    const size = image ? sniffImageSize(Buffer.from(image.buffer, image.byteOffset, image.byteLength), mime) : undefined;
    const withinBudget = size !== undefined && Math.max(size[0], size[1]) <= options.tex;
    if (mime !== "image/png" && withinBudget) {
      records.push({ ...record, result: "kept" });
      continue;
    }
    if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
      // KTX2 and other GPU formats cannot be re-encoded here.
      records.push({ ...record, result: "kept" });
      continue;
    }
    toPng.push(texture);
    records.push({ ...record, result: "png" });
  }
  await withMarkedTextures(doc, toPng, (pattern) =>
    doc.transform(textureCompress({ encoder: toolkit.sharp, resize: [options.tex, options.tex], targetFormat: "png", pattern })));
  return records;
}

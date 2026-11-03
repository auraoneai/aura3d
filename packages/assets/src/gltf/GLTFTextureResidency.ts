import type { Texture, TexturePixelData } from "@aura3d/rendering";
import type { TextureResidencySource } from "../TextureResidencyController.js";

/** The decoded mip payload consumed by the device-local residency adapters. */
export interface GLTFTextureResidencyMip {
  readonly data: TexturePixelData;
  /** Uncompressed alternative for a device without the source's compressed format. */
  readonly fallbackData?: Uint8Array;
}

export type GLTFTextureFallback = "factor" | "normal" | "bump" | "anisotropy";

/** Neutral samples for the material operation using this texture. */
export function gltfTextureFallback(kind: GLTFTextureFallback): readonly [number, number, number, number] {
  switch (kind) {
    case "normal": return [128, 128, 255, 255];
    case "bump": return [128, 128, 128, 255];
    case "anisotropy": return [255, 128, 0, 255];
    default: return [255, 255, 255, 255];
  }
}

/**
 * Wrap the CPU mips already retained by a static glTF Texture. The Texture
 * remains owned by the glTF resources; a source neither mutates nor disposes
 * it. Sources can be leased independently by multiple rendering devices.
 *
 * Only complete retained mip chains can be registered. Source-backed images
 * and textures with missing mip bytes remain unmanaged.
 * KTX2 bytes have already been fetched and transcoded at this point: this is
 * GPU residency streaming, not network-range or decode streaming.
 */
export function createGLTFTextureResidencySource(
  texture: Texture,
  fallback: GLTFTextureFallback
): TextureResidencySource<GLTFTextureResidencyMip> | undefined {
  if (texture.dimension !== "2d" || texture.dynamic || texture.source || texture.format === "depth24"
      || !texture.usage.includes("sampled") || texture.usage.includes("storage") || texture.usage.includes("render-attachment")) return undefined;
  const levels = texture.textureLevels;
  if (!levels.length || levels.length !== texture.mipLevelCount) return undefined;
  const alternatives = texture.fallbackTextureLevels;
  const sourceRevision = texture.revision;
  return {
    texture,
    identity: texture,
    label: texture.label,
    fallback: gltfTextureFallback(fallback),
    levels: levels.map((level) => ({ width: level.width, height: level.height, bytes: level.data.byteLength })),
    async loadMip(index, signal) {
      if (signal.aborted) throw signal.reason ?? Object.assign(new Error("Texture mip load aborted"), { name: "AbortError" });
      if (texture.disposed || texture.revision !== sourceRevision) throw new Error("The retained glTF texture changed or was disposed");
      const level = levels[index];
      if (!level) throw new Error(`No retained glTF texture mip ${index}`);
      const alternative = alternatives[index];
      const pixels = alternative?.width === level.width && alternative.height === level.height ? alternative.data : undefined;
      const fallbackData = pixels instanceof Uint8Array ? pixels
        : pixels instanceof Uint8ClampedArray ? new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
        : undefined;
      return { value: { data: level.data, ...(fallbackData ? { fallbackData } : {}) }, release() {} };
    }
  };
}

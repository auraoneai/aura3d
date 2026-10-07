import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";

export type { CompressedTextureCapabilities };

/**
 * C-16 §7.4 — GPU-compressed targets a KTX2 texture can be transcoded to.
 * "bc1-rgb-unorm" is the opaque ETC1S target; the existing
 * `TextureCompressedFormat` member "bc1-rgba-unorm" covers the same block
 * layout on the render side (DXT1 has no alpha plane).
 */
export type KTX2BasisTargetFormat =
  | "astc-4x4-rgba-unorm"
  | "bc7-rgba-unorm"
  | "etc2-rgba8unorm"
  | "etc2-rgb8unorm"
  | "bc3-rgba-unorm"
  | "bc1-rgb-unorm"
  | "rgba8";

/**
 * KTX2 target selection (PRD-05 §7.4, ASSET_MATRIX §matrix.ktx2).
 *
 *   UASTC  → astc-4x4 > bc7 > etc2-rgba8 > rgba8
 *   ETC1S  → etc2-rgb8 (opaque) / etc2-rgba8 (alpha)
 *          > bc1 (opaque) / bc3 (alpha) > rgba8
 *   sRGB slot on a device with s3tc but not s3tcSrgb never picks bc1/bc3 —
 *   it selects bptc when available, else rgba8 (linear BC would decode the
 *   sRGB texels incorrectly).
 *
 * ASTC/BPTC/ETC2 each carry sRGB internal-format variants inside the same
 * WebGL extension, so colour space only constrains the S3TC branch (S3TC
 * splits unorm and sRGB support across two extensions).
 */
export function selectKTX2TargetFormat(
  caps: CompressedTextureCapabilities,
  source: "uastc" | "etc1s",
  hasAlpha: boolean,
  colorSpace: "srgb" | "linear"
): KTX2BasisTargetFormat {
  if (source === "uastc") {
    if (caps.astc) return "astc-4x4-rgba-unorm";
    if (caps.bptc) return "bc7-rgba-unorm";
    if (caps.etc2) return "etc2-rgba8unorm";
    return "rgba8";
  }
  // ETC1S
  if (caps.etc2) return hasAlpha ? "etc2-rgba8unorm" : "etc2-rgb8unorm";
  const s3tcUsable = colorSpace === "srgb" ? caps.s3tcSrgb : caps.s3tc;
  if (s3tcUsable) return hasAlpha ? "bc3-rgba-unorm" : "bc1-rgb-unorm";
  if (colorSpace === "srgb" && caps.s3tc && !caps.s3tcSrgb && caps.bptc) {
    return "bc7-rgba-unorm";
  }
  return "rgba8";
}

// PR 0b-3 carve-out (CONTRACTS.md §3.6) — verbatim move from GLTFRenderResources.ts; 0 changed logic lines.
// File: packages/assets/src/gltf/ImageDecode.ts — owner lane 05.
//
// Contents: `decodeImageInBrowser` plus its sole dependencies (`readImageBytes`,
// `fetchImageBlob`, `isKTX2BasisImage`, `resolveImageUrl`, `resolveAbsoluteAssetBase`).
// GLTFRenderResources.ts imports `decodeImageInBrowser` back for the default
// `options.imageDecoder` path; the type edge back is import-type only.

import type { GLTFAsset, GLTFImageAsset } from "../GLTFLoader";
import { ktx2TargetToTextureFormat, transcodeKTX2BasisTexture } from "../KTX2BasisTextureTranscoder";
import type { DecodedGLTFImage, GLTFRenderResourceOptions } from "../GLTFRenderResources";

export async function decodeImageInBrowser(
  image: GLTFImageAsset,
  _imageIndex: number,
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<DecodedGLTFImage> {
  if (isKTX2BasisImage(image)) {
    const bytes = new Uint8Array(await readImageBytes(asset, image));
    const decoded = await transcodeKTX2BasisTexture(bytes, {
      ...options.ktx2BasisTranscoderOptions,
      // Without capability input the only safe transcode target is the
      // uncompressed path; registry-provided decoders always pass a target.
      targetFormat: options.ktx2BasisTargetFormat ?? options.ktx2BasisTranscoderOptions?.targetFormat ?? "rgba8",
      // C-16: skip mip levels above the C-27 texture-size ceiling when present.
      maxDimension: options.maxTextureSize ?? options.ktx2BasisTranscoderOptions?.maxDimension
    });
    return { ...decoded, format: ktx2TargetToTextureFormat(decoded.format) };
  }
  if (typeof createImageBitmap === "function") {
    const blob = image.data
      ? new Blob([image.data], { type: image.mimeType ?? "application/octet-stream" })
      : await fetchImageBlob(asset, image);
    let bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none"
    });
    // PRD-05 Phase 1 (A3D_QR_ASSETS): downscale oversized PNG/JPEG sources at
    // decode time so they honour the C-27 maxTextureSize ceiling instead of
    // uploading at full res. Flag-off passes no resize options.
    if (options.qrAssets === true && options.maxTextureSize !== undefined) {
      const largest = Math.max(bitmap.width, bitmap.height);
      if (largest > options.maxTextureSize) {
        const scale = options.maxTextureSize / largest;
        const resized = await createImageBitmap(blob, {
          colorSpaceConversion: "none",
          premultiplyAlpha: "none",
          resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
          resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
          resizeQuality: "high"
        });
        bitmap.close();
        bitmap = resized;
      }
    }
    return { width: bitmap.width, height: bitmap.height, source: bitmap, colorSpace: "srgb" };
  }
  const ImageCtor = globalThis.Image;
  if (!ImageCtor || !image.uri) {
    throw new Error("glTF image decoding requires createImageBitmap, HTMLImageElement, or a custom imageDecoder");
  }
  const imageElement = new ImageCtor();
  const url = resolveImageUrl(asset.url, image.uri);
  return new Promise((resolve, reject) => {
    imageElement.onload = () => resolve({ width: imageElement.width, height: imageElement.height, source: imageElement, colorSpace: "srgb" });
    imageElement.onerror = () => reject(new Error(`glTF image decode failed for ${url}`));
    imageElement.src = url;
  });
}

export async function readImageBytes(asset: GLTFAsset, image: GLTFImageAsset): Promise<ArrayBuffer> {
  if (image.data) return image.data.slice(0);
  const blob = await fetchImageBlob(asset, image);
  return blob.arrayBuffer();
}

async function fetchImageBlob(asset: GLTFAsset, image: GLTFImageAsset): Promise<Blob> {
  if (!image.uri) {
    throw new Error("glTF image has no uri or embedded data");
  }
  if (typeof fetch !== "function") {
    throw new Error("glTF image fetch requires fetch or a custom imageDecoder");
  }
  const response = await fetch(resolveImageUrl(asset.url, image.uri));
  if (!response.ok) {
    throw new Error(`glTF image request failed with ${response.status}`);
  }
  return response.blob();
}

export function isKTX2BasisImage(image: GLTFImageAsset): boolean {
  return image.mimeType === "image/ktx2" || /\.ktx2(?:[?#]|$)/i.test(image.uri ?? "");
}

export function resolveImageUrl(assetUrl: string, imageUri: string): string {
  if (/^(?:data:|blob:|https?:|file:)/i.test(imageUri)) return imageUri;
  if (assetUrl.startsWith("data:")) {
    throw new Error(`Relative glTF image uri ${imageUri} cannot be resolved from a data URL asset`);
  }
  return new URL(imageUri, resolveAbsoluteAssetBase(assetUrl)).toString();
}

/**
 * Derive an absolute base URL for resolving relative texture URIs.
 *
 * Catalog assets are often loaded from root-relative paths (e.g.
 * `/aura-assets/x.glb`). `new URL(uri, base)` requires `base` to be absolute, so
 * a bare relative `assetUrl` throws `Failed to construct 'URL': Invalid base URL`.
 * If the asset URL is already absolute we use it directly; otherwise we resolve it
 * against the document/origin base when running in a browser, falling back to a
 * synthetic `file:///` origin so resolution never throws in non-browser contexts.
 */
export function resolveAbsoluteAssetBase(assetUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetUrl)) return assetUrl;
  const documentBase =
    (typeof document !== "undefined" && document.baseURI) ||
    (typeof location !== "undefined" && location.href) ||
    undefined;
  if (documentBase) {
    try {
      return new URL(assetUrl, documentBase).toString();
    } catch {
      // fall through to synthetic base below
    }
  }
  return new URL(assetUrl, "file:///").toString();
}

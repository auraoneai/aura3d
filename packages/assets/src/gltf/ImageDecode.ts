// PR 0b-3 carve-out (CONTRACTS.md §3.6) from GLTFRenderResources.ts.
// File: packages/assets/src/gltf/ImageDecode.ts — owner lane 05.
//
// Contents: `decodeImageInBrowser` plus its sole dependencies (`readImageBytes`,
// `isKTX2BasisImage`, `resolveImageUrl`, `resolveAbsoluteAssetBase`).
// GLTFRenderResources.ts imports `decodeImageInBrowser` back for the default
// `options.imageDecoder` path; the type edge back is import-type only.

import { fetchGltfBytesShared, gltfImageRequestOptions, gltfImageRequestProgress, resolveGltfDependencyUri, type GLTFAsset, type GLTFImageAsset } from "../GLTFLoader";
import { MAX_KTX2_INPUT_BYTES, ktx2TargetToTextureFormat, transcodeKTX2BasisTexture } from "../KTX2BasisTextureTranscoder";
import { MAX_BROWSER_IMAGE_BYTES, assertBrowserImageDimensions, inspectBrowserImageDimensions } from "../BrowserImageDimensions";
import { AssetSizeError, verifyAssetBytes } from "../LoaderFetch";
import { LoadContext } from "../LoadContext";
import { redactAssetUrl, validateAssetMaxBytes } from "../AssetLoader";
import type { DecodedGLTFImage, GLTFImageDecodeContext, GLTFRenderResourceOptions } from "../GLTFRenderResources";
import { assetPhaseMark } from "../assetPhaseMarks";

export async function decodeImageInBrowser(
  image: GLTFImageAsset,
  _imageIndex: number,
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<DecodedGLTFImage> {
  assetPhaseMark(`image-decode:start:${_imageIndex}`);
  // Each render-resource creation owns its decoded image. Sharing a promise
  // would couple independent abort signals and reuse a closeable bitmap.
  const decoded = await decodeImageInBrowserUnmarked(image, _imageIndex, asset, options);
  assetPhaseMark(`image-decode:end:${_imageIndex}`);
  return decoded;
}

async function decodeImageInBrowserUnmarked(
  image: GLTFImageAsset,
  _imageIndex: number,
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions
): Promise<DecodedGLTFImage> {
  const signal = new LoadContext({ signal: options.signal }).signalFor(options.request?.signal);
  throwIfAborted(signal);
  if (isKTX2BasisImage(image)) {
    const bytes = new Uint8Array(await readImageBytes(asset, image, { signal, request: options.request }, MAX_KTX2_INPUT_BYTES));
    const decoded = await transcodeKTX2BasisTexture(bytes, {
      ...options.ktx2BasisTranscoderOptions,
      signal: new LoadContext({ signal }).signalFor(options.ktx2BasisTranscoderOptions?.signal),
      // Without capability input the only safe transcode target is the
      // uncompressed path; registry-provided decoders always pass a target.
      targetFormat: options.ktx2BasisTargetFormat ?? options.ktx2BasisTranscoderOptions?.targetFormat ?? "rgba8",
      // C-16: skip mip levels above the C-27 texture-size ceiling when present.
      maxDimension: options.maxTextureSize ?? options.ktx2BasisTranscoderOptions?.maxDimension
    });
    throwIfAborted(signal);
    return { ...decoded, format: ktx2TargetToTextureFormat(decoded.format) };
  }
  const useBitmap = typeof createImageBitmap === "function";
  const ImageCtor = useBitmap ? undefined : globalThis.Image;
  if (!useBitmap && (!ImageCtor || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function")) {
    throw new Error("glTF image decoding requires createImageBitmap, HTMLImageElement, or a custom imageDecoder");
  }
  const imageUrl = image.uri ?? image.name;
  const bytes = await readImageBytesWithLimit(asset, image, { signal, request: options.request }, MAX_BROWSER_IMAGE_BYTES);
  throwIfAborted(signal);
  inspectBrowserImageDimensions(bytes, imageUrl);
  const blob = new Blob([bytes], { type: image.mimeType ?? "application/octet-stream" });
  if (useBitmap) {
    let bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none"
    });
    try {
      throwIfAborted(signal);
      assertBrowserImageDimensions(bitmap.width, bitmap.height, imageUrl);
    } catch (error) {
      closeBitmap(bitmap);
      throw error;
    }
    // PRD-05 Phase 1 (A3D_QR_ASSETS): downscale oversized PNG/JPEG sources at
    // decode time so they honour the C-27 maxTextureSize ceiling instead of
    // uploading at full res. Flag-off passes no resize options.
    if (options.qrAssets === true && options.maxTextureSize !== undefined) {
      const largest = Math.max(bitmap.width, bitmap.height);
      if (largest > options.maxTextureSize) {
        const scale = options.maxTextureSize / largest;
        let resized: ImageBitmap | undefined;
        try {
          resized = await createImageBitmap(blob, {
            colorSpaceConversion: "none",
            premultiplyAlpha: "none",
            resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
            resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
            resizeQuality: "high"
          });
          throwIfAborted(signal);
          assertBrowserImageDimensions(resized.width, resized.height, imageUrl);
        } catch (error) {
          closeBitmap(resized);
          closeBitmap(bitmap);
          throw error;
        }
        try { bitmap.close(); } catch (error) { closeBitmap(resized); throw error; }
        bitmap = resized;
      }
    }
    return { width: bitmap.width, height: bitmap.height, source: bitmap, colorSpace: "srgb" };
  }
  const imageElement = new ImageCtor!();
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      imageElement.onload = null;
      imageElement.onerror = null;
      try { URL.revokeObjectURL(url); } catch { /* Preserve the load result. */ }
    };
    const clearSource = () => { try { imageElement.src = ""; } catch { /* Preserve the load result. */ } };
    const abort = () => { cleanup(); clearSource(); reject(signal?.reason ?? new DOMException("Image decode aborted", "AbortError")); };
    imageElement.onload = () => {
      try {
        assertBrowserImageDimensions(imageElement.width, imageElement.height, imageUrl);
        if (imageElement.naturalWidth || imageElement.naturalHeight) {
          assertBrowserImageDimensions(imageElement.naturalWidth, imageElement.naturalHeight, imageUrl);
        }
        cleanup();
        resolve({ width: imageElement.width, height: imageElement.height, source: imageElement, colorSpace: "srgb" });
      } catch (error) {
        cleanup();
        clearSource();
        reject(error);
      }
    };
    imageElement.onerror = () => { cleanup(); reject(new Error(`glTF image decode failed for ${image.name}`)); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { imageElement.src = url; } catch (error) { cleanup(); reject(error); }
  });
}

export async function readImageBytes(asset: GLTFAsset, image: GLTFImageAsset, context: GLTFImageDecodeContext = {}, maxBytes?: number): Promise<ArrayBuffer> {
  validateAssetMaxBytes(maxBytes);
  return readImageBytesWithLimit(asset, image, context, maxBytes);
}

/** The document, caller and decoder may each impose a stricter input limit. */
export function gltfImageByteLimit(asset: GLTFAsset, requestMaxBytes?: number, decoderMaxBytes?: number): number | undefined {
  const inheritedMaxBytes = gltfImageRequestOptions(asset, asset.url).maxBytes;
  for (const value of [inheritedMaxBytes, requestMaxBytes, decoderMaxBytes]) validateAssetMaxBytes(value);
  const limits = [inheritedMaxBytes, requestMaxBytes, decoderMaxBytes].filter((value): value is number => value !== undefined);
  return limits.length ? Math.min(...limits) : undefined;
}

async function readImageBytesWithLimit(asset: GLTFAsset, image: GLTFImageAsset, context: GLTFImageDecodeContext, limit?: number): Promise<ArrayBuffer> {
  const signal = new LoadContext({ signal: context.signal }).signalFor(context.request?.signal);
  throwIfAborted(signal);
  if (image.data) {
    const request = image.uri && !image.uri.startsWith("data:")
      ? gltfImageRequestOptions(asset, image.uri, context.request)
      : context.request;
    const maxBytes = gltfImageByteLimit(asset, request?.maxBytes, limit);
    if (maxBytes !== undefined && image.data.byteLength > maxBytes) {
      throw new AssetSizeError(`glTF image ${redactAssetUrl(image.uri ?? image.name)} exceeds maxBytes (${maxBytes})`);
    }
    const bytes = image.data.slice(0);
    if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
      throw new AssetSizeError(`glTF image ${redactAssetUrl(image.uri ?? image.name)} exceeds maxBytes (${maxBytes})`);
    }
    if (image.uri && !image.uri.startsWith("data:")) {
      await verifyAssetBytes(bytes, request?.integrity, image.uri);
    }
    throwIfAborted(signal);
    return bytes;
  }
  const bytes = await fetchImageBytes(asset, image, { ...context, signal }, limit);
  throwIfAborted(signal);
  return bytes;
}

async function fetchImageBytes(asset: GLTFAsset, image: GLTFImageAsset, context: GLTFImageDecodeContext, limit?: number): Promise<ArrayBuffer> {
  if (!image.uri) {
    throw new Error("glTF image has no uri or embedded data");
  }
  const url = resolveImageUrl(asset.url, image.uri);
  const { signal: requestSignal, onProgress, ...overrides } = context.request ?? {};
  const signal = new LoadContext({ signal: context.signal }).signalFor(requestSignal);
  const request = gltfImageRequestOptions(asset, image.uri, overrides);
  const maxBytes = gltfImageByteLimit(asset, request.maxBytes, limit);
  return fetchGltfBytesShared(url, "buffer", { ...request, ...(maxBytes === undefined ? {} : { maxBytes }), url, signal, onProgress: onProgress ?? gltfImageRequestProgress(asset) }, (status) => `glTF image request failed with ${status}`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Image load aborted", "AbortError");
}

function closeBitmap(bitmap: ImageBitmap | undefined): void {
  try { bitmap?.close(); } catch { /* Preserve the failure that required cleanup. */ }
}

export function isKTX2BasisImage(image: GLTFImageAsset): boolean {
  return image.mimeType === "image/ktx2" || /\.ktx2(?:[?#]|$)/i.test(image.uri ?? "");
}

export function resolveImageUrl(assetUrl: string, imageUri: string): string {
  if (/^(?:data:|blob:|https?:)/i.test(imageUri)) return imageUri;
  return resolveGltfDependencyUri(imageUri, assetUrl, "glTF image");
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

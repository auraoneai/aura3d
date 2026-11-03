import { mergeAssetRequestOptions, redactAssetUrl, validateAssetMaxBytes, type AssetRequestOptions } from "./AssetLoader";
import { MAX_BROWSER_IMAGE_BYTES, assertBrowserImageDimensions, inspectBrowserImageDimensions } from "./BrowserImageDimensions";
import { AssetPolicyError, fetchBytes, type AuraLoaderProgress } from "./LoaderFetch";

export interface ImageBitmapLoaderOptions {
  /** Used only when imageOrientation was not explicitly supplied. */
  readonly flipY?: boolean;
  readonly colorSpaceConversion?: ColorSpaceConversion;
  readonly premultiplyAlpha?: PremultiplyAlpha;
  /** Explicit orientation takes precedence over flipY. */
  readonly imageOrientation?: ImageOrientation;
  /** Reject formats whose dimensions cannot be inspected before native decode. */
  readonly requireInspectableDimensions?: boolean;
}

export interface ImageBitmapLoadRequest extends AssetRequestOptions {
  readonly signal?: AbortSignal;
}

export class ImageBitmapLoader {
  path = "";
  withCredentials = false;
  requestHeader: Record<string, string> = {};
  options: Required<Omit<ImageBitmapLoaderOptions, "flipY" | "requireInspectableDimensions">> & { flipY: boolean };
  private explicitOrientation: ImageOrientation | undefined;
  private requireInspectableDimensions: boolean;

  constructor(options: ImageBitmapLoaderOptions = {}) {
    this.explicitOrientation = options.imageOrientation;
    this.requireInspectableDimensions = options.requireInspectableDimensions === true;
    this.options = {
      flipY: options.flipY ?? false,
      colorSpaceConversion: options.colorSpaceConversion ?? "default",
      premultiplyAlpha: options.premultiplyAlpha ?? "default",
      imageOrientation: options.imageOrientation ?? "from-image"
    };
  }

  setPath(value: string): this { this.path = value; return this; }
  setWithCredentials(value: boolean): this { this.withCredentials = value; return this; }
  setRequestHeader(value: Record<string, string>): this { this.requestHeader = { ...value }; return this; }

  setOptions(options: ImageBitmapLoaderOptions): this {
    if (Object.hasOwn(options, "imageOrientation")) this.explicitOrientation = options.imageOrientation;
    if (options.requireInspectableDimensions !== undefined) this.requireInspectableDimensions = options.requireInspectableDimensions === true;
    this.options = {
      flipY: options.flipY ?? this.options.flipY,
      colorSpaceConversion: options.colorSpaceConversion ?? this.options.colorSpaceConversion,
      premultiplyAlpha: options.premultiplyAlpha ?? this.options.premultiplyAlpha,
      imageOrientation: options.imageOrientation ?? this.options.imageOrientation
    };
    return this;
  }

  load(
    url: string,
    onLoad?: (bitmap: ImageBitmap) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void,
    request: ImageBitmapLoadRequest = {}
  ): Promise<ImageBitmap> {
    const pending = this.loadAsync(url, onProgress, request).then((bitmap) => {
      try {
        throwIfAborted(request.signal);
        onLoad?.(bitmap);
        return bitmap;
      } catch (error) {
        closeBitmap(bitmap);
        throw error;
      }
    });
    if (onError) void pending.catch(onError).catch(() => {});
    return pending;
  }

  async loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void, request: ImageBitmapLoadRequest = {}): Promise<ImageBitmap> {
    if (typeof createImageBitmap !== "function") throw new Error("ImageBitmapLoader requires createImageBitmap");
    const resolved = this.path ? `${this.path}${url}` : url;
    const options = { ...this.options };
    const requireInspectableDimensions = this.requireInspectableDimensions;
    const imageOrientation = this.explicitOrientation ?? (options.flipY ? "flipY" : "from-image");
    const policy = mergeAssetRequestOptions({
      credentials: this.withCredentials ? "include" : "same-origin",
      headers: this.requestHeader
    }, request);
    validateAssetMaxBytes(policy.maxBytes);
    const buffer = await fetchBytes(resolved, request.signal, onProgress, {
      ...policy, maxBytes: Math.min(MAX_BROWSER_IMAGE_BYTES, policy.maxBytes ?? MAX_BROWSER_IMAGE_BYTES)
    });
    throwIfAborted(request.signal);
    if (!inspectBrowserImageDimensions(buffer, resolved) && requireInspectableDimensions) {
      throw new AssetPolicyError(`Image format cannot be preflighted for dimensions: ${redactAssetUrl(resolved)}`);
    }
    // Decoding is not abortable, so a bitmap finishing after abort must be closed.
    const bitmap = await decodeBitmap(createImageBitmap(new Blob([buffer]), {
      colorSpaceConversion: options.colorSpaceConversion,
      premultiplyAlpha: options.premultiplyAlpha,
      imageOrientation
    }), request.signal);
    try {
      throwIfAborted(request.signal);
      assertBrowserImageDimensions(bitmap.width, bitmap.height, resolved);
    } catch (error) {
      closeBitmap(bitmap);
      throw error;
    }
    return bitmap;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Image load aborted", "AbortError");
}

function closeBitmap(bitmap: ImageBitmap): void {
  try { bitmap.close(); } catch { /* Preserve the initiating failure. */ }
}

function decodeBitmap(decoding: Promise<ImageBitmap>, signal?: AbortSignal): Promise<ImageBitmap> {
  if (!signal) return decoding;
  return new Promise((resolve, reject) => {
    let aborted = false;
    const abort = () => {
      aborted = true;
      reject(signal.reason ?? new DOMException("Image load aborted", "AbortError"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    decoding.then((bitmap) => {
      signal.removeEventListener("abort", abort);
      if (aborted) closeBitmap(bitmap);
      else resolve(bitmap);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      if (!aborted) reject(error);
    });
  });
}

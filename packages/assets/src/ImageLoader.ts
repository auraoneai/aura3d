import { AssetLoadError, mergeAssetRequestOptions, redactAssetUrl, validateAssetMaxBytes, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import { MAX_BROWSER_IMAGE_BYTES, assertBrowserImageDimensions, inspectBrowserImageDimensions } from "./BrowserImageDimensions";
import type { LoadContext } from "./LoadContext";
import { AssetIntegrityError, AssetPolicyError, AssetSizeError, fetchBytes } from "./LoaderFetch";

export interface ImageAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly source: ImageBitmap | HTMLImageElement;
}

export class ImageLoader implements AssetLoader<ImageAsset> {
  readonly type = "image";
  private readonly requireInspectableDimensions: boolean;

  /**
   * By default browser-dependent formats such as AVIF, SVG and uncommon JPEG
   * coding variants remain eligible for native decoding, although their
   * dimensions cannot be fully preflighted here. Set
   * `requireInspectableDimensions` to reject them before native decode.
   * Neither mode bounds native decoder scratch space or animation storage.
   */
  constructor(options: { readonly requireInspectableDimensions?: boolean } = {}) {
    this.requireInspectableDimensions = options.requireInspectableDimensions === true;
  }

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:png|jpg|jpeg|webp|gif|avif)(?:[?#].*)?$/i.test(request.url) || request.url.startsWith("data:image/");
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<ImageAsset> {
    const url = context.resolve(request.url);
    context.throwIfAborted(url);
    const signal = context.signalFor?.(request.signal) ?? request.signal;
    // Dependency policy resolves the original reference itself. Passing an
    // already-resolved relative URL would apply a relative base a second time.
    const contextOptions = context.requestOptionsFor?.(request.url);
    validateAssetMaxBytes(contextOptions?.maxBytes);
    validateAssetMaxBytes(request.maxBytes);
    const options = mergeAssetRequestOptions(contextOptions, request);
    // Honor the stricter context/request limits that reach this loader.
    // AssetManager may already have merged a root default with its override.
    const maxBytes = Math.min(MAX_BROWSER_IMAGE_BYTES, contextOptions?.maxBytes ?? MAX_BROWSER_IMAGE_BYTES, request.maxBytes ?? MAX_BROWSER_IMAGE_BYTES);
    // Decode only fetched, policy-checked, integrity-verified bytes. Pointing an
    // HTMLImageElement at the remote URL would silently discard headers,
    // redirect restrictions and content verification.
    let bytes: ArrayBuffer;
    try {
      bytes = await fetchBytes(url, signal, request.onProgress
        ? (progress) => request.onProgress?.({
            url,
            phase: "buffer",
            loadedBytes: progress.loaded,
            ...(progress.total === undefined ? {} : { totalBytes: progress.total })
          })
        : undefined, { ...options, maxBytes });
    } catch (error) {
      throwIfAborted(signal, url, context);
      // These transport errors already contain redacted URLs and retain their
      // non-retryable identities. Sanitize other browser/transport errors.
      if (error instanceof AssetSizeError || error instanceof AssetPolicyError || error instanceof AssetIntegrityError) throw error;
      throw imageFailure("Image request failed", url, context, error);
    }
    throwIfAborted(signal, url, context);
    const inspected = inspectBrowserImageDimensions(bytes, url);
    if (!inspected && this.requireInspectableDimensions) {
      throw new AssetPolicyError(`Image format cannot be preflighted for dimensions: ${redactAssetUrl(url)}`);
    }
    throwIfAborted(signal, url, context);
    const blob = new Blob([bytes]);

    if (typeof createImageBitmap === "function") {
      const bitmap = await decodeBitmap(blob, signal, url, context);
      try {
        throwIfAborted(signal, url, context);
        // This also rejects oversized results for formats that could not be
        // preflighted; it cannot undo allocations made during decoding.
        assertBrowserImageDimensions(bitmap.width, bitmap.height, url);
      } catch (error) {
        closeBitmap(bitmap);
        throw error;
      }
      return { url, width: bitmap.width, height: bitmap.height, source: bitmap };
    }

    const ImageCtor = globalThis.Image;
    if (!ImageCtor || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
      throw new Error("Image loading requires createImageBitmap or HTMLImageElement with object-URL support");
    }
    let image: HTMLImageElement | undefined;
    let objectUrl: string | undefined;
    try {
      const element = new ImageCtor();
      image = element;
      objectUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (error?: unknown) => {
          if (done) return;
          done = true;
          signal?.removeEventListener("abort", abort);
          element.onload = null;
          element.onerror = null;
          if (error !== undefined) {
            try { element.removeAttribute("src"); } catch { /* Preserve the original error. */ }
            reject(error);
          } else {
            resolve();
          }
        };
        const abort = () => finish(new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal?.reason));
        element.onload = () => finish();
        element.onerror = () => finish(new AssetLoadError("Image decode failed", url, context.dependencyChain));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        else {
          try { element.src = objectUrl!; }
          catch (error) { finish(imageFailure("Image decode failed", url, context, error)); }
        }
      });
      throwIfAborted(signal, url, context);
      assertBrowserImageDimensions(element.width, element.height, url);
      // naturalWidth/Height are intrinsic CSS pixels; check them too when
      // available, without claiming they bound native decoder allocations.
      if (element.naturalWidth || element.naturalHeight) {
        assertBrowserImageDimensions(element.naturalWidth, element.naturalHeight, url);
      }
      return { url, width: element.width, height: element.height, source: element };
    } catch (error) {
      try { image?.removeAttribute("src"); } catch { /* Preserve the original error. */ }
      if (error instanceof AssetLoadError || error instanceof AssetPolicyError || error instanceof AssetSizeError) throw error;
      throw imageFailure("Image decode failed", url, context, error);
    } finally {
      if (objectUrl !== undefined) {
        try { URL.revokeObjectURL(objectUrl); } catch { /* Do not mask the load result. */ }
      }
    }
  }

  dispose(asset: ImageAsset): void {
    if ("close" in asset.source && typeof asset.source.close === "function") {
      asset.source.close();
    } else if ("removeAttribute" in asset.source) {
      asset.source.onload = null;
      asset.source.onerror = null;
      asset.source.removeAttribute("src");
    }
  }
}

/** Reject a cancelled direct load promptly while still closing a late decode. */
function decodeBitmap(blob: Blob, signal: AbortSignal | undefined, url: string, context: LoadContext): Promise<ImageBitmap> {
  let decoding: Promise<ImageBitmap>;
  try {
    decoding = createImageBitmap(blob);
  } catch (error) {
    return Promise.reject(imageFailure("Image decode failed", url, context, error));
  }
  return new Promise<ImageBitmap>((resolve, reject) => {
    let done = false;
    const abort = () => {
      if (done) return;
      done = true;
      reject(new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal?.reason));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    decoding.then((bitmap) => {
      signal?.removeEventListener("abort", abort);
      if (done) {
        closeBitmap(bitmap);
        return;
      }
      done = true;
      resolve(bitmap);
    }, (error) => {
      signal?.removeEventListener("abort", abort);
      if (done) return;
      done = true;
      reject(imageFailure("Image decode failed", url, context, error));
    });
  });
}

function closeBitmap(bitmap: ImageBitmap): void {
  try { bitmap.close(); } catch { /* A failed cleanup must not mask cancellation or the size error. */ }
}

/** Browser exceptions can contain signed URLs, object URLs, or caller secrets. */
function imageFailure(message: string, url: string, context: LoadContext, error: unknown): AssetLoadError {
  let status: unknown;
  try { status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined; }
  catch { /* Do not expose an untrusted exception or accessor. */ }
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
    const cause = Object.assign(new Error(`HTTP ${status}`), { status });
    return new AssetLoadError(`${message} (HTTP ${status})`, url, context.dependencyChain, cause);
  }
  return new AssetLoadError(message, url, context.dependencyChain);
}

function throwIfAborted(signal: AbortSignal | undefined, url: string, context: LoadContext): void {
  if (signal?.aborted) throw new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason);
  context.throwIfAborted(url);
}

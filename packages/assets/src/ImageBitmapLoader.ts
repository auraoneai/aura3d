/**
 * threejs-parity ST-04 (§6 lane L4): `THREE.ImageBitmapLoader` — fetch and
 * decode a URL into an `ImageBitmap`, with three's option surface
 * (`flipY`/`colorSpaceConversion`/`premultiplyAlpha`/`imageOrientation` via
 * `createImageBitmap` options) and real progress/error callbacks.
 */

import { fetchBytes, type AuraLoaderProgress } from "./LoaderFetch.js";

export interface ImageBitmapLoaderOptions {
  /** three's `options.flipY` (default false for ImageBitmapLoader). */
  readonly flipY?: boolean;
  readonly colorSpaceConversion?: ColorSpaceConversion;
  readonly premultiplyAlpha?: PremultiplyAlpha;
  readonly imageOrientation?: ImageOrientation;
}

export class ImageBitmapLoader {
  path = "";
  withCredentials = false;
  options: Required<Omit<ImageBitmapLoaderOptions, "flipY">> & { flipY: boolean };

  constructor(options: ImageBitmapLoaderOptions = {}) {
    this.options = {
      flipY: options.flipY ?? false,
      colorSpaceConversion: options.colorSpaceConversion ?? "default",
      premultiplyAlpha: options.premultiplyAlpha ?? "default",
      imageOrientation: options.imageOrientation ?? "from-image"
    };
  }

  setPath(value: string): this {
    this.path = value;
    return this;
  }

  setOptions(options: ImageBitmapLoaderOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  load(
    url: string,
    onLoad?: (bitmap: ImageBitmap) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void
  ): Promise<ImageBitmap> {
    const pending = this.loadAsync(url, onProgress).then((bitmap) => {
      onLoad?.(bitmap);
      return bitmap;
    });
    if (onError) pending.catch(onError);
    return pending;
  }

  async loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void): Promise<ImageBitmap> {
    if (typeof createImageBitmap !== "function") {
      throw new Error("ImageBitmapLoader requires createImageBitmap");
    }
    const resolved = this.path ? `${this.path}${url}` : url;
    const buffer = await fetchBytes(resolved, undefined, onProgress);
    const blob = new Blob([buffer]);
    return createImageBitmap(blob, {
      colorSpaceConversion: this.options.colorSpaceConversion,
      premultiplyAlpha: this.options.premultiplyAlpha,
      imageOrientation: this.options.imageOrientation
    });
  }
}

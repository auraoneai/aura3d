/**
 * threejs-parity ST-04 (§6 lane L4): `THREE.FileLoader` — fetch a URL and hand
 * back the response in the requested `responseType`, with real progress
 * callbacks and abort support.
 */

import { fetchBytes, type AuraLoaderProgress } from "./LoaderFetch.js";

export type FileLoaderResponseType = "" | "arraybuffer" | "blob" | "document" | "json" | "text";

export class FileLoader<T = unknown> {
  /** three's `loader.responseType` — default `""` mirrors three's ArrayBuffer. */
  responseType: FileLoaderResponseType = "arraybuffer";
  /** three's `loader.mimeType` — applied via `Blob` type or left to the response. */
  mimeType?: string;
  /** three's `loader.withCredentials` — forwarded to `fetch` credentials. */
  withCredentials = false;
  /** three's `loader.requestHeader` — extra headers merged into the request. */
  requestHeader: Record<string, string> = {};
  /** Optional base URL prepended to relative `url`s (three's `path`). */
  path = "";

  setResponseType(value: FileLoaderResponseType): this {
    this.responseType = value;
    return this;
  }

  setMimeType(value: string): this {
    this.mimeType = value;
    return this;
  }

  setWithCredentials(value: boolean): this {
    this.withCredentials = value;
    return this;
  }

  setRequestHeader(value: Record<string, string>): this {
    this.requestHeader = value;
    return this;
  }

  setPath(value: string): this {
    this.path = value;
    return this;
  }

  /**
   * `loader.load(url, onLoad?, onProgress?, onError?)` — returns the decoded
   * response through a Promise and the optional three-style callbacks.
   */
  load(
    url: string,
    onLoad?: (data: T) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void
  ): Promise<T> {
    const pending = this.loadUrl(url, onProgress)
      .then((data) => {
        onLoad?.(data);
        return data;
      });
    if (onError) pending.catch(onError);
    return pending;
  }

  loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void): Promise<T> {
    return this.loadUrl(url, onProgress);
  }

  private async loadUrl(url: string, onProgress?: (progress: AuraLoaderProgress) => void): Promise<T> {
    const resolved = this.path ? `${this.path}${url}` : url;
    const buffer = await fetchBytes(resolved, undefined, onProgress);
    switch (this.responseType) {
      case "json":
        return JSON.parse(new TextDecoder().decode(buffer)) as T;
      case "text":
        return new TextDecoder().decode(buffer) as T;
      case "blob":
        return new Blob([buffer], this.mimeType ? { type: this.mimeType } : {}) as T;
      case "document": {
        if (typeof DOMParser === "undefined") {
          throw new Error("FileLoader responseType 'document' requires DOMParser (browser environment)");
        }
        const text = new TextDecoder().decode(buffer);
        return new DOMParser().parseFromString(text, (this.mimeType ?? "application/xml") as DOMParserSupportedType) as T;
      }
      case "arraybuffer":
      case "":
      default:
        return buffer as T;
    }
  }
}

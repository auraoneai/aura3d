/**
 * threejs-parity ST-04 (§6 lane L4): `THREE.DataTextureLoader` — the abstract
 * binary-format loader base. `EXRLoader`/`HDRLoader`-family subclasses decode
 * fetched bytes via `parse`; the public surface mirrors three:
 * `load(url, onLoad?, onProgress?, onError?)` + `loadAsync`.
 */

import { fetchBytes, type AuraLoaderProgress } from "./LoaderFetch.js";
import { mergeAssetRequestOptions } from "./AssetLoader.js";
import { LoadContext } from "./LoadContext.js";
import type { FileLoaderOptions } from "./FileLoader.js";

export abstract class DataTextureLoader<TData = unknown> {
  path = "";
  /** three's `loader.withCredentials` — forwarded to `fetch` credentials. */
  withCredentials = false;
  /** three's `loader.requestHeader` — extra headers merged into the request. */
  requestHeader: Record<string, string> = {};
  /** Request contract (credentials, headers, origin policy, integrity, maxBytes, cancellation) applied to every fetch. */
  requestOptions: FileLoaderOptions = {};

  setPath(value: string): this {
    this.path = value;
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

  setRequestOptions(value: FileLoaderOptions): this {
    this.requestOptions = value;
    return this;
  }

  /** Subclasses decode the fetched bytes (async allowed — EXR ZIP/PIZ inflate). */
  abstract parse(buffer: ArrayBuffer): Promise<TData> | TData;

  load(
    url: string,
    onLoad?: (data: TData) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void,
    options: FileLoaderOptions = {}
  ): Promise<TData> {
    const pending = this.loadAsync(url, onProgress, options).then((data) => {
      onLoad?.(data);
      return data;
    });
    if (onError) void pending.catch(onError).catch(() => {});
    return pending;
  }

  async loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void, options: FileLoaderOptions = {}): Promise<TData> {
    const resolved = this.path ? `${this.path}${url}` : url;
    const headers = new Headers(this.requestHeader);
    new Headers(this.requestOptions.headers).forEach((value, name) => headers.set(name, value));
    new Headers(options.headers).forEach((value, name) => headers.set(name, value));
    const defaults = mergeAssetRequestOptions({ credentials: this.withCredentials ? "include" : "same-origin" }, this.requestOptions);
    const request = { ...mergeAssetRequestOptions(defaults, options), headers };
    const signal = new LoadContext({ signal: this.requestOptions.signal }).signalFor(options.signal);
    const buffer = await fetchBytes(resolved, signal, onProgress, request);
    if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    return this.parse(buffer);
  }
}

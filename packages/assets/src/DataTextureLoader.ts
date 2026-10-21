/**
 * threejs-parity ST-04 (§6 lane L4): `THREE.DataTextureLoader` — the abstract
 * binary-format loader base. `EXRLoader`/`HDRLoader`-family subclasses decode
 * fetched bytes via `parse`; the public surface mirrors three:
 * `load(url, onLoad?, onProgress?, onError?)` + `loadAsync`.
 */

import { fetchBytes, type AuraLoaderProgress } from "./LoaderFetch.js";

export abstract class DataTextureLoader<TData = unknown> {
  path = "";

  setPath(value: string): this {
    this.path = value;
    return this;
  }

  /** Subclasses decode the fetched bytes (async allowed — EXR ZIP/PIZ inflate). */
  abstract parse(buffer: ArrayBuffer): Promise<TData> | TData;

  load(
    url: string,
    onLoad?: (data: TData) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void
  ): Promise<TData> {
    const pending = this.loadAsync(url, onProgress).then((data) => {
      onLoad?.(data);
      return data;
    });
    if (onError) pending.catch(onError);
    return pending;
  }

  async loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void): Promise<TData> {
    const resolved = this.path ? `${this.path}${url}` : url;
    const buffer = await fetchBytes(resolved, undefined, onProgress);
    return this.parse(buffer);
  }
}

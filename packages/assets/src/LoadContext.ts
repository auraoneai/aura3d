import { AssetLoadError, mergeAssetRequestOptions, redactAssetUrl, type AssetLoadRequest, type AssetRequestOptions } from "./AssetLoader";
import { AssetIntegrityError } from "./LoaderFetch";
import type { AssetHandle } from "./AssetHandle";
import type { AssetManager } from "./AssetManager";

export interface LoadContextOptions extends AssetRequestOptions {
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
  readonly dependencyChain?: readonly string[];
  /** Opaque manager-issued request keys; kept out of diagnostic chains. */
  readonly dependencyKeys?: readonly string[];
  readonly manager?: AssetManager;
  readonly onDependency?: (handle: AssetHandle<unknown>) => void;
  /** @internal The containing document for integrity and origin policy. */
  readonly documentUrl?: string;
}

export interface LoadDependencyOptions extends AssetRequestOptions {
  readonly format?: AssetLoadRequest["format"];
  readonly signal?: AbortSignal;
  readonly onProgress?: AssetLoadRequest["onProgress"];
}

export class LoadContext {
  readonly baseUrl: string;
  readonly signal?: AbortSignal;
  readonly dependencyChain: readonly string[];
  readonly dependencyKeys: readonly string[];
  readonly requestOptions: AssetRequestOptions;
  /** Whether the enclosing loader acquisition owns handles returned by loadDependency. */
  readonly tracksDependencies: boolean;
  private readonly manager?: AssetManager;
  private readonly onDependency?: (handle: AssetHandle<unknown>) => void;
  private readonly documentUrl?: string;

  constructor(options: LoadContextOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.signal = options.signal;
    this.dependencyChain = options.dependencyChain ?? [];
    this.dependencyKeys = options.dependencyKeys ?? [];
    this.manager = options.manager;
    this.onDependency = options.onDependency;
    this.tracksDependencies = options.onDependency !== undefined;
    this.documentUrl = options.documentUrl;
    this.requestOptions = mergeAssetRequestOptions({}, options);
  }

  resolve(url: string): string {
    if (url === this.documentUrl) return url;
    if (this.documentUrl && (url.startsWith("?") || url.startsWith("#") || url === "")) {
      try { return new URL(url, this.documentUrl).toString(); }
      catch {
        const withoutFragment = this.documentUrl.split("#", 1)[0] ?? "";
        return url.startsWith("#") ? `${withoutFragment}${url}` : `${withoutFragment.split("?", 1)[0]}${url}`;
      }
    }
    if (/^(?:data|blob):/i.test(url)) return url;
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
      try { return new URL(url).toString(); } catch { return url; }
    }
    if (url.startsWith("//")) {
      try {
        const base = /^[a-z][a-z\d+.-]*:\/\//i.test(this.baseUrl) ? this.baseUrl : globalThis.location?.href;
        const resolved = new URL(url, base ?? "https://aura3d.invalid/");
        return base ? resolved.toString() : `${resolved.href.slice(resolved.protocol.length)}`;
      } catch { return url; }
    }
    if (!this.baseUrl) return normalizeRelative(url);
    try { return new URL(url, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`).toString(); }
    catch {
      if (url.startsWith("/")) return normalizeRelative(url);
      return normalizeRelative(`${this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`}${url}`);
    }
  }

  /** Effective policy for the given document or dependency, with its own digest. */
  requestOptionsFor(url: string): AssetRequestOptions {
    if (!this.documentUrl || url === this.documentUrl || this.resolve(url) === this.documentUrl) return this.requestOptions;
    const { integrity, expectedUrl: _documentExpectedUrl, ...options } = this.requestOptions;
    const sourceOrigin = originOf(this.documentUrl) ?? options.sourceOrigin;
    if (!integrity) return { ...options, ...(sourceOrigin ? { sourceOrigin } : {}) };
    const resolved = this.resolve(url);
    const entry = Object.entries(integrity.dependencies ?? {}).find(([candidate]) =>
      candidate === url || this.resolve(candidate) === resolved
    );
    if (!entry && integrity.requireDependencies) {
      throw new AssetIntegrityError(`Missing required dependency integrity metadata for ${redactAssetUrl(resolved)}`);
    }
    return {
      ...options,
      ...(sourceOrigin ? { sourceOrigin } : {}),
      ...(entry ? { expectedUrl: resolved, integrity: { ...integrity, digest: entry[1] } } : {})
    };
  }

  /** Combine the scope and caller signals so either party can cancel the request. */
  signalFor(signal?: AbortSignal): AbortSignal | undefined {
    if (!this.signal) return signal;
    if (!signal || signal === this.signal) return this.signal;
    if (typeof AbortSignal.any === "function") return AbortSignal.any([this.signal, signal]);
    const controller = new AbortController();
    const signals = [this.signal, signal];
    const cancel = (source: AbortSignal) => {
      for (const item of signals) item.removeEventListener("abort", listeners.get(item)!);
      controller.abort(source.reason);
    };
    const listeners = new Map<AbortSignal, () => void>();
    for (const item of signals) listeners.set(item, () => cancel(item));
    for (const item of signals) {
      if (item.aborted) { cancel(item); break; }
      item.addEventListener("abort", listeners.get(item)!, { once: true });
    }
    return controller.signal;
  }

  throwIfAborted(url: string): void {
    if (this.signal?.aborted) throw new AssetLoadError("Asset load aborted", url, this.dependencyChain, this.signal.reason);
  }

  child(url: string, key?: string, options: AssetRequestOptions & { readonly signal?: AbortSignal } = {}): LoadContext {
    const resolved = this.resolve(url);
    const baseUrl = directoryOf(resolved, this.baseUrl);
    return new LoadContext({
      ...mergeAssetRequestOptions(this.requestOptionsFor(url), options),
      baseUrl,
      documentUrl: resolved,
      signal: this.signalFor(options.signal),
      manager: this.manager,
      onDependency: this.onDependency,
      dependencyChain: [...this.dependencyChain, resolved],
      dependencyKeys: key ? [...this.dependencyKeys, key] : this.dependencyKeys
    });
  }

  async loadDependency<T = unknown>(
    url: string,
    type?: string,
    options: LoadDependencyOptions = {}
  ): Promise<AssetHandle<T>> {
    if (!this.manager) throw new AssetLoadError("Cannot load dependency without an AssetManager", url, this.dependencyChain);
    const handle = await this.manager.load<T>(this.resolve(url), {
      ...mergeAssetRequestOptions(this.requestOptionsFor(url), options),
      type,
      format: options.format,
      signal: this.signalFor(options.signal),
      dependencyChain: this.dependencyChain,
      dependencyKeys: this.dependencyKeys,
      ...(options.onProgress ? { onProgress: options.onProgress } : {})
    });
    this.onDependency?.(handle as AssetHandle<unknown>);
    return handle;
  }
}

function directoryOf(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "data:" || parsed.protocol === "blob:") return fallback;
    return new URL(".", parsed).toString();
  } catch {
    const path = url.split(/[?#]/, 1)[0] ?? "";
    const slash = path.lastIndexOf("/");
    return slash < 0 ? "" : path.slice(0, slash + 1);
  }
}

function originOf(url: string): string | undefined {
  try { const origin = new URL(url).origin; return origin === "null" ? undefined : origin; }
  catch { return undefined; }
}

function normalizeRelative(url: string): string {
  const match = /^([^?#]*)([?#].*)?$/.exec(url);
  if (!match) return url;
  const path = match[1] ?? "";
  const segments: string[] = [];
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index]!;
    const dots = segment.replace(/%2e/gi, ".");
    if (dots === "." || dots === "..") {
      if (dots === "..") {
        const root = path.startsWith("/") && segments.length === 1 && segments[0] === "";
        if (!root && segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
        else if (!path.startsWith("/")) segments.push("..");
      }
      if (index === parts.length - 1) segments.push("");
    } else {
      segments.push(segment);
    }
  }
  const normalized = segments.join("/");
  return `${normalized || (path.startsWith("/") ? "/" : "")}${match[2] ?? ""}`;
}

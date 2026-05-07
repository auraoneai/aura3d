import { AssetLoadError } from "./AssetLoader";
import type { AssetHandle } from "./AssetHandle";
import type { AssetManager } from "./AssetManager";

export interface LoadContextOptions {
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
  readonly dependencyChain?: readonly string[];
  readonly manager?: AssetManager;
}

export class LoadContext {
  readonly baseUrl: string;
  readonly signal?: AbortSignal;
  readonly dependencyChain: readonly string[];

  private readonly manager?: AssetManager;

  constructor(options: LoadContextOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.signal = options.signal;
    this.dependencyChain = options.dependencyChain ?? [];
    this.manager = options.manager;
  }

  resolve(url: string): string {
    if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }

    if (this.baseUrl.length === 0) {
      return url;
    }

    return new URL(url, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`).toString();
  }

  throwIfAborted(url: string): void {
    if (this.signal?.aborted) {
      throw new AssetLoadError("Asset load aborted", url, this.dependencyChain, this.signal.reason);
    }
  }

  child(url: string): LoadContext {
    return new LoadContext({
      baseUrl: this.baseUrl,
      signal: this.signal,
      manager: this.manager,
      dependencyChain: [...this.dependencyChain, url]
    });
  }

  async loadDependency<T = unknown>(url: string, type?: string): Promise<AssetHandle<T>> {
    if (!this.manager) {
      throw new AssetLoadError("Cannot load dependency without an AssetManager", url, this.dependencyChain);
    }

    return this.manager.load<T>(url, { type, signal: this.signal, dependencyChain: this.dependencyChain });
  }
}

import { AssetCache } from "./AssetCache";
import { AssetDependencyGraph } from "./AssetDependencyGraph";
import { AssetHandle } from "./AssetHandle";
import { AssetLoadError, type AssetLoadProgress, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import { AssetRegistry } from "./AssetRegistry";
import { LoadContext } from "./LoadContext";

export interface AssetManagerOptions {
  readonly baseUrl?: string;
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

export interface AssetLoadOptions {
  readonly type?: string;
  readonly signal?: AbortSignal;
  readonly dependencyChain?: readonly string[];
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly onProgress?: (event: AssetLoadProgress) => void;
}

export class AssetManager {
  readonly registry = new AssetRegistry();
  readonly cache = new AssetCache();
  readonly dependencies = new AssetDependencyGraph();

  private readonly baseUrl: string;
  private readonly defaultRetries: number;
  private readonly defaultRetryDelayMs: number;
  private nextId = 1;

  constructor(options: AssetManagerOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.defaultRetries = Math.max(0, Math.trunc(options.retries ?? 0));
    this.defaultRetryDelayMs = Math.max(0, options.retryDelayMs ?? 0);
  }

  register(loader: AssetLoader): void {
    this.registry.register(loader);
  }

  async load<T = unknown>(url: string, options: AssetLoadOptions = {}): Promise<AssetHandle<T>> {
    const context = new LoadContext({
      baseUrl: this.baseUrl,
      signal: options.signal,
      dependencyChain: options.dependencyChain,
      manager: this
    });
    const resolvedUrl = context.resolve(url);
    context.throwIfAborted(resolvedUrl);
    const key = `${options.type ?? "auto"}:${resolvedUrl}`;

    const cached = this.cache.get<T>(key);
    if (cached) {
      return cached.retain();
    }

    const inFlight = this.cache.getInFlight<T>(key);
    if (inFlight) {
      const handle = await this.awaitInFlight(inFlight, context, resolvedUrl);
      return handle.retain();
    }

    const request: AssetLoadRequest = { url: resolvedUrl, type: options.type, signal: options.signal, onProgress: options.onProgress };
    const loader = this.registry.find(request);

    const promise = this.loadWithLoader<T>(loader, request, context.child(resolvedUrl), {
      retries: Math.max(0, Math.trunc(options.retries ?? this.defaultRetries)),
      retryDelayMs: Math.max(0, options.retryDelayMs ?? this.defaultRetryDelayMs)
    });
    this.cache.setInFlight(key, promise);
    return promise;
  }

  async release<T>(handle: AssetHandle<T>): Promise<void> {
    const remaining = await handle.release();
    if (remaining > 0) {
      return;
    }

    for (const dependencyId of this.dependencies.dependenciesOf(handle.id)) {
      const dependencyKey = this.cache.keys().find((key) => this.cache.get(key)?.id === dependencyId);
      const dependency = dependencyKey ? this.cache.get(dependencyKey) : undefined;
      if (dependency && !dependency.disposed) {
        await this.release(dependency);
      }
    }

    const cacheKey = this.cache.keys().find((key) => this.cache.get(key)?.id === handle.id);
    if (cacheKey) {
      this.cache.delete(cacheKey);
    }
    this.dependencies.remove(handle.id);
  }

  private async loadWithLoader<T>(
    loader: AssetLoader,
    request: AssetLoadRequest,
    context: LoadContext,
    retry: { readonly retries: number; readonly retryDelayMs: number }
  ): Promise<AssetHandle<T>> {
    let attempt = 0;

    while (true) {
      context.throwIfAborted(request.url);
      const dependencyHandles: Array<AssetHandle<unknown>> = [];

      try {
        const dependencyUrls = await loader.dependencies?.(request, context);

        for (const dependencyUrl of dependencyUrls ?? []) {
          context.throwIfAborted(request.url);
          dependencyHandles.push(await context.loadDependency(dependencyUrl));
        }

        context.throwIfAborted(request.url);
        const value = (await loader.load(request, context)) as T;
        const handle = new AssetHandle<T>({
          id: `asset-${this.nextId++}`,
          url: request.url,
          type: loader.type,
          value,
          dispose: (asset) => loader.dispose?.(asset)
        });

        this.dependencies.addNode(handle.id);
        for (const dependency of dependencyHandles) {
          this.dependencies.addDependency(handle.id, dependency.id);
        }

        return handle;
      } catch (error) {
        await this.releaseLoadedDependencies(dependencyHandles);

        if (this.shouldRetry(error, context, attempt, retry.retries)) {
          attempt += 1;
          await this.waitForRetry(retry.retryDelayMs, context, request.url);
          continue;
        }

        if (error instanceof AssetLoadError) {
          throw error;
        }

        throw new AssetLoadError(`Failed to load asset ${request.url}`, request.url, context.dependencyChain, error);
      }
    }
  }

  private async releaseLoadedDependencies(dependencyHandles: readonly AssetHandle<unknown>[]): Promise<void> {
    for (const dependency of [...dependencyHandles].reverse()) {
      if (!dependency.disposed) {
        await this.release(dependency);
      }
    }
  }

  private async awaitInFlight<T>(
    promise: Promise<AssetHandle<T>>,
    context: LoadContext,
    url: string
  ): Promise<AssetHandle<T>> {
    if (!context.signal) {
      return promise;
    }

    context.throwIfAborted(url);

    return new Promise<AssetHandle<T>>((resolve, reject) => {
      const abort = () => {
        reject(new AssetLoadError("Asset load aborted", url, context.dependencyChain, context.signal?.reason));
      };
      context.signal?.addEventListener("abort", abort, { once: true });
      promise.then(
        (handle) => {
          context.signal?.removeEventListener("abort", abort);
          resolve(handle);
        },
        (error) => {
          context.signal?.removeEventListener("abort", abort);
          reject(error);
        }
      );
    });
  }

  private shouldRetry(error: unknown, context: LoadContext, attempt: number, retries: number): boolean {
    if (attempt >= retries) return false;
    if (context.signal?.aborted) return false;
    if (error instanceof AssetLoadError && error.message === "Asset load aborted") return false;
    return true;
  }

  private async waitForRetry(delayMs: number, context: LoadContext, url: string): Promise<void> {
    context.throwIfAborted(url);
    if (delayMs === 0) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        context.signal?.removeEventListener("abort", abort);
        resolve();
      }, delayMs);
      const abort = () => {
        clearTimeout(timeout);
        reject(new AssetLoadError("Asset load aborted", url, context.dependencyChain, context.signal?.reason));
      };
      context.signal?.addEventListener("abort", abort, { once: true });
    });
  }
}

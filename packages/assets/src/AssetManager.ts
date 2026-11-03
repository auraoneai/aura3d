import { AssetCache } from "./AssetCache";
import { AssetDependencyGraph } from "./AssetDependencyGraph";
import { AssetHandle } from "./AssetHandle";
import {
  AssetLoadError,
  mergeAssetRequestOptions,
  requestIdentityDetails,
  validateAssetMaxBytes,
  type AssetLoadProgress,
  type AssetLoadRequest,
  type AssetLoader,
  type AssetRequestOptions
} from "./AssetLoader";
import { AssetRegistry } from "./AssetRegistry";
import { LoadContext } from "./LoadContext";
import { isNonRetryableAssetError, type AssetTransportTracker } from "./LoaderFetch";

export interface AssetManagerOptions extends AssetRequestOptions {
  readonly baseUrl?: string;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  /** Maximum nested dependency edges per load; defaults to 128. */
  readonly maxDependencyDepth?: number;
}

export interface AssetLoadOptions extends AssetRequestOptions {
  readonly type?: string;
  readonly format?: AssetLoadRequest["format"];
  readonly signal?: AbortSignal;
  readonly dependencyChain?: readonly string[];
  /** Opaque internal identities used for cycle detection across shared loads. */
  readonly dependencyKeys?: readonly string[];
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly onProgress?: (event: AssetLoadProgress) => void;
  /**
   * Optional execution-local lifetime barrier. The selected loader must use
   * the same tracker for its transport, and shared flights must use the same
   * tracker. This setting is never forwarded as a network request option.
   */
  readonly transportTracker?: AssetTransportTracker;
}

interface Subscriber {
  readonly onProgress?: (event: AssetLoadProgress) => void;
}

interface Flight {
  readonly controller: AbortController;
  readonly promise: Promise<AssetHandle<unknown>>;
  readonly subscribers: Set<Subscriber>;
  settled: boolean;
  holdReleased: boolean;
}

export class AssetManager {
  readonly registry = new AssetRegistry();
  readonly cache = new AssetCache();
  readonly dependencies = new AssetDependencyGraph();

  private readonly baseUrl: string;
  private readonly requestDefaults: AssetRequestOptions;
  private readonly defaultRetries: number;
  private readonly defaultRetryDelayMs: number;
  private readonly maxDependencyDepth: number;
  private readonly flights = new Map<string, Flight>();
  private readonly pendingDependencies = new AssetDependencyGraph();
  // The cache exposes only opaque IDs, never URLs, tokens, or request headers.
  private readonly identityKeys = new Map<string, string>();
  private readonly keyIdentities = new Map<string, string>();
  private readonly keyNodes = new Map<string, string>();
  // Registry entries can be unregistered and replaced while existing handles
  // are still live. A loader's type is not its identity: a replacement may
  // decode the same URL differently and must not inherit the former cache.
  private readonly loaderIds = new WeakMap<AssetLoader, number>();
  private nextId = 1;
  private nextKey = 1;
  private nextLoaderId = 1;

  constructor(options: AssetManagerOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.requestDefaults = mergeAssetRequestOptions({}, options);
    this.defaultRetries = normalizeRetries(options.retries ?? 0);
    this.defaultRetryDelayMs = normalizeRetryDelay(options.retryDelayMs ?? 0);
    const maxDependencyDepth = options.maxDependencyDepth ?? 128;
    if (!Number.isSafeInteger(maxDependencyDepth) || maxDependencyDepth < 0 || maxDependencyDepth > 4096) {
      throw new RangeError("maxDependencyDepth must be a safe integer between 0 and 4096");
    }
    this.maxDependencyDepth = maxDependencyDepth;
  }

  register(loader: AssetLoader): void {
    this.registry.register(loader);
  }

  async load<T = unknown>(url: string, options: AssetLoadOptions = {}): Promise<AssetHandle<T>> {
    const tracker = options.transportTracker;
    const releaseRoot = tracker?.begin();
    try { return await this.loadTracked<T>(url, options, tracker); }
    finally { releaseRoot?.(); }
  }

  private async loadTracked<T>(url: string, options: AssetLoadOptions, tracker?: AssetTransportTracker): Promise<AssetHandle<T>> {
    // Dependencies already carry their complete effective policy. Reapplying
    // root defaults would incorrectly attach the document digest to an
    // unlisted (optional) subresource.
    const requestOptions = mergeAssetRequestOptions(options.dependencyKeys?.length ? {} : this.requestDefaults, options);
    const context = new LoadContext({
      ...requestOptions,
      baseUrl: this.baseUrl,
      signal: options.signal,
      dependencyChain: options.dependencyChain,
      dependencyKeys: options.dependencyKeys,
      manager: this
    });
    // loadDependency passes a URL already resolved against its parent. A
    // relative manager base must not be prepended for a second time.
    const resolvedUrl = options.dependencyKeys?.length ? new LoadContext().resolve(url) : context.resolve(url);
    context.throwIfAborted(resolvedUrl);
    if ((options.dependencyKeys?.length ?? 0) > this.maxDependencyDepth) {
      throw new AssetLoadError(`Asset dependency depth exceeds ${this.maxDependencyDepth}`, resolvedUrl, context.dependencyChain);
    }
    const retries = normalizeRetries(options.retries ?? this.defaultRetries);
    const retryDelayMs = normalizeRetryDelay(options.retryDelayMs ?? this.defaultRetryDelayMs);
    const request: AssetLoadRequest = { ...requestOptions, url: resolvedUrl, type: options.type, format: options.format };
    let loader: AssetLoader;
    try {
      loader = this.registry.find(request);
    } catch (error) {
      throw new AssetLoadError("No asset loader available for requested content", resolvedUrl, context.dependencyChain, error);
    }
    try {
      validateAssetMaxBytes(requestOptions.maxBytes);
    } catch (error) {
      // Match an uncached loader's validation error, but never let an invalid
      // policy reach a cache hit where the loader would not run at all.
      throw new AssetLoadError(`Failed to load asset ${resolvedUrl}`, resolvedUrl, context.dependencyChain, error);
    }
    // Digest/security identity is hashed by the transport and fails closed to a
    // unique identity when secure hashing is unavailable.
    const pendingIdentity = requestIdentityDetails(requestOptions, resolvedUrl);
    // A subscriber may stop waiting as soon as it aborts, while WebCrypto's
    // digest promise is still pending. Keep the execution-local barrier until
    // the underlying identity computation settles, not just the wait wrapper.
    const identity = tracker?.track(pendingIdentity) ?? pendingIdentity;
    const requestIdentity = await this.waitForIdentity(identity, context, resolvedUrl);
    context.throwIfAborted(resolvedUrl);
    const loaderId = this.loaderId(loader);
    // Preserve the separate URL and policy comparisons, without retaining the
    // URL (including credentials, query, or inline data) in the cycle map. The
    // URL fingerprint also works when WebCrypto is unavailable and sharing is
    // disabled, or when a digest provider returns the same bytes for two URLs.
    const node = JSON.stringify([
      loaderId, options.format ?? null, fingerprintAssetIdentityText(resolvedUrl),
      requestIdentity.policyKey ?? null
    ]);
    const key = this.keyFor(JSON.stringify([loaderId, options.format ?? null, requestIdentity.key, retries, retryDelayMs]), node);
    const parentKey = options.dependencyKeys?.at(-1);
    // If secure request hashing is unavailable every request gets a fresh
    // cache key. Compare cycle identities as well so disabling sharing cannot
    // turn an actual cycle into unbounded recursive loading.
    if (options.dependencyKeys?.some((ancestor) => this.keyNodes.get(ancestor) === node)) {
      this.forgetKeyIfUnused(key);
      throw new AssetLoadError("Asset dependency cycle detected", resolvedUrl, context.dependencyChain);
    }

    if (parentKey) {
      try {
        // This wait graph detects cycles between independently started roots,
        // before either caller can await the other's shared in-flight promise.
        this.pendingDependencies.addDependency(parentKey, key);
      } catch (error) {
        this.forgetKeyIfUnused(key);
        throw new AssetLoadError("Asset dependency cycle detected", resolvedUrl, context.dependencyChain, error);
      }
    }

    try {
      const cached = this.cache.get<T>(key);
      if (cached) return cached.retain();

      let flight = this.flights.get(key);
      // cache.clear() invalidates old generations without taking ownership
      // away from subscribers already awaiting them.
      if (flight && this.cache.getInFlight(key) !== flight.promise) {
        this.flights.delete(key);
        flight = undefined;
      }
      if (!flight) {
        const controller = new AbortController();
        const subscribers = new Set<Subscriber>();
        let createdFlight: Flight;
        const promise = Promise.resolve().then(() => this.loadWithLoader(
          loader,
          {
            ...request,
            signal: controller.signal,
            onProgress: (event) => {
              for (const subscriber of [...subscribers]) {
                try { subscriber.onProgress?.(event); } catch { /* Observers do not own the request. */ }
              }
            }
          },
          context,
          key,
          { retries, retryDelayMs }
        ));
        createdFlight = { controller, promise, subscribers, settled: false, holdReleased: false };
        flight = createdFlight;
        this.flights.set(key, createdFlight);
        this.cache.setInFlight(key, promise, { cacheResolved: false });
        promise.then((handle) => {
          createdFlight.settled = true;
          const admitted = this.cache.getInFlight(key) === promise;
          this.cache.deleteInFlight(key, promise);
          if (this.flights.get(key) === createdFlight) {
            this.flights.delete(key);
            if (admitted && requestIdentity.reusable && createdFlight.subscribers.size > 0) this.cache.set(key, handle);
          }
          this.releaseFlightHoldWhenDone(key, createdFlight, handle);
        }, () => {
          createdFlight.settled = true;
          if (this.flights.get(key) === createdFlight) this.flights.delete(key);
          this.forgetKeyIfUnused(key);
        });
      }
      return await this.subscribe<T>(flight, key, context, resolvedUrl, options.onProgress);
    } finally {
      if (parentKey) this.pendingDependencies.removeDependency(parentKey, key);
    }
  }

  /** Release one acquisition. Handles also perform the same cleanup directly. */
  async release<T>(handle: AssetHandle<T>): Promise<void> {
    await handle.release();
  }

  private async loadWithLoader<T>(
    loader: AssetLoader,
    request: AssetLoadRequest,
    parent: LoadContext,
    key: string,
    retry: { readonly retries: number; readonly retryDelayMs: number }
  ): Promise<AssetHandle<T>> {
    let attempt = 0;
    while (true) {
      const dependencyHandles: Array<AssetHandle<unknown>> = [];
      let acceptingDependencies = true;
      const context = new LoadContext({
        ...parent.requestOptions,
        // request.url is already normalized. Resolve it without the manager
        // base again; retain that base only for data/blob document fallbacks.
        baseUrl: /^(?:data|blob):/i.test(request.url) ? parent.baseUrl : "",
        signal: request.signal,
        dependencyChain: parent.dependencyChain,
        dependencyKeys: parent.dependencyKeys,
        manager: this,
        onDependency: (handle) => {
          // Loader work must await its dependencies before returning. If a
          // detached request finishes later, it has no owner and is released.
          if (acceptingDependencies) dependencyHandles.push(handle);
          else void handle.release().catch(() => { /* Detached work has no subscriber. */ });
        }
      }).child(request.url, key);
      context.throwIfAborted(request.url);
      let value: T | undefined;
      let valueLoaded = false;
      let transferred = false;
      try {
        const dependencyUrls = await loader.dependencies?.(request, context);
        for (const dependencyUrl of dependencyUrls ?? []) {
          context.throwIfAborted(request.url);
          await context.loadDependency(dependencyUrl);
        }
        context.throwIfAborted(request.url);
        value = (await loader.load(request, context)) as T;
        valueLoaded = true;
        context.throwIfAborted(request.url);
        acceptingDependencies = false;
        let handle: AssetHandle<T>;
        handle = new AssetHandle<T>({
          id: `asset-${this.nextId++}`,
          url: request.url,
          type: loader.type,
          value,
          dispose: async (asset) => {
            const errors: unknown[] = [];
            try { await loader.dispose?.(asset); } catch (error) { errors.push(error); }
            this.cache.deleteHandle(key, handle);
            this.dependencies.remove(handle.id);
            errors.push(...await this.releaseLoadedDependencies(dependencyHandles));
            this.forgetKeyIfUnused(key);
            if (errors.length > 0) {
              throw new AssetLoadError("Failed to dispose asset", request.url, context.dependencyChain,
                new AggregateError(errors, "Asset disposal failed"));
            }
          }
        });
        this.dependencies.addNode(handle.id);
        for (const dependency of dependencyHandles) this.dependencies.addDependency(handle.id, dependency.id);
        transferred = true;
        return handle;
      } catch (error) {
        acceptingDependencies = false;
        const cleanupErrors: unknown[] = [];
        if (valueLoaded && !transferred) {
          try { await loader.dispose?.(value); } catch (disposeError) { cleanupErrors.push(disposeError); }
        }
        cleanupErrors.push(...await this.releaseLoadedDependencies(dependencyHandles));
        if (cleanupErrors.length === 0 && this.shouldRetry(error, context, attempt, retry.retries)) {
          attempt += 1;
          await this.waitForRetry(retry.retryDelayMs, context, request.url);
          continue;
        }
        if (cleanupErrors.length > 0) {
          throw new AssetLoadError("Failed to load and clean up asset", request.url, context.dependencyChain,
            new AggregateError([error, ...cleanupErrors], "Asset loading and cleanup failed"));
        }
        if (error instanceof AssetLoadError) throw error;
        throw new AssetLoadError(`Failed to load asset ${request.url}`, request.url, context.dependencyChain, error);
      }
    }
  }

  private async releaseLoadedDependencies(handles: readonly AssetHandle<unknown>[]): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const handle of [...handles].reverse()) {
      try { await handle.release(); } catch (error) { errors.push(error); }
    }
    return errors;
  }

  private subscribe<T>(
    flight: Flight,
    key: string,
    context: LoadContext,
    url: string,
    onProgress?: (event: AssetLoadProgress) => void
  ): Promise<AssetHandle<T>> {
    const subscriber: Subscriber = { onProgress };
    flight.subscribers.add(subscriber);
    return new Promise<AssetHandle<T>>((resolve, reject) => {
      let done = false;
      const finish = (): boolean => {
        if (done) return false;
        done = true;
        context.signal?.removeEventListener("abort", abort);
        flight.subscribers.delete(subscriber);
        if (flight.subscribers.size === 0 && !flight.settled) {
          // Later callers start a new generation instead of joining a cancelled job.
          if (this.flights.get(key) === flight) this.flights.delete(key);
          this.cache.deleteInFlight(key, flight.promise);
          flight.controller.abort(context.signal?.reason);
        }
        return true;
      };
      const abort = () => {
        if (finish()) reject(new AssetLoadError("Asset load aborted", url, context.dependencyChain, context.signal?.reason));
      };
      context.signal?.addEventListener("abort", abort, { once: true });
      if (context.signal?.aborted) abort();
      flight.promise.then((handle) => {
        if (done) return;
        try {
          handle.retain();
          finish();
          this.releaseFlightHoldWhenDone(key, flight, handle);
          resolve(handle as AssetHandle<T>);
        } catch (error) {
          finish();
          this.releaseFlightHoldWhenDone(key, flight, handle);
          reject(error);
        }
      }, (error) => {
        if (finish()) reject(error);
      });
    });
  }

  private releaseFlightHoldWhenDone(key: string, flight: Flight, handle: AssetHandle<unknown>): void {
    if (!flight.settled || flight.subscribers.size !== 0 || flight.holdReleased) return;
    flight.holdReleased = true;
    // The internal hold protects the result until every subscriber has either
    // retained it or cancelled. It is never itself returned to a caller.
    void handle.release().catch(() => { /* No remaining subscriber can receive a cleanup error. */ });
    this.forgetKeyIfUnused(key);
  }

  private keyFor(identity: string, node: string): string {
    let key = this.identityKeys.get(identity);
    if (!key) {
      key = `asset-cache-${this.nextKey++}`;
      this.identityKeys.set(identity, key);
      this.keyIdentities.set(key, identity);
      this.keyNodes.set(key, node);
    }
    return key;
  }

  private loaderId(loader: AssetLoader): number {
    let id = this.loaderIds.get(loader);
    if (id === undefined) {
      id = this.nextLoaderId++;
      this.loaderIds.set(loader, id);
    }
    return id;
  }

  private forgetKeyIfUnused(key: string): void {
    if (this.cache.has(key) || this.flights.has(key)) return;
    const identity = this.keyIdentities.get(key);
    if (identity !== undefined && this.identityKeys.get(identity) === key) this.identityKeys.delete(identity);
    this.keyIdentities.delete(key);
    this.keyNodes.delete(key);
  }

  private shouldRetry(error: unknown, context: LoadContext, attempt: number, retries: number): boolean {
    if (attempt >= retries || context.signal?.aborted) return false;
    if (isNonRetryableAssetError(error)) return false;
    if (error instanceof AssetLoadError && (error.message === "Asset load aborted" || error.message === "Asset dependency cycle detected" ||
        error.message.startsWith("Asset dependency depth exceeds "))) return false;
    return true;
  }

  private waitForIdentity<T>(pending: Promise<T>, context: LoadContext, url: string): Promise<T> {
    const signal = context.signal;
    if (!signal) return pending;
    return new Promise((resolve, reject) => {
      let done = false;
      const abort = () => {
        if (done) return;
        done = true;
        reject(new AssetLoadError("Asset load aborted", url, context.dependencyChain, signal.reason));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      pending.then((identity) => {
        signal.removeEventListener("abort", abort);
        if (!done) { done = true; resolve(identity); }
      }, (error) => {
        signal.removeEventListener("abort", abort);
        if (!done) { done = true; reject(error); }
      });
    });
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
      if (context.signal?.aborted) abort();
    });
  }
}

function normalizeRetries(value: number): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.trunc(value))) {
    throw new RangeError("Asset retries must be finite and within the safe integer range");
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeRetryDelay(value: number): number {
  if (!Number.isFinite(value) || value > 2_147_483_647) {
    throw new RangeError("Asset retryDelayMs must be finite and no greater than 2147483647");
  }
  return Math.max(0, value);
}

/**
 * @internal Stable SHA-256 fingerprint of exact UTF-16 code units, for
 * structural identities only. An unkeyed digest is not secret storage or
 * authorization; real cache sharing uses the async request identity instead.
 */
export function fingerprintAssetIdentityText(value: string): string {
  const hash = new AssetIdentitySha256();
  // Stream the input rather than retaining a second full copy of a data URL.
  const bytes = new Uint8Array(1024);
  for (let start = 0; start < value.length; start += bytes.length / 2) {
    const count = Math.min(bytes.length / 2, value.length - start);
    for (let index = 0; index < count; index++) {
      const code = value.charCodeAt(start + index);
      bytes[index * 2] = code >>> 8;
      bytes[index * 2 + 1] = code & 0xff;
    }
    hash.write(bytes.subarray(0, count * 2));
  }
  return `sha256-${hash.finish()}`;
}

// The same streaming SHA-256 implementation used by animation's RetargetCache.
// It requires neither WebCrypto nor TextEncoder and retains only one block.
class AssetIdentitySha256 {
  private readonly state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private readonly buffer = new Uint8Array(64);
  private used = 0;
  private length = 0;

  write(bytes: Uint8Array): void {
    this.length += bytes.length;
    for (let offset = 0; offset < bytes.length;) {
      const count = Math.min(64 - this.used, bytes.length - offset);
      this.buffer.set(bytes.subarray(offset, offset + count), this.used);
      this.used += count;
      offset += count;
      if (this.used === 64) { this.compress(); this.used = 0; }
    }
  }

  finish(): string {
    const length = this.length;
    this.write(new Uint8Array([0x80]));
    if (this.used > 56) this.write(new Uint8Array(64 - this.used));
    if (this.used < 56) this.write(new Uint8Array(56 - this.used));
    const end = new Uint8Array(8);
    const view = new DataView(end.buffer);
    view.setUint32(0, Math.floor(length / 0x20000000), false);
    view.setUint32(4, (length * 8) >>> 0, false);
    this.write(end);
    return Array.from(this.state, (word) => word.toString(16).padStart(8, "0")).join("");
  }

  private compress(): void {
    const w = new Uint32Array(64);
    const block = new DataView(this.buffer.buffer);
    for (let i = 0; i < 16; i++) w[i] = block.getUint32(i * 4, false);
    const rotate = (x: number, count: number) => (x >>> count) | (x << (32 - count));
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.state as unknown as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + ASSET_IDENTITY_SHA256_CONSTANTS[i]! + w[i]!) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const result = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) this.state[i] = (this.state[i]! + result[i]!) >>> 0;
  }
}

const ASSET_IDENTITY_SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

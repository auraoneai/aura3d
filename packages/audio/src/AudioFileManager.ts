import { AudioClip } from "./AudioClip";
import type { AudioContextLike } from "./AudioContextManager";

export interface AudioDecodeContextLike extends AudioContextLike {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> | AudioBuffer;
}

export interface AudioFileAssetLike {
  readonly kind?: string;
  readonly id?: string;
  readonly type?: string;
  readonly format?: string;
  readonly url: string;
  readonly hash?: string;
  readonly sizeBytes?: number;
  readonly license?: string;
}

export type AudioFileInput = string | URL | AudioFileAssetLike | AudioClip;

/** Request policy is part of decoded-cache identity; abort and progress are subscriber-local. */
export interface AudioFileRequest {
  readonly input: AudioFileInput;
  readonly signal?: AbortSignal;
  readonly cacheKey?: string;
  readonly name?: string;
  readonly headers?: HeadersInit;
  readonly credentials?: RequestCredentials;
  readonly cache?: RequestCache;
  readonly mode?: RequestMode;
  readonly redirect?: RequestRedirect;
  readonly referrer?: string;
  readonly referrerPolicy?: ReferrerPolicy;
  readonly priority?: "high" | "low" | "auto";
  /** SHA-256 of the actual encoded bytes: `sha256-<64 hex>` (or `sha256:<64 hex>`). */
  readonly expectedHash?: string;
  /** Alias for expectedHash, for callers using the asset transport vocabulary. */
  readonly integrity?: string | { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean };
  readonly allowedOrigins?: readonly string[];
  readonly sourceOrigin?: string;
  readonly expectedUrl?: string;
  readonly maxBytes?: number;
  /** Partition caches when ambient browser credentials change, and clear on sign-out. */
  readonly securityContext?: string;
  readonly baseURL?: string;
  readonly onProgress?: (progress: AudioFileProgress) => void;
}

export interface AudioFileProgress {
  readonly loadedBytes: number;
  readonly totalBytes?: number;
}

export interface AudioFileFetchOptions {
  readonly signal?: AbortSignal;
  readonly headers?: HeadersInit;
  readonly credentials?: RequestCredentials;
  readonly cache?: RequestCache;
  readonly mode?: RequestMode;
  readonly redirect?: RequestRedirect;
  readonly referrer?: string;
  readonly referrerPolicy?: ReferrerPolicy;
  readonly priority?: "high" | "low" | "auto";
}

export interface AudioFileManagerOptions {
  readonly context: AudioDecodeContextLike;
  readonly fetch?: (url: string, init?: AudioFileFetchOptions) => Promise<AudioFileFetchResponseLike>;
  readonly cache?: Map<string, AudioClip>;
  readonly validateTypedAudioAssets?: boolean;
  /** Maximum decoded PCM bytes retained by this manager; default 64 MiB. */
  readonly maxDecodedBytes?: number;
  /** Maximum number of decoded entries retained, including empty buffers; default 1024. */
  readonly maxCachedEntries?: number;
  /** Unique authentication generation for requests carrying ambient credentials. */
  readonly securityContext?: string;
}

export interface AudioFileLease {
  readonly clip: AudioClip;
  /** Idempotent. The last lease releases the manager's cached reference. */
  release(): void;
}

export interface AudioFileCacheStats {
  readonly decodedBytes: number;
  readonly maxDecodedBytes: number;
  readonly cachedEntries: number;
  readonly maxCachedEntries?: number;
  readonly pinnedEntries: number;
  readonly inFlight: number;
}

export interface AudioCodecCandidate {
  readonly input: AudioFileInput;
  readonly mimeType: string;
}

export interface AudioFileFetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  /** Final response URL, when supplied by the transport. */
  readonly url?: string;
  readonly redirected?: boolean;
  readonly headers?: { get(name: string): string | null };
  readonly body?: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ResolvedAudioFileRequest {
  readonly url: string;
  /** Opaque, manager-local cache identity; do not persist or interpret it. */
  readonly cacheKey: string;
  readonly name?: string;
  readonly asset?: AudioFileAssetLike;
}

export interface EpisodeAudioAssetRequirement {
  readonly id: string;
  readonly role?: "dialogue" | "music" | "sfx" | "ambient";
  readonly required?: boolean;
  readonly requireLicense?: boolean;
}

export interface EpisodeAudioAssetDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly assetId: string;
}

export interface EpisodeAudioAssetReadiness {
  readonly ok: boolean;
  readonly requiredCount: number;
  readonly readyCount: number;
  readonly missingAssetIds: readonly string[];
  readonly diagnostics: readonly EpisodeAudioAssetDiagnostic[];
}

interface AudioIdentity {
  readonly signature: string;
  readonly key: string;
  readonly source: string;
}

interface InternalAudioRequest extends ResolvedAudioFileRequest {
  readonly identity: AudioIdentity;
  readonly expectedHash?: string;
  readonly expectedSize?: number;
  readonly fetchOptions: AudioFileFetchOptions;
  readonly allowedOrigins?: readonly string[];
  readonly sourceOrigin?: string;
  readonly expectedUrl?: string;
  readonly maxBytes: number;
  readonly baseURL?: string;
  readonly sensitive: boolean;
  readonly reusable: boolean;
}

interface AudioCacheEntry {
  readonly clip: AudioClip;
  readonly source: string;
  readonly bytes: number;
  readonly encodedBytes?: number;
  leases: number;
  lastUse: number;
}

interface AudioInFlight {
  readonly key: string;
  readonly source: string;
  readonly controller: AbortController;
  promise: Promise<AudioClip>;
  subscribers: number;
  settled: boolean;
  progress?: AudioFileProgress;
  readonly listeners: Set<(progress: AudioFileProgress) => void>;
}

let nextManagerId = 0;

export class AudioFileManager {
  private readonly cache: Map<string, AudioClip>;
  private readonly inflight = new Map<string, AudioInFlight>();
  private readonly entries = new Map<string, AudioCacheEntry>();
  // Signatures may contain authorization headers. Keep them in a true private field;
  // only opaque, manager-local keys are ever placed in the externally supplied cache.
  readonly #identities = new Map<string, AudioIdentity>();
  readonly #identitiesByKey = new Map<string, AudioIdentity>();
  readonly #clipIds = new WeakMap<AudioClip, string>();
  private readonly managerId = ++nextManagerId;
  private readonly maxDecodedBytes: number;
  private readonly maxCachedEntries: number;
  private nextIdentity = 0;
  private nextClipId = 0;
  private useCounter = 0;
  private decodedBytes = 0;
  private disposed = false;

  constructor(private readonly options: AudioFileManagerOptions) {
    this.cache = options.cache ?? new Map();
    this.maxDecodedBytes = options.maxDecodedBytes ?? 64 * 1024 * 1024;
    this.maxCachedEntries = options.maxCachedEntries ?? 1024;
    if (!Number.isSafeInteger(this.maxDecodedBytes) || this.maxDecodedBytes < 0) {
      throw new Error("maxDecodedBytes must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(this.maxCachedEntries) || this.maxCachedEntries < 0) {
      throw new Error("maxCachedEntries must be a non-negative safe integer");
    }
  }

  resolve(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): ResolvedAudioFileRequest {
    const resolved = this.resolveInternal(input, request);
    return { url: resolved.url, cacheKey: resolved.cacheKey, ...(resolved.name ? { name: resolved.name } : {}), ...(resolved.asset ? { asset: resolved.asset } : {}) };
  }

  has(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): boolean {
    return this.getCached(input, request) !== undefined;
  }

  getCached(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): AudioClip | undefined {
    const { cacheKey } = this.resolveInternal(input, request);
    const entry = this.cachedEntry(cacheKey);
    if (!entry) this.forgetIfUnused(cacheKey);
    return entry?.clip;
  }

  async load(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): Promise<AudioClip> {
    if (this.disposed) throw new Error("AudioFileManager is disposed");
    if (request.signal?.aborted) throw abortError();
    const resolved = this.resolveInternal(input, request);
    // Browser request cache controls also govern the decoded cache. Revalidation
    // modes must go through transport again; no-store must retain no decoded copy.
    const bypassDecodedCache = !resolved.reusable || request.cache === "no-store" || request.cache === "reload" || request.cache === "no-cache";
    const cached = bypassDecodedCache ? undefined : this.cachedEntry(resolved.cacheKey);
    if (cached) {
      if (cached.encodedBytes !== undefined) reportProgress(request.onProgress, { loadedBytes: cached.encodedBytes, totalBytes: cached.encodedBytes });
      return cached.clip;
    }
    if (input instanceof AudioClip) {
      if (resolved.expectedHash) {
        this.forgetIfUnused(resolved.cacheKey);
        throw new Error("Cannot verify an encoded content digest for an already decoded AudioClip");
      }
      if (!bypassDecodedCache) this.cacheClip(resolved, input);
      this.forgetIfUnused(resolved.cacheKey);
      return input;
    }

    let entry = this.inflight.get(resolved.cacheKey);
    if (!entry) {
      const controller = new AbortController();
      entry = {
        key: resolved.cacheKey,
        source: resolved.identity.source,
        controller,
        promise: undefined as unknown as Promise<AudioClip>,
        subscribers: 0,
        settled: false,
        listeners: new Set()
      };
      const operation = entry;
      this.inflight.set(resolved.cacheKey, operation);
      operation.promise = this.loadResolved(resolved, operation).then(({ clip, encodedBytes }) => {
        // A cancelled, cleared, replaced or disposed operation must never publish.
        if (operation.controller.signal.aborted || this.disposed || this.inflight.get(operation.key) !== operation) throw abortError();
        if (!bypassDecodedCache) this.cacheClip(resolved, clip, encodedBytes);
        return clip;
      }).finally(() => {
        operation.settled = true;
        if (this.inflight.get(operation.key) === operation) this.inflight.delete(operation.key);
        this.forgetIfUnused(operation.key);
      });
    }
    return this.subscribe(entry, request.signal, request.onProgress);
  }

  /**
   * Acquire a caller-owned clip and pin any retained cache entry until its final
   * lease is released. No cache entry is retained for oversized clips, cache
   * bypass policies, or when the whole budget is already pinned.
   */
  async acquire(input: AudioFileInput, request: Omit<AudioFileRequest, "input"> = {}): Promise<AudioFileLease> {
    const resolved = this.resolveInternal(input, request);
    const clip = await this.load(input, request);
    const cached = this.cachedEntry(resolved.cacheKey);
    const entry = cached?.clip === clip ? cached : undefined;
    if (entry) entry.leases++;
    else this.forgetIfUnused(resolved.cacheKey);
    let released = false;
    return {
      clip,
      release: () => {
        if (released) return;
        released = true;
        // Clearing or replacing this key cannot release a newer generation.
        if (entry && this.entries.get(resolved.cacheKey) === entry && --entry.leases === 0) this.dropCached(resolved.cacheKey);
      }
    };
  }

  stats(): AudioFileCacheStats {
    // A caller can mutate an injected cache. Account only for references we still own.
    for (const [key, entry] of this.entries) if (this.cache.get(key) !== entry.clip) this.dropCached(key);
    return {
      decodedBytes: this.decodedBytes,
      maxDecodedBytes: this.maxDecodedBytes,
      cachedEntries: this.entries.size,
      maxCachedEntries: this.maxCachedEntries,
      pinnedEntries: [...this.entries.values()].filter((entry) => entry.leases > 0).length,
      inFlight: this.inflight.size
    };
  }

  async loadMany(inputs: readonly AudioFileInput[], request: Omit<AudioFileRequest, "input"> = {}): Promise<readonly AudioClip[]> {
    return Promise.all(inputs.map((input) => this.load(input, request)));
  }

  async loadFirstSupported(
    candidates: readonly AudioCodecCandidate[],
    canPlayType: (mimeType: string) => "" | "maybe" | "probably" = defaultCanPlayType,
    request: Omit<AudioFileRequest, "input"> = {}
  ): Promise<AudioClip> {
    if (candidates.length === 0) throw new Error("Audio codec candidates must contain at least one source");
    const candidate = candidates.find((entry) => canPlayType(entry.mimeType) !== "");
    if (!candidate) throw new Error(`No supported audio codec among: ${candidates.map((entry) => entry.mimeType).join(", ")}`);
    return this.load(candidate.input, request);
  }

  /** Clear all request contexts for an input, or one exact context when request is supplied. */
  clear(input?: AudioFileInput, request?: Omit<AudioFileRequest, "input">): void {
    const resolved = input === undefined ? undefined : this.resolveInternal(input, request ?? {});
    const matches = (key: string, source: string) => !resolved || (request
      ? this.#identitiesByKey.get(key)?.signature === resolved.identity.signature
      : source === resolved.identity.source);
    for (const [key, entry] of this.inflight) {
      if (matches(key, entry.source)) this.cancel(entry);
    }
    for (const [key, entry] of this.entries) {
      if (matches(key, entry.source)) this.dropCached(key);
    }
    if (!resolved) {
      this.#identities.clear();
      this.#identitiesByKey.clear();
    } else {
      for (const identity of this.#identitiesByKey.values()) {
        if (matches(identity.key, identity.source)) this.forgetIfUnused(identity.key);
      }
    }
  }

  /** Drop the manager's references and cancel work; already returned clips belong to their callers. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }

  private resolveInternal(input: AudioFileInput, request: Omit<AudioFileRequest, "input">): InternalAudioRequest {
    let url: string;
    let name = request.name;
    let asset: AudioFileAssetLike | undefined;
    let source: string;
    let legacyKey: string;
    if (input instanceof AudioClip) {
      let id = this.#clipIds.get(input);
      if (!id) { id = `clip-${++this.nextClipId}`; this.#clipIds.set(input, id); }
      name ??= input.name;
      url = name ? `clip:${name}` : "clip:anonymous";
      source = id;
      legacyKey = request.cacheKey ?? url;
    } else {
      if (input instanceof URL) url = input.toString();
      else if (typeof input === "string") url = input.trim();
      else {
        if (this.options.validateTypedAudioAssets !== false && input.kind === "aura-asset-ref" && input.type !== "audio") {
          throw new Error(`Typed asset "${input.id ?? input.url}" is not an audio asset`);
        }
        asset = input;
        url = input.url.trim();
        name ??= input.id;
      }
      if (!url) throw new Error(asset ? `Audio asset "${asset.id ?? "unknown"}" is missing a URL` : "Audio file URL must be a non-empty string");
      // Resolve against the same base used by origin checks, so validation can
      // never authorize one URL while fetch implicitly targets another origin.
      const requestBase = request.baseURL ?? globalThis.location?.href ?? request.sourceOrigin;
      if (requestBase) {
        try { url = new URL(url, requestBase).href; }
        catch { throw new Error("Audio request URL or baseURL is invalid"); }
      }
      source = `url:${url}`;
      legacyKey = request.cacheKey ?? asset?.id ?? url;
    }
    const integrity = request.integrity;
    if (integrity !== undefined && typeof integrity !== "string" &&
      (!integrity || typeof integrity !== "object" || integrity.version !== 1 || typeof integrity.digest !== "string")) {
      throw new Error("Invalid or unsupported audio integrity metadata");
    }
    const hashes = [request.expectedHash, typeof integrity === "string" ? integrity : integrity?.digest, asset?.hash].filter((value): value is string => value !== undefined).map(normalizeSha256);
    if (hashes.some((value) => value !== hashes[0])) throw new Error("Conflicting audio content digests");
    const expectedHash = hashes[0];
    const expectedSize = asset?.sizeBytes;
    if (expectedSize !== undefined && (!Number.isSafeInteger(expectedSize) || expectedSize < 0)) throw new Error("Audio asset sizeBytes must be a non-negative safe integer");
    const headers = new Headers(request.headers);
    const headerEntries: [string, string][] = [];
    headers.forEach((value, key) => headerEntries.push([key, value]));
    headerEntries.sort(([a], [b]) => a.localeCompare(b));
    const sourceOrigin = request.sourceOrigin === undefined ? undefined : normalizeOrigin(request.sourceOrigin);
    const selfOrigin = sourceOrigin ?? urlOrigin(globalThis.location?.href ?? "");
    const allowedOrigins = request.allowedOrigins?.map((origin) => {
      if (origin !== "self") return normalizeAllowedOrigin(origin);
      if (!selfOrigin || selfOrigin === "null") throw new Error("Audio allowedOrigins 'self' requires sourceOrigin or a browser origin");
      return selfOrigin;
    }).sort();
    const sensitive = request.credentials === "include" || headerEntries.length > 0 || hasUrlCredentials(url, request.baseURL ?? sourceOrigin);
    const controlledRedirect = allowedOrigins !== undefined || sensitive;
    if (controlledRedirect && request.redirect !== undefined && request.redirect !== "error") {
      throw new Error("Audio origin policy or sensitive credentials require redirect: error");
    }
    const maxBytes = request.maxBytes ?? 64 * 1024 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Audio maxBytes must be a non-negative safe integer");
    const fetchOptions: AudioFileFetchOptions = {
      headers,
      credentials: request.credentials ?? "same-origin",
      cache: request.cache ?? "default",
      mode: request.mode ?? "cors",
      redirect: request.redirect ?? (controlledRedirect ? "error" : "follow"),
      ...(request.referrer !== undefined ? { referrer: request.referrer } : {}),
      ...(request.referrerPolicy !== undefined ? { referrerPolicy: request.referrerPolicy } : {}),
      ...(request.priority !== undefined ? { priority: request.priority } : {})
    };
    const securityContext = request.securityContext ?? this.options.securityContext;
    if (securityContext !== undefined && (typeof securityContext !== "string" || !securityContext.trim())) {
      throw new Error("Audio securityContext must be a non-empty authentication generation");
    }
    // A browser's same-origin/include cookies can change invisibly to JavaScript.
    // Without an explicit authentication generation, neither join nor retain work.
    const reusable = input instanceof AudioClip || fetchOptions.credentials === "omit" || securityContext !== undefined;
    const signature = JSON.stringify([source, legacyKey, name ?? null, expectedHash ?? null, headerEntries,
      expectedSize ?? null, fetchOptions.credentials, fetchOptions.cache, fetchOptions.mode, fetchOptions.redirect,
      fetchOptions.referrer ?? null, fetchOptions.referrerPolicy ?? null, fetchOptions.priority ?? null,
      allowedOrigins ?? null, selfOrigin ?? null, request.expectedUrl ?? null, maxBytes, securityContext ?? null, request.baseURL ?? null]);
    let identity = reusable ? this.#identities.get(signature) : undefined;
    if (!identity) {
      identity = { signature, source, key: `audio-${this.managerId}-${++this.nextIdentity}` };
      if (reusable) this.#identities.set(signature, identity);
      this.#identitiesByKey.set(identity.key, identity);
      this.pruneUnusedIdentities(identity.key);
    }
    return { url, cacheKey: identity.key, ...(name ? { name } : {}), ...(asset ? { asset } : {}), identity, expectedHash, expectedSize, fetchOptions, allowedOrigins, sourceOrigin, expectedUrl: request.expectedUrl, maxBytes, baseURL: request.baseURL, sensitive, reusable };
  }

  private cachedEntry(key: string): AudioCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.cache.get(key) !== entry.clip) { this.dropCached(key); return undefined; }
    entry.lastUse = ++this.useCounter;
    return entry;
  }

  private cacheClip(resolved: InternalAudioRequest, clip: AudioClip, encodedBytes?: number): void {
    const bytes = decodedClipBytes(clip);
    if (bytes > this.maxDecodedBytes || this.maxCachedEntries === 0) return;
    // A caller can replace entries in an injected map. Do not let a stale,
    // externally removed entry consume a slot or prevent eviction indefinitely.
    for (const [key, entry] of this.entries) if (this.cache.get(key) !== entry.clip) this.dropCached(key);
    const previous = this.entries.get(resolved.cacheKey);
    if (previous?.leases) return;
    if (previous) this.dropCached(resolved.cacheKey);
    // Compare by subtraction to avoid overflowing the safe integer range.
    while (this.entries.size >= this.maxCachedEntries || this.decodedBytes > this.maxDecodedBytes - bytes) {
      const victim = [...this.entries.entries()].filter(([, entry]) => entry.leases === 0).sort((a, b) => a[1].lastUse - b[1].lastUse)[0];
      if (!victim) return;
      this.dropCached(victim[0]);
    }
    this.cache.set(resolved.cacheKey, clip);
    this.entries.set(resolved.cacheKey, { clip, source: resolved.identity.source, bytes, encodedBytes, leases: 0, lastUse: ++this.useCounter });
    this.decodedBytes += bytes;
  }

  private dropCached(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.decodedBytes -= entry.bytes;
    if (this.cache.get(key) === entry.clip) this.cache.delete(key);
    this.forgetIfUnused(key);
  }

  private cancel(entry: AudioInFlight): void {
    if (this.inflight.get(entry.key) === entry) this.inflight.delete(entry.key);
    entry.controller.abort();
    this.forgetIfUnused(entry.key);
  }

  private subscribe(entry: AudioInFlight, signal?: AbortSignal, onProgress?: (progress: AudioFileProgress) => void): Promise<AudioClip> {
    entry.subscribers++;
    const progressListener = onProgress ? (progress: AudioFileProgress) => reportProgress(onProgress, progress) : undefined;
    if (progressListener) {
      entry.listeners.add(progressListener);
      if (entry.progress) progressListener(entry.progress);
    }
    return new Promise<AudioClip>((resolve, reject) => {
      let complete = false;
      const finish = (error?: unknown, clip?: AudioClip) => {
        if (complete) return;
        complete = true;
        signal?.removeEventListener("abort", onAbort);
        entry.controller.signal.removeEventListener("abort", onAbort);
        if (progressListener) entry.listeners.delete(progressListener);
        entry.subscribers--;
        if (entry.subscribers === 0 && !entry.settled && !entry.controller.signal.aborted) this.cancel(entry);
        if (error !== undefined) reject(error);
        else resolve(clip!);
      };
      const onAbort = () => finish(abortError());
      signal?.addEventListener("abort", onAbort, { once: true });
      entry.controller.signal.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted || entry.controller.signal.aborted) onAbort();
      entry.promise.then((clip) => finish(undefined, clip), (error: unknown) => finish(error));
    });
  }

  private async loadResolved(resolved: InternalAudioRequest, entry: AudioInFlight): Promise<{ clip: AudioClip; encodedBytes: number }> {
    const signal = entry.controller.signal;
    assertAllowedOrigin(resolved.url, resolved.allowedOrigins, resolved.sourceOrigin, resolved.baseURL, resolved.sensitive);
    const response = await (this.options.fetch ?? defaultFetchAudio)(resolved.url, { ...resolved.fetchOptions, signal });
    let encoded: ArrayBuffer;
    try {
      throwIfAborted(signal);
      if (!response.ok) throw new Error(`Audio request failed with ${response.status}: ${redactUrl(resolved.url)}`);
      validateResponseOrigin(resolved.url, response.url, response.redirected, resolved.allowedOrigins, resolved.sourceOrigin, resolved.expectedUrl, resolved.baseURL, resolved.sensitive);
      encoded = await readAudioBytes(response, resolved.maxBytes, entry);
    } catch (error) {
      // A custom fetch may still deliver a response after cancellation. Rejected
      // status/policy/size responses also own unread bodies that must be closed.
      discardAudioResponse(response);
      throw error;
    }
    throwIfAborted(signal);
    if (resolved.expectedSize !== undefined && encoded.byteLength !== resolved.expectedSize) throw new Error("Audio content size mismatch");
    if (resolved.expectedHash) await verifySha256(encoded, resolved.expectedHash);
    throwIfAborted(signal);
    const decoded = await this.options.context.decodeAudioData(encoded.slice(0));
    throwIfAborted(signal);
    return { clip: new AudioClip({ name: resolved.name ?? resolved.url, buffer: decoded }), encodedBytes: encoded.byteLength };
  }

  private forgetIfUnused(key: string): void {
    if (this.entries.has(key) || this.inflight.has(key)) return;
    const identity = this.#identitiesByKey.get(key);
    if (!identity) return;
    this.#identitiesByKey.delete(key);
    if (this.#identities.get(identity.signature) === identity) this.#identities.delete(identity.signature);
  }

  private pruneUnusedIdentities(currentKey: string): void {
    // resolve() is public; cap otherwise-unretained signatures even if callers only resolve.
    if (this.#identitiesByKey.size <= 1024) return;
    for (const identity of this.#identitiesByKey.values()) {
      if (this.#identitiesByKey.size <= 1024) break;
      if (identity.key !== currentKey) this.forgetIfUnused(identity.key);
    }
  }
}

function discardAudioResponse(response: AudioFileFetchResponseLike): void {
  try {
    if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
  } catch { /* Cleanup cannot replace the request's original error. */ }
}

function decodedClipBytes(clip: AudioClip): number {
  const { numberOfChannels } = clip.buffer;
  if (!Number.isSafeInteger(numberOfChannels) || numberOfChannels < 1) throw new Error("Decoded audio buffer has invalid dimensions");
  // AudioBuffer.length is standard. Support older AudioBuffer-like implementations
  // by measuring their actual channels instead of undercounting missing length.
  let length = clip.buffer.length;
  if (!Number.isSafeInteger(length) && typeof clip.buffer.getChannelData === "function") {
    length = clip.buffer.getChannelData(0).length;
    for (let i = 1; i < numberOfChannels; i++) {
      if (clip.buffer.getChannelData(i).length !== length) throw new Error("Decoded audio channels have inconsistent lengths");
    }
  }
  const bytes = length * numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(bytes)) throw new Error("Decoded audio buffer has invalid dimensions");
  return bytes;
}

async function readAudioBytes(response: AudioFileFetchResponseLike, maxBytes: number, entry: AudioInFlight): Promise<ArrayBuffer> {
  const rawLength = response.headers?.get("content-length");
  const declaredLength = rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;
  if (declaredLength !== undefined && (!Number.isSafeInteger(declaredLength) || declaredLength > maxBytes)) {
    throw new Error(`Audio request exceeds ${maxBytes} encoded bytes`);
  }
  const progress = (loadedBytes: number) => {
    entry.progress = { loadedBytes, ...(declaredLength !== undefined ? { totalBytes: declaredLength } : {}) };
    for (const listener of entry.listeners) reportProgress(listener, entry.progress);
  };
  const signal = entry.controller.signal;
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    throwIfAborted(signal);
    if (bytes.byteLength > maxBytes) throw new Error(`Audio request exceeds ${maxBytes} encoded bytes`);
    progress(bytes.byteLength);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      throwIfAborted(signal);
      const { value, done } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      loaded += value.byteLength;
      if (loaded > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new Error(`Audio request exceeds ${maxBytes} encoded bytes`);
      }
      chunks.push(value);
      progress(loaded);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const output = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output.buffer;
}

function normalizeSha256(value: string): string {
  const match = /^(?:sha256[:-])?([a-f0-9]{64})$/i.exec(value.trim());
  if (!match) throw new Error("Audio content digest must be sha256-<64 hexadecimal characters>");
  return match[1].toLowerCase();
}

async function verifySha256(bytes: ArrayBuffer, expected: string): Promise<void> {
  if (!globalThis.crypto?.subtle) throw new Error("Audio content verification requires SHA-256 support");
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new Error("Audio content SHA-256 mismatch");
}

function normalizeOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) throw new Error();
    return parsed.origin;
  } catch { throw new Error("Audio sourceOrigin must be an absolute HTTP(S) origin"); }
}

function normalizeAllowedOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password ||
        parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    return parsed.origin;
  } catch { throw new Error("Invalid entry in audio allowedOrigins"); }
}

function urlOrigin(url: string, baseURL?: string): string | undefined {
  try {
    const parsed = new URL(url, baseURL ?? globalThis.location?.href);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin !== "null" ? parsed.origin : undefined;
  } catch { return undefined; }
}

function hasUrlCredentials(url: string, baseURL?: string): boolean {
  try {
    const parsed = new URL(url, baseURL ?? globalThis.location?.href);
    return !!(parsed.username || parsed.password);
  } catch { return false; }
}

function assertAllowedOrigin(url: string, allowed?: readonly string[], sourceOrigin?: string, baseURL?: string, sensitive = false): void {
  const origin = urlOrigin(url, baseURL ?? sourceOrigin);
  const source = sourceOrigin ?? urlOrigin(baseURL ?? globalThis.location?.href ?? "");
  if (allowed && (!origin || !allowed.includes(origin))) throw new Error("Audio request origin is not allowed or cannot be verified");
  if (sensitive && !origin) throw new Error("Cannot verify origin of audio request carrying credentials or headers");
  if (sensitive && !allowed && (!source || origin !== source)) {
    throw new Error("Cross-origin audio request with credentials or headers requires an explicit allowedOrigins policy and a verifiable source origin");
  }
}

function normalizedUrl(url: string, baseURL?: string): string {
  const parsed = new URL(url, baseURL ?? globalThis.location?.href);
  parsed.hash = "";
  return parsed.href;
}

function validateResponseOrigin(requestUrl: string, responseUrl?: string, redirected = false, allowed?: readonly string[], sourceOrigin?: string, expectedUrl?: string, baseURL?: string, sensitive = false): void {
  const controlledRedirect = allowed !== undefined || sensitive;
  if (redirected && controlledRedirect) throw new Error("Audio transport followed a redirect despite the request policy");
  if (!responseUrl && (controlledRedirect || expectedUrl || redirected)) {
    throw new Error("Audio transport did not report its final URL for verification");
  }
  if (!responseUrl) return;
  const base = baseURL ?? sourceOrigin;
  if (expectedUrl) {
    try {
      if (normalizedUrl(responseUrl, base) !== normalizedUrl(expectedUrl, base)) throw new Error("Audio response URL mismatch");
    } catch (error) {
      if (error instanceof Error && error.message === "Audio response URL mismatch") throw error;
      throw new Error("Audio expectedUrl must be resolvable");
    }
  }
  assertAllowedOrigin(responseUrl, allowed, sourceOrigin, baseURL, sensitive);
  // A custom transport must honor redirect:error too; checking the final URL
  // cannot otherwise establish that every intermediate hop was permitted.
  if (controlledRedirect) {
    try {
      if (normalizedUrl(requestUrl, base) !== normalizedUrl(responseUrl, base)) {
        throw new Error("Audio transport followed a redirect despite the request policy");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("redirect")) throw error;
      throw new Error("Cannot verify audio response URL");
    }
  }
}

function redactUrl(url: string): string {
  if (/^data:/i.test(url)) return "data:<redacted>";
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch { return url.split(/[?#]/, 1)[0]; }
}

function abortError(): Error {
  if (typeof DOMException !== "undefined") return new DOMException("Audio request was cancelled", "AbortError");
  const error = new Error("Audio request was cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function reportProgress(listener: ((progress: AudioFileProgress) => void) | undefined, progress: AudioFileProgress): void {
  if (!listener) return;
  // One subscriber's callback must not fail the shared transport for others.
  try { listener(progress); } catch { /* observer exceptions do not own the request */ }
}

export function validateEpisodeAudioAssets(
  assets: readonly AudioFileAssetLike[],
  requirements: readonly EpisodeAudioAssetRequirement[],
  options: { readonly requireLicense?: boolean } = {}
): EpisodeAudioAssetReadiness {
  const byId = new Map(assets.filter((asset) => asset.id).map((asset) => [asset.id!, asset]));
  const diagnostics: EpisodeAudioAssetDiagnostic[] = [];
  const missingAssetIds: string[] = [];
  let requiredCount = 0;
  let readyCount = 0;

  for (const requirement of requirements) {
    const required = requirement.required ?? true;
    if (required) requiredCount++;
    const asset = byId.get(requirement.id);
    if (!asset) {
      if (required) {
        missingAssetIds.push(requirement.id);
        diagnostics.push({
          severity: "error",
          code: "audio-asset-missing",
          assetId: requirement.id,
          message: `Required ${requirement.role ?? "audio"} asset "${requirement.id}" is missing.`
        });
      }
      continue;
    }
    if (asset.kind === "aura-asset-ref" && asset.type !== "audio") {
      diagnostics.push({
        severity: "error",
        code: "audio-asset-wrong-type",
        assetId: requirement.id,
        message: `Typed asset "${requirement.id}" is "${asset.type ?? "unknown"}", not audio.`
      });
      continue;
    }
    if (!asset.url.trim()) {
      diagnostics.push({
        severity: "error",
        code: "audio-asset-missing-url",
        assetId: requirement.id,
        message: `Audio asset "${requirement.id}" is missing a URL.`
      });
      continue;
    }
    if ((options.requireLicense || requirement.requireLicense) && !asset.license) {
      diagnostics.push({
        severity: "error",
        code: "audio-asset-missing-license",
        assetId: requirement.id,
        message: `Audio asset "${requirement.id}" is missing license metadata.`
      });
      continue;
    }
    readyCount++;
  }

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    requiredCount,
    readyCount,
    missingAssetIds,
    diagnostics
  };
}

async function defaultFetchAudio(url: string, init?: AudioFileFetchOptions): Promise<AudioFileFetchResponseLike> {
  if (typeof fetch !== "function") {
    throw new Error("AudioFileManager requires fetch or a custom fetch implementation");
  }
  return fetch(url, init);
}

function defaultCanPlayType(mimeType: string): "" | "maybe" | "probably" {
  if (typeof document === "undefined") throw new Error("Codec selection requires canPlayType injection outside a browser");
  return document.createElement("audio").canPlayType(mimeType);
}

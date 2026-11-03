import { mergeAssetRequestOptions, redactAssetUrl, validateAssetMaxBytes, type AssetIntegrity, type AssetRequestOptions } from "./AssetLoader";

export interface AuraLoaderProgress {
  readonly loaded: number;
  readonly total?: number;
}

/** Response metadata exposed only after URL policy and byte integrity succeed. */
export interface AssetFetchMetadata {
  readonly contentType: string;
}

/**
 * An opt-in lifetime barrier for work that can outlive a cancelled caller.
 * Sealing says that the caller will start no further root work; work already
 * tracked may still register the asynchronous cleanup it starts while settling.
 */
export interface AssetTransportTracker {
  readonly settled: Promise<void>;
  /** Admit one root operation before it can start; release when it completes. */
  begin(): () => void;
  track<T>(pending: PromiseLike<T>): Promise<T>;
  seal(): void;
}

export function createAssetTransportTracker(): AssetTransportTracker {
  let pending = 0;
  let sealed = false;
  let drained = false;
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
  const finishIfDrained = (): void => {
    if (!drained && sealed && pending === 0) { drained = true; resolveSettled(); }
  };
  return Object.freeze({
    settled,
    begin(): () => void {
      if (sealed) throw new Error("Asset transport tracker is sealed");
      pending += 1;
      let released = false;
      return (): void => {
        if (released) return;
        released = true;
        pending -= 1;
        finishIfDrained();
      };
    },
    track<T>(work: PromiseLike<T>): Promise<T> {
      if (drained) throw new Error("Asset transport tracker is already settled");
      pending += 1;
      const promise = Promise.resolve(work);
      // Keep the original result/rejection for the caller. This observer owns
      // only the lifetime count and consumes either outcome without throwing.
      void promise.then(() => { pending -= 1; finishIfDrained(); }, () => { pending -= 1; finishIfDrained(); });
      return promise;
    },
    seal(): void { sealed = true; finishIfDrained(); }
  });
}

export class AssetIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "AssetIntegrityError"; }
}

export class AssetPolicyError extends Error {
  constructor(message: string) { super(message); this.name = "AssetPolicyError"; }
}

export class AssetSizeError extends Error {
  constructor(message: string) { super(message); this.name = "AssetSizeError"; }
}

/** These failures cannot be repaired by retrying the same request. */
export function isNonRetryableAssetError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const item = current as { name?: unknown; status?: unknown; cause?: unknown };
    if (item.name === "AssetIntegrityError" || item.name === "AssetPolicyError" || item.name === "AssetSizeError" ||
        item.name === "RangeError" || typeof item.status === "number") return true;
    current = item.cause;
  }
  return false;
}

/** Fetch an asset while enforcing the same policy before bytes reach a parser or cache. */
export async function fetchBytes(
  url: string,
  signal: AbortSignal | undefined,
  onProgress?: (progress: AuraLoaderProgress) => void,
  options: AssetRequestOptions = {},
  tracker?: AssetTransportTracker,
  onMetadata?: (metadata: AssetFetchMetadata) => void
): Promise<ArrayBuffer> {
  // Reserve before calling fetch: fetch itself can synchronously trigger an
  // abort and seal the tracker before its promise is registered below.
  const releaseRoot = tracker?.begin();
  try { return await fetchBytesTracked(url, signal, onProgress, options, tracker, onMetadata); }
  finally { releaseRoot?.(); }
}

async function fetchBytesTracked(
  url: string,
  signal: AbortSignal | undefined,
  onProgress: ((progress: AuraLoaderProgress) => void) | undefined,
  options: AssetRequestOptions,
  tracker?: AssetTransportTracker,
  onMetadata?: (metadata: AssetFetchMetadata) => void
): Promise<ArrayBuffer> {
  // A caller may retain and mutate its request settings while fetch is in
  // flight. Use one private snapshot for initial policy checks, the actual
  // request, redirect checks, and byte-integrity verification.
  options = mergeAssetRequestOptions({}, options);
  const safeUrl = redactAssetUrl(url);
  if (typeof fetch !== "function") throw new Error(`fetch is unavailable — cannot load ${safeUrl}`);
  throwIfAborted(signal);
  validateAssetMaxBytes(options.maxBytes);
  validateAssetUrlPolicy(url, options);

  // Browsers cannot inspect every hop of a redirect chain. Following a redirect
  // while an origin allowlist or credential-bearing dependency is in force
  // could send a custom secret to an unapproved intermediate origin.
  const controlledRedirect = options.allowedOrigins !== undefined || hasSensitiveSettings(options);
  if (controlledRedirect && options.redirect && options.redirect !== "error") {
    throw new AssetPolicyError("Asset origin policy requires redirect: 'error'");
  }
  const init: RequestInit & { priority?: "high" | "low" | "auto" } = {
    signal,
    ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
    ...(options.cache !== undefined ? { cache: options.cache } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
    ...(options.mode !== undefined ? { mode: options.mode } : {}),
    ...(options.referrerPolicy !== undefined ? { referrerPolicy: options.referrerPolicy } : {}),
    ...(controlledRedirect ? { redirect: "error" as const } : options.redirect !== undefined ? { redirect: options.redirect } : {})
  };
  const discard = (response: Response): void => discardResponse(response, tracker);
  const response = await abortable(fetch(url, init), signal, discard, tracker);
  // Cancellation can arrive after fetch resolves but before this continuation
  // receives the response. The response still needs an owner to cancel it.
  try { throwIfAborted(signal); }
  catch (error) { discard(response); throw error; }
  if (!response.ok) {
    const error = new Error(`Request for ${safeUrl} failed with ${response.status}`) as Error & { status: number };
    error.status = response.status;
    discard(response);
    throw error;
  }
  if (response.redirected && !response.url) {
    discard(response);
    throw new AssetPolicyError(`Cannot verify redirect target for ${safeUrl}`);
  }
  const finalUrl = response.url || url;
  try { validateAssetUrlPolicy(finalUrl, options); }
  catch (error) { discard(response); throw error; }
  if (options.expectedUrl && normalizeUrl(finalUrl) !== normalizeUrl(options.expectedUrl)) {
    discard(response);
    throw new AssetPolicyError(`Asset redirect target did not match expected URL for ${safeUrl}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const error = new Error(`Request for ${safeUrl} failed with ${response.status} (text/html — likely a dev-server SPA fallback, not an asset)`) as Error & { status: number };
    error.status = response.status;
    discard(response);
    throw error;
  }
  const totalHeader = response.headers.get("content-length");
  const parsedTotal = totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : undefined;
  const total = parsedTotal !== undefined && Number.isSafeInteger(parsedTotal) ? parsedTotal : undefined;
  try { enforceMaxBytes(total, options.maxBytes, url); }
  catch (error) { discard(response); throw error; }

  const body = response.body;
  let buffer: ArrayBuffer;
  if (!body || typeof body.getReader !== "function") {
    if (options.maxBytes !== undefined) {
      discard(response);
      throw new AssetPolicyError(`Cannot enforce maxBytes without a readable response stream for ${safeUrl}`);
    }
    buffer = await abortable(response.arrayBuffer(), signal, undefined, tracker);
    throwIfAborted(signal);
    enforceMaxBytes(buffer.byteLength, options.maxBytes, url);
    onProgress?.({ loaded: buffer.byteLength, ...(total !== undefined ? { total } : {}) });
  } else {
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    try { reader = body.getReader(); }
    catch (error) { discard(response); throw error; }
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
    let cancellation: Promise<void> | undefined;
    let cancellationStarted = false;
    const cancel = (reason: unknown): void => {
      // The abort listener and catch path can both request cancellation. One
      // attempt owns cleanup, so a duplicate cannot hide its outcome.
      if (cancellationStarted) return;
      cancellationStarted = true;
      try {
        cancellation = Promise.resolve(reader.cancel(reason));
        retainCleanup(cancellation, tracker);
      } catch {
        // A failed cleanup does not establish that transport resources were
        // released. An opted-in admission slot remains held conservatively.
        retainUnknownCleanup(tracker);
      }
    };
    const abort = () => cancel(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        throwIfAborted(signal);
        pendingRead = reader.read();
        const { done, value } = await abortable(pendingRead, signal, undefined, tracker);
        pendingRead = undefined;
        throwIfAborted(signal);
        if (done) break;
        loaded += value.byteLength;
        enforceMaxBytes(loaded, options.maxBytes, url);
        chunks.push(value);
        onProgress?.({ loaded, ...(total !== undefined ? { total } : {}) });
      }
    } catch (error) {
      cancel(error);
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      try { reader.releaseLock(); }
      catch {
        if (tracker) {
          // A reader may refuse release while its read or cancel is pending.
          // Retry after both attempts settle; a second failure is not proof of
          // release and therefore deliberately keeps the barrier pending.
          const attempts: Promise<unknown>[] = [];
          if (pendingRead) attempts.push(pendingRead);
          if (cancellation) attempts.push(cancellation);
          const release = Promise.all(attempts.map((item) => item.then(() => {}, () => {}))).then(() => {
            try { reader.releaseLock(); }
            catch { return unknownCleanup(); }
          });
          tracker.track(release);
        }
      }
    }
    const out = new Uint8Array(loaded);
    let cursor = 0;
    for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.byteLength; }
    buffer = out.buffer;
    if (loaded === 0) onProgress?.({ loaded: 0, ...(total !== undefined ? { total } : {}) });
  }
  await abortable(verifyAssetBytes(buffer, options.integrity, url), signal, undefined, tracker);
  throwIfAborted(signal);
  onMetadata?.({ contentType });
  return buffer;
}

/** Verify a declared digest, including data-URI or already-loaded bytes. */
export async function verifyAssetBytes(bytes: ArrayBuffer, integrity: AssetIntegrity | undefined, url: string): Promise<void> {
  if (!integrity) return;
  if (integrity.version !== 1 || !/^(?:sha256-)?[a-f0-9]{64}$/i.test(integrity.digest)) {
    throw new AssetIntegrityError(`Invalid SHA-256 integrity metadata for ${redactAssetUrl(url)}`);
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new AssetIntegrityError(`SHA-256 is unavailable; cannot verify ${redactAssetUrl(url)}`);
  const expected = integrity.digest.replace(/^sha256-/i, "").toLowerCase();
  let digest: ArrayBuffer;
  try { digest = await subtle.digest("SHA-256", bytes); }
  catch { throw new AssetIntegrityError(`SHA-256 failed; cannot verify ${redactAssetUrl(url)}`); }
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new AssetIntegrityError(`SHA-256 integrity mismatch for ${redactAssetUrl(url)}`);
}

function enforceMaxBytes(size: number | undefined, maxBytes: number | undefined, url: string): void {
  if (size !== undefined && maxBytes !== undefined && size > maxBytes) {
    throw new AssetSizeError(`Asset ${redactAssetUrl(url)} exceeds maxBytes (${maxBytes})`);
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
}

function discardResponse(response: Response, tracker?: AssetTransportTracker): void {
  try {
    if (response.body) {
      if (response.body.locked) { retainUnknownCleanup(tracker); return; }
      retainCleanup(Promise.resolve(response.body.cancel()), tracker);
    }
  }
  catch { retainUnknownCleanup(tracker); /* Never mask the original failure. */ }
}

function unknownCleanup(): Promise<void> {
  // No timer or retry is allowed to manufacture proof of physical cleanup.
  return new Promise<void>(() => {});
}

function retainUnknownCleanup(tracker?: AssetTransportTracker): void {
  if (tracker) tracker.track(unknownCleanup());
}

function retainCleanup(cleanup: Promise<void>, tracker?: AssetTransportTracker): void {
  if (tracker) {
    // Rejection means the cleanup attempt ended, not that cleanup succeeded.
    tracker.track(cleanup.then(() => {}, () => unknownCleanup()));
  } else {
    void cleanup.catch(() => {});
  }
}

function abortable<T>(pending: Promise<T>, signal?: AbortSignal, onLateValue?: (value: T) => void, tracker?: AssetTransportTracker): Promise<T> {
  if (!signal) return tracker ? tracker.track(pending) : pending;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const abort = () => {
      if (done) return;
      done = true;
      reject(signal.reason ?? new DOMException("Asset load aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const physicallySettled = pending.then((value) => {
      signal.removeEventListener("abort", abort);
      if (done) { onLateValue?.(value); return; }
      done = true;
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      if (!done) { done = true; reject(error); }
    });
    // The tracked callback includes the handoff to late-response cleanup, so
    // sealing cannot resolve the barrier between a late response and cancel.
    if (tracker) tracker.track(physicallySettled); else void physicallySettled;
  });
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value, globalThis.location?.href);
    url.hash = "";
    return url.href;
  } catch { return value.replace(/#.*$/, ""); }
}

function originOf(value: string): string | undefined {
  try {
    const parsed = new URL(value, globalThis.location?.href);
    return parsed.origin === "null" ? undefined : parsed.origin;
  } catch { return undefined; }
}

function hasSensitiveSettings(options: AssetRequestOptions): boolean {
  let hasHeaders = false;
  new Headers(options.headers).forEach(() => { hasHeaders = true; });
  return options.credentials === "include" || hasHeaders;
}

/** Validate an asset's declared origin before fetching or consuming supplied bytes. */
export function validateAssetUrlPolicy(url: string, options: AssetRequestOptions): void {
  const origin = originOf(url);
  const sourceOrigin = options.sourceOrigin ? originOf(options.sourceOrigin) : originOf(globalThis.location?.href ?? "");
  if (options.sourceOrigin && !sourceOrigin) throw new AssetPolicyError("Invalid asset source origin");
  const allowedOrigins = options.allowedOrigins?.map((entry) => {
    if (entry === "self") {
      if (!sourceOrigin) throw new AssetPolicyError("Cannot resolve the 'self' asset origin");
      return sourceOrigin;
    }
    try {
      const parsed = new URL(entry);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password ||
          parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
      return parsed.origin;
    } catch { throw new AssetPolicyError("Invalid entry in asset allowedOrigins"); }
  });
  if (options.allowedOrigins && !origin && !/^(?:data|blob):/i.test(url)) {
    throw new AssetPolicyError(`Cannot verify asset origin for ${redactAssetUrl(url)}`);
  }
  if (allowedOrigins && origin && !allowedOrigins.includes(origin)) {
    throw new AssetPolicyError(`Asset origin is not allowed for ${redactAssetUrl(url)}`);
  }
  if (origin && sourceOrigin && origin !== sourceOrigin && hasSensitiveSettings(options) && !options.allowedOrigins) {
    throw new AssetPolicyError(`Cross-origin asset request with credentials or headers requires an explicit allowedOrigins policy for ${redactAssetUrl(url)}`);
  }
}

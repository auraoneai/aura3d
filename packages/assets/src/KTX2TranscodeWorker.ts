/** Same-origin Basis worker pool with bounded inputs and explicit job ownership. */
import { AssetDecoderDisposeTimeout, AssetDecoderUnavailable, DECODER_DISPOSE_TIMEOUT_MS, drainWithDeadline, looksLikeWasmBinary } from "./decoderLoad.js";
import type { KTX2TranscodedLevel } from "./KTX2TranscodeDriver.js";

/** True when a failure text or error says a Content Security Policy refused code generation or loading. Module-private: the
 * published `decoderLoad` declarations are unchanged in a patch release (same helper in KTX2TranscodeWorker.ts). */
function isCspBlockedFailure(value: unknown): boolean {
  if (typeof EvalError !== "undefined" && value instanceof EvalError) return true;
  const text = typeof value === "string" ? value : value instanceof Error ? `${value.name} ${value.message}` : "";
  return /unsafe-eval|Content Security Policy|violates the following/i.test(text);
}

/** Mark an `AssetDecoderUnavailable` as blocked by the page CSP: `code === "KTX2_CSP_BLOCKED"` (set at runtime, not declared). */
function markKtx2CspBlocked<T extends Error>(error: T): T {
  error.message = `${error.message}:KTX2_CSP_BLOCKED`;
  Object.defineProperty(error, "code", { value: "KTX2_CSP_BLOCKED", enumerable: true, writable: false, configurable: true });
  return error;
}


export interface KTX2WorkerTranscodeRequest {
  readonly bytes: Uint8Array;
  readonly transcoderFormat: number;
  readonly maxDimension?: number;
  readonly signal?: AbortSignal;
}

export interface KTX2WorkerTranscodeResult {
  readonly width: number;
  readonly height: number;
  readonly isUASTC: boolean;
  readonly hasAlpha: boolean;
  readonly levels: readonly KTX2TranscodedLevel[];
}

export interface KTX2WorkerPoolLimits {
  readonly maxJobs?: number;
  readonly maxInputBytes?: number;
  readonly maxPendingBytes?: number;
  readonly maxOutputBytes?: number;
  readonly initializeTimeoutMs?: number;
  readonly cancelTimeoutMs?: number;
  /** Bound on draining initialization and codec cleanup during disposal (default 10 s). */
  readonly disposeTimeoutMs?: number;
}

/** Exact same-origin asset URLs emitted by a packaged render worker. */
export interface BundledWorkerDecoderAssets {
  readonly basisScript: string;
  readonly basisModule: string;
  readonly basisWasm: string;
  readonly basisWorker: string;
  readonly dracoModule: string;
  readonly dracoWasm: string;
  readonly meshoptModule: string;
}

/** Read a validated manifest from this worker realm, without coupling the assets package to the engine. */
export function currentBundledDecoderAssets(): BundledWorkerDecoderAssets | undefined {
  return (globalThis as typeof globalThis & { [key: symbol]: unknown })[Symbol.for("@aura3d/worker-assets")] as BundledWorkerDecoderAssets | undefined;
}

/** Preserve the existing same-origin boundary when using hashed asset URLs. */
export function normalizeDecoderAssetUrl(value: string): string {
  const origin = typeof location === "undefined" ? "https://aura.invalid" : location.origin;
  let url: URL;
  try { url = new URL(value, `${origin}/`); } catch { throw new Error("Invalid decoder asset URL"); }
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Decoder assets must be same-origin HTTP URLs");
  }
  return url.href;
}

export interface KTX2TranscodeWorkerPool {
  transcode(request: KTX2WorkerTranscodeRequest): Promise<KTX2WorkerTranscodeResult>;
  /** Terminate workers immediately. */
  dispose(): void;
  /** Drain initialization cleanup; an uncooperative fetch can keep this pending. */
  disposeAsync?(): Promise<void>;
}

interface Job {
  readonly id: number;
  readonly request: KTX2WorkerTranscodeRequest;
  readonly resolve: (value: KTX2WorkerTranscodeResult) => void;
  readonly reject: (error: Error) => void;
  readonly abort: () => void;
  cancelled: boolean;
  done: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
interface Slot {
  readonly worker: Worker;
  ready: boolean;
  dead: boolean;
  job?: Job;
  readyResolve: () => void;
  readyReject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const MiB = 1024 * 1024;

/** A module worker may expose `importScripts` but forbid calling it. */
export function isDecoderWorkerScope(): boolean {
  const scope = globalThis as typeof globalThis & {
    importScripts?: unknown;
    WorkerGlobalScope?: { new(): object };
  };
  return typeof scope.importScripts === "function" ||
    (typeof scope.WorkerGlobalScope === "function" && globalThis instanceof scope.WorkerGlobalScope);
}

/** Load a same-origin codec without evaluating strings or creating blob URLs. */
export async function loadDecoderWorkerFactory(dirUrl: string, fileName: string, globalName: string, moduleAssetUrl?: string): Promise<unknown> {
  const scope = globalThis as typeof globalThis & { importScripts?: (...urls: string[]) => void } & Record<string, unknown>;
  if (!moduleAssetUrl && typeof scope.importScripts === "function") {
    try {
      scope.importScripts(`${dirUrl}${fileName}`);
      const factory = scope[globalName];
      if (factory === undefined) throw new Error(`${globalName} not bound by ${dirUrl}${fileName}`);
      return factory;
    } catch (error) {
      // The method exists in module workers but throws TypeError by design.
      // Other failures (including a missing classic script) remain failures.
      if (!(error instanceof TypeError)) throw error;
    }
  }
  const moduleUrl = moduleAssetUrl ? normalizeDecoderAssetUrl(moduleAssetUrl) : `${dirUrl}${fileName.replace(/\.js$/, ".mjs")}`;
  const module = await import(/* @vite-ignore */ moduleUrl) as Record<string, unknown>;
  const factory = module.default ?? module[globalName];
  if (factory === undefined) throw new Error(`${globalName} not exported by ${moduleUrl}`);
  return factory;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const actual = value ?? fallback;
  if (!Number.isSafeInteger(actual) || actual <= 0) throw new Error(`Invalid KTX2 ${name}`);
  return actual;
}
function abortError(): Error {
  const error = new Error("KTX2 transcode aborted");
  error.name = "AbortError";
  return error;
}
function isExpectedAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted && (error === signal.reason ||
    (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"));
}

/** Reject foreign origins, URL rewriting and encoded traversal before any fetch or worker creation. */
export function normalizeDecoderBasePath(value: string): string {
  if (!value || /[\\?#\u0000-\u001f]/.test(value)) throw new Error("Invalid KTX2 decoder base URL");
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { throw new Error("Invalid KTX2 decoder base URL"); }
  if (/%(?:2f|5c|25)/i.test(value) || /[\\\u0000-\u001f]/.test(decoded)) throw new Error("Invalid KTX2 decoder base URL encoding");
  if (decoded.split("/").some((part) => part === "." || part === "..")) throw new Error("KTX2 decoder base URL traversal");
  const origin = typeof location === "undefined" ? "https://aura.invalid" : location.origin;
  let parsed: URL;
  try { parsed = new URL(value, `${origin}/`); } catch { throw new Error("Invalid KTX2 decoder base URL"); }
  if (parsed.origin !== origin || parsed.username || parsed.password || !["http:", "https:"].includes(parsed.protocol)) throw new Error("KTX2 decoders must be same-origin");
  const normalized = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  return normalized;
}

/**
 * Jobs reserve memory before initialization, so requests cannot pile up while
 * scripts or wasm are downloading. An active abort waits for the worker's
 * cancellation acknowledgement; a non-responsive worker is terminated and
 * replaced after the bounded timeout. Initialization failures are retryable.
 */
export function createKTX2TranscodeWorkerPool(transcoderUrl: string, workerCount: number, limits: KTX2WorkerPoolLimits = {}, assets?: BundledWorkerDecoderAssets): KTX2TranscodeWorkerPool & { disposeAsync(): Promise<void> } {
  const base = normalizeDecoderBasePath(transcoderUrl);
  const workerUrl = assets ? normalizeDecoderAssetUrl(assets.basisWorker) : `${base}ktx2.worker.js`;
  const scriptUrl = assets ? normalizeDecoderAssetUrl(assets.basisScript) : `${base}basis_transcoder.js`;
  const wasmUrl = assets ? normalizeDecoderAssetUrl(assets.basisWasm) : `${base}basis_transcoder.wasm`;
  const size = Math.min(8, positiveInteger(workerCount === 0 ? 1 : workerCount, 1, "worker count"));
  const maxJobs = positiveInteger(limits.maxJobs, 32, "job limit");
  const maxInputBytes = positiveInteger(limits.maxInputBytes, 64 * MiB, "input limit");
  const maxPendingBytes = positiveInteger(limits.maxPendingBytes, 128 * MiB, "pending byte limit");
  const maxOutputBytes = positiveInteger(limits.maxOutputBytes, 256 * MiB, "output limit");
  const initializeTimeoutMs = positiveInteger(limits.initializeTimeoutMs, 30_000, "initialization timeout");
  const cancelTimeoutMs = positiveInteger(limits.cancelTimeoutMs, 5_000, "cancellation timeout");
  const disposeTimeoutMs = positiveInteger(limits.disposeTimeoutMs, DECODER_DISPOSE_TIMEOUT_MS, "disposal timeout");
  const queue: Job[] = [];
  const jobs = new Map<number, Job>();
  const initializations = new Set<Promise<void>>();
  const cleanupErrors: unknown[] = [];
  let slots: Slot[] = [];
  let wasmBinary: ArrayBuffer | undefined;
  let initPromise: Promise<void> | undefined;
  let initController: AbortController | undefined;
  let nextId = 1;
  let pendingBytes = 0;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  // Set when a worker failed because the page CSP refused the decoder.
  let cspBlocked = false;
  const workerUrlUnavailable = (): AssetDecoderUnavailable => {
    const unavailable = new AssetDecoderUnavailable("ktx2", `${base}ktx2.worker.js`);
    return cspBlocked ? markKtx2CspBlocked(unavailable) : unavailable;
  };

  function trackInitialization(work: Promise<unknown>, cleanup = false): void {
    const tracked = work.then(
      () => { initializations.delete(tracked); },
      (error: unknown) => {
        initializations.delete(tracked);
        if (cleanup) cleanupErrors.push(error);
      }
    );
    initializations.add(tracked);
  }

  function finish(job: Job, error?: Error, value?: KTX2WorkerTranscodeResult): void {
    if (job.done) return;
    job.done = true;
    if (job.timer) clearTimeout(job.timer);
    job.request.signal?.removeEventListener("abort", job.abort);
    jobs.delete(job.id);
    pendingBytes -= job.request.bytes.byteLength;
    const queued = queue.indexOf(job);
    if (queued !== -1) queue.splice(queued, 1);
    if (error) job.reject(error); else job.resolve(value!);
    stopIdleInitialization();
  }

  function stopIdleInitialization(): void {
    if (jobs.size !== 0 || !initController) return;
    const controller = initController;
    initController = undefined;
    initPromise = undefined;
    controller.abort();
    for (const slot of slots) terminate(slot, abortError());
    slots = [];
  }

  function terminate(slot: Slot, error: Error): void {
    if (slot.dead) return;
    slot.dead = true;
    if (slot.timer) clearTimeout(slot.timer);
    try { slot.worker.terminate(); } catch (failure) { cleanupErrors.push(failure); } finally {
      if (!slot.ready) slot.readyReject(error);
      if (slot.job) {
        const job = slot.job;
        slot.job = undefined;
        finish(job, job.cancelled ? abortError() : error);
      }
    }
  }

  function onMessage(slot: Slot, event: MessageEvent): void {
    if (slot.dead || disposed) return;
    const message = event.data as { type?: string; id?: number; error?: string; result?: KTX2WorkerTranscodeResult };
    if (message.type === "ready" && message.id === 0) {
      if (slot.timer) clearTimeout(slot.timer);
      slot.ready = true;
      slot.readyResolve();
      pump();
      return;
    }
    if (message.type === "error" && message.id === 0) {
      if (isCspBlockedFailure(message.error)) cspBlocked = true;
      terminate(slot, new Error(message.error ?? "KTX2 worker initialization failed"));
      return;
    }
    const job = slot.job;
    if (!job || message.id !== job.id) return;
    if (job.cancelled) {
      // A result can race the cancel message: wait for acknowledgement that
      // the worker consumed it before recycling this slot.
      if (message.type !== "cancelled") return;
      slot.job = undefined;
      finish(job, abortError());
    } else if (message.type === "transcode" && message.result) {
      slot.job = undefined;
      finish(job, undefined, message.result);
    } else if (message.type === "error") {
      slot.job = undefined;
      finish(job, new Error(message.error ?? "KTX2 transcode failed"));
    } else return;
    pump();
  }

  function spawn(binary: ArrayBuffer): { slot: Slot; ready: Promise<void> } {
    const worker = new Worker(workerUrl);
    let readyResolve!: () => void;
    let readyReject!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const slot: Slot = { worker, ready: false, dead: false, readyResolve, readyReject };
    slot.timer = setTimeout(() => terminate(slot, new Error("KTX2 worker initialization timed out")), initializeTimeoutMs);
    worker.onmessage = (event) => onMessage(slot, event);
    const workerFailed = (reason: string): void => {
      const wasReady = slot.ready;
      terminate(slot, new Error(reason));
      if (wasReady) { replace(slot); pump(); }
    };
    worker.onerror = (event) => {
      if (isCspBlockedFailure((event as ErrorEvent | undefined)?.message)) cspBlocked = true;
      workerFailed("KTX2 worker error");
    };
    worker.onmessageerror = () => workerFailed("KTX2 worker message error");
    try {
      const buffer = binary.slice(0);
      worker.postMessage({ type: "init", id: 0, wasmBinary: buffer, ...(assets ? { scriptUrl } : {}) }, [buffer]);
    } catch (error) {
      terminate(slot, error instanceof Error ? error : new Error(String(error)));
    }
    return { slot, ready };
  }

  async function loadBinary(signal: AbortSignal): Promise<ArrayBuffer> {
    const jsUrl = scriptUrl;
    const options: RequestInit = { signal, credentials: "same-origin", mode: "same-origin", redirect: "error" };
    const requests: Promise<Response>[] = [];
    const discard = async (response: Response): Promise<void> => {
      try { if (response.body && !response.bodyUsed) await response.body.cancel(); }
      catch (error) { if (!isExpectedAbort(error, signal)) throw error; }
    };
    let js: Response;
    let wasm: Response;
    try {
      for (const url of [jsUrl, wasmUrl]) {
        const request = fetch(url, options);
        requests.push(request);
        trackInitialization(request);
      }
      const responses = await Promise.all(requests);
      js = responses[0]!;
      wasm = responses[1]!;
    } catch (error) {
      // A sibling request can ignore abort and return a body after this attempt
      // has already failed. It still belongs to this initialization.
      for (const request of requests) {
        trackInitialization(request.then(discard, () => undefined), true);
      }
      throw error;
    }
    try {
      if (signal.aborted) throw new Error("KTX2 worker initialization cancelled");
      const jsMime = (js.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const wasmMime = (wasm.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!js.ok || !["text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript", "application/x-javascript"].includes(jsMime)) throw new AssetDecoderUnavailable("ktx2", jsUrl);
      const source = new TextDecoder().decode(await readBounded(js, 16 * MiB, jsUrl, signal));
      if (!source.trim() || source.trimStart().startsWith("<")) throw new AssetDecoderUnavailable("ktx2", jsUrl);
      if (!wasm.ok || wasmMime !== "application/wasm") throw new AssetDecoderUnavailable("ktx2", wasmUrl);
      const binary = await readBounded(wasm, 64 * MiB, wasmUrl, signal);
      if (!looksLikeWasmBinary(binary)) throw new AssetDecoderUnavailable("ktx2", wasmUrl);
      return binary;
    } catch (error) {
      for (const response of [js, wasm]) trackInitialization(Promise.resolve().then(() => discard(response)), true);
      throw error;
    }
  }

  async function readBounded(response: Response, limit: number, url: string, signal: AbortSignal): Promise<ArrayBuffer> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw new AssetDecoderUnavailable("ktx2", url);
    if (!response.body) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > limit) throw new AssetDecoderUnavailable("ktx2", url);
      return buffer;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) { await reader.cancel(); throw new AssetDecoderUnavailable("ktx2", url); }
        chunks.push(value);
      }
    } finally {
      if (signal.aborted) {
        try { await reader.cancel(); } catch (error) { if (!isExpectedAbort(error, signal)) cleanupErrors.push(error); }
      }
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  }

  function ensureStarted(): Promise<void> {
    if (initPromise) return initPromise;
    const controller = new AbortController();
    initController = controller;
    let timer: ReturnType<typeof setTimeout>;
    const created: ReturnType<typeof spawn>[] = [];
    let attemptSlots: Slot[] | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("KTX2 worker initialization timed out")); }, initializeTimeoutMs);
    });
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("KTX2 worker initialization cancelled"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const work = (async () => {
      const binary = wasmBinary ?? await loadBinary(controller.signal);
      if (disposed || controller.signal.aborted) throw new Error("KTX2 worker initialization cancelled");
      wasmBinary = binary;
      for (let index = 0; index < size; index++) {
        const worker = spawn(binary);
        // If a later constructor throws, terminating this worker rejects ready
        // before Promise.all can attach its handlers.
        void worker.ready.catch(() => {});
        created.push(worker);
        if (disposed || controller.signal.aborted) throw new Error("KTX2 worker initialization cancelled");
      }
      attemptSlots = created.map((item) => item.slot);
      slots = attemptSlots;
      await Promise.all(created.map((item) => item.ready));
    })();
    trackInitialization(work);
    const attempt = Promise.race([work, timeout, cancelled]).catch((error: unknown) => {
      controller.abort();
      for (const { slot } of created) terminate(slot, new Error("KTX2 worker initialization failed"));
      if (attemptSlots && slots === attemptSlots) slots = [];
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      if (initController === controller) initController = undefined;
    });
    trackInitialization(attempt);
    initPromise = attempt;
    void attempt.catch((error: unknown) => {
      if (initPromise !== attempt) return;
      initPromise = undefined;
      const failure = error instanceof AssetDecoderUnavailable ? error : workerUrlUnavailable();
      for (const job of [...queue]) finish(job, failure);
    });
    return attempt;
  }

  function replace(slot: Slot): void {
    if (disposed || !wasmBinary) return;
    const index = slots.indexOf(slot);
    if (index < 0) return;
    try {
      const replacement = spawn(wasmBinary);
      slots[index] = replacement.slot;
      trackInitialization(replacement.ready);
      void replacement.ready.then(pump, () => {
        if (slots.every((item) => item.dead)) {
          initPromise = undefined;
          for (const job of [...queue]) finish(job, workerUrlUnavailable());
        }
      });
    } catch {
      if (slots.every((item) => item.dead)) {
        initPromise = undefined;
        for (const job of [...queue]) finish(job, workerUrlUnavailable());
      }
    }
  }

  function pump(): void {
    if (disposed) return;
    for (const slot of slots) {
      if (!slot.ready || slot.dead || slot.job) continue;
      const job = queue.shift();
      if (!job) break;
      slot.job = job;
      try {
        // Preserve a Uint8Array view's actual range and the caller's buffer.
        const buffer = job.request.bytes.slice().buffer;
        slot.worker.postMessage({ type: "transcode", id: job.id, buffer, transcoderFormat: job.request.transcoderFormat, maxDimension: job.request.maxDimension, maxOutputBytes }, [buffer]);
      } catch (error) {
        terminate(slot, error instanceof Error ? error : new Error(String(error)));
        replace(slot);
      }
    }
  }

  function dispose(): Promise<void> {
    if (disposal) return disposal;
    disposed = true;
    const attempt: Promise<void> = Promise.resolve().then(async () => {
      // Workers are terminated synchronously below; only fetches/initializers
      // that ignore abort can remain. Bound the wait instead of hanging.
      const unsettled = await drainWithDeadline(initializations, disposeTimeoutMs);
      if (unsettled > 0) {
        if (disposal === attempt) disposal = undefined;
        throw new AssetDecoderDisposeTimeout("KTX2 worker pool", unsettled, disposeTimeoutMs);
      }
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "KTX2 worker pool disposal failed");
    });
    disposal = attempt;
    // Existing synchronous callers may ignore disposal; awaiters can still
    // observe cleanup failures from the original promise.
    void attempt.catch(() => {});
    initController?.abort();
    for (const slot of slots) terminate(slot, new Error("KTX2 worker pool disposed"));
    for (const job of [...jobs.values()]) finish(job, new Error("KTX2 worker pool disposed"));
    slots = [];
    wasmBinary = undefined;
    return disposal;
  }

  return {
    transcode(request) {
      if (disposed) return Promise.reject(new Error("KTX2 worker pool is disposed"));
      if (request.signal?.aborted) return Promise.reject(abortError());
      if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0 || request.bytes.byteLength > maxInputBytes) return Promise.reject(new Error("KTX2 input exceeds byte limit or is empty"));
      if (!Number.isSafeInteger(request.transcoderFormat) || request.transcoderFormat < 0) return Promise.reject(new Error("Invalid KTX2 transcoder format"));
      if (jobs.size >= maxJobs || request.bytes.byteLength > maxPendingBytes - pendingBytes) return Promise.reject(new Error("KTX2 worker queue is full"));
      return new Promise<KTX2WorkerTranscodeResult>((resolve, reject) => {
        const job: Job = {
          id: nextId++, request: { ...request, bytes: request.bytes.slice() }, resolve, reject, done: false, cancelled: false,
          abort: () => {
            if (job.done) return;
            job.cancelled = true;
            const slot = slots.find((item) => item.job === job);
            if (!slot) {
              finish(job, abortError());
              return;
            }
            try {
              job.timer = setTimeout(() => { terminate(slot, abortError()); replace(slot); pump(); }, cancelTimeoutMs);
              slot.worker.postMessage({ type: "cancel", id: job.id });
            } catch {
              terminate(slot, abortError());
              replace(slot);
              pump();
            }
          }
        };
        jobs.set(job.id, job);
        pendingBytes += request.bytes.byteLength;
        queue.push(job);
        request.signal?.addEventListener("abort", job.abort, { once: true });
        if (request.signal?.aborted) job.abort();
        if (!job.done) void ensureStarted().then(pump, () => {});
      });
    },
    dispose,
    disposeAsync: dispose
  };
}

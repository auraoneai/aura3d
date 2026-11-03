import {
  AssetManager,
  createAssetTransportTracker,
  mergeAssetRequestOptions,
  type AssetIntegrity,
  type AssetLoadProgress,
  type AssetRequestOptions
} from "@aura3d/assets/browser";
import type { AssetTransportTracker, ImageFormatLoader, NativeImageAsset } from "@aura3d/assets/importers";
import { assetEventScopeForApp, type AuraAppAssetEventScope } from "../assetEvents.js";
import type { AuraApp, AuraAssetRef } from "./types.js";

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_PIXELS = 32 * 1024 * 1024;
const MAX_DECODED_BYTES = 256 * 1024 * 1024;
const MAX_MIP_LEVELS = 32;

/** Bounded transport and decoding options for a typed native texture asset. */
export interface AuraNativeTextureLoadOptions {
  /** Request cancellation is independent of the caller and app signals. */
  readonly request?: AssetRequestOptions & { readonly signal?: AbortSignal };
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: AssetLoadProgress) => void;
  /** Own pending work and asset events by this app; the returned handle remains caller-owned. */
  readonly app?: AuraApp;
  /** These limits may only reduce the built-in limits. */
  readonly maxFileBytes?: number;
  readonly maxPixels?: number;
  readonly maxDecodedBytes?: number;
  readonly maxMipLevels?: number;
}

function canonicalDigest(value: unknown): string {
  if (typeof value !== "string" || !/^(?:sha256-)?[a-f0-9]{64}$/i.test(value)) {
    throw new TypeError("Native texture requires a valid SHA-256 digest");
  }
  return value.replace(/^sha256-/i, "").toLowerCase();
}

function validateIntegrity(value: AssetIntegrity): AssetIntegrity {
  if (!value || typeof value !== "object" || value.version !== 1) {
    throw new TypeError("Native texture integrity metadata must use version 1");
  }
  const digest = canonicalDigest(value.digest);
  if (value.requireDependencies !== undefined && typeof value.requireDependencies !== "boolean") {
    throw new TypeError("Native texture integrity dependency policy must be boolean");
  }
  if (value.dependencies !== undefined && (!value.dependencies || typeof value.dependencies !== "object" || Array.isArray(value.dependencies))) {
    throw new TypeError("Native texture integrity dependencies must be a record");
  }
  const dependencies: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value.dependencies ?? {})) dependencies[key] = canonicalDigest(entry);
  return {
    version: 1,
    digest,
    ...(value.dependencies === undefined ? {} : { dependencies }),
    ...(value.requireDependencies === undefined ? {} : { requireDependencies: value.requireDependencies })
  };
}

function sameIntegrity(a: AssetIntegrity, b: AssetIntegrity): boolean {
  if (a.digest !== b.digest || (a.requireDependencies ?? false) !== (b.requireDependencies ?? false)) return false;
  const left = Object.entries(a.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return left.length === right.length && left.every(([key, digest], index) => key === right[index]?.[0] && digest === right[index]?.[1]);
}

function boundedLimit(value: number | undefined, maximum: number, name: string): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be a positive safe integer no greater than ${maximum}`);
  }
  return value;
}

function requestByteLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Native texture request maxBytes must be a non-negative safe integer");
  return value;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Native texture load aborted", "AbortError");
}

function nativeTextureOwnerClosed(): Error {
  const error = new Error("Native texture load cancelled because its app is closed or unavailable");
  error.name = "AbortError";
  return error;
}

/** Snapshot the complete request before an optional module load can yield. */
function snapshotNativeTextureRequest(
  asset: AuraAssetRef<"texture">,
  options: AuraNativeTextureLoadOptions,
  eventScope?: AuraAppAssetEventScope
) {
  if (!asset || asset.kind !== "aura-asset-ref" || asset.type !== "texture" || typeof asset.id !== "string" || !asset.id ||
      typeof asset.url !== "string" || !asset.url || typeof asset.format !== "string" || asset.format.replace(/^\./, "").toLowerCase() !== "pvr") {
    throw new TypeError("texture.loadNativeAsset requires a typed PVR texture asset");
  }
  const url = asset.url;
  const assetId = asset.id;
  const requestOptions = options.request;
  const assetRequest = mergeAssetRequestOptions({}, asset.request);
  const callerRequest = mergeAssetRequestOptions({}, requestOptions);
  const digests = [asset.hash, asset.sha256].filter((item): item is string => item !== undefined).map(canonicalDigest);
  if (digests.some((digest) => digest !== digests[0])) throw new Error("Conflicting native texture SHA-256 digests");
  const integrities = [asset.integrity, assetRequest.integrity, callerRequest.integrity]
    .filter((item): item is AssetIntegrity => item !== undefined).map(validateIntegrity);
  if (integrities.some((item) => digests[0] !== undefined && item.digest !== digests[0])) {
    throw new Error("Native texture hash conflicts with integrity metadata");
  }
  if (integrities.some((item) => !sameIntegrity(integrities[0]!, item))) {
    throw new Error("Native texture request integrity conflicts with the admitted asset");
  }
  const integrity = integrities[0] ?? (digests[0] ? { version: 1 as const, digest: digests[0] } : undefined);
  if (!integrity) throw new Error("Native texture requires an expected SHA-256 digest");
  if (assetRequest.expectedUrl !== undefined && callerRequest.expectedUrl !== undefined && assetRequest.expectedUrl !== callerRequest.expectedUrl) {
    throw new Error("Native texture request has conflicting expected URLs");
  }
  const fileLimit = boundedLimit(options.maxFileBytes, MAX_FILE_BYTES, "maxFileBytes");
  const maxPixels = boundedLimit(options.maxPixels, MAX_PIXELS, "maxPixels");
  const maxDecodedBytes = boundedLimit(options.maxDecodedBytes, MAX_DECODED_BYTES, "maxDecodedBytes");
  const maxMipLevels = boundedLimit(options.maxMipLevels, MAX_MIP_LEVELS, "maxMipLevels");
  const assetMax = requestByteLimit(assetRequest.maxBytes);
  const callerMax = requestByteLimit(callerRequest.maxBytes);
  const allowedOrigins = assetRequest.allowedOrigins && callerRequest.allowedOrigins
    ? assetRequest.allowedOrigins.filter((origin) => callerRequest.allowedOrigins!.includes(origin))
    : assetRequest.allowedOrigins ?? callerRequest.allowedOrigins;
  const request = mergeAssetRequestOptions(assetRequest, {
    ...callerRequest,
    ...(allowedOrigins === undefined ? {} : { allowedOrigins }),
    integrity,
    expectedUrl: callerRequest.expectedUrl ?? assetRequest.expectedUrl ?? url,
    maxBytes: Math.min(fileLimit, assetMax ?? fileLimit, callerMax ?? fileLimit)
  });
  return {
    url, assetId, request, signal: options.signal, requestSignal: requestOptions?.signal,
    onProgress: options.onProgress, eventScope, fileLimit, maxPixels, maxDecodedBytes, maxMipLevels
  };
}

declare const nativeTexturePlanBrand: unique symbol;

/** Opaque request snapshot; it carries no publicly mutable policy or credentials. */
export interface PreparedNativeTextureLoad {
  readonly [nativeTexturePlanBrand]: true;
}

type NativeTextureRequestSnapshot = ReturnType<typeof snapshotNativeTextureRequest>;
const nativeTexturePlans = new WeakMap<PreparedNativeTextureLoad, NativeTextureRequestSnapshot>();

/** Validate and snapshot a request before enqueueing; this performs no I/O. */
export function prepareNativeTextureLoad(
  asset: AuraAssetRef<"texture">,
  options: AuraNativeTextureLoadOptions = {}
): PreparedNativeTextureLoad {
  const app = options.app;
  const eventScope = app === undefined ? undefined : assetEventScopeForApp(app);
  if (app !== undefined && (!eventScope || eventScope.signal.aborted)) throw nativeTextureOwnerClosed();
  try {
    const input = snapshotNativeTextureRequest(asset, options, eventScope);
    const plan = Object.freeze({}) as PreparedNativeTextureLoad;
    nativeTexturePlans.set(plan, input);
    return plan;
  } catch (error) {
    if (eventScope && !eventScope.signal.aborted) {
      let mayReport = false;
      try { mayReport = !options.signal?.aborted && !options.request?.signal?.aborted; }
      catch { /* A hostile options getter must not replace the original failure. */ }
      if (mayReport) {
        let url: string | undefined;
        let assetId: string | undefined;
        try {
          url = typeof asset?.url === "string" ? asset.url : undefined;
          assetId = typeof asset?.id === "string" ? asset.id : undefined;
        } catch { /* Invalid metadata must not replace the original failure. */ }
        eventScope.emitError({ url, assetId, error });
      }
    }
    throw error;
  }
}

/** Link independent cancellation scopes without retaining listeners afterwards. */
function linkedAbortSignal(...inputs: readonly (AbortSignal | undefined)[]): { signal?: AbortSignal; dispose(): void } {
  const signals = [...new Set(inputs.filter((signal): signal is AbortSignal => signal !== undefined))];
  if (signals.length < 2) return { signal: signals[0], dispose() {} };
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  const dispose = (): void => {
    for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    listeners.clear();
  };
  for (const signal of signals) {
    const abort = (): void => { if (!controller.signal.aborted) controller.abort(signal.reason); dispose(); };
    if (signal.aborted) { abort(); break; }
    listeners.set(signal, abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); break; }
  }
  return { signal: controller.signal, dispose };
}

/** Cancel a subscriber promptly while still observing the underlying work. */
function awaitWithAbort<T>(pending: Promise<T>, signal?: AbortSignal, releaseLate?: (value: T) => void): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      signal.removeEventListener("abort", abort);
      return true;
    };
    const abort = (): void => {
      if (finish()) reject(signal.reason ?? new DOMException("Native texture load aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    pending.then((value) => {
      if (finish()) resolve(value);
      else {
        try { releaseLate?.(value); } catch { /* No caller owns a late result. */ }
      }
    }, (error) => { if (finish()) reject(error); });
  });
}

export interface StartedNativeTextureLoad<T> {
  /** Subscriber result; cancellation rejects promptly. */
  readonly result: Promise<T>;
  /** Resolves only after the execution and underlying transport work settle. */
  readonly settled: Promise<void>;
}

/** Limits carried from the prepared request into native-image conversion. */
export interface NativeTextureConversionLimits {
  readonly maxDecodedBytes: number;
}

/**
 * Start a prepared request with separate subscriber and physical-work
 * lifetimes. The queue must keep its slot until `settled` resolves, including
 * when a cancelled fetch or body stream ignores its abort signal.
 */
export function startNativeTextureLoad<T extends { dispose(): void }>(
  plan: PreparedNativeTextureLoad,
  signal: AbortSignal | undefined,
  makeTexture: (image: NativeImageAsset, limits: NativeTextureConversionLimits) => T
): StartedNativeTextureLoad<T> {
  let resolvePhysical!: () => void;
  const physicalSettled = new Promise<void>((resolve) => { resolvePhysical = resolve; });
  const result = (async (): Promise<T> => {
    let input: NativeTextureRequestSnapshot | undefined;
    let linked: ReturnType<typeof linkedAbortSignal> | undefined;
    let importer: Promise<typeof import("../lazy/assetsImportersLazy.js")> | undefined;
    let tracker: AssetTransportTracker | undefined;
    let execution: Promise<T> | undefined;
    let delivering = true;
    try {
      input = nativeTexturePlans.get(plan);
      if (!input) throw new TypeError("Invalid prepared native texture request");
      linked = linkedAbortSignal(input.signal, input.requestSignal, signal, input.eventScope?.signal);
      throwIfAborted(linked.signal);
      importer = import("../lazy/assetsImportersLazy.js");
      const module = await awaitWithAbort(importer, linked.signal);
      throwIfAborted(linked.signal);
      tracker = createAssetTransportTracker();
      const scope = input.eventScope;
      const currentSignal = linked.signal;
      const snapshot = input;
      const onProgress = scope ? (event: AssetLoadProgress): void => {
        if (!delivering || currentSignal?.aborted || scope.signal.aborted) return;
        const { url, loadedBytes, totalBytes } = event;
        try { snapshot.onProgress?.(event); } catch { /* Observers do not own the request. */ }
        if (!delivering || currentSignal?.aborted || scope.signal.aborted) return;
        scope.emitProgress({
          url, item: url, assetId: snapshot.assetId,
          loaded: loadedBytes, total: totalBytes ?? loadedBytes
        });
      } : input.onProgress;
      execution = executeNativeTextureLoad(input, currentSignal, makeTexture, module.ImageFormatLoader, tracker, onProgress);
      // App disposal must reject promptly even if acquisition or release
      // ignores abort. Keep observing the execution and dispose a late handle.
      return await (scope ? awaitWithAbort(execution, currentSignal, (handle) => handle.dispose()) : execution);
    } catch (error) {
      if (input?.eventScope && !input.eventScope.signal.aborted && !input.signal?.aborted &&
          !input.requestSignal?.aborted && !signal?.aborted && !linked?.signal?.aborted) {
        input.eventScope.emitError({ url: input.url, assetId: input.assetId, error });
      }
      throw error;
    } finally {
      delivering = false;
      linked?.dispose();
      if (tracker) {
        const transport = tracker;
        const seal = (): void => {
          transport.seal();
          void transport.settled.then(resolvePhysical, resolvePhysical);
        };
        // A cancelled subscriber can finish before a late acquisition or its
        // cleanup. Do not release the physical-work slot or seal the tracker
        // until that execution has finished starting and cleaning up work.
        if (execution) void execution.then(seal, seal);
        else seal();
      } else if (importer) {
        // Module loading cannot be cancelled; keep the slot until it settles.
        void importer.then(resolvePhysical, resolvePhysical);
      } else {
        resolvePhysical();
      }
    }
  })();
  const settled = Promise.all([result.then(() => undefined, () => undefined), physicalSettled]).then(() => undefined);
  return Object.freeze({ result, settled });
}

async function executeNativeTextureLoad<T extends { dispose(): void }>(
  input: NativeTextureRequestSnapshot,
  signal: AbortSignal | undefined,
  makeTexture: (image: NativeImageAsset, limits: NativeTextureConversionLimits) => T,
  Loader: typeof ImageFormatLoader,
  tracker: AssetTransportTracker,
  onProgress: NativeTextureRequestSnapshot["onProgress"]
): Promise<T> {
  throwIfAborted(signal);
  const manager = new AssetManager();
  // No compressed GPU capabilities are assumed: the loader decodes the BC
  // formats for which it has a CPU path and rejects formats needing a device.
  manager.register(new Loader("pvr", {
    maxFileBytes: input.fileLimit,
    maxPixels: input.maxPixels,
    maxDecodedBytes: input.maxDecodedBytes,
    maxMipLevels: input.maxMipLevels,
    transportTracker: tracker
  }));
  const acquisition = await manager.load<NativeImageAsset>(input.url, {
    ...input.request,
    type: "pvr",
    format: "pvr",
    signal,
    onProgress,
    transportTracker: tracker
  });
  let texture: T | undefined;
  let failed = false;
  let failure: unknown;
  try {
    throwIfAborted(signal);
    texture = makeTexture(acquisition.value, { maxDecodedBytes: input.maxDecodedBytes });
    throwIfAborted(signal);
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await manager.release(acquisition);
  } catch (error) {
    failure = failed ? new AggregateError([failure, error], "Native texture acquisition and cleanup failed") : error;
    failed = true;
  }
  if (!failed) {
    try { throwIfAborted(signal); }
    catch (error) { failed = true; failure = error; }
  }
  if (failed) {
    try {
      texture?.dispose();
    } catch (error) {
      throw new AggregateError([failure, error], "Native texture load and cleanup failed");
    }
    throw failure;
  }
  return texture!;
}

/** Convenience result for callers that do not manage a physical-work queue. */
export function runNativeTextureLoad<T extends { dispose(): void }>(
  plan: PreparedNativeTextureLoad,
  signal: AbortSignal | undefined,
  makeTexture: (image: NativeImageAsset, limits: NativeTextureConversionLimits) => T
): Promise<T> {
  return startNativeTextureLoad(plan, signal, makeTexture).result;
}

/** Immediate public acquisition uses the same snapshot and execution path. */
export async function loadNativeTexture<T extends { dispose(): void }>(
  asset: AuraAssetRef<"texture">,
  options: AuraNativeTextureLoadOptions,
  makeTexture: (image: NativeImageAsset, limits: NativeTextureConversionLimits) => T
): Promise<T> {
  return runNativeTextureLoad(prepareNativeTextureLoad(asset, options), undefined, makeTexture);
}

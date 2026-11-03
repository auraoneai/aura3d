import { assetMarkLabel, assetPhaseMark } from "./assetPhaseMarks";
import { mergeAssetRequestOptions, redactAssetUrl, requestIdentityDetails, type AssetLoadProgress, type AssetLoadRequest } from "./AssetLoader";
import { fingerprintAssetIdentityText } from "./AssetManager";
import { GLTFLoader, type GLTFAsset, type GLTFDracoDecoder, type GLTFMeshoptDecoder } from "./GLTFLoader";
import { LoadContext } from "./LoadContext";

/** A lease owns one reference to the parsed data, never to per-scene GPU resources. */
export interface ParsedGLTFAssetLease {
  readonly asset: GLTFAsset;
  /** Idempotent, including after an abort or a failed load. */
  release(): void;
}

export interface ParsedGLTFAssetOptions {
  readonly url: string;
  readonly format?: "glb" | "gltf";
  readonly dracoDecoder?: GLTFDracoDecoder;
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
  /** Transport, expected content and subscriber cancellation for this load. */
  readonly request?: Omit<AssetLoadRequest, "url" | "type">;
}

interface ParsedAssetEntry {
  readonly key: string;
  readonly diagnosticUrl: string;
  readonly controller: AbortController;
  readonly listeners: Set<(event: AssetLoadProgress) => void>;
  promise: Promise<GLTFAsset>;
  asset?: GLTFAsset;
  references: number;
}

const parsedAssets = new Map<string, ParsedAssetEntry>();
const decoderIds = new WeakMap<object, number>();
let nextDecoderId = 1;

function decoderToken(decoder: GLTFDracoDecoder | GLTFMeshoptDecoder | undefined): string {
  if (!decoder) return "none";
  const identity = decoder as object;
  let id = decoderIds.get(identity);
  if (id === undefined) {
    id = nextDecoderId++;
    decoderIds.set(identity, id);
  }
  return `decoder-${id}`;
}

function parsedKeyForIdentity(
  identity: string,
  dracoDecoder?: GLTFDracoDecoder,
  meshoptDecoder?: GLTFMeshoptDecoder
): string {
  return [identity, `draco=${decoderToken(dracoDecoder)}`, `meshopt=${decoderToken(meshoptDecoder)}`].join("|");
}

/**
 * Legacy synchronous structural key. URL and context fingerprints avoid raw
 * disclosure, but unkeyed hashes are not secret storage or reuse authority.
 * The parse cache uses its separately computed async request identity instead.
 */
export function parsedGLTFAssetCacheKey(
  url: string,
  dracoDecoder?: GLTFDracoDecoder,
  meshoptDecoder?: GLTFMeshoptDecoder,
  contextToken?: string,
  format?: "glb" | "gltf"
): string {
  return [
    parsedKeyForIdentity(`url-${fingerprintAssetIdentityText(new LoadContext().resolve(url))}`, dracoDecoder, meshoptDecoder),
    ...(contextToken ? [`request=${fingerprintAssetIdentityText(contextToken)}`] : []),
    ...(format ? [`format=${format}`] : [])
  ].join("|");
}

function diagnosticAssetUrl(url: string): string {
  // Also remove userinfo if a malformed absolute URL cannot be parsed by redactAssetUrl.
  return redactAssetUrl(url.trim()).replace(/^([a-z][a-z\d+.-]*:\/\/)[^/@]*@/i, "$1");
}

function disposeParsedAsset(asset: GLTFAsset): void {
  // GLTFLoader owns the disposal symbol; GLTFAsset intentionally has no public dispose method.
  new GLTFLoader().dispose(asset);
}

function releaseEntry(entry: ParsedAssetEntry): void {
  if (entry.references <= 0 || --entry.references > 0) return;
  if (parsedAssets.get(entry.key) === entry) parsedAssets.delete(entry.key);
  if (entry.asset) disposeParsedAsset(entry.asset);
  else entry.controller.abort();
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  if (typeof DOMException !== "undefined") return new DOMException("Asset load aborted", "AbortError");
  const error = new Error("Asset load aborted");
  error.name = "AbortError";
  return error;
}

async function parseGLTFAssetForCache(entry: ParsedAssetEntry, options: ParsedGLTFAssetOptions): Promise<GLTFAsset> {
  const label = assetMarkLabel(entry.diagnosticUrl);
  assetPhaseMark(`glb-parse:start:${label}`);
  const loader = new GLTFLoader({
    ...(options.dracoDecoder ? { dracoDecoder: options.dracoDecoder } : {}),
    ...(options.meshoptDecoder ? { meshoptDecoder: options.meshoptDecoder } : {})
  });
  try {
    const asset = await loader.load({
      ...options.request,
      url: options.url,
      ...(options.format ? { format: options.format } : {}),
      signal: entry.controller.signal,
      onProgress: (event) => {
        for (const listener of entry.listeners) {
          // A consumer's progress handler must not fail another consumer's shared load.
          try { listener(event); } catch { /* Progress is advisory. */ }
        }
      }
    }, new LoadContext({ signal: entry.controller.signal }));
    if (entry.references === 0 || entry.controller.signal.aborted) {
      loader.dispose(asset);
      throw abortError(entry.controller.signal);
    }
    entry.asset = asset;
    assetPhaseMark(`glb-parse:end:${label}`);
    return asset;
  } catch (error) {
    if (parsedAssets.get(entry.key) === entry) parsedAssets.delete(entry.key);
    throw error;
  }
}

/**
 * Share only reusable identities with the same URL, decoders, digest and effective request policy.
 * Credentialed requests without an authentication generation get private leases. Each subscriber
 * can abort independently; work is cancelled only after its last owner leaves, and late completion
 * is disposed rather than inserted into a now-unowned cache entry.
 */
export async function acquireParsedGLTFAsset(options: ParsedGLTFAssetOptions): Promise<ParsedGLTFAssetLease> {
  // Capture the complete load before the asynchronous digest. The policy merger copies mutable
  // headers, allowlists and integrity maps; keep subscriber options and format from this same
  // request so caller mutations cannot change what is parsed under an already-computed key.
  const initialOptions = { ...options };
  const initialRequest = initialOptions.request ? { ...initialOptions.request } : undefined;
  const signal = initialRequest?.signal;
  if (signal?.aborted) throw abortError(signal);
  const capturedOptions: ParsedGLTFAssetOptions = {
    ...initialOptions,
    ...(initialRequest ? { request: { ...initialRequest, ...mergeAssetRequestOptions({}, initialRequest) } } : {})
  };
  const resolvedUrl = new LoadContext().resolve(capturedOptions.url);
  // request.format is also forwarded when there is no top-level format. Hash it alongside the
  // resolved URL so arbitrary format strings, signed queries and inline data stay out of keys.
  const format = capturedOptions.format || capturedOptions.request?.format;
  const identity = await requestIdentityDetails(capturedOptions.request ?? {}, JSON.stringify([resolvedUrl, format ?? null]));
  if (signal?.aborted) throw abortError(signal);
  const key = parsedKeyForIdentity(identity.key, capturedOptions.dracoDecoder, capturedOptions.meshoptDecoder);
  let entry = identity.reusable ? parsedAssets.get(key) : undefined;
  if (!entry) {
    const created: ParsedAssetEntry = {
      key,
      diagnosticUrl: diagnosticAssetUrl(capturedOptions.url),
      controller: new AbortController(),
      listeners: new Set(),
      promise: Promise.resolve(undefined as never),
      references: 0
    };
    // Register the first owner before starting asynchronous work.
    entry = created;
    // Unscoped credentialed requests and failed hashes have no reusable cache
    // identity. Their private entry still owns cancellation and the asset lease.
    if (identity.reusable) parsedAssets.set(key, created);
    created.references++;
    created.promise = parseGLTFAssetForCache(created, capturedOptions);
  } else {
    entry.references++;
  }

  const held = entry;
  const onProgress = capturedOptions.request?.onProgress;
  // Each subscriber owns its registration even if callers share a callback.
  const listener = onProgress ? (event: AssetLoadProgress): void => onProgress(event) : undefined;
  if (listener) held.listeners.add(listener);
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    if (listener) held.listeners.delete(listener);
    releaseEntry(held);
  };
  let onAbort: (() => void) | undefined;
  try {
    const asset = signal ? await Promise.race([
      held.promise,
      new Promise<never>((_, reject) => {
        onAbort = () => { release(); reject(abortError(signal)); };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      })
    ]) : await held.promise;
    if (signal?.aborted) throw abortError(signal);
    return { asset, release };
  } catch (error) {
    release();
    throw error;
  } finally {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export interface ParsedGLTFAssetCacheSnapshot {
  /** Reusable entries only; private leases are not retained by the cache. */
  readonly cachedEntries: number;
  /** References held by those reusable entries. */
  readonly totalReferences: number;
  readonly keys: readonly string[];
}

/** Diagnostic identities never expose request headers, cookies or other credential material. */
export function snapshotParsedGLTFAssetCache(): ParsedGLTFAssetCacheSnapshot {
  // Keep the diagnostic path for compatibility, but never try to recover it from the opaque key:
  // URL paths can contain the delimiter, and data/blob URLs must not reveal their contents.
  const keys = [...parsedAssets.values()].map((entry) => `${entry.diagnosticUrl}|${entry.key}`);
  return { cachedEntries: keys.length, totalReferences: [...parsedAssets.values()].reduce((sum, entry) => sum + entry.references, 0), keys };
}

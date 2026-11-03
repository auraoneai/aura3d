import {
  fetchBytes,
  mergeAssetRequestOptions,
  requestIdentityDetails,
  type AssetIntegrity,
  type AssetRequestOptions
} from "@aura3d/assets/browser";
import { createAssetTransportTracker, type AssetTransportTracker } from "@aura3d/assets/importers";
import type { AuraAssetRef } from "../nodes/types.js";

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_PIXELS = 32 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 4096;

declare const bitmapPlanBrand: unique symbol;
/** An opaque snapshot of a bitmap and its effective acquisition policy. */
export interface PreparedBitmapAssetLoad {
  readonly [bitmapPlanBrand]: true;
}

interface BitmapSnapshot {
  readonly url: string;
  readonly format?: string;
  readonly request: AssetRequestOptions;
  readonly callerRequest: AssetRequestOptions;
  readonly maxDimension: number;
}

const plans = new WeakMap<PreparedBitmapAssetLoad, BitmapSnapshot>();

/** Raw PNG channels, retained only for the lifetime of the decoded bitmap. */
export const productionPrimitiveBitmapPixels = new WeakMap<ImageBitmap, {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}>();

function canonicalDigest(value: unknown): string {
  if (typeof value !== "string" || !/^(?:sha256-)?[a-f0-9]{64}$/i.test(value)) {
    throw new TypeError("Bitmap asset requires a valid declared SHA-256 digest");
  }
  return value.replace(/^sha256-/i, "").toLowerCase();
}

function copyIntegrity(value: AssetIntegrity): AssetIntegrity {
  if (!value || typeof value !== "object" || value.version !== 1) {
    throw new TypeError("Bitmap asset integrity must use version 1");
  }
  if (value.requireDependencies !== undefined && typeof value.requireDependencies !== "boolean") {
    throw new TypeError("Bitmap integrity dependency policy must be boolean");
  }
  if (value.dependencies !== undefined && (!value.dependencies || typeof value.dependencies !== "object" || Array.isArray(value.dependencies))) {
    throw new TypeError("Bitmap integrity dependencies must be a record");
  }
  const dependencies: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, digest] of Object.entries(value.dependencies ?? {})) dependencies[key] = canonicalDigest(digest);
  return {
    version: 1,
    digest: canonicalDigest(value.digest),
    ...(value.dependencies === undefined ? {} : { dependencies }),
    ...(value.requireDependencies === undefined ? {} : { requireDependencies: value.requireDependencies })
  };
}

function sameIntegrity(a: AssetIntegrity | undefined, b: AssetIntegrity | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.digest !== b.digest || (a.requireDependencies ?? false) !== (b.requireDependencies ?? false)) return false;
  const left = Object.entries(a.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b.dependencies ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return left.length === right.length && left.every(([key, digest], i) => key === right[i]?.[0] && digest === right[i]?.[1]);
}

function maxBytes(value: number | undefined): number {
  if (value === undefined) return MAX_FILE_BYTES;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Bitmap maxBytes must be a non-negative safe integer");
  return Math.min(value, MAX_FILE_BYTES);
}

/** Capture the reference and its policy before a mount queue can yield. */
export function prepareBitmapAssetLoad(
  asset: AuraAssetRef<"texture"> | string,
  request?: AssetRequestOptions,
  maxDimension = DEFAULT_MAX_DIMENSION
): PreparedBitmapAssetLoad {
  if (!Number.isSafeInteger(maxDimension) || maxDimension < 1) {
    throw new RangeError("Bitmap texture size limit must be a positive safe integer");
  }
  const typed = typeof asset === "string" ? undefined : asset;
  if (typed !== undefined && (!typed || typed.kind !== "aura-asset-ref" || typed.type !== "texture" ||
      typeof typed.id !== "string" || !typed.id || typeof typed.format !== "string")) {
    throw new TypeError("Bitmap texture requires a typed texture asset");
  }
  const url = typeof asset === "string" ? asset : typed!.url;
  if (typeof url !== "string" || !url) throw new TypeError("Bitmap texture requires a URL");
  // Validate integrity before cloning: spreading malformed objects can turn an
  // invalid dependency list into an apparently valid record.
  const assetIntegrity = typed?.integrity === undefined ? undefined : copyIntegrity(typed.integrity);
  const assetRequestIntegrity = typed?.request?.integrity === undefined ? undefined : copyIntegrity(typed.request.integrity);
  const callerIntegrity = request?.integrity === undefined ? undefined : copyIntegrity(request.integrity);
  const assetRequest = mergeAssetRequestOptions({}, typed?.request);
  const callerRequest = mergeAssetRequestOptions({}, request);
  const digests = [typed?.hash, typed?.sha256].filter((item): item is string => item !== undefined).map(canonicalDigest);
  if (digests.some((digest) => digest !== digests[0])) throw new Error("Conflicting bitmap SHA-256 digests");
  const integrities = [assetIntegrity, assetRequestIntegrity, callerIntegrity].filter((item): item is AssetIntegrity => item !== undefined);
  if (integrities.some((item) => digests[0] !== undefined && item.digest !== digests[0]) ||
      integrities.some((item) => !sameIntegrity(integrities[0], item))) {
    throw new Error("Bitmap integrity conflicts with the admitted asset");
  }
  const integrity = integrities[0] ?? (digests[0] === undefined ? undefined : { version: 1 as const, digest: digests[0] });
  if (assetRequest.expectedUrl !== undefined && callerRequest.expectedUrl !== undefined && assetRequest.expectedUrl !== callerRequest.expectedUrl) {
    throw new Error("Bitmap request has conflicting expected URLs");
  }
  const allowedOrigins = assetRequest.allowedOrigins && callerRequest.allowedOrigins
    ? assetRequest.allowedOrigins.filter((origin) => callerRequest.allowedOrigins!.includes(origin))
    : assetRequest.allowedOrigins ?? callerRequest.allowedOrigins;
  const effective = mergeAssetRequestOptions(assetRequest, {
    ...callerRequest,
    ...(allowedOrigins === undefined ? {} : { allowedOrigins }),
    ...(integrity === undefined ? {} : { integrity }),
    maxBytes: Math.min(maxBytes(assetRequest.maxBytes), maxBytes(callerRequest.maxBytes))
  });
  const plan = Object.freeze({}) as PreparedBitmapAssetLoad;
  plans.set(plan, {
    url,
    ...(typed === undefined ? {} : { format: typed.format }),
    request: effective,
    callerRequest,
    maxDimension
  });
  return plan;
}

function snapshotFor(plan: PreparedBitmapAssetLoad): BitmapSnapshot {
  const snapshot = plans.get(plan);
  if (!snapshot) throw new TypeError("Invalid prepared bitmap asset request");
  return snapshot;
}

function sameHeaders(a: HeadersInit | undefined, b: HeadersInit | undefined): boolean {
  const left: [string, string][] = [];
  const right: [string, string][] = [];
  new Headers(a).forEach((value, key) => { left.push([key, value]); });
  new Headers(b).forEach((value, key) => { right.push([key, value]); });
  return left.length === right.length && left.every(([key, value], i) => key === right[i]?.[0] && value === right[i]?.[1]);
}

function sameRequest(a: AssetRequestOptions, b: AssetRequestOptions): boolean {
  const originsA = [...(a.allowedOrigins ?? [])].sort();
  const originsB = [...(b.allowedOrigins ?? [])].sort();
  return a.credentials === b.credentials && a.cache === b.cache && a.priority === b.priority && a.mode === b.mode &&
    a.redirect === b.redirect && a.referrerPolicy === b.referrerPolicy && a.sourceOrigin === b.sourceOrigin &&
    a.expectedUrl === b.expectedUrl && a.maxBytes === b.maxBytes && a.securityContext === b.securityContext &&
    (a.allowedOrigins === undefined) === (b.allowedOrigins === undefined) &&
    originsA.length === originsB.length && originsA.every((origin, i) => origin === originsB[i]) &&
    sameHeaders(a.headers, b.headers) && sameIntegrity(a.integrity, b.integrity);
}

/** Detect a mutated reference without exposing its request or credentials. */
export function matchesPreparedBitmapAssetLoad(plan: PreparedBitmapAssetLoad, asset: AuraAssetRef<"texture"> | string): boolean {
  try {
    const previous = snapshotFor(plan);
    const current = snapshotFor(prepareBitmapAssetLoad(asset, previous.callerRequest, previous.maxDimension));
    return current.url === previous.url && current.format === previous.format && sameRequest(current.request, previous.request);
  } catch { return false; }
}

/** Opaque, safe-to-share identity; the caller owns the identity task's lifetime. */
export async function identifyPreparedBitmapAssetLoad(plan: PreparedBitmapAssetLoad): Promise<{ readonly key: string; readonly reusable: boolean }> {
  const snapshot = snapshotFor(plan);
  const identity = await requestIdentityDetails(snapshot.request, snapshot.url);
  const mode = snapshot.request.cache;
  return {
    key: `${identity.key}:${snapshot.maxDimension}`,
    reusable: identity.reusable && mode !== "no-store" && mode !== "no-cache" && mode !== "reload"
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Bitmap texture load aborted", "AbortError");
}

function checkDimensions(width: number, height: number, maxDimension: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > maxDimension || height > maxDimension || width * height > MAX_PIXELS) {
    throw new RangeError("Bitmap texture dimensions exceed the configured decode limit");
  }
}

function checkPngHeader(bytes: ArrayBuffer, maxDimension: number): void {
  const data = new Uint8Array(bytes);
  if (data.length < 24 || data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71 ||
      data[4] !== 13 || data[5] !== 10 || data[6] !== 26 || data[7] !== 10 ||
      data[12] !== 73 || data[13] !== 72 || data[14] !== 68 || data[15] !== 82) return;
  const view = new DataView(bytes);
  checkDimensions(view.getUint32(16), view.getUint32(20), maxDimension);
}

function retainUnknownCleanup(tracker: AssetTransportTracker): void {
  tracker.track(new Promise<void>(() => {}));
}

function safeBitmapError(error: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) return signal.reason ?? new DOMException("Bitmap texture load aborted", "AbortError");
  // These built-in errors use redacted URLs. Browser and injected decoder
  // exceptions can contain a full signed URL, so do not surface their text.
  if (error instanceof Error && ["AssetIntegrityError", "AssetPolicyError", "AssetSizeError"].includes(error.name)) return error;
  return new Error("Bitmap texture acquisition or decoding failed");
}

/** Result cancels promptly; settled covers every observable late operation. */
export function startBitmapAssetLoad(plan: PreparedBitmapAssetLoad, signal?: AbortSignal): {
  readonly result: Promise<ImageBitmap>;
  readonly settled: Promise<void>;
} {
  const tracker = createAssetTransportTracker();
  const release = tracker.begin();
  let resolveResult!: (bitmap: ImageBitmap) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<ImageBitmap>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  let completed = false;
  const finish = (): boolean => {
    if (completed) return false;
    completed = true;
    signal?.removeEventListener("abort", abort);
    return true;
  };
  const abort = (): void => {
    if (finish()) rejectResult(signal?.reason ?? new DOMException("Bitmap texture load aborted", "AbortError"));
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const work = (async (): Promise<ImageBitmap> => {
    let bitmap: ImageBitmap | undefined;
    try {
      const snapshot = snapshotFor(plan);
      throwIfAborted(signal);
      if (typeof createImageBitmap !== "function") throw new Error("Bitmap texture decoding is unavailable");
      let contentType = "";
      const bytes = await fetchBytes(snapshot.url, signal, undefined, snapshot.request, tracker, (metadata) => {
        contentType = metadata.contentType;
      });
      throwIfAborted(signal);
      checkPngHeader(bytes, snapshot.maxDimension);
      bitmap = await createImageBitmap(new Blob([bytes], { type: contentType }), {
        premultiplyAlpha: "none", colorSpaceConversion: "none"
      });
      throwIfAborted(signal);
      // The browser decoder is not cancellable; this check bounds everything
      // retained or uploaded after it returns. PNG headers are also checked
      // before decoding, while other browser formats have no predecode parser.
      checkDimensions(bitmap.width, bitmap.height, snapshot.maxDimension);
      const { decodePngTexturePixels } = await import("../PngTexturePixels.js");
      throwIfAborted(signal);
      const pixels = await decodePngTexturePixels(new Uint8Array(bytes));
      throwIfAborted(signal);
      if (pixels) {
        if (pixels.width !== bitmap.width || pixels.height !== bitmap.height) throw new Error("PNG dimensions do not match the decoded bitmap");
        productionPrimitiveBitmapPixels.set(bitmap, pixels);
      }
      return bitmap;
    } catch (error) {
      if (bitmap) {
        try { bitmap.close(); } catch { retainUnknownCleanup(tracker); }
      }
      throw safeBitmapError(error, signal);
    }
  })();
  const handoff = work.then((bitmap) => {
    if (finish()) resolveResult(bitmap);
    else {
      try { bitmap.close(); } catch { retainUnknownCleanup(tracker); }
    }
  }, (error: unknown) => { if (finish()) rejectResult(error); });
  tracker.track(handoff);
  release();
  void handoff.then(() => tracker.seal(), () => tracker.seal());
  return Object.freeze({ result, settled: tracker.settled });
}

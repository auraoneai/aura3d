import {
  fetchBytes,
  mergeAssetRequestOptions,
  requestIdentityDetails,
  type AssetIntegrity,
  type AssetRequestOptions,
  createAssetTransportTracker,
  type AssetTransportTracker
} from "@aura3d/assets/browser";
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

/**
 * True when `url` resolves to this document's own origin. A relative URL with
 * no document base (workers without `location`, tests) can only address the
 * app's own origin. An absolute URL that cannot be compared is not same-origin.
 */
function isAppSameOrigin(url: string): boolean {
  let origin: string | undefined;
  let base: string | undefined;
  try {
    origin = globalThis.location?.origin;
    base = (typeof document !== "undefined" ? document.baseURI : undefined) ?? globalThis.location?.href;
  } catch { return false; }
  let absolute = false;
  try { new URL(url); absolute = true; } catch { /* relative */ }
  if (!absolute) {
    if (!base) return true;
    try { url = new URL(url, base).href; } catch { return false; }
  }
  if (!origin || origin === "null") return false;
  try { return new URL(url).origin === origin; } catch { return false; }
}

/**
 * Opaque, safe-to-share identity; the caller owns the identity task's lifetime.
 *
 * Decode-sharing rule (native 5.0 x GU47 e6 phase 8): two loads may share one
 * decoded image only when their full request identity is identical: URL,
 * credentials mode, headers, cache mode, redirect/referrer policy, allowed and
 * expected origins, byte limit, security context, integrity (digest and
 * dependencies) and the decode size limit. The shared cache is per realm, so a
 * shared entry never crosses a document (and its cookie jar) or a worker.
 * Within that scope, identical identity is reusable when:
 *   - credentials are "omit" or an explicit `securityContext` names the
 *     authentication generation (`requestIdentityDetails` reuse authority); or
 *   - the URL is same-origin with the app and credentials are not "include"
 *     to another origin. The response then depends only on this document's own
 *     origin state, which every holder in the realm shares, and integrity (when
 *     declared) pins the bytes. This restores 4.7.x per-URL sharing for default
 *     same-origin assets (Bunker Zero texPending 19-27 -> 0).
 * Cross-origin credentialed requests without a security context stay
 * partitioned: ambient third-party cookies can change without the request
 * options changing. "no-store", "no-cache" and "reload" never share.
 */
export async function identifyPreparedBitmapAssetLoad(plan: PreparedBitmapAssetLoad): Promise<{ readonly key: string; readonly reusable: boolean }> {
  const snapshot = snapshotFor(plan);
  // Capture the same-origin decision before the digest yields.
  const sameOrigin = isAppSameOrigin(snapshot.url);
  const identity = await requestIdentityDetails(snapshot.request, snapshot.url);
  const mode = snapshot.request.cache;
  const cacheable = mode !== "no-store" && mode !== "no-cache" && mode !== "reload";
  const sameOriginShareable = sameOrigin && identity.policyKey !== undefined;
  const key = identity.reusable ? identity.key : sameOriginShareable ? identity.policyKey! : identity.key;
  return {
    key: `${key}:${snapshot.maxDimension}`,
    reusable: cacheable && (identity.reusable || sameOriginShareable)
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

/**
 * GU47 e6 phase 7 (g09 texPending): how long a map waits for `createImageBitmap` before it decodes through an
 * `<img>` instead. On the loaded software-WebGL2 runner `createImageBitmap` was measured not settling for 20 s+ on a
 * 121 KB JPG and a 191-byte PNG while `<img>.decode()` of the same blob finished, so textured upgrades sat pending and
 * captures showed untextured surfaces. A healthy decode settles far inside this bound and keeps the bitmap path.
 */
export const PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS = 3000;

/** A decoded bitmap asset: an `ImageBitmap`, or a decoded `<img>` of the same verified bytes with `close()`. */
export type BitmapAssetImage = ImageBitmap | (HTMLImageElement & { close(): void });

export type BitmapAssetLoadStep = "fetch" | "body" | "decode" | "decode-fallback" | "pixels";

export interface BitmapAssetLoadOptions {
  /**
   * Leave PNG CPU pixels undecoded. The verified PNG bytes are kept in
   * `productionPrimitiveBitmapPngBytes` for the owner to decode on first CPU use.
   */
  readonly deferPixels?: boolean;
  /** Fall back to an `<img>` decode of the verified blob when `createImageBitmap` stalls. */
  readonly decodeFallback?: boolean;
  readonly onStep?: (step: BitmapAssetLoadStep) => void;
}

/** Verified PNG bytes of a decoded image loaded with `deferPixels` (owner decodes them lazily). */
export const productionPrimitiveBitmapPngBytes = new WeakMap<object, Uint8Array>();

const DECODE_TIMED_OUT = Symbol("decode-timed-out");

/**
 * Decodes `blob` through an `<img>`. The upload is equivalent to the bitmap path: the WebGL2 upload sets
 * `UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`, `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` and `UNPACK_FLIP_Y_WEBGL =
 * texture.flipY` (false here) before `texImage2D`; an `<img>` source honours those, an `ImageBitmap` source ignores them
 * and carries `premultiplyAlpha: "none"`, `colorSpaceConversion: "none"`, no flip instead (the same three settings).
 *
 * Request policy: the element reads an object URL of bytes that already passed the transport's origin, size and
 * integrity checks; it never refetches the network URL, so no request leaves with a different credentials mode or
 * headers. `crossOrigin` mirrors the request's credentials mode so the element stays CORS-clean either way.
 */
export async function decodeProductionImageFallback(
  blob: Blob,
  credentials?: RequestCredentials
): Promise<HTMLImageElement & { close(): void }> {
  if (typeof Image !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("texture decode fallback requires HTMLImageElement + URL.createObjectURL");
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image() as HTMLImageElement & { close(): void };
  image.crossOrigin = credentials === "include" ? "use-credentials" : "anonymous";
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  // `close()` mirrors ImageBitmap.close(): owners release the blob URL with the texture.
  image.close = () => URL.revokeObjectURL(objectUrl);
  return image;
}

function closeQuietly(image: BitmapAssetImage): void {
  try { image.close(); } catch { /* Best-effort release of a losing decode. */ }
}

/**
 * Bitmap decode with the `<img>` fallback. Whichever decode finishes first is used; a late loser is closed on
 * arrival. A stalled `createImageBitmap` loser is deliberately not tracked by the transport tracker: it may never
 * settle, and tracking it would hold the native queue slot exactly as the stall did before the fallback.
 */
export async function decodeBitmapWithFallback(
  blob: Blob,
  credentials: RequestCredentials | undefined,
  onFallback?: () => void
): Promise<BitmapAssetImage> {
  const bitmapDecode: Promise<BitmapAssetImage> = createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof DECODE_TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(DECODE_TIMED_OUT), PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS); });
  try {
    const first = await Promise.race([bitmapDecode, timeout]);
    if (first !== DECODE_TIMED_OUT) return first;
  } finally {
    clearTimeout(timer);
  }
  onFallback?.();
  const fallback = decodeProductionImageFallback(blob, credentials);
  const winner = await new Promise<BitmapAssetImage>((resolve, reject) => {
    let failures = 0;
    const lose = (error: unknown): void => { failures += 1; if (failures === 2) reject(error); };
    bitmapDecode.then(resolve, lose);
    fallback.then(resolve, lose);
  });
  for (const decode of [bitmapDecode, fallback]) void decode.then((image) => { if (image !== winner) closeQuietly(image); }, () => undefined);
  return winner;
}

function imageSize(image: BitmapAssetImage): { readonly width: number; readonly height: number } {
  const element = image as HTMLImageElement;
  return typeof element.naturalWidth === "number" && element.naturalWidth > 0
    ? { width: element.naturalWidth, height: element.naturalHeight }
    : { width: image.width, height: image.height };
}

function isPng(data: Uint8Array): boolean {
  return data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
}

/** Result cancels promptly; settled covers every observable late operation. */
export function startBitmapAssetLoad(plan: PreparedBitmapAssetLoad, signal?: AbortSignal): {
  readonly result: Promise<ImageBitmap>;
  readonly settled: Promise<void>;
};
export function startBitmapAssetLoad(plan: PreparedBitmapAssetLoad, signal: AbortSignal | undefined, options: BitmapAssetLoadOptions): {
  readonly result: Promise<BitmapAssetImage>;
  readonly settled: Promise<void>;
};
export function startBitmapAssetLoad(plan: PreparedBitmapAssetLoad, signal?: AbortSignal, options: BitmapAssetLoadOptions = {}): {
  readonly result: Promise<BitmapAssetImage>;
  readonly settled: Promise<void>;
} {
  const tracker = createAssetTransportTracker();
  const release = tracker.begin();
  let resolveResult!: (bitmap: BitmapAssetImage) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<BitmapAssetImage>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
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
  const onStep = options.onStep;
  const work = (async (): Promise<BitmapAssetImage> => {
    let bitmap: BitmapAssetImage | undefined;
    try {
      const snapshot = snapshotFor(plan);
      throwIfAborted(signal);
      if (typeof createImageBitmap !== "function") throw new Error("Bitmap texture decoding is unavailable");
      let contentType = "";
      onStep?.("fetch");
      // "body" once response bytes are arriving (the transport reports verified metadata only after the whole body).
      let reading = false;
      const bytes = await fetchBytes(snapshot.url, signal, onStep ? () => {
        if (reading) return;
        reading = true;
        onStep("body");
      } : undefined, snapshot.request, tracker, (metadata) => {
        contentType = metadata.contentType;
      });
      throwIfAborted(signal);
      checkPngHeader(bytes, snapshot.maxDimension);
      const blob = new Blob([bytes], { type: contentType });
      onStep?.("decode");
      // Both decoders read the bytes `fetchBytes` already verified (integrity, size, origin).
      bitmap = options.decodeFallback
        ? await decodeBitmapWithFallback(blob, snapshot.request.credentials, () => onStep?.("decode-fallback"))
        : await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      throwIfAborted(signal);
      // The browser decoder is not cancellable; this check bounds everything
      // retained or uploaded after it returns. PNG headers are also checked
      // before decoding, while other browser formats have no predecode parser.
      const size = imageSize(bitmap);
      checkDimensions(size.width, size.height, snapshot.maxDimension);
      const data = new Uint8Array(bytes);
      if (options.deferPixels) {
        // GU47 2f9fbc1e9: GPU-only users never pay for a CPU PNG decode. The
        // owner decodes these verified bytes on the first CPU request.
        if (isPng(data)) productionPrimitiveBitmapPngBytes.set(bitmap, data);
        return bitmap;
      }
      onStep?.("pixels");
      const { decodePngTexturePixels } = await import("../PngTexturePixels.js");
      throwIfAborted(signal);
      const pixels = await decodePngTexturePixels(data);
      throwIfAborted(signal);
      if (pixels) {
        if (pixels.width !== size.width || pixels.height !== size.height) throw new Error("PNG dimensions do not match the decoded bitmap");
        productionPrimitiveBitmapPixels.set(bitmap as ImageBitmap, pixels);
      }
      return bitmap;
    } catch (error) {
      if (bitmap) {
        productionPrimitiveBitmapPngBytes.delete(bitmap);
        try { bitmap.close(); } catch { retainUnknownCleanup(tracker); }
      }
      throw safeBitmapError(error, signal);
    }
  })();
  const handoff = work.then((bitmap) => {
    if (finish()) resolveResult(bitmap);
    else {
      productionPrimitiveBitmapPngBytes.delete(bitmap);
      try { bitmap.close(); } catch { retainUnknownCleanup(tracker); }
    }
  }, (error: unknown) => { if (finish()) rejectResult(error); });
  tracker.track(handoff);
  release();
  void handoff.then(() => tracker.seal(), () => tracker.seal());
  return Object.freeze({ result, settled: tracker.settled });
}

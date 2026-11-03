import type { LoadContext } from "./LoadContext";

/** SHA-256 values use 64 hexadecimal digits, optionally prefixed with `sha256-`. */
export interface AssetIntegrity {
  readonly version: 1;
  readonly digest: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly requireDependencies?: boolean;
}

/** Security and transport settings shared by documents and their dependencies. */
export interface AssetRequestOptions {
  readonly credentials?: RequestCredentials;
  readonly headers?: HeadersInit;
  readonly cache?: RequestCache;
  readonly priority?: "high" | "low" | "auto";
  readonly mode?: RequestMode;
  readonly redirect?: RequestRedirect;
  readonly referrerPolicy?: ReferrerPolicy;
  /** If set, requests and their final URLs must match one of these origins. `self` is allowed. */
  readonly allowedOrigins?: readonly string[];
  /** Origin of the containing document, used to prevent credential leakage to dependencies. */
  readonly sourceOrigin?: string;
  /** Require this exact final URL, including its query string, after any redirect. */
  readonly expectedUrl?: string;
  /** Maximum response bytes. Bounded loads require a readable response stream. */
  readonly maxBytes?: number;
  readonly integrity?: AssetIntegrity;
  /**
   * Non-secret authentication generation. Change it when ambient credentials or
   * authorization change, then start a new acquisition. Without a generation,
   * requests that may carry browser credentials are not shared or cached.
   */
  readonly securityContext?: string;
}

export interface AssetLoadRequest extends AssetRequestOptions {
  readonly url: string;
  readonly type?: string;
  /** Explicit representation for extensionless or signed asset URLs. */
  readonly format?: "glb" | "gltf" | (string & {});
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: AssetLoadProgress) => void;
}

const REQUEST_OPTION_KEYS = [
  "credentials", "headers", "cache", "priority", "mode", "redirect", "referrerPolicy",
  "allowedOrigins", "sourceOrigin", "expectedUrl", "maxBytes", "integrity", "securityContext"
] as const;

/**
 * Merge only transport settings; an omitted request setting does not erase a
 * context default. Mutable policy containers are copied when a request starts
 * so its cache identity and the later transport observe the same policy even
 * if the caller changes its own headers, allowlist, or digest map meanwhile.
 */
export function mergeAssetRequestOptions(
  defaults: AssetRequestOptions = {},
  overrides: AssetRequestOptions = {}
): AssetRequestOptions {
  const result: Record<string, unknown> = {};
  for (const key of REQUEST_OPTION_KEYS) {
    const value = overrides[key] === undefined ? defaults[key] : overrides[key];
    if (value === undefined) continue;
    if (key === "securityContext") {
      validateAssetSecurityContext(value);
      result[key] = value;
    } else if (key === "headers") {
      result[key] = copyHeaders(value as HeadersInit);
    } else if (key === "allowedOrigins") {
      result[key] = [...value as readonly string[]];
    } else if (key === "integrity") {
      const integrity = value as AssetIntegrity;
      result[key] = {
        ...integrity,
        ...(integrity.dependencies === undefined ? {} : { dependencies: { ...integrity.dependencies } })
      };
    } else {
      result[key] = value;
    }
  }
  return result as AssetRequestOptions;
}

function copyHeaders(headers: HeadersInit): HeadersInit {
  if (Array.isArray(headers)) return headers.map((pair): [string, string] => [pair[0], pair[1]]);
  // Accept Headers created in another realm as well as local instances. Keep
  // records and tuple lists in their original shapes for existing consumers.
  if (typeof Headers !== "undefined" && typeof (headers as Headers).get === "function" &&
      typeof (headers as Headers).forEach === "function") {
    return new Headers(headers);
  }
  return { ...headers };
}

/** Validate a size limit before it can participate in cache lookup or transport. */
export function validateAssetMaxBytes(maxBytes: number | undefined): void {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new RangeError("Asset maxBytes must be a non-negative safe integer");
  }
}

function validateAssetSecurityContext(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Asset securityContext must be a non-empty authentication generation");
  }
}

/** An opaque acquisition key and optional opaque policy fingerprint. */
export interface AssetRequestIdentity {
  readonly key: string;
  readonly policyKey?: string;
  readonly reusable: boolean;
}

/**
 * Opaque cache identity; header values and URL credentials never appear in cache keys.
 * When SHA-256 is unavailable, disable sharing instead of weakening isolation.
 */
export async function requestIdentity(options: AssetRequestOptions = {}, url?: string): Promise<string> {
  return (await requestIdentityDetails(options, url)).key;
}

/**
 * Distinguish policy identity from reuse authority. A browser can change its
 * ambient cookies without changing request options; only credential omission
 * or an explicit authentication generation permits sharing in that case.
 */
export async function requestIdentityDetails(options: AssetRequestOptions = {}, url?: string): Promise<AssetRequestIdentity> {
  // JSON serialization maps NaN and infinities to null, which would otherwise
  // collide with the identity for an omitted limit and bypass validation on a
  // cache hit. Validate first, including when hashing is unavailable.
  validateAssetMaxBytes(options.maxBytes);
  const credentials = options.credentials ?? "same-origin";
  const securityContext = options.securityContext;
  if (securityContext !== undefined) validateAssetSecurityContext(securityContext);
  // Capture reuse authority before the digest yields. Caller mutation must not
  // turn a digest computed without a generation into a reusable identity.
  const reusable = credentials === "omit" || securityContext !== undefined;
  let subtle: SubtleCrypto | undefined;
  try { subtle = globalThis.crypto?.subtle; } catch { /* Secure hashing is unavailable. */ }
  if (!subtle || typeof subtle.digest !== "function" || typeof TextEncoder === "undefined") {
    return { key: uniqueRequestIdentity(), reusable: false };
  }
  const headers: Array<[string, string]> = [];
  new Headers(options.headers).forEach((value, name) => headers.push([name.toLowerCase(), value]));
  headers.sort(([a], [b]) => a.localeCompare(b));
  const dependencies = Object.entries(options.integrity?.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const normalized = {
    url: url ?? null,
    credentials,
    headers,
    cache: options.cache ?? "default",
    priority: options.priority ?? "auto",
    mode: options.mode ?? "cors",
    redirect: options.redirect ?? "follow",
    referrerPolicy: options.referrerPolicy ?? "",
    allowedOrigins: options.allowedOrigins ? [...options.allowedOrigins].sort() : null,
    sourceOrigin: options.sourceOrigin ?? null,
    expectedUrl: options.expectedUrl ?? null,
    maxBytes: options.maxBytes ?? null,
    securityContext: securityContext ?? null,
    integrity: options.integrity ? {
      version: options.integrity.version,
      digest: options.integrity.digest.toLowerCase(),
      dependencies,
      requireDependencies: options.integrity.requireDependencies ?? false
    } : null
  };
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(normalized)));
    if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) throw new Error("Invalid SHA-256 identity digest");
    const policyKey = `request-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    return { key: reusable ? policyKey : uniqueRequestIdentity(), policyKey, reusable };
  } catch {
    return { key: uniqueRequestIdentity(), reusable: false };
  }
}

function uniqueRequestIdentity(): string {
  const key = Symbol.for("@aura3d/assets/unshared-request-sequence");
  const shared = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const next = typeof shared[key] === "number" ? (shared[key] as number) + 1 : 1;
  shared[key] = next;
  return `unshared-${next}`;
}

export interface AssetLoadProgress {
  readonly url: string;
  readonly phase: "document" | "buffer" | "complete";
  readonly loadedBytes: number;
  readonly totalBytes?: number;
}

export interface AssetLoader<T = unknown> {
  readonly type: string;
  canLoad(request: AssetLoadRequest): boolean;
  dependencies?(request: AssetLoadRequest, context: LoadContext): Promise<readonly string[]> | readonly string[];
  load(request: AssetLoadRequest, context: LoadContext): Promise<T> | T;
  dispose?(asset: T): void | Promise<void>;
}

export class AssetLoadError extends Error {
  readonly url: string;
  readonly dependencyChain: readonly string[];

  constructor(message: string, url: string, dependencyChain: readonly string[] = [], cause?: unknown) {
    const safeUrl = redactAssetUrl(url);
    let safeMessage = url ? message.split(url).join(safeUrl) : message;
    for (const item of dependencyChain) safeMessage = safeMessage.split(item).join(redactAssetUrl(item));
    super(redactAssetMessage(safeMessage));
    this.name = "AssetLoadError";
    this.url = safeUrl;
    this.dependencyChain = dependencyChain.map(redactAssetUrl);
    let errorCause: Error | undefined;
    try { if (cause instanceof Error) errorCause = cause; } catch { /* A hostile proxy can reject inspection. */ }
    if (errorCause) {
      let detail: unknown;
      let causeName: unknown;
      let status: unknown;
      try { detail = errorCause.message; } catch { /* Keep the fallback below. */ }
      try { causeName = errorCause.name; } catch { /* Keep the standard name. */ }
      try { status = (errorCause as Error & { status?: unknown }).status; } catch { /* Status is optional. */ }
      const safeCause = new Error(redactAssetMessage(typeof detail === "string" ? detail : "[error details unavailable]", url));
      safeCause.name = redactAssetMessage(typeof causeName === "string" ? causeName : "Error", url).slice(0, 128);
      if (typeof status === "number") (safeCause as Error & { status: number }).status = status;
      this.cause = safeCause;
    } else if (cause !== undefined) {
      let detail = "[error details unavailable]";
      try { detail = String(cause); } catch { /* Do not let an untrusted cause mask the load error. */ }
      this.cause = redactAssetMessage(detail, url);
    }
  }
}

/** Remove credentials, signed query strings, fragments and inline data from diagnostics. */
export function redactAssetUrl(url: string): string {
  // URL parsing itself accepts surrounding whitespace. Apply the same
  // normalization before checking schemes so inline content is never passed
  // through merely because a caller included leading whitespace.
  const candidate = url.trim();
  if (/^data:/i.test(candidate)) return "data:<redacted>";
  if (/^blob:/i.test(candidate)) return "blob:<redacted>";
  try {
    const parsed = new URL(candidate);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    // A malformed authority can prevent URL parsing; preserve a useful path
    // while removing everything through the last @ in the authority. The
    // optional scheme and slash variants are handled without parsing secrets.
    const withoutQuery = candidate.split(/[?#]/, 1)[0] ?? "";
    return withoutQuery.replace(/^((?:[a-z][a-z\d+.-]*:\s*[\/\\]*|[\/\\]{2,}))[^/\\]*@/i, "$1");
  }
}

/** Best-effort redaction for diagnostic text, including a known relative or malformed URL. */
export function redactAssetMessage(message: string, url?: string): string {
  const text = url ? message.split(url).join(redactAssetUrl(url)) : message;
  return text
    .replace(/(?:https?:\/\/|\/\/)[^\s<>"')\]}]+|(?:data|blob):[^\s<>"')\]}]+/gi, redactAssetUrl)
    .replace(/((?:\/|\.\.?\/|[a-z0-9_-]+\/)[^\s"'<>?#]*|[a-z0-9_.-]+\.[a-z0-9]{1,10})[?#][^\s"'<>]*/gi, "$1")
    .replace(/(["']?)(?:request[-_ ]?)?headers?\1\s*[:=]\s*(?:\{[^}]*\}|\[[^\]]*\]|[^\r\n]*)/gi, "headers: <redacted>")
    .replace(/(["']?)(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-[\w-]*(?:token|secret|private|auth|key|header)[\w-]*)\1\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]*)/gi, "$2: <redacted>")
    .replace(/(["']?)(password|passwd|secret|token|access_token|api[-_]?key|credential|signature|private[-_]?key)\1\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, "$2: <redacted>")
    .replace(/\b(bearer|basic)\s+[^\s,;"']+/gi, "$1 <redacted>");
}

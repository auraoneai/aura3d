import { redactAssetMessage } from "./AssetLoader.js";

/**
 * Decoder load fail-closed helpers (05-S3S4 / T0-21 part 2).
 *
 * A decoder fetch or emscripten init that neither resolves nor rejects must
 * surface as a rejection inside `DECODER_LOAD_TIMEOUT_MS` — before this, a
 * 404'd/SPA-fallback wasm or a dead worker hung `require()` and the whole
 * model() path with it.
 */

/** Named error every decoder-availability failure converges to. */
export class AssetDecoderUnavailable extends Error {
  public readonly decoderId: string;
  public readonly url: string;
  /** Set to `KTX2_CSP_BLOCKED` when the page's Content Security Policy refused the decoder (additive). */
  public readonly code?: "KTX2_CSP_BLOCKED";
  constructor(decoderId: string, url: string, code?: "KTX2_CSP_BLOCKED") {
    super(`AssetDecoderUnavailable:${decoderId}:${url}${code ? `:${code}` : ""}`);
    this.name = "AssetDecoderUnavailable";
    this.decoderId = decoderId;
    this.url = url;
    if (code) this.code = code;
  }
}

/** True when a failure text or error says a Content Security Policy refused code generation or loading. */
export function isCspBlockedFailure(value: unknown): boolean {
  if (typeof EvalError !== "undefined" && value instanceof EvalError) return true;
  const text = typeof value === "string" ? value : value instanceof Error ? `${value.name} ${value.message}` : "";
  return /unsafe-eval|Content Security Policy|violates the following/i.test(text);
}

/** Shared bound on decoder module loads (script, wasm fetch, emscripten init). */
export const DECODER_LOAD_TIMEOUT_MS = 30_000;

/** An Emscripten abort callback must settle even for hostile thrown values. */
export function decoderAbortReason(reason: unknown): string {
  try {
    return redactAssetMessage(String(reason).slice(0, 2048));
  } catch {
    return "[unavailable]";
  }
}

/**
 * Rejects with `Error` after `ms` when `promise` has not settled. Both outcome
 * handlers are always attached, so a late rejection never goes unhandled.
 */
export function withDecoderTimeout<T>(promise: Promise<T>, label: string, ms: number = DECODER_LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * True only for real wasm module bytes (`\0asm` magic + version). An SPA
 * `index.html` fallback answers 200 with a HTML body — feeding that to
 * emscripten aborts without `onAbort`, so callers must reject first.
 */
export function looksLikeWasmBinary(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const bytes = new Uint8Array(buffer);
  return bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
}

/** Default bound on draining decoder initialization/cleanup during disposal. */
export const DECODER_DISPOSE_TIMEOUT_MS = 10_000;

/**
 * Disposal could not observe every initializer or cleanup settle within its
 * bound (for example a Basis/Draco factory whose promise never settles). The
 * owner is already cancelled and unusable; late values are still released when
 * they arrive, and calling dispose again re-drains what is left.
 */
export class AssetDecoderDisposeTimeout extends Error {
  readonly code = "ASSET_DECODER_DISPOSE_TIMEOUT" as const;
  readonly pending: number;
  readonly timeoutMs: number;
  constructor(owner: string, pending: number, timeoutMs: number) {
    super(`${owner} disposal timed out after ${timeoutMs}ms with ${pending} unsettled decoder operation(s)`);
    this.name = "AssetDecoderDisposeTimeout";
    this.pending = pending;
    this.timeoutMs = timeoutMs;
  }
}

/** Validate an optional positive millisecond bound. */
export function decoderTimeoutMs(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number of milliseconds`);
  return value;
}

/**
 * Await tracked work (which must never reject) until the set is empty or the
 * deadline passes. Returns how many operations were still unsettled.
 */
export async function drainWithDeadline(pending: ReadonlySet<Promise<unknown>>, ms: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const deadline = new Promise<void>((resolve) => { timer = setTimeout(() => { expired = true; resolve(); }, ms); });
  try {
    while (pending.size && !expired) await Promise.race([Promise.all([...pending]), deadline]);
  } finally {
    clearTimeout(timer);
  }
  return pending.size;
}

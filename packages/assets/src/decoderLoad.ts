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
  constructor(decoderId: string, url: string) {
    super(`AssetDecoderUnavailable:${decoderId}:${url}`);
    this.name = "AssetDecoderUnavailable";
    this.decoderId = decoderId;
    this.url = url;
  }
}

/** Shared bound on decoder module loads (script, wasm fetch, emscripten init). */
export const DECODER_LOAD_TIMEOUT_MS = 30_000;

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

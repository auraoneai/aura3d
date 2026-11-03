/**
 * Run the bounded SPZ Zstandard decoder away from the caller's event loop.
 * Each invocation owns a worker so cancellation also releases its WASM heap.
 */
const WASM_MEMORY_LIMIT = 2 ** 31;
const WASM_MEMORY_HEADROOM = 32 * 1024 * 1024;

export async function decompressZstdFallback(
  bytes: Uint8Array,
  expectedBytes: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error("SPZ Zstandard input is empty or invalid");
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || bytes.byteLength + expectedBytes > WASM_MEMORY_LIMIT - WASM_MEMORY_HEADROOM) {
    throw new RangeError("SPZ Zstandard input and output exceed the decoder memory limit");
  }
  if (typeof Worker === "undefined") throw new Error("SPZ Zstandard decompression requires a module worker");

  let worker: Worker;
  try {
    const manifest = (globalThis as typeof globalThis & { [key: symbol]: unknown })[Symbol.for("@aura3d/worker-assets")] as { readonly zstdWorker?: string } | undefined;
    worker = manifest?.zstdWorker
      ? new Worker(manifest.zstdWorker, { type: "module" })
      : new Worker(new URL("../workers/zstd.worker.js", import.meta.url), { type: "module" });
  } catch (cause) {
    throw new Error("SPZ Zstandard module worker could not be started", { cause });
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = (): void => fail(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
    worker.onmessage = (event: MessageEvent<unknown>): void => {
      if (settled) return;
      const data = event.data as { ok?: unknown; output?: unknown; message?: unknown } | null;
      if (data?.ok === false) {
        fail(new Error(`SPZ Zstandard decompression failed: ${typeof data.message === "string" ? data.message : "invalid stream"}`));
      } else if (data?.ok !== true || !(data.output instanceof ArrayBuffer) || data.output.byteLength !== expectedBytes) {
        fail(new Error("SPZ Zstandard worker returned an invalid stream size"));
      } else {
        settled = true;
        cleanup();
        resolve(new Uint8Array(data.output));
      }
    };
    worker.onerror = (event: ErrorEvent): void => {
      event.preventDefault();
      fail(new Error("SPZ Zstandard module worker failed to load or run"));
    };
    worker.onmessageerror = (): void => fail(new Error("SPZ Zstandard worker returned an unreadable response"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }

    try {
      // An SPZ stream is a view into the caller's file: transfer a copy so the
      // caller's buffer and other attribute streams are never detached.
      const copy = new Uint8Array(bytes);
      worker.postMessage({ input: copy.buffer, expectedBytes }, [copy.buffer]);
    } catch (error) {
      fail(error);
    }
  });
}

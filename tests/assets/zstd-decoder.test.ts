import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Worker as ThreadWorker } from "node:worker_threads";
import { constants, zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decompressZstdFallback } from "../../packages/assets/src/loaders/ZstdDecoder";
import { decodeZstdReference } from "../../packages/assets/src/workers/zstd.worker";

const workerAssets = Symbol.for("@aura3d/worker-assets");
const previousManifest = Object.getOwnPropertyDescriptor(globalThis, workerAssets);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (previousManifest) Object.defineProperty(globalThis, workerAssets, previousManifest);
  else Reflect.deleteProperty(globalThis, workerAssets);
});

describe("bounded reference Zstandard decoder", () => {
  const source = Uint8Array.from({ length: 8192 }, (_, index) => (index % 23) + 1);

  it("retains the pinned upstream binary and full original notices", () => {
    const workerSource = readFileSync(new URL("../../packages/assets/src/workers/zstd.worker.ts", import.meta.url), "utf8");
    const license = readFileSync(new URL("../../packages/assets/vendor/zstd/LICENSE.txt", import.meta.url), "utf8").trimEnd();
    const provenance = JSON.parse(readFileSync(new URL("../../packages/assets/vendor/zstd/provenance.json", import.meta.url), "utf8"));
    const literal = /^const WASM_PACKAGE = (".*");$/m.exec(workerSource)?.[1];
    expect(literal).toBeDefined();
    const packaged = JSON.parse(literal!);
    const marker = "\n--AURA3D-ZSTD-WASM--\n";
    const [embeddedLicense, binary] = packaged.split(marker);
    expect(embeddedLicense).toBe(license);
    const decoded = Buffer.from(binary, "base64");
    expect(decoded.byteLength).toBe(54394);
    expect(createHash("sha256").update(decoded).digest("hex")).toBe("8b093c4c144273776d511f3baaa0fec32c111500c2798cb4569a71479020e72a");
    expect(provenance.wasmSha256).toBe("8b093c4c144273776d511f3baaa0fec32c111500c2798cb4569a71479020e72a");
  });

  it("decodes compressed blocks with checksums and frames without declared content size", async () => {
    const checksummed = zstdCompressSync(source, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    const unknownSize = zstdCompressSync(source, { params: { [constants.ZSTD_c_contentSizeFlag]: 0 } });
    expect(unknownSize[4]! & 0xe0).toBe(0);
    expect(await decodeZstdReference(checksummed, source.byteLength)).toEqual(source);
    expect(await decodeZstdReference(unknownSize, source.byteLength)).toEqual(source);
  });

  it("rejects truncated frames, corrupt checksums and both output-size mismatches", async () => {
    const input = zstdCompressSync(source, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    const corrupted = Uint8Array.from(input);
    corrupted[corrupted.length - 1] ^= 0xff;
    await expect(decodeZstdReference(input.subarray(0, input.length - 2), source.length)).rejects.toThrow(/invalid|truncated/);
    await expect(decodeZstdReference(corrupted, source.length)).rejects.toThrow(/invalid/);
    await expect(decodeZstdReference(input, source.length - 1)).rejects.toThrow(/invalid/);
    await expect(decodeZstdReference(input, source.length + 1)).rejects.toThrow(/decoded size/);
    await expect(decodeZstdReference(input, 2 ** 31)).rejects.toThrow(/memory limit/);
  });

  it("does not allocate the advertised history window for a one-shot frame", async () => {
    // One raw byte, no content-size field, with a 1 GiB declared window.
    const input = Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0xa0, 0x09, 0, 0, 0x41]);
    const instantiate = vi.spyOn(WebAssembly, "instantiate");
    expect(await decodeZstdReference(input, 1)).toEqual(Uint8Array.of(0x41));
    const result = await (instantiate.mock.results[0]!.value as Promise<WebAssembly.WebAssemblyInstantiatedSource>);
    expect((result.instance.exports.memory as WebAssembly.Memory).buffer.byteLength).toBe(16_908_288);
  });

  it("reports unavailable WebAssembly explicitly", async () => {
    vi.spyOn(WebAssembly, "instantiate").mockRejectedValue(new Error("blocked"));
    await expect(decodeZstdReference(Uint8Array.of(1), 1)).rejects.toThrow(/unsupported or blocked by CSP/);
  });
});

class MockWorker {
  static instances: MockWorker[] = [];
  readonly url: string | URL;
  readonly options?: WorkerOptions;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  input?: ArrayBuffer;
  expectedBytes?: number;
  terminated = false;

  constructor(url: string | URL, options?: WorkerOptions) {
    this.url = url;
    this.options = options;
    MockWorker.instances.push(this);
  }
  postMessage(message: { input: ArrayBuffer; expectedBytes: number }): void {
    this.input = message.input;
    this.expectedBytes = message.expectedBytes;
  }
  terminate(): void { this.terminated = true; }
}

describe("Zstandard worker ownership", () => {
  it("copies a caller-owned subarray before transfer and checks the result", async () => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
    const backing = Uint8Array.of(9, 1, 2, 8);
    const result = decompressZstdFallback(backing.subarray(1, 3), 2);
    const worker = MockWorker.instances[0]!;
    expect(worker.options?.type).toBe("module");
    expect(String(worker.url)).toMatch(/zstd\.worker\.js$/);
    expect(worker.input).not.toBe(backing.buffer);
    expect(new Uint8Array(worker.input!)).toEqual(Uint8Array.of(1, 2));
    worker.onmessage!({ data: { ok: true, output: Uint8Array.of(3, 4).buffer } } as MessageEvent);
    expect(await result).toEqual(Uint8Array.of(3, 4));
    expect(worker.terminated).toBe(true);
    expect(backing).toEqual(Uint8Array.of(9, 1, 2, 8));
  });

  it("uses the packaged worker URL when supplied by the render-worker manifest", async () => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(globalThis, workerAssets, { value: { zstdWorker: "https://example.test/codecs/zstd.js" }, configurable: true });
    const result = decompressZstdFallback(Uint8Array.of(1), 1);
    const worker = MockWorker.instances[0]!;
    expect(worker.url).toBe("https://example.test/codecs/zstd.js");
    worker.onmessage!({ data: { ok: true, output: Uint8Array.of(7).buffer } } as MessageEvent);
    expect(await result).toEqual(Uint8Array.of(7));
    expect(worker.terminated).toBe(true);
  });

  it("terminates promptly on abort and rejects malformed worker output", async () => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
    const controller = new AbortController();
    const aborted = decompressZstdFallback(Uint8Array.of(1), 1, controller.signal);
    const worker = MockWorker.instances[0]!;
    const reason = new Error("cancelled by caller");
    controller.abort(reason);
    await expect(aborted).rejects.toBe(reason);
    expect(worker.terminated).toBe(true);

    const malformed = decompressZstdFallback(Uint8Array.of(1), 2);
    const next = MockWorker.instances[1]!;
    next.onmessage!({ data: { ok: true, output: Uint8Array.of(1).buffer } } as MessageEvent);
    await expect(malformed).rejects.toThrow(/invalid stream size/);
    expect(next.terminated).toBe(true);
  });

  it("fails explicitly when workers are unavailable or cannot start", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(decompressZstdFallback(Uint8Array.of(1), 1)).rejects.toThrow(/requires a module worker/);
    vi.stubGlobal("Worker", class { constructor() { throw new Error("blocked"); } });
    await expect(decompressZstdFallback(Uint8Array.of(1), 1)).rejects.toThrow(/could not be started/);
  });

  it("terminates workers that report a codec error or an unreadable message", async () => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker);
    const codecFailure = decompressZstdFallback(Uint8Array.of(1), 1);
    const first = MockWorker.instances[0]!;
    first.onmessage!({ data: { ok: false, message: "bad checksum" } } as MessageEvent);
    await expect(codecFailure).rejects.toThrow(/bad checksum/);
    expect(first.terminated).toBe(true);
    const messageFailure = decompressZstdFallback(Uint8Array.of(1), 1);
    const second = MockWorker.instances[1]!;
    second.onmessageerror!({} as MessageEvent);
    await expect(messageFailure).rejects.toThrow(/unreadable response/);
    expect(second.terminated).toBe(true);
  });

  it("runs the real decoder across a worker boundary and preserves the caller's input", async () => {
    const workerModule = new URL("../../packages/assets/src/workers/zstd.worker.ts", import.meta.url).href;
    const shim = `
      import { parentPort } from "node:worker_threads";
      globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
      globalThis.addEventListener = (_type, listener) => parentPort.on("message", data => listener({ data }));
      await import(${JSON.stringify(workerModule)});
    `;
    class WorkerThreadAdapter {
      static instances: WorkerThreadAdapter[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      private readonly thread = new ThreadWorker(new URL(`data:text/javascript,${encodeURIComponent(shim)}`));
      terminated?: Promise<number>;
      constructor() {
        WorkerThreadAdapter.instances.push(this);
        this.thread.on("message", (data) => this.onmessage?.({ data } as MessageEvent));
        this.thread.on("error", (error) => this.onerror?.({ message: error.message, preventDefault() {} } as ErrorEvent));
        this.thread.on("messageerror", () => this.onmessageerror?.({} as MessageEvent));
      }
      postMessage(message: unknown, transfer: ArrayBuffer[]): void { this.thread.postMessage(message, transfer); }
      terminate(): void { this.terminated = this.thread.terminate(); }
    }
    vi.stubGlobal("Worker", WorkerThreadAdapter);
    const original = Uint8Array.from({ length: 4096 }, (_, i) => i % 17);
    const compressed = zstdCompressSync(original);
    const envelope = Uint8Array.from([10, ...compressed, 20]);
    const decoded = await decompressZstdFallback(envelope.subarray(1, -1), original.length);
    expect(decoded).toEqual(original);
    expect(envelope[0]).toBe(10);
    expect(envelope[envelope.length - 1]).toBe(20);
    await WorkerThreadAdapter.instances[0]!.terminated;

    const controller = new AbortController();
    const pending = decompressZstdFallback(compressed, original.length, controller.signal);
    const reason = new Error("stop worker");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(WorkerThreadAdapter.instances[1]!.terminated).toBeDefined();
    await WorkerThreadAdapter.instances[1]!.terminated;
  });
});

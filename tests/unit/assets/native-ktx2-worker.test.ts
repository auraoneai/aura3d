import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { transcodeKTX2BasisTexture } from "../../../packages/assets/src/KTX2BasisTextureTranscoder";
import { createKTX2TranscodeWorkerPool, type KTX2TranscodeWorkerPool } from "../../../packages/assets/src/KTX2TranscodeWorker";
import { auraDecodersPlugin } from "../../../packages/assets/src/vite/auraDecoders";

const origin = "https://worker-test.invalid";
const base = "/shop/aura-decoders/basis/";
const encoded = new Uint8Array(readFileSync(new URL("../../assets/native-fixtures/ktx2-red-4x4.ktx2", import.meta.url)));

type Middleware = (req: { url?: string; method?: string }, res: {
  statusCode: number;
  setHeader: (key: string, value: string) => void;
  end: (body?: unknown) => void;
}, next: () => void) => void;

function request(handler: Middleware, url: string) {
  return new Promise<{ status: number; headers: Record<string, string>; body: unknown }>((resolve) => {
    const headers: Record<string, string> = {};
    const response = {
      statusCode: 0,
      setHeader(key: string, value: string) { headers[key.toLowerCase()] = value; },
      end(body?: unknown) { resolve({ status: response.statusCode, headers, body }); }
    };
    handler({ url, method: "GET" }, response, () => resolve({ status: 404, headers, body: undefined }));
  });
}

interface ProtocolMessage {
  type: string;
  id: number;
  buffer?: ArrayBuffer;
  wasmBinary?: ArrayBuffer;
  scriptUrl?: string;
  result?: { levels: Array<{ data: Uint8Array }> };
  error?: string;
}

let middleware: Middleware;
let workerSource: string;
let codecSource: string;
const pools: KTX2TranscodeWorkerPool[] = [];

beforeAll(async () => {
  // Exercise the actual same-origin development response. In a source checkout
  // the plugin transforms the worker in memory; no app build is involved.
  const plugin = auraDecodersPlugin({ codecs: ["basis"] });
  plugin.configResolved({ command: "serve", base: "/shop/" });
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const [worker, codec] = await Promise.all([
    request(middleware, `${base}ktx2.worker.js`),
    request(middleware, `${base}basis_transcoder.js`)
  ]);
  expect([worker.status, codec.status]).toEqual([200, 200]);
  expect(worker.headers["content-type"]).toBe("text/javascript");
  workerSource = String(worker.body);
  codecSource = String(codec.body);
});

afterEach(() => {
  for (const pool of pools.splice(0)) pool.dispose();
  vi.unstubAllGlobals();
});

/**
 * A worker-shaped message transport for the actual served worker JavaScript.
 * The codec and worker run in a separate VM realm; structuredClone transfers
 * buffers and message delivery remains asynchronous. No browser is simulated.
 */
function installWorkerTransport(options: { holdResults?: boolean; holdCancel?: boolean } = {}) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  class ServedWorker {
    static instances: ServedWorker[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    readonly sent: Array<{ type: string; id: number; bytes?: number; transfers: number; scriptUrl?: string }> = [];
    readonly received: Array<{ type: string; id: number; transferBytes: number[] }> = [];
    readonly heldResults: Array<() => void> = [];
    readonly heldCancels: Array<() => void> = [];
    readonly importedScripts: string[] = [];
    terminated = false;
    closed = false;
    holdResults = options.holdResults ?? false;
    holdCancel = options.holdCancel ?? false;
    private readonly scope: Record<string, unknown>;

    constructor(readonly url: string) {
      if (new URL(url, origin).href !== `${origin}${base}ktx2.worker.js`) throw new Error(`Unexpected worker URL: ${url}`);
      ServedWorker.instances.push(this);
      const scope: Record<string, unknown> = {
        Uint8Array, ArrayBuffer, WebAssembly, TextDecoder, TextEncoder, URL, console, setTimeout, clearTimeout,
        location: { href: `${origin}${base}ktx2.worker.js`, origin },
        close: () => { this.closed = true; },
        postMessage: (message: ProtocolMessage, transfer: ArrayBuffer[] = []) => {
          const transferBytes = transfer.map((buffer) => buffer.byteLength);
          const delivered = structuredClone(message, { transfer });
          this.received.push({ type: delivered.type, id: delivered.id, transferBytes });
          const deliver = () => { if (!this.terminated) this.onmessage?.({ data: delivered } as MessageEvent); };
          if (delivered.type === "transcode" && this.holdResults) this.heldResults.push(deliver);
          else setTimeout(deliver, 0);
        }
      };
      scope.self = scope;
      const context = createContext(scope);
      scope.importScripts = (url: string) => {
        const resolved = new URL(url, `${origin}${base}ktx2.worker.js`).href;
        if (resolved !== `${origin}${base}basis_transcoder.js`) throw new Error(`Unexpected codec URL: ${resolved}`);
        this.importedScripts.push(resolved);
        runInContext(codecSource, context);
      };
      runInContext(workerSource, context);
      this.scope = scope;
    }

    postMessage(message: ProtocolMessage, transfer: ArrayBuffer[] = []): void {
      const bytes = message.buffer?.byteLength ?? message.wasmBinary?.byteLength;
      const delivered = structuredClone(message, { transfer });
      this.sent.push({ type: delivered.type, id: delivered.id, bytes, transfers: transfer.length, scriptUrl: delivered.scriptUrl });
      const dispatch = () => {
        if (!this.terminated && !this.closed) {
          (this.scope.onmessage as (event: { data: ProtocolMessage }) => void)({ data: delivered });
        }
      };
      if (delivered.type === "cancel" && this.holdCancel) this.heldCancels.push(dispatch);
      else setTimeout(dispatch, 0);
    }

    terminate(): void { this.terminated = true; }
  }

  vi.stubGlobal("location", { href: `${origin}/shop/index.html`, origin });
  vi.stubGlobal("Worker", ServedWorker);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, origin);
    if (url.origin !== origin) throw new Error(`Unexpected cross-origin request: ${url.href}`);
    requests.push({ url: url.pathname, init });
    const response = await request(middleware, url.pathname);
    const body = typeof response.body === "string" ? response.body
      : response.body instanceof Uint8Array ? Uint8Array.from(response.body) : undefined;
    return new Response(body, { status: response.status, headers: response.headers });
  });
  return { ServedWorker, requests };
}

function pool(limits: Parameters<typeof createKTX2TranscodeWorkerPool>[2] = {}) {
  const value = createKTX2TranscodeWorkerPool(base, 1, limits);
  pools.push(value);
  return value;
}

describe("served KTX2 worker protocol", () => {
  it("transcodes the independent fixture and its RGBA fallback through the served worker", async () => {
    expect(createHash("sha256").update(encoded).digest("hex")).toBe("50e9c1550c9b1e94c6e9f5ac66858241d57bf75e56e82f0af045c1cc56d506e8");
    const { ServedWorker, requests } = installWorkerTransport();
    const shared = pool();
    const input = encoded.slice();
    const texture = await transcodeKTX2BasisTexture(input, { targetFormat: "bc1-rgb-unorm", workerPool: shared });
    const worker = ServedWorker.instances[0]!;

    expect([texture.width, texture.height, texture.format]).toEqual([4, 4, "bc1-rgb-unorm"]);
    expect(texture.data?.byteLength).toBe(8);
    expect(texture.fallbackData?.byteLength).toBe(64);
    for (let i = 0; i < texture.fallbackData!.length; i += 4) {
      expect(texture.fallbackData![i]).toBeGreaterThan(180);
      expect(texture.fallbackData![i + 1]).toBeLessThan(75);
      expect(texture.fallbackData![i + 2]).toBeLessThan(75);
      expect(texture.fallbackData![i + 3]).toBe(255);
    }
    expect(input).toEqual(encoded);
    expect(worker.sent.map(({ type }) => type)).toEqual(["init", "transcode", "transcode"]);
    expect(worker.sent.every(({ transfers }) => transfers === 1)).toBe(true);
    expect(worker.sent.slice(1).map(({ bytes }) => bytes)).toEqual([encoded.byteLength, encoded.byteLength]);
    expect(worker.received.filter(({ type }) => type === "transcode").map(({ transferBytes }) => transferBytes)).toEqual([[8], [64]]);
    expect(worker.importedScripts).toEqual([`${origin}${base}basis_transcoder.js`]);
    expect(requests.map(({ url }) => url)).toEqual([`${base}basis_transcoder.js`, `${base}basis_transcoder.wasm`]);
    expect(requests.every(({ init }) => init?.credentials === "same-origin" && init.mode === "same-origin" && init.redirect === "error")).toBe(true);

    // A caller-owned pool survives one transcode and is terminated on disposal.
    await expect(shared.transcode({ bytes: encoded, transcoderFormat: 13 })).resolves.toMatchObject({ width: 4, height: 4 });
    shared.dispose();
    expect(worker.terminated).toBe(true);
    await expect(shared.transcode({ bytes: encoded, transcoderFormat: 13 })).rejects.toThrow(/disposed/i);
  }, 10_000);

  it("returns worker errors for oversized or malformed output and remains usable", async () => {
    const { ServedWorker } = installWorkerTransport();
    const decoder = pool({ maxOutputBytes: 32 });
    await expect(decoder.transcode({ bytes: encoded, transcoderFormat: 13 })).rejects.toThrow(/output exceeds byte limit/i);
    await expect(decoder.transcode({ bytes: new Uint8Array([1, 2, 3, 4]), transcoderFormat: 13 })).rejects.toThrow(/invalid|unsupported/i);
    const compressed = await decoder.transcode({ bytes: encoded, transcoderFormat: 2 });
    expect(compressed.levels[0]?.data.byteLength).toBe(8);
    expect(ServedWorker.instances).toHaveLength(1);
    expect(ServedWorker.instances[0]!.received.map(({ type }) => type)).toEqual(["ready", "error", "error", "transcode"]);
  }, 10_000);

  it("honors configured same-origin worker assets and disposes the temporary pool", async () => {
    const { ServedWorker, requests } = installWorkerTransport();
    const assets = {
      basisWorker: `${origin}${base}ktx2.worker.js`,
      basisScript: `${origin}${base}basis_transcoder.js`,
      basisModule: `${origin}${base}basis_transcoder.mjs`,
      basisWasm: `${origin}${base}basis_transcoder.wasm`,
      dracoModule: `${origin}/shop/aura-decoders/draco/draco_decoder.mjs`,
      dracoWasm: `${origin}/shop/aura-decoders/draco/draco_decoder.wasm`,
      meshoptModule: `${origin}/shop/aura-decoders/meshopt/meshopt_decoder.mjs`
    };
    const decoded = await transcodeKTX2BasisTexture(encoded, {
      targetFormat: "rgba8", transcoderUrl: base, workerCount: 1, workerAssets: assets
    });
    expect(decoded.data?.byteLength).toBe(64);
    expect(ServedWorker.instances).toHaveLength(1);
    const worker = ServedWorker.instances[0]!;
    expect(worker.url).toBe(assets.basisWorker);
    expect(worker.sent[0]?.scriptUrl).toBe(assets.basisScript);
    expect(worker.importedScripts).toEqual([assets.basisScript]);
    expect(requests.map(({ url }) => url)).toEqual([`${base}basis_transcoder.js`, `${base}basis_transcoder.wasm`]);
    expect(worker.terminated).toBe(true);
  }, 10_000);

  it("rejects active work and ignores a late result when the pool is disposed", async () => {
    const { ServedWorker } = installWorkerTransport({ holdResults: true });
    const decoder = pool();
    const pending = decoder.transcode({ bytes: encoded, transcoderFormat: 13 });
    const outcome = pending.catch((error: Error) => error);
    await vi.waitFor(() => expect(ServedWorker.instances[0]?.heldResults).toHaveLength(1));
    const worker = ServedWorker.instances[0]!;
    decoder.dispose();
    expect(await outcome).toMatchObject({ message: expect.stringMatching(/disposed/i) });
    expect(worker.terminated).toBe(true);
    worker.heldResults.shift()!();
    await expect(decoder.transcode({ bytes: encoded, transcoderFormat: 13 })).rejects.toThrow(/disposed/i);
  }, 10_000);

  it("rejects foreign codec scripts and acknowledges explicit worker teardown", async () => {
    const { ServedWorker } = installWorkerTransport();
    const worker = new ServedWorker(`${base}ktx2.worker.js`);
    const replies: ProtocolMessage[] = [];
    worker.onmessage = (event) => { replies.push(event.data as ProtocolMessage); };
    const wasm = new ArrayBuffer(8);
    worker.postMessage({ type: "init", id: 11, wasmBinary: wasm, scriptUrl: "https://outside.invalid/basis.js" }, [wasm]);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies[0]).toMatchObject({ type: "error", id: 11, error: expect.stringMatching(/same-origin/i) });
    expect(worker.importedScripts).toEqual([]);
    worker.postMessage({ type: "dispose", id: 12 });
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    expect(replies[1]).toEqual({ type: "disposed", id: 12 });
    expect(worker.closed).toBe(true);
  });

  it("waits for the served worker's cancellation acknowledgement before reusing its slot", async () => {
    const { ServedWorker } = installWorkerTransport({ holdResults: true, holdCancel: true });
    const decoder = pool({ cancelTimeoutMs: 2000 });
    const controller = new AbortController();
    const first = decoder.transcode({ bytes: encoded, transcoderFormat: 13, signal: controller.signal });
    const firstOutcome = first.catch((error: Error) => error);
    await vi.waitFor(() => expect(ServedWorker.instances[0]?.heldResults).toHaveLength(1));
    const worker = ServedWorker.instances[0]!;
    const activeId = worker.sent.find(({ type }) => type === "transcode")!.id;
    const second = decoder.transcode({ bytes: encoded, transcoderFormat: 13 });
    controller.abort();
    expect(worker.heldCancels).toHaveLength(1);
    worker.heldResults.shift()!(); // The completed result raced with abort.
    await Promise.resolve();
    expect(worker.sent.filter(({ type }) => type === "transcode")).toHaveLength(1);
    worker.holdResults = false;
    worker.heldCancels.shift()!(); // Deliver cancel to the actual worker entry.
    expect(await firstOutcome).toMatchObject({ name: "AbortError" });
    expect(worker.received).toContainEqual({ type: "cancelled", id: activeId, transferBytes: [] });
    expect((await second).levels[0]?.data.byteLength).toBe(64);
    expect(worker.sent.filter(({ type }) => type === "transcode")).toHaveLength(2);
  }, 10_000);
});

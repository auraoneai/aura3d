/**
 * PRD-05 T0-21 (05-S3S4 part 2) — decoder loads must fail closed instead of
 * hanging. A 404'd wasm, or a wasm URL answered with an SPA `index.html` 200,
 * rejects with `AssetDecoderUnavailable` inside the load timeout; an emscripten
 * abort inside `BASIS()` rejects instead of leaving `onRuntimeInitialized`
 * pending forever.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetDecoderUnavailable } from "@aura3d/assets/contracts";
import { looksLikeWasmBinary, withDecoderTimeout } from "../../../packages/assets/src/decoderLoad";
import { createKTX2TranscodeWorkerPool } from "../../../packages/assets/src/KTX2TranscodeWorker";
import { loadBasisTranscoderModule } from "../../../packages/assets/src/KTX2BasisTextureTranscoder";

const HTML_BODY = "<!doctype html><html><head><title>spa</title></head></html>";
const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer;

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: unknown) => Promise.resolve(handler(String(input)))));
}

function workerPoolRequest() {
  return { bytes: new Uint8Array(16), transcoderFormat: 0 } as const;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("looksLikeWasmBinary", () => {
  it("accepts the wasm magic header", () => {
    expect(looksLikeWasmBinary(WASM_MAGIC)).toBe(true);
  });

  it("rejects an SPA index.html served as wasm", () => {
    expect(looksLikeWasmBinary(new TextEncoder().encode(HTML_BODY).buffer as ArrayBuffer)).toBe(false);
    expect(looksLikeWasmBinary(new ArrayBuffer(0))).toBe(false);
  });
});

describe("withDecoderTimeout", () => {
  it("rejects a load that never settles", async () => {
    await expect(withDecoderTimeout(new Promise(() => {}), "stub decoder", 25)).rejects.toThrow(/timed out/);
  });

  it("passes through a load that settles in time", async () => {
    await expect(withDecoderTimeout(Promise.resolve(7), "stub decoder", 25)).resolves.toBe(7);
  });
});

describe("createKTX2TranscodeWorkerPool init failures", () => {
  it("a 404 wasm rejects with AssetDecoderUnavailable, not a hang", async () => {
    stubFetch((url) =>
      url.endsWith(".wasm")
        ? new Response("not found", { status: 404 })
        : new Response("// basis_transcoder.js stub", { status: 200 })
    );
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1);
    await expect(pool.transcode({ ...workerPoolRequest() })).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    pool.dispose();
  });

  it("a wasm URL answered with index.html 200 rejects with AssetDecoderUnavailable", async () => {
    stubFetch((url) =>
      url.endsWith(".wasm")
        ? new Response(HTML_BODY, { status: 200 })
        : new Response("// basis_transcoder.js stub", { status: 200 })
    );
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1);
    await expect(pool.transcode({ ...workerPoolRequest() })).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    pool.dispose();
  });

  it("a js URL answered with index.html 200 rejects with AssetDecoderUnavailable", async () => {
    stubFetch((url) =>
      url.endsWith(".js")
        ? new Response(HTML_BODY, { status: 200 })
        : new Response(WASM_MAGIC, { status: 200 })
    );
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1);
    await expect(pool.transcode({ ...workerPoolRequest() })).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    pool.dispose();
  });
});

describe("loadBasisTranscoderModule (browser path)", () => {
  it("script 404 rejects instead of hanging", async () => {
    const fakeScript: Record<string, unknown> = {};
    vi.stubGlobal("document", {
      createElement: () => fakeScript,
      head: { appendChild: () => queueMicrotask(() => (fakeScript.onerror as () => void)()) }
    });
    await expect(loadBasisTranscoderModule("/missing/basis/")).rejects.toThrow(/Failed to load/);
  });

  it("emscripten wasm abort rejects via onAbort instead of hanging", async () => {
    vi.stubGlobal("document", { createElement: () => ({}), head: { appendChild: () => {} } });
    vi.stubGlobal("BASIS", (moduleConfig: Record<string, unknown>) => {
      (moduleConfig.onAbort as (reason: unknown) => void)("Aborted(compile error: wasm 404)");
    });
    await expect(loadBasisTranscoderModule("/aborting/basis/")).rejects.toThrow(/basis_transcoder aborted/);
  });
});

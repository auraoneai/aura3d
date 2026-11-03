/**
 * PRD-05 T0-21 (05-S3S4 part 2) — decoder loads must fail closed instead of
 * hanging. A 404'd wasm, or a wasm URL answered with an SPA `index.html` 200,
 * rejects with `AssetDecoderUnavailable` inside the load timeout; an emscripten
 * abort inside `BASIS()` rejects instead of leaving `onRuntimeInitialized`
 * pending forever.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AssetDecoderUnavailable } from "@aura3d/assets/contracts";
import { looksLikeWasmBinary, withDecoderTimeout } from "../../../packages/assets/src/decoderLoad";
import { createKTX2TranscodeWorkerPool } from "../../../packages/assets/src/KTX2TranscodeWorker";
import { loadBasisTranscoderModule } from "../../../packages/assets/src/KTX2BasisTextureTranscoder";
import { dropSharedGLTFDecoderRegistry, sharedGLTFDecoderRegistry } from "../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";
import { createAppAssetDecoders } from "../../../packages/engine/src/agent-api/AssetDecoders";

const HTML_BODY = "<!doctype html><html><head><title>spa</title></head></html>";
const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer;
const temporaryCodecRoots: string[] = [];

function stubModuleWorkerCodecs(): string {
  const root = mkdtempSync(path.join(tmpdir(), "aura-worker-codec-"));
  temporaryCodecRoots.push(root);
  for (const family of ["basis", "draco", "meshopt"]) mkdirSync(path.join(root, family));
  writeFileSync(path.join(root, "basis", "basis_transcoder.mjs"), `
    export default (config) => {
      globalThis.__codecCalls.push(["basis", config.locateFile("basis_transcoder.wasm")]);
      config.initializeBasis = () => globalThis.__codecCalls.push(["basis-initialized"]);
      queueMicrotask(() => config.onRuntimeInitialized());
      return Promise.resolve(config);
    };
  `);
  writeFileSync(path.join(root, "draco", "draco_decoder.mjs"), `
    export default (config) => {
      globalThis.__codecCalls.push(["draco", config.locateFile("draco_decoder_gltf.wasm")]);
      return Promise.resolve({ dispose: () => globalThis.__codecCalls.push(["draco-disposed"]) });
    };
  `);
  writeFileSync(path.join(root, "meshopt", "meshopt_decoder.mjs"), `
    globalThis.__codecCalls.push(["meshopt"]);
    export const MeshoptDecoder = { ready: Promise.resolve(), decodeGltfBuffer() {} };
  `);
  vi.stubGlobal("__codecCalls", []);
  // Models a dedicated module worker even in implementations where the
  // legacy importScripts member is absent entirely.
  vi.stubGlobal("WorkerGlobalScope", class { static [Symbol.hasInstance](value: unknown) { return value === globalThis; } });
  return root;
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: unknown) => Promise.resolve(handler(String(input)))));
}

function workerPoolRequest() {
  return { bytes: new Uint8Array(16), transcoderFormat: 0 } as const;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of temporaryCodecRoots.splice(0)) rmSync(root, { recursive: true, force: true });
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

  it("releases a partial module if initialization resolves after its timeout", async () => {
    vi.useFakeTimers();
    try {
      let config!: Record<string, unknown>;
      const dispose = vi.fn();
      vi.stubGlobal("document", { createElement: () => ({}), head: { appendChild: () => {} } });
      vi.stubGlobal("BASIS", (value: Record<string, unknown>) => { config = value; });
      const pending = loadBasisTranscoderModule("/basis-timeout/");
      const rejected = expect(pending).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(30_001);
      await rejected;
      config.dispose = dispose;
      (config.onRuntimeInitialized as () => void)();
      await vi.advanceTimersByTimeAsync(0);
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("decoder loading in a dedicated worker-shaped global", () => {
  const capabilities = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;

  it("keeps an explicit codec base ahead of packaged worker URLs", async () => {
    const { installWorkerAssetsFromUrl, workerUrlWithAssets } = await import("../../../packages/core/src/workerAssets");
    const assets = {
      vfx1024: "https://aura.invalid/assets/vfx1.png", vfx2048: "https://aura.invalid/assets/vfx2.png",
      humanoid: "https://aura.invalid/assets/humanoid.glb", retargetWorker: "https://aura.invalid/assets/retarget.js",
      basisScript: "https://aura.invalid/assets/basis.js", basisModule: "https://aura.invalid/assets/basis.mjs",
      basisWasm: "https://aura.invalid/assets/basis.wasm", basisWorker: "https://aura.invalid/assets/ktx2.js",
      dracoModule: "https://aura.invalid/assets/draco.mjs", dracoWasm: "https://aura.invalid/assets/draco.wasm",
      meshoptModule: "https://aura.invalid/assets/meshopt.mjs"
    };
    const release = installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://aura.invalid/assets/render.js"), assets).href);
    const scripts: string[] = [];
    vi.stubGlobal("importScripts", (url: string) => {
      scripts.push(url);
      vi.stubGlobal("DracoDecoderModule", (config: { locateFile(file: string): string }) => {
        expect(config.locateFile("draco_decoder_gltf.wasm")).toBe("/explicit/codecs/draco/draco_decoder.wasm");
        return Promise.resolve({});
      });
    });
    const registry = createAppAssetDecoders({ decoders: { basePath: "/explicit/codecs/" } }, capabilities, { maxTextureSize: 1024 });
    try {
      expect((await registry.require(["draco"])).draco).toBeTypeOf("function");
      expect(scripts).toEqual(["/explicit/codecs/draco/draco_decoder.js"]);
    } finally { registry.dispose(); release(); }
  });

  it("loads classic worker factories via same-origin importScripts", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    const calls: string[] = [];
    const dispose = vi.fn();
    const initialize = vi.fn();
    const importScripts = vi.fn((url: string) => {
      calls.push(url);
      if (url.endsWith("draco_decoder.js")) {
        vi.stubGlobal("DracoDecoderModule", (config: { locateFile(file: string): string }) => {
          expect(config.locateFile("draco_decoder_gltf.wasm")).toBe("/classic/draco/draco_decoder.wasm");
          return Promise.resolve({ dispose });
        });
      } else {
        vi.stubGlobal("BASIS", (config: Record<string, unknown>) => {
          expect((config.locateFile as (file: string) => string)("basis_transcoder.wasm")).toBe("/classic/basis/basis_transcoder.wasm");
          config.initializeBasis = initialize;
          queueMicrotask(() => (config.onRuntimeInitialized as () => void)());
          return Promise.resolve(config);
        });
      }
    });
    vi.stubGlobal("importScripts", importScripts);
    const registry = createAssetDecoderRegistry({ basePath: "/classic/", capabilities, maxTextureSize: 64, workerCount: 1 });
    const decoders = await registry.require(["draco", "ktx2"]);
    expect(decoders.draco).toBeTypeOf("function");
    expect(decoders.imageDecoder).toBeTypeOf("function");
    expect(calls).toEqual(["/classic/draco/draco_decoder.js", "/classic/basis/basis_transcoder.js"]);
    expect(initialize).toHaveBeenCalledOnce();
    registry.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each(["throws", "absent"] as const)("loads same-origin ESM when importScripts is %s in a module worker", async (mode) => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    const root = stubModuleWorkerCodecs();
    const legacyImport = vi.fn(() => { throw new TypeError("importScripts is unavailable in module workers"); });
    vi.stubGlobal("importScripts", mode === "throws" ? legacyImport : undefined);
    const registry = createAssetDecoderRegistry({ basePath: `${root}/`, capabilities, maxTextureSize: 64, workerCount: 1 });
    const decoders = await registry.require(["draco", "ktx2", "meshopt"]);
    expect(decoders.draco).toBeTypeOf("function");
    expect(decoders.imageDecoder).toBeTypeOf("function");
    expect(decoders.meshopt).toBeTypeOf("function");
    expect((globalThis as unknown as { __codecCalls: unknown[] }).__codecCalls).toEqual([
      ["draco", `${root}/draco/draco_decoder.wasm`],
      ["basis", `${root}/basis/basis_transcoder.wasm`], ["basis-initialized"], ["meshopt"]
    ]);
    if (mode === "throws") expect(legacyImport.mock.calls).toHaveLength(2);
    registry.dispose();
    expect((globalThis as unknown as { __codecCalls: unknown[] }).__codecCalls).toContainEqual(["draco-disposed"]);
  });

  it("does not mask a classic worker script load failure with a module fallback", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    const importScripts = vi.fn(() => { throw new Error("script missing"); });
    vi.stubGlobal("importScripts", importScripts);
    const registry = createAssetDecoderRegistry({ basePath: "/broken/", capabilities, maxTextureSize: 64, workerCount: 1 });
    await expect(registry.require(["draco"])).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    expect(importScripts).toHaveBeenCalledTimes(2);
    registry.dispose();
  });
});

describe("WorkerAssetJobs bounded ownership", () => {
  it("reuses a cancelled local pipeline slot only after late work and rollback finish", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let finishStage!: (value: string) => void;
    let finishRollback!: () => void;
    const started: string[] = [];
    const rollback = vi.fn(() => new Promise<void>((resolve) => { finishRollback = resolve; }));
    const pipeline = new ImportPipeline().addStage<string, string>({
      name: "decode",
      run(input) {
        started.push(input);
        return input === "first" ? new Promise((resolve) => { finishStage = resolve; }) : input;
      },
      rollback
    });
    const jobs = new WorkerAssetJobs(pipeline, undefined, { maxConcurrent: 1, maxQueued: 1 });
    const controller = new AbortController();
    const first = jobs.run({ id: "first", url: "first", input: "first", signal: controller.signal });
    const firstRejected = expect(first).rejects.toThrow(/aborted/);
    const second = jobs.run({ id: "second", url: "second", input: "second" });
    controller.abort();
    await firstRejected;
    expect(jobs.diagnostics()).toMatchObject({ active: 1, queued: 1 });
    finishStage("late");
    await vi.waitFor(() => expect(rollback).toHaveBeenCalledOnce());
    expect(started).toEqual(["first"]);
    finishRollback();
    await expect(second).resolves.toBe("second");
    expect(started).toEqual(["first", "second"]);
    await jobs.dispose();
  });

  it("does not reuse a local pipeline slot when rollback fails", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let finishStage!: (value: string) => void;
    const pipeline = new ImportPipeline().addStage<string, string>({
      name: "decode",
      run: () => new Promise((resolve) => { finishStage = resolve; }),
      rollback: () => { throw new Error("rollback failed"); }
    });
    const jobs = new WorkerAssetJobs(pipeline, undefined, { maxConcurrent: 1, maxQueued: 0, cleanupTimeoutMs: 20 });
    const controller = new AbortController();
    const pending = jobs.run({ id: "first", url: "first", input: "first", signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow(/aborted/);
    controller.abort();
    await rejected;
    finishStage("late");
    await vi.waitFor(() => expect(jobs.diagnostics()).toMatchObject({ active: 1, cleanupFailures: 1 }));
    await expect(jobs.run({ id: "next", url: "next", input: "next" })).rejects.toThrow(/queue is full/);
    await expect(jobs.dispose()).rejects.toThrow(/cleanup/);
  });

  it("bounds concurrent and queued work, rejects duplicate IDs, and drains in FIFO order", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    const started: string[] = [];
    const resolve = new Map<string, (value: string) => void>();
    const jobs = new WorkerAssetJobs(new ImportPipeline(), {
      run: (job) => new Promise((done) => { started.push(job.id); resolve.set(job.id, done as (value: string) => void); }) as never
    }, { maxConcurrent: 1, maxQueued: 1 });
    const first = jobs.run({ id: "first", url: "first", input: null });
    const second = jobs.run({ id: "second", url: "second", input: null });
    await expect(jobs.run({ id: "first", url: "other", input: null })).rejects.toThrow(/already exists/);
    await expect(jobs.run({ id: "third", url: "third", input: null })).rejects.toThrow(/queue is full/);
    expect(started).toEqual(["first"]);
    expect(jobs.diagnostics()).toMatchObject({ active: 1, queued: 1 });
    resolve.get("first")!("one");
    await expect(first).resolves.toBe("one");
    // The second job starts after the first has relinquished its slot.
    await vi.waitFor(() => expect(started).toEqual(["first", "second"]));
    resolve.get("second")!("two");
    await expect(second).resolves.toBe("two");
    await jobs.dispose();
  });

  it("keeps the slot reserved and the caller pending until cancellation is acknowledged", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let acknowledge!: () => void;
    let complete!: (result: { close: () => void }) => void;
    const closed = vi.fn();
    const cancel = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    const run = vi.fn(() => new Promise((resolve) => { complete = resolve; }) as never);
    const jobs = new WorkerAssetJobs(new ImportPipeline(), { run, cancel }, { maxConcurrent: 1, maxQueued: 1 });
    const controller = new AbortController();
    const first = jobs.run({ id: "first", url: "first", input: null, signal: controller.signal });
    const outcome = first.then(() => "resolved", () => "rejected");
    controller.abort();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith("first"));
    let settled = false;
    void outcome.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(jobs.diagnostics().active).toBe(1);
    // A late result must be closed before the acknowledged cancellation frees the slot.
    complete({ close: closed });
    await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
    expect(jobs.diagnostics().active).toBe(1);
    acknowledge();
    await expect(first).rejects.toThrow(/aborted: first/);
    await vi.waitFor(() => expect(jobs.diagnostics().active).toBe(0));
    await jobs.dispose();
  });

  it("removes an aborted queued job without sending it to the runner", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    const releases = new Map<string, (value: string) => void>();
    const run = vi.fn((job: { id: string }) => new Promise((resolve) => { releases.set(job.id, resolve as (value: string) => void); }) as never);
    const jobs = new WorkerAssetJobs(new ImportPipeline(), { run }, { maxConcurrent: 1, maxQueued: 1 });
    const first = jobs.run({ id: "active", url: "x", input: null });
    const controller = new AbortController();
    const queued = jobs.run({ id: "queued", url: "x", input: null, signal: controller.signal });
    controller.abort();
    await expect(queued).rejects.toThrow(/aborted: queued/);
    const next = jobs.run({ id: "next", url: "x", input: null });
    releases.get("active")!("one");
    await expect(first).resolves.toBe("one");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run.mock.calls.map(([job]) => job.id)).toEqual(["active", "next"]);
    releases.get("next")!("two");
    await expect(next).resolves.toBe("two");
    await jobs.dispose();
  });

  it("does not reuse a slot when cancellation is not acknowledged", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let complete!: (value: string) => void;
    const disposed = vi.fn();
    const jobs = new WorkerAssetJobs(new ImportPipeline(), {
      run: () => new Promise((resolve) => { complete = resolve as (value: string) => void; }) as never,
      cancel: () => new Promise<void>(() => {}),
      dispose: disposed
    }, { maxConcurrent: 1, maxQueued: 0, cleanupTimeoutMs: 20 });
    const controller = new AbortController();
    const pending = jobs.run({ id: "stuck", url: "x", input: null, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow(/cancellation: stuck timed out/);
    expect(jobs.diagnostics().active).toBe(1);
    await expect(jobs.run({ id: "next", url: "next", input: null })).rejects.toThrow(/queue is full/);
    await jobs.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(jobs.diagnostics()).toMatchObject({ active: 0, disposed: true });
    complete("discarded");
  });

  it("keeps legacy worker capacity until its discarded result is cleaned up", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let complete!: (value: string) => void;
    let finishCleanup!: () => void;
    const cleanup = vi.fn(() => new Promise<void>((resolve) => { finishCleanup = resolve; }));
    const run = vi.fn(() => new Promise((resolve) => { complete = resolve as (value: string) => void; }) as never);
    const jobs = new WorkerAssetJobs(new ImportPipeline(), { run, disposeResult: cleanup }, { maxConcurrent: 1, maxQueued: 1 });
    const controller = new AbortController();
    const first = jobs.run({ id: "legacy", url: "x", input: null, signal: controller.signal });
    controller.abort();
    await expect(first).rejects.toThrow(/aborted/);
    const second = jobs.run({ id: "next", url: "x", input: null });
    expect(run).toHaveBeenCalledTimes(1);
    complete("unused");
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledWith("unused"));
    expect(run).toHaveBeenCalledTimes(1);
    finishCleanup();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    complete("accepted");
    await expect(second).resolves.toBe("accepted");
    await jobs.dispose();
  });

  it("rejects a cancellation hook that does not return an acknowledgement", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    const jobs = new WorkerAssetJobs(new ImportPipeline(), {
      run: () => new Promise(() => {}) as never,
      cancel: (() => undefined) as unknown as (id: string) => Promise<void>,
      dispose: () => {}
    }, { maxConcurrent: 1, maxQueued: 0 });
    const controller = new AbortController();
    const pending = jobs.run({ id: "unacknowledged", url: "x", input: null, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow(/was not acknowledged/);
    expect(jobs.diagnostics().active).toBe(1);
    await jobs.dispose();
    expect(jobs.diagnostics().active).toBe(0);
  });

  it("reports failed disposal of an unclaimed result and does not silently recycle the slot", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let complete!: (value: object) => void;
    let acknowledge!: () => void;
    const jobs = new WorkerAssetJobs(new ImportPipeline(), {
      run: () => new Promise((resolve) => { complete = resolve as (value: object) => void; }) as never,
      cancel: () => new Promise<void>((resolve) => { acknowledge = resolve; }),
      disposeResult: () => { throw new Error("image close failed"); },
      dispose: () => {}
    }, { maxConcurrent: 1, maxQueued: 0 });
    const controller = new AbortController();
    const pending = jobs.run({ id: "bad-cleanup", url: "x", input: null, signal: controller.signal });
    controller.abort();
    await vi.waitFor(() => expect(acknowledge).toBeTypeOf("function"));
    complete({});
    await expect(pending).rejects.toThrow(/result cleanup failed: image close failed/);
    acknowledge();
    expect(jobs.diagnostics()).toMatchObject({ active: 1, cleanupFailures: 1 });
    await expect(jobs.dispose()).rejects.toThrow(/result cleanup failed: image close failed/);
  });

  it("rejects queued jobs on disposal and awaits runner cleanup", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    let finishDispose!: () => void;
    const jobs = new WorkerAssetJobs(new ImportPipeline(), {
      run: () => new Promise(() => {}) as never,
      dispose: () => new Promise<void>((resolve) => { finishDispose = resolve; })
    }, { maxConcurrent: 1, maxQueued: 1 });
    const first = jobs.run({ id: "active", url: "x", input: null });
    const queued = jobs.run({ id: "queued", url: "x", input: null });
    const firstRejection = expect(first).rejects.toThrow(/aborted/);
    const queuedRejection = expect(queued).rejects.toThrow(/aborted/);
    const disposal = jobs.dispose();
    await vi.waitFor(() => expect(finishDispose).toBeTypeOf("function"));
    let disposed = false;
    void disposal.then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);
    finishDispose();
    await disposal;
    await Promise.all([firstRejection, queuedRejection]);
    await expect(jobs.run({ id: "late", url: "x", input: null })).rejects.toThrow(/disposed/);
  });

  it("reports cleanup failure for an uncooperative legacy runner instead of claiming disposal", async () => {
    const { WorkerAssetJobs } = await import("../../../packages/assets/src/WorkerAssetJobs");
    const { ImportPipeline } = await import("../../../packages/assets/src/ImportPipeline");
    const jobs = new WorkerAssetJobs(new ImportPipeline(), {
      run: () => new Promise(() => {}) as never
    }, { maxConcurrent: 1, cleanupTimeoutMs: 20 });
    const pending = jobs.run({ id: "legacy", url: "x", input: null });
    const rejected = expect(pending).rejects.toThrow(/aborted/);
    await expect(jobs.dispose()).rejects.toThrow(/cleanup timed out/);
    await rejected;
    expect(jobs.diagnostics().active).toBe(1);
  });
});

describe("KTX2 same-origin worker pool", () => {
  type Message = { type: string; id: number; buffer?: ArrayBuffer };
  class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    readonly sent: Message[] = [];
    terminated = false;
    constructor(readonly url: string) { FakeWorker.instances.push(this); }
    postMessage(message: Message): void {
      this.sent.push(message);
      if (message.type === "init") queueMicrotask(() => this.receive({ type: "ready", id: 0 }));
    }
    receive(data: object): void { this.onmessage?.({ data } as MessageEvent); }
    terminate(): void { this.terminated = true; }
  }
  function setWorkerFetch(failWasm = false) {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(
      url.endsWith(".wasm")
        ? new Response(failWasm ? "missing" : WASM_MAGIC.slice(0), { status: failWasm ? 404 : 200, headers: { "content-type": "application/wasm" } })
        : new Response("var BASIS = function() {};", { headers: { "content-type": "text/javascript" } })
    )));
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.instances = [];
  }
  const result = { width: 1, height: 1, isUASTC: true, hasAlpha: true, levels: [{ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) }] };

  it("uses independently hashed same-origin worker, codec and wasm URLs", async () => {
    setWorkerFetch();
    const assets = {
      basisScript: "https://aura.invalid/assets/basis-123.js", basisModule: "https://aura.invalid/assets/basis-123.mjs",
      basisWasm: "https://aura.invalid/assets/basis-123.wasm", basisWorker: "https://aura.invalid/assets/ktx2-123.js",
      dracoModule: "https://aura.invalid/assets/draco-123.mjs", dracoWasm: "https://aura.invalid/assets/draco-123.wasm",
      meshoptModule: "https://aura.invalid/assets/meshopt-123.mjs"
    };
    const pool = createKTX2TranscodeWorkerPool("/unused/basis/", 1, {}, assets);
    const controller = new AbortController();
    const pending = pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13, signal: controller.signal });
    const outcome = pending.catch((error: Error) => error);
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    expect(worker.url).toBe(assets.basisWorker);
    expect(worker.sent.find((message) => message.type === "init")).toMatchObject({ scriptUrl: assets.basisScript });
    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual([assets.basisScript, assets.basisWasm]);
    const job = worker.sent.find((message) => message.type === "transcode")!;
    controller.abort();
    worker.receive({ type: "cancelled", id: job.id });
    expect(await outcome).toMatchObject({ name: "AbortError" });
    pool.dispose();
    expect(worker.terminated).toBe(true);
    expect(() => createKTX2TranscodeWorkerPool("/safe/basis/", 1, {}, { ...assets, basisWorker: "https://foreign.invalid/worker.js" })).toThrow(/same-origin/);
  });

  it("bounds outstanding input, sends only the view, and drains queued jobs", async () => {
    setWorkerFetch();
    const pool = createKTX2TranscodeWorkerPool("/nested/aura-decoders/basis/", 1, { maxJobs: 2, maxPendingBytes: 8 });
    const backing = new Uint8Array([9, 1, 2, 3, 9]);
    const first = pool.transcode({ bytes: backing.subarray(1, 4), transcoderFormat: 13 });
    const second = pool.transcode({ bytes: new Uint8Array([4, 5, 6]), transcoderFormat: 13 });
    await expect(pool.transcode({ bytes: new Uint8Array([7]), transcoderFormat: 13 })).rejects.toThrow(/queue is full/);
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    expect(worker.url).toBe("/nested/aura-decoders/basis/ktx2.worker.js");
    const firstMessage = worker.sent.find((message) => message.type === "transcode")!;
    expect([...new Uint8Array(firstMessage.buffer!)]).toEqual([1, 2, 3]);
    expect([...backing]).toEqual([9, 1, 2, 3, 9]);
    worker.receive({ type: "transcode", id: firstMessage.id, result });
    await expect(first).resolves.toEqual(result);
    const messages = worker.sent.filter((message) => message.type === "transcode");
    expect(messages).toHaveLength(2);
    worker.receive({ type: "transcode", id: messages[1]!.id, result });
    await expect(second).resolves.toEqual(result);
    pool.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("holds cancelled active work until acknowledged even when a result races", async () => {
    setWorkerFetch();
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1);
    const controller = new AbortController();
    const first = pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13, signal: controller.signal });
    const firstOutcome = first.then(() => "resolved", () => "rejected");
    const second = pool.transcode({ bytes: new Uint8Array([2]), transcoderFormat: 13 });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    const job = worker.sent.find((message) => message.type === "transcode")!;
    controller.abort();
    worker.receive({ type: "transcode", id: job.id, result });
    let settled = false;
    void firstOutcome.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(worker.sent.filter((message) => message.type === "transcode")).toHaveLength(1);
    worker.receive({ type: "cancelled", id: job.id });
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const next = worker.sent.filter((message) => message.type === "transcode")[1]!;
    worker.receive({ type: "transcode", id: next.id, result });
    await expect(second).resolves.toEqual(result);
    pool.dispose();
  });

  it("terminates an unresponsive cancelled worker and starts a replacement", async () => {
    setWorkerFetch();
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1, { cancelTimeoutMs: 10 });
    const controller = new AbortController();
    const first = pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13, signal: controller.signal });
    const firstRejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    controller.abort();
    await firstRejected;
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    const second = pool.transcode({ bytes: new Uint8Array([2]), transcoderFormat: 13 });
    await vi.waitFor(() => expect(FakeWorker.instances[1]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const replacement = FakeWorker.instances[1]!;
    const job = replacement.sent.find((message) => message.type === "transcode")!;
    replacement.receive({ type: "transcode", id: job.id, result });
    await expect(second).resolves.toEqual(result);
    pool.dispose();
    expect(replacement.terminated).toBe(true);
  });

  it("evicts failed initialization and retries without recreating the pool", async () => {
    setWorkerFetch(true);
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1);
    await expect(pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13 })).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    setWorkerFetch();
    const retry = pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13 });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    worker.receive({ type: "transcode", id: worker.sent.find((message) => message.type === "transcode")!.id, result });
    await expect(retry).resolves.toEqual(result);
    pool.dispose();
  });

  it("forwards cancellation from the public transcoder and terminates its temporary pool", async () => {
    const { readFileSync } = await import("node:fs");
    const { transcodeKTX2BasisTexture } = await import("../../../packages/assets/src/KTX2BasisTextureTranscoder");
    setWorkerFetch();
    const controller = new AbortController();
    const bytes = new Uint8Array(readFileSync("tests/assets/native-fixtures/ktx2-red-4x4.ktx2"));
    const pending = transcodeKTX2BasisTexture(bytes, { targetFormat: "rgba8", signal: controller.signal, workerCount: 1 });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    const id = worker.sent.find((message) => message.type === "transcode")!.id;
    controller.abort();
    expect(worker.sent).toContainEqual({ type: "cancel", id });
    worker.receive({ type: "cancelled", id });
    await rejected;
    expect(worker.terminated).toBe(true);
  });

  it("passes image cancellation to a registry-owned worker and terminates it on registry disposal", async () => {
    const { readFileSync } = await import("node:fs");
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    setWorkerFetch();
    const registry = createAssetDecoderRegistry({ basePath: "/aura-decoders/", capabilities: { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false }, maxTextureSize: 64, workerCount: 1 });
    const decoder = (await registry.require(["ktx2"])).imageDecoder!;
    const bytes = new Uint8Array(readFileSync("tests/assets/native-fixtures/ktx2-red-4x4.ktx2"));
    const controller = new AbortController();
    const pending = decoder({ mimeType: "image/ktx2", data: bytes.buffer } as never, 0, {} as never, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    const id = worker.sent.find((message) => message.type === "transcode")!.id;
    controller.abort();
    expect(worker.sent).toContainEqual({ type: "cancel", id });
    worker.receive({ type: "cancelled", id });
    await rejected;
    expect(worker.terminated).toBe(false);
    registry.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("loads Basis in a module worker before creating and cancelling its nested classic worker", async () => {
    const { readFileSync } = await import("node:fs");
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    setWorkerFetch();
    const root = stubModuleWorkerCodecs();
    vi.stubGlobal("importScripts", undefined);
    const registry = createAssetDecoderRegistry({ basePath: `${root}/`, capabilities: { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false }, maxTextureSize: 64, workerCount: 1 });
    const decoder = (await registry.require(["ktx2"])).imageDecoder!;
    const bytes = new Uint8Array(readFileSync("tests/assets/native-fixtures/ktx2-red-4x4.ktx2"));
    const controller = new AbortController();
    const pending = decoder({ mimeType: "image/ktx2", data: bytes.buffer } as never, 0, {} as never, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    const worker = FakeWorker.instances[0]!;
    expect(worker.url).toBe(`${root}/basis/ktx2.worker.js`);
    const id = worker.sent.find((message) => message.type === "transcode")!.id;
    controller.abort();
    expect(worker.sent).toContainEqual({ type: "cancel", id });
    worker.receive({ type: "cancelled", id });
    await rejected;
    registry.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("cancels abandoned initialization and isolates a new attempt from late fetches", async () => {
    setWorkerFetch();
    const waiting: Array<(response: Response) => void> = [];
    const fetch = vi.fn((url: string, options: RequestInit) => {
      if (fetch.mock.calls.length <= 2) return new Promise<Response>((resolve) => { waiting.push(resolve); });
      return Promise.resolve(url.endsWith(".wasm")
        ? new Response(WASM_MAGIC.slice(0), { headers: { "content-type": "application/wasm" } })
        : new Response("var BASIS = function() {};", { headers: { "content-type": "text/javascript" } }));
    });
    vi.stubGlobal("fetch", fetch);
    const pool = createKTX2TranscodeWorkerPool("/abandoned/basis/", 1);
    const controller = new AbortController();
    const abandoned = pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13, signal: controller.signal });
    const rejected = expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    expect(waiting).toHaveLength(2);
    const oldSignal = fetch.mock.calls[0]![1].signal as AbortSignal;
    controller.abort();
    await rejected;
    expect(oldSignal.aborted).toBe(true);
    const next = pool.transcode({ bytes: new Uint8Array([2]), transcoderFormat: 13 });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.sent.some((message) => message.type === "transcode")).toBe(true));
    waiting[0]!(new Response("var BASIS = function() {};", { headers: { "content-type": "text/javascript" } }));
    waiting[1]!(new Response(WASM_MAGIC.slice(0), { headers: { "content-type": "application/wasm" } }));
    const worker = FakeWorker.instances[0]!;
    worker.receive({ type: "transcode", id: worker.sent.find((message) => message.type === "transcode")!.id, result });
    await expect(next).resolves.toEqual(result);
    expect(FakeWorker.instances).toHaveLength(1);
    pool.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("rejects a fetch that ignores abort after the bounded initialization timeout", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1, { initializeTimeoutMs: 10 });
    await expect(pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13 })).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    pool.dispose();
  });

  it("rejects cross-origin and traversal URLs before any network operation", () => {
    expect(() => createKTX2TranscodeWorkerPool("https://elsewhere.invalid/basis/", 1)).toThrow(/same-origin/);
    expect(() => createKTX2TranscodeWorkerPool("/safe/%2e%2e/basis/", 1)).toThrow(/traversal/);
    expect(() => createKTX2TranscodeWorkerPool("/safe%2fbasis/", 1)).toThrow(/encoding/);
  });
});

describe("KTX2 output budgets and cleanup", () => {
  it("refuses an excessive decoded allocation and closes and deletes the codec file", async () => {
    const { transcodeKTX2Levels } = await import("../../../packages/assets/src/KTX2TranscodeDriver");
    const close = vi.fn();
    const remove = vi.fn();
    const transcode = vi.fn(() => true);
    const file = {
      isValid: () => true, isUASTC: () => true, isETC1S: () => false, getWidth: () => 4, getHeight: () => 4,
      getLayers: () => 1, getLevels: () => 1, getFaces: () => 1, getHasAlpha: () => true,
      getImageLevelInfo: () => ({ width: 4, height: 4, origWidth: 4, origHeight: 4 }),
      getImageTranscodedSizeInBytes: () => 64, startTranscoding: () => true, transcodeImage: transcode,
      close, delete: remove
    };
    const basis = { initializeBasis: () => {}, KTX2File: class { constructor() { return file; } } as unknown as new () => typeof file };
    expect(() => transcodeKTX2Levels(basis, new Uint8Array([1]), 13, undefined, 32)).toThrow(/byte limit/);
    expect(transcode).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("decoder registry retry and disposal", () => {
  const capabilities = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;
  it("probes the packaged decoder URLs in a module-worker scope", async () => {
    const { installWorkerAssetsFromUrl, workerUrlWithAssets } = await import("../../../packages/core/src/workerAssets");
    const { ensureCompressedTextureSupport } = await import("../../../packages/assets/src/KTX2BasisTextureTranscoder");
    const assets = {
      vfx1024: "https://aura.invalid/assets/vfx1.png", vfx2048: "https://aura.invalid/assets/vfx2.png",
      humanoid: "https://aura.invalid/assets/humanoid.glb", retargetWorker: "https://aura.invalid/assets/retarget.js",
      basisScript: "https://aura.invalid/assets/basis.js", basisModule: "https://aura.invalid/assets/basis.mjs",
      basisWasm: "https://aura.invalid/assets/basis.wasm", basisWorker: "https://aura.invalid/assets/ktx2.js",
      dracoModule: "https://aura.invalid/assets/draco.mjs", dracoWasm: "https://aura.invalid/assets/draco.wasm",
      meshoptModule: "https://aura.invalid/assets/meshopt.mjs"
    };
    const release = installWorkerAssetsFromUrl(workerUrlWithAssets(new URL("https://aura.invalid/assets/render.js"), assets).href);
    vi.stubGlobal("importScripts", () => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    try {
      const report = await ensureCompressedTextureSupport({ draco: true });
      expect([report.draco.available, report.meshopt.available, report.ktx2.available]).toEqual([true, true, true]);
      expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([assets.dracoModule, assets.dracoWasm, assets.meshoptModule, assets.basisModule, assets.basisWasm]));
    } finally { release(); }
  });

  it("does not share registries across different packaged codec URLs", () => {
    const workerAssets = {
      basisScript: "https://aura.invalid/assets/basis.js", basisModule: "https://aura.invalid/assets/basis.mjs",
      basisWasm: "https://aura.invalid/assets/basis.wasm", basisWorker: "https://aura.invalid/assets/ktx2.js",
      dracoModule: "https://aura.invalid/assets/draco.mjs", dracoWasm: "https://aura.invalid/assets/draco.wasm",
      meshoptModule: "https://aura.invalid/assets/meshopt.mjs"
    };
    const options = { basePath: "/aura-decoders/", capabilities, maxTextureSize: 64, workerCount: 1 };
    const explicit = sharedGLTFDecoderRegistry(options);
    const first = sharedGLTFDecoderRegistry({ ...options, workerAssets });
    const second = sharedGLTFDecoderRegistry({ ...options, workerAssets: { ...workerAssets, basisWasm: "https://aura.invalid/assets/new-basis.wasm" } });
    expect(first).not.toBe(explicit);
    expect(second).not.toBe(first);
    expect(sharedGLTFDecoderRegistry({ ...options, workerAssets })).toBe(first);
    for (const registry of [explicit, first, second]) { dropSharedGLTFDecoderRegistry(registry); registry.dispose(); }
  });

  it("cancels the last Basis subscriber, removes its script, and permits a fresh attempt", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    const scripts: Array<{ onload?: () => void; remove: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
      head: { appendChild: (script: typeof scripts[number]) => { scripts.push(script); } }
    });
    const options = { basePath: "/basis-cancel/", capabilities, maxTextureSize: 64, workerCount: 1 };
    const first = createAssetDecoderRegistry(options);
    const pending = first.require(["ktx2"]);
    const rejected = expect(pending).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    first.dispose();
    await rejected;
    await vi.waitFor(() => expect(scripts[0]?.remove).toHaveBeenCalledOnce());
    const second = createAssetDecoderRegistry(options);
    const retry = second.require(["ktx2"]);
    await vi.waitFor(() => expect(scripts).toHaveLength(2));
    vi.stubGlobal("BASIS", (config: Record<string, unknown>) => {
      config.initializeBasis = () => {};
      queueMicrotask(() => (config.onRuntimeInitialized as () => void)());
      return Promise.resolve(config);
    });
    scripts[1]!.onload!();
    await expect(retry).resolves.toMatchObject({ imageDecoder: expect.any(Function) });
    expect(scripts[1]!.remove).toHaveBeenCalledOnce();
    second.dispose();
  });

  it("retains shared Basis initialization until the remaining registry finishes", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    let script!: { onload?: () => void; remove: ReturnType<typeof vi.fn> };
    const appendChild = vi.fn((value: typeof script) => { script = value; });
    vi.stubGlobal("document", { createElement: () => ({ remove: vi.fn() }), head: { appendChild } });
    const options = { basePath: "/basis-shared/", capabilities, maxTextureSize: 64, workerCount: 1 };
    const first = createAssetDecoderRegistry(options);
    const second = createAssetDecoderRegistry(options);
    const one = first.require(["ktx2"]);
    const rejected = expect(one).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    const two = second.require(["ktx2"]);
    expect(appendChild).toHaveBeenCalledOnce();
    first.dispose();
    await rejected;
    expect(script.remove).not.toHaveBeenCalled();
    const initialized = vi.fn();
    vi.stubGlobal("BASIS", (config: Record<string, unknown>) => {
      config.initializeBasis = initialized;
      queueMicrotask(() => (config.onRuntimeInitialized as () => void)());
      return Promise.resolve(config);
    });
    script.onload!();
    await expect(two).resolves.toMatchObject({ imageDecoder: expect.any(Function) });
    expect(initialized).toHaveBeenCalledOnce();
    expect(script.remove).toHaveBeenCalledOnce();
    second.dispose();
  });

  it("releases an abandoned Basis module that initializes after the final subscriber leaves", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    let config!: Record<string, unknown>;
    const dispose = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({}), head: { appendChild: () => {} } });
    vi.stubGlobal("BASIS", (value: Record<string, unknown>) => { config = value; });
    const registry = createAssetDecoderRegistry({ basePath: "/basis-late/", capabilities, maxTextureSize: 64, workerCount: 1 });
    const pending = registry.require(["ktx2"]);
    const rejected = expect(pending).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    expect(config).toBeDefined();
    registry.dispose();
    await rejected;
    config.dispose = dispose;
    (config.onRuntimeInitialized as () => void)();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });

  it("cancels a pending script load and removes its element on disposal", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    const remove = vi.fn();
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({ remove }), head: { appendChild } });
    const registry = createAssetDecoderRegistry({ basePath: "/dispose-script/", capabilities, maxTextureSize: 64, workerCount: 1 });
    const loading = registry.require(["draco"]);
    const rejected = expect(loading).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    expect(appendChild).toHaveBeenCalledOnce();
    registry.dispose();
    await rejected;
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(appendChild).toHaveBeenCalledOnce();
  });

  it("retries after both initial attempts failed and frees script elements", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    let attempts = 0;
    const remove = vi.fn();
    const module = { TRIANGULAR_MESH: 0, Decoder: class {}, DecoderBuffer: class {}, Mesh: class {}, DracoFloat32Array: class {}, DracoInt32Array: class {} };
    const factory = vi.fn((_config: { locateFile(file: string): string }) => Promise.resolve(module));
    vi.stubGlobal("DracoDecoderModule", factory);
    vi.stubGlobal("document", {
      createElement: () => ({ remove }),
      head: { appendChild: (script: { onerror: () => void; onload: () => void }) => {
        attempts++;
        queueMicrotask(() => attempts <= 2 ? script.onerror() : script.onload());
      } }
    });
    const registry = createAssetDecoderRegistry({ basePath: "/retry/", capabilities, maxTextureSize: 64, workerCount: 1 });
    await expect(registry.require(["draco"])).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    await expect(registry.require(["draco"])).resolves.toMatchObject({ draco: expect.any(Function) });
    expect(attempts).toBe(3);
    expect(remove).toHaveBeenCalledTimes(3);
    expect(factory.mock.calls[0]![0].locateFile("draco_decoder_gltf.wasm")).toBe("/retry/draco/draco_decoder.wasm");
    registry.dispose();
  });

  it("disposes a decoder that finishes initialization after registry disposal", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    let complete!: (value: unknown) => void;
    const dispose = vi.fn();
    vi.stubGlobal("DracoDecoderModule", () => new Promise((resolve) => { complete = resolve; }));
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
      head: { appendChild: (script: { onload: () => void }) => queueMicrotask(() => script.onload()) }
    });
    const registry = createAssetDecoderRegistry({ basePath: "/late/", capabilities, maxTextureSize: 64, workerCount: 1 });
    const loading = registry.require(["draco"]);
    const rejected = expect(loading).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    registry.dispose();
    await rejected;
    expect(dispose).not.toHaveBeenCalled();
    complete({ TRIANGULAR_MESH: 0, Decoder: class {}, DecoderBuffer: class {}, Mesh: class {}, DracoFloat32Array: class {}, DracoInt32Array: class {}, dispose });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(registry.diagnostics().loaded).toEqual([]);
  });

  it("releases a decoder that arrives after its bounded initialization timed out", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    vi.useFakeTimers();
    try {
      const completions: Array<(value: unknown) => void> = [];
      const dispose = vi.fn();
      vi.stubGlobal("DracoDecoderModule", () => new Promise((resolve) => { completions.push(resolve); }));
      vi.stubGlobal("document", {
        createElement: () => ({ remove: vi.fn() }),
        head: { appendChild: (script: { onload: () => void }) => script.onload() }
      });
      const registry = createAssetDecoderRegistry({ basePath: "/late-timeout/", capabilities, maxTextureSize: 64, workerCount: 1 });
      const loading = registry.require(["draco"]);
      const rejected = expect(loading).rejects.toBeInstanceOf(AssetDecoderUnavailable);
      await vi.advanceTimersByTimeAsync(30_001);
      expect(completions).toHaveLength(2);
      completions[0]!({ dispose });
      await vi.advanceTimersByTimeAsync(0);
      expect(dispose).toHaveBeenCalledOnce();
      registry.dispose();
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("bounded decoder disposal (never-settling initializers)", () => {
  const capabilities = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;

  it("a never-settling Draco factory cannot hang registry disposal; a late module is released and dispose can complete", async () => {
    const { createAssetDecoderRegistry, AssetDecoderDisposeTimeout } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    let complete: ((value: unknown) => void) | undefined;
    const lateDispose = vi.fn();
    vi.stubGlobal("DracoDecoderModule", () => new Promise((resolve) => { complete = resolve; }));
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
      head: { appendChild: (script: { onload: () => void }) => queueMicrotask(() => script.onload()) }
    });
    const registry = createAssetDecoderRegistry({ basePath: "/never/", capabilities, maxTextureSize: 64, workerCount: 1, disposeTimeoutMs: 25 });
    const loading = registry.require(["draco"]);
    const rejected = expect(loading).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    const firstDisposal = registry.disposeAsync();
    await expect(firstDisposal).rejects.toBeInstanceOf(AssetDecoderDisposeTimeout);
    await expect(firstDisposal).rejects.toMatchObject({ code: "ASSET_DECODER_DISPOSE_TIMEOUT", pending: expect.any(Number) });
    await rejected;
    expect(registry.diagnostics()).toMatchObject({ disposal: "timed-out", loaded: [] });
    expect(registry.diagnostics().pendingOperations).toBeGreaterThan(0);
    await expect(registry.require(["draco"])).rejects.toBeInstanceOf(AssetDecoderUnavailable);
    // The abandoned factory finally settles: it is released, never installed.
    complete!({ dispose: lateDispose });
    await vi.waitFor(() => expect(lateDispose).toHaveBeenCalledOnce());
    await expect(registry.disposeAsync()).resolves.toBeUndefined();
    expect(registry.diagnostics()).toMatchObject({ disposal: "disposed", pendingOperations: 0, loaded: [] });
  });

  it("rejects a non-positive disposal bound", async () => {
    const { createAssetDecoderRegistry } = await import("../../../packages/assets/src/AssetDecoderRegistry");
    expect(() => createAssetDecoderRegistry({ basePath: "/x/", capabilities, maxTextureSize: 64, workerCount: 1, disposeTimeoutMs: 0 })).toThrow(RangeError);
    expect(() => createAssetDecoderRegistry({ basePath: "/x/", capabilities, maxTextureSize: 64, workerCount: 1, disposeTimeoutMs: Number.NaN })).toThrow(RangeError);
  });

  it("KTX2 pool disposal is bounded when a codec fetch ignores abort, and terminates its workers", async () => {
    const { AssetDecoderDisposeTimeout } = await import("../../../packages/assets/src/decoderLoad");
    vi.stubGlobal("Worker", class { terminate() {} postMessage() {} addEventListener() {} removeEventListener() {} });
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const pool = createKTX2TranscodeWorkerPool("/aura-decoders/basis/", 1, { initializeTimeoutMs: 60_000, disposeTimeoutMs: 25 });
    const job = pool.transcode({ bytes: new Uint8Array([1]), transcoderFormat: 13 });
    const jobRejected = expect(job).rejects.toBeInstanceOf(Error);
    const disposal = pool.disposeAsync();
    await expect(disposal).rejects.toBeInstanceOf(AssetDecoderDisposeTimeout);
    await jobRejected;
    await expect(pool.transcode({ bytes: new Uint8Array([2]), transcoderFormat: 13 })).rejects.toThrow(/disposed/);
  });
});

describe("independently generated real KTX2 bytes", () => {
  it("decodes the recorded red ETC1S sample through the real Basis codec", async () => {
    const { readFileSync } = await import("node:fs");
    const { transcodeKTX2BasisTexture } = await import("../../../packages/assets/src/KTX2BasisTextureTranscoder");
    const bytes = new Uint8Array(readFileSync("tests/assets/native-fixtures/ktx2-red-4x4.ktx2"));
    const result = await transcodeKTX2BasisTexture(bytes, { targetFormat: "rgba8" });
    expect([result.width, result.height, result.data?.length]).toEqual([4, 4, 64]);
    expect(result.data![0]).toBeGreaterThan(180);
    expect(result.data![1]).toBeLessThan(75);
    expect(result.data![2]).toBeLessThan(75);
    expect(result.data![3]).toBe(255);
  });
});

describe("actual KTX2 worker protocol", () => {
  it("initializes the codec, decodes the independent fixture, and acknowledges teardown", async () => {
    const { readFileSync } = await import("node:fs");
    const vm = await import("node:vm");
    const ts = await import("typescript");
    const source = readFileSync("packages/assets/src/workers/ktx2.worker.ts", "utf8");
    const workerJs = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const codecJs = readFileSync("packages/assets/vendor/basis/basis_transcoder.js", "utf8");
    const wasm = readFileSync("packages/assets/vendor/basis/basis_transcoder.wasm");
    const fixture = readFileSync("tests/assets/native-fixtures/ktx2-red-4x4.ktx2");
    const messages: Array<{ type: string; id: number; result?: { width: number; height: number; levels: Array<{ data: Uint8Array }> }; error?: string }> = [];
    let closed = false;
    const sandbox: Record<string, unknown> = {
      Uint8Array, ArrayBuffer, WebAssembly, TextDecoder, TextEncoder, URL, console, setTimeout, clearTimeout,
      location: { href: "https://example.invalid/assets/ktx2.worker.js", origin: "https://example.invalid" },
      postMessage: (message: typeof messages[number]) => { messages.push(message); },
      close: () => { closed = true; }
    };
    sandbox.self = sandbox;
    const context = vm.createContext(sandbox);
    sandbox.importScripts = (url: string) => {
      expect(url).toBe("https://example.invalid/assets/basis-hashed.js");
      vm.runInContext(codecJs, context);
    };
    vm.runInContext(workerJs, context);
    const send = sandbox.onmessage as (event: { data: unknown }) => void;
    send({ data: { type: "init", id: 0, scriptUrl: "https://example.invalid/assets/basis-hashed.js", wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) } });
    await vi.waitFor(() => expect(messages.find((message) => message.id === 0)?.type).toBe("ready"));
    send({ data: { type: "transcode", id: 7, buffer: fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength), transcoderFormat: 13 } });
    const answer = messages.find((message) => message.id === 7);
    expect(answer?.error).toBeUndefined();
    expect(answer?.type).toBe("transcode");
    expect([answer?.result?.width, answer?.result?.height, answer?.result?.levels[0]?.data.length]).toEqual([4, 4, 64]);
    expect(answer!.result!.levels[0]!.data[0]).toBeGreaterThan(180);
    send({ data: { type: "cancel", id: 7 } });
    expect(messages).toContainEqual({ type: "cancelled", id: 7 });
    send({ data: { type: "dispose", id: 8 } });
    expect(messages).toContainEqual({ type: "disposed", id: 8 });
    expect(closed).toBe(true);
  }, 10_000);
});

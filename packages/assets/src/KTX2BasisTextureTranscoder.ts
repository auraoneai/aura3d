import { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "./KTX2TargetSelection.js";
import type { TextureFormat } from "@aura3d/rendering";
import { decoderAbortReason, withDecoderTimeout } from "./decoderLoad.js";
import { basisTranscoderFormat, transcodeKTX2Levels, type BasisModuleLike, type KTX2TranscodedLevel } from "./KTX2TranscodeDriver.js";
import { createKTX2TranscodeWorkerPool, currentBundledDecoderAssets, isDecoderWorkerScope, loadDecoderWorkerFactory, normalizeDecoderAssetUrl, normalizeDecoderBasePath, type BundledWorkerDecoderAssets, type KTX2TranscodeWorkerPool } from "./KTX2TranscodeWorker.js";
import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";

export type { KTX2BasisTargetFormat };

export const MAX_KTX2_INPUT_BYTES = 64 * 1024 * 1024;

/**
 * Maps the transcode target to the render-side `TextureFormat` union
 * (C-16). BC1 RGB and RGBA have the same block layout but different alpha
 * semantics and must remain distinct through the renderer.
 */
export function ktx2TargetToTextureFormat(format: KTX2BasisTargetFormat): TextureFormat {
  return format;
}

export interface KTX2BasisTextureTranscoderOptions {
  /**
   * GPU target chosen by `selectKTX2TargetFormat` (or `"rgba8"` for the
   * CPU-fallback decode). Required — there is no silent ETC2 default.
   */
  readonly targetFormat: KTX2BasisTargetFormat;
  /** Returned on `DecodedGLTFImage.colorSpace` for the upload path. */
  readonly colorSpace?: "srgb" | "linear";
  /** Skip mip levels whose true dimensions exceed this (e.g. `maxTextureSize`). */
  readonly maxDimension?: number;
  /**
   * Same-origin directory holding `basis_transcoder.js`/`basis_transcoder.wasm`
   * (the vendored copy at `public/aura-decoders/basis/`). No CDN fallback.
   */
  readonly transcoderUrl?: string;
  /** Transcode an uncompressed RGBA8 copy alongside the compressed mips (on demand). */
  readonly includeFallback?: boolean;
  /** Worker pool size for browser transcoding (default 2). */
  readonly workerCount?: number;
  /** Cancel this request independently; an active worker is recycled only after cleanup. */
  readonly signal?: AbortSignal;
  /** A caller-owned pool may be reused across images; otherwise this call owns its pool. */
  readonly workerPool?: KTX2TranscodeWorkerPool;
  /** Exact packaged URLs for the owning worker; an explicit transcoder URL remains authoritative. */
  readonly workerAssets?: BundledWorkerDecoderAssets;
  /** Observe abandoned Basis or internally owned pool cleanup; caller-owned pools remain the caller's responsibility. */
  readonly onCleanupPending?: (cleanup: Promise<void>) => void;
}

export interface KTX2BasisTranscodedTexture {
  readonly width: number;
  readonly height: number;
  readonly format: KTX2BasisTargetFormat;
  readonly colorSpace: "srgb" | "linear";
  readonly data?: Uint8Array;
  readonly mipLevels?: readonly { readonly width: number; readonly height: number; readonly data: Uint8Array }[];
  readonly fallbackData?: Uint8Array;
  readonly fallbackMipLevels?: readonly { readonly width: number; readonly height: number; readonly data: Uint8Array }[];
  readonly isUASTC?: boolean;
  readonly hasAlpha?: boolean;
}

/** Vite replaces this build-scoped value; ordinary ESM has no `env` and keeps the root default. */
function defaultDecoderBasePath(): string {
  const base = (import.meta as ImportMeta & { env?: { AURA3D_DECODER_BASE_PATH?: unknown } }).env?.AURA3D_DECODER_BASE_PATH;
  return normalizeDecoderBasePath(typeof base === "string" ? base : "/aura-decoders/");
}
interface BasisModuleCacheEntry {
  readonly promise: Promise<BasisModuleLike>;
  readonly controller: AbortController;
  readonly cleanup: BasisModuleCleanup;
  subscribers: number;
  settled: boolean;
  failed: boolean;
}
interface BasisModuleCleanup {
  readonly pending: Set<Promise<void>>;
  readonly errors: unknown[];
}
const basisModuleCache = new Map<string, BasisModuleCacheEntry>();

function trackModuleCleanup(cleanup: BasisModuleCleanup, work: Promise<unknown>): void {
  const tracked = work.then(
    () => { cleanup.pending.delete(tracked); },
    (error: unknown) => { cleanup.pending.delete(tracked); cleanup.errors.push(error); }
  );
  cleanup.pending.add(tracked);
}

async function waitForModuleCleanup(entry: BasisModuleCacheEntry): Promise<void> {
  await entry.promise.catch(() => {});
  while (entry.cleanup.pending.size) await Promise.all([...entry.cleanup.pending]);
  if (entry.cleanup.errors.length) throw new AggregateError(entry.cleanup.errors, "Basis module cleanup failed");
}

function waitForModule<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" }));
  }
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" })); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (module) => { signal.removeEventListener("abort", abort); resolve(module); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); }
    );
    if (signal.aborted) abort();
  });
}

function releaseModule(module: unknown): void | PromiseLike<void> {
  if (!module || (typeof module !== "object" && typeof module !== "function")) return;
  const disposable = module as { dispose?: () => void | PromiseLike<void>; close?: () => void | PromiseLike<void> };
  if (typeof disposable.dispose === "function") return disposable.dispose();
  if (typeof disposable.close === "function") return disposable.close();
}

function releaseAbandonedModule(
  work: Promise<BasisModuleLike>,
  cleanup: BasisModuleCleanup,
  partial?: unknown,
  factory?: Promise<unknown>
): void {
  const release = async (): Promise<void> => {
    // An abort can reject initialization before the factory returns its owner.
    const [initialized, produced] = await Promise.all([
      work.then((module) => module, () => partial),
      factory?.catch(() => undefined)
    ]);
    const results = await Promise.allSettled(
      [...new Set([initialized, produced])].map(async (module) => { await releaseModule(module); })
    );
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (errors.length) throw new AggregateError(errors, "Basis module cleanup failed");
  };
  trackModuleCleanup(cleanup, release());
}

/**
 * Loads + initialises the vendored Basis transcoder module, once per
 * `transcoderUrl`. A main thread injects the UMD script; workers load the
 * same-origin UMD or its module variant, and Node uses the vendored copy.
 */
export function loadBasisTranscoderModule(
  transcoderUrl: string = `${defaultDecoderBasePath()}basis/`,
  signal?: AbortSignal,
  assets?: BundledWorkerDecoderAssets,
  /** @internal Report an abandoned shared attempt without delaying the subscriber's rejection. */
  onAbandonedCleanup?: (cleanup: Promise<void>) => void
): Promise<BasisModuleLike> {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" }));
  const base = normalizeDecoderBasePath(transcoderUrl);
  const key = assets ? JSON.stringify([base, normalizeDecoderAssetUrl(assets.basisModule), normalizeDecoderAssetUrl(assets.basisWasm)]) : base;
  let entry = basisModuleCache.get(key);
  if (!entry) {
    const controller = new AbortController();
    const cleanup: BasisModuleCleanup = { pending: new Set(), errors: [] };
    const promise = typeof document !== "undefined" ? loadBasisModuleBrowser(base, controller.signal, cleanup) : isDecoderWorkerScope() ? loadBasisModuleWorker(base, controller.signal, cleanup, assets) : loadBasisModuleNode(controller.signal, cleanup);
    entry = { promise, controller, cleanup, subscribers: 0, settled: false, failed: false };
    const attempt = entry;
    void promise.then(
      () => { attempt.settled = true; },
      () => { attempt.settled = true; attempt.failed = true; attempt.controller.abort(); if (basisModuleCache.get(key) === attempt) basisModuleCache.delete(key); }
    );
    basisModuleCache.set(key, entry);
  }
  const attempt = entry;
  attempt.subscribers++;
  return waitForModule(attempt.promise, signal).finally(() => {
    attempt.subscribers--;
    let abandoned = false;
    if (attempt.subscribers === 0 && !attempt.settled) {
      if (basisModuleCache.get(key) === attempt) basisModuleCache.delete(key);
      attempt.controller.abort();
      abandoned = true;
    }
    // A different subscriber owns an ongoing shared attempt. Only its last
    // departing subscriber (or subscribers to a failed attempt) drain it.
    if ((abandoned || attempt.failed) && onAbandonedCleanup) onAbandonedCleanup(waitForModuleCleanup(attempt));
  });
}

async function loadBasisModuleBrowser(base: string, signal: AbortSignal, cleanup: BasisModuleCleanup): Promise<BasisModuleLike> {
  const globalName = "BASIS";
  const globals = globalThis as typeof globalThis & { BASIS?: (config: Record<string, unknown>) => BasisModuleLike | Promise<BasisModuleLike> };
  if (typeof globals.BASIS !== "function") {
    const script = document.createElement("script");
    try {
      await withDecoderTimeout(
        waitForModule(new Promise<void>((resolve, reject) => {
          script.src = `${base}basis_transcoder.js`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load ${script.src}`));
          document.head.appendChild(script);
        }), signal),
        `script load ${base}basis_transcoder.js`
      );
    } finally {
      script.onload = null;
      script.onerror = null;
      script.remove?.();
    }
  }
  const BASIS = globals.BASIS;
  if (typeof BASIS !== "function") {
    throw new Error("basis_transcoder.js loaded but the BASIS global is missing");
  }
  return initializeBasisModule(BASIS, base, signal, cleanup);
}

async function loadBasisModuleWorker(base: string, signal: AbortSignal, cleanup: BasisModuleCleanup, assets?: BundledWorkerDecoderAssets): Promise<BasisModuleLike> {
  const loading = loadDecoderWorkerFactory(base, "basis_transcoder.js", "BASIS", assets?.basisModule);
  trackModuleCleanup(cleanup, loading.then(() => {}, () => {}));
  const factory = await withDecoderTimeout(waitForModule(loading, signal), `script load ${base}basis_transcoder`);
  if (typeof factory !== "function") throw new Error("basis_transcoder worker factory is missing");
  return initializeBasisModule(factory as (config: Record<string, unknown>) => unknown, base, signal, cleanup, assets);
}

async function initializeBasisModule(BASIS: (config: Record<string, unknown>) => unknown, base: string, signal: AbortSignal, cleanup: BasisModuleCleanup, assets?: BundledWorkerDecoderAssets): Promise<BasisModuleLike> {
  // Emscripten MODULARIZE: the object passed to BASIS() becomes the Module;
  // onRuntimeInitialized fires asynchronously once the wasm is compiled. A
  // missing/SPA-fallback wasm aborts through onAbort — without it (and the
  // timeout) this promise never settled and require() hung.
  const moduleConfig: Record<string, unknown> = { locateFile: (file: string) => assets && file.endsWith(".wasm") ? normalizeDecoderAssetUrl(assets.basisWasm) : `${base}${file}` };
  if (signal.aborted) throw Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" });
  let factory: Promise<unknown> | undefined;
  const work = new Promise<BasisModuleLike>((resolve, reject) => {
    try {
      moduleConfig.onRuntimeInitialized = () => resolve(moduleConfig as unknown as BasisModuleLike);
      moduleConfig.onAbort = (reason: unknown) => reject(new Error(`basis_transcoder aborted: ${decoderAbortReason(reason)}`));
      const pending = BASIS(moduleConfig);
      factory = Promise.resolve(pending);
      void factory.catch(reject);
    } catch (error) {
      try {
        if (error instanceof Error) { reject(error); return; }
      } catch { /* A thrown proxy may not expose its prototype. */ }
      reject(new Error(decoderAbortReason(error)));
    }
  });
  try {
    const ready = Promise.all([work, factory]).then(([module]) => module);
    const module = await withDecoderTimeout(waitForModule(ready, signal), "basis_transcoder init");
    if (signal.aborted) throw Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" });
    module.initializeBasis();
    return module;
  } catch (error) {
    // The bounded waiter may have lost a race to an already-settled factory.
    // Drain the original initialization, not just the timed/cancelled waiter.
    releaseAbandonedModule(work, cleanup, moduleConfig, factory);
    throw error;
  }
}

interface NodeBuiltins {
  readonly fs: typeof import("node:fs");
  readonly module: typeof import("node:module");
  readonly url: typeof import("node:url");
  readonly path: typeof import("node:path");
}

// Computed specifiers: these loads are runtime-optional (Node fallback path)
// and must stay unresolvable to consumer bundlers at build time — the engine
// pack does not declare node builtins or `meshoptimizer` as dependencies.
async function nodeBuiltins(): Promise<NodeBuiltins> {
  const spec = (name: string) => `node:${name}`;
  const [fs, mod, url, path] = await Promise.all([import(spec("fs")), import(spec("module")), import(spec("url")), import(spec("path"))]);
  return {
    fs: fs as NodeBuiltins["fs"],
    module: mod as NodeBuiltins["module"],
    url: url as NodeBuiltins["url"],
    path: path as NodeBuiltins["path"]
  };
}

async function loadBasisModuleNode(signal: AbortSignal, cleanup: BasisModuleCleanup): Promise<BasisModuleLike> {
  const { fs, module: nodeModule, url: nodeUrl, path: nodePath } = await nodeBuiltins();
  if (signal.aborted) throw Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" });
  const { readFileSync, existsSync } = fs;
  const { createRequire } = nodeModule;
  const { fileURLToPath } = nodeUrl;
  const { dirname } = nodePath;
  const require2 = createRequire(import.meta.url);
  const candidates = [
    new URL("../vendor/basis/basis_transcoder.js", import.meta.url),
    new URL("../../vendor/basis/basis_transcoder.js", import.meta.url)
  ];
  const jsUrl = candidates.find((candidate) => existsSync(candidate));
  if (!jsUrl) throw new Error("vendored basis_transcoder.js not found next to @aura3d/assets");
  const wasmUrl = new URL("basis_transcoder.wasm", jsUrl);
  const jsPath = fileURLToPath(jsUrl);
  const code = readFileSync(jsUrl, "utf8");
  const box: { exports: Record<string, unknown> } = { exports: {} };
  new Function("module", "exports", "require", "__dirname", "__filename", code)(box, box.exports, require2, dirname(jsPath), jsPath);
  const BASIS = box.exports.BASIS ?? box.exports.default ?? box.exports;
  if (typeof BASIS !== "function") throw new Error("vendored basis_transcoder.js did not export BASIS");
  const configuration: Record<string, unknown> = { wasmBinary: existsSync(wasmUrl) ? readFileSync(wasmUrl) : undefined };
  let factory: Promise<unknown> | undefined;
  const work = new Promise<BasisModuleLike>((resolve, reject) => {
    let mod!: BasisModuleLike;
    configuration.onRuntimeInitialized = () => resolve(mod);
    configuration.onAbort = (reason: unknown) => reject(new Error(`basis_transcoder aborted: ${decoderAbortReason(reason)}`));
    const produced = (BASIS as (config: Record<string, unknown>) => unknown)(configuration);
    mod = (produced && typeof produced === "object" ? produced : box.exports) as unknown as BasisModuleLike;
    factory = Promise.resolve(produced);
    void factory.catch(reject);
  });
  try {
    const ready = Promise.all([work, factory]).then(([module]) => module);
    const module = await withDecoderTimeout(waitForModule(ready, signal), "basis_transcoder init");
    if (signal.aborted) throw Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" });
    module.initializeBasis();
    return module;
  } catch (error) {
    releaseAbandonedModule(work, cleanup, configuration, factory);
    throw error;
  }
}

/**
 * Transcodes a KTX2/Basis texture to `options.targetFormat` using the vendored
 * Basis transcoder. In browsers with `Worker` the transcode runs in the
 * same-origin worker pool; elsewhere it runs on the calling thread via the vendored
 * module — either way the bytes come from `transcoderUrl`/`vendor/basis`, never
 * a CDN. `maxDimension` skips too-large mip levels during transcode.
 */
export async function transcodeKTX2BasisTexture(
  bytes: Uint8Array,
  options: KTX2BasisTextureTranscoderOptions = { targetFormat: "rgba8" }
): Promise<KTX2BasisTranscodedTexture> {
  const identifier = [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10];
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < identifier.length || identifier.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("KTX2/Basis input is missing the KTX2 identifier");
  }
  if (bytes.byteLength > MAX_KTX2_INPUT_BYTES) throw new Error("KTX2 input exceeds byte limit");
  // Required by contract; legacy callers that omit it get the honest CPU
  // fallback rather than the old silent ETC2 default.
  const targetFormat = options.targetFormat ?? "rgba8";
  const colorSpace = options.colorSpace ?? "linear";
  const transcoderUrl = options.transcoderUrl ?? `${defaultDecoderBasePath()}basis/`;
  const transcoderFormat = basisTranscoderFormat(targetFormat);
  const workerPath = typeof Worker !== "undefined";
  if (options.signal?.aborted) throw Object.assign(new Error("KTX2 transcode aborted"), { name: "AbortError" });
  const reportCleanup = options.onCleanupPending ? (cleanup: Promise<void>): void => {
    void cleanup.catch(() => {});
    try { void Promise.resolve(options.onCleanupPending?.(cleanup)).catch(() => {}); } catch { /* observers do not own cleanup */ }
  } : undefined;
  const pool = workerPath ? options.workerPool ?? createKTX2TranscodeWorkerPool(transcoderUrl, options.workerCount ?? 2, {}, options.workerAssets) : undefined;
  const run = async (format: number): Promise<{ width: number; height: number; isUASTC: boolean; hasAlpha: boolean; levels: readonly KTX2TranscodedLevel[] }> => {
    if (pool) {
      return pool.transcode({
        bytes,
        transcoderFormat: format,
        maxDimension: options.maxDimension,
        signal: options.signal
      });
    }
    const module = await loadBasisTranscoderModule(transcoderUrl, options.signal, options.workerAssets, reportCleanup);
    return transcodeKTX2Levels(module, bytes, format, options.maxDimension, undefined, options.signal);
  };
  let completed = false;
  try {
    const result = await run(transcoderFormat);
    let fallback: Awaited<ReturnType<typeof run>> | undefined;
    if (targetFormat !== "rgba8" && options.includeFallback !== false) fallback = await run(BASIS_TRANSCODER_FORMAT_FALLBACK);
    completed = true;
    return {
      width: result.width,
      height: result.height,
      format: targetFormat,
      colorSpace,
      data: result.levels[0]?.data,
      mipLevels: result.levels.map((level) => ({ width: level.width, height: level.height, data: level.data })),
      fallbackData: fallback?.levels[0]?.data,
      fallbackMipLevels: fallback ? fallback.levels.map((level) => ({ width: level.width, height: level.height, data: level.data })) : undefined,
      isUASTC: result.isUASTC,
      hasAlpha: result.hasAlpha
    };
  } finally {
    if (pool && !options.workerPool) {
      const cleanup = pool.disposeAsync?.() ?? Promise.resolve(pool.dispose());
      reportCleanup?.(cleanup);
      // Do not turn a prompt abort/failure into a wait on a non-cooperative
      // fetch; successful calls can and should observe temporary-pool cleanup.
      if (completed) await cleanup;
    }
  }
}

const BASIS_TRANSCODER_FORMAT_FALLBACK = 13; // TranscoderFormat.RGBA32

export interface CompressedTextureDecoderProbes {
  /**
   * Injected capability probes. Each accepts a boolean or a thunk so browser
   * routes can pass live `navigator.gpu` / decoder-module checks while unit
   * tests pass literals. Defaults probe the vendored decoders and the
   * `meshoptimizer` package (fail-closed when they cannot be proven to exist).
   */
  readonly dracoAvailable?: boolean | (() => boolean | Promise<boolean>);
  readonly meshoptAvailable?: boolean | (() => boolean | Promise<boolean>);
  readonly ktx2Available?: boolean | (() => boolean | Promise<boolean>);
  /** GPU-compressed capability tokens ("astc","bptc","etc2","s3tc","s3tcSrgb") or target names. */
  readonly gpuCompressedFormats?: readonly string[];
}

export interface CompressedTextureSupportRequest {
  readonly draco?: boolean;
  readonly meshopt?: boolean;
  readonly ktx2?: boolean;
  readonly targetFormat?: KTX2BasisTargetFormat;
  /** Same-origin decoder directory for these probes; overrides packaged-worker URLs. */
  readonly basePath?: string;
}

export interface CompressedTextureDecoderStatus {
  readonly requested: boolean;
  readonly available: boolean;
  readonly detail: string;
}

export interface CompressedTextureSupportDiagnostics {
  readonly schema: "a3d-compressed-texture-support";
  readonly draco: CompressedTextureDecoderStatus;
  readonly meshopt: CompressedTextureDecoderStatus;
  readonly ktx2: CompressedTextureDecoderStatus;
  readonly gpuCompressedFormats: readonly string[];
  readonly chosenKtx2Target: KTX2BasisTargetFormat;
}

/**
 * Decoder-capability probe + reporting (PRD-05 §7.4). Defaults: meshopt and
 * KTX2 on (their modules ship with the package/are served at
 * `aura-decoders/`), Draco lazy — reported loaded-once-`require(["draco"])`-ed.
 * `chosenKtx2Target` goes through `selectKTX2TargetFormat` whenever real GPU
 * capability tokens are provided; with no GPU info it reports the requested
 * target unchanged.
 */
export async function ensureCompressedTextureSupport(
  request: CompressedTextureSupportRequest = {},
  probes: CompressedTextureDecoderProbes = {}
): Promise<CompressedTextureSupportDiagnostics> {
  // Capture once before any asynchronous probe. An explicit directory always
  // wins over a packaged worker manifest, matching registry configuration.
  const basePath = normalizeDecoderBasePath(request.basePath ?? defaultDecoderBasePath());
  const workerAssets = request.basePath === undefined && isDecoderWorkerScope() ? currentBundledDecoderAssets() : undefined;
  const wantDraco = request.draco ?? false;
  const wantMeshopt = request.meshopt ?? true;
  const wantKtx2 = request.ktx2 ?? true;
  const dracoAvailable = await resolveProbe(probes.dracoAvailable, () => probeVendored("draco", "draco_decoder.js", basePath, workerAssets));
  const meshoptAvailable = await resolveProbe(probes.meshoptAvailable, () => probeMeshoptPackage(basePath, workerAssets));
  const ktx2Available = await resolveProbe(probes.ktx2Available, () => probeVendored("basis", "basis_transcoder.js", basePath, workerAssets));
  const gpuCompressedFormats = probes.gpuCompressedFormats ?? [];
  const requestedTarget = request.targetFormat ?? "etc2-rgba8unorm";
  const caps = capabilitiesFromTokens(gpuCompressedFormats);
  const chosenKtx2Target = !wantKtx2 || !ktx2Available
    ? "rgba8"
    : gpuCompressedFormats.length === 0
      ? requestedTarget
      : selectKTX2TargetFormat(caps, "uastc", true, "srgb");
  return {
    schema: "a3d-compressed-texture-support",
    draco: {
      requested: wantDraco,
      available: dracoAvailable,
      detail: !wantDraco
        ? "Draco not requested (lazy — loads on registry.require([\"draco\"]))."
        : dracoAvailable
          ? "Vendored Draco decoder confirmed by probe."
          : "Draco requested but the vendored decoder did not resolve — geometry decoding will fail closed."
    },
    meshopt: {
      requested: wantMeshopt,
      available: meshoptAvailable,
      detail: !wantMeshopt
        ? "Meshopt not requested."
        : meshoptAvailable
          ? "meshoptimizer package resolved."
          : "Meshopt requested but the meshoptimizer package did not resolve — buffer decoding will fail closed."
    },
    ktx2: {
      requested: wantKtx2,
      available: ktx2Available,
      detail: !wantKtx2
        ? "KTX2 not requested; rgba8 fallback path."
        : ktx2Available
          ? `Vendored KTX2 transcoder resolved; target=${chosenKtx2Target}.`
          : "KTX2 requested but the vendored transcoder did not resolve — rgba8 fallback path."
    },
    gpuCompressedFormats,
    chosenKtx2Target
  };
}

async function resolveProbe(
  probe: boolean | (() => boolean | Promise<boolean>) | undefined,
  fallback: () => boolean | Promise<boolean>
): Promise<boolean> {
  if (typeof probe === "boolean") return probe;
  if (typeof probe === "function") return Boolean(await probe());
  return Boolean(await fallback());
}

function capabilitiesFromTokens(tokens: readonly string[]): CompressedTextureCapabilities {
  const caps: { -readonly [K in keyof CompressedTextureCapabilities]: boolean } = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };
  for (const raw of tokens) {
    const token = raw.toLowerCase();
    if (token === "astc" || token === "astc-4x4-rgba-unorm") caps.astc = true;
    else if (token === "bptc" || token === "bc7" || token === "bc7-rgba-unorm") caps.bptc = true;
    else if (token === "etc2" || token === "etc2-rgba8unorm" || token === "etc2-rgb8unorm") caps.etc2 = true;
    else if (token === "s3tc-srgb" || token === "s3tcsrgb") caps.s3tcSrgb = true;
    else if (token === "s3tc" || token === "bc1-rgb-unorm" || token === "bc1-rgba-unorm" || token === "bc3-rgba-unorm") caps.s3tc = true;
  }
  return caps;
}

async function probeMeshoptPackage(basePath: string, assets?: BundledWorkerDecoderAssets): Promise<boolean> {
  // Browsers resolve the same-origin vendored decoder; Node resolves the
  // `meshoptimizer` package (non-static specifier — build-optional).
  if (typeof document !== "undefined" || isDecoderWorkerScope()) return probeVendored("meshopt", "meshopt_decoder.mjs", basePath, assets);
  try {
    const pkg = ["mesh", "optimizer"].join("");
    const mod = await import(pkg) as Record<string, unknown>;
    const decoder = (mod.MeshoptDecoder ?? (mod.default as Record<string, unknown> | undefined)?.MeshoptDecoder) as { ready?: unknown } | undefined;
    return decoder !== undefined && typeof decoder === "object";
  } catch {
    return false;
  }
}

async function probeVendored(dir: "basis" | "draco" | "meshopt", file: string, basePath: string, assets?: BundledWorkerDecoderAssets): Promise<boolean> {
  if (assets && typeof fetch === "function") {
    const urls = dir === "basis" ? [assets.basisModule, assets.basisWasm]
      : dir === "draco" ? [assets.dracoModule, assets.dracoWasm] : [assets.meshoptModule];
    try {
      const responses = await Promise.all(urls.map((url) => fetch(normalizeDecoderAssetUrl(url), { method: "HEAD", mode: "same-origin", credentials: "same-origin", redirect: "error" })));
      return responses.every((response) => response.ok);
    } catch { return false; }
  }
  if (typeof document !== "undefined" || isDecoderWorkerScope()) {
    if (typeof fetch !== "function") return false;
    try {
      const response = await fetch(`${basePath}${dir}/${file}`, { method: "HEAD", mode: "same-origin", credentials: "same-origin", redirect: "error" });
      return response.ok;
    } catch { return false; }
  }
  try {
    const { fs } = await nodeBuiltins();
    const { existsSync } = fs;
    for (const base of ["../vendor", "../../vendor"]) {
      if (existsSync(new URL(`${base}/${dir}/${file}`, import.meta.url))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

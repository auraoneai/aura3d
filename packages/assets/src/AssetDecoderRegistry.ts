/**
 * C-16 §7.4 — AssetDecoderRegistry (PRD-05 Phase 1).
 *
 * One registry per app. `require(ids)` lazy-loads the named decoders
 * same-origin from `options.basePath` ("aura-decoders/"):
 *   - meshopt → `${basePath}meshopt/` vendored ESM in browsers;
 *     the `meshoptimizer` npm package in Node — both loaded lazily with
 *     non-static specifiers so consumer bundlers never resolve them at
 *     build time (the packages are optional peers of the engine pack).
 *   - draco   → `${basePath}draco/` vendored UMD, only on `require(["draco"])`
 *   - ktx2    → `${basePath}basis/` vendored Basis transcoder + a real
 *               `GLTFImageDecoder` that transcodes via `selectKTX2TargetFormat`
 * `diagnostics()` reports `{loaded, failed}`; after one retry a missing
 * decoder throws `AssetDecoderUnavailable`; `dispose()` frees handles.
 */

import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";
import { AssetDecoderDisposeTimeout, AssetDecoderUnavailable, DECODER_DISPOSE_TIMEOUT_MS, DECODER_LOAD_TIMEOUT_MS, decoderAbortReason, isCspBlockedFailure, decoderTimeoutMs, drainWithDeadline, withDecoderTimeout } from "./decoderLoad.js";
import { redactAssetUrl } from "./AssetLoader.js";
import { createMeshoptDecoder, createDracoDecoder, type GLTFMeshoptDecoderModule, type GLTFDracoDecoderModule } from "./GLTFCompressionDecoders.js";
import { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "./KTX2TargetSelection.js";
import { MAX_KTX2_INPUT_BYTES, ktx2TargetToTextureFormat, loadBasisTranscoderModule, transcodeKTX2BasisTexture } from "./KTX2BasisTextureTranscoder.js";
import { decodeImageInBrowser, isKTX2BasisImage, readImageBytes } from "./gltf/ImageDecode.js";
import { createKTX2TranscodeWorkerPool, isDecoderWorkerScope, loadDecoderWorkerFactory, normalizeDecoderAssetUrl, normalizeDecoderBasePath, type BundledWorkerDecoderAssets, type KTX2TranscodeWorkerPool } from "./KTX2TranscodeWorker.js";
import { read as readKtx2Container, KHR_DF_MODEL_UASTC, KHR_DF_TRANSFER_SRGB } from "ktx-parse";
import type { DecodedGLTFImage, GLTFImageDecoder } from "./GLTFRenderResources.js";
import type { GLTFAsset, GLTFImageAsset } from "./GLTFLoader.js";

export type { KTX2BasisTargetFormat };

export type AssetDecoderId = "meshopt" | "draco" | "ktx2";

export interface AuraAssetDecoderSet {
  readonly meshopt?: ReturnType<typeof createMeshoptDecoder>;
  readonly draco?: ReturnType<typeof createDracoDecoder>;
  readonly imageDecoder?: GLTFImageDecoder;
}

export interface AssetDecoderRegistryDiagnostics {
  readonly loaded: readonly AssetDecoderId[];
  readonly failed: readonly { id: string; url: string }[];
  /**
   * `timed-out`: disposal gave up waiting on a never-settling initializer or
   * cleanup (the registry is cancelled; late values are released on arrival;
   * call dispose again to re-drain). `failed`: a cleanup reported an error.
   */
  readonly disposal?: "active" | "disposing" | "disposed" | "timed-out" | "failed";
  /** Initializer/cleanup operations not yet settled. */
  readonly pendingOperations?: number;
}

export interface AssetDecoderRegistry {
  require(decoders: readonly AssetDecoderId[]): Promise<AuraAssetDecoderSet>;
  diagnostics(): AssetDecoderRegistryDiagnostics;
  /** Cancel immediately. */
  dispose(): void;
  /**
   * Drain cleanup. Bounded by `disposeTimeoutMs`: a never-settling initializer
   * rejects with `AssetDecoderDisposeTimeout` instead of hanging.
   */
  disposeAsync?(): Promise<void>;
}

export { AssetDecoderUnavailable, AssetDecoderDisposeTimeout };

export interface AssetDecoderRegistryOptions {
  /** Same-origin decoder root, e.g. `/aura-decoders/` (trailing slash optional). */
  readonly basePath: string;
  readonly capabilities: CompressedTextureCapabilities;
  readonly maxTextureSize: number;
  readonly workerCount: number;
  /** Per-file URLs from the owning packaged render worker, when no caller base overrides them. */
  readonly workerAssets?: BundledWorkerDecoderAssets;
  /** Bound on draining initialization and cleanup during disposal (default 10 s). */
  readonly disposeTimeoutMs?: number;
}

interface KTX2HeaderProbe {
  readonly source: "uastc" | "etc1s";
  readonly hasAlpha: boolean;
  readonly colorSpace: "srgb" | "linear";
}

/** Reads the KTX2 container header (DFD colorModel/transfer/samples) with ktx-parse. */
export function probeKTX2Header(bytes: Uint8Array): KTX2HeaderProbe {
  const container = readKtx2Container(bytes);
  const dfd = container.dataFormatDescriptor?.[0];
  const source = dfd?.colorModel === KHR_DF_MODEL_UASTC ? "uastc" : "etc1s";
  // ETC1S carries alpha in a second DFD sample; UASTC alpha is irrelevant to
  // target selection (all UASTC targets are RGBA-capable).
  const hasAlpha = source === "etc1s" ? (dfd?.samples?.length ?? 1) > 1 : true;
  return { source, hasAlpha, colorSpace: dfd?.transferFunction === KHR_DF_TRANSFER_SRGB ? "srgb" : "linear" };
}

export function createAssetDecoderRegistry(options: AssetDecoderRegistryOptions): AssetDecoderRegistry & { disposeAsync(): Promise<void> } {
  const basePath = normalizeDecoderBasePath(options.basePath);
  const workerAssets = options.workerAssets ? Object.freeze({
    basisScript: normalizeDecoderAssetUrl(options.workerAssets.basisScript),
    basisModule: normalizeDecoderAssetUrl(options.workerAssets.basisModule),
    basisWasm: normalizeDecoderAssetUrl(options.workerAssets.basisWasm),
    basisWorker: normalizeDecoderAssetUrl(options.workerAssets.basisWorker),
    dracoModule: normalizeDecoderAssetUrl(options.workerAssets.dracoModule),
    dracoWasm: normalizeDecoderAssetUrl(options.workerAssets.dracoWasm),
    meshoptModule: normalizeDecoderAssetUrl(options.workerAssets.meshoptModule)
  }) : undefined;
  const loaded = new Set<AssetDecoderId>();
  const failed: { id: string; url: string }[] = [];
  // Per-decoder promise cache: repeated require() calls reuse the in-flight
  // or resolved decoder (lazy-load exactly once per registry).
  const decoderPromises = new Map<AssetDecoderId, Promise<unknown>>();
  const decoderValues = new Set<unknown>();
  const pending = new Set<Promise<void>>();
  const cleanupErrors: unknown[] = [];
  const lifetime = new AbortController();
  let disposed = false;
  let disposal: Promise<void> | undefined;
  let disposalState: NonNullable<AssetDecoderRegistryDiagnostics["disposal"]> = "active";
  const disposeTimeoutMs = decoderTimeoutMs(options.disposeTimeoutMs, DECODER_DISPOSE_TIMEOUT_MS, "Decoder registry disposeTimeoutMs");

  const track = (work: Promise<unknown>, cleanup = false): void => {
    const tracked = work.then(
      () => { pending.delete(tracked); },
      (error: unknown) => {
        pending.delete(tracked);
        if (cleanup) cleanupErrors.push(error);
      }
    );
    pending.add(tracked);
  };

  const release = (value: unknown): void => {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return;
    try {
      const disposable = value as { dispose?: () => void | PromiseLike<void>; close?: () => void | PromiseLike<void> };
      const result = typeof disposable.dispose === "function" ? disposable.dispose() : disposable.close?.();
      if (result) track(Promise.resolve(result), true);
    } catch (error) { cleanupErrors.push(error); }
  };
  const attachRelease = <T extends object>(decoder: T, owner: unknown): T => {
    if (!owner || (typeof owner !== "object" && typeof owner !== "function")) return decoder;
    const disposable = owner as { dispose?: unknown; close?: unknown };
    if (typeof disposable.dispose !== "function" && typeof disposable.close !== "function") return decoder;
    let released = false;
    Object.defineProperty(decoder, "dispose", { value: () => { if (!released) { released = true; release(owner); } } });
    return decoder;
  };

  const waitForRegistry = <T>(work: Promise<T>, id: AssetDecoderId, url: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let abandoned = false;
      const abort = () => { abandoned = true; reject(new AssetDecoderUnavailable(id, url)); };
      if (lifetime.signal.aborted) abort();
      else lifetime.signal.addEventListener("abort", abort, { once: true });
      const observation = work.then(
        (value) => {
          lifetime.signal.removeEventListener("abort", abort);
          if (abandoned) release(value); else resolve(value);
        },
        (error: unknown) => {
          lifetime.signal.removeEventListener("abort", abort);
          if (!abandoned) reject(error);
        }
      );
      track(observation);
    });

  const timeoutWithRelease = <T>(work: Promise<T>, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = () => { clearTimeout(timer); lifetime.signal.removeEventListener("abort", abort); };
      const fail = (error: unknown) => { if (!settled) { settled = true; cleanup(); reject(error); } };
      const abort = () => fail(new Error(`${label} cancelled`));
      const timer = setTimeout(() => fail(new Error(`${label} timed out after ${DECODER_LOAD_TIMEOUT_MS}ms`)), DECODER_LOAD_TIMEOUT_MS);
      if (lifetime.signal.aborted) abort(); else lifetime.signal.addEventListener("abort", abort, { once: true });
      const observation = work.then(
        (value) => {
          if (settled) { release(value); return; }
          settled = true;
          cleanup();
          resolve(value);
        },
        fail
      );
      track(observation);
    });

  const withRetry = async <T>(id: AssetDecoderId, url: string, load: () => Promise<T>): Promise<T> => {
    if (disposed) throw new AssetDecoderUnavailable(id, url);
    let cspBlocked = false;
    try {
      const value = await waitForRegistry(load(), id, url);
      if (disposed) { release(value); throw new AssetDecoderUnavailable(id, url); }
      loaded.add(id);
      decoderValues.add(value);
      return value;
    } catch (firstError) {
      if (disposed) throw new AssetDecoderUnavailable(id, url);
      cspBlocked = isCspBlockedFailure(firstError);
      // One retry, then AssetDecoderUnavailable.
      try {
        const value = await waitForRegistry(load(), id, url);
        if (disposed) { release(value); throw new AssetDecoderUnavailable(id, url); }
        loaded.add(id);
        decoderValues.add(value);
        return value;
      } catch (secondError) {
        if (disposed) throw new AssetDecoderUnavailable(id, url);
        failed.push({ id, url });
        // Preserve the CSP classification so the main registry path surfaces KTX2_CSP_BLOCKED.
        const csp = id === "ktx2" && (cspBlocked || isCspBlockedFailure(secondError));
        throw new AssetDecoderUnavailable(id, url, csp ? "KTX2_CSP_BLOCKED" : undefined);
      }
    }
  };

  const loadMeshopt = (): Promise<ReturnType<typeof createMeshoptDecoder>> =>
    withRetry("meshopt", workerAssets?.meshoptModule ?? `${basePath}meshopt/meshopt_decoder.mjs`, () =>
      // A module import or `ready` promise that never settles is bounded like
      // Draco; a late decoder is released rather than installed.
      timeoutWithRelease((async () => {
        const mod = await loadMeshoptModule(basePath, workerAssets);
        const decoder = (mod.MeshoptDecoder ?? (mod.default as Record<string, unknown> | undefined)?.MeshoptDecoder) as GLTFMeshoptDecoderModule | undefined;
        if (!decoder) throw new Error("meshopt decoder did not export MeshoptDecoder");
        try {
          if (decoder.ready) await decoder.ready;
          return attachRelease(createMeshoptDecoder(decoder), decoder);
        } catch (error) { release(decoder); throw error; }
      })(), "meshopt decoder load"));

  const loadDraco = (): Promise<ReturnType<typeof createDracoDecoder>> =>
    withRetry("draco", workerAssets?.dracoModule ?? `${basePath}draco/draco_decoder.js`, () =>
      timeoutWithRelease(
        (async () => {
          const factory = await loadUmdGlobal("draco", `${basePath}draco/`, "draco_decoder.js", "DracoDecoderModule", lifetime.signal, workerAssets);
          if (lifetime.signal.aborted) throw new Error("draco decoder load cancelled");
          // Emscripten MODULARIZE: a missing/SPA-fallback wasm aborts through
          // `onAbort`; without it the factory promise never settles.
          const instance = await new Promise<GLTFDracoDecoderModule>((resolve, reject) => {
            let settled = false;
            const fail = (error: unknown): void => {
              if (settled) return;
              settled = true;
              reject(error);
            };
            const config: Record<string, unknown> = {
              onAbort: (reason: unknown) => fail(new Error(`draco decoder aborted: ${decoderAbortReason(reason)}`))
            };
            try {
              const pendingInstance = Promise.resolve((factory as (config?: Record<string, unknown>) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule)(config));
              // Observe the original factory through readiness even if onAbort
              // wins, so late partial decoders are released before disposal drains.
              const observation = pendingInstance.then(async (value) => {
                try {
                  if (value && typeof value === "object" && "ready" in value) await (value as { ready: PromiseLike<unknown> }).ready;
                  if (settled) release(value);
                  else { settled = true; resolve(value); }
                } catch (error) {
                  release(value);
                  fail(error);
                }
              }, fail);
              track(observation);
            } catch (error) {
              fail(error);
            }
          });
          try {
            return attachRelease(createDracoDecoder(instance), instance);
          } catch (error) { release(instance); throw error; }
        })(),
        "draco decoder load"
      ));

  const buildKtx2ImageDecoder = async (): Promise<GLTFImageDecoder> => {
    const transcoderUrl = `${basePath}basis/`;
    // Warm/verify the vendored transcoder (worker pool fetches its own copy;
    // this also covers non-Worker environments where the module is shared).
    await withRetry("ktx2", workerAssets?.basisModule ?? `${transcoderUrl}basis_transcoder.js`, () =>
      loadBasisTranscoderModule(transcoderUrl, lifetime.signal, workerAssets, (cleanup) => track(cleanup, true)).then(() => undefined));
    if (disposed) throw new AssetDecoderUnavailable("ktx2", transcoderUrl);
    let pool: KTX2TranscodeWorkerPool | undefined;
    const decoder: GLTFImageDecoder = (image: GLTFImageAsset, imageIndex: number, asset: GLTFAsset, context): Promise<DecodedGLTFImage> => {
      const work = (async () => {
        if (disposed) throw new AssetDecoderUnavailable("ktx2", transcoderUrl);
        const controller = new AbortController();
        const signals = [...new Set([lifetime.signal, context?.signal, context?.request?.signal].filter((signal): signal is AbortSignal => signal !== undefined))];
        const listeners = signals.map((signal) => {
          const abort = () => controller.abort(signal.reason);
          if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
          return { signal, abort };
        });
        const throwIfCancelled = (): void => {
          if (disposed) throw new AssetDecoderUnavailable("ktx2", transcoderUrl);
          if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException("KTX2 transcode aborted", "AbortError");
        };
        try {
          throwIfCancelled();
          const scopedContext = { ...context, signal: controller.signal };
          if (!isKTX2BasisImage(image)) {
            const decoded = await decodeImageInBrowser(image, imageIndex, asset, { maxTextureSize: options.maxTextureSize, qrAssets: true, ...scopedContext });
            if (disposed || controller.signal.aborted) {
              release(decoded.source);
              throwIfCancelled();
            }
            return decoded;
          }
          const bytes = new Uint8Array(await readImageBytes(asset, image, scopedContext, MAX_KTX2_INPUT_BYTES));
          throwIfCancelled();
          const header = probeKTX2Header(bytes);
          const targetFormat = selectKTX2TargetFormat(options.capabilities, header.source, header.hasAlpha, header.colorSpace);
          if (typeof Worker !== "undefined") pool ??= createKTX2TranscodeWorkerPool(transcoderUrl, options.workerCount, { disposeTimeoutMs: Math.ceil(disposeTimeoutMs) }, workerAssets);
          const decoded = await transcodeKTX2BasisTexture(bytes, {
            targetFormat,
            colorSpace: header.colorSpace,
            maxDimension: options.maxTextureSize,
            transcoderUrl,
            workerCount: options.workerCount,
            signal: controller.signal,
            workerPool: pool,
            workerAssets,
            onCleanupPending: (cleanup) => track(cleanup, true)
          });
          throwIfCancelled();
          return { ...decoded, format: ktx2TargetToTextureFormat(decoded.format) };
        } finally {
          for (const { signal, abort } of listeners) signal.removeEventListener("abort", abort);
        }
      })();
      track(work);
      return work;
    };
    Object.defineProperty(decoder, "dispose", { value: () => {
      const owned = pool;
      pool = undefined;
      return owned?.disposeAsync ? owned.disposeAsync() : owned?.dispose();
    } });
    decoderValues.add(decoder);
    return decoder;
  };

  const dispose = (): Promise<void> => {
    if (disposal) return disposal;
    disposed = true;
    disposalState = "disposing";
    const attempt: Promise<void> = Promise.resolve().then(async () => {
      const unsettled = await drainWithDeadline(pending, disposeTimeoutMs);
      if (unsettled > 0) {
        // Never hang on a factory/initializer that cannot settle. The registry
        // stays cancelled; a later dispose() call re-drains what remains.
        disposalState = "timed-out";
        if (disposal === attempt) disposal = undefined;
        throw new AssetDecoderDisposeTimeout("Asset decoder registry", unsettled, disposeTimeoutMs);
      }
      if (cleanupErrors.length) {
        disposalState = "failed";
        throw new AggregateError(cleanupErrors, "Asset decoder registry disposal failed");
      }
      disposalState = "disposed";
    });
    disposal = attempt;
    // Keep the existing fire-and-forget call safe while allowing awaiters
    // to observe cleanup failures and late initialization.
    void attempt.catch(() => {});
    lifetime.abort();
    for (const value of decoderValues) release(value);
    decoderValues.clear();
    loaded.clear();
    decoderPromises.clear();
    return disposal;
  };

  return {
    async require(decoders: readonly AssetDecoderId[]): Promise<AuraAssetDecoderSet> {
      if (decoders.length === 0) return {};
      const set: { meshopt?: ReturnType<typeof createMeshoptDecoder>; draco?: ReturnType<typeof createDracoDecoder>; imageDecoder?: GLTFImageDecoder } = {};
      for (const decoder of decoders) {
        if (disposed) throw new AssetDecoderUnavailable(decoder, basePath);
        let promise = decoderPromises.get(decoder);
        if (!promise) {
          const attempt = decoder === "meshopt" ? loadMeshopt() : decoder === "draco" ? loadDraco() : buildKtx2ImageDecoder();
          track(attempt);
          // A transient failure must not poison the registry forever. Do not
          // evict a newer replacement installed after this attempt started.
          promise = attempt.catch((error: unknown) => {
            if (decoderPromises.get(decoder) === promise) decoderPromises.delete(decoder);
            throw error;
          });
          decoderPromises.set(decoder, promise);
        }
        const value = await promise;
        if (disposed) throw new AssetDecoderUnavailable(decoder, basePath);
        if (decoder === "meshopt") set.meshopt = value as ReturnType<typeof createMeshoptDecoder>;
        else if (decoder === "draco") set.draco = value as ReturnType<typeof createDracoDecoder>;
        else if (decoder === "ktx2") set.imageDecoder = value as GLTFImageDecoder;
      }
      return set;
    },
    diagnostics(): AssetDecoderRegistryDiagnostics {
      return { loaded: [...loaded], failed: [...failed], disposal: disposalState, pendingOperations: pending.size };
    },
    dispose,
    disposeAsync: dispose
  };
}

/**
 * meshopt resolves to the same-origin vendored ESM in browsers and to the
 * `meshoptimizer` npm package under Node/tests. Both specifiers are
 * deliberately non-static: they are runtime-optional loads and consumer
 * bundlers must not be forced to resolve them at build time (the engine
 * pack does not declare `meshoptimizer` as a hard dependency).
 */
async function loadMeshoptModule(basePath: string, assets?: BundledWorkerDecoderAssets): Promise<Record<string, unknown>> {
  if (typeof document !== "undefined" || isDecoderWorkerScope()) {
    const moduleUrl = assets ? normalizeDecoderAssetUrl(assets.meshoptModule) : `${basePath}meshopt/meshopt_decoder.mjs`;
    return (await import(/* @vite-ignore */ moduleUrl)) as Record<string, unknown>;
  }
  const pkg = ["mesh", "optimizer"].join("");
  return (await import(pkg)) as Record<string, unknown>;
}

/** Node builtins are loaded through a computed specifier for the same reason. */
interface NodeBuiltins {
  readonly fs: typeof import("node:fs");
  readonly module: typeof import("node:module");
  readonly url: typeof import("node:url");
  readonly path: typeof import("node:path");
}
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

/** UMD decoder bundles bind a global only under a classic `<script>` load. */
async function loadUmdGlobal(id: AssetDecoderId, dirUrl: string, fileName: string, globalName: string, signal?: AbortSignal, assets?: BundledWorkerDecoderAssets): Promise<unknown> {
  const url = `${dirUrl}${fileName}`;
  // The shipped glTF decoder requests its upstream wasm filename, while the
  // deployed, vendored asset is named draco_decoder.wasm.
  const locateFile = (file: string) => id === "draco" && assets && file.endsWith(".wasm")
    ? normalizeDecoderAssetUrl(assets.dracoWasm)
    : `${dirUrl}${id === "draco" && file === "draco_decoder_gltf.wasm" ? "draco_decoder.wasm" : file}`;
  if (typeof document === "undefined" && isDecoderWorkerScope()) {
    const bound = await loadDecoderWorkerFactory(dirUrl, fileName, globalName, id === "draco" ? assets?.dracoModule : undefined);
    if (typeof bound !== "function" && (typeof bound !== "object" || bound === null)) throw new Error(`${globalName} is not a decoder factory`);
    if (typeof bound !== "function") return bound;
    return (config?: Record<string, unknown>) => bound({ ...config, locateFile });
  }
  if (typeof document === "undefined") {
    // Node/tests: evaluate the vendored UMD copy as CJS.
    const { fs, module: nodeModule, url: nodeUrl, path: nodePath } = await nodeBuiltins();
    const { readFileSync, existsSync } = fs;
    const { createRequire } = nodeModule;
    const { fileURLToPath } = nodeUrl;
    const { dirname } = nodePath;
    const require2 = createRequire(import.meta.url);
    const candidates = [
      new URL(`../vendor/${id === "draco" ? "draco" : "basis"}/${fileName}`, import.meta.url),
      new URL(`../../vendor/${id === "draco" ? "draco" : "basis"}/${fileName}`, import.meta.url)
    ];
    const fileUrl = candidates.find((candidate) => existsSync(candidate));
    if (!fileUrl) throw new Error(`vendored ${fileName} not found next to @aura3d/assets`);
    const filePath = fileURLToPath(fileUrl);
    const code = readFileSync(fileUrl, "utf8");
    const box: { exports: Record<string, unknown> } = { exports: {} };
    new Function("module", "exports", "require", "__dirname", "__filename", code)(box, box.exports, require2, dirname(filePath), filePath);
    const bound = box.exports[globalName] ?? box.exports.default ?? box.exports;
    if (bound === undefined || (typeof bound !== "function" && typeof bound !== "object")) {
      throw new Error(`${globalName} not bound by vendored ${fileName}`);
    }
    // Emscripten MODULARIZE factories need their wasm binary fed directly.
    if (typeof bound === "function") {
      const wasmFile = fileName.replace(/\.js$/, ".wasm");
      const wasmUrl = new URL(wasmFile, fileUrl);
      return (config?: Record<string, unknown>) => {
        const cfg = { ...config, wasmBinary: existsSync(wasmUrl) ? readFileSync(wasmUrl) : undefined };
        return bound(cfg);
      };
    }
    return bound;
  }
  const script = document.createElement("script");
  let abort: (() => void) | undefined;
  try {
    return await withDecoderTimeout(
      new Promise<unknown>((resolve, reject) => {
        abort = () => reject(new Error(`script load cancelled: ${redactAssetUrl(url)}`));
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener("abort", abort, { once: true });
        script.src = url;
        script.onload = () => {
          const bound = (globalThis as Record<string, unknown>)[globalName];
          if (bound === undefined) reject(new Error(`${globalName} not bound by ${redactAssetUrl(url)}`));
          else if (typeof bound === "function") {
            resolve((config?: Record<string, unknown>) => bound({ ...config, locateFile }));
          } else resolve(bound);
        };
        script.onerror = () => reject(new Error(`script load failed: ${redactAssetUrl(url)}`));
        document.head.appendChild(script);
      }),
      `script load ${redactAssetUrl(url)}`
    );
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
    script.onload = null;
    script.onerror = null;
    script.remove?.();
  }
}

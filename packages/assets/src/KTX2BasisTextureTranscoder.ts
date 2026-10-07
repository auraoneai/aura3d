import { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "./KTX2TargetSelection.js";
import { basisTranscoderFormat, transcodeKTX2Levels, type BasisModuleLike, type KTX2TranscodedLevel } from "./KTX2TranscodeDriver.js";
import { createKTX2TranscodeWorkerPool, type KTX2TranscodeWorkerPool } from "./KTX2TranscodeWorker.js";
import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";

export type { KTX2BasisTargetFormat };

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

const DEFAULT_TRANSCODER_URL = "/aura-decoders/basis/";
const workerPools = new Map<string, KTX2TranscodeWorkerPool>();

function workerPool(transcoderUrl: string, workerCount: number): KTX2TranscodeWorkerPool {
  const key = `${transcoderUrl}#${workerCount}`;
  let pool = workerPools.get(key);
  if (!pool) {
    pool = createKTX2TranscodeWorkerPool(transcoderUrl, workerCount);
    workerPools.set(key, pool);
  }
  return pool;
}

interface BasisModuleCacheEntry { promise: Promise<BasisModuleLike>; }
const basisModuleCache = new Map<string, BasisModuleCacheEntry>();

/**
 * Loads + initialises the vendored Basis transcoder module, once per
 * `transcoderUrl`. Browser path injects a `<script>` (UMD global `BASIS`);
 * Node/test path evaluates the vendored UMD as CJS so no `document` needed.
 */
export function loadBasisTranscoderModule(transcoderUrl: string = DEFAULT_TRANSCODER_URL): Promise<BasisModuleLike> {
  const base = transcoderUrl.endsWith("/") ? transcoderUrl : `${transcoderUrl}/`;
  let entry = basisModuleCache.get(base);
  if (!entry) {
    entry = { promise: (typeof document !== "undefined" ? loadBasisModuleBrowser(base) : loadBasisModuleNode()) };
    entry.promise.catch(() => basisModuleCache.delete(base));
    basisModuleCache.set(base, entry);
  }
  return entry.promise;
}

async function loadBasisModuleBrowser(base: string): Promise<BasisModuleLike> {
  const globalName = "BASIS";
  const globals = globalThis as typeof globalThis & { BASIS?: (config: Record<string, unknown>) => BasisModuleLike | Promise<BasisModuleLike> };
  if (typeof globals.BASIS !== "function") {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${base}basis_transcoder.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${script.src}`));
      document.head.appendChild(script);
    });
  }
  const BASIS = globals.BASIS;
  if (typeof BASIS !== "function") {
    throw new Error("basis_transcoder.js loaded but the BASIS global is missing");
  }
  // Emscripten MODULARIZE: the object passed to BASIS() becomes the Module;
  // onRuntimeInitialized fires asynchronously once the wasm is compiled.
  const moduleConfig: Record<string, unknown> = { locateFile: (file: string) => `${base}${file}` };
  const module = await new Promise<BasisModuleLike>((resolve, reject) => {
    try {
      moduleConfig.onRuntimeInitialized = () => resolve(moduleConfig as unknown as BasisModuleLike);
      (BASIS as (config: Record<string, unknown>) => unknown)(moduleConfig);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
  module.initializeBasis();
  return module;
}

async function loadBasisModuleNode(): Promise<BasisModuleLike> {
  const [{ readFileSync, existsSync }, { createRequire }, { fileURLToPath }, { dirname }] = await Promise.all([
    import("node:fs"),
    import("node:module"),
    import("node:url"),
    import("node:path")
  ]);
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
  const module = await new Promise<BasisModuleLike>((resolve) => {
    let mod!: BasisModuleLike;
    const produced = (BASIS as (config: Record<string, unknown>) => unknown)({
      wasmBinary: readFileSync(wasmUrl),
      onRuntimeInitialized: () => resolve(mod)
    });
    mod = (produced && typeof produced === "object" ? produced : box.exports) as unknown as BasisModuleLike;
  });
  module.initializeBasis();
  return module;
}

/**
 * Transcodes a KTX2/Basis texture to `options.targetFormat` using the vendored
 * Basis transcoder. In browsers with `Worker` the transcode runs in the
 * blob-worker pool; elsewhere it runs on the calling thread via the vendored
 * module — either way the bytes come from `transcoderUrl`/`vendor/basis`, never
 * a CDN. `maxDimension` skips too-large mip levels during transcode.
 */
export async function transcodeKTX2BasisTexture(
  bytes: Uint8Array,
  options: KTX2BasisTextureTranscoderOptions
): Promise<KTX2BasisTranscodedTexture> {
  // Required by contract; legacy callers that omit it get the honest CPU
  // fallback rather than the old silent ETC2 default.
  const targetFormat = options.targetFormat ?? "rgba8";
  const colorSpace = options.colorSpace ?? "linear";
  const transcoderUrl = options.transcoderUrl ?? DEFAULT_TRANSCODER_URL;
  const transcoderFormat = basisTranscoderFormat(targetFormat);
  const workerPath = typeof Worker !== "undefined";
  const run = async (format: number): Promise<{ width: number; height: number; isUASTC: boolean; hasAlpha: boolean; levels: readonly KTX2TranscodedLevel[] }> => {
    if (workerPath) {
      return workerPool(transcoderUrl, options.workerCount ?? 2).transcode({
        bytes,
        transcoderFormat: format,
        maxDimension: options.maxDimension
      });
    }
    const module = await loadBasisTranscoderModule(transcoderUrl);
    return transcodeKTX2Levels(module, bytes, format, options.maxDimension);
  };
  const result = await run(transcoderFormat);
  let fallback: Awaited<ReturnType<typeof run>> | undefined;
  if (targetFormat !== "rgba8" && options.includeFallback !== false) {
    fallback = await run(BASIS_TRANSCODER_FORMAT_FALLBACK);
  }
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
  const wantDraco = request.draco ?? false;
  const wantMeshopt = request.meshopt ?? true;
  const wantKtx2 = request.ktx2 ?? true;
  const dracoAvailable = await resolveProbe(probes.dracoAvailable, probeVendoredDraco);
  const meshoptAvailable = await resolveProbe(probes.meshoptAvailable, probeMeshoptPackage);
  const ktx2Available = await resolveProbe(probes.ktx2Available, probeVendoredBasis);
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
  const caps: CompressedTextureCapabilities = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };
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

async function probeMeshoptPackage(): Promise<boolean> {
  try {
    const mod = await import("meshoptimizer") as Record<string, unknown>;
    const decoder = (mod.MeshoptDecoder ?? (mod.default as Record<string, unknown> | undefined)?.MeshoptDecoder) as { ready?: unknown } | undefined;
    return decoder !== undefined && typeof decoder === "object";
  } catch {
    return false;
  }
}

async function probeVendoredBasis(): Promise<boolean> {
  return probeVendored("basis", "basis_transcoder.js");
}
async function probeVendoredDraco(): Promise<boolean> {
  return probeVendored("draco", "draco_decoder.js");
}

async function probeVendored(dir: "basis" | "draco", file: string): Promise<boolean> {
  if (typeof fetch === "function" && typeof document !== "undefined") {
    try {
      const response = await fetch(`/aura-decoders/${dir}/${file}`, { method: "HEAD" });
      if (response.ok) return true;
    } catch { /* fall through to node probe */ }
  }
  try {
    const { existsSync } = await import("node:fs");
    for (const base of ["../vendor", "../../vendor"]) {
      if (existsSync(new URL(`${base}/${dir}/${file}`, import.meta.url))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

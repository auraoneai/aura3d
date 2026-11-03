import type { CameraLike, RenderSource } from "@aura3d/rendering";
import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";
import { mergeAssetRequestOptions, type AssetLoadRequest } from "../AssetLoader";
import type { FormatMetadata, FormatRegistry, RegisteredFormatAsset } from "../FormatRegistry";
import { LoadContext } from "../LoadContext";
import { fetchGltfBytesShared, GLTFLoader, type GLTFAsset, type GLTFDracoDecoder, type GLTFLoaderDiagnostics, type GLTFMeshoptDecoder } from "../GLTFLoader";
import { createGLTFRenderResources, type GLTFImageDecoder, type GLTFRenderResourceOptions, type GLTFRenderResources, type GLTFRendererInputOptions } from "../GLTFRenderResources";
import { acquireParsedGLTFAsset } from "../GLTFAssetParseCache";
import { AssetDecoderUnavailable, createAssetDecoderRegistry } from "../contracts/decoders";
import { currentBundledDecoderAssets } from "../KTX2TranscodeWorker.js";
import type { KTX2BasisTargetFormat } from "../KTX2BasisTextureTranscoder";

export interface ProductionGLTFRenderPipelineOptions {
  readonly url: string;
  readonly assetId: string;
  /** Explicit selected glTF representation, including for extensionless URLs. */
  readonly format?: string;
  readonly formatMetadata?: FormatMetadata;
  /** Optional per-app adapters for formats lowered to Aura3D render resources. */
  readonly formatRegistry?: FormatRegistry;
  /** Request policy and expected document/dependency digests, applied before parse or render. */
  readonly request?: Omit<AssetLoadRequest, "url" | "type">;
  readonly assetName?: string;
  readonly imageDecoder?: GLTFImageDecoder;
  readonly dracoDecoder?: GLTFDracoDecoder;
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
  readonly materialVariant?: GLTFRenderResourceOptions["materialVariant"];
  readonly sceneIndex?: GLTFRenderResourceOptions["sceneIndex"];
  readonly sceneName?: GLTFRenderResourceOptions["sceneName"];
  readonly materialRenderStateOverrides?: GLTFRenderResourceOptions["materialRenderStateOverrides"];
  /** Estimated texture bytes admitted at decode time; native residency is budgeted by the backend. */
  readonly textureBudget?: GLTFRenderResourceOptions["textureBudget"];
  /** Optional device identity for partitioning decode-time texture admission. */
  readonly textureBudgetDevice?: GLTFRenderResourceOptions["textureBudgetDevice"];
  /** Preserve decoded mip source metadata for device-local residency. */
  readonly retainTextureResidencySources?: GLTFRenderResourceOptions["retainTextureResidencySources"];
  /** Max texture dimension forwarded to resource creation (C-27, PRD-04 P2-11). */
  readonly maxTextureSize?: GLTFRenderResourceOptions["maxTextureSize"];
  /** Tangent-generation policy forwarded to resource creation (PRD-04 P5-4, C-18). */
  readonly tangents?: GLTFRenderResourceOptions["tangents"];
  /** `A3D_QR_MATERIALS` state forwarded by `createTypedGLBActor` (PRD-04 flag channel). */
  readonly materialsR185?: GLTFRenderResourceOptions["materialsR185"];
  /** `A3D_QR_MATERIALS_TRANSMISSION` state forwarded by `createTypedGLBActor` (P4-3 E22 gate). */
  readonly materialsTransmission?: GLTFRenderResourceOptions["materialsTransmission"];
  /** Forwarded `renderer.material.transmission` mode (PRD-04 P4-3). */
  readonly transmission?: GLTFRenderResourceOptions["transmission"];
  /**
   * PRD-04 P5-2 (C-16): decoder configuration. When present the pipeline pre-scans the asset's
   * `extensionsUsed`/`extensionsRequired`, `require()`s the needed decoders from a
   * `createAssetDecoderRegistry` (same-origin `basePath`, default `/aura-decoders/`), and feeds
   * the resolved draco/meshopt decoders into the parse cache plus the ktx2 image decoder into
   * resource creation. `draco`/`meshopt`/`ktx2: false` opts that decoder out; a required decoder
   * that is disabled or fails to load throws `AssetDecoderUnavailable` and surfaces a
   * `decoder-missing` warning naming the extension.
   */
  readonly decoders?: {
    readonly basePath?: string;
    readonly meshopt?: boolean;
    readonly draco?: boolean;
    readonly ktx2?: boolean;
    readonly workerCount?: number;
  };
  /**
   * Compressed texture capabilities used for the ktx2 target-format pick (P5-2). Defaults to
   * all-false — the Basis transcode falls back to `rgba8` rather than claiming a format the
   * device may not support.
   */
  readonly compressedTextureCapabilities?: CompressedTextureCapabilities;
  /** Basis transcoder settings forwarded to resource creation (C-16); the registry's capability-picked targetFormat merges under this. */
  readonly ktx2BasisTranscoderOptions?: GLTFRenderResourceOptions["ktx2BasisTranscoderOptions"];
  readonly rendererInput?: GLTFRendererInputOptions;
  readonly width?: number;
  readonly height?: number;
  /**
   * Share one runtime material instance across glTF materials whose definitions are identical apart
   * from their name, so renderer static batching can collapse them. See
   * `GLTFRenderResourceOptions.deduplicateIdenticalMaterials`.
   */
  readonly deduplicateIdenticalMaterials?: boolean;
  /**
   * SA-04: shared GPU-texture cache for clone pipelines. All clones built from
   * one model pass the same cache, so each image is decoded and uploaded once
   * regardless of clone count; `dispose()` releases the clone's lease.
   */
  readonly sharedTextures?: import("../GLTFSharedTextureCache.js").GLTFSharedTextureCache;
}

export interface ProductionGLTFRenderMetadata {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetUri: string;
  readonly meshCount: number;
  readonly primitiveCount: number;
  /** Number of materials declared in the input document. */
  readonly materialCount: number;
  /** Distinct live materials bound to renderable geometry, when resources are loaded. */
  readonly runtimeMaterialCount?: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly textureSlots: readonly string[];
  readonly materialFeatures: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly pbrTextureCount: number;
  readonly normalMapCount: number;
  readonly ormTextureCount: number;
  readonly emissiveTextureCount: number;
  readonly materialExtensionCoverage: readonly string[];
  readonly warnings: readonly ProductionGLTFRenderWarning[];
  readonly hasPbr: boolean;
  readonly hasSkinning: boolean;
  readonly hasMorphTargets: boolean;
  readonly hasAnimation: boolean;
}

export interface ProductionGLTFRenderWarning {
  readonly code: string;
  readonly severity: "info" | "warning";
  readonly message: string;
  readonly nextAction: string;
}

export interface ProductionGLTFRenderPipeline {
  readonly asset: GLTFAsset;
  readonly resources: GLTFRenderResources;
  readonly source: RenderSource;
  readonly camera: CameraLike;
  readonly metadata: ProductionGLTFRenderMetadata;
  dispose(): void;
  /** Wait for cleanup; a call after rejection retries failed owned resources. */
  disposeAsync(): Promise<void>;
}

/** glTF extensions that require a registered decoder (P5-2). */
const GLTF_DECODER_EXTENSIONS: Readonly<Record<string, "meshopt" | "draco" | "ktx2">> = {
  EXT_meshopt_compression: "meshopt",
  KHR_meshopt_compression: "meshopt",
  KHR_draco_mesh_compression: "draco",
  KHR_texture_basisu: "ktx2"
};

const NO_COMPRESSED_CAPABILITIES: CompressedTextureCapabilities = {
  astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false
};

/**
 * Reads `extensionsUsed`/`extensionsRequired` without running the full loader: GLB files expose
 * the JSON chunk after the 12-byte header + 8-byte chunk header; `.gltf` is plain JSON.
 */
export async function scanGLTFExtensionsUsed(url: string, request: Omit<AssetLoadRequest, "url" | "type"> = {}): Promise<readonly string[]> {
  // Through the shared in-flight fetch: typed actors scan per instance, and
  // a raw fetch here raced the parse fetch for the same multi-MB GLB,
  // aborting both with Chromium ERR_CACHE_WRITE_FAILURE on production.
  const bytes = new Uint8Array(await fetchGltfBytesShared(
    url,
    "document",
    { ...request, url },
    (status) => `glTF extension scan failed for ${url}: HTTP ${status}`
  ));
  const GLB_MAGIC = 0x46546c67;
  let jsonText: string;
  if (bytes.length >= 20 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GLB_MAGIC) {
    const jsonLength = new DataView(bytes.buffer, bytes.byteOffset + 12, 4).getUint32(0, true);
    jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  } else {
    jsonText = new TextDecoder().decode(bytes);
  }
  const json = JSON.parse(jsonText) as { extensionsUsed?: readonly string[]; extensionsRequired?: readonly string[] };
  return [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])];
}

export function requiredGLTFDecoders(extensionsUsed: readonly string[]): readonly ("meshopt" | "draco" | "ktx2")[] {
  const required = new Set<"meshopt" | "draco" | "ktx2">();
  for (const extension of extensionsUsed) {
    const id = GLTF_DECODER_EXTENSIONS[extension];
    if (id) required.add(id);
  }
  return [...required];
}

type SharedDecoderRegistry = ReturnType<typeof createAssetDecoderRegistry>;
const sharedDecoderRegistries = new Map<string, SharedDecoderRegistry>();
interface DecoderLeaseState {
  references: number;
  closing: boolean;
  readonly active: Set<Promise<void>>;
  readonly wrappers: WeakMap<GLTFDracoDecoder | GLTFMeshoptDecoder, GLTFDracoDecoder | GLTFMeshoptDecoder>;
}
const decoderRegistryReferences = new WeakMap<SharedDecoderRegistry, DecoderLeaseState>();

/**
 * GU47 E-H handoff (eint EH-6): one decoder registry per decode configuration (base path, worker count, texture cap,
 * compressed-texture capabilities). A registry lazy-loads each decoder once, so repeated loads (and every `setScene`
 * remount) reuse the same draco / meshopt decoder instances and the parsed-GLB cache (`GLTFAssetParseCache`, keyed
 * on decoder identity) hits instead of re-fetching and re-parsing compressed GLBs. A failed load drops its registry.
 */
export function sharedGLTFDecoderRegistry(options: Parameters<typeof createAssetDecoderRegistry>[0]): SharedDecoderRegistry {
  const caps = options.capabilities;
  const key = JSON.stringify([options.basePath, options.workerCount, options.maxTextureSize, caps.astc, caps.bptc, caps.etc2, caps.s3tc, caps.s3tcSrgb, options.workerAssets ?? null]);
  let registry = sharedDecoderRegistries.get(key);
  if (!registry) {
    registry = createAssetDecoderRegistry(options);
    sharedDecoderRegistries.set(key, registry);
  }
  return registry;
}

/** Forgets a shared decoder registry (after a decoder failed to load, so the next load retries). */
export function dropSharedGLTFDecoderRegistry(registry: SharedDecoderRegistry): void {
  for (const [key, value] of sharedDecoderRegistries) if (value === registry) sharedDecoderRegistries.delete(key);
}

/** A model holds a decoder lease until its parse/resources are no longer used. */
function retainDecoderRegistry(registry: SharedDecoderRegistry): () => Promise<void> | undefined {
  let state = decoderRegistryReferences.get(registry);
  if (!state) {
    state = { references: 0, closing: false, active: new Set(), wrappers: new WeakMap() };
    decoderRegistryReferences.set(registry, state);
  }
  const owned = state;
  owned.references++;
  let released = false;
  let cleanup: Promise<void> | undefined;
  return () => {
    if (released) return cleanup;
    released = true;
    if (--owned.references > 0) return;
    owned.closing = true;
    decoderRegistryReferences.delete(registry);
    dropSharedGLTFDecoderRegistry(registry);
    cleanup = (async () => {
      while (owned.active.size) await Promise.all([...owned.active]);
      await registry.disposeAsync();
    })();
    return cleanup;
  };
}

/** The parse cache can abandon a waiter before an asynchronous codec call finishes. */
function trackRegistryCodec<T extends GLTFDracoDecoder | GLTFMeshoptDecoder>(registry: SharedDecoderRegistry, decoder: T): T {
  const state = decoderRegistryReferences.get(registry)!;
  const cached = state.wrappers.get(decoder);
  if (cached) return cached as T;
  const wrapped = (...args: Parameters<T>): ReturnType<T> => {
    if (state.closing) throw new Error("Asset decoder lease has been released");
    const result = (decoder as unknown as (...input: Parameters<T>) => ReturnType<T>)(...args);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      const tracked = Promise.resolve(result).then(() => {}, () => {});
      state.active.add(tracked);
      void tracked.then(() => { state.active.delete(tracked); });
    }
    return result;
  };
  const typed = wrapped as unknown as T;
  state.wrappers.set(decoder, typed);
  return typed;
}

/** Cancel one subscriber without cancelling work shared by another lease. */
function waitForSubscriber<T>(work: Promise<T>, signal: AbortSignal | undefined, onAbort: () => void): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      onAbort();
      reject(signal.reason ?? new DOMException("Asset load aborted", "AbortError"));
    };
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    work.then(
      (value) => { if (!settled) { settled = true; signal.removeEventListener("abort", abort); resolve(value); } },
      (error: unknown) => { if (!settled) { settled = true; signal.removeEventListener("abort", abort); reject(error); } }
    );
  });
}

async function finishFailedLease(
  leaseCleanup: Promise<void>,
  releaseDecoder: (() => Promise<void> | undefined) | undefined
): Promise<void> {
  const failures: unknown[] = [];
  try { await leaseCleanup; } catch (error) { failures.push(error); }
  try { await releaseDecoder?.(); } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "glTF lease and decoder cleanup failed");
}

async function combineCleanup(work: readonly Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(work);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "glTF acquisition cleanup failed");
}

const failureCleanupBarriers = new WeakMap<object, Promise<void>>();

/** Keep failed/cancelled acquisition prompt while retaining an observable cleanup barrier. */
function withDecoderCleanup(error: unknown, cleanup: Promise<void>): unknown {
  void cleanup.catch(() => {});
  if (error && (typeof error === "object" || typeof error === "function")) {
    const previous = failureCleanupBarriers.get(error);
    if (previous) cleanup = combineCleanup([previous, cleanup]);
    void cleanup.catch(() => {});
    try {
      Object.defineProperty(error, "decoderCleanup", { value: cleanup, configurable: true });
      failureCleanupBarriers.set(error, cleanup);
      return error;
    } catch { /* Preserve the original as the cause when it cannot be extended. */ }
  }
  const wrapped = new Error("Asset load failed while decoder cleanup is pending", { cause: error });
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") wrapped.name = error.name;
  Object.defineProperty(wrapped, "decoderCleanup", { value: cleanup });
  return wrapped;
}

function isExpectedResourceAbort(error: unknown, signal: AbortSignal): boolean {
  let current = error;
  let expected = false;
  for (let depth = 0; depth < 8; depth++) {
    if (signal.reason !== undefined && current === signal.reason) return true;
    if (!current || typeof current !== "object") return expected;
    const value = current as { name?: unknown; message?: unknown; cause?: unknown };
    if (value.name === "AggregateError") return false;
    if (value.name === "AbortError" || (value.name === "AssetLoadError" && value.message === "Asset load aborted")) expected = true;
    // FormatRegistry disposes a late successful build before rejecting it.
    if (typeof value.message === "string" && /^Format asset .+ was disposed while creating render resources$/.test(value.message)) expected = true;
    current = value.cause;
  }
  return expected;
}

/** Start synchronous disposal immediately, and also drain any asynchronous ownership. */
function disposeRenderResources(resources: GLTFRenderResources, retry = false): Promise<void> {
  let failure: unknown;
  let failed = false;
  if (!retry || !resources.disposeAsync) {
    try { resources.dispose(); } catch (error) { failed = true; failure = error; }
  }
  let pending: Promise<void> | undefined;
  try { pending = resources.disposeAsync?.(); }
  catch (error) { pending = Promise.reject(error); }
  return Promise.resolve(pending).then(
    () => { if (failed) throw failure; },
    (error: unknown) => {
      if (!failed || error === failure || (error instanceof AggregateError && error.errors.includes(failure))) throw error;
      throw new AggregateError([failure, error], "glTF resource disposal failed");
    }
  );
}

/** Abort the waiter promptly even when a user decoder does not cooperate; dispose a late result. */
async function waitForResources(
  build: Promise<GLTFRenderResources>,
  signal: AbortSignal | undefined,
  onLateCleanup: (cleanup: Promise<void>) => void
): Promise<GLTFRenderResources> {
  if (!signal) return build;
  return new Promise((resolve, reject) => {
    let aborted = false;
    const cancel = () => {
      aborted = true;
      onLateCleanup(cleanup);
      reject(signal.reason ?? new DOMException("Asset load aborted", "AbortError"));
    };
    const cleanup = build.then((resources) => {
      signal.removeEventListener("abort", cancel);
      if (aborted) return disposeRenderResources(resources);
      else resolve(resources);
    }, (error) => {
      signal.removeEventListener("abort", cancel);
      if (!aborted) reject(error);
      else if (!isExpectedResourceAbort(error, signal)) throw error;
    });
    void cleanup.catch(() => {});
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
}

/**
 * If acquisition fails with pending owned cleanup, the rejection exposes
 * `decoderCleanup: Promise<void>` so it can be awaited without delaying
 * cancellation or a retry. Non-extensible reasons are wrapped with the
 * original reason as `cause`.
 */
export async function loadProductionGLTFRenderPipeline(options: ProductionGLTFRenderPipelineOptions): Promise<ProductionGLTFRenderPipeline> {
  // Parsing and deferred image creation must observe the same acquisition
  // policy even if the caller edits a header, allowlist, or digest map later.
  const request = options.request ? { ...options.request, ...mergeAssetRequestOptions({}, options.request) } : undefined;
  const textureBudget = options.textureBudget;
  const textureBudgetDevice = options.textureBudgetDevice;
  const maxTextureSize = options.maxTextureSize;
  // Snapshot decoder configuration before scanning the document asynchronously.
  const decoderOptions = options.decoders ? { ...options.decoders } : undefined;
  const loadWarnings: ProductionGLTFRenderWarning[] = [];
  let dracoDecoder = options.dracoDecoder;
  let meshoptDecoder = options.meshoptDecoder;
  let imageDecoder = options.imageDecoder;
  let ktx2BasisTranscoderOptions = options.ktx2BasisTranscoderOptions;
  let releaseDecoder: (() => Promise<void> | undefined) | undefined;
  let pendingLeaseCleanup: Promise<void> | undefined;
  let pendingResourcesCleanup: Promise<void> | undefined;

  try {

  // P5-2 (C-16): when `options.decoders` is given, pre-scan the asset's declared extensions and
  // require the matching decoders before the parse cache runs — the parse itself needs draco /
  // meshopt, so this must happen ahead of `acquireParsedGLTFAsset`.
  const selection = { format: options.format, formatMetadata: options.formatMetadata };
  const selectedAdapter = options.formatRegistry?.select({ url: options.url, format: options.format }, selection);
  const isGltf = selectedAdapter ? selectedAdapter.id === "gltf" : !options.format || options.format === "gltf" || options.format === "glb";
  if (!options.formatRegistry && options.formatMetadata) {
    const metadata = options.formatMetadata;
    if ((metadata.adapter && metadata.adapter !== "gltf") ||
        (metadata.version && metadata.version !== "2" && metadata.version !== "2.0") ||
        (metadata.mediaType && metadata.mediaType !== "model/gltf+json" && metadata.mediaType !== "model/gltf-binary") ||
        (metadata.source && metadata.source.conversion !== "offline")) {
      throw new Error("Unsupported glTF format metadata; install the selected adapter or correct its version and media type");
    }
  }
  if (decoderOptions && isGltf) {
    const extensionsUsed = await scanGLTFExtensionsUsed(options.url, request);
    const required = requiredGLTFDecoders(extensionsUsed);
    const disabled = required.filter((id) => decoderOptions[id] === false);
    if (disabled.length > 0) {
      const id = disabled[0]!;
      const extension = Object.keys(GLTF_DECODER_EXTENSIONS).find((key) => GLTF_DECODER_EXTENSIONS[key] === id);
      loadWarnings.push({
        code: "decoder-missing",
        severity: "warning",
        message: `glTF asset declares ${extension} but the ${id} decoder is disabled in assets.decoders.`,
        nextAction: `Enable assets.decoders.${id} or ship an asset without ${extension}.`
      });
      throw new AssetDecoderUnavailable(id, options.url);
    }
    const workerAssets = decoderOptions.basePath === undefined ? currentBundledDecoderAssets() : undefined;
    const deploymentBase = (import.meta as ImportMeta & { env?: { AURA3D_DECODER_BASE_PATH?: unknown } }).env?.AURA3D_DECODER_BASE_PATH;
    const registry = sharedGLTFDecoderRegistry({
      basePath: decoderOptions.basePath ?? (typeof deploymentBase === "string" ? deploymentBase : "/aura-decoders/"),
      capabilities: options.compressedTextureCapabilities ?? NO_COMPRESSED_CAPABILITIES,
      maxTextureSize: maxTextureSize ?? 4096,
      workerCount: decoderOptions.workerCount ?? 1,
      ...(workerAssets ? { workerAssets } : {})
    });
    releaseDecoder = retainDecoderRegistry(registry);
    let cancelledDecoderWait = false;
    try {
      const set = await waitForSubscriber(registry.require(required), request?.signal, () => { cancelledDecoderWait = true; });
      if (!dracoDecoder && set.draco) dracoDecoder = trackRegistryCodec(registry, set.draco as GLTFDracoDecoder);
      if (!meshoptDecoder && set.meshopt) meshoptDecoder = trackRegistryCodec(registry, set.meshopt as GLTFMeshoptDecoder);
      imageDecoder ??= set.imageDecoder;
      // C-16's ktx2 half is a transcode-target pick (`{targetFormat}`), not a decoder function:
      // it merges into `ktx2BasisTranscoderOptions` so `decodeImageInBrowser` transcodes to the
      // capability-selected format. An explicit options.ktx2BasisTranscoderOptions wins.
      const imageDecoderHint = set.imageDecoder as { readonly targetFormat?: KTX2BasisTargetFormat } | undefined;
      if (imageDecoderHint?.targetFormat) {
        ktx2BasisTranscoderOptions = { targetFormat: imageDecoderHint.targetFormat, ...ktx2BasisTranscoderOptions };
      }
    } catch (error) {
      // A shared registry caches its decoder promises; drop it so the next load retries from scratch.
      if (!cancelledDecoderWait) dropSharedGLTFDecoderRegistry(registry);
      if (error instanceof AssetDecoderUnavailable) {
        loadWarnings.push({
          code: "decoder-missing",
          severity: "warning",
          message: `glTF decoder "${error.decoderId}" could not be loaded from ${error.url}.`,
          nextAction: "Check the decoder basePath and that the asset's compression extensions are enabled."
        });
      }
      throw error;
    }
  }

  /*
   * The parsed GLB is shared through a reference-counted cache (see `GLTFAssetParseCache`); the
   * render resources below stay per-pipeline because actors mutate their own scene graph, materials
   * and geometries. `dispose()` releases the one reference this pipeline took.
   */
  let registered: RegisteredFormatAsset<GLTFAsset> | undefined;
  let lease: { readonly asset: GLTFAsset; release(): void | Promise<void> };
  if (options.formatRegistry) {
    // The per-app registry remains authoritative for selection and its resource builder. Only
    // replace the default glTF loader when explicit decoder instances were actually selected.
    const loaderOverride = isGltf && (dracoDecoder || meshoptDecoder) ? new GLTFLoader({
      ...(dracoDecoder ? { dracoDecoder } : {}),
      ...(meshoptDecoder ? { meshoptDecoder } : {})
    }) : undefined;
    const loading = options.formatRegistry.load<GLTFAsset>(
      { ...request, url: options.url, ...(options.format ? { format: options.format } : {}) },
      new LoadContext({ signal: request?.signal }),
      { ...selection, ...(request?.signal ? { abortCleanup: "settled" as const } : {}) },
      loaderOverride
    );
    let cancelledFormatWait = false;
    try {
      registered = await waitForSubscriber(loading, request?.signal, () => { cancelledFormatWait = true; });
    } catch (error) {
      if (cancelledFormatWait && request?.signal) {
        const signal = request.signal;
        const formatCleanup: Promise<void> = loading.then(
          (late) => late.dispose(),
          (lateError: unknown) => { if (!isExpectedResourceAbort(lateError, signal)) throw lateError; }
        );
        pendingLeaseCleanup = formatCleanup;
        void formatCleanup.catch(() => {});
      }
      throw error;
    }
    const value = registered.asset;
    if (!registered.gltfRenderable || !value || typeof value.createScene !== "function" ||
        !value.loaderDiagnostics || !Array.isArray(value.meshes) || !Array.isArray(value.animations)) {
      const invalid = new Error(`Registered format ${registered.format} cannot build Aura3D model resources`);
      try { pendingLeaseCleanup = Promise.resolve(registered.dispose()); }
      catch (cleanupError) { throw new AggregateError([invalid, cleanupError], "Invalid glTF format and cleanup failed"); }
      void pendingLeaseCleanup.catch(() => {});
      let cancelledCleanup = false;
      try {
        await waitForSubscriber(pendingLeaseCleanup, request?.signal, () => { cancelledCleanup = true; });
      } catch (cleanupError) {
        if (cancelledCleanup) throw cleanupError;
        pendingLeaseCleanup = undefined;
        throw new AggregateError([invalid, cleanupError], "Invalid glTF format and cleanup failed");
      }
      pendingLeaseCleanup = undefined;
      throw invalid;
    }
    const owned = registered;
    lease = { asset: value, release: () => owned.dispose() };
  } else {
    if (!isGltf) throw new Error(`No native model adapter is installed for format ${options.format}`);
    lease = await acquireParsedGLTFAsset({
      url: options.url,
      ...(options.format ? { format: options.format as "glb" | "gltf" } : {}),
      ...(request ? { request } : {}),
      ...(dracoDecoder ? { dracoDecoder } : {}),
      ...(meshoptDecoder ? { meshoptDecoder } : {})
    });
  }
  let resources: GLTFRenderResources;
  let createdResources: GLTFRenderResources | undefined;
  let rendererInput: ReturnType<GLTFRenderResources["toRendererInput"]>;
  try {
    if (request?.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
    const resourceOptions: GLTFRenderResourceOptions = {
      ...(request ? { request } : {}),
      ...(request?.integrity ? { failOnMissingTexture: true } : {}),
      ...(imageDecoder ? { imageDecoder } : {}),
      ...(ktx2BasisTranscoderOptions ? { ktx2BasisTranscoderOptions } : {}),
      ...(options.materialVariant !== undefined ? { materialVariant: options.materialVariant } : {}),
      ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
      ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {}),
      ...(options.materialRenderStateOverrides ? { materialRenderStateOverrides: options.materialRenderStateOverrides } : {}),
      ...(textureBudget !== undefined ? { textureBudget } : {}),
      ...(textureBudgetDevice ? { textureBudgetDevice } : {}),
      ...(options.retainTextureResidencySources ? { retainTextureResidencySources: true } : {}),
      ...(maxTextureSize !== undefined ? { maxTextureSize } : {}),
      ...(options.tangents !== undefined ? { tangents: options.tangents } : {}),
      ...(options.materialsR185 ? { materialsR185: true } : {}),
      ...(options.materialsTransmission ? { materialsTransmission: true } : {}),
      ...(options.transmission !== undefined ? { transmission: options.transmission } : {}),
      ...(options.deduplicateIdenticalMaterials ? { deduplicateIdenticalMaterials: true } : {}),
      ...(options.sharedTextures ? { sharedTextures: options.sharedTextures } : {})
    };
    const pendingResources = registered
      ? registered.createGLTFRenderResources(resourceOptions)
      : createGLTFRenderResources(lease.asset, resourceOptions);
    resources = createdResources = await waitForResources(pendingResources, request?.signal, (cleanup) => { pendingResourcesCleanup = cleanup; });
    if (request?.signal?.aborted) throw request.signal.reason ?? new Error("Asset load aborted");
    rendererInput = resources.toRendererInput(
      { width: options.width ?? 512, height: options.height ?? 512 },
      {
        qualityPreset: "hdr-studio-preview",
        cameraPolicy: "require",
        ...options.rendererInput
      }
    );
  const asset = lease.asset;
  const baseMetadata = createProductionGLTFRenderMetadata(asset, options.assetId, options.assetName ?? options.assetId);
  let disposal: Promise<void> | undefined;
  let disposalFailed = false;
  let disposalObserved = false;
  let disposalObservation: Promise<void> | undefined;
  let resourceFailed = false;
  let failedResourceCleanup: Promise<void> | undefined;
  let leaseCleanup: Promise<void> | undefined;
  let decoderCleanup: Promise<void> | undefined;
  const startDisposal = (retry: boolean): void => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    disposal = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    disposalFailed = false;
    void disposal.catch(() => {});
    const failures: unknown[] = [];
    // A registered format's synchronous-only wrapper drops its target even if
    // dispose throws, so a second call to that wrapper cannot prove a retry.
    const resourceCleanup = retry && resourceFailed && registered && !resources.disposeAsync
      ? failedResourceCleanup!
      : !retry || resourceFailed ? disposeRenderResources(resources, retry) : Promise.resolve();
    if (!retry) {
      try { leaseCleanup = Promise.resolve(lease.release()); }
      catch (error) { leaseCleanup = Promise.reject(error); }
    }
    void (async () => {
      const settled = await Promise.allSettled([resourceCleanup, leaseCleanup!]);
      resourceFailed = settled[0].status === "rejected";
      failedResourceCleanup = resourceFailed ? resourceCleanup : undefined;
      for (const result of settled) if (result.status === "rejected" && !failures.includes(result.reason)) failures.push(result.reason);
      try {
        decoderCleanup ??= Promise.resolve(releaseDecoder?.());
        await decoderCleanup;
      } catch (error) { failures.push(error); }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "glTF pipeline disposal failed");
    })().then(resolve, (error: unknown) => { disposalFailed = true; reject(error); });
  };
  const dispose = (): void => {
    if (!disposal) startDisposal(false);
  };
  const disposeAsync = (): Promise<void> => {
    if (disposalObservation) return disposalObservation;
    if (!disposal) startDisposal(false);
    else if (disposalObserved && disposalFailed) startDisposal(true);
    // A synchronous disposal callback may have re-entered disposeAsync().
    if (disposalObservation) return disposalObservation;
    disposalObserved = true;
    const observed = disposal!.finally(() => {
      if (disposalObservation === observed) disposalObservation = undefined;
    });
    disposalObservation = observed;
    return observed;
  };
  return {
    asset,
    resources,
    source: rendererInput.source,
    camera: rendererInput.camera,
    metadata: {
      ...baseMetadata,
      // A glTF primitive may omit its material index. Resource creation binds
      // a real default material in that case, even though the document's
      // authored material count remains zero. Keep those facts separate and
      // read current bindings so variant changes and disposal are reflected.
      get runtimeMaterialCount() { return countBoundRuntimeMaterials(resources); },
      warnings: [
        ...loadWarnings,
        ...baseMetadata.warnings,
        ...(registered?.warnings ?? []).map((message) => ({ code: "format-diagnostic", severity: "warning" as const, message, nextAction: "Review the adapter diagnostics and supported format content." })),
        ...resources.loadIssues.map((issue) => ({
          code: issue.code,
          severity: "warning" as const,
          message: issue.detail,
          nextAction: "Inspect the named subresource or material and verify its admission and decoder configuration."
        }))
      ]
    },
    dispose,
    disposeAsync
  };
  } catch (error) {
    // A failure after parse must release both resources and their shared lease.
    // Cancellation stays prompt, while the decoder outlives late cleanup.
    const failures: unknown[] = [error];
    let createdCleanup: Promise<void> | undefined;
    if (createdResources) createdCleanup = disposeRenderResources(createdResources);
    try { pendingLeaseCleanup = Promise.resolve(lease.release()); }
    catch (cleanupError) { pendingLeaseCleanup = Promise.reject(cleanupError); }
    const cleanups = [pendingLeaseCleanup, createdCleanup, pendingResourcesCleanup].filter((work): work is Promise<void> => work !== undefined);
    if (cleanups.length > 1) pendingLeaseCleanup = combineCleanup(cleanups);
    void pendingLeaseCleanup.catch(() => {});
    if (!request?.signal?.aborted) {
      let cancelledCleanup = false;
      try {
        await waitForSubscriber(pendingLeaseCleanup, request?.signal, () => { cancelledCleanup = true; });
      } catch (cleanupError) {
        if (!cancelledCleanup) failures.push(cleanupError);
      }
      if (!cancelledCleanup) pendingLeaseCleanup = undefined;
    }
    if (failures.length > 1) throw new AggregateError(failures, "glTF pipeline acquisition and resource cleanup failed");
    throw failures[0];
  }
  } catch (error) {
    let cleanup: Promise<void> | undefined;
    try {
      cleanup = pendingLeaseCleanup ? finishFailedLease(pendingLeaseCleanup, releaseDecoder) : releaseDecoder?.();
    }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "glTF pipeline acquisition and decoder cleanup failed"); }
    if (cleanup) throw withDecoderCleanup(error, cleanup);
    throw error;
  }
}

/** Count live materials actually bound to geometry, including hidden nodes. */
function countBoundRuntimeMaterials(resources: GLTFRenderResources): number {
  const materials = new Set<object>();
  resources.scene.traverse((node) => {
    const renderable = node.renderable;
    if (!renderable || !resources.geometryLibrary.has(renderable.geometry)) return;
    const material = resources.materialLibrary.get(renderable.material);
    if (material && !material.disposed) materials.add(material);
  });
  return materials.size;
}

export function createProductionGLTFRenderMetadata(asset: GLTFAsset, assetId: string, assetName: string): ProductionGLTFRenderMetadata {
  const diagnostics: GLTFLoaderDiagnostics = asset.loaderDiagnostics;
  const materialExtensionCoverage = [...new Set(asset.materials.flatMap((material) => [
    ...(material.clearcoat ? ["KHR_materials_clearcoat"] : []),
    ...(material.sheen ? ["KHR_materials_sheen"] : []),
    ...(material.specular ? ["KHR_materials_specular"] : []),
    ...(material.transmission ? ["KHR_materials_transmission"] : []),
    ...(material.volume ? ["KHR_materials_volume"] : []),
    ...(material.ior !== undefined ? ["KHR_materials_ior"] : []),
    ...(material.anisotropy ? ["KHR_materials_anisotropy"] : []),
    ...(material.iridescence ? ["KHR_materials_iridescence"] : []),
    ...(material.dispersion !== undefined ? ["KHR_materials_dispersion"] : []),
    ...(material.diffuseRoughness ? ["KHR_materials_diffuse_roughness"] : []),
    ...(material.bump ? ["EXT_materials_bump"] : [])
  ]))].sort();
  const pbrTextureCount = asset.materials.filter((material) => material.baseColorTexture || material.metallicRoughnessTexture).length;
  return {
    assetId,
    assetName,
    assetUri: asset.url,
    meshCount: diagnostics.meshCount,
    primitiveCount: diagnostics.primitiveCount,
    materialCount: diagnostics.materialCount,
    textureCount: diagnostics.textureCount,
    imageCount: diagnostics.imageCount,
    animationCount: diagnostics.animationCount,
    skinCount: diagnostics.skinCount,
    morphTargetCount: diagnostics.morphTargetCount,
    vertexCount: diagnostics.vertexCount,
    indexCount: diagnostics.indexCount,
    textureSlots: diagnostics.textureSlots,
    materialFeatures: diagnostics.materialFeatures,
    extensionsUsed: diagnostics.extensionsUsed,
    extensionsRequired: diagnostics.extensionsRequired,
    unsupportedExtensions: diagnostics.unsupportedExtensions,
    pbrTextureCount,
    normalMapCount: asset.materials.filter((material) => material.normalTexture).length,
    ormTextureCount: asset.materials.filter((material) => material.metallicRoughnessTexture || material.occlusionTexture).length,
    emissiveTextureCount: asset.materials.filter((material) => material.emissiveTexture).length,
    materialExtensionCoverage,
    warnings: createProductionGLTFRenderWarnings(diagnostics, materialExtensionCoverage),
    hasPbr: asset.materials.some((material) => !material.unlit),
    hasSkinning: diagnostics.skinCount > 0 || asset.meshes.some((mesh) => mesh.skinIndex !== undefined),
    hasMorphTargets: diagnostics.morphTargetCount > 0,
    hasAnimation: diagnostics.animationCount > 0
  };
}

function createProductionGLTFRenderWarnings(
  diagnostics: GLTFLoaderDiagnostics,
  materialExtensionCoverage: readonly string[]
): readonly ProductionGLTFRenderWarning[] {
  const warnings: ProductionGLTFRenderWarning[] = [];
  for (const extension of diagnostics.unsupportedExtensions) {
    warnings.push({
      code: "unsupported-gltf-extension",
      severity: "warning",
      message: `Optional glTF extension ${extension} was present but is not supported by the A3D render path.`,
      nextAction: "Keep the asset loaded if the extension is optional, but inspect the visual output and document the missing feature before claiming parity."
    });
  }
  for (const extension of materialExtensionCoverage) {
    if (extension === "KHR_materials_transmission" || extension === "KHR_materials_volume") {
      warnings.push({
        code: "bounded-material-extension",
        severity: "info",
        message: `${extension} data is imported, but current production runtime visual parity is bounded and must be checked against the product-viewer comparison output.`,
        nextAction: "Use a focused material-extension scene before claiming full glass/transmission/volume parity."
      });
    }
  }
  if (diagnostics.animationCount > 0 || diagnostics.skinCount > 0 || diagnostics.morphTargetCount > 0) {
    warnings.push({
      code: "animation-skin-morph-readiness",
      severity: "info",
      message: "The asset contains animation, skinning, or morph data; production metadata preserves it, but the product viewer must explicitly enable the workflow before claiming interactive character parity.",
      nextAction: "Run animation/skinning/morph browser evidence for this asset."
    });
  }
  return warnings;
}

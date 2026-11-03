import { GLTFLoader, type GLTFAsset } from "./GLTFLoader";
import { mergeAssetRequestOptions, redactAssetUrl, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import { createRenderableScene, type CreateRenderableSceneOptions, type RenderableScene } from "./createRenderableScene";
import { createGLTFRenderResources, type GLTFRenderResourceOptions, type GLTFRenderResources } from "./GLTFRenderResources";

/** An opt-in native format and its optional bridge to the scene renderer. */
export interface FormatAdapter<T = unknown, S extends RenderableScene = RenderableScene> {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly mediaTypes?: readonly string[];
  /** Exact versions validated by this adapter. Omission means unknown. */
  readonly supportedVersions?: readonly string[];
  readonly loader: AssetLoader<T>;
  /** Synchronously validate the loaded value before it is exposed by a lease. */
  readonly validateLoadedAsset?: (asset: T, metadata: Readonly<FormatMetadata> | undefined, loader: AssetLoader<T>) => void;
  readonly buildRenderableScene?: (asset: T, options: CreateRenderableSceneOptions) => Promise<S> | S;
  readonly buildGLTFResources?: (asset: T, options: GLTFRenderResourceOptions) => Promise<GLTFRenderResources> | GLTFRenderResources;
  readonly getWarnings?: (asset: T) => readonly string[];
}

export interface FormatMetadata {
  readonly version?: string;
  readonly mediaType?: string;
  readonly adapter?: string;
  readonly source?: { readonly format: string; readonly version?: string; readonly conversion: "offline" };
}

export interface FormatSelection {
  /** Admitted output extension, which may differ from the adapter's id. */
  readonly format?: string;
  readonly formatMetadata?: FormatMetadata;
  /**
   * `settled` waits for a cancelled loader and any late-result disposal before
   * rejecting. The default `prompt` rejects immediately and cleans up later.
   * A loader that never settles can keep the `settled` result pending.
   */
  readonly abortCleanup?: "prompt" | "settled";
}

/** The adapter and every scene built by this lease are released exactly once. */
export interface RegisteredFormatAsset<T = unknown, S extends RenderableScene = RenderableScene> {
  readonly format: string;
  readonly formatMetadata?: FormatMetadata;
  readonly asset: T;
  readonly disposed: boolean;
  readonly renderable: boolean;
  readonly gltfRenderable: boolean;
  readonly warnings: readonly string[];
  createRenderableScene(options?: CreateRenderableSceneOptions): Promise<S>;
  createGLTFRenderResources(options?: GLTFRenderResourceOptions): Promise<GLTFRenderResources>;
  dispose(): Promise<void>;
}

/**
 * A registry is explicit and instance-scoped: installing an adapter does not
 * change another app's format policy or pull every optional loader into its bundle.
 */
export class FormatRegistry {
  private readonly adapters = new Map<string, FormatAdapter<any, any>>();
  private generationValue = 0;

  /** Increments when registry membership changes, for cache identity. */
  get generation(): number { return this.generationValue; }

  register<T, S extends RenderableScene>(adapter: FormatAdapter<T, S>): void {
    if (!/^[a-z][a-z0-9._-]*$/.test(adapter.id)) throw new Error(`Invalid format id: ${adapter.id}`);
    if (this.adapters.has(adapter.id)) throw new Error(`Format already registered: ${adapter.id}`);
    const extensions = adapter.extensions.map((extension) => extension.replace(/^\./, "").toLowerCase());
    if (extensions.some((extension) => !/^[a-z0-9][a-z0-9._-]*$/.test(extension))) throw new Error(`Invalid extension for format ${adapter.id}`);
    const mediaTypes = adapter.mediaTypes?.map((mediaType) => mediaType.toLowerCase());
    if (mediaTypes?.some((mediaType) => !/^[\w.+-]+\/[\w.+-]+$/.test(mediaType))) throw new Error(`Invalid media type for format ${adapter.id}`);
    this.adapters.set(adapter.id, { ...adapter, extensions, mediaTypes });
    this.generationValue++;
  }

  unregister(id: string): boolean {
    const removed = this.adapters.delete(id);
    if (removed) this.generationValue++;
    return removed;
  }

  list(): readonly string[] {
    return [...this.adapters.keys()];
  }

  select(request: AssetLoadRequest, selection: FormatSelection = {}): FormatAdapter<any, any> {
    const { formatMetadata } = selection;
    const requested = formatMetadata?.adapter ?? (request.type && request.type !== "auto" ? request.type : undefined);
    const outputFormat = (selection.format ?? request.format)?.replace(/^\./, "").toLowerCase();
    const direct = requested ? this.adapters.get(requested) : undefined;
    if (formatMetadata?.adapter && !direct) throw new Error(`No native format adapter registered for ${requested}`);
    const mediaType = formatMetadata?.mediaType?.toLowerCase() ?? /^data:([^;,]+)/i.exec(request.url)?.[1]?.toLowerCase();
    const path = request.url.split(/[?#]/, 1)[0].toLowerCase();
    const extension = outputFormat ?? requested?.replace(/^\./, "").toLowerCase();
    const candidates = direct ? [direct] : [...this.adapters.values()].filter((adapter) => extension
      ? adapter.extensions.includes(extension)
      : (mediaType && adapter.mediaTypes?.includes(mediaType)) ||
        (!mediaType && adapter.extensions.some((value) => path.endsWith(`.${value}`))));
    if (candidates.length === 0) throw new Error(`No native format adapter can load ${redactAssetUrl(request.url)}`);
    if (candidates.length > 1) throw new Error(`Ambiguous native asset format for ${redactAssetUrl(request.url)}: ${candidates.map((candidate) => candidate.id).join(", ")}`);
    const selected = candidates[0];
    if (outputFormat && !selected.extensions.includes(outputFormat)) throw new Error(`Format ${outputFormat} is not supported by adapter ${selected.id}`);
    if (request.type && request.type !== "auto" && request.type !== selected.id &&
        !selected.extensions.includes(request.type.replace(/^\./, "").toLowerCase())) {
      throw new Error(`Requested type ${request.type} is not supported by adapter ${selected.id}`);
    }
    if (formatMetadata?.mediaType && !selected.mediaTypes?.includes(formatMetadata.mediaType.toLowerCase())) {
      throw new Error(`Media type ${formatMetadata.mediaType} is not supported by adapter ${selected.id}`);
    }
    if (formatMetadata?.version !== undefined && !selected.supportedVersions?.includes(formatMetadata.version)) {
      throw new Error(`Format version ${formatMetadata.version} is not supported by adapter ${selected.id}`);
    }
    if (formatMetadata?.source && formatMetadata.source.conversion !== "offline") throw new Error("Unknown asset conversion provenance");
    return selected;
  }

  async load<T = unknown, S extends RenderableScene = RenderableScene>(request: AssetLoadRequest, context: LoadContext, selection: FormatSelection = {}, overrideLoader?: AssetLoader<T>): Promise<RegisteredFormatAsset<T, S>> {
    // Selection, loading and validation must use the same admitted values even
    // when the caller mutates the original request while I/O is pending.
    const originalRequest = { ...request };
    const admittedRequest: AssetLoadRequest = { ...originalRequest, ...mergeAssetRequestOptions({}, originalRequest) };
    const metadata = snapshotFormatMetadata(selection.formatMetadata);
    const abortCleanup = selection.abortCleanup ?? "prompt";
    if (abortCleanup !== "prompt" && abortCleanup !== "settled") throw new TypeError("Invalid format abort cleanup mode");
    const admittedSelection = { format: selection.format, formatMetadata: metadata };
    const selected = this.select(admittedRequest, admittedSelection) as FormatAdapter<T, S>;
    if (overrideLoader && overrideLoader.type !== selected.loader.type) {
      throw new Error(`Loader type ${overrideLoader.type} is incompatible with adapter ${selected.id}`);
    }
    // A caller may supply a configured instance of the selected loader (for
    // example a glTF decoder set); selection and version checks still apply.
    const adapter = { ...selected, loader: overrideLoader ?? selected.loader };
    const signal = context.signalFor(admittedRequest.signal);
    if (abortCleanup === "settled" && signal?.aborted) throw abortReason(signal);
    throwIfAborted(admittedRequest, context);
    const loading = Promise.resolve().then(() => {
      // The caller can cancel after load() returns and before this scheduled
      // callback runs. Do not start an abort-ignoring loader in that window.
      throwIfAborted(admittedRequest, context);
      return adapter.loader.load(admittedRequest, context);
    });
    const value = await waitForLoadedAsset(loading, signal, adapter.loader, abortCleanup);
    try {
      throwIfAborted(admittedRequest, context);
      const validation: unknown = adapter.validateLoadedAsset?.(value, metadata, adapter.loader);
      if (validation !== undefined) {
        // A Promise-returning callback would otherwise let the lease escape
        // before validation. Observe its rejection and fail closed instead.
        if ((typeof validation === "object" && validation !== null) || typeof validation === "function") {
          if (typeof (validation as { then?: unknown }).then === "function") void Promise.resolve(validation).catch(() => {});
        }
        throw new TypeError(`Format ${adapter.id} validation must complete synchronously without a return value`);
      }
      throwIfAborted(admittedRequest, context);
      return createLease(adapter, value, metadata);
    } catch (error) {
      try { await adapter.loader.dispose?.(value); }
      catch (cleanupError) {
        if (abortCleanup === "settled" && signal?.aborted) {
          const reason = abortReason(signal);
          const errors = isAbortFailure(error, reason) ? [reason, cleanupError] : [reason, error, cleanupError];
          throw taggedAbortFailure(errors, "FORMAT_ABORT_CLEANUP_FAILED");
        }
        throw new AggregateError([error, cleanupError], `Failed to validate and dispose format asset ${adapter.id}`);
      }
      if (abortCleanup === "settled" && signal?.aborted) {
        const reason = abortReason(signal);
        if (isAbortFailure(error, reason)) throw reason;
      }
      throw error;
    }
  }
}

function snapshotFormatMetadata(metadata: FormatMetadata | undefined): FormatMetadata | undefined {
  if (!metadata) return metadata;
  const copy = { ...metadata };
  return Object.freeze(copy.source ? { ...copy, source: Object.freeze({ ...copy.source }) } : copy);
}

function waitForLoadedAsset<T>(loading: Promise<T>, signal: AbortSignal | undefined, loader: AssetLoader<T>, abortCleanup: "prompt" | "settled"): Promise<T> {
  if (!signal) return loading;
  return new Promise((resolve, reject) => {
    let aborted = false;
    let reason: unknown;
    const cancel = () => {
      if (aborted) return;
      aborted = true;
      reason = abortReason(signal);
      if (abortCleanup === "prompt") reject(reason);
    };
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    loading.then((value) => {
      signal.removeEventListener("abort", cancel);
      if (!aborted) { resolve(value); return; }
      const cleanup = Promise.resolve().then(() => loader.dispose?.(value));
      if (abortCleanup === "prompt") void cleanup.catch(() => {});
      else void cleanup.then(() => reject(reason), (error) => reject(taggedAbortFailure([reason, error], "FORMAT_ABORT_CLEANUP_FAILED")));
    }, (error) => {
      signal.removeEventListener("abort", cancel);
      if (!aborted) reject(error);
      else if (abortCleanup === "settled") {
        reject(isAbortFailure(error, reason) ? reason : taggedAbortFailure([reason, error], "FORMAT_ABORT_LOAD_FAILED"));
      }
    });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Asset load aborted", "AbortError");
}

function isAbortFailure(error: unknown, reason: unknown): boolean {
  try {
    let current = error;
    for (let depth = 0; depth < 8; depth += 1) {
      if (Object.is(current, reason)) return true;
      if (typeof current !== "object" || current === null) return false;
      const candidate = current as { readonly name?: unknown; readonly message?: unknown; readonly cause?: unknown };
      // An aggregate may contain a cleanup failure even if one of its causes
      // is an abort. Preserve it rather than treating it as plain cancellation.
      if (candidate.name === "AggregateError") return false;
      if (candidate.name === "AbortError") return true;
      if (candidate.name === "AssetLoadError" && candidate.message === "Asset load aborted") {
        const cause = candidate.cause as { readonly name?: unknown } | null | undefined;
        return cause?.name !== "AggregateError";
      }
      current = candidate.cause;
    }
  } catch { /* Treat an uninspectable loader failure as a distinct failure. */ }
  return false;
}

function taggedAbortFailure(errors: readonly unknown[], code: "FORMAT_ABORT_CLEANUP_FAILED" | "FORMAT_ABORT_LOAD_FAILED"): AggregateError & { readonly code: string } {
  return Object.assign(new AggregateError(errors, code === "FORMAT_ABORT_CLEANUP_FAILED"
    ? "Failed to dispose a cancelled format asset"
    : "Format loader failed after cancellation"), { code });
}

function createLease<T, S extends RenderableScene>(adapter: FormatAdapter<T, S>, asset: T, formatMetadata?: FormatMetadata): RegisteredFormatAsset<T, S> {
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const resources = new Set<{ dispose(): void }>();
  const pending = new Set<Promise<unknown>>();

  async function buildOwned<R extends { dispose(): void }>(builder: () => Promise<R> | R, kind?: RenderableAssetKindOverride): Promise<R> {
    if (disposed) throw new Error(`Format asset ${adapter.id} has been disposed`);
    const build = Promise.resolve().then(builder);
    pending.add(build);
    let result: R;
    try { result = await build; } finally { pending.delete(build); }
    if (disposed) {
      result.dispose();
      throw new Error(`Format asset ${adapter.id} was disposed while creating render resources`);
    }
    let live = true;
    const wrapper = new Proxy({} as R, {
      get(_target, property) {
        if (property === "dispose") return () => {
          if (!live) return;
          live = false;
          resources.delete(wrapper);
          result.dispose();
        };
        if (property === "kind" && kind) return kind;
        const value = Reflect.get(result, property, result);
        return typeof value === "function" ? value.bind(result) : value;
      },
      set(_target, property, value) { return Reflect.set(result, property, value, result); },
      has(_target, property) { return property in result; },
      getPrototypeOf() { return Object.getPrototypeOf(result); },
      ownKeys() { return Reflect.ownKeys(result); },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(result, property);
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      }
    });
    resources.add(wrapper);
    return wrapper;
  }

  return {
    format: adapter.id,
    formatMetadata,
    asset,
    get disposed() { return disposed; },
    get renderable() { return adapter.buildRenderableScene !== undefined; },
    get gltfRenderable() { return adapter.buildGLTFResources !== undefined; },
    warnings: adapter.getWarnings?.(asset) ?? [],
    async createRenderableScene(options = {}) {
      if (disposed) throw new Error(`Format asset ${adapter.id} has been disposed`);
      if (!adapter.buildRenderableScene) throw new Error(`Format ${adapter.id} does not provide a scene resource builder`);
      return buildOwned(() => adapter.buildRenderableScene!(asset, options), adapter.id === "gltf" ? "gltf" : "native-format");
    },
    async createGLTFRenderResources(options = {}) {
      if (disposed) throw new Error(`Format asset ${adapter.id} has been disposed`);
      if (!adapter.buildGLTFResources) throw new Error(`Format ${adapter.id} does not provide a glTF resource builder`);
      return buildOwned(() => adapter.buildGLTFResources!(asset, options));
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        const errors: unknown[] = [];
        await Promise.allSettled([...pending]);
        for (const resource of [...resources]) {
          try { resource.dispose(); } catch (error) { errors.push(error); }
        }
        try { await adapter.loader.dispose?.(asset); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, `Failed to dispose format asset ${adapter.id}`);
      })();
      return disposal;
    }
  };
}

type RenderableAssetKindOverride = "gltf" | "native-format";

function throwIfAborted(request: AssetLoadRequest, context: LoadContext): void {
  context.throwIfAborted(request.url);
  if (request.signal?.aborted) throw request.signal.reason ?? new DOMException("Asset load aborted", "AbortError");
}

/** Wrap a loader whose output uses the native glTF scene representation. */
export function createGLTFFormatAdapter<T extends GLTFAsset>(
  id: string,
  extensions: readonly string[],
  loader: AssetLoader<T>,
  mediaTypes?: readonly string[],
  supportedVersions?: readonly string[]
): FormatAdapter<T> {
  return {
    id,
    extensions,
    mediaTypes,
    supportedVersions,
    loader,
    getWarnings: gltfWarnings,
    buildGLTFResources: (gltf, options) => createGLTFRenderResources(gltf, options),
    buildRenderableScene: (gltf, options) => createRenderableScene({
      kind: "gltf",
      url: gltf.url,
      gltf,
      warnings: gltfWarnings(gltf)
    }, options)
  };
}

function gltfWarnings(gltf: GLTFAsset): readonly string[] {
  return [
    ...gltf.loaderDiagnostics.unsupportedExtensions.map((extension) => `Unsupported glTF extension remains blocked: ${extension}`),
    ...gltf.loaderDiagnostics.unsupportedFeatures.map((feature) => `Unsupported asset feature: ${feature}`)
  ];
}

/** Create an isolated registry containing only glTF; install optional adapters explicitly. */
export function createDefaultFormatRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  registry.register(createGLTFFormatAdapter("gltf", ["gltf", "glb"], new GLTFLoader(), ["model/gltf+json", "model/gltf-binary"], ["2", "2.0"]));
  return registry;
}

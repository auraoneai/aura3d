import { createCanonicalProductSceneRenderKit, type CanonicalProductSceneFixture } from "@aura3d/rendering";
import { mergeAssetRequestOptions, redactAssetUrl, type AssetLoadProgress } from "./AssetLoader";
import type { GLTFAsset } from "./GLTFLoader";
import { createDefaultFormatRegistry, type FormatMetadata, type FormatRegistry, type RegisteredFormatAsset } from "./FormatRegistry";
import { fetchBytes } from "./LoaderFetch";
import { LoadContext, type LoadContextOptions } from "./LoadContext";

export type RenderableAssetKind = "canonical-product-scene" | "gltf" | "native-format";

export interface RenderableAsset {
  readonly kind: RenderableAssetKind;
  readonly url?: string;
  /** The adapter actually selected, rather than a filename-based guess. */
  readonly selectedFormat?: string;
  readonly formatMetadata?: FormatMetadata;
  readonly canonical?: CanonicalProductSceneFixture;
  readonly gltf?: GLTFAsset;
  readonly format?: RegisteredFormatAsset;
  readonly warnings: readonly string[];
  /** Release the parsed asset and any format-owned render resources. */
  dispose?(): Promise<void>;
}

export interface LoadRenderableAssetOptions extends LoadContextOptions {
  /** An adapter id, "auto", or the deliberately selected canonical fixture. */
  readonly type?: string;
  readonly formatRegistry?: FormatRegistry;
  readonly format?: string;
  readonly formatMetadata?: FormatMetadata;
  readonly onProgress?: (event: AssetLoadProgress) => void;
}

export async function loadRenderableAsset(
  urlOrAsset: string | RenderableAsset,
  options: LoadRenderableAssetOptions = {}
): Promise<RenderableAsset> {
  if (typeof urlOrAsset !== "string") return urlOrAsset;
  const context = new LoadContext(options);
  const url = context.resolve(urlOrAsset);
  context.throwIfAborted(url);

  // This is a synthetic, named fixture, never an automatic fallback for a file.
  if (options.type === "canonical-product-scene") {
    const manifest = await loadCanonicalManifest(url, context, options);
    const kit = createCanonicalProductSceneRenderKit();
    try {
      return {
        kind: "canonical-product-scene",
        selectedFormat: "canonical-product-scene",
        url,
        canonical: kit.canonical,
        warnings: manifest.blockedClaims.length ? [`Blocked claims remain: ${manifest.blockedClaims.join(", ")}`] : []
      };
    } finally {
      kit.dispose();
    }
  }

  const registry = options.formatRegistry ?? createDefaultFormatRegistry();
  const type = options.type && options.type !== "auto" ? options.type : undefined;
  const lease = await registry.load({ ...options, url, type }, context, { format: options.format, formatMetadata: options.formatMetadata });
  if (lease.format === "gltf") {
    const gltf = lease.asset as GLTFAsset;
    return {
      kind: "gltf",
      selectedFormat: lease.format,
      formatMetadata: lease.formatMetadata,
      url,
      gltf,
      format: lease,
      warnings: lease.warnings,
      dispose: () => lease.dispose()
    };
  }
  return {
    kind: "native-format",
    selectedFormat: lease.format,
    formatMetadata: lease.formatMetadata,
    url,
    format: lease,
    warnings: lease.warnings,
    dispose: () => lease.dispose()
  };
}

async function loadCanonicalManifest(url: string, context: LoadContext, options: LoadRenderableAssetOptions): Promise<{ readonly blockedClaims: readonly string[] }> {
  const signal = context.signalFor(options.signal);
  const policy = mergeAssetRequestOptions(context.requestOptionsFor(url), options);
  const bytes = await fetchBytes(url, signal, options.onProgress
    ? ({ loaded, total }) => options.onProgress!({ url, phase: "document", loadedBytes: loaded, ...(total !== undefined ? { totalBytes: total } : {}) })
    : undefined, { ...policy, maxBytes: policy.maxBytes ?? 1024 * 1024 });
  context.throwIfAborted(url);
  if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch (error) { throw new Error(`Invalid canonical fixture manifest for ${redactAssetUrl(url)}`, { cause: error }); }
  if (!isRecord(parsed) || parsed.schemaVersion !== "a3d-engine-readiness-canonical-product-scene" ||
      parsed.kind !== "canonical-product-scene" || parsed.sourceFixture !== "createCanonicalProductSceneRenderKit" ||
      (parsed.blockedClaims !== undefined && (!Array.isArray(parsed.blockedClaims) || parsed.blockedClaims.some((claim) => typeof claim !== "string")))) {
    throw new Error(`Invalid canonical fixture manifest for ${redactAssetUrl(url)}`);
  }
  options.onProgress?.({ url, phase: "complete", loadedBytes: bytes.byteLength, totalBytes: bytes.byteLength });
  return { blockedClaims: (parsed.blockedClaims ?? []) as string[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

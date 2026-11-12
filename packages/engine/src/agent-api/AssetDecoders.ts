import {
  AssetDecoderUnavailable,
  createAssetDecoderRegistry,
  ensureCompressedTextureSupport,
  type AssetDecoderId,
  type AssetDecoderRegistry,
  type AuraAssetDecoderSet,
  type CompressedTextureDecoderProbes,
  type CompressedTextureSupportDiagnostics,
  type CompressedTextureSupportRequest,
  type KTX2BasisTargetFormat
} from "@aura3d/assets/browser";
import type { CompressedTextureCapabilities, QrFlags } from "@aura3d/rendering/contracts";
import type { AuraAssetDefinition } from "./index.js";
import type { AuraAssetDecodersOption, AuraAssetsOption, AuraAssetRequiredDecoder } from "../contracts/assets.js";
import type { AuraQualityTierSettings } from "@aura3d/rendering/contracts";
import { currentWorkerAssets } from "@aura3d/core";

/**
 * C-16 §7.3 — one AssetDecoderRegistry per app.
 *
 * `createAppAssetDecoders(options.assets, caps, tier)` builds the registry from
 * the pre-declared C-38 options (`assets.decoders.{basePath,meshopt,draco,
 * ktx2,workerCount}`, `assets.maxTextureSize` defaulting to the C-27 tier cap).
 * Decoder booleans act as disables: meshopt/ktx2 default on, draco lazy —
 * a model that needs a disabled decoder fails `prepareModelDecoders` with
 * `AssetDecoderUnavailable`.
 *
 * MEM-1: WebGPU hardware block-compressed texture capability detection from
 * active/supplied `GPUDevice.features` (`"texture-compression-astc"`,
 * `"texture-compression-etc2"`, `"texture-compression-bc"`). In headless Node
 * when no WebGPU device features are active, `WEBGPU_COMPRESSED_CAPS` resolves
 * to all-`false` so KTX2 selection falls through cleanly to `rgba8`.
 */
export interface WebGPUFeatureSetLike {
  has(feature: string): boolean;
}

export type WebGPUCompressedCapabilitySource =
  | WebGPUFeatureSetLike
  | ReadonlySet<string>
  | readonly string[]
  | {
      readonly kind?: string;
      readonly features?: WebGPUFeatureSetLike | ReadonlySet<string> | readonly string[] | null;
      readonly nativeGpuDevice?: { readonly features?: WebGPUFeatureSetLike | ReadonlySet<string> | readonly string[] | null } | null;
      readonly device?: { readonly features?: WebGPUFeatureSetLike | ReadonlySet<string> | readonly string[] | null } | null;
    };

const ACTIVE_WEBGPU_FEATURES_KEY = Symbol.for("@aura3d/rendering/activeWebGPUFeatures/v1");

function resolveWebGPUFeatureLookup(source?: WebGPUCompressedCapabilitySource | null): ((feature: string) => boolean) | null {
  const candidate = source === undefined
    ? (globalThis as Record<symbol, unknown>)[ACTIVE_WEBGPU_FEATURES_KEY] as WebGPUCompressedCapabilitySource | (() => WebGPUCompressedCapabilitySource | null | undefined) | undefined
    : source;
  const resolved = typeof candidate === "function" ? candidate() : candidate;
  if (!resolved || typeof resolved !== "object") return null;
  if (Array.isArray(resolved)) {
    const set = new Set(resolved);
    return (feature) => set.has(feature);
  }
  if (typeof (resolved as WebGPUFeatureSetLike).has === "function") {
    const featureSet = resolved as WebGPUFeatureSetLike;
    return (feature) => Boolean(featureSet.has(feature));
  }
  const wrapper = resolved as Exclude<WebGPUCompressedCapabilitySource, WebGPUFeatureSetLike | ReadonlySet<string> | readonly string[]>;
  let features = wrapper.features ?? null;
  if (!features && wrapper.nativeGpuDevice && typeof wrapper.nativeGpuDevice === "object") {
    try {
      features = wrapper.nativeGpuDevice.features ?? null;
    } catch {
      features = null;
    }
  }
  if (!features && wrapper.device && typeof wrapper.device === "object") {
    features = wrapper.device.features ?? null;
  }
  if (!features) return null;
  if (Array.isArray(features)) {
    const set = new Set(features);
    return (feature) => set.has(feature);
  }
  if (typeof (features as WebGPUFeatureSetLike).has === "function") {
    const featureSet = features as WebGPUFeatureSetLike;
    return (feature) => Boolean(featureSet.has(feature));
  }
  return null;
}

/**
 * Detect `CompressedTextureCapabilities` from a WebGPU `RenderDevice`, native
 * `GPUDevice`/`GPUAdapter`, or feature set (`"texture-compression-astc"`,
 * `"texture-compression-etc2"`, `"texture-compression-bc"`).
 * Note: WebGPU `"texture-compression-bc"` enables BC7 (`bptc: true`) for UASTC;
 * `s3tc`/`s3tcSrgb` remain `false` unless `"bc1-rgb-unorm"` is explicitly listed
 * because WebGPU has no 3-channel `bc1-rgb-unorm` format without RGBA8 fallback.
 */
export function detectWebGPUCompressedTextureCapabilities(
  source?: WebGPUCompressedCapabilitySource | null
): CompressedTextureCapabilities {
  const has = resolveWebGPUFeatureLookup(source);
  if (!has) {
    return {
      astc: false,
      bptc: false,
      etc2: false,
      s3tc: false,
      s3tcSrgb: false
    };
  }
  const hasBc = has("texture-compression-bc");
  const hasExplicitS3tc = has("bc1-rgb-unorm") || has("s3tc");
  return {
    astc: has("texture-compression-astc"),
    bptc: hasBc,
    etc2: has("texture-compression-etc2"),
    s3tc: hasExplicitS3tc,
    s3tcSrgb: hasExplicitS3tc && (hasBc || has("s3tc-srgb"))
  };
}

/** Register or clear the active WebGPU feature set for default `WEBGPU_COMPRESSED_CAPS` lookups. */
export function setActiveWebGPUCompressedFeatureSource(
  source: WebGPUCompressedCapabilitySource | (() => WebGPUCompressedCapabilitySource | null | undefined) | null | undefined
): void {
  const globalStore = globalThis as Record<symbol, unknown>;
  if (source == null) {
    delete globalStore[ACTIVE_WEBGPU_FEATURES_KEY];
  } else {
    globalStore[ACTIVE_WEBGPU_FEATURES_KEY] = source;
  }
}

export const WEBGPU_COMPRESSED_CAPS: CompressedTextureCapabilities = {
  get astc(): boolean {
    return detectWebGPUCompressedTextureCapabilities().astc;
  },
  get bptc(): boolean {
    return detectWebGPUCompressedTextureCapabilities().bptc;
  },
  get etc2(): boolean {
    return detectWebGPUCompressedTextureCapabilities().etc2;
  },
  get s3tc(): boolean {
    return detectWebGPUCompressedTextureCapabilities().s3tc;
  },
  get s3tcSrgb(): boolean {
    return detectWebGPUCompressedTextureCapabilities().s3tcSrgb;
  }
};

export interface AppAssetDecoders {
  readonly registry: AssetDecoderRegistry;
  readonly diagnostics: AssetDecoderRegistry["diagnostics"];
}

/** Build-scoped plugin value; non-Vite and separately bundled callers retain the root default. */
function defaultDecoderBasePath(): string {
  const base = (import.meta as ImportMeta & { env?: { AURA3D_DECODER_BASE_PATH?: unknown } }).env?.AURA3D_DECODER_BASE_PATH;
  return typeof base === "string" ? base : "/aura-decoders/";
}

export function createAppAssetDecoders(
  options: AuraAssetsOption | undefined,
  caps: CompressedTextureCapabilities,
  tier: Pick<AuraQualityTierSettings, "maxTextureSize">
): AssetDecoderRegistry & { disposeAsync(): Promise<void> } {
  const decoderOptions = options?.decoders ?? {};
  const basePath = decoderOptions.basePath ?? defaultDecoderBasePath();
  const maxTextureSize = options?.maxTextureSize ?? tier.maxTextureSize;
  const workerCount = decoderOptions.workerCount ?? (maxTextureSize <= 1024 ? 1 : 2);
  const workerAssets = decoderOptions.basePath === undefined ? currentWorkerAssets() : undefined;
  const inner = createAssetDecoderRegistry({ basePath, capabilities: caps, maxTextureSize, workerCount, ...(workerAssets ? { workerAssets } : {}) });
  const disabled = new Set<AssetDecoderId>();
  if (decoderOptions.meshopt === false) disabled.add("meshopt");
  if (decoderOptions.draco === false) disabled.add("draco");
  if (decoderOptions.ktx2 === false) disabled.add("ktx2");
  if (disabled.size === 0) return inner;
  // Fail-closed facade: a model demanding a disabled decoder gets
  // AssetDecoderUnavailable instead of a silent load.
  return {
    require(ids: readonly AssetDecoderId[]) {
      const blocked = ids.find((id) => disabled.has(id));
      if (blocked) return Promise.reject(new AssetDecoderUnavailable(blocked, `${basePath}${blocked}/`));
      return inner.require(ids);
    },
    diagnostics: () => inner.diagnostics(),
    dispose: () => inner.dispose(),
    disposeAsync: () => inner.disposeAsync()
  };
}

/**
 * Resolves the decoders a model needs — `asset.requiredDecoders` from the
 * manifest, else the GLB's own `extensionsUsed`/`extensionsRequired` header —
 * and `require`s them on the app's registry. Throws `AssetDecoderUnavailable`
 * (decoder id + URL) when one cannot load.
 */
export async function prepareModelDecoders(
  asset: Pick<AuraAssetDefinition, "url" | "format" | "requiredDecoders">,
  registry: AssetDecoderRegistry
): Promise<AuraAssetDecoderSet> {
  const required: readonly AssetDecoderId[] = asset.requiredDecoders ?? await sniffGLBRequiredDecoders(asset.url, asset.format);
  return registry.require(required);
}

const EXTENSION_DECODERS: Readonly<Record<string, AuraAssetRequiredDecoder>> = {
  EXT_meshopt_compression: "meshopt",
  KHR_draco_mesh_compression: "draco",
  KHR_texture_basisu: "ktx2"
};

/**
 * Reads just the GLB JSON chunk (two ranged fetches) and maps
 * `extensionsUsed`/`extensionsRequired` onto decoder ids. Non-GLB assets and
 * unreadable URLs resolve to `[]` — never breaks a load that may not need
 * compression decoders at all.
 */
export async function sniffGLBRequiredDecoders(url: string, format?: string): Promise<AuraAssetRequiredDecoder[]> {
  const isGlb = format === "glb" || /\.glb(?:[?#]|$)/i.test(url);
  if (!isGlb || typeof fetch !== "function" || url.startsWith("data:")) return [];
  try {
    // Dev/static servers commonly ignore Range and answer 200 with the whole
    // file — slice the requested window locally instead of assuming a 206.
    const readRange = async (from: number, to: number): Promise<ArrayBuffer | null> => {
      const response = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
      if (!response.ok) return null;
      const body = await response.arrayBuffer();
      if (response.status === 206) return body;
      return body.byteLength > to ? body.slice(from, to + 1) : body;
    };
    const headBytes = await readRange(0, 19);
    if (headBytes === null) return [];
    const header = new DataView(headBytes);
    if (header.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67) return [];
    const jsonLength = header.getUint32(12, true);
    if (header.getUint32(16, true) !== 0x4e4f534a || jsonLength <= 0 || jsonLength > 64 * 1024 * 1024) return [];
    const jsonBytes = await readRange(20, 20 + jsonLength - 1);
    if (jsonBytes === null) return [];
    const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
      extensionsUsed?: string[];
      extensionsRequired?: string[];
    };
    const ids = new Set<AuraAssetRequiredDecoder>();
    for (const extension of [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]) {
      const decoder = EXTENSION_DECODERS[extension];
      if (decoder) ids.add(decoder);
    }
    return [...ids];
  } catch {
    return [];
  }
}

/**
 * Root one-call decoder setup (muse3jsparity-PRD M2, updated by PRD-05 §7.3).
 *
 * Wraps `ensureCompressedTextureSupport`: meshopt and ktx2 default on (the
 * meshoptimizer package ships with the build; the basis transcoder is served
 * vendored at `aura-decoders/basis/`), draco is lazy on `require(["draco"])`.
 * Probes hit the vendored decoder paths/package — no more synthetic fail-closed
 * defaults; `chosenKtx2Target` goes through `selectKTX2TargetFormat` whenever
 * real GPU capability tokens are supplied.
 */
export async function ensureAssetDecoders(
  request: CompressedTextureSupportRequest = {},
  probes: CompressedTextureDecoderProbes = {}
): Promise<CompressedTextureSupportDiagnostics> {
  return ensureCompressedTextureSupport(request, probes);
}

export const assets = {
  ensureDecoders: ensureAssetDecoders,
  createAppAssetDecoders,
  prepareModelDecoders
} as const;

/** The decoder fields `createTypedGLBActor` forwards to `loadProductionGLTFRenderPipeline`. */
export interface TypedGLBActorDecoderOptions {
  readonly decoders?: AuraAssetDecodersOption;
  readonly maxTextureSize?: number;
  readonly compressedTextureCapabilities?: CompressedTextureCapabilities;
}

/**
 * 05-WIRE (C-16 §7.3): the lane-05 half of putting the decoder registry on the
 * default `model()` path. The compiler (Q-15-1, `compiler/renderer.ts`) spreads
 * the result into every `createTypedGLBActor({...})` call:
 *
 *   ...typedGLBActorDecoderOptions(flags, options.assets, caps)
 *
 * With `A3D_QR_ASSETS` on, it always returns `decoders` (an empty object when
 * the app sets no `assets.decoders`), so the pipeline scans
 * `extensionsUsed`/`extensionsRequired` and requires meshopt/draco/ktx2
 * before parsing. A missing or disabled decoder then fails closed with
 * `AssetDecoderUnavailable` instead of parsing a compressed GLB with no
 * decoder. With the flag off it returns `{}`, so the legacy path is
 * byte-identical.
 */
export function typedGLBActorDecoderOptions(
  flags: Pick<QrFlags, "on">,
  assetsOption: AuraAssetsOption | undefined,
  caps?: CompressedTextureCapabilities
): TypedGLBActorDecoderOptions {
  if (!flags.on("A3D_QR_ASSETS")) return {};
  const activeWebGpuCaps = caps === undefined ? detectWebGPUCompressedTextureCapabilities() : undefined;
  const resolvedCaps = caps ?? (
    activeWebGpuCaps && (activeWebGpuCaps.astc || activeWebGpuCaps.bptc || activeWebGpuCaps.etc2 || activeWebGpuCaps.s3tc || activeWebGpuCaps.s3tcSrgb)
      ? activeWebGpuCaps
      : undefined
  );
  return {
    decoders: assetsOption?.decoders ?? {},
    ...(assetsOption?.maxTextureSize !== undefined ? { maxTextureSize: assetsOption.maxTextureSize } : {}),
    ...(resolvedCaps ? { compressedTextureCapabilities: resolvedCaps } : {})
  };
}

export {
  AssetDecoderUnavailable
};

export type {
  AssetDecoderId,
  AssetDecoderRegistry,
  AuraAssetDecoderSet,
  CompressedTextureDecoderProbes,
  CompressedTextureSupportDiagnostics,
  CompressedTextureSupportRequest,
  KTX2BasisTargetFormat
};

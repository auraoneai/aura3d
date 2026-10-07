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
import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";
import type { AuraAssetDefinition } from "./index.js";
import type { AuraAssetsOption, AuraAssetRequiredDecoder } from "../contracts/assets.js";
import type { AuraQualityTierSettings } from "@aura3d/rendering/contracts";

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
 * Q-11-1: WebGPU has no compressed-upload path yet — callers pass
 * `WEBGPU_COMPRESSED_CAPS` (all-false) there so KTX2 selection falls through
 * to rgba8 until the WebGPU format table lands (tracked by Q-11-1).
 */
export const WEBGPU_COMPRESSED_CAPS: CompressedTextureCapabilities = {
  astc: false,
  bptc: false,
  etc2: false,
  s3tc: false,
  s3tcSrgb: false
};

export interface AppAssetDecoders {
  readonly registry: AssetDecoderRegistry;
  readonly diagnostics: AssetDecoderRegistry["diagnostics"];
}

export function createAppAssetDecoders(
  options: AuraAssetsOption | undefined,
  caps: CompressedTextureCapabilities,
  tier: Pick<AuraQualityTierSettings, "maxTextureSize">
): AssetDecoderRegistry {
  const decoderOptions = options?.decoders ?? {};
  const basePath = decoderOptions.basePath ?? "/aura-decoders/";
  const maxTextureSize = options?.maxTextureSize ?? tier.maxTextureSize;
  const workerCount = decoderOptions.workerCount ?? (maxTextureSize <= 1024 ? 1 : 2);
  const inner = createAssetDecoderRegistry({ basePath, capabilities: caps, maxTextureSize, workerCount });
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
    dispose: () => inner.dispose()
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
    const head = await fetch(url, { headers: { Range: "bytes=0-19" } });
    if (!head.ok) return [];
    const header = new DataView(await head.arrayBuffer());
    if (header.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67) return [];
    const jsonLength = header.getUint32(12, true);
    if (header.getUint32(16, true) !== 0x4e4f534a || jsonLength <= 0 || jsonLength > 64 * 1024 * 1024) return [];
    const jsonResponse = await fetch(url, { headers: { Range: `bytes=20-${20 + jsonLength - 1}` } });
    if (!jsonResponse.ok) return [];
    const json = JSON.parse(new TextDecoder().decode(await jsonResponse.arrayBuffer())) as {
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

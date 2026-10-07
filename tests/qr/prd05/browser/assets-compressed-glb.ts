/**
 * assets-compressed-glb.ts — PRD-05 Phase-1 browser gate.
 *
 * Drives the real C-16 decoder surface end-to-end in the browser:
 *   1. probes the actual WebGL2 context for compressed-texture capabilities;
 *   2. builds the app-scoped `createAppAssetDecoders` registry (§7.3);
 *   3. `prepareModelDecoders` resolves each fixture's declared decoders — the
 *      manifest path (`requiredDecoders`) and the GLB-header sniff path — and
 *      `require()`s them on the registry (meshopt → `import("meshoptimizer")`,
 *      draco/ktx2 → same-origin vendored UMD at `/aura-decoders/`);
 *   4. loads the shared compressed GLB fixtures through the production pipeline
 *      and reports the textures' resolved formats + per-variant decoder hits;
 *   5. asserts every fetched resource stayed same-origin (no CDN);
 *   6. exercises the fail-closed path (`decoders.draco=false` →
 *      `AssetDecoderUnavailable`) and the registry diagnostics.
 *
 * Publishes `window.__QR_READY__` or `__QR_ERROR__`. macos-14 CI only.
 */
import { createAppAssetDecoders, prepareModelDecoders, sniffGLBRequiredDecoders, AssetDecoderUnavailable, WEBGPU_COMPRESSED_CAPS } from "/packages/engine/src/agent-api/AssetDecoders.js";
import { attachAppAssetDecoders, getAppAssetDecoders } from "/packages/engine/src/lanes/prd05.js";
import { selectKTX2TargetFormat } from "/packages/assets/src/KTX2TargetSelection.js";
import { probeCompressedTextureCapabilities } from "/packages/rendering/src/lanes/prd05.js";
import { loadProductionGLTFRenderPipeline } from "/packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import type { CompressedTextureCapabilities } from "/packages/rendering/src/lanes/prd05.js";

declare global {
  interface Window { __QR_READY__?: unknown; __QR_ERROR__?: string }
}

interface VariantResult {
  readonly variant: string;
  readonly sniffedDecoders: readonly string[];
  readonly setKeys: readonly string[];
  readonly meshCount: number;
  readonly textureCount: number;
  readonly textureFormats: readonly string[];
  readonly textureMipLevels: readonly number[];
  readonly textureBytes: readonly number[];
}

interface ReadyPayload {
  readonly caps: CompressedTextureCapabilities;
  readonly webgpuKtx2Target: string;
  readonly variants: readonly VariantResult[];
  readonly registryLoaded: readonly string[];
  readonly registryFailed: readonly { readonly id: string; readonly url: string }[];
  readonly disabledDracoError: { readonly name: string; readonly decoderId: string; readonly url: string } | null;
  readonly weakMapRoundTrip: boolean;
  readonly resourceCount: number;
  readonly sameOriginResources: boolean;
  readonly offOriginResources: readonly string[];
}

const VARIANTS = [
  { variant: "plain", url: "/fixtures/asset-corpus/damaged-helmet.glb" },
  { variant: "meshopt", url: "/fixtures/asset-corpus/damaged-helmet-meshopt.glb" },
  { variant: "draco", url: "/fixtures/asset-corpus/damaged-helmet-draco.glb" },
  { variant: "uastc", url: "/fixtures/asset-corpus/damaged-helmet-uastc.glb" },
  { variant: "etc1s", url: "/fixtures/asset-corpus/damaged-helmet-etc1s.glb" }
] as const;

async function run(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 context unavailable");
  const caps = probeCompressedTextureCapabilities(gl);

  // §7.3: one registry per app, built from C-38 options + probed caps + tier cap.
  const registry = createAppAssetDecoders(
    { decoders: { basePath: "/aura-decoders/", workerCount: 2 } },
    caps,
    { maxTextureSize: 4096 }
  );
  attachAppAssetDecoders(canvas, registry);
  const weakMapRoundTrip = getAppAssetDecoders(canvas) === registry;

  const variants: VariantResult[] = [];
  for (const { variant, url } of VARIANTS) {
    const sniffed = await sniffGLBRequiredDecoders(url, "glb");
    const set = await prepareModelDecoders({ url, format: "glb" }, registry);
    const pipeline = await loadProductionGLTFRenderPipeline({
      url,
      assetId: `prd05-${variant}`,
      width: canvas.width,
      height: canvas.height,
      rendererInput: { qualityPreset: "studio-preview" },
      decoders: { basePath: "/aura-decoders/", workerCount: 2 }
    });
    const textures = [...pipeline.resources.textureLibrary.values()];
    variants.push({
      variant,
      sniffedDecoders: sniffed,
      setKeys: Object.keys(set).filter((key) => (set as Record<string, unknown>)[key] !== undefined),
      meshCount: pipeline.metadata.meshCount,
      textureCount: textures.length,
      textureFormats: textures.map((t) => t.format),
      textureMipLevels: textures.map((t) => t.textureLevels.length),
      textureBytes: textures.map((t) => t.byteLength)
    });
  }

  // Fail-closed: disabling draco must reject a draco-bearing asset with
  // AssetDecoderUnavailable rather than silently loading.
  const disabledRegistry = createAppAssetDecoders({ decoders: { draco: false } }, caps, { maxTextureSize: 4096 });
  let disabledDracoError: ReadyPayload["disabledDracoError"] = null;
  try {
    await prepareModelDecoders({ url: "/fixtures/asset-corpus/damaged-helmet-draco.glb", format: "glb" }, disabledRegistry);
  } catch (error) {
    disabledDracoError = error instanceof AssetDecoderUnavailable
      ? { name: "AssetDecoderUnavailable", decoderId: error.decoderId, url: error.url }
      : { name: error instanceof Error ? error.constructor.name : "unknown", decoderId: "", url: String(error) };
  }

  // Same-origin audit: every resource the page fetched (decoder js/wasm,
  // fixtures, blob workers excluded — they carry blob: origin by construction
  // and their *contents* were fetched same-origin) must be this origin.
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const offOrigin = resources
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("blob:") && !name.startsWith("data:"))
    .filter((name) => new URL(name).origin !== location.origin);

  const diagnostics = registry.diagnostics();
  window.__QR_READY__ = {
    caps,
    webgpuKtx2Target: selectKTX2TargetFormat(WEBGPU_COMPRESSED_CAPS, "uastc", true, "srgb"),
    variants,
    registryLoaded: diagnostics.loaded,
    registryFailed: diagnostics.failed,
    disabledDracoError,
    weakMapRoundTrip,
    resourceCount: resources.length,
    sameOriginResources: offOrigin.length === 0,
    offOriginResources: offOrigin
  } satisfies ReadyPayload;
  document.getElementById("status")!.textContent = "ready";
}

run().catch((error) => {
  window.__QR_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error);
  document.getElementById("status")!.textContent = "error";
});

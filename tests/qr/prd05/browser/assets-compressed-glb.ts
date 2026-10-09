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
import {
  WebGL2RendererBackend,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance
} from "/packages/rendering/src/production-runtime/index.js";
import { createProductionProductionStageScene, type ProductionStagedScene } from "../../../browser/production-runtime-production-scene-tools.js";
import { canvasPixels, CLEAR, maskedDeltaE, subjectMask } from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics.js";
import type { CompressedTextureCapabilities } from "/packages/rendering/src/lanes/prd05.js";

declare global {
  interface Window { __QR_READY__?: unknown; __QR_ERROR__?: unknown }
}

interface VariantResult {
  readonly variant: string;
  readonly sniffedDecoders: readonly string[];
  readonly setKeys: readonly string[];
  readonly meshCount: number;
  readonly textureCount: number;
  readonly textureFormats: readonly string[];
  readonly textureMipLevels: readonly number[];
  readonly textureMaxWidths: readonly number[];
  readonly textureBytes: readonly number[];
  readonly maskedDeltaE: number;
}

interface ReadyPayload {
  readonly caps: CompressedTextureCapabilities;
  readonly maskedPixels: number;
  readonly internalFormatsUploaded: readonly { readonly variant: string; readonly format: string }[];
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
  const params = new URLSearchParams(location.search);
  // `?noGl=1` (windows decoder-failure job): canvas.getContext("webgl2") can
  // hang for minutes under headless Windows when the GPU process never
  // initializes — prove decoder-load semantics with canned all-false caps
  // and no GL context at all.
  const NO_GL = params.get("noGl") === "1";
  const gl = NO_GL ? null : canvas.getContext("webgl2");
  if (!NO_GL && !gl) throw new Error("WebGL2 context unavailable");
  const caps = gl
    ? probeCompressedTextureCapabilities(gl)
    : { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;
  const MAX_TEXTURE_SIZE = Number(params.get("maxTextureSize") ?? "4096");
  // `?skipRender=1` (decoder-failure spec, windows job): prove decoder-load
  // semantics — sniff + prepareModelDecoders + registry require — without
  // paying the 5-variant GPU render cost under software rasterizers.
  const SKIP_RENDER = params.get("skipRender") === "1";
  // `?onlyFailure=1`: skip the 5-variant sniff/prepare loop entirely — the
  // decoder-failure spec only asserts the disabled-draco path.
  const ONLY_FAILURE = params.get("onlyFailure") === "1";
  const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
  const rendererString = !gl ? "no-gl" : dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

  // §7.3: one registry per app, built from C-38 options + probed caps + tier cap.
  const registry = createAppAssetDecoders(
    { decoders: { basePath: "/aura-decoders/", workerCount: 2 } },
    caps,
    { maxTextureSize: MAX_TEXTURE_SIZE }
  );
  attachAppAssetDecoders(canvas, registry);
  const weakMapRoundTrip = getAppAssetDecoders(canvas) === registry;

  // Rendering stage: one shared studio HDR + one ProductionWebGL2Renderer so
  // the per-variant captures are masked-ΔE2000 comparable (same recipe as the
  // prd04 decoders/variants gate).
  const hdrBytes = SKIP_RENDER ? null : new Uint8Array(await (await fetch("/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr")).arrayBuffer());
  const hdr = hdrBytes === null ? null : createProductionPbrHdrPipelineFromRadiance(hdrBytes, {
    id: "s", label: "s", intensity: 1.15, backgroundIntensity: 0.85, rotation: 0.15,
    toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
  });
  const lighting = hdr === null ? null : createProductionEnvironmentLightingResources(hdr);
  const renderer = SKIP_RENDER ? null : await WebGL2RendererBackend.create({
    canvas, width: canvas.width, height: canvas.height,
    preserveDrawingBuffer: true, clearColor: [CLEAR[0]!, CLEAR[1]!, CLEAR[2]!, 1]
  });
  const stageOptions = { includeFloor: false, includeSoftboxes: false, includeBackdrop: false } as const;

  const variants: VariantResult[] = [];
  const internalFormatsUploaded: { readonly variant: string; readonly format: string }[] = [];
  let baselinePx: Uint8ClampedArray | null = null;
  let subjectMaskPx: Uint8Array | null = null;
  for (const { variant, url } of ONLY_FAILURE ? [] : VARIANTS) {
    const sniffed = await sniffGLBRequiredDecoders(url, "glb");
    const set = await prepareModelDecoders({ url, format: "glb" }, registry);
    if (SKIP_RENDER) {
      variants.push({
        variant,
        sniffedDecoders: sniffed,
        setKeys: Object.keys(set).filter((key) => (set as Record<string, unknown>)[key] !== undefined),
        meshCount: 0, textureCount: 0, textureFormats: [], textureMipLevels: [], textureMaxWidths: [], maskedDeltaE: 0
      });
      continue;
    }
    const pipeline = await loadProductionGLTFRenderPipeline({
      url,
      assetId: `prd05-${variant}`,
      width: canvas.width,
      height: canvas.height,
      rendererInput: { environmentLighting: lighting!.lighting, qualityPreset: "hdr-studio-preview", cameraPolicy: "require" },
      decoders: { basePath: "/aura-decoders/", workerCount: 2 }
    });
    const staged: ProductionStagedScene = createProductionProductionStageScene(
      pipeline.source, pipeline.resources.bounds, { width: canvas.width, height: canvas.height }, stageOptions);
    renderer!.renderImportedAsset({ source: staged.source, camera: staged.camera, metadata: {} as never, viewport: { width: canvas.width, height: canvas.height } });
    const px = await canvasPixels(canvas);
    if (variant === "plain") {
      baselinePx = px;
      subjectMaskPx = subjectMask(px);
    }
    const textures = [...pipeline.resources.textureLibrary.values()];
    for (const texture of textures) internalFormatsUploaded.push({ variant, format: texture.format });
    variants.push({
      variant,
      sniffedDecoders: sniffed,
      setKeys: Object.keys(set).filter((key) => (set as Record<string, unknown>)[key] !== undefined),
      meshCount: pipeline.metadata.meshCount,
      textureCount: textures.length,
      textureFormats: textures.map((t) => t.format),
      textureMipLevels: textures.map((t) => t.textureLevels.length),
      textureMaxWidths: textures.map((t) => Math.max(...t.textureLevels.map((l) => l.width))),
      textureBytes: textures.map((t) => t.byteLength),
      maskedDeltaE: baselinePx && subjectMaskPx ? maskedDeltaE(baselinePx, px, subjectMaskPx) : 0
    });
  }

  // Fail-closed: disabling draco must reject a draco-bearing asset with
  // AssetDecoderUnavailable rather than silently loading.
  const disabledRegistry = createAppAssetDecoders({ decoders: { draco: false } }, caps, { maxTextureSize: MAX_TEXTURE_SIZE });
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
    rendererString,
    maxTextureSize: MAX_TEXTURE_SIZE,
    maskedPixels: subjectMaskPx ? subjectMaskPx.reduce((n, m) => n + (m > 0 ? 1 : 0), 0) : 0,
    internalFormatsUploaded,
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

// Watchdog: a hung fetch/worker leaves both flags unset forever and the spec
// burns its full timeout with no diagnosis. Publish __QR_ERROR__ at 150s.
setTimeout(() => {
  if (window.__QR_READY__ === undefined && window.__QR_ERROR__ === undefined) {
    window.__QR_ERROR__ = "page-watchdog: run() still pending after 150s";
    document.getElementById("status")!.textContent = "error";
  }
}, 150_000);

run().catch((error) => {
  window.__QR_ERROR__ = (error instanceof Error ? error.stack ?? error.message : String(error)) as unknown;
  document.getElementById("status")!.textContent = "error";
});

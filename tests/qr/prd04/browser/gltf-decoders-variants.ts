/**
 * gltf-decoders-variants.ts — PRD-04 P5-2/P5-3 browser gate.
 * Loads DamagedHelmet uncompressed / Draco / Meshopt through
 * `loadProductionGLTFRenderPipeline` (compressed variants via the C-16
 * `decoders` option against `/fixtures/asset-corpus/decoders/`), renders each on
 * one `ProductionWebGL2Renderer`, and reports masked CIEDE2000 means vs the
 * uncompressed baseline. Then MaterialsVariantsShoe cycles its material
 * variants via `resources.setMaterialVariant` and reports the pairwise subject
 * colour deltas plus the `variant-unknown` path.
 * Publishes window.__QR_READY__ or __QR_ERROR__. macos-14 CI only.
 */
import { loadProductionGLTFRenderPipeline } from "/packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import {
  ProductionWebGL2Renderer,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance
} from "/packages/rendering/src/production-runtime/index.js";
import { createProductionProductionStageScene, type ProductionStagedScene } from "/tests/browser/production-runtime-production-scene-tools.js";
import { canvasPixels, CLEAR, deltaE00, maskedDeltaE, meanLab, subjectMask } from "/benchmarks/quality-rebuild/scenes/prd04/metrics.js";

declare global { interface Window { __QR_READY__?: unknown; __QR_ERROR__?: string } }

const DECODER_BASE = "/fixtures/asset-corpus/decoders/";

async function run(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const hdrBytes = new Uint8Array(await (await fetch("/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr")).arrayBuffer());
  const hdr = createProductionPbrHdrPipelineFromRadiance(hdrBytes, { id: "s", label: "s", intensity: 1.15, backgroundIntensity: 0.85, rotation: 0.15, toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 } });
  const lighting = createProductionEnvironmentLightingResources(hdr);
  const renderer = await ProductionWebGL2Renderer.create({ canvas, width: canvas.width, height: canvas.height, preserveDrawingBuffer: true, clearColor: [CLEAR[0]!, CLEAR[1]!, CLEAR[2]!, 1] });
  const stageOptions = { includeFloor: false, includeSoftboxes: false, includeBackdrop: false } as const;

  const loadAndStage = async (url: string, assetId: string, extra?: Record<string, unknown>) => {
    const pipeline = await loadProductionGLTFRenderPipeline({
      url, assetId,
      width: canvas.width, height: canvas.height,
      rendererInput: { environmentLighting: lighting.lighting, qualityPreset: "hdr-studio-preview", cameraPolicy: "require" },
      ...extra
    });
    const staged: ProductionStagedScene = createProductionProductionStageScene(pipeline.source, pipeline.resources.bounds, { width: canvas.width, height: canvas.height }, stageOptions);
    return { pipeline, staged };
  };
  const render = (staged: ProductionStagedScene) =>
    renderer.renderImportedAsset({ source: staged.source, camera: staged.camera, metadata: {} as never });

  // P5-2: baseline vs C-16-decoded variants on one renderer/build.
  const base = await loadAndStage("/fixtures/asset-corpus/damaged-helmet.glb", "helmet");
  render(base.staged);
  const baseline = await canvasPixels(canvas);
  const mask = subjectMask(baseline);

  const decoders = { basePath: DECODER_BASE };
  const draco = await loadAndStage("/fixtures/asset-corpus/damaged-helmet-draco.glb", "helmet-draco", { decoders });
  render(draco.staged);
  const dracoPx = await canvasPixels(canvas);
  const meshopt = await loadAndStage("/fixtures/asset-corpus/damaged-helmet-meshopt.glb", "helmet-meshopt", { decoders });
  render(meshopt.staged);
  const meshoptPx = await canvasPixels(canvas);

  // P5-3: variant rebuild drives visibly different subject colour (mean Lab per variant).
  const shoe = await loadAndStage("/fixtures/asset-corpus/materials-variants-shoe.glb", "shoe");
  const variants = [...new Set(shoe.pipeline.resources.materialVariants.map((v) => v.variant))].filter(
    (v): v is string => v !== null
  );
  const variantResults: Record<string, { applied: string; meanLab: [number, number, number] }> = {};
  for (const name of variants.slice(0, 3)) {
    const applied = await shoe.pipeline.resources.setMaterialVariant(name);
    render(shoe.staged);
    const px = await canvasPixels(canvas);
    variantResults[name] = { applied, meanLab: meanLab(px, subjectMask(px)) };
  }
  const unknownResult = await shoe.pipeline.resources.setMaterialVariant("__no-such-variant__");
  const pairwise: number[] = [];
  const names = Object.keys(variantResults);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairwise.push(deltaE00(variantResults[names[i]!].meanLab, variantResults[names[j]!].meanLab));

  window.__QR_READY__ = {
    maskedPixels: mask.reduce((n, m) => n + m, 0),
    helmetDracoDeltaEMean: maskedDeltaE(baseline, dracoPx, mask),
    helmetMeshoptDeltaEMean: maskedDeltaE(baseline, meshoptPx, mask),
    variants,
    variantResults,
    variantPairwiseDeltaE: pairwise,
    variantUnknown: unknownResult
  };
}

run().catch((error) => { window.__QR_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });

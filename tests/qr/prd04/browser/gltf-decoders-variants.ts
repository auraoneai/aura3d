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

declare global { interface Window { __QR_READY__?: unknown; __QR_ERROR__?: string } }

const DECODER_BASE = "/fixtures/asset-corpus/decoders/";
const CLEAR = [0.015, 0.018, 0.024];

// sRGB byte -> CIE Lab (D65).
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const f = (v: number) => { const s = v / 255; return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92; };
  const x = (f(r) * 0.4124 + f(g) * 0.3576 + f(b) * 0.1805) / 0.95047;
  const y = f(r) * 0.2126 + f(g) * 0.7152 + f(b) * 0.0722;
  const z = (f(r) * 0.0193 + f(g) * 0.1192 + f(b) * 0.9505) / 1.08883;
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}

// CIEDE2000 colour difference.
function deltaE00(a: [number, number, number], b: [number, number, number]): number {
  const [l1, a1, b1] = a; const [l2, a2, b2] = b;
  const c1 = Math.hypot(a1, b1); const c2 = Math.hypot(a2, b2);
  const cb = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + g); const ap2 = a2 * (1 + g);
  const cp1 = Math.hypot(ap1, b1); const cp2 = Math.hypot(ap2, b2);
  const hp = (x: number, y: number) => { if (x === 0 && y === 0) return 0; const h = Math.atan2(y, x) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
  const h1 = hp(ap1, b1); const h2 = hp(ap2, b2);
  const dL = l2 - l1; const dC = cp2 - cp1;
  const dh = cp1 * cp2 === 0 ? 0 : Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 + 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * Math.PI / 180);
  const lb = (l1 + l2) / 2; const cbp = (cp1 + cp2) / 2;
  const hb = cp1 * cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const tt = 1 - 0.17 * Math.cos((hb - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hb * Math.PI / 180) + 0.32 * Math.cos((3 * hb + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hb - 63) * Math.PI / 180);
  const rt = -2 * Math.sqrt(cbp ** 7 / (cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * Math.PI / 180);
  const sl = 1 + 0.015 * (lb - 50) ** 2 / Math.sqrt(20 + (lb - 50) ** 2);
  const sc = 1 + 0.045 * cbp; const sh = 1 + 0.015 * cbp * tt;
  const dL2 = dL / sl; const dC2 = dC / sc; const dH2 = dH / sh;
  return Math.sqrt(dL2 ** 2 + dC2 ** 2 + dH2 ** 2 + rt * dC2 * dH2);
}

async function canvasPixels(canvas: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(canvas);
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

const subjectMask = (px: Uint8ClampedArray): Uint8Array => {
  const mask = new Uint8Array(px.length / 4);
  for (let i = 0; i < mask.length; i++) {
    const diff = Math.max(Math.abs(px[i * 4]! - CLEAR[0] * 255), Math.abs(px[i * 4 + 1]! - CLEAR[1] * 255), Math.abs(px[i * 4 + 2]! - CLEAR[2] * 255));
    mask[i] = diff > 10 ? 1 : 0;
  }
  return mask;
};

const meanLab = (px: Uint8ClampedArray, mask: Uint8Array): [number, number, number] => {
  let n = 0, l = 0, a = 0, b = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const lab = rgbToLab(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
    n++; l += lab[0]; a += lab[1]; b += lab[2];
  }
  return [l / Math.max(n, 1), a / Math.max(n, 1), b / Math.max(n, 1)];
};

const maskedDeltaE = (a: Uint8ClampedArray, b: Uint8ClampedArray, mask: Uint8Array): number => {
  let n = 0, sum = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    sum += deltaE00(rgbToLab(a[i * 4]!, a[i * 4 + 1]!, a[i * 4 + 2]!), rgbToLab(b[i * 4]!, b[i * 4 + 1]!, b[i * 4 + 2]!));
    n++;
  }
  return sum / Math.max(n, 1);
};

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
  const variants = [...new Set(shoe.pipeline.resources.materialVariants.map((v) => v.variant))];
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

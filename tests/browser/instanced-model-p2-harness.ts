import {
  camera,
  createAuraApp,
  defineAuraAssets,
  instances,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";

/**
 * P2 instanced-GLB pixel proof (muse3jsparity-PRD P2).
 *
 * Root-API only (`@aura3d/engine`): a tiny typed GLB fixture (auroraPadBeacon,
 * 7948 bytes, loaded once) rendered as 1 / 64 / 4000 instances through
 * `instances.model()`. The mount attaches `instanceTransforms` to the GLB
 * actor items exactly like primitive nodes, so draws must stay in the
 * 1-draw class instead of expanding toward N draws (the D1 footgun).
 *
 * Captures: single baseline, instanced-64, instanced-4000, and an 8-instance
 * unaware-material capture proving the D1 fallback warning fires from root.
 */

const beaconAssets = defineAuraAssets({
  beacon: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraPadBeacon.c94a5b6b.glb",
    hash: "sha256-c94a5b6b45fa0c3d52fa5c9b3e863aaa37c540e1d9fb57ec09c46956f4af14ef",
    sizeBytes: 7948
  }
} as const);

// Textured-unlit proof subject (muse3jsparity-PRD P2 breadth): 1 mesh,
// KHR_materials_unlit + baseColorTexture — exercises the textured-unlit
// instance path instead of the scalar PBR one the beacon covers.
const landerAssets = defineAuraAssets({
  lander: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraExtractionLanderHero.4b12940e.glb",
    hash: "sha256-4b12940e15ea6e51d0bc71b3382b0364526bb16bb29f60dd72e8f8fb1735a2e1",
    sizeBytes: 1034600
  }
} as const);

const GRID_64 = 8;
const GRID_4K_COLS = 80;
const GRID_4K_ROWS = 50;
// Production perspective far = 100: an 80x50 field at spacing 0.9 spans
// 71x44 world units and stays inside the frustum from the P2 camera below
// (farthest corner ~90 units out). Spacing 1.5 pushed the single-subject
// captures past far and legitimately culled them (diagnosed 2026-09-05).
const SPACING = 0.9;

interface P2ImageMetrics {
  readonly nonDarkPixels: number;
  readonly brightPixels: number;
  readonly colorBuckets: number;
  readonly spatialChecksum: number;
}

interface P2Capture {
  readonly id: string;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly assetStatus: string;
  readonly backend: string;
  readonly errorCount: number;
  readonly warnings: readonly string[];
  readonly shadowRequested: boolean | null;
  readonly shadowMapRendered: boolean | null;
  readonly shadowMapSampled: boolean | null;
  readonly nativeInstancedSubmissions: number;
  readonly submittedObjects: number;
  readonly visibleObjects: number;
  readonly culledObjects: number;
  readonly image: P2ImageMetrics;
}

interface P2Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly P2Capture[];
  readonly checks?: Record<string, number | string | boolean>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_P2_INSTANCED_MODEL__?: P2Result;
  }
}

window.__AURA3D_P2_INSTANCED_MODEL__ = { status: "waiting" };

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");

function gridTransforms(cols: number, rows: number): { readonly position: readonly [number, number, number] }[] {
  const out: { readonly position: readonly [number, number, number] }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push({ position: [(col - (cols - 1) / 2) * SPACING, 0, (row - (rows - 1) / 2) * SPACING] });
    }
  }
  return out;
}

function baseScene() {
  return scene()
    .background("#070b12")
    .camera(camera.perspective({ position: [0, 36, 52], target: [0, 0, -2], fov: 55 }))
    .add(primitives.plane({
      name: "p2 ground",
      material: material.pbr({ color: "#111823", roughness: 0.95, metallic: 0 })
    }).position(0, -0.55, 0).scale([140, 1, 100]).toJSON())
    .add(lights.studio({ intensity: 1.1 }).toJSON())
    .add(lights.directional({ position: [30, 50, 20], intensity: 1.2 }).toJSON());
}

if (!mount || !shoot) {
  window.__AURA3D_P2_INSTANCED_MODEL__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_P2_INSTANCED_MODEL__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

async function runHarness(): Promise<void> {
  const captures: P2Capture[] = [];
  captures.push(await capture("ground-only", () => baseScene(), 0));
  captures.push(await capture("single-close", () => {
    const builder = scene()
      .background("#070b12")
      .camera(camera.perspective({ position: [0, 2.2, 6.5], target: [0, 0.5, 0], fov: 55 }))
      .add(lights.studio({ intensity: 1.1 }).toJSON())
      .add(lights.directional({ position: [3, 5, 2], intensity: 1.2 }).toJSON());
    builder.add(model(beaconAssets.beacon, { name: "p2 single close beacon" }).position(0, 0, 0).toJSON());
    return builder;
  }, 1));
  captures.push(await capture("single", () => {
    const builder = baseScene();
    builder.add(model(beaconAssets.beacon, { name: "p2 single beacon" }).position(0, 0, 0).toJSON());
    return builder;
  }, 1));
  captures.push(await capture("instanced-64", () => {
    const builder = baseScene();
    builder.add(instances.model(beaconAssets.beacon, {
      name: "p2 instanced 64",
      transforms: gridTransforms(GRID_64, GRID_64)
    }).toJSON());
    return builder;
  }, GRID_64 * GRID_64));
  captures.push(await capture("instanced-4000", () => {
    const builder = baseScene();
    builder.add(instances.model(beaconAssets.beacon, {
      name: "p2 instanced 4000",
      transforms: gridTransforms(GRID_4K_COLS, GRID_4K_ROWS)
    }).toJSON());
    return builder;
  }, GRID_4K_COLS * GRID_4K_ROWS));
  captures.push(await capture("single-textured-unlit", () => {
    const builder = baseScene();
    builder.add(model(landerAssets.lander, { name: "p2 single lander" }).position(0, 0.6, 0).toJSON());
    return builder;
  }, 1));
  captures.push(await capture("instanced-textured-unlit-120", () => {
    const builder = baseScene();
    builder.add(instances.model(landerAssets.lander, {
      name: "p2 instanced lander 120",
      transforms: gridTransforms(10, 12).map((transform, index) => ({
        position: [
          (transform.position[0] / SPACING) * 2.0,
          0.6 + (index % 3) * 0.15,
          (transform.position[2] / SPACING) * 2.0
        ] as readonly [number, number, number]
      }))
    }).toJSON());
    return builder;
  }, 120));
  captures.push(await capture("fallback-8", () => {
    const builder = baseScene();
    builder.add(instances.model(beaconAssets.beacon, {
      name: "p2 fallback 8",
      transforms: gridTransforms(8, 1),
      instancingAware: false,
      material: material.pbr({ name: "p2-plain-pbr", color: "#8899aa", roughness: 0.6, metallic: 0.1 })
    }).toJSON());
    return builder;
  }, 8));

  const byId = (id: string): P2Capture => captures.find((entry) => entry.id === id)!;
  const single = byId("single");
  const mid = byId("instanced-64");
  const big = byId("instanced-4000");
  const fallback = byId("fallback-8");
  const singleUnlit = byId("single-textured-unlit");
  const bigUnlit = byId("instanced-textured-unlit-120");
  window.__AURA3D_P2_INSTANCED_MODEL__ = {
    status: "ready",
    captures,
    checks: {
      drawsSingle: single.drawCalls,
      draws64: mid.drawCalls,
      draws4000: big.drawCalls,
      drawsFallback8: fallback.drawCalls,
      drawsSingleUnlit: singleUnlit.drawCalls,
      drawsUnlit120: bigUnlit.drawCalls,
      instancedSubmissions4000: big.nativeInstancedSubmissions,
      instancedSubmissionsUnlit120: bigUnlit.nativeInstancedSubmissions,
      pixelDiffSingleVs4000: metricDiff(single.image, big.image),
      pixelDiffUnlitSingleVs120: metricDiff(singleUnlit.image, bigUnlit.image),
      nonDark4000: big.image.nonDarkPixels,
      fallbackWarns: fallback.warnings.some((warning) => warning.includes("material-rejects-instancing")),
      backend: big.backend,
      assetStatus: big.assetStatus
    }
  };
}

async function capture(
  id: string,
  build: () => ReturnType<typeof baseScene>,
  instanceCount: number
): Promise<P2Capture> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  mount!.append(canvas);
  const app = createAuraApp(canvas, {
    scene: build(),
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }
  });
  if (id !== "ground-only") await waitForAsset(app, id);
  await waitForFrame();
  await waitForFrame();
  await waitForReady(app, id);
  const dataUrl = app.screenshot().dataUrl;
  const metrics = await analyzeDataUrl(dataUrl);
  const diagnostics = app.diagnostics();
  const modelAssets = diagnostics.assets.filter((entry) => entry.url.endsWith(".glb"));
  const asset = modelAssets.length > 0 && modelAssets.every((entry) => entry.status === "ready")
    ? modelAssets[0]
    : undefined;
  const runtime = (diagnostics.renderer as { readonly runtime?: {
    readonly backend?: string;
    readonly warnings?: readonly string[];
    readonly nativeInstancedSubmissions?: number;
    readonly submittedObjects?: number;
    readonly visibleObjects?: number;
    readonly culledObjects?: number;
  } } | undefined)?.runtime;
  const shadows = (diagnostics.renderer as { readonly shadows?: {
    readonly requested?: boolean;
    readonly mapRendered?: boolean;
    readonly mapSampled?: boolean;
  } } | undefined)?.shadows;
  const result: P2Capture = {
    id,
    instanceCount,
    drawCalls: diagnostics.drawCalls,
    assetStatus: asset?.status ?? "missing",
    backend: runtime?.backend
      ?? (diagnostics as { readonly backend?: string }).backend
      ?? "unknown",
    errorCount: diagnostics.errors.length,
    warnings: [...diagnostics.warnings, ...(runtime?.warnings ?? [])],
    shadowRequested: shadows?.requested ?? null,
    shadowMapRendered: shadows?.mapRendered ?? null,
    shadowMapSampled: shadows?.mapSampled ?? null,
    nativeInstancedSubmissions: runtime?.nativeInstancedSubmissions ?? -1,
    submittedObjects: runtime?.submittedObjects ?? -1,
    visibleObjects: runtime?.visibleObjects ?? -1,
    culledObjects: runtime?.culledObjects ?? -1,
    image: metrics
  };
  app.dispose();
  canvas.remove();
  return result;
}

async function waitForAsset(app: ReturnType<typeof createAuraApp>, id: string): Promise<void> {
  for (let index = 0; index < 600; index += 1) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) {
      throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    }
    const models = diagnostics.assets.filter((entry) => entry.url.endsWith(".glb"));
    if (models.length > 0 && models.every((entry) => entry.status === "ready")) return;
    await waitForFrame();
  }
  throw new Error(`${id}: model GLB did not reach ready before the P2 harness timeout.`);
}

async function waitForReady(app: ReturnType<typeof createAuraApp>, id: string): Promise<void> {
  for (let index = 0; index < 300; index += 1) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) {
      throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    }
    if (diagnostics.drawCalls > 0) return;
    await waitForFrame();
  }
  throw new Error(`${id}: Aura3D app did not draw a frame before the P2 harness timeout.`);
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function analyzeDataUrl(dataUrl: string): Promise<P2ImageMetrics> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create analysis canvas.");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonDarkPixels = 0;
  let brightPixels = 0;
  const buckets = new Set<string>();
  let spatialChecksum = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luma > 24) {
      nonDarkPixels += 1;
      buckets.add(`${Math.floor(r / 32)}:${Math.floor(g / 32)}:${Math.floor(b / 32)}`);
    }
    if (luma > 150) brightPixels += 1;
    spatialChecksum = (spatialChecksum + Math.round(luma) * (index + 17)) % 1_000_003;
  }
  return { nonDarkPixels, brightPixels, colorBuckets: buckets.size, spatialChecksum };
}

function metricDiff(a: P2ImageMetrics, b: P2ImageMetrics): number {
  return Math.abs(a.nonDarkPixels - b.nonDarkPixels) +
    Math.abs(a.brightPixels - b.brightPixels) +
    Math.abs(a.colorBuckets - b.colorBuckets) * 10 +
    Math.min(1_000_000, Math.abs(a.spatialChecksum - b.spatialChecksum));
}

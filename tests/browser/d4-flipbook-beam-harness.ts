import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  primitives,
  renderer,
  scene,
  type AuraSceneBuilder
} from "@aura3d/engine";

/**
 * D4 flipbook-explosion + thick-beam route proof (muse3jsparity-PRD D4).
 *
 * Root-API only: every scene is built from `primitives` / `material` /
 * `lights` / `effects` / `scene` / `camera`. The D4 contract nodes
 * (`effects.flipbook`, `effects.beam`) are declared in every capture so
 * diagnostics report the request; both are recorded-but-withheld at root
 * (no native sprite-sheet sampler / beam target yet), so the visible look
 * is composed from pre-existing pixel-backed node kinds (emissive
 * primitives, point-light flash, bloom) — the same additive-surface pattern
 * as D3's `sky.dayNight`.
 *
 * Flipbook math below is an inline mirror of `resolveFlipbookUv` in
 * `packages/rendering/src/SpriteFlipbook.ts` (unit-proven in
 * `terrain-sprites-d2d4.test.ts`); the harness import gate forbids importing
 * `@aura3d/rendering` here, and the spec asserts the mirrored UV rects equal
 * the unit-proven values.
 */

const SHEET_COLUMNS = 4;
const SHEET_ROWS = 4;
const SHEET_CAPACITY = SHEET_COLUMNS * SHEET_ROWS;
const FRAME_RATE = 24;

const BEAM_FROM: readonly [number, number, number] = [0, 0.25, -0.5];
const BEAM_TO: readonly [number, number, number] = [0, 2.75, -0.5];
const BEAM_WIDTH = 0.3;
const BEAM_SEGMENTS = 12;

interface ImageMetrics {
  readonly nonDarkPixels: number;
  readonly nonLightPixels: number;
  readonly amberPixels: number;
  readonly yellowPixels: number;
  readonly cyanPixels: number;
  readonly brightPixels: number;
  readonly colorBuckets: number;
  readonly spatialChecksum: number;
}

interface D4Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly nodeCount: number;
  readonly backend: string;
  readonly errorCount: number;
  readonly warnings: readonly string[];
  readonly image: ImageMetrics;
  readonly meta: Record<string, string | number | boolean | readonly number[]>;
}

interface D4Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly D4Capture[];
  readonly checks?: Record<string, boolean | number | string | readonly number[]>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_D4_FLIPBOOK_BEAM__?: D4Result;
  }
}

window.__AURA3D_D4_FLIPBOOK_BEAM__ = { status: "waiting" };

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
const contactSheet = document.createElement("canvas");
contactSheet.width = 1280;
contactSheet.height = 720;
contactSheet.style.position = "fixed";
contactSheet.style.left = "0";
contactSheet.style.top = "0";
contactSheet.style.width = "1280px";
contactSheet.style.height = "720px";
contactSheet.style.background = "#020617";
contactSheet.style.zIndex = "1";
document.body.append(contactSheet);
let contactSheetIndex = 0;

if (!mount || !shoot) {
  window.__AURA3D_D4_FLIPBOOK_BEAM__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_D4_FLIPBOOK_BEAM__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

/** Inline mirror of `resolveFlipbookUv(frame, columns, rows)` (GL v-flip). */
function mirrorFlipbookUv(frame: number): readonly [number, number, number, number] {
  const column = frame % SHEET_COLUMNS;
  const row = Math.floor(frame / SHEET_COLUMNS);
  return [column / SHEET_COLUMNS, 1 - (row + 1) / SHEET_ROWS, (column + 1) / SHEET_COLUMNS, 1 - row / SHEET_ROWS];
}

/** Sheet cell sampled at `elapsedSeconds` for a looping24fps 4x4 sheet. */
function mirrorFlipbookFrameAt(elapsedSeconds: number): number {
  return Math.floor(elapsedSeconds * FRAME_RATE) % SHEET_CAPACITY;
}

/** Inline mirror of the `createBeamDescriptor` length term. */
function mirrorBeamLength(): number {
  return Math.hypot(BEAM_TO[0]! - BEAM_FROM[0]!, BEAM_TO[1]! - BEAM_FROM[1]!, BEAM_TO[2]! - BEAM_FROM[2]!);
}

const blastCamera = camera.perspective({ position: [0, 1.7, 4.6], target: [0, 0.9, -0.5], fov: 55 });
const beamCamera = camera.perspective({ position: [0, 1.6, 4.8], target: [0, 1.4, -0.5], fov: 55 });

interface BlastStage {
  readonly id: string;
  readonly elapsed: number;
  readonly coreRadius: number;
  readonly coreColor: string;
  readonly coreIntensity: number;
  readonly midRadius: number;
  readonly midColor: string;
  readonly midIntensity: number;
  readonly smokeRadius: number;
  readonly smokeColor: string;
  readonly flashSize: number;
  readonly flashIntensity: number;
  readonly ringRadius: number;
  readonly lightIntensity: number;
}

const BLAST_STAGES: readonly BlastStage[] = [
  {
    id: "blast-ignite", elapsed: 0.1,
    coreRadius: 0.28, coreColor: "#fff7ad", coreIntensity: 3.4,
    midRadius: 0.45, midColor: "#fdba74", midIntensity: 2.2,
    smokeRadius: 0.42, smokeColor: "#431407",
    flashSize: 1.4, flashIntensity: 1.6, ringRadius: 0.5, lightIntensity: 6
  },
  {
    id: "blast-peak", elapsed: 0.35,
    coreRadius: 0.5, coreColor: "#fff7ad", coreIntensity: 3.2,
    midRadius: 0.85, midColor: "#fb923c", midIntensity: 2.4,
    smokeRadius: 0.72, smokeColor: "#431407",
    flashSize: 2.3, flashIntensity: 1.6, ringRadius: 1.1, lightIntensity: 14
  },
  {
    id: "blast-dissipate", elapsed: 0.6,
    coreRadius: 0.42, coreColor: "#fde68a", coreIntensity: 1.6,
    midRadius: 1.0, midColor: "#c2410c", midIntensity: 1.2,
    smokeRadius: 1.05, smokeColor: "#290e03",
    flashSize: 2.0, flashIntensity: 0.8, ringRadius: 1.7, lightIntensity: 7
  }
];

const flipbookNodeJson = effects.flipbook({
  name: "d4 flipbook explosion sprite",
  spriteColumns: SHEET_COLUMNS,
  spriteRows: SHEET_ROWS,
  frameRate: FRAME_RATE,
  color: "#ffb347"
}).toJSON();

const beamNodeJson = effects.beam({
  name: "d4 additive light beam",
  from: [...BEAM_FROM],
  to: [...BEAM_TO],
  widthWorld: BEAM_WIDTH,
  segmentCount: BEAM_SEGMENTS,
  color: "#9fd8ff"
}).toJSON();

function buildBlastScene(stage: BlastStage | null): AuraSceneBuilder {
  const builder = scene().background("#0a0d14").camera(blastCamera);
  builder.add(primitives.plane({
    name: "d4 blast ground",
    material: material.pbr({ color: "#141a24", roughness: 0.9, metallic: 0.02 })
  }).position(0, -0.02, 0).scale([9, 1, 9]).toJSON());
  builder.add(flipbookNodeJson);
  builder.add(effects.bloom({ intensity: 0.55, threshold: 0.7, color: "#ffd9a0" }).toJSON());
  builder.add(lights.point({
    name: "d4 blast flash",
    position: [0, 1.3, -0.2],
    intensity: stage?.lightIntensity ?? 0.5,
    color: "#ffb15e"
  }).toJSON());
  builder.add(lights.studio({ intensity: 0.5 }).toJSON());
  if (stage) {
    builder.add(primitives.sphere({
      name: `d4 blast core ${stage.id}`,
      material: material.emissive({ color: stage.coreColor, emissive: stage.coreColor, emissiveIntensity: stage.coreIntensity })
    }).position(0, 0.75, -0.5).scale(stage.coreRadius).toJSON());
    builder.add(primitives.sphere({
      name: `d4 blast fireball ${stage.id}`,
      material: material.emissive({ color: stage.midColor, emissive: stage.midColor, emissiveIntensity: stage.midIntensity })
    }).position(0, 0.8, -0.5).scale(stage.midRadius).toJSON());
    builder.add(primitives.sphere({
      name: `d4 blast smoke ${stage.id}`,
      material: material.emissive({ color: stage.smokeColor, emissive: stage.smokeColor, emissiveIntensity: 0.4, roughness: 1 })
    }).position(0, 1.3, -0.5).scale(stage.smokeRadius).toJSON());
    builder.add(primitives.plane({
      name: `d4 blast ground flash ${stage.id}`,
      material: material.emissive({ color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: stage.flashIntensity })
    }).position(0, 0.02, -0.5).scale([stage.flashSize, 1, stage.flashSize]).toJSON());
    builder.add(primitives.torus({
      name: `d4 blast shock ring ${stage.id}`,
      material: material.emissive({ color: "#fdba74", emissive: "#fdba74", emissiveIntensity: 1.8 })
    }).position(0, 0.12, -0.5).rotate(1.5708, 0, 0).scale([stage.ringRadius, stage.ringRadius, 0.05]).toJSON());
    for (let spark = 0; spark < 10; spark += 1) {
      const angle = spark * 2.39996;
      const radius = 0.9 + (spark % 3) * 0.35;
      builder.add(primitives.sphere({
        name: `d4 blast spark ${stage.id} ${spark}`,
        material: material.emissive({ color: "#fcd34d", emissive: "#fbbf24", emissiveIntensity: 2.4 })
      }).position(Math.cos(angle) * radius, 0.45 + (spark % 4) * 0.22, -0.5 + Math.sin(angle) * radius).scale(0.05).toJSON());
    }
  }
  return builder;
}

function buildBeamScene(on: boolean): AuraSceneBuilder {
  const builder = scene().background("#04070d").camera(beamCamera);
  builder.add(primitives.plane({
    name: "d4 beam ground",
    material: material.pbr({ color: "#0d1420", roughness: 0.85, metallic: 0.05 })
  }).position(0, -0.02, 0).scale([9, 1, 9]).toJSON());
  builder.add(beamNodeJson);
  builder.add(effects.bloom({ intensity: 0.6, threshold: 0.68, color: "#9fd8ff" }).toJSON());
  builder.add(lights.point({
    name: "d4 beam spill",
    position: [0, 1.6, 0.4],
    intensity: on ? 3 : 0.5,
    color: "#9fd8ff"
  }).toJSON());
  builder.add(lights.studio({ intensity: 0.4 }).toJSON());
  builder.add(primitives.box({
    name: "d4 beam emitter base",
    material: material.pbr({ color: "#1f2937", roughness: 0.4, metallic: 0.8 })
  }).position(BEAM_FROM[0]!, 0.12, BEAM_FROM[2]!).scale([0.5, 0.24, 0.5]).toJSON());
  if (on) {
    const midY = (BEAM_FROM[1]! + BEAM_TO[1]!) / 2;
    const length = mirrorBeamLength();
    builder.add(primitives.box({
      name: "d4 beam emitter tip",
      material: material.emissive({ color: "#a5f3fc", emissive: "#22d3ee", emissiveIntensity: 2.2 })
    }).position(BEAM_FROM[0]!, 0.28, BEAM_FROM[2]!).scale([0.34, 0.08, 0.34]).toJSON());
    builder.add(primitives.cylinder({
      name: "d4 beam base flare",
      material: material.emissive({ color: "#0ea5c4", emissive: "#22d3ee", emissiveIntensity: 0.8 })
    }).position(BEAM_FROM[0]!, BEAM_FROM[1]! + 0.25, BEAM_FROM[2]!).scale([BEAM_WIDTH * 3, 0.5, BEAM_WIDTH * 3]).toJSON());
    builder.add(primitives.cylinder({
      name: "d4 beam core",
      material: material.neon({ color: "#e8fdff", emissive: "#d9f6ff", emissiveIntensity: 2.6 })
    }).position(BEAM_FROM[0]!, midY, BEAM_FROM[2]!).scale([BEAM_WIDTH, length, BEAM_WIDTH]).toJSON());
    builder.add(primitives.sphere({
      name: "d4 beam impact crown",
      material: material.emissive({ color: "#e0faff", emissive: "#e0faff", emissiveIntensity: 2.4 })
    }).position(BEAM_TO[0]!, BEAM_TO[1]!, BEAM_TO[2]!).scale(0.22).toJSON());
    builder.add(primitives.plane({
      name: "d4 beam impact disc",
      material: material.emissive({ color: "#7de6ff", emissive: "#22d3ee", emissiveIntensity: 1.8 })
    }).position(BEAM_FROM[0]!, 0.02, BEAM_FROM[2]!).scale([2.0, 1, 2.0]).toJSON());
  }
  return builder;
}

async function runHarness(): Promise<void> {
  const captures: D4Capture[] = [];

  captures.push(await capture("blast-off", () => buildBlastScene(null), { kind: "blast-baseline" }));
  for (const stage of BLAST_STAGES) {
    const frame = mirrorFlipbookFrameAt(stage.elapsed);
    captures.push(await capture(stage.id, () => buildBlastScene(stage), {
      kind: "flipbook-explosion",
      elapsedSeconds: stage.elapsed,
      flipbookFrame: frame,
      flipbookUv: [...mirrorFlipbookUv(frame)]
    }));
  }
  captures.push(await capture("beam-off", () => buildBeamScene(false), { kind: "beam-baseline" }));
  captures.push(await capture("beam-on", () => buildBeamScene(true), {
    kind: "thick-beam",
    beamLength: mirrorBeamLength(),
    beamWidth: BEAM_WIDTH,
    beamSegments: BEAM_SEGMENTS
  }));

  const byId = (id: string): D4Capture => captures.find((entry) => entry.id === id)!;
  window.__AURA3D_D4_FLIPBOOK_BEAM__ = {
    status: "ready",
    captures,
    checks: {
      blastDiff: metricDiff(byId("blast-off").image, byId("blast-peak").image),
      igniteDiff: metricDiff(byId("blast-off").image, byId("blast-ignite").image),
      dissipateDiff: metricDiff(byId("blast-off").image, byId("blast-dissipate").image),
      beamDiff: metricDiff(byId("beam-off").image, byId("beam-on").image),
      flipbookNode: { ...flipbookNodeJson },
      beamNode: { ...beamNodeJson },
      beamLength: mirrorBeamLength()
    }
  };
}

async function capture(
  id: string,
  build: () => AuraSceneBuilder,
  meta: Record<string, string | number | boolean | readonly number[]>
): Promise<D4Capture> {
  const warnings = [...renderer.diagnostics(build()).warnings];
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
  await waitForFrame();
  await waitForFrame();
  await waitForReady(app, id);
  const dataUrl = app.screenshot().dataUrl;
  const metrics = await analyzeDataUrl(dataUrl);
  await drawContactSheetTile(id, dataUrl);
  const diagnostics = app.diagnostics();
  const result: D4Capture = {
    id,
    drawCalls: diagnostics.drawCalls,
    nodeCount: Array.isArray((app.scene as { readonly nodes?: readonly unknown[] }).nodes)
      ? ((app.scene as { readonly nodes?: readonly unknown[] }).nodes!.length)
      : 0,
    backend: (diagnostics.renderer as { readonly runtime?: { readonly backend?: string } } | undefined)?.runtime?.backend
      ?? (diagnostics as { readonly backend?: string }).backend
      ?? "unknown",
    errorCount: diagnostics.errors.length,
    warnings,
    image: metrics,
    meta
  };
  app.dispose();
  canvas.remove();
  return result;
}

async function drawContactSheetTile(id: string, dataUrl: string): Promise<void> {
  const context = contactSheet.getContext("2d");
  if (!context) return;
  if (contactSheetIndex === 0) {
    context.fillStyle = "#020617";
    context.fillRect(0, 0, contactSheet.width, contactSheet.height);
  }
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const tileWidth = 320;
  const tileHeight = 360;
  const col = contactSheetIndex % 4;
  const row = Math.floor(contactSheetIndex / 4);
  const x = col * tileWidth;
  const y = row * tileHeight;
  context.fillStyle = "#0f172a";
  context.fillRect(x, y, tileWidth, tileHeight);
  context.drawImage(image, x + 8, y + 30, tileWidth - 16, tileHeight - 38);
  context.fillStyle = "#e2e8f0";
  context.font = "700 15px system-ui, sans-serif";
  context.fillText(id, x + 10, y + 20);
  contactSheetIndex += 1;
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
  throw new Error(`${id}: Aura3D app did not draw a frame before the D4 harness timeout.`);
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function analyzeDataUrl(dataUrl: string): Promise<ImageMetrics> {
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
  let nonLightPixels = 0;
  let amberPixels = 0;
  let yellowPixels = 0;
  let cyanPixels = 0;
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
    if (luma < 238) nonLightPixels += 1;
    if (r > 165 && g > 120 && r > b + 18 && g > b + 6) amberPixels += 1;
    if (r > 160 && g > 140 && b < 120) yellowPixels += 1;
    if (g > 120 && b > 140 && r < 130) cyanPixels += 1;
    if (luma > 150) brightPixels += 1;
    spatialChecksum = (spatialChecksum + Math.round(luma) * (index + 17)) % 1_000_003;
  }
  return { nonDarkPixels, nonLightPixels, amberPixels, yellowPixels, cyanPixels, brightPixels, colorBuckets: buckets.size, spatialChecksum };
}

function metricDiff(a: ImageMetrics, b: ImageMetrics): number {
  return Math.abs(a.nonDarkPixels - b.nonDarkPixels) +
    Math.abs(a.nonLightPixels - b.nonLightPixels) +
    Math.abs(a.amberPixels - b.amberPixels) +
    Math.abs(a.yellowPixels - b.yellowPixels) +
    Math.abs(a.cyanPixels - b.cyanPixels) +
    Math.abs(a.brightPixels - b.brightPixels) +
    Math.abs(a.colorBuckets - b.colorBuckets) * 10 +
    Math.min(1_000, Math.abs(a.spatialChecksum - b.spatialChecksum));
}

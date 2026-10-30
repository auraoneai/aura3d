import { camera, createAuraApp, instances, lights, material, primitives, scene } from "@aura3d/engine";
// GU47(E-G): import createCrowd / loadCrowdPoses from "@aura3d/engine" once the public export lands.
import { createCrowd, loadCrowdPoses, type AuraCrowd, type AuraCrowdSpectator } from "../../../packages/engine/src/instances-model/CrowdKit";

/**
 * GU47 E-H receipt harness: the crowd kit (PRD WP-8, receipt `crowd-kit`).
 *
 * A stepped stand of 12 rows x 40 seats (480 spectators) facing the camera. The spectator is the
 * Khronos CesiumMan sample (skinned, one walk clip) baked into 4 poses at 1.7 m; every spectator
 * has a palette colour and its own clip phase. Variants share everything but the crowd:
 *   empty-stand    stand, ground and sun only (the draw baseline)
 *   crowd          + the crowd at t = 0, castShadow off (the <= 4 draws check)
 *   crowd-later    the same crowd one loop frame later (clip-phase motion)
 *   crowd-shadows  + the crowd with castShadow on (informational: depth-pass draws)
 */

export type CrowdVariant = "empty-stand" | "crowd" | "crowd-later" | "crowd-shadows";

export interface CrowdFrame {
  readonly key: CrowdVariant;
  readonly pngBase64: string;
  readonly width: number;
  readonly height: number;
  readonly meanLuma: number;
  /** Mean luma of the stand crop (where the crowd sits). */
  readonly standLuma: number;
  /** Fraction of stand-crop pixels in each palette hue bucket (saturated pixels only). */
  readonly paletteHueFractions: Readonly<Record<string, number>>;
  readonly drawCalls: number;
  readonly errors: readonly string[];
  /** The kit's own plan for the captured time (absent on empty-stand). */
  readonly plan?: { readonly spectators: number; readonly poseNodes: number; readonly draws: number; readonly trianglesPerSpectator: number };
  /** Wall time of one `crowd.update` call, ms (absent on empty-stand). */
  readonly updateMs?: number;
}

export interface CrowdComparison {
  readonly changedPixelFraction: number;
  readonly standChangedPixelFraction: number;
  readonly drawCallDelta: number;
}

declare global {
  interface Window {
    __AURA3D_CROWD_RECEIPT__?: {
      renderer(): string;
      render(id: CrowdVariant): Promise<CrowdFrame>;
      compare(a: CrowdVariant, b: CrowdVariant): CrowdComparison;
    };
    __AURA3D_CROWD_RECEIPT_ERROR__?: string;
  }
}

const SPECTATOR_GLB = { url: "/fixtures/three-compat/assets/corpus/cesium-man.glb", type: "model", format: "glb" } as const;
const ROWS = 12;
const SEATS = 40;
const POSES = 4;
const PALETTE = { red: "#d94141", blue: "#2f6fd6", yellow: "#f2c230", green: "#2fa35b" } as const;
const PALETTE_HUES: Readonly<Record<keyof typeof PALETTE, number>> = { red: 0, blue: 216, yellow: 45, green: 143 };
/** Stand crop: the band of the frame the rows project into (fractions of width / height). */
const STAND_CROP = { x0: 0.08, x1: 0.92, y0: 0.12, y1: 0.7 } as const;

const pixels = new Map<CrowdVariant, { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number; readonly drawCalls: number }>();

try {
  window.__AURA3D_CROWD_RECEIPT__ = { renderer: glRenderer, render, compare };
} catch (error) {
  window.__AURA3D_CROWD_RECEIPT_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function glRenderer(): string {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "no-webgl2";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

function spectators(): AuraCrowdSpectator[] {
  const colours = Object.values(PALETTE);
  const list: AuraCrowdSpectator[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let seat = 0; seat < SEATS; seat += 1) {
      const i = row * SEATS + seat;
      list.push({
        position: [(seat - (SEATS - 1) / 2) * 0.6, 0.3 + row * 0.45, -row * 0.8],
        yaw: 0,
        color: colours[(i * 7) % colours.length]!,
        phase: ((i * 7919) % 997) / 997
      });
    }
  }
  return list;
}

function standScene() {
  const steps = Array.from({ length: ROWS }, (_, row) => ({ position: [0, row * 0.45, -row * 0.8] as [number, number, number] }));
  return scene()
    .background("#0b0f17")
    .camera(camera.perspective({ position: [0, 5.5, 17], target: [0, 2.6, -4], fov: 45 }))
    .add(primitives.plane({ name: "crowd ground", size: [60, 60, 1], material: material.pbr({ color: "#3a3f47", roughness: 0.95 }) }).position(0, 0, 0))
    .add(instances.box({ name: "stand steps", size: [25, 0.3, 0.8], material: material.pbr({ color: "#5b6270", roughness: 0.9 }), transforms: steps }))
    .add(lights.hemisphere({ name: "crowd sky", intensity: 0.6 }))
    .add(lights.directional({ name: "crowd sun", position: [6, 12, 10], intensity: 2.2, shadow: true }));
}

function stage(): HTMLElement {
  const element = document.getElementById("crowd-stage");
  if (!element) throw new Error("Missing #crowd-stage");
  element.replaceChildren();
  return element;
}

type AuraApp = ReturnType<typeof createAuraApp>;

async function render(id: CrowdVariant): Promise<CrowdFrame> {
  let crowd: AuraCrowd | undefined;
  let clipSeconds = 1;
  let built = standScene();
  if (id !== "empty-stand") {
    const poses = await loadCrowdPoses(SPECTATOR_GLB, { poses: POSES, targetHeight: 1.7 });
    clipSeconds = poses.clipSeconds;
    crowd = createCrowd({ id: "receipt-crowd", poses, spectators: spectators(), castShadow: id === "crowd-shadows" });
    for (const node of crowd.nodes) built = built.add(node);
  }
  const app = createAuraApp(stage(), { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: built });
  try {
    await waitForDraw(app, id);
    let updateMs: number | undefined;
    // One loop frame later for crowd-later: every phase group steps to its next pose node.
    const time = id === "crowd-later" ? clipSeconds / POSES + 1e-3 : 0;
    if (crowd) {
      const started = performance.now();
      crowd.update(app, time);
      updateMs = performance.now() - started;
    }
    await settle(3);
    return await capture(app, id, crowd, time, updateMs);
  } finally {
    app.dispose();
  }
}

async function capture(app: AuraApp, key: CrowdVariant, crowd: AuraCrowd | undefined, time: number, updateMs: number | undefined): Promise<CrowdFrame> {
  const shot = app.screenshot();
  const image = new Image();
  image.src = shot.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create analysis canvas.");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const diagnostics = app.diagnostics();
  pixels.set(key, { data, width: canvas.width, height: canvas.height, drawCalls: diagnostics.drawCalls });
  let lumaSum = 0;
  for (let index = 0; index < data.length; index += 4) lumaSum += luma(data[index]!, data[index + 1]!, data[index + 2]!);
  const stand = standStats(data, canvas.width, canvas.height);
  const plan = crowd?.drawPlan(time);
  return {
    key,
    pngBase64: shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1),
    width: canvas.width,
    height: canvas.height,
    meanLuma: lumaSum / (canvas.width * canvas.height),
    standLuma: stand.luma,
    paletteHueFractions: stand.hues,
    drawCalls: diagnostics.drawCalls,
    errors: [...diagnostics.errors],
    ...(plan ? { plan: { spectators: plan.spectators, poseNodes: plan.poseNodes, draws: plan.draws, trianglesPerSpectator: plan.trianglesPerSpectator } } : {}),
    ...(updateMs !== undefined ? { updateMs } : {})
  };
}

function standStats(data: Uint8ClampedArray, width: number, height: number): { luma: number; hues: Record<string, number> } {
  const x0 = Math.floor(width * STAND_CROP.x0);
  const x1 = Math.floor(width * STAND_CROP.x1);
  const y0 = Math.floor(height * STAND_CROP.y0);
  const y1 = Math.floor(height * STAND_CROP.y1);
  const counts: Record<string, number> = Object.fromEntries(Object.keys(PALETTE).map((name) => [name, 0]));
  let lumaSum = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index]!;
      const g = data[index + 1]!;
      const b = data[index + 2]!;
      lumaSum += luma(r, g, b);
      total += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 50 || (max - min) / max < 0.35) continue;
      const hue = hueOf(r, g, b, max, min);
      for (const [name, target] of Object.entries(PALETTE_HUES)) {
        const distance = Math.min(Math.abs(hue - target), 360 - Math.abs(hue - target));
        if (distance <= 25) counts[name] = counts[name]! + 1;
      }
    }
  }
  return { luma: lumaSum / Math.max(1, total), hues: Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, count / Math.max(1, total)])) };
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function compare(a: CrowdVariant, b: CrowdVariant): CrowdComparison {
  const first = pixels.get(a);
  const second = pixels.get(b);
  if (!first || !second || first.data.length !== second.data.length) throw new Error(`compare(${a}, ${b}): frames missing or sized differently`);
  const { width, height } = first;
  let changed = 0;
  let standChanged = 0;
  let standTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const delta = Math.abs(first.data[index]! - second.data[index]!) + Math.abs(first.data[index + 1]! - second.data[index + 1]!) + Math.abs(first.data[index + 2]! - second.data[index + 2]!);
      const inStand = x >= width * STAND_CROP.x0 && x < width * STAND_CROP.x1 && y >= height * STAND_CROP.y0 && y < height * STAND_CROP.y1;
      if (inStand) standTotal += 1;
      if (delta > 6) {
        changed += 1;
        if (inStand) standChanged += 1;
      }
    }
  }
  return {
    changedPixelFraction: changed / (width * height),
    standChangedPixelFraction: standChanged / Math.max(1, standTotal),
    drawCallDelta: second.drawCalls - first.drawCalls
  };
}

function luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

async function waitForDraw(app: AuraApp, id: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 90_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${id}: never drew`);
}

async function settle(frames: number): Promise<void> {
  for (let i = 0; i < frames; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

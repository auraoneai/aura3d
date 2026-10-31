import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

/**
 * GU47 E-D receipt harness: `material.pbr({ rim })` (PRD WP-4, receipt `material-rim`).
 *
 * Two frames whose only difference is the sphere's `rim` field: a radius-1 sphere (scale 2) at the origin, a dark backdrop, one
 * directional key from the camera side, camera at z = 4 (fov 40). The rim term is `color * intensity * (1 - N·V)^power`,
 * so it must brighten the silhouette band and leave the sphere centre (N·V ≈ 1) unchanged.
 */

export type RimVariant = "rim-off" | "rim-on";

export interface RimFrame {
  readonly key: RimVariant;
  readonly pngBase64: string;
  readonly width: number;
  readonly height: number;
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
  /** Mean luma of the silhouette band (0.80..0.97 of the projected sphere radius). */
  readonly edgeLuma: number;
  /** Mean luma of the centre disc (0..0.35 of the projected radius). */
  readonly centerLuma: number;
  /** Mean (r - b) of the silhouette band: the orange rim pushes it up. */
  readonly edgeWarmth: number;
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

export interface RimComparison {
  readonly changedPixelFraction: number;
  readonly edgeLumaDelta: number;
  readonly centerLumaDelta: number;
  readonly edgeWarmthDelta: number;
}

declare global {
  interface Window {
    __AURA3D_RIM_RECEIPT__?: {
      renderer(): string;
      render(id: RimVariant): Promise<RimFrame>;
      compare(a: RimVariant, b: RimVariant): RimComparison;
    };
    __AURA3D_RIM_RECEIPT_ERROR__?: string;
  }
}

const CAMERA_DISTANCE = 4;
const FOV_DEGREES = 40;
const SPHERE_RADIUS = 1;
/**
 * `primitives.sphere` is a unit-DIAMETER sphere (radius 0.5; its size is `diameter (radius * 2)`), so a radius-1
 * subject is scale 2. With scale 1 the measured silhouette band (0.80..0.97 of the radius-1 projection) fell on the
 * backdrop and the centre disc reached 0.7 of the real sphere's radius, so the rim could never brighten the "edge".
 */
const SPHERE_SCALE = SPHERE_RADIUS * 2;
const RIM = { color: "#ffb347", power: 2.5, intensity: 1.5 } as const;

const pixels = new Map<RimVariant, { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number }>();

try {
  window.__AURA3D_RIM_RECEIPT__ = { renderer: glRenderer, render, compare };
} catch (error) {
  window.__AURA3D_RIM_RECEIPT_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function glRenderer(): string {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "no-webgl2";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

function rimScene(id: RimVariant) {
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 0, CAMERA_DISTANCE], target: [0, 0, 0], fov: FOV_DEGREES }))
    .add(primitives.sphere({
      name: "rim subject",
      material: material.pbr({ color: "#2a3140", roughness: 0.6, metallic: 0, ...(id === "rim-on" ? { rim: RIM } : {}) })
    }).position(0, 0, 0).scale([SPHERE_SCALE, SPHERE_SCALE, SPHERE_SCALE]))
    .add(lights.directional({ name: "rim key", position: [1.5, 2.5, 4], intensity: 1.6 }));
}

function stage(): HTMLElement {
  const element = document.getElementById("rim-stage");
  if (!element) throw new Error("Missing #rim-stage");
  element.replaceChildren();
  return element;
}

type AuraApp = ReturnType<typeof createAuraApp>;

async function render(id: RimVariant): Promise<RimFrame> {
  const app = createAuraApp(stage(), { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: rimScene(id) });
  try {
    await waitForDraw(app, id);
    await settle(app, 2);
    return await capture(app, id);
  } finally {
    app.dispose();
  }
}

async function capture(app: AuraApp, key: RimVariant): Promise<RimFrame> {
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
  pixels.set(key, { data, width: canvas.width, height: canvas.height });
  const diagnostics = app.diagnostics();
  const band = ringStats(data, canvas.width, canvas.height, 0.8, 0.97);
  const centre = ringStats(data, canvas.width, canvas.height, 0, 0.35);
  let lumaSum = 0;
  let nonBlack = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = luma(data[index]!, data[index + 1]!, data[index + 2]!);
    lumaSum += value;
    if (value > 8) nonBlack += 1;
  }
  const total = canvas.width * canvas.height;
  return {
    key,
    pngBase64: shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1),
    width: canvas.width,
    height: canvas.height,
    meanLuma: lumaSum / total,
    nonBlackRatio: nonBlack / total,
    edgeLuma: band.luma,
    centerLuma: centre.luma,
    edgeWarmth: band.warmth,
    drawCalls: diagnostics.drawCalls,
    errors: [...diagnostics.errors]
  };
}

/** Projected sphere radius in pixels (perspective camera on the sphere's axis). */
function projectedRadius(height: number): number {
  const angular = Math.asin(SPHERE_RADIUS / CAMERA_DISTANCE);
  return (Math.tan(angular) / Math.tan((FOV_DEGREES * Math.PI) / 360)) * (height / 2);
}

function ringStats(data: Uint8ClampedArray, width: number, height: number, inner: number, outer: number): { luma: number; warmth: number } {
  const radius = projectedRadius(height);
  const cx = width / 2;
  const cy = height / 2;
  let lumaSum = 0;
  let warmthSum = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
      if (r < inner || r > outer) continue;
      const index = (y * width + x) * 4;
      lumaSum += luma(data[index]!, data[index + 1]!, data[index + 2]!);
      warmthSum += data[index]! - data[index + 2]!;
      count += 1;
    }
  }
  return { luma: lumaSum / Math.max(1, count), warmth: warmthSum / Math.max(1, count) };
}

function compare(a: RimVariant, b: RimVariant): RimComparison {
  const firstFrame = pixels.get(a);
  const secondFrame = pixels.get(b);
  if (!firstFrame || !secondFrame || firstFrame.data.length !== secondFrame.data.length) throw new Error(`compare(${a}, ${b}): frames missing or sized differently`);
  const { width, height } = firstFrame;
  const first = firstFrame.data;
  const second = secondFrame.data;
  let changed = 0;
  for (let index = 0; index < first.length; index += 4) {
    const delta = Math.abs(first[index]! - second[index]!) + Math.abs(first[index + 1]! - second[index + 1]!) + Math.abs(first[index + 2]! - second[index + 2]!);
    if (delta > 6) changed += 1;
  }
  const bandA = ringStats(first, width, height, 0.8, 0.97);
  const bandB = ringStats(second, width, height, 0.8, 0.97);
  const centreA = ringStats(first, width, height, 0, 0.35);
  const centreB = ringStats(second, width, height, 0, 0.35);
  return {
    changedPixelFraction: changed / (width * height),
    edgeLumaDelta: bandB.luma - bandA.luma,
    centerLumaDelta: centreB.luma - centreA.luma,
    edgeWarmthDelta: bandB.warmth - bandA.warmth
  };
}

function luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

async function waitForDraw(app: AuraApp, id: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 60_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${id}: never drew`);
}

async function settle(app: AuraApp, steps: number): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let index = 0; index < steps; index += 1) app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

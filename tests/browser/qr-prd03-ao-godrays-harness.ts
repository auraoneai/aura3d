/**
 * PRD-03 S13 (GTAO grounding) and S12 (god-ray shafts, scene 25b) browser
 * probes on the real flag-on v2 chain. Both compare an effect-on frame with
 * an effect-off frame of the same scene and score masks defined by geometry,
 * not by eye.
 *
 * S13 `prd03-ao-grounding` (PRD-03:2161, fallback path): a 1 m box resting on
 * a lit floor, seen straight down through an orthographic camera (80 px/m).
 * Contact band = floor pixels 0–10 cm outside the box footprint; open floor =
 * floor pixels ≥ 1 m from the box. Asserted: the contact band is ≥ 15 %
 * darker with AO on, and the open floor changes ≤ 2 %.
 *
 * S12 25b (PRD-03:2164): `prd03-night-fog-banding` with the sun behind two
 * pillars and `effects.volumetricFog` (S4 god rays on the v2 chain). A mask
 * render (pillars unlit white, everything else black, no post) gives the
 * occluded pillar mask; the shaft mask is the non-pillar pixels between the
 * pillars over the pillars' rows. Asserted: shafts add ≥ 3 % mean luma,
 * the occluded mask gains ≤ 0.5 %, and 0 `readPixels` calls during the
 * stepped frames.
 */
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";
import { frameToPngDataUrl, installFrameCapture, meanLuma, postDiagnostics, traceGlErrors } from "./qr-prd03-frame-capture";
import { postV2ModulesReady } from "@aura3d/rendering";

// configureCanvas enforces a 320×220 minimum backing store; a smaller host
// gives a wider canvas than the probe indexes (GPU run 38140351314 read a
// 320-wide frame with a smaller stride). 320 keeps the canvas square.
const SIZE = 320;

let insideStep = false;
let readsDuringSteps = 0;
const origReadPixels = WebGL2RenderingContext.prototype.readPixels;
WebGL2RenderingContext.prototype.readPixels = function (...args: Parameters<WebGL2RenderingContext["readPixels"]>) {
  if (insideStep) readsDuringSteps += 1;
  return (origReadPixels as unknown as (...a: unknown[]) => unknown).apply(this, args);
};

function luma(pixels: Uint8Array, i: number): number {
  return (pixels[i]! * 0.2126 + pixels[i + 1]! * 0.7152 + pixels[i + 2]! * 0.0722) / 255;
}

/** Diagnostics for the spec artifacts: a PNG, mean luma and the post/output state per render. */
export const frameDiagnostics: Record<string, { png: string; meanLuma: number; diagnostics: unknown; glErrors?: string[] }> = {};

async function renderFrame(built: ReturnType<typeof scene>, flags: readonly string[], frames = 8, label = "", tier?: "low" | "medium" | "high"): Promise<{ pixels: Uint8Array; reads: number }> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2400px;top:0;width:${SIZE}px;height:${SIZE}px;`;
  document.body.appendChild(host);
  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    qualityRebuild: { flags: [...flags] }
  });
  try {
    await app.ready();
    await postV2ModulesReady();
    if (tier) {
      // The tier is read at compile time; the scene compiled before ready()
      // resolved, so re-submit it after recording the tier (GPU run
      // 38158478621 showed both legs identical without this).
      // setQualityTier lives on app.post (not flattened onto app); a missing
      // surface must fail loudly, never leave both legs at the default tier
      // (GPU runs 38158478621 / 38159826267 rendered identical legs).
      const post = (app as { post?: { setQualityTier?: (t: string) => void } }).post;
      if (!post?.setQualityTier) throw new Error("app.post.setQualityTier unavailable");
      post.setQualityTier(tier);
      (app as unknown as { setScene(s: unknown): void }).setScene(built);
      const q = (app as { quality?: { tier?: unknown; current?: unknown } }).quality;
      console.log(`[ao-godrays-tier] ${label} requested=${tier} surface=${String((post as { qualityTier?: unknown }).qualityTier)} appQuality=${q ? JSON.stringify({ tier: q.tier ?? null, current: q.current ?? null }) : "absent"}`);
    }
    // Read in the stepping task from the default framebuffer (qr-prd03-frame-capture).
    const canvasEl = host.querySelector("canvas")!;
    const capture = installFrameCapture(app, canvasEl);
    const rendererErrors: string[] = [];
    (app as { onRendererError?: (cb: (e: unknown) => void) => void }).onRendererError?.((e) => rendererErrors.push(String((e as { message?: string; code?: string }).code ?? "") + " " + String((e as { message?: string }).message ?? e).slice(0, 300)));
    const errors = label ? traceGlErrors(canvasEl.getContext("webgl2") as WebGL2RenderingContext) : null;
    const before = readsDuringSteps;
    for (let i = 0; i < frames; i++) {
      insideStep = true;
      app.step(1 / 60);
      insideStep = false;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const reads = readsDuringSteps - before;
    const pixels = capture.read();
    errors?.uninstall();
    if (label) frameDiagnostics[label] = { png: frameToPngDataUrl(pixels, SIZE, SIZE), meanLuma: meanLuma(pixels), diagnostics: { rendererErrors, ...(postDiagnostics(app) as object) }, glErrors: errors?.entries };
    return { pixels, reads };
  } finally {
    insideStep = false;
    app.dispose();
    host.remove();
  }
}

/* --------------------------------- S13 ---------------------------------- */

const ORTHO_HALF = 2; // metres: 4 m across SIZE px → 80 px/m
const PX_M = 1 / (SIZE / (2 * ORTHO_HALF)); // metres per pixel

function aoScene(ao: boolean) {
  const base = scene()
    .background("#000000")
    // Straight down; the 1 cm z offset keeps the look-at basis defined. The
    // box is symmetric, so screen orientation does not matter.
    .camera(camera.orthographic({ position: [0, 10, 0.01], target: [0, 0, 0], orthographicSize: ORTHO_HALF }))
    .add(lights.ambient({ name: "sky", color: "#ffffff", intensity: 0.9 }))
    .add(lights.directional({ name: "key", color: "#ffffff", intensity: 0.4, position: [0, 10, 0.01] }))
    .add(primitives.plane({ name: "floor", size: [8, 1, 8], material: material.pbr({ color: "#b8b8b8", roughness: 1 }) }))
    .add(primitives.box({ name: "block", size: [1, 1, 1], material: material.pbr({ color: "#8a8a8a", roughness: 1 }) }).position(0, 0.5, 0));
  return ao ? base.add(effects.ambientOcclusion({ radius: 0.5, intensity: 1 })) : base;
}

/** Chebyshev distance (m) from the box footprint (|x|,|z| ≤ 0.5) for pixel (px,py). */
function footprintDistance(px: number, py: number): number {
  const wx = ((px + 0.5) / SIZE * 2 - 1) * ORTHO_HALF;
  const wz = ((py + 0.5) / SIZE * 2 - 1) * ORTHO_HALF;
  return Math.max(Math.abs(wx), Math.abs(wz)) - 0.5;
}

export async function runAoGroundingProbe() {
  const off = await renderFrame(aoScene(false), ["post"], 8, "ao-off");
  const on = await renderFrame(aoScene(true), ["post"], 8, "ao-on");
  let bandOn = 0, bandOff = 0, bandN = 0, openOn = 0, openOff = 0, openN = 0;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const d = footprintDistance(px, py);
      const i = (py * SIZE + px) * 4;
      // 1 px guard on both sides of the 0–10 cm band (80 px/m → 8 px band).
      if (d > PX_M && d <= 0.1 - PX_M) { bandOn += luma(on.pixels, i); bandOff += luma(off.pixels, i); bandN++; }
      if (d >= 1) { openOn += luma(on.pixels, i); openOff += luma(off.pixels, i); openN++; }
    }
  }
  return {
    schema: "ao-grounding/v1",
    bandPixels: bandN,
    openPixels: openN,
    bandOff: bandOff / Math.max(1, bandN),
    bandOn: bandOn / Math.max(1, bandN),
    contactDarkening: bandOff > 0 ? 1 - bandOn / bandOff : 0,
    openChange: openOff > 0 ? Math.abs(openOn - openOff) / openOff : 0
  };
}

/* --------------------------------- S12 ---------------------------------- */

const PILLARS = [
  { name: "pillar l", x: -1.2, z: -7 },
  { name: "pillar r", x: 1.2, z: -7 }
] as const;

/** 25b: camera looks at the sun low behind two pillars, night fog. */
function shaftScene(mode: "off" | "on" | "mask") {
  const pillarMaterial = mode === "mask"
    ? material.emissive({ color: "#000000", emissive: "#ffffff", emissiveIntensity: 1 })
    : material.pbr({ color: "#1d2530", roughness: 0.9 });
  let built = scene()
    .background(mode === "mask" ? "#000000" : "#030711")
    .camera(camera.perspective({ position: [0, 1.6, 4], target: [0, 1.8, -20], fov: 50, near: 0.1, far: 120 }));
  if (mode !== "mask") {
    built = built
      .add(lights.directional({ name: "sun", color: "#ffd9a8", intensity: 3, position: [0, 3, -40], target: [0, 1.6, 4] }))
      .add(lights.ambient({ name: "moon ambient", color: "#1a2233", intensity: 0.35 }))
      .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#10151d", roughness: 0.95 }) }).position(0, 0, -8))
      .add(effects.fog({ density: 0.045, color: "#0a1220" }));
  }
  for (const pillar of PILLARS) {
    built = built.add(primitives.cylinder({ name: pillar.name, size: [0.6, 4, 0.6], material: pillarMaterial }).position(pillar.x, 2, pillar.z));
  }
  return mode === "on" ? built.add(effects.volumetricFog({ intensity: 0.8, density: 0.12, color: "#ffd9a8" })) : built;
}

export async function runGodRayShaftProbe() {
  const mask = await renderFrame(shaftScene("mask"), [], 2, "shaft-mask");
  // S4-only A/B: both legs carry effects.volumetricFog, so the forward fog
  // inscatter it drives (compiler/fog.ts:105) lights the pillars equally in
  // both. Only S4 differs: the "low" post tier drops god rays and nothing
  // else (PostQualityTiers godRays gate). The old "off" leg had no
  // volumetricFog, so the forward inscatter on the pillar faces counted as
  // "god-ray light in the occluded mask" (+71%, GPU run 38151583035).
  const off = await renderFrame(shaftScene("on"), ["post"], 8, "shaft-off", "low");
  const on = await renderFrame(shaftScene("on"), ["post"], 8, "shaft-on", "high");
  // Pillar mask and its bounding rows/columns.
  const pillar = new Uint8Array(SIZE * SIZE);
  let minX = SIZE, maxX = -1, minY = SIZE, maxY = -1;
  for (let p = 0; p < SIZE * SIZE; p++) {
    if (luma(mask.pixels, p * 4) > 0.5) {
      pillar[p] = 1;
      const x = p % SIZE, y = Math.floor(p / SIZE);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  let shaftOn = 0, shaftOff = 0, shaftN = 0, occOn = 0, occOff = 0, occN = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = y * SIZE + x, i = p * 4;
      if (pillar[p]) { occOn += luma(on.pixels, i); occOff += luma(off.pixels, i); occN++; }
      else { shaftOn += luma(on.pixels, i); shaftOff += luma(off.pixels, i); shaftN++; }
    }
  }
  return {
    schema: "godray-shafts/v1",
    shaftPixels: shaftN,
    pillarPixels: occN,
    // Added luma as a fraction of full scale (0..1 luma).
    shaftAdded: (shaftOn - shaftOff) / Math.max(1, shaftN),
    occludedAdded: (occOn - occOff) / Math.max(1, occN),
    readPixelsDuringSteps: on.reads + off.reads
  };
}

export async function runQrPrd03AoGodrays() {
  const ao = await runAoGroundingProbe().catch((e) => ({ schema: "ao-grounding/v1", error: String(e) }));
  const godrays = await runGodRayShaftProbe().catch((e) => ({ schema: "godray-shafts/v1", error: String(e) }));
  return { schema: "prd03-ao-godrays/v1", ao, godrays, frames: frameDiagnostics };
}

(window as { runQrPrd03AoGodrays?: typeof runQrPrd03AoGodrays }).runQrPrd03AoGodrays = runQrPrd03AoGodrays;
(window as { qrPrd03AoGodraysReady?: boolean }).qrPrd03AoGodraysReady = true;

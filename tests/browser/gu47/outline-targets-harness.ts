import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

/**
 * GU47 E-E receipt harness: `effects.outline({ targets })` and `effects.toon({ inkSource, fadeDistance, inkColor })`
 * (PRD WP-5, spec `outline-targets.spec.ts`; phase 2, remote software WebGL2 only).
 *
 * One fixed scene: a sky-blue background over a ground plane, the target sphere "rider" in front, a non-target box
 * "crate" beside it, camera looking slightly down so the top quarter of the frame is pure sky. Variants:
 * - `mask`: rider white unlit, everything else black, no post (the rider's silhouette, for the perimeter);
 * - `plain`: the lit scene, no outline;  `targets`: + outline({ targets: ["rider"] });  `full`: + outline() (today);
 * - `toon-color`: + toon() (today's Silt pass);  `toon-depth`: + toon({ inkSource: "depth", fadeDistance: 40, inkColor }).
 * - `toon-depth-flat`: `toon-depth` with `outline: 0`, the same luma banding without ink. Toon banding recolours every
 *   pixel (the sky too), so the depth-ink checks compare `toon-depth-flat` → `toon-depth`: the only difference is the ink.
 *   The sky/geometry split always comes from the `plain` frame.
 * - `toon-depth-near`: `toon-depth` with `fadeDistance: 4` (ink zero past 4 m; the rider is about 7 m out): the fade.
 */

export type OutlineVariant = "mask" | "plain" | "targets" | "full" | "toon-color" | "toon-depth" | "toon-depth-flat" | "toon-depth-near";

export interface OutlineFrame {
  readonly key: OutlineVariant;
  readonly pngBase64: string;
  readonly width: number;
  readonly height: number;
  readonly drawCalls: number;
  readonly errors: readonly string[];
  readonly postSkipped: readonly string[];
  /** C-31 stage trace of the last frame (`diagnostics().post.stagesRan`). */
  readonly stagesRan: readonly string[];
  /** Mean sRGB of the whole frame and of its top quarter (sky): diagnostics for the receipt log. */
  readonly meanRgb: readonly [number, number, number];
  readonly skyRgb: readonly [number, number, number];
}

export interface OutlineComparison {
  /** Fraction of the rider's outer silhouette ring (1..2 px outside the mask) whose colour moved toward the ink. */
  readonly riderPerimeterInked: number;
  /**
   * Fraction of the rider's silhouette positions (its 1 px outer ring) where the pixel itself or an adjacent rider pixel
   * moved toward the ink. The depth ink is a 1 px line on each side of a depth step (an inverse-depth Laplacian), so the
   * 2 px ring `riderPerimeterInked` reads (made for `outline({ width: 2 })`) caps it near 50% by construction; this
   * reads whether the silhouette carries a line at all, on either side of the edge.
   */
  readonly riderSilhouetteInked: number;
  /** Same for the crate (a non-target; must stay near 0 for `targets`). */
  readonly cratePerimeterInked: number;
  /** Fraction of sky pixels (top quarter, no geometry in the mask) that changed by more than 24 (sum of |dRGB|). */
  readonly skyEdgeFraction: number;
  /** Changed-pixel fraction of the bottom quarter (ground) and the top quarter (sky). */
  readonly bottomChanged: number;
  readonly topChanged: number;
}

declare global {
  interface Window {
    __AURA3D_OUTLINE_RECEIPT__?: {
      renderer(): string;
      render(id: OutlineVariant): Promise<OutlineFrame>;
      compare(base: OutlineVariant, inked: OutlineVariant): OutlineComparison;
    };
    __AURA3D_OUTLINE_RECEIPT_ERROR__?: string;
  }
}

export const INK = "#1b2236";
const INK_RGB = [0x1b, 0x22, 0x36] as const;
const SKY = "#8fc3ea";

const frames = new Map<OutlineVariant, { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number }>();

try {
  window.__AURA3D_OUTLINE_RECEIPT__ = { renderer: glRenderer, render, compare };
} catch (error) {
  window.__AURA3D_OUTLINE_RECEIPT_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function glRenderer(): string {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "no-webgl2";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

/** Constant-colour custom material for the mask frame (no lighting, no fog). */
const flat = (rgb: string) => material.custom({ glsl: { fragment: `out vec4 outColor;\nvoid main() { outColor = vec4(${rgb}, 1.0); }` } });

function outlineScene(id: OutlineVariant) {
  const mask = id === "mask";
  const lit = (color: string) => (mask ? flat("0.0, 0.0, 0.0") : material.pbr({ color, roughness: 0.7, metallic: 0 }));
  let built = scene()
    .background(mask ? "#000000" : SKY)
    .camera(camera.perspective({ position: [0, 2.2, 7], target: [0, 0.6, 0], fov: 45 }))
    .add(primitives.plane({ name: "ground", material: lit("#c9a46a") }).position(0, 0, 0).scale([40, 1, 40]))
    .add(primitives.sphere({ name: "rider", material: mask ? flat("1.0, 1.0, 1.0") : material.pbr({ color: "#e07a3a", roughness: 0.5, metallic: 0 }) }).position(-0.9, 1, 0))
    .add(primitives.box({ name: "crate", material: lit("#6f8f4a") }).position(1.4, 0.5, -0.5))
    .add(lights.directional({ name: "key", position: [3, 6, 4], intensity: 1.6 }));
  if (id === "targets") built = built.add(effects.outline({ color: INK, width: 2, intensity: 1, targets: ["rider"] }));
  if (id === "full") built = built.add(effects.outline({ color: INK, width: 2, intensity: 1 }));
  return built;
}

function stage(): HTMLElement {
  const element = document.getElementById("outline-stage");
  if (!element) throw new Error("Missing #outline-stage");
  element.replaceChildren();
  return element;
}

type AuraApp = ReturnType<typeof createAuraApp>;

async function render(id: OutlineVariant): Promise<OutlineFrame> {
  const app = createAuraApp(stage(), { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: outlineScene(id) });
  try {
    await waitForDraw(app, id);
    // One pass name per variant: the stage trace is page-global, so a disposed app's pass must not satisfy waitForPass.
    const pass = `receipt-${id}`;
    if (id === "toon-color") app.post?.addPostPass?.(effects.toon({ name: pass, size: [480, 270] }));
    if (id === "toon-depth" || id === "toon-depth-flat" || id === "toon-depth-near") {
      // GU47 E-E: depth is bound at the HDR anchors today; `after-tonemap` needs the E-C LDR-tail depth handoff.
      app.post?.addPostPass?.(effects.toon({ name: pass, size: [480, 270], inkSource: "depth", fadeDistance: id === "toon-depth-near" ? 4 : 40, inkColor: INK, order: "before-tonemap", ...(id === "toon-depth-flat" ? { outline: 0 } : {}) }));
    }
    if (id.startsWith("toon-")) await waitForPass(app, pass);
    await settle(app, 3);
    return await capture(app, id);
  } finally {
    app.dispose();
  }
}

async function capture(app: AuraApp, key: OutlineVariant): Promise<OutlineFrame> {
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
  frames.set(key, { data, width: canvas.width, height: canvas.height });
  const diagnostics = app.diagnostics() as ReturnType<AuraApp["diagnostics"]> & { readonly output?: { readonly postSkipped?: readonly string[] } };
  return {
    key,
    pngBase64: shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1),
    width: canvas.width,
    height: canvas.height,
    drawCalls: diagnostics.drawCalls,
    errors: [...diagnostics.errors],
    postSkipped: [...(diagnostics.output?.postSkipped ?? [])],
    stagesRan: [...((diagnostics as unknown as { readonly post?: { readonly stagesRan?: readonly string[] } }).post?.stagesRan ?? [])],
    meanRgb: meanRgb(data, canvas.width, 0, canvas.height),
    skyRgb: meanRgb(data, canvas.width, 0, Math.floor(canvas.height / 4))
  };
}

/** Mean sRGB of rows [y0, y1) (row 0 at the top of the screenshot). */
function meanRgb(data: Uint8ClampedArray, width: number, y0: number, y1: number): [number, number, number] {
  const rows = data.length / 4 / width;
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = Math.max(0, y0); y < Math.min(rows, y1); y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    sum[0] += data[i]!; sum[1] += data[i + 1]!; sum[2] += data[i + 2]!; count += 1;
  }
  return [Math.round(sum[0]! / Math.max(1, count)), Math.round(sum[1]! / Math.max(1, count)), Math.round(sum[2]! / Math.max(1, count))];
}

/** Pixels just outside a coverage mask: not covered, with a covered pixel within `radius` px (8 directions). */
function ring(covered: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && covered[y * width + x] === 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y)) continue;
      for (let step = 1; step <= radius && !out[y * width + x]; step += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
          if (at(x + dx * step, y + dy * step)) { out[y * width + x] = 1; break; }
        }
      }
    }
  }
  return out;
}

function compare(base: OutlineVariant, inked: OutlineVariant): OutlineComparison {
  const maskFrame = frames.get("mask");
  const plainFrame = frames.get("plain");
  const a = frames.get(base);
  const b = frames.get(inked);
  if (!maskFrame || !plainFrame || !a || !b) throw new Error(`compare(${base}, ${inked}): render mask, plain, ${base} and ${inked} first`);
  const { width, height } = a;
  const rider = new Uint8Array(width * height);
  const geometry = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const r = maskFrame.data[i * 4]!, g = maskFrame.data[i * 4 + 1]!, bl = maskFrame.data[i * 4 + 2]!;
    rider[i] = r > 200 && g > 200 && bl > 200 ? 1 : 0;
  }
  // Geometry = anything that is not the sky colour in the plain frame (not `base`: a toon base bands the sky).
  const sky = [0x8f, 0xc3, 0xea];
  const p = plainFrame.data;
  for (let i = 0; i < width * height; i += 1) {
    const d = Math.abs(p[i * 4]! - sky[0]!) + Math.abs(p[i * 4 + 1]! - sky[1]!) + Math.abs(p[i * 4 + 2]! - sky[2]!);
    geometry[i] = d > 30 || rider[i] ? 1 : 0;
  }
  const towardInk = (i: number) => {
    const before = Math.abs(a.data[i * 4]! - INK_RGB[0]) + Math.abs(a.data[i * 4 + 1]! - INK_RGB[1]) + Math.abs(a.data[i * 4 + 2]! - INK_RGB[2]);
    const after = Math.abs(b.data[i * 4]! - INK_RGB[0]) + Math.abs(b.data[i * 4 + 1]! - INK_RGB[1]) + Math.abs(b.data[i * 4 + 2]! - INK_RGB[2]);
    return before - after > 24;
  };
  const changed = (i: number) => Math.abs(a.data[i * 4]! - b.data[i * 4]!) + Math.abs(a.data[i * 4 + 1]! - b.data[i * 4 + 1]!) + Math.abs(a.data[i * 4 + 2]! - b.data[i * 4 + 2]!) > 24;
  const riderRing = ring(rider, width, height, 2);
  const riderRing1 = ring(rider, width, height, 1);
  // The crate's silhouette: geometry that is neither the rider nor the ground band below the horizon, right half.
  const crate = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = Math.floor(width * 0.55); x < width; x += 1) {
    const i = y * width + x;
    const r = a.data[i * 4]!, g = a.data[i * 4 + 1]!, bl = a.data[i * 4 + 2]!;
    crate[i] = g > r && g > bl && !rider[i] ? 1 : 0; // the green box
  }
  const crateRing = ring(crate, width, height, 2);
  let silhouetteTotal = 0, silhouetteInked = 0;
  const innerInked = (x: number, y: number) => ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const).some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < width && ny < height && rider[ny * width + nx] === 1 && towardInk(ny * width + nx);
  });
  let riderTotal = 0, riderInked = 0, crateTotal = 0, crateInked = 0, skyTotal = 0, skyEdges = 0, top = 0, topTotal = 0, bottom = 0, bottomTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (riderRing[i] && !geometry[i]) { riderTotal += 1; if (towardInk(i)) riderInked += 1; }
      if (riderRing[i] && geometry[i] && !rider[i]) { riderTotal += 1; if (towardInk(i)) riderInked += 1; }
      if (riderRing1[i] && !rider[i]) { silhouetteTotal += 1; if (towardInk(i) || innerInked(x, y)) silhouetteInked += 1; }
      if (crateRing[i]) { crateTotal += 1; if (towardInk(i)) crateInked += 1; }
      // Canvas rows run top-down: y < height / 4 is the top quarter.
      if (y < height / 4) { topTotal += 1; if (changed(i)) top += 1; if (!geometry[i]) { skyTotal += 1; if (changed(i)) skyEdges += 1; } }
      if (y >= (height * 3) / 4) { bottomTotal += 1; if (changed(i)) bottom += 1; }
    }
  }
  return {
    riderPerimeterInked: riderInked / Math.max(1, riderTotal),
    riderSilhouetteInked: silhouetteInked / Math.max(1, silhouetteTotal),
    cratePerimeterInked: crateInked / Math.max(1, crateTotal),
    skyEdgeFraction: skyEdges / Math.max(1, skyTotal),
    bottomChanged: bottom / Math.max(1, bottomTotal),
    topChanged: top / Math.max(1, topTotal)
  };
}

async function waitForDraw(app: AuraApp, id: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 60_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${id}: no draw within 60 s`);
}

/**
 * `addPostPass` on a direct-path canvas remounts the scene (RP-03) asynchronously, and the old mount already drew, so
 * `waitForDraw` cannot tell the frames apart: a capture right after it read the canvas mid-remount (all black, at random).
 * Wait until a frame's stage trace shows this pass ran.
 */
async function waitForPass(app: AuraApp, name: string): Promise<void> {
  const started = performance.now();
  const ran = `custom:prd03.custom.${name}@`;
  while (performance.now() - started < 60_000) {
    const diagnostics = app.diagnostics() as ReturnType<AuraApp["diagnostics"]> & { readonly post?: { readonly stagesRan?: readonly string[] } };
    if (diagnostics.errors.length > 0) throw new Error(`${name}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.post?.stagesRan?.some((stage) => stage.startsWith(ran))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${name}: the pass did not run within 60 s`);
}

async function settle(app: AuraApp, steps: number): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let index = 0; index < steps; index += 1) app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

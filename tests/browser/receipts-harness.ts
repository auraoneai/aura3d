import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  model,
  primitives,
  scene,
  sceneKits
} from "@aura3d/engine";
import { postGraphV2LastOutcome, postV2ModulesReady } from "@aura3d/rendering";
import { assets } from "../../src/aura-assets";

/**
 * Pixel receipts harness (PRD beat-three.js WP-K.1 / WP-K.2).
 *
 * Effects are measured as on/off pairs whose only difference is the effect node, so a
 * measured pixel delta is attributable to the effect. Scene kits are mounted through their
 * own public `toAppOptions()` and measured for real pixels (draw calls, coverage, colour
 * spread, and motion between two frames).
 */

export type EffectVariantId =
  | "fx-baseline"
  | "fx-ao-room-off"
  | "fx-ao-room"
  | "fx-color-grade-desaturate"
  | "fx-color-grade-contrast"
  | "fx-card-off"
  | "fx-card-contrast"
  | "fx-vignette"
  | "fx-depth-of-field"
  | "fx-contact-room-off"
  | "fx-contact-room";

export type KitId =
  | "physicsPlayground"
  | "particleFountain"
  | "solarSystem"
  | "neonTunnel"
  | "dataViz"
  | "miniGolf"
  | "cityBlock"
  | "humanoidWalk"
  | "productViewer";

export interface FrameMetrics {
  readonly width: number;
  readonly height: number;
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
  readonly meanChroma: number;
  readonly lumaStd: number;
  readonly edgeEnergy: number;
  readonly cornerLuma: number;
  readonly centerLuma: number;
  readonly lowerCenterLuma: number;
  readonly colorBuckets: number;
}

export interface FrameResult {
  readonly key: string;
  readonly pngBase64: string;
  readonly metrics: FrameMetrics;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly errors: readonly string[];
    readonly requestedPasses: readonly string[];
    readonly actualPasses: readonly string[];
    readonly fallbackPasses: readonly string[];
    readonly ambientOcclusionPass: boolean;
    /** What the post chain actually ran (not what was requested): pipeline, v2 outcome, executed stages, skip reasons. */
    readonly post: {
      readonly pipeline: string;
      readonly v2Outcome: string | null;
      readonly stagesRan: readonly string[];
      readonly skipped: readonly string[];
    };
  };
}

export interface FrameComparison {
  readonly a: string;
  readonly b: string;
  readonly meanAbsoluteChannelDelta: number;
  readonly changedPixelFraction: number;
  readonly meanLumaDelta: number;
}

export interface KitRunResult {
  readonly id: KitId;
  readonly frames: readonly FrameResult[];
  readonly kit: {
    readonly nodeCount: number;
    readonly problems: readonly string[];
    readonly effectCount: number;
    readonly structuralScore: number;
  };
}

interface ReceiptsRunner {
  readonly effectVariants: readonly EffectVariantId[];
  readonly kitIds: readonly KitId[];
  renderer(): string;
  renderEffect(id: EffectVariantId): Promise<FrameResult>;
  renderKit(id: KitId): Promise<KitRunResult>;
  compare(a: string, b: string): FrameComparison;
}

declare global {
  interface Window {
    __AURA3D_RECEIPTS__?: ReceiptsRunner;
    __AURA3D_RECEIPTS_ERROR__?: string;
  }
}

const CHANGED_PIXEL_THRESHOLD = 12;
const effectVariants: readonly EffectVariantId[] = [
  "fx-baseline",
  "fx-ao-room-off",
  "fx-ao-room",
  "fx-color-grade-desaturate",
  "fx-color-grade-contrast",
  "fx-card-off",
  "fx-card-contrast",
  "fx-vignette",
  "fx-depth-of-field",
  "fx-contact-room-off",
  "fx-contact-room"
];
const kitIds: readonly KitId[] = [
  "physicsPlayground",
  "particleFountain",
  "solarSystem",
  "neonTunnel",
  "dataViz",
  "miniGolf",
  "cityBlock",
  "humanoidWalk",
  "productViewer"
];

const pixelStore = new Map<string, Uint8ClampedArray>();

try {
  window.__AURA3D_RECEIPTS__ = {
    effectVariants,
    kitIds,
    renderer: glRenderer,
    renderEffect,
    renderKit,
    compare
  };
} catch (error) {
  window.__AURA3D_RECEIPTS_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function glRenderer(): string {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return "no-webgl2";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}

function stage(): HTMLElement {
  const element = document.getElementById("receipts-stage");
  if (!element) throw new Error("Missing #receipts-stage");
  element.replaceChildren();
  return element;
}

/**
 * Occlusion test room: a floor, two walls forming a concave corner and two crates resting against them, all
 * within about 3 m of the camera so a 0.6 m occlusion radius reaches a large part of the frame. A hemisphere fill
 * supplies indirect light, which is the only light ambient occlusion attenuates (the GTAO apply scales the
 * indirect fraction of a pixel, so a directional-only scene has nothing for it to darken). The off frame is the
 * same scene with the same occlusion node at intensity 0, so both frames take the identical post chain and only
 * the occlusion term differs.
 */
function occlusionRoom(occlusion: ReturnType<typeof effects.ambientOcclusion> | ReturnType<typeof effects.contactShadows>) {
  const matte = (color: string) => material.pbr({ color, roughness: 0.9, metallic: 0 });
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [1.7, 1.7, 3.1], target: [-0.3, 0.55, -0.6], fov: 50 }))
    .add(primitives.plane({ name: "room floor", material: matte("#d6d9de") }).position(0, 0, 0).scale([6, 1, 6]))
    .add(primitives.box({ name: "room back wall", material: matte("#d6d9de") }).position(0, 1.5, -1.6).scale([6, 3, 0.2]))
    .add(primitives.box({ name: "room side wall", material: matte("#d6d9de") }).position(-1.7, 1.5, 0).scale([0.2, 3, 6]))
    .add(primitives.box({ name: "room corner crate", material: matte("#e9ecef") }).position(-1.0, 0.4, -0.85).scale([0.8, 0.8, 0.8]))
    .add(primitives.box({ name: "room second crate", material: matte("#e9ecef") }).position(-0.05, 0.25, -1.2).scale([0.5, 0.5, 0.5]))
    .add(lights.directional({ name: "room key", position: [2.6, 4.2, 3.4], intensity: 1 }))
    .add(lights.hemisphere({ name: "room fill", skyColor: "#dbe6f5", groundColor: "#8a8f98", intensity: 1 }))
    .add(occlusion);
}

/**
 * Greyscale step wedge: eleven evenly lit tiles from near-black to near-white on a mid-grey field, filling the
 * frame. A contrast control must spread these apart around the display mid-grey; the off frame is the same scene
 * with an identity colour grade so both frames take the same post chain.
 */
function cardScene(id: EffectVariantId) {
  const builder = scene()
    .background("#7f7f7f")
    .camera(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0], fov: 40 }))
    .add(lights.directional({ name: "card key", position: [0, 0, 8], intensity: 2 }))
    .add(lights.hemisphere({ name: "card fill", skyColor: "#ffffff", groundColor: "#ffffff", intensity: 0.6 }));
  const tiles = 11;
  for (let index = 0; index < tiles; index += 1) {
    const grey = Math.round(24 + (index / (tiles - 1)) * 216);
    const hex = grey.toString(16).padStart(2, "0");
    builder.add(primitives.plane({
      name: `card tile ${index}`,
      material: material.pbr({ color: `#${hex}${hex}${hex}`, roughness: 1, metallic: 0 })
    }).rotate(Math.PI / 2, 0, 0).position((index - (tiles - 1) / 2) * 0.58, 0, 0).scale([0.56, 1, 3.2]));
  }
  builder.add(effects.colorGrade(id === "fx-card-contrast" ? { name: "card grade contrast", contrast: 1.7 } : { name: "card grade identity" }));
  return builder;
}

function effectScene(id: EffectVariantId) {
  if (id === "fx-ao-room-off" || id === "fx-ao-room") {
    return occlusionRoom(effects.ambientOcclusion({ name: "room ambient occlusion", intensity: id === "fx-ao-room" ? 1 : 0, radius: 0.6 }));
  }
  if (id === "fx-contact-room-off" || id === "fx-contact-room") {
    return occlusionRoom(effects.contactShadows({ name: "room contact shadows", intensity: id === "fx-contact-room" ? 1 : 0, length: 1.5 }));
  }
  if (id === "fx-card-off" || id === "fx-card-contrast") return cardScene(id);
  // One shared body for every variant: a typed GLB subject (keeps the production bridge
  // eligible), a floor to ground against, a reference bar for blur/edges, fixed light and
  // camera. Only the effect node differs.
  const builder = scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 2.4, 4.4], target: [0, 0.7, 0], fov: 40 }))
    .add(primitives.plane({
      name: "receipt floor",
      material: material.pbr({ color: "#9aa2ae", roughness: 0.82, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(model(assets.robotcand, { name: "receipt typed subject", targetHeight: 1.5 })
      .position(0, 0.78, 0).runtime({ id: "subject" }))
    .add(primitives.box({
      name: "receipt reference bar",
      material: material.pbr({ color: "#dfe6f2", roughness: 0.3, metallic: 0 })
    }).position(0, 1.35, -1.5).scale([2.6, 0.16, 0.16]))
    .add(primitives.box({
      name: "receipt far colour block",
      material: material.pbr({ color: "#d9534f", roughness: 0.5, metallic: 0 })
    }).position(-1.6, 0.4, -3.2).scale([0.8, 0.8, 0.8]))
    .add(lights.directional({ name: "receipt key", position: [2.6, 4.2, 2.4], intensity: 2 }));

  switch (id) {
    case "fx-color-grade-desaturate":
      builder.add(effects.colorGrade({ name: "receipt grade desaturate", saturation: 0 }));
      break;
    case "fx-color-grade-contrast":
      builder.add(effects.colorGrade({ name: "receipt grade contrast", contrast: 1.7 }));
      break;
    case "fx-vignette":
      // smoothness is the falloff exponent in displayGrade.glsl (len^smoothness): 2 keeps the centre, <1 darkens the whole frame.
      builder.add(effects.vignette({ name: "receipt vignette", intensity: 0.5, smoothness: 2, roundness: 1 }));
      break;
    case "fx-depth-of-field":
      builder.add(effects.depthOfField({ name: "receipt depth of field", focus: 0.02, aperture: 1, maxBlur: 8 }));
      break;
    default:
      break;
  }
  return builder;
}

async function renderEffect(id: EffectVariantId): Promise<FrameResult> {
  const app = createAuraApp(stage(), {
    pixelRatio: 1,
    resize: false,
    renderer: { qualityProfile: "production" },
    scene: effectScene(id)
  });
  try {
    await waitForDraw(app, id);
    // The v2 post stages load deferred; a frame captured before they resolve is served by the fused present
    // only (no GTAO, no stage). Wait, then step so the captured frame is the steady-state chain.
    await postV2ModulesReady();
    await settle(app, 2);
    return await capture(app, id);
  } finally {
    app.dispose();
  }
}

async function renderKit(id: KitId): Promise<KitRunResult> {
  const kit = id === "productViewer"
    ? sceneKits.productViewer(assets.robotcand)
    : sceneKits[id]();
  const app = createAuraApp(stage(), { ...kit.toAppOptions(), pixelRatio: 1, resize: false });
  try {
    await waitForDraw(app, id);
    await settle(app, 1);
    const first = await capture(app, `${id}:t0`);
    await settle(app, 90);
    const second = await capture(app, `${id}:t1`);
    return {
      id,
      frames: [first, second],
      kit: {
        nodeCount: kit.diagnostics.nodeCount,
        problems: kit.diagnostics.problems.map((problem) => typeof problem === "string" ? problem : JSON.stringify(problem)),
        effectCount: kit.diagnostics.effectCount,
        structuralScore: kit.diagnostics.structuralScore
      }
    };
  } finally {
    app.dispose();
  }
}

type AuraApp = ReturnType<typeof createAuraApp>;

async function capture(app: AuraApp, key: string): Promise<FrameResult> {
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
  pixelStore.set(key, data);
  const diagnostics = app.diagnostics();
  const postprocess = diagnostics.renderer?.postprocess;
  return {
    key,
    pngBase64: shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1),
    metrics: measure(data, canvas.width, canvas.height),
    diagnostics: {
      backend: diagnostics.backend,
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls,
      errors: [...diagnostics.errors],
      requestedPasses: [...(postprocess?.requestedPasses ?? [])],
      actualPasses: [...(postprocess?.actualPasses ?? [])],
      fallbackPasses: [...(postprocess?.fallbackPasses ?? [])],
      ambientOcclusionPass: postprocess?.ambientOcclusionPass ?? false,
      post: {
        pipeline: String((diagnostics as { post?: { pipeline?: string } }).post?.pipeline ?? "none"),
        v2Outcome: postGraphV2LastOutcome(),
        stagesRan: [...((diagnostics as { post?: { stagesRan?: readonly string[] } }).post?.stagesRan ?? [])],
        skipped: [...((diagnostics as { post?: { skipped?: readonly string[] } }).post?.skipped ?? [])]
      }
    }
  };
}

function luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function regionMean(lumaPlane: Float32Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): number {
  const xa = Math.floor(x0 * width);
  const xb = Math.max(xa + 1, Math.floor(x1 * width));
  const ya = Math.floor(y0 * height);
  const yb = Math.max(ya + 1, Math.floor(y1 * height));
  let sum = 0;
  let count = 0;
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) {
      sum += lumaPlane[y * width + x] ?? 0;
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function measure(data: Uint8ClampedArray, width: number, height: number): FrameMetrics {
  const total = width * height;
  const plane = new Float32Array(total);
  const buckets = new Set<string>();
  let lumaSum = 0;
  let chromaSum = 0;
  let nonBlack = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const l = luma(r, g, b);
    plane[index] = l;
    lumaSum += l;
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
    if (Math.max(r, g, b) > 8) nonBlack += 1;
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
  }
  const mean = lumaSum / Math.max(1, total);
  let varianceSum = 0;
  let edgeSum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const l = plane[y * width + x] ?? 0;
      varianceSum += (l - mean) * (l - mean);
      if (x + 1 < width) edgeSum += Math.abs(l - (plane[y * width + x + 1] ?? 0));
      if (y + 1 < height) edgeSum += Math.abs(l - (plane[(y + 1) * width + x] ?? 0));
    }
  }
  const corners = [
    regionMean(plane, width, height, 0, 0, 0.12, 0.12),
    regionMean(plane, width, height, 0.88, 0, 1, 0.12),
    regionMean(plane, width, height, 0, 0.88, 0.12, 1),
    regionMean(plane, width, height, 0.88, 0.88, 1, 1)
  ];
  return {
    width,
    height,
    meanLuma: round(mean),
    nonBlackRatio: round(nonBlack / Math.max(1, total)),
    meanChroma: round(chromaSum / Math.max(1, total)),
    lumaStd: round(Math.sqrt(varianceSum / Math.max(1, total))),
    edgeEnergy: round(edgeSum / Math.max(1, total)),
    cornerLuma: round(corners.reduce((a, b) => a + b, 0) / corners.length),
    centerLuma: round(regionMean(plane, width, height, 0.375, 0.375, 0.625, 0.625)),
    lowerCenterLuma: round(regionMean(plane, width, height, 0.35, 0.7, 0.65, 0.9)),
    colorBuckets: buckets.size
  };
}

function compare(a: string, b: string): FrameComparison {
  const first = pixelStore.get(a);
  const second = pixelStore.get(b);
  if (!first || !second) throw new Error(`Frame not captured before comparison: ${first ? b : a}`);
  const total = Math.floor(Math.min(first.length, second.length) / 4);
  let deltaSum = 0;
  let changed = 0;
  let lumaA = 0;
  let lumaB = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const dr = Math.abs((first[offset] ?? 0) - (second[offset] ?? 0));
    const dg = Math.abs((first[offset + 1] ?? 0) - (second[offset + 1] ?? 0));
    const db = Math.abs((first[offset + 2] ?? 0) - (second[offset + 2] ?? 0));
    deltaSum += dr + dg + db;
    if (dr + dg + db > CHANGED_PIXEL_THRESHOLD) changed += 1;
    lumaA += luma(first[offset] ?? 0, first[offset + 1] ?? 0, first[offset + 2] ?? 0);
    lumaB += luma(second[offset] ?? 0, second[offset + 1] ?? 0, second[offset + 2] ?? 0);
  }
  return {
    a,
    b,
    meanAbsoluteChannelDelta: round(deltaSum / Math.max(1, total * 3)),
    changedPixelFraction: round(changed / Math.max(1, total)),
    meanLumaDelta: round((lumaB - lumaA) / Math.max(1, total))
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

async function waitForDraw(app: AuraApp, id: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 60_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  throw new Error(`${id}: never drew: drawCalls=${diagnostics.drawCalls} renderSize=${JSON.stringify(diagnostics.renderSize)} errors=${JSON.stringify(diagnostics.errors)}`);
}

async function settle(app: AuraApp, steps: number): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let index = 0; index < steps; index += 1) app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

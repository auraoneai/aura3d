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
  | "fx-ambient-occlusion"
  | "fx-color-grade-desaturate"
  | "fx-color-grade-contrast"
  | "fx-vignette"
  | "fx-depth-of-field"
  | "fx-contact-shadows";

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
  };
}

export interface FrameComparison {
  readonly a: string;
  readonly b: string;
  readonly meanAbsoluteChannelDelta: number;
  readonly changedPixelFraction: number;
  readonly meanLumaDelta: number;
}

/** WP-4 contact-shadow mask scenes: same floor, subject and light; only the effect node differs. */
export type ContactMaskVariant = "cm-nocast-off" | "cm-nocast-on" | "cm-shadowed-off" | "cm-shadowed-on";

export interface ContactMaskFrame extends FrameResult {
  /** `app.diagnostics().shadows.contactShadows` (the pass that produced the mask), or null. */
  readonly contactShadows: { readonly passExecuted: boolean; readonly depthSource: string } | null;
  /** True when the submitted postprocess contains an `ssao` pass (the retired lowering). */
  readonly ssaoRequested: boolean;
}

export interface ContactRegionStat {
  readonly meanLumaA: number;
  readonly meanLumaB: number;
  readonly meanLumaDelta: number;
  readonly changedFraction: number;
  readonly brightenedFraction: number;
  readonly pixels: number;
}

export interface ContactMaskComparison {
  readonly regions: Readonly<Record<string, ContactRegionStat>>;
  readonly whole: ContactRegionStat;
  /** Bounding box (px) of every pixel whose channel-sum changed by more than the threshold. */
  readonly changedBounds: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | null;
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
  renderContactMask(id: ContactMaskVariant): Promise<ContactMaskFrame>;
  compareContactMask(a: string, b: string): ContactMaskComparison;
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
  "fx-ambient-occlusion",
  "fx-color-grade-desaturate",
  "fx-color-grade-contrast",
  "fx-vignette",
  "fx-depth-of-field",
  "fx-contact-shadows"
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
const pixelSizes = new Map<string, { width: number; height: number }>();

try {
  window.__AURA3D_RECEIPTS__ = {
    effectVariants,
    kitIds,
    renderer: glRenderer,
    renderEffect,
    renderKit,
    compare,
    renderContactMask,
    compareContactMask
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

function effectScene(id: EffectVariantId) {
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
    case "fx-ambient-occlusion":
      builder.add(effects.ambientOcclusion({ name: "receipt ambient occlusion", intensity: 0.85, radius: 0.6 }));
      break;
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
    case "fx-contact-shadows":
      builder.add(effects.contactShadows({ intensity: 1, length: 0.5 }));
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
    await settle(app, 1);
    return await capture(app, id);
  } finally {
    app.dispose();
  }
}

// ---- WP-4: contact-shadow mask scenes --------------------------------------------------------

const CONTACT_CAMERA = { position: [0, 2.4, 4.4], target: [0, 0.7, 0], fovDegrees: 40 } as const;
/** World-space floor patches (x0, x1, z0, z1; y = 0) that the comparison projects into the frame. */
const CONTACT_REGIONS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  // Floor at the subject's shaded base: ray-marching toward the sun from here enters the subject.
  floorAtSubjectBase: [-0.7, -0.46, 0, 0.4],
  // Floor on the sun side, 0.45 m or more from the subject: the 0.5 m march heads away from it, so no blocker is reached.
  farFloor: [0.9, 1.3, 0.6, 1.2]
};

function contactMaskScene(id: ContactMaskVariant) {
  const withEffect = id.endsWith("-on");
  // nocast: the subject is not a shadow-map caster (only the far anchor is), so the shadow map cannot darken the floor
  // near the subject and any on/off delta there is attributable to the mask. shadowed: the subject casts a normal
  // shadow-map shadow.
  const subjectCastsShadow = id.startsWith("cm-shadowed");
  const builder = scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [...CONTACT_CAMERA.position], target: [...CONTACT_CAMERA.target], fov: CONTACT_CAMERA.fovDegrees }))
    .add(primitives.plane({
      name: "contact floor",
      material: material.pbr({ color: "#9aa2ae", roughness: 0.82, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(primitives.box({
      name: "contact subject",
      material: material.pbr({ color: "#d9534f", roughness: 0.5, metallic: 0 }),
      castShadow: subjectCastsShadow
    }).position(0, 0.45, 0).scale([0.9, 0.9, 0.9]))
    // Shadow anchor: a small caster far from every measured region. A shadow map is only built (and the shadow-receive
    // shader chunk, which carries the mask, only compiled in) when something casts, so the "nocast" frames need one.
    .add(primitives.box({
      name: "contact shadow anchor",
      material: material.pbr({ color: "#4a6fa5", roughness: 0.6, metallic: 0 }),
      castShadow: true
    }).position(3.6, 0.15, -3.6).scale([0.3, 0.3, 0.3]))
    // The contact mask follows the shadow-casting sun, so the key light casts (the subject may still opt out of the map).
    .add(lights.directional({ name: "contact key", position: [2.6, 4.2, 2.4], intensity: 2, shadow: true }));
  // "off" keeps the effect node at intensity 0: the frame takes the same post route (tone-mapping chain) and the
  // mask pass runs, but no mask reaches shading, so the on/off delta is the mask alone and not a route change.
  builder.add(effects.contactShadows({ intensity: withEffect ? 1 : 0, length: 0.5 }));
  return builder;
}

async function renderContactMask(id: ContactMaskVariant): Promise<ContactMaskFrame> {
  // GPU diagnostics: ask the contact-shadow contributor to read back its mask and depth targets (see ContactShadowPass.probe).
  (globalThis as { __A3D_CONTACT_PROBE__?: boolean }).__A3D_CONTACT_PROBE__ = true;
  const app = createAuraApp(stage(), {
    pixelRatio: 1,
    resize: false,
    renderer: { qualityProfile: "production" },
    scene: contactMaskScene(id)
  });
  try {
    await waitForDraw(app, id);
    await settle(app, 1);
    const frame = await capture(app, id);
    const diagnostics = app.diagnostics() as unknown as {
      readonly shadows?: { readonly contactShadows?: { readonly passExecuted: boolean; readonly depthSource: string } | null } | null;
    };
    return {
      ...frame,
      contactShadows: diagnostics.shadows?.contactShadows ?? null,
      ssaoRequested: frame.diagnostics.requestedPasses.includes("ssao") || frame.diagnostics.actualPasses.includes("ssao")
    };
  } finally {
    app.dispose();
  }
}

/** Projects a world point with the harness camera (look-at, vertical fov in degrees) into pixels. */
function projectContactPoint(point: readonly [number, number, number], width: number, height: number): readonly [number, number] {
  const [px, py, pz] = CONTACT_CAMERA.position;
  const [tx, ty, tz] = CONTACT_CAMERA.target;
  const norm = (v: readonly [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] =>
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: readonly [number, number, number], b: readonly [number, number, number]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const forward = norm([tx - px, ty - py, tz - pz]);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d: [number, number, number] = [point[0] - px, point[1] - py, point[2] - pz];
  const depth = dot(d, forward);
  const tanHalf = Math.tan((CONTACT_CAMERA.fovDegrees * Math.PI) / 360);
  const ndcX = dot(d, right) / (depth * tanHalf * (width / height));
  const ndcY = dot(d, up) / (depth * tanHalf);
  return [(ndcX * 0.5 + 0.5) * width, (1 - (ndcY * 0.5 + 0.5)) * height];
}

function emptyStat(): { a: number; b: number; changed: number; brightened: number; pixels: number } {
  return { a: 0, b: 0, changed: 0, brightened: 0, pixels: 0 };
}

function finishStat(stat: ReturnType<typeof emptyStat>): ContactRegionStat {
  const n = Math.max(1, stat.pixels);
  return {
    meanLumaA: round(stat.a / n),
    meanLumaB: round(stat.b / n),
    meanLumaDelta: round((stat.b - stat.a) / n),
    changedFraction: round(stat.changed / n),
    brightenedFraction: round(stat.brightened / n),
    pixels: stat.pixels
  };
}

function compareContactMask(a: string, b: string): ContactMaskComparison {
  const first = pixelStore.get(a);
  const second = pixelStore.get(b);
  const size = pixelSizes.get(a);
  if (!first || !second || !size) throw new Error(`Frame not captured before comparison: ${first ? b : a}`);
  const { width, height } = size;
  const channelSum = (offset: number): number =>
    Math.abs((first[offset] ?? 0) - (second[offset] ?? 0))
    + Math.abs((first[offset + 1] ?? 0) - (second[offset + 1] ?? 0))
    + Math.abs((first[offset + 2] ?? 0) - (second[offset + 2] ?? 0));
  const accumulate = (stat: ReturnType<typeof emptyStat>, x: number, y: number): void => {
    const offset = (y * width + x) * 4;
    const la = luma(first[offset] ?? 0, first[offset + 1] ?? 0, first[offset + 2] ?? 0);
    const lb = luma(second[offset] ?? 0, second[offset + 1] ?? 0, second[offset + 2] ?? 0);
    stat.a += la;
    stat.b += lb;
    stat.pixels += 1;
    if (channelSum(offset) > CHANGED_PIXEL_THRESHOLD) stat.changed += 1;
    if (lb - la > 4) stat.brightened += 1;
  };
  const regions: Record<string, ContactRegionStat> = {};
  for (const [name, [x0, x1, z0, z1]] of Object.entries(CONTACT_REGIONS)) {
    const corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => projectContactPoint([x!, 0, z!], width, height));
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const stat = emptyStat();
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y += 1) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(width - 1, Math.ceil(Math.max(...xs))); x += 1) accumulate(stat, x, y);
    }
    regions[name] = finishStat(stat);
  }
  const whole = emptyStat();
  let bounds: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      accumulate(whole, x, y);
      if (channelSum((y * width + x) * 4) > CHANGED_PIXEL_THRESHOLD) {
        bounds = bounds
          ? { x0: Math.min(bounds.x0, x), y0: Math.min(bounds.y0, y), x1: Math.max(bounds.x1, x), y1: Math.max(bounds.y1, y) }
          : { x0: x, y0: y, x1: x, y1: y };
      }
    }
  }
  return { regions, whole: finishStat(whole), changedBounds: bounds };
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
  pixelSizes.set(key, { width: canvas.width, height: canvas.height });
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
      ambientOcclusionPass: postprocess?.ambientOcclusionPass ?? false
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

import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";
import { postV2ModulesReady } from "@aura3d/rendering";

/**
 * GU47 E-C (WP-3) pixel-receipt harness: on/off frame pairs for the post
 * receipts effects-white-balance, effects-lut, effects-god-rays, effects-ssr,
 * effects-motion-blur and effects-selective-bloom. Each pair shares one scene
 * body; only the post effect (or one of its fields) differs, so a measured
 * delta is attributable to it. Phase 2 runs this on the remote runner
 * (software WebGL2); phase 1 only commits it.
 */

export type Gu47PostVariant =
  | "wb-neutral" | "wb-warm"
  | "lut-off" | "lut-teal-orange"
  | "god-off" | "god-on" | "god-density-half"
  | "ssr-off" | "ssr-on"
  | "mb-off" | "mb-on"
  | "bloom-off" | "bloom-selective"
  | "all-effects";

export interface Gu47Frame {
  readonly key: string;
  readonly pngBase64: string;
  readonly width: number;
  readonly height: number;
  readonly meanRgb: readonly [number, number, number];
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
  readonly stagesRan: readonly string[];
  readonly skipped: readonly string[];
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

/** Normalised frame rectangle (x0, y0, x1, y1; y down) for region statistics. */
export type Rect = readonly [number, number, number, number];

export interface Gu47Comparison {
  readonly meanAbsDeltaRgb: number;
  readonly changedFraction: number;
  readonly p95AbsDelta: number;
  readonly region?: { readonly meanAbsDeltaRgb: number; readonly p95AbsDelta: number; readonly meanLumaDelta: number };
}

const LUT_URL = "/tests/qr/prd03/fixtures/luts/teal-orange-33.cube";
const pixels = new Map<string, { data: Uint8ClampedArray; width: number; height: number }>();
type App = ReturnType<typeof createAuraApp>;

function stage(): HTMLElement {
  const element = document.getElementById("gu47-post-stage");
  if (!element) throw new Error("Missing #gu47-post-stage");
  element.replaceChildren();
  return element;
}

const pbr = (options: Record<string, unknown>) => material.pbr(options as never);

/** Shared body: floor, a warm emissive lamp, a white wall, a grey crate (runtime id "mover"), one sun. */
function body(extra: { glossyFloor?: boolean; wallBloom?: number; mover?: boolean } = {}) {
  return scene()
    .background("#0b1020")
    .camera(camera.perspective({ position: [0, 2.2, 5.2], target: [0, 0.8, 0], fov: 45 }))
    .add(lights.directional({ name: "gu47 sun", direction: [-0.4, -1, -0.3], intensity: 2.4, castShadow: true } as never))
    .add(primitives.plane({ name: "gu47 floor", material: pbr({ color: "#7d8796", roughness: extra.glossyFloor ? 0.05 : 0.85, metallic: extra.glossyFloor ? 0.6 : 0 }) }).scale([10, 1, 10]))
    .add(primitives.box({ name: "gu47 wall", material: pbr({ color: "#f4f4f4", roughness: 0.7, emissive: "#ffffff", emissiveIntensity: 1.6, ...(extra.wallBloom !== undefined ? { bloom: extra.wallBloom } : {}) }) }).position(-1.6, 1.2, -1.5).scale([1.6, 2.4, 0.2]))
    .add(primitives.sphere({ name: "gu47 lamp", material: pbr({ color: "#ffb35a", emissive: "#ffb35a", emissiveIntensity: 9, bloom: 1 }) }).position(1.2, 1.4, -1).scale(0.5))
    .add(primitives.box({ name: "gu47 crate", material: pbr({ color: "#6b7a8f", roughness: 0.6 }) }).position(0, 0.4, 0.2).scale(0.8).runtime({ id: "mover" }));
}

function variantScene(id: Gu47PostVariant) {
  switch (id) {
    case "wb-neutral": return body().add(effects.colorGrade({ temperature: 0 }));
    case "wb-warm": return body().add(effects.colorGrade({ temperature: 0.2 }));
    case "lut-off": return body().add(effects.colorGrade({}));
    case "lut-teal-orange": return body().add(effects.colorGrade({ lut: LUT_URL } as never));
    case "god-off": return body();
    case "god-on": return body().add(effects.volumetricFog({ density: 0.2, intensity: 0.9 }));
    case "god-density-half": return body().add(effects.volumetricFog({ density: 0.2, intensity: 0.9, godRayDensity: 0.5 } as never));
    case "ssr-off": return body({ glossyFloor: true });
    case "ssr-on": return body({ glossyFloor: true }).add(effects.screenSpaceReflections({ intensity: 1 }));
    case "mb-off": return body({ mover: true });
    case "mb-on": return body({ mover: true }).add(effects.motionBlur({ shutter: 0.75 } as never));
    case "bloom-off": return body({ wallBloom: 0 });
    case "bloom-selective": return body({ wallBloom: 0 }).add(effects.bloom({ intensity: 0.8, threshold: 1 } as never));
    case "all-effects": return body({ glossyFloor: true, mover: true })
      .add(effects.bloom({ intensity: 0.6 } as never))
      .add(effects.colorGrade({ temperature: 0.1, lut: LUT_URL } as never))
      .add(effects.volumetricFog({ density: 0.2 }))
      .add(effects.depthOfField({ focusDistance: 5 } as never))
      .add(effects.motionBlur({ shutter: 0.5 } as never))
      .add(effects.chromaticAberration({ intensity: 0.002 } as never))
      .add(effects.vignette({ intensity: 0.3 } as never))
      .add(effects.filmGrain({ intensity: 0.04 } as never))
      .add(effects.screenSpaceReflections({ intensity: 0.8 }))
      .add(effects.antiAlias({ mode: "taa" } as never));
  }
}

async function waitForDraw(app: App, id: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 60_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`${id}: ${diagnostics.errors.join("\n")}`);
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${id}: never drew`);
}

async function settle(app: App, steps: number, moving: boolean): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let index = 0; index < steps; index += 1) {
    if (moving) app.nodes.require("mover").setPosition(-1.5 + index * 0.25, 0.4, 0.2);
    app.step(1 / 60);
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function capture(app: App, key: string): Promise<Gu47Frame> {
  const shot = app.screenshot();
  const image = new Image();
  image.src = shot.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  pixels.set(key, { data, width: canvas.width, height: canvas.height });
  let r = 0, g = 0, b = 0, nonBlack = 0;
  const total = canvas.width * canvas.height;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!;
    if (data[i]! + data[i + 1]! + data[i + 2]! > 12) nonBlack += 1;
  }
  const meanRgb = [r / total, g / total, b / total] as const;
  const diagnostics = app.diagnostics();
  const post = (diagnostics as { post?: { stagesRan?: readonly string[]; skipped?: readonly string[] } }).post;
  return {
    key,
    pngBase64: shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1),
    width: canvas.width,
    height: canvas.height,
    meanRgb,
    meanLuma: meanRgb[0] * 0.2126 + meanRgb[1] * 0.7152 + meanRgb[2] * 0.0722,
    nonBlackRatio: nonBlack / total,
    stagesRan: [...(post?.stagesRan ?? [])],
    skipped: [...(post?.skipped ?? [])],
    drawCalls: diagnostics.drawCalls,
    errors: [...diagnostics.errors]
  };
}

async function render(id: Gu47PostVariant): Promise<Gu47Frame> {
  if (id.startsWith("lut-") || id === "all-effects") await fetch(LUT_URL); // warm the cache the bridge fetches from
  const app = createAuraApp(stage(), { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: variantScene(id) } as never);
  try {
    await waitForDraw(app, id);
    await postV2ModulesReady();
    const moving = id.startsWith("mb-") || id === "all-effects";
    await settle(app, 4, moving);
    // The .cube loads asynchronously; give it a beat, then render the steady state.
    if (id.startsWith("lut-") || id === "all-effects") {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await settle(app, 2, moving);
    }
    return await capture(app, id);
  } finally {
    app.dispose();
  }
}

function compare(a: string, b: string, rect?: Rect): Gu47Comparison {
  const first = pixels.get(a), second = pixels.get(b);
  if (!first || !second || first.width !== second.width || first.height !== second.height) throw new Error(`compare(${a}, ${b}): missing or mismatched frames`);
  const stats = (x0: number, y0: number, x1: number, y1: number) => {
    const deltas: number[] = [];
    let sum = 0, changed = 0, lumaDelta = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = (y * first.width + x) * 4;
      const dr = second.data[i]! - first.data[i]!, dg = second.data[i + 1]! - first.data[i + 1]!, db = second.data[i + 2]! - first.data[i + 2]!;
      const mean = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
      deltas.push(Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)));
      sum += mean;
      if (mean > 1) changed += 1;
      lumaDelta += dr * 0.2126 + dg * 0.7152 + db * 0.0722;
    }
    deltas.sort((p, q) => p - q);
    const count = Math.max(1, deltas.length);
    return { meanAbsDeltaRgb: sum / count, changedFraction: changed / count, p95AbsDelta: deltas[Math.floor(0.95 * (count - 1))] ?? 0, meanLumaDelta: lumaDelta / count };
  };
  const whole = stats(0, 0, first.width, first.height);
  const region = rect
    ? stats(Math.floor(rect[0] * first.width), Math.floor(rect[1] * first.height), Math.ceil(rect[2] * first.width), Math.ceil(rect[3] * first.height))
    : undefined;
  return {
    meanAbsDeltaRgb: whole.meanAbsDeltaRgb,
    changedFraction: whole.changedFraction,
    p95AbsDelta: whole.p95AbsDelta,
    ...(region ? { region: { meanAbsDeltaRgb: region.meanAbsDeltaRgb, p95AbsDelta: region.p95AbsDelta, meanLumaDelta: region.meanLumaDelta } } : {})
  };
}

(window as unknown as { __GU47_POST_RECEIPTS__: unknown }).__GU47_POST_RECEIPTS__ = { render, compare };

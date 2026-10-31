import { atmosphere, camera, createAuraApp, lights, material, primitives, scene, sky, world } from "@aura3d/engine";

/**
 * GU47 E-G (WP-7) pixel-receipt harness for the receipts `sky`, `height-fog`
 * and `water`. Each pair shares one scene body; only the feature differs, so
 * a measured delta is attributable to it. The flags are the explicit opt-ins
 * (`vfx.sky`, `vfx.fog`, `world.water` without `world`), so the receipt holds
 * before and after the WP-7 default-on flips. Phase 2 runs this on the remote
 * runner (software WebGL2); phase 1 only commits it.
 */

export type Gu47WorldVariant =
  | "sky-none" | "sky-day-clouds" | "sky-night-stars"
  | "fog-off" | "fog-height" | "fog-solid"
  | "water-off" | "water-lake";

export interface Gu47WorldFrame {
  readonly key: string;
  readonly pngBase64: string;
  readonly width: number;
  readonly height: number;
  readonly meanRgb: readonly [number, number, number];
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

/** Normalised frame rectangle (x0, y0, x1, y1; y down) for region statistics. */
export type Rect = readonly [number, number, number, number];

export interface Gu47WorldComparison {
  readonly meanAbsDeltaRgb: number;
  readonly changedFraction: number;
  readonly region?: { readonly meanAbsDeltaRgb: number; readonly meanLumaDelta: number };
}

/**
 * How far a region moved toward the fog colour, 0 (untouched) .. 1 (fully
 * fogged): per pixel, the projection of (fogged - off) onto (solid - off),
 * where `solid` is the same scene under fog dense enough to paint every
 * surface the fog colour. Pixels the solid fog leaves alone (the colour
 * background, which only a sky pass fogs) are skipped. Unlike a raw RGB delta
 * this does not depend on how far a surface's own colour is from the fog
 * colour, so a pale far column and the dark near ground compare fairly.
 */
export interface Gu47FogAmount {
  readonly meanAmount: number;
  readonly pixels: number;
}

export interface Gu47RegionStats {
  readonly meanLuma: number;
  /** Pixels brighter than luma 180 (stars on a night sky). */
  readonly brightPixels: number;
}

const pixels = new Map<string, { data: Uint8ClampedArray; width: number; height: number }>();
type App = ReturnType<typeof createAuraApp>;

function stage(): HTMLElement {
  const element = document.getElementById("gu47-world-stage");
  if (!element) throw new Error("Missing #gu47-world-stage");
  element.replaceChildren();
  return element;
}

const pbr = (options: Record<string, unknown>) => material.pbr(options as never);

/** Shared body: a long ground strip, columns at 4 / 12 / 28 m, one sun; camera looks down the strip at the horizon. */
function body() {
  let s = scene()
    .background("#1a2433")
    .camera(camera.perspective({ position: [0, 2, 6], target: [0, 1.4, -10], fov: 55 }))
    .add(lights.directional({ name: "gu47 sun", direction: [-0.3, -1, -0.4], intensity: 2.2, castShadow: true } as never))
    .add(primitives.plane({ name: "gu47 ground", material: pbr({ color: "#6f7a5a", roughness: 0.9 }) }).position(0, 0, -20).scale([40, 1, 60]));
  for (const [index, z] of [-4, -12, -28].entries()) {
    s = s.add(primitives.box({ name: `gu47 column ${index}`, material: pbr({ color: "#c9c2b4", roughness: 0.7 }) }).position(index % 2 === 0 ? -2 : 2, 1.5, z).scale([1, 3, 1]));
  }
  return s;
}

function variantScene(id: Gu47WorldVariant) {
  switch (id) {
    case "sky-none":
    case "fog-off":
    case "fog-height":
    case "fog-solid":
    case "water-off":
      return body();
    case "sky-day-clouds":
      return body().add(sky.preetham({ sun: { elevationDeg: 35, azimuthDeg: 140 }, turbidity: 3, clouds: { coverage: 0.45, speed: 0, color: "#fff2e0" } }));
    case "sky-night-stars":
      return body().add(sky.gradient({ zenith: "#050913", horizon: "#16243a", stars: { count: 1500, brightness: 1.4 }, clouds: { coverage: 0.25, speed: 0, color: "#8a9bb3" } }));
    case "water-lake":
      return body().add(world.water({
        kind: "lake",
        shape: { kind: "circle", center: [0, -8], radius: 7 },
        waves: "calm",
        reflection: { low: "ibl", medium: "ibl", high: "planar", ultra: "planar" },
        refraction: { low: false, medium: true, high: true, ultra: true }
      } as never) as never);
  }
}

function flagsFor(id: Gu47WorldVariant): readonly string[] {
  if (id.startsWith("sky-")) return ["vfx.sky"];
  if (id.startsWith("fog-")) return ["vfx.fog"];
  return ["world.water"];
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

async function settle(app: App, steps: number): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let index = 0; index < steps; index += 1) app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function capture(app: App, key: string): Promise<Gu47WorldFrame> {
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
  return {
    key,
    pngBase64: shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1),
    width: canvas.width,
    height: canvas.height,
    meanRgb,
    meanLuma: meanRgb[0] * 0.2126 + meanRgb[1] * 0.7152 + meanRgb[2] * 0.0722,
    nonBlackRatio: nonBlack / total,
    drawCalls: diagnostics.drawCalls,
    errors: [...diagnostics.errors]
  };
}

async function render(id: Gu47WorldVariant): Promise<Gu47WorldFrame> {
  const app = createAuraApp(stage(), {
    pixelRatio: 1,
    resize: false,
    renderer: { qualityProfile: "production" },
    qualityRebuild: { flags: [...flagsFor(id)], allowUrlFlags: false },
    scene: variantScene(id)
  } as never);
  try {
    await waitForDraw(app, id);
    if (id === "fog-height") {
      atmosphere.setFog(app, { mode: "height", color: "#a9b8c8", density: 0.05, heightDensity: 0.4, heightFalloff: 0.3, heightReference: 0, affectsBackground: true });
    }
    if (id === "fog-solid") {
      // Reference for fogAmount(): every surface reaches the fog colour (start 0, no height term, tau >= 50 at 1 m).
      atmosphere.setFog(app, { mode: "exp", color: "#a9b8c8", density: 50, start: 0, affectsBackground: true });
    }
    await settle(app, 6);
    return await capture(app, id);
  } finally {
    app.dispose();
  }
}

function region(key: string, rect: Rect): { x0: number; y0: number; x1: number; y1: number; image: { data: Uint8ClampedArray; width: number; height: number } } {
  const image = pixels.get(key);
  if (!image) throw new Error(`missing frame ${key}`);
  return {
    image,
    x0: Math.floor(rect[0] * image.width), y0: Math.floor(rect[1] * image.height),
    x1: Math.ceil(rect[2] * image.width), y1: Math.ceil(rect[3] * image.height)
  };
}

function stats(key: string, rect: Rect): Gu47RegionStats {
  const { image, x0, y0, x1, y1 } = region(key, rect);
  let luma = 0, bright = 0, count = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const i = (y * image.width + x) * 4;
    const l = image.data[i]! * 0.2126 + image.data[i + 1]! * 0.7152 + image.data[i + 2]! * 0.0722;
    luma += l;
    if (l > 180) bright += 1;
    count += 1;
  }
  return { meanLuma: luma / Math.max(1, count), brightPixels: bright };
}

function compare(a: string, b: string, rect?: Rect): Gu47WorldComparison {
  const first = pixels.get(a), second = pixels.get(b);
  if (!first || !second || first.width !== second.width || first.height !== second.height) throw new Error(`compare(${a}, ${b}): missing or mismatched frames`);
  const delta = (x0: number, y0: number, x1: number, y1: number) => {
    let sum = 0, changed = 0, lumaDelta = 0, count = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = (y * first.width + x) * 4;
      const dr = second.data[i]! - first.data[i]!, dg = second.data[i + 1]! - first.data[i + 1]!, db = second.data[i + 2]! - first.data[i + 2]!;
      const mean = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
      sum += mean;
      if (mean > 1) changed += 1;
      lumaDelta += dr * 0.2126 + dg * 0.7152 + db * 0.0722;
      count += 1;
    }
    const n = Math.max(1, count);
    return { meanAbsDeltaRgb: sum / n, changedFraction: changed / n, meanLumaDelta: lumaDelta / n };
  };
  const whole = delta(0, 0, first.width, first.height);
  const part = rect ? region(a, rect) : undefined;
  const sub = part ? delta(part.x0, part.y0, part.x1, part.y1) : undefined;
  return {
    meanAbsDeltaRgb: whole.meanAbsDeltaRgb,
    changedFraction: whole.changedFraction,
    ...(sub ? { region: { meanAbsDeltaRgb: sub.meanAbsDeltaRgb, meanLumaDelta: sub.meanLumaDelta } } : {})
  };
}

function fogAmount(off: string, fogged: string, solid: string, rect: Rect, minContrast = 12): Gu47FogAmount {
  const a = region(off, rect), b = region(fogged, rect), c = region(solid, rect);
  if (a.image.width !== b.image.width || a.image.width !== c.image.width) throw new Error(`fogAmount(${off}, ${fogged}, ${solid}): mismatched frames`);
  let sum = 0, pixels = 0;
  for (let y = a.y0; y < a.y1; y += 1) for (let x = a.x0; x < a.x1; x += 1) {
    const i = (y * a.image.width + x) * 4;
    let dot = 0, len2 = 0;
    for (let k = 0; k < 3; k += 1) {
      const base = a.image.data[i + k]!;
      const toFog = c.image.data[i + k]! - base;
      dot += (b.image.data[i + k]! - base) * toFog;
      len2 += toFog * toFog;
    }
    if (Math.sqrt(len2) < minContrast) continue;
    sum += Math.min(Math.max(dot / len2, 0), 1);
    pixels += 1;
  }
  return { meanAmount: pixels > 0 ? sum / pixels : 0, pixels };
}

(window as unknown as { __GU47_WORLD_RECEIPTS__: unknown }).__GU47_WORLD_RECEIPTS__ = { render, compare, stats, fogAmount };

import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * FS-303 root-only postprocess harness.
 *
 * Every variant is authored purely through public `@aura3d/engine` helpers. Each
 * effect is measured as an on/off pair whose *only* difference is the effect node,
 * so a measured pixel delta is attributable to the postprocess pass rather than to
 * a camera, material, or lighting change.
 *
 * The harness reports what the runtime actually did — `actualPasses` from device
 * diagnostics — alongside the pixels. An effect that a route requests but the
 * runtime never runs must show up as a missing pass rather than as a silent pass.
 */

type VariantId =
  | "baseline"
  | "bloom"
  | "ambient-occlusion"
  | "contact-occlusion"
  | "fog"
  | "rain-baseline"
  | "rain";

interface PixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly meanLuma: number;
  readonly meanRgb: readonly [number, number, number];
  /** Mean per-pixel max-minus-min RGB spread. */
  readonly meanChroma: number;
  /** Fraction of pixels brighter than 3/4 of the frame's peak luma. */
  readonly brightFraction: number;
  readonly colorBuckets: number;
  readonly hash: string;
}

interface VariantCapture {
  readonly id: VariantId;
  readonly diagnostics: {
    readonly backend: string;
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
    readonly postprocess: {
      readonly enabled: boolean;
      readonly requested: boolean;
      readonly runtimeStatus: string;
      readonly pixelBacked: boolean;
      readonly requestedPasses: readonly string[];
      readonly actualPasses: readonly string[];
      readonly fallbackPasses: readonly string[];
      readonly bloomPass: boolean;
      readonly ambientOcclusionPass: boolean;
    };
  };
  readonly pixels: PixelMetrics;
}

interface VariantComparison {
  readonly variantA: VariantId;
  readonly variantB: VariantId;
  readonly meanAbsoluteChannelDelta: number;
  readonly changedPixelFraction: number;
  readonly meanLumaDelta: number;
  readonly brightFractionDelta: number;
}

interface RootPostprocessRunner {
  readonly imports: readonly string[];
  readonly variantIds: readonly VariantId[];
  renderVariant(id: VariantId, options?: { readonly cssWidth?: number; readonly cssHeight?: number; readonly pixelRatio?: number }): Promise<VariantCapture>;
  compareVariants(variantA: VariantId, variantB: VariantId): VariantComparison;
  /** Effects the public root API cannot express at all, reported rather than hidden. */
  unexpressibleEffects(): readonly { readonly effect: string; readonly reason: string }[];
}

declare global {
  interface Window {
    __AURA3D_ROOT_POSTPROCESS_RUNNER__?: RootPostprocessRunner;
    __AURA3D_ROOT_POSTPROCESS_ERROR__?: string;
  }
}

const CHANGED_PIXEL_THRESHOLD = 12;
const captured = new Map<VariantId, { readonly capture: VariantCapture; readonly pixels: Uint8Array }>();

const variantIds: readonly VariantId[] = ["baseline", "bloom", "ambient-occlusion", "contact-occlusion", "fog", "rain-baseline", "rain"];

void run().catch((error: unknown) => {
  window.__AURA3D_ROOT_POSTPROCESS_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_ROOT_POSTPROCESS_RUNNER__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    variantIds,
    renderVariant: async (id, options) => renderVariant(id, options),
    compareVariants: (variantA, variantB) => compareVariants(variantA, variantB),
    unexpressibleEffects: () => [
      {
        effect: "outline",
        reason: "The public root effects surface has no outline node, so a root-only outline pass cannot be requested or proven. Outline remains a rendering-package pass."
      },
      {
        effect: "ssr",
        reason: "No public root effect requests screen-space reflections; the renderer pass exists but is not reachable through createAuraApp."
      },
      {
        effect: "depth-of-field",
        reason: "No public root effect requests depth of field; it is not reachable through createAuraApp."
      },
      {
        effect: "motion-blur",
        reason: "No public root effect requests motion blur; it is not reachable through createAuraApp."
      },
      {
        effect: "taa",
        reason: "No public root effect requests temporal antialiasing; it is not reachable through createAuraApp."
      },
      {
        effect: "color-grade",
        reason: "No public root effect requests color grading. The production bridge no longer injects an unrequested grade, so color grading remains a rendering-package pass."
      },
      {
        effect: "fxaa",
        reason: "No public root effect requests FXAA. The production bridge no longer injects unrequested FXAA, so it remains a rendering-package pass."
      }
    ]
  };
}

async function renderVariant(
  id: VariantId,
  options: { readonly cssWidth?: number; readonly cssHeight?: number; readonly pixelRatio?: number } = {}
): Promise<VariantCapture> {
  const stage = requiredElement("postprocess-contract-stage");
  stage.style.width = `${options.cssWidth ?? 720}px`;
  stage.style.height = `${options.cssHeight ?? 480}px`;
  stage.style.minHeight = "0px";
  stage.replaceChildren();
  const rainVariant = id === "rain" || id === "rain-baseline";
  const app = createAuraApp(stage, {
    pixelRatio: options.pixelRatio ?? 1,
    resize: false,
    renderer: rainVariant
      ? { mode: "safe-basic", qualityProfile: "safe-basic", fallback: "safe-basic" }
      : { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant(id)
  });
  await waitForAppDraw(app);
  const canvas = app.canvas;
  if (!canvas) throw new Error("Aura app did not expose a canvas for the postprocess contract.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for the root postprocess contract.");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const diagnostics = app.diagnostics();
  const postprocess = diagnostics.renderer?.postprocess;
  const capture: VariantCapture = {
    id,
    diagnostics: {
      backend: diagnostics.backend,
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      postprocess: {
        enabled: postprocess?.enabled ?? false,
        requested: postprocess?.requested ?? false,
        runtimeStatus: postprocess?.runtimeStatus ?? "unknown",
        pixelBacked: postprocess?.pixelBacked ?? false,
        requestedPasses: [...(postprocess?.requestedPasses ?? [])],
        actualPasses: [...(postprocess?.actualPasses ?? [])],
        fallbackPasses: [...(postprocess?.fallbackPasses ?? [])],
        bloomPass: postprocess?.bloomPass ?? false,
        ambientOcclusionPass: postprocess?.ambientOcclusionPass ?? false
      }
    },
    pixels: readPixelMetrics(pixels, canvas.width, canvas.height)
  };
  // Only the default framing is stored for comparison, so a resized capture cannot
  // silently replace the baseline that on/off deltas are measured against.
  if (options.cssWidth === undefined && options.cssHeight === undefined && options.pixelRatio === undefined) {
    captured.set(id, { capture, pixels });
  }
  app.dispose();
  return capture;
}

function sceneForVariant(id: VariantId) {
  // One shared scene body for every variant: a typed GLB subject (which keeps the
  // production bridge eligible), an emissive bar that gives bloom something real to
  // threshold on, a floor for occlusion to ground against, and fixed lighting and
  // camera. Only the effect node differs between variants.
  const builder = scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 2.4, 4.4], target: [0, 0.7, 0], fov: 40 }))
    .add(primitives.plane({
      name: "postprocess contract floor",
      material: material.pbr({ color: "#9aa2ae", roughness: 0.82, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(model(assets.robotcand, {
      name: "postprocess contract typed subject",
      targetHeight: 1.5
    }).position(0, 0.78, 0).runtime({ id: "subject" }))
    // Bloom needs a bright emissive subject to threshold on, but the root bridge
    // auto-enables bloom for a dark scene that already contains emissive subjects.
    // Including the emissive bar in the baseline would therefore make the baseline
    // itself bloomed and destroy the on/off isolation, so the bar is added only for
    // the bloom variant.
    .add(primitives.box({
      name: "postprocess contract reference bar",
      material: material.pbr({ color: "#dfe6f2", roughness: 0.3, metallic: 0 })
    }).position(0, 1.35, -1.5).scale([2.6, 0.16, 0.16]))
    .add(lights.directional({ name: "postprocess contract key", position: [2.6, 4.2, 2.4], intensity: 2 }));

  if (id === "bloom") {
    builder
      .add(primitives.box({
        name: "postprocess contract emissive bar",
        material: material.emissive({ color: "#0b1220", emissive: "#63f5ff", emissiveIntensity: 6 })
      }).position(0, 1.05, -1.2).scale([2.6, 0.18, 0.18]))
      .add(effects.bloom({ name: "root bloom probe", intensity: 1.4, threshold: 0.45, radius: 4 }));
  }
  if (id === "ambient-occlusion") {
    builder.add(effects.ambientOcclusion({ name: "root ambient occlusion probe", intensity: 0.85, radius: 0.6 }));
  }
  if (id === "contact-occlusion") {
    builder.add(effects.contactOcclusion({ name: "root contact occlusion probe", intensity: 0.8, radius: 0.5 }));
  }
  if (id === "fog") {
    builder.add(effects.fog({ name: "root fog probe", density: 0.42, color: "#7f9fd0", intensity: 0.7 }));
  }
  if (id === "rain") {
    builder.add(effects.rain({ name: "root rain probe", density: 1.2, intensity: 0.9, color: "#bcdfff" }));
  }
  return builder;
}

function readPixelMetrics(pixels: Uint8Array, width: number, height: number): PixelMetrics {
  const buckets = new Set<string>();
  let lumaSum = 0;
  let chromaSum = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let peakLuma = 0;
  const total = width * height;

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const pixelLuma = luma(red, green, blue);
    lumaSum += pixelLuma;
    chromaSum += Math.max(red, green, blue) - Math.min(red, green, blue);
    redSum += red;
    greenSum += green;
    blueSum += blue;
    if (pixelLuma > peakLuma) peakLuma = pixelLuma;
    buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
  }

  // Bright-pixel share is measured against this frame's own peak rather than a
  // constant, so it survives the tone-mapping/exposure differences between variants.
  const brightThreshold = peakLuma * 0.75;
  let brightPixels = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (luma(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0) > brightThreshold) brightPixels += 1;
  }

  const denominator = Math.max(1, total);
  return {
    width,
    height,
    meanLuma: round(lumaSum / denominator),
    meanRgb: [round(redSum / denominator), round(greenSum / denominator), round(blueSum / denominator)],
    meanChroma: round(chromaSum / denominator),
    brightFraction: round(brightPixels / denominator),
    colorBuckets: buckets.size,
    hash: hashPixels(pixels)
  };
}

function compareVariants(variantA: VariantId, variantB: VariantId): VariantComparison {
  const first = requireCapture(variantA);
  const second = requireCapture(variantB);
  const total = first.capture.pixels.width * first.capture.pixels.height;
  let deltaSum = 0;
  let changedPixels = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const redDelta = Math.abs((first.pixels[offset] ?? 0) - (second.pixels[offset] ?? 0));
    const greenDelta = Math.abs((first.pixels[offset + 1] ?? 0) - (second.pixels[offset + 1] ?? 0));
    const blueDelta = Math.abs((first.pixels[offset + 2] ?? 0) - (second.pixels[offset + 2] ?? 0));
    deltaSum += redDelta + greenDelta + blueDelta;
    if (redDelta + greenDelta + blueDelta > CHANGED_PIXEL_THRESHOLD) changedPixels += 1;
  }
  return {
    variantA,
    variantB,
    meanAbsoluteChannelDelta: round(deltaSum / Math.max(1, total * 3)),
    changedPixelFraction: round(changedPixels / Math.max(1, total)),
    meanLumaDelta: round(second.capture.pixels.meanLuma - first.capture.pixels.meanLuma),
    brightFractionDelta: round(second.capture.pixels.brightFraction - first.capture.pixels.brightFraction)
  };
}

function requireCapture(id: VariantId): { readonly capture: VariantCapture; readonly pixels: Uint8Array } {
  const entry = captured.get(id);
  if (!entry) throw new Error(`Postprocess variant was not captured before comparison: ${id}`);
  return entry;
}

function luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function hashPixels(pixels: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of pixels) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  // Surface the runtime's own error text on timeout. A postprocess option the
  // renderer rejects (for example an out-of-range SSAO kernel) leaves the route at
  // zero draw calls, and without this the failure looks like a harness hang rather
  // than the renderer contract violation it actually is.
  try {
    await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 30_000);
  } catch {
    const diagnostics = app.diagnostics();
    throw new Error(`Root postprocess variant never drew: drawCalls=${diagnostics.drawCalls} renderSize=${JSON.stringify(diagnostics.renderSize)} runtime=${diagnostics.renderer?.runtime.backend} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the Aura3D root postprocess harness.");
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

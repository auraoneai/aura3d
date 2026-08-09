import {
  PostProcessComposer,
  createDepthTextureBinding,
  createPostProcessCapabilityReport,
  createRenderDevice,
  type PostProcessComposerPass
} from "@aura3d/rendering";

type EffectName = PostProcessComposerPass["name"];

interface EffectEvidence {
  readonly effect: EffectName;
  readonly changedPixels: number;
  readonly subjectChangedPixels: number;
  readonly subjectMeanDelta: number;
  readonly maxChannelDelta: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly medianFrameMs: number;
  readonly dataUrl: string;
}

declare global {
  interface Window {
    __AURA3D_POSTPROCESS_COMPREHENSIVE__?:
      | { readonly status: "ready"; readonly width: number; readonly height: number; readonly renderer: "webgl2"; readonly implementation: string; readonly effects: readonly EffectEvidence[]; readonly composition: Record<string, unknown>; readonly assertions: Record<string, boolean>; readonly sourceDataUrl: string }
      | { readonly status: "error"; readonly error: string };
  }
}

const WIDTH = 128;
const HEIGHT = 96;
const SUBJECT = { x0: 28, y0: 18, x1: 99, y1: 78 } as const;

void run();

async function run(): Promise<void> {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#postprocess");
    if (!canvas) throw new Error("Missing postprocess canvas.");
    const device = await createRenderDevice({ backend: "webgl2", canvas, antialias: false, preserveDrawingBuffer: true });
    if (!device.writeRenderTargetPixels || !device.presentRenderTarget) throw new Error("WebGL2 target upload/presentation unavailable.");
    const source = device.createRenderTarget({ width: WIDTH, height: HEIGHT, label: "postprocess-proof-source", format: "rgba8", depth: "texture" });
    const output = device.createRenderTarget({ width: WIDTH, height: HEIGHT, label: "postprocess-proof-output", format: "rgba8", depth: false });
    const composer = new PostProcessComposer({ device, width: WIDTH, height: HEIGHT, label: "public-proof-composer" });
    const sourcePixels = createSourcePixels();
    const depth = createDepthTextureBinding({ label: "postprocess-proof-depth", width: WIDTH, height: HEIGHT, data: createDepthFixture() });
    const velocity = createVelocityFixture();
    const history = createHistoryFixture(sourcePixels);
    const passes: readonly PostProcessComposerPass[] = [
      { name: "bloom", options: { threshold: 0.68, intensity: 0.72, radius: 3 } },
      { name: "tone-mapping", options: { exposure: 1.55, operator: "aces", inputColorSpace: "linear", outputColorSpace: "srgb" } },
      { name: "tone-mapping-preset", preset: "cinematic", options: { previousExposure: 1, deltaTimeSeconds: 1 / 60 } },
      { name: "color-grade", options: { contrast: 1.18, temperature: 0.22, tint: -0.08, saturation: 1.25, vibrance: 0.18, vignette: 0.18, sharpening: 0.45 } },
      { name: "chromatic-aberration", options: { strength: 1.7 } },
      { name: "film-grain", options: { intensity: 0.22, seed: 1606, monochrome: false } },
      { name: "depth-of-field", options: { depth, focusDepth: 0.42, focusRange: 0.08, maxRadius: 4 } },
      { name: "motion-blur", options: { velocity, samples: 7, scale: 1 } },
      { name: "ssao", options: { depth, radius: 3, intensity: 1.15, bias: 0.005 } },
      { name: "ssr", options: { depth, intensity: 0.9, maxDistance: 18 } },
      { name: "taa", options: { history, blend: 0.38 } },
      { name: "outline", options: { color: [255, 152, 34, 255], width: 3, threshold: 0.12, opacity: 0.9 } },
      { name: "fxaa", options: { edgeThreshold: 0.055, subpixelBlend: 0.82 } }
    ];

    device.writeRenderTargetPixels(source, sourcePixels);
    device.presentRenderTarget(source);
    const sourceDataUrl = canvas.toDataURL("image/png");
    const effects: EffectEvidence[] = [];
    for (const pass of passes) {
      const samples: number[] = [];
      let rendered = new Uint8Array();
      for (let index = 0; index < 9; index += 1) {
        device.writeRenderTargetPixels(source, sourcePixels);
        const started = performance.now();
        const diagnostics = composer.render({ source, target: output, passes: [pass] });
        samples.push(performance.now() - started);
        if (diagnostics.passCount !== 1 || diagnostics.pingPongTargets !== 2) throw new Error(`Invalid composer diagnostics for ${pass.name}.`);
      }
      device.setRenderTarget(output);
      rendered = device.readPixels(0, 0, WIDTH, HEIGHT);
      const metrics = compareSubject(sourcePixels, rendered);
      device.presentRenderTarget(output);
      effects.push({ effect: pass.name, ...metrics, medianFrameMs: median(samples.slice(2)), dataUrl: canvas.toDataURL("image/png") });
    }
    const capability = createPostProcessCapabilityReport(device);
    const diagnostics = composer.getDiagnostics();
    const effectNames = new Set(effects.map((entry) => entry.effect));
    const everyEffectHasSubjectPixels = effects.every((entry) => entry.subjectChangedPixels >= 8 && entry.subjectMeanDelta > 0.05);
    window.__AURA3D_POSTPROCESS_COMPREHENSIVE__ = {
      status: "ready",
      width: WIDTH,
      height: HEIGHT,
      renderer: "webgl2",
      implementation: "public @aura3d/rendering PostProcessComposer -> WebGL2 render target -> WebGL backbuffer",
      effects,
      composition: {
        publicClass: "PostProcessComposer",
        passCount: passes.length,
        passNames: passes.map((pass) => pass.name),
        pingPongTargets: diagnostics.pingPongTargets,
        outputTargets: 1,
        capability,
        subjectRegion: SUBJECT
      },
      assertions: {
        completeAdvertisedComposerCatalog: effectNames.size === 13,
        everyEffectHasSubjectPixels,
        reusableTwoTargetPingPong: diagnostics.pingPongTargets === 2,
        actualWebglBackbuffer: canvas.getContext("webgl2") !== null,
        domOrCssEffectImplementation: false
      },
      sourceDataUrl
    };
    composer.dispose();
    source.dispose();
    output.dispose();
    device.dispose();
  } catch (error) {
    window.__AURA3D_POSTPROCESS_COMPREHENSIVE__ = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) };
  }
}

function createSourcePixels(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      const inside = x >= SUBJECT.x0 && x <= SUBJECT.x1 && y >= SUBJECT.y0 && y <= SUBJECT.y1;
      const disc = Math.hypot(x - 64, y - 47) < 23;
      const stripe = ((x + y * 2) % 13) < 6;
      pixels[index] = inside ? (disc ? 246 : stripe ? 206 : 46) : 10 + Math.round(x * 0.12);
      pixels[index + 1] = inside ? (disc ? 174 : stripe ? 54 : 166) : 13 + Math.round(y * 0.1);
      pixels[index + 2] = inside ? (disc ? 42 : stripe ? 238 : 76) : 22 + Math.round((x + y) * 0.05);
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function createDepthFixture(): Float32Array {
  const depth = new Float32Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const inside = x >= SUBJECT.x0 && x <= SUBJECT.x1 && y >= SUBJECT.y0 && y <= SUBJECT.y1;
    depth[y * WIDTH + x] = inside ? (x < 64 ? 0.3 : 0.68) : 0.88;
  }
  return depth;
}

function createVelocityFixture(): Float32Array {
  const velocity = new Float32Array(WIDTH * HEIGHT * 2);
  for (let y = SUBJECT.y0; y <= SUBJECT.y1; y += 1) for (let x = SUBJECT.x0; x <= SUBJECT.x1; x += 1) {
    const index = (y * WIDTH + x) * 2;
    velocity[index] = 7.5;
    velocity[index + 1] = -1.5;
  }
  return velocity;
}

function createHistoryFixture(source: Uint8Array): Uint8Array {
  const history = new Uint8Array(source.length);
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const target = (y * WIDTH + x) * 4;
    const sampleX = Math.max(0, x - 4);
    const from = (y * WIDTH + sampleX) * 4;
    history[target] = source[from] ?? 0;
    history[target + 1] = source[from + 1] ?? 0;
    history[target + 2] = source[from + 2] ?? 0;
    history[target + 3] = 255;
  }
  return history;
}

function compareSubject(before: Uint8Array, after: Uint8Array): Omit<EffectEvidence, "effect" | "medianFrameMs" | "dataUrl"> {
  let changedPixels = 0;
  let subjectChangedPixels = 0;
  let subjectDelta = 0;
  let maxChannelDelta = 0;
  let nonBlackPixels = 0;
  const buckets = new Set<number>();
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const index = pixel * 4;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    const delta = Math.abs(after[index]! - before[index]!) + Math.abs(after[index + 1]! - before[index + 1]!) + Math.abs(after[index + 2]! - before[index + 2]!);
    if (delta > 0) changedPixels += 1;
    if (x >= SUBJECT.x0 && x <= SUBJECT.x1 && y >= SUBJECT.y0 && y <= SUBJECT.y1) {
      if (delta > 0) subjectChangedPixels += 1;
      subjectDelta += delta / 3;
    }
    maxChannelDelta = Math.max(maxChannelDelta, Math.abs(after[index]! - before[index]!), Math.abs(after[index + 1]! - before[index + 1]!), Math.abs(after[index + 2]! - before[index + 2]!));
    if (after[index]! + after[index + 1]! + after[index + 2]! > 12) nonBlackPixels += 1;
    buckets.add(((after[index]! >> 4) << 8) | ((after[index + 1]! >> 4) << 4) | (after[index + 2]! >> 4));
  }
  const subjectPixels = (SUBJECT.x1 - SUBJECT.x0 + 1) * (SUBJECT.y1 - SUBJECT.y0 + 1);
  return { changedPixels, subjectChangedPixels, subjectMeanDelta: Number((subjectDelta / subjectPixels).toFixed(4)), maxChannelDelta, nonBlackPixels, uniqueColorBuckets: buckets.size };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(4));
}

export {};

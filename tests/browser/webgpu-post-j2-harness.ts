import { Geometry } from "/packages/rendering/src/Geometry.js";
import { IndexBuffer } from "/packages/rendering/src/IndexBuffer.js";
import { Renderer } from "/packages/rendering/src/Renderer.js";
import { UnlitMaterial } from "/packages/rendering/src/UnlitMaterial.js";
import { VertexBuffer } from "/packages/rendering/src/VertexBuffer.js";
import { VertexFormat } from "/packages/rendering/src/VertexFormat.js";
import type { WebGPUDevice } from "/packages/rendering/src/WebGPUDevice.js";

/**
 * muse3jsparity-PRD J2 — native WebGPU post pixel proof.
 *
 * Rendering-package level (not root): NDC quads rendered by Renderer on the
 * real WebGPU backend, then WebGPUDevice.executeWebGPUBloom /
 * executeWebGPUColorGrade / executeWebGPUFxaa over the scene target with
 * readback metrics per stage. The ?temporal variant independently exercises
 * renderer-owned native TAA history across actual rendered frame sequences.
 */

const WIDTH = 256;
const HEIGHT = 256;

interface J2ImageMetrics {
  readonly brightPixels: number;
  readonly meanLuma: number;
  readonly diffPixelsVsScene: number;
  readonly meanAbsDiffVsScene: number;
}

interface J2Stage {
  readonly id: string;
  readonly brightPixels: number;
  readonly meanLuma: number;
  readonly diffPixelsVsScene: number;
  readonly meanAbsDiffVsScene: number;
  readonly drawCalls: number;
}

interface J2Result {
  readonly status: "ready" | "error" | "unsupported" | "waiting";
  readonly backend?: string;
  readonly adapter?: string;
  readonly stages?: readonly J2Stage[];
  readonly postErrors?: readonly string[];
  readonly checks?: Record<string, number | string | boolean>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_J2_WEBGPU_POST__?: J2Result;
    __AURA3D_R03_FRAMES__?: { frame: number; mode: string; x: number; reset: boolean; sceneKey: string; width: number; height: number; pixelsBase64: string; nativeSubmissions: number; nativeTemporalBindings: number }[];
  }
}

window.__AURA3D_J2_WEBGPU_POST__ = { status: "waiting" } as J2Result;

const mount = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");

if (!mount || !shoot) {
  window.__AURA3D_J2_WEBGPU_POST__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void (new URLSearchParams(location.search).has("temporal") ? runTemporalHarness() : runHarness()).catch((error: unknown) => {
      window.__AURA3D_J2_WEBGPU_POST__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function ndcQuad(x0: number, y0: number, x1: number, y1: number): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 4);
  vertices.setAttribute(0, "position", [x0, y0, 0]);
  vertices.setAttribute(1, "position", [x1, y0, 0]);
  vertices.setAttribute(2, "position", [x1, y1, 0]);
  vertices.setAttribute(3, "position", [x0, y1, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], 4));
}

function paintGallery(gallery: readonly { readonly id: string; readonly pixels: Uint8Array }[]): void {
  mount!.innerHTML = "";
  const strip = document.createElement("div");
  strip.style.cssText = "display:flex;gap:8px;align-items:flex-start;";
  for (const entry of gallery) {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.textContent = entry.id;
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.cssText = "width:256px;height:256px;image-rendering:pixelated;";
    const context = canvas.getContext("2d");
    if (context) {
      const image = context.createImageData(WIDTH, HEIGHT);
      image.data.set(entry.pixels.subarray(0, WIDTH * HEIGHT * 4));
      context.putImageData(image, 0, 0);
    }
    wrap.append(label, canvas);
    strip.append(wrap);
  }
  mount!.append(strip);
}

function analyze(baseline: Uint8Array | Uint8ClampedArray, current: Uint8Array | Uint8ClampedArray): J2ImageMetrics {
  let brightPixels = 0;
  let lumaSum = 0;
  let diffPixels = 0;
  let absDiffSum = 0;
  const count = Math.floor(current.length / 4);
  for (let index = 0; index < count; index += 1) {
    const r = (current[index * 4] ?? 0) / 255;
    const g = (current[index * 4 + 1] ?? 0) / 255;
    const b = (current[index * 4 + 2] ?? 0) / 255;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    lumaSum += luma;
    if (luma > 0.75) brightPixels += 1;
    const br = (baseline[index * 4] ?? 0) / 255;
    const bg = (baseline[index * 4 + 1] ?? 0) / 255;
    const bb = (baseline[index * 4 + 2] ?? 0) / 255;
    const diff = (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)) / 3;
    absDiffSum += diff;
    if (diff > 0.02) diffPixels += 1;
  }
  return { brightPixels, meanLuma: lumaSum / Math.max(1, count), diffPixelsVsScene: diffPixels, meanAbsDiffVsScene: absDiffSum / Math.max(1, count) };
}

async function runHarness(): Promise<void> {
  const renderer = await Renderer.create({ backend: "webgpu", width: WIDTH, height: HEIGHT, clearColor: [0.02, 0.02, 0.03, 1] });
  try {
    const device = renderer.device as WebGPUDevice & {
      executeWebGPUBloom(source: unknown, options?: unknown): unknown;
      executeWebGPUColorGrade(source: unknown, options?: unknown): unknown;
      executeWebGPUFxaa(source: unknown): unknown;
      getWebGPUBloomDiagnostics(): { readonly mipCount: number; readonly halfFloat: boolean; readonly passes: number; readonly executionMode: string } | null;
      drainWebGPUPostErrors(): Promise<readonly string[]>;
    };
    if (renderer.device.kind !== "webgpu" || typeof device.executeWebGPUBloom !== "function") {
      window.__AURA3D_J2_WEBGPU_POST__ = { status: "unsupported", backend: renderer.device.kind };
      return;
    }
    const items = [
      {
        geometry: ndcQuad(-0.9, -0.55, -0.1, 0.55),
        material: new UnlitMaterial({ color: [1, 1, 1, 1] }),
        modelMatrix: IDENTITY,
        modelViewProjectionMatrix: IDENTITY,
        label: "j2 white quad"
      },
      {
        geometry: ndcQuad(0.1, -0.55, 0.9, 0.55),
        material: new UnlitMaterial({ color: [0.5, 0.5, 0.5, 1] }),
        modelMatrix: IDENTITY,
        modelViewProjectionMatrix: IDENTITY,
        label: "j2 gray quad"
      },
      {
        geometry: ndcQuad(-0.06, -0.9, 0.06, 0.9),
        material: new UnlitMaterial({ color: [0, 0, 0, 1] }),
        modelMatrix: IDENTITY,
        modelViewProjectionMatrix: IDENTITY,
        label: "j2 black divider"
      }
    ];
    const sceneTarget = device.createRenderTarget({ width: WIDTH, height: HEIGHT, format: "rgba8", label: "j2-scene" });
    try {
      const sceneDiagnostics = renderer.render({
        renderItems: items,
        renderTarget: sceneTarget,
        cameraPolicy: "identity"
      } as never);
      /*
       * Read whichever format the pass actually produced.
       *
       * `executeWebGPUBloom` composites unconditionally into an `rgba16f` target — bloom adds
       * to scene radiance before tone mapping, so its composite is floating point by design
       * (WebGPUDevice.ts) — while `readPixelsAsync` only supports `rgba8` and throws
       * `NATIVE_READBACK_FORMAT_UNSUPPORTED` otherwise. The device already exposes
       * `readFloatPixelsAsync` for `rgba16f`/`rgba32f`, so select on the target's real format
       * instead of assuming 8-bit. Float samples are scaled to bytes with the same clamp the
       * 8-bit path applies so the shared `analyze` metrics stay comparable across stages.
       */
      const readTarget = async (target: unknown): Promise<Uint8Array> => {
        device.setRenderTarget(target as never);
        const format = (target as { colorTexture?: { format?: string } }).colorTexture?.format;
        if (format !== "rgba16f" && format !== "rgba32f") return device.readPixelsAsync(0, 0, WIDTH, HEIGHT);
        const floats = await device.readFloatPixelsAsync(0, 0, WIDTH, HEIGHT);
        const bytes = new Uint8Array(floats.length);
        for (let index = 0; index < floats.length; index += 1) {
          bytes[index] = Math.max(0, Math.min(255, Math.round((floats[index] ?? 0) * 255)));
        }
        return bytes;
      };
      const scenePixels = await readTarget(sceneTarget);
      const sceneMetrics = analyze(scenePixels, scenePixels);

      const stages: J2Stage[] = [];
      const gallery: { readonly id: string; readonly pixels: Uint8Array }[] = [{ id: "scene", pixels: scenePixels }];
      const bloomOut = device.executeWebGPUBloom(sceneTarget, { threshold: 0.7, knee: 0.1, strength: 0.8, quality: "balanced" }) as never;
      try {
        const pixels = await readTarget(bloomOut);
        gallery.push({ id: "bloom", pixels });
        const metrics = analyze(scenePixels, pixels);
        stages.push({ id: "bloom", ...metrics, drawCalls: sceneDiagnostics.drawCalls });
      } finally {
        (bloomOut as { dispose(): void }).dispose();
      }
      const gradeOut = device.executeWebGPUColorGrade(sceneTarget, { exposure: 1, contrast: 1.2, saturation: 0.5 }) as never;
      try {
        const pixels = await readTarget(gradeOut);
        gallery.push({ id: "grade", pixels });
        const metrics = analyze(scenePixels, pixels);
        stages.push({ id: "color-grade", ...metrics, drawCalls: sceneDiagnostics.drawCalls });
      } finally {
        (gradeOut as { dispose(): void }).dispose();
      }
      const fxaaOut = device.executeWebGPUFxaa(sceneTarget) as never;
      try {
        const pixels = await readTarget(fxaaOut);
        gallery.push({ id: "fxaa", pixels });
        const metrics = analyze(scenePixels, pixels);
        stages.push({ id: "fxaa", ...metrics, drawCalls: sceneDiagnostics.drawCalls });
      } finally {
        (fxaaOut as { dispose(): void }).dispose();
      }

      paintGallery(gallery);
      const postErrors = await device.drainWebGPUPostErrors();
      const byId = (id: string): J2Stage | undefined => stages.find((stage) => stage.id === id);
      const bloom = byId("bloom");
      const grade = byId("grade") ?? byId("color-grade");
      const fxaa = byId("fxaa");
      if (!bloom || !grade || !fxaa || !sceneMetrics) {
        throw new Error(`J2 stage assembly failed: stages=${JSON.stringify(stages)} sceneMetrics=${JSON.stringify(sceneMetrics)}`);
      }
      const bloomDiagnostics = device.getWebGPUBloomDiagnostics();
      const deviceDiagnostics = device.getDiagnostics();
      window.__AURA3D_J2_WEBGPU_POST__ = {
        status: "ready",
        backend: renderer.device.kind,
        adapter: `${device.info.vendor} ${device.info.renderer}`.trim(),
        stages,
        postErrors: [...postErrors],
        checks: {
          sceneBright: sceneMetrics.brightPixels,
          sceneMeanLuma: Number(sceneMetrics.meanLuma.toFixed(4)),
          bloomBright: bloom.brightPixels,
          bloomDiff: bloom.diffPixelsVsScene,
          gradeMeanLuma: Number(grade.meanLuma.toFixed(4)),
          gradeDiff: grade.diffPixelsVsScene,
          fxaaDiff: fxaa.diffPixelsVsScene,
          fxaaMeanAbsDiff: Number(fxaa.meanAbsDiffVsScene.toFixed(4)),
          bloomMipCount: bloomDiagnostics?.mipCount ?? -1,
          bloomHalfFloat: bloomDiagnostics?.halfFloat ?? false,
          bloomPasses: bloomDiagnostics?.passes ?? -1,
          bloomExecutionMode: bloomDiagnostics?.executionMode ?? "missing",
          nativeBloomPasses: deviceDiagnostics.nativeBloomPasses ?? -1,
          nativeColorGradePasses: deviceDiagnostics.nativeColorGradePasses ?? -1,
          nativeFxaaPasses: deviceDiagnostics.nativeFxaaPasses ?? -1
        }
      };
    } finally {
      sceneTarget.dispose();
    }
  } finally {
    renderer.dispose();
  }
}


/** Independent R03 sequence; output readbacks are measurement only, after native submission. */
async function runTemporalHarness(): Promise<void> {
  const renderer = await Renderer.create({ backend: "webgpu", width: WIDTH, height: HEIGHT, clearColor: [0.02, 0.02, 0.03, 1] });
  const device = renderer.device as WebGPUDevice;
  const geometry = ndcQuad(-0.32, -0.61, 0.32, 0.61);
  const material = new UnlitMaterial({ color: [0.85, 0.85, 0.85, 1] });
  const output = device.createRenderTarget({ width: WIDTH, height: HEIGHT, format: "rgba8", label: "r03-measured-output" });
  try {
    const adapter = `${device.info.vendor} ${device.info.renderer}`.trim();
    if (device.kind !== "webgpu" || !adapter || /swiftshader|llvmpipe|software|lavapipe/i.test(adapter)) {
      window.__AURA3D_J2_WEBGPU_POST__ = { status: "unsupported", backend: device.kind, adapter, error: "R03 requires a hardware WebGPU adapter; software evidence cannot close native acceptance." };
      return;
    }
    window.__AURA3D_R03_FRAMES__ = [];
    let frameCount = 0;
    let hotPathReadbacks = 0;
    const count = (key: string): number => Number(device.captureState().get(key) ?? 0);
    const frame = async (mode: "off" | "taa" | "fxaa", x: number, reset = false, sceneKey = "r03-stable"): Promise<Uint8Array> => {
      const matrix = new Float32Array(IDENTITY);
      const angle = 0.31;
      matrix[0] = Math.cos(angle); matrix[1] = Math.sin(angle);
      matrix[4] = -Math.sin(angle); matrix[5] = Math.cos(angle);
      matrix[12] = x;
      const before = count("nativeTextureReadbacks");
      await renderer.renderAsync({
        renderItems: [{ geometry, material, modelMatrix: matrix, modelViewProjectionMatrix: matrix, label: "r03-stable-rigid-quad" }],
        renderTarget: output,
        cameraPolicy: "identity",
        postprocess: { execution: "auto", toneMapping: { operator: "linear", outputColorSpace: "linear" },
          ...(mode === "taa" ? { taa: { blend: 0.9 }, temporal: { sceneKey, reset } } : {}),
          ...(mode === "fxaa" ? { fxaa: true } : {}) }
      });
      hotPathReadbacks += count("nativeTextureReadbacks") - before;
      frameCount++;
      device.setRenderTarget(output);
      const pixels = await device.readPixelsAsync(0, 0, WIDTH, HEIGHT);
      let binary = "";
      for (let start = 0; start < pixels.length; start += 8192) binary += String.fromCharCode(...pixels.subarray(start, start + 8192));
      window.__AURA3D_R03_FRAMES__!.push({ frame: frameCount, mode, x, reset, sceneKey, width: WIDTH, height: HEIGHT, pixelsBase64: btoa(binary), nativeSubmissions: count("nativeSubmissions"), nativeTemporalBindings: count("nativeTemporalBindings") });
      return pixels;
    };
    const sequence = async (mode: "off" | "taa" | "fxaa", resetEveryFrame = false): Promise<{ flicker: number; pixels: Uint8Array }> => {
      renderer.resetTemporalHistory("r03-independent-sequence");
      let previous: Uint8Array | undefined;
      let flicker = 0;
      let samples = 0;
      let pixels: Uint8Array = new Uint8Array();
      for (let i = 0; i < 32; i++) {
        // Controlled subpixel camera motion of a high-contrast oblique edge.
        pixels = await frame(mode, (i % 2 ? 0.3 : -0.3) * 2 / WIDTH, resetEveryFrame);
        if (previous && i >= 8) { flicker += analyze(previous, pixels).meanAbsDiffVsScene; samples++; }
        previous = pixels;
      }
      return { flicker: flicker / samples, pixels };
    };
    const off = await sequence("off");
    const fxaa = await sequence("fxaa");
    const taa = await sequence("taa");
    const reset = await sequence("taa", true);
    // The same fixed ROI must contain actual old silhouette and become background.
    for (let i = 0; i < 8; i++) await frame("taa", -0.55);
    const oldSilhouette = await frame("off", -0.55);
    let staleHistory: Uint8Array = new Uint8Array();
    for (let i = 0; i < 8; i++) staleHistory = await frame("taa", -0.55);
    const moved = await frame("taa", 0.55);
    const movedReference = await frame("off", 0.55);
    let ghostSum = 0, staleSum = 0, oldCoverage = 0, newCoverage = 0, ghostSamples = 0, roiPixels = 0;
    for (let y = 70; y < 186; y++) for (let x = 20; x < 78; x++) {
      const offset = (y * WIDTH + x) * 4;
      const luma = (pixels: Uint8Array) => (pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]!) / 3 / 255;
      if (luma(oldSilhouette) > .5) oldCoverage++;
      if (luma(movedReference) > .5) newCoverage++;
      roiPixels++;
      for (let channel = 0; channel < 3; channel++) {
        ghostSum += Math.abs(moved[offset + channel]! - movedReference[offset + channel]!);
        staleSum += Math.abs(staleHistory[offset + channel]! - movedReference[offset + channel]!);
        ghostSamples++;
      }
    }
    // Explicit camera cut and scene identity change must seed, never blend stale history.
    for (let i = 0; i < 8; i++) await frame("taa", -0.55);
    renderer.resetTemporalHistory("camera-cut");
    const cut = await frame("taa", 0.55);
    renderer.resetTemporalHistory("cold-reference");
    const cold = await frame("taa", 0.55);
    for (let i = 0; i < 8; i++) await frame("taa", -0.55);
    const replacement = await frame("taa", 0.55, false, "r03-replacement");
    for (let i = 0; i < 8; i++) await frame("taa", -0.55);
    renderer.resize(WIDTH / 2, HEIGHT / 2);
    renderer.resize(WIDTH, HEIGHT);
    const resized = await frame("taa", 0.55);
    const checks = {
      resizeMeanError: analyze(cold, resized).meanAbsDiffVsScene,
      frames: frameCount,
      offFlicker: off.flicker, fxaaFlicker: fxaa.flicker, taaFlicker: taa.flicker,
      resetFlicker: reset.flicker,
      taaVsFxaaPixels: analyze(fxaa.pixels, taa.pixels).diffPixelsVsScene,
      ghostMeanError: ghostSum / ghostSamples / 255,
      staleHistoryGhostMeanError: staleSum / ghostSamples / 255,
      oldSilhouetteRoiCoverage: oldCoverage / roiPixels,
      newSilhouetteRoiCoverage: newCoverage / roiPixels,
      cutMeanError: analyze(cold, cut).meanAbsDiffVsScene,
      sceneReplacementMeanError: analyze(cold, replacement).meanAbsDiffVsScene,
      hotPathReadbacks,
      nativeTaaPasses: count("nativeTaaPasses"), nativeFxaaPasses: count("nativeFxaaPasses"),
      nativeTemporalBindings: count("nativeTemporalBindings"), nativeSubmissions: count("nativeSubmissions"),
      nativeRenderPipelinesCreated: count("nativeRenderPipelinesCreated"), nativeTextureReadbacks: count("nativeTextureReadbacks")
    };
    paintGallery([{ id: "off-sequence", pixels: off.pixels }, { id: "fxaa-sequence", pixels: fxaa.pixels }, { id: "taa-sequence", pixels: taa.pixels }, { id: "taa-disocclusion", pixels: moved }]);
    window.__AURA3D_J2_WEBGPU_POST__ = { status: "ready", backend: device.kind, adapter, checks, postErrors: [...await device.drainWebGPUPostErrors()] };
  } finally {
    output.dispose(); geometry.dispose(); material.dispose(); renderer.dispose();
  }
}

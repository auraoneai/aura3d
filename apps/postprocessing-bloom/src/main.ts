import {
  Geometry,
  RenderDeviceError,
  UnlitMaterial
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dV8PostprocessingBloom?: V8PostprocessingBloomRuntime;
  }
}

interface V8PostprocessingBloomRuntime {
  readonly appId: "postprocessing-bloom";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly postprocessChain: readonly string[];
  readonly bloomEnabled: boolean;
  readonly outputNonDarkPixels: number;
  readonly outputBrightPixels: number;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "postprocessing-bloom" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const POSTPROCESS_CHAIN = ["bloom", "tone-mapping", "fxaa"] as const;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const startedAt = performance.now();
  let runtime = createRuntime(startedAt, "ready");
  const publish = (): void => {
    window.__a3dV8PostprocessingBloom = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;
    let lastMetricSample = 0;
    let metrics = { nonDark: 0, bright: 0 };
    const triangle = Geometry.triangle();
    const gold = new UnlitMaterial({ color: [1, 0.82, 0.18, 1], renderState: { cullMode: "none" } });
    const blue = new UnlitMaterial({ color: [0.1, 0.52, 1, 1], renderState: { cullMode: "none" } });
    const render = (now: number): void => {
      try {
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        const diagnostics = renderer.render({
          cameraPolicy: "auto-frame",
          cameraPosition: [0, 0, 3.6],
          cameraFrameBounds: { min: [-1.4, -0.9, -0.8], max: [1.4, 0.9, 0.8] },
          cameraFrameOptions: { yawRadians: -0.2 + Math.sin(now / 1500) * 0.18, pitchRadians: -0.08, paddingRatio: 0.08 },
          renderItems: [
            {
              geometry: triangle,
              material: gold,
              modelMatrix: multiply(translation(Math.sin(now / 900) * 0.16 - 0.36, 0.12, 0), scale(1.05, 1.05, 1)),
              label: "bloom-hot-triangle"
            },
            {
              geometry: triangle,
              material: blue,
              modelMatrix: multiply(translation(0.42, -0.18, 0.08), scale(0.92, 0.92, 1)),
              label: "bloom-blue-triangle"
            }
          ],
          postprocess: {
            bloom: { threshold: 0.08, intensity: 0.36, radius: 2 },
            toneMapping: { exposure: 1.15, gamma: 1, operator: "reinhard", inputColorSpace: "linear", outputColorSpace: "srgb" },
            fxaa: true
          }
        });
        if (frameCount <= 2 || now - lastMetricSample > 500) {
          metrics = pixelMetrics(renderer.device.readPixels(0, 0, WIDTH, HEIGHT));
          lastMetricSample = now;
        }
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          outputNonDarkPixels: metrics.nonDark,
          outputBrightPixels: metrics.bright
        });
        window.__a3dV8PostprocessingBloom = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = createRuntime(startedAt, "error", { error: formatError(error) });
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

function pixelMetrics(pixels: Uint8Array): { readonly nonDark: number; readonly bright: number } {
  let nonDark = 0;
  let bright = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luma > 18) nonDark += 1;
    if (luma > 120) bright += 1;
  }
  return { nonDark, bright };
}

function createRuntime(
  startedAt: number,
  status: V8PostprocessingBloomRuntime["status"],
  patch: Partial<Omit<V8PostprocessingBloomRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "postprocessChain" | "bloomEnabled">> = {}
): V8PostprocessingBloomRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    postprocessChain: POSTPROCESS_CHAIN,
    bloomEnabled: true,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputBrightPixels: patch.outputBrightPixels ?? 0,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function scale(x: number, y: number, z: number): Float32Array {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

function multiply(left: Float32Array, right: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return output;
}

function renderUi(root: HTMLElement, runtime: V8PostprocessingBloomRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Postprocessing Bloom</h1>
        <p>Renderer-owned bloom, tone mapping, and FXAA over real scene pixels.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Bloom", runtime.bloomEnabled ? "enabled" : "off")}
      ${metric("Non-dark pixels", runtime.outputNonDarkPixels)}
      ${metric("Bright pixels", runtime.outputBrightPixels)}
      ${metric("Chain", runtime.postprocessChain.join(" / "))}
    </section>
    ${runtime.error ? `<section class="diagnostics">${escapeHtml(runtime.error)}</section>` : ""}
  `;
}

function metric(label: string, value: string | number): string {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function formatError(error: unknown): string {
  if (error instanceof RenderDeviceError) {
    return `${error.name}: ${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

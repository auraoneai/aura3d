import {
  Geometry,
  RenderDeviceError,
  UnlitMaterial
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";

declare global {
  interface Window {
    __g3dV8PostprocessingDepthOutline?: V8PostprocessingDepthOutlineRuntime;
  }
}

interface V8PostprocessingDepthOutlineRuntime {
  readonly appId: "postprocessing-depth-outline";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly postprocessChain: readonly string[];
  readonly outlineEnabled: boolean;
  readonly depthOfFieldEnabled: boolean;
  readonly ssaoEnabled: boolean;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly edgeContrastPixels: number;
  readonly renderer: "g3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "postprocessing-depth-outline" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const POSTPROCESS_CHAIN = ["depth-of-field", "ssao", "outline", "tone-mapping", "fxaa"] as const;

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
    window.__g3dV8PostprocessingDepthOutline = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await G3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.008, 0.01, 0.014, 1]
    });
    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;
    let lastMetricSample = 0;
    let metrics = { nonDark: 0, colorBuckets: 0, edgeContrast: 0 };
    const triangle = Geometry.triangle();
    const nearMaterial = new UnlitMaterial({ color: [0.08, 0.84, 0.98, 1], renderState: { cullMode: "none" } });
    const farMaterial = new UnlitMaterial({ color: [1, 0.32, 0.1, 1], renderState: { cullMode: "none" } });

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
          cameraPosition: [0, 0, 3.7],
          cameraFrameBounds: { min: [-1.4, -0.95, -1], max: [1.4, 0.95, 1] },
          cameraFrameOptions: { yawRadians: -0.24 + Math.sin(now / 1600) * 0.16, pitchRadians: -0.08, paddingRatio: 0.1 },
          renderItems: [
            {
              geometry: triangle,
              material: nearMaterial,
              modelMatrix: multiply(translation(-0.36 + Math.sin(now / 1000) * 0.12, 0.12, -0.45), scale(1.02, 1.02, 1)),
              label: "depth-outline-near-cyan"
            },
            {
              geometry: triangle,
              material: farMaterial,
              modelMatrix: multiply(translation(0.42, -0.2, 0.45), scale(0.86, 0.86, 1)),
              label: "depth-outline-far-orange"
            }
          ],
          postprocess: {
            depthOfField: { focusDepth: 0.32, focusRange: 0.03, maxRadius: 3 },
            ssao: { radius: 2, intensity: 0.34, bias: 0.01 },
            outline: { width: 2, threshold: 0.04, opacity: 0.9, color: [20, 28, 34, 255] },
            toneMapping: { exposure: 1, gamma: 1, operator: "linear", inputColorSpace: "linear", outputColorSpace: "srgb" },
            fxaa: true
          }
        });
        if (frameCount <= 2 || now - lastMetricSample >= 500) {
          const pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
          metrics = pixelMetrics(pixels, WIDTH, HEIGHT);
          lastMetricSample = now;
        }
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          outputNonDarkPixels: metrics.nonDark,
          outputColorBuckets: metrics.colorBuckets,
          edgeContrastPixels: metrics.edgeContrast
        });
        window.__g3dV8PostprocessingDepthOutline = runtime;
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

function pixelMetrics(pixels: Uint8Array, width: number, height: number): { readonly nonDark: number; readonly colorBuckets: number; readonly edgeContrast: number } {
  let nonDark = 0;
  let edgeContrast = 0;
  const buckets = new Set<string>();
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (luma > 18) nonDark += 1;
      buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      if (x + 4 < width) {
        const neighbor = (y * width + x + 4) * 4;
        const nr = pixels[neighbor] ?? 0;
        const ng = pixels[neighbor + 1] ?? 0;
        const nb = pixels[neighbor + 2] ?? 0;
        if (Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb) > 70) edgeContrast += 1;
      }
    }
  }
  return { nonDark, colorBuckets: buckets.size, edgeContrast };
}

function createRuntime(
  startedAt: number,
  status: V8PostprocessingDepthOutlineRuntime["status"],
  patch: Partial<Omit<V8PostprocessingDepthOutlineRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "postprocessChain" | "outlineEnabled" | "depthOfFieldEnabled" | "ssaoEnabled">> = {}
): V8PostprocessingDepthOutlineRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    postprocessChain: POSTPROCESS_CHAIN,
    outlineEnabled: true,
    depthOfFieldEnabled: true,
    ssaoEnabled: true,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    edgeContrastPixels: patch.edgeContrastPixels ?? 0,
    renderer: "g3d-webgl2",
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

function renderUi(root: HTMLElement, runtime: V8PostprocessingDepthOutlineRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Depth Outline</h1>
        <p>Renderer-owned depth-of-field, SSAO, outline, tone mapping, and FXAA.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Depth of field", runtime.depthOfFieldEnabled ? "on" : "off")}
      ${metric("SSAO", runtime.ssaoEnabled ? "on" : "off")}
      ${metric("Outline", runtime.outlineEnabled ? "on" : "off")}
      ${metric("Non-dark", runtime.outputNonDarkPixels)}
      ${metric("Buckets", runtime.outputColorBuckets)}
      ${metric("Edges", runtime.edgeContrastPixels)}
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

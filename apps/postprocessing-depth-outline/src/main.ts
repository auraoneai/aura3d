import {
  Geometry,
  RenderDeviceError,
  Renderer,
  UnlitMaterial,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesPostprocessingDepthOutline?: CurrentRoutesPostprocessingDepthOutlineRuntime;
  }
}

interface CurrentRoutesPostprocessingDepthOutlineRuntime {
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
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "postprocessing-depth-outline" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const POSTPROCESS_CHAIN = ["depth-of-field", "ssao", "outline", "tone-mapping", "fxaa"] as const;

const DEPTH_OUTLINE_POSTPROCESS_4_0 = {
  depthOutline: { enabled: true, width: 2, threshold: 0.038, opacity: 0.92, color: [18, 28, 38, 255] as const },
  ssao: { enabled: true, radius: 2, intensity: 0.36, bias: 0.01 },
  bloom: { enabled: true, intensity: 0.16, threshold: 0.82 },
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.12 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const DEPTH_OUTLINE_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  depthOfField: { focusDepth: 0.32, focusRange: 0.035, maxRadius: 3 },
  ssao: {
    radius: DEPTH_OUTLINE_POSTPROCESS_4_0.ssao.radius,
    intensity: DEPTH_OUTLINE_POSTPROCESS_4_0.ssao.intensity,
    bias: DEPTH_OUTLINE_POSTPROCESS_4_0.ssao.bias
  },
  outline: {
    width: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.width,
    threshold: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.threshold,
    opacity: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.opacity,
    color: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.color
  },
  bloom: {
    intensity: DEPTH_OUTLINE_POSTPROCESS_4_0.bloom.intensity,
    threshold: DEPTH_OUTLINE_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  toneMapping: {
    exposure: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.exposure,
    gamma: 1,
    operator: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.mode,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  colorGrade: {
    contrast: 1.06,
    saturation: 1.05,
    vignette: DEPTH_OUTLINE_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: DEPTH_OUTLINE_POSTPROCESS_4_0.fxaa.enabled
};

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
    window.__a3dCurrentRoutesPostprocessingDepthOutline = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.008, 0.01, 0.014, 1],
      output: {
        toneMapping: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.mode,
        exposure: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;
    let lastMetricSample = 0;
    let metrics = { nonDark: 0, colorBuckets: 0, edgeContrast: 0 };
    const nearSphere = Geometry.uvSphere(0.54, 24, 16);
    const midCube = Geometry.litCube(0.84);
    const farSphere = Geometry.uvSphere(0.58, 24, 16);
    const nearMaterial = new UnlitMaterial({ color: [0.08, 0.86, 1.0, 1], renderState: { cullMode: "none" } });
    const midMaterial = new UnlitMaterial({ color: [0.46, 0.34, 0.96, 1], renderState: { cullMode: "none" } });
    const farMaterial = new UnlitMaterial({ color: [1, 0.34, 0.12, 1], renderState: { cullMode: "none" } });

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
              geometry: nearSphere,
              material: nearMaterial,
              modelMatrix: multiply(translation(-0.36 + Math.sin(now / 1000) * 0.12, 0.12, -0.45), scale(1.02, 1.02, 1.02)),
              label: "depth-outline-near-cyan"
            },
            {
              geometry: midCube,
              material: midMaterial,
              modelMatrix: multiply(translation(0.04, -0.04 + Math.cos(now / 1200) * 0.08, 0.02), scale(0.94, 0.94, 0.94)),
              label: "depth-outline-mid-violet"
            },
            {
              geometry: farSphere,
              material: farMaterial,
              modelMatrix: multiply(translation(0.42, -0.2, 0.45), scale(0.86, 0.86, 0.86)),
              label: "depth-outline-far-orange"
            }
          ],
          postprocess: DEPTH_OUTLINE_POSTPROCESS_OPTIONS
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
        window.__a3dCurrentRoutesPostprocessingDepthOutline = runtime;
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
  status: CurrentRoutesPostprocessingDepthOutlineRuntime["status"],
  patch: Partial<Omit<CurrentRoutesPostprocessingDepthOutlineRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "postprocessChain" | "outlineEnabled" | "depthOfFieldEnabled" | "ssaoEnabled">> = {}
): CurrentRoutesPostprocessingDepthOutlineRuntime {
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

function renderUi(root: HTMLElement, runtime: CurrentRoutesPostprocessingDepthOutlineRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>Aura3D 4.0 · Depth Outline Post-Processing</h1>
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

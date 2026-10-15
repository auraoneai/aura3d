import {
  Geometry,
  PBRMaterial,
  RenderDeviceError,
  Renderer,
  UnlitMaterial,
  createLightingRig,
  type RenderItemDrawRange,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesGeometryDrawRange?: CurrentRoutesGeometryDrawRangeRuntime;
  }
}

interface CurrentRoutesGeometryDrawRangeRuntime {
  readonly appId: "geometry-drawrange";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly indexedRangeStart: number;
  readonly indexedRangeCount: number;
  readonly indexedTotalCount: number;
  readonly arrayRangeStart: number;
  readonly arrayRangeCount: number;
  readonly arrayTotalCount: number;
  readonly usesIndexedRange: boolean;
  readonly usesArrayRange: boolean;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "geometry-drawrange" as const;
const WIDTH = 1280;
const HEIGHT = 720;
// The route keeps every selectable range partial: `count < totalCount` is the
// route's own parity invariant, so a "full range" step is deliberately absent.
const INDEXED_RANGE_STEPS = [12, 24] as const;
const ARRAY_RANGE_STEPS = [6, 12] as const;
let indexedRange: RenderItemDrawRange = { start: 6, count: INDEXED_RANGE_STEPS[1] };
let arrayRange: RenderItemDrawRange = { start: 6, count: ARRAY_RANGE_STEPS[0] };
let indexedRangeStep = INDEXED_RANGE_STEPS.length - 1;
let arrayRangeStep = 0;

const DRAWRANGE_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.14 },
  bloom: { enabled: true, intensity: 0.16, threshold: 0.82 },
  fxaa: { enabled: true }
} as const;

const DRAWRANGE_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: DRAWRANGE_POSTPROCESS_4_0.tonemapping.mode,
    exposure: DRAWRANGE_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: DRAWRANGE_POSTPROCESS_4_0.bloom.intensity,
    threshold: DRAWRANGE_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  fxaa: DRAWRANGE_POSTPROCESS_4_0.fxaa.enabled
};

function stepDrawRanges(direction: 1 | -1): void {
  indexedRangeStep = (indexedRangeStep + direction + INDEXED_RANGE_STEPS.length) % INDEXED_RANGE_STEPS.length;
  arrayRangeStep = (arrayRangeStep + direction + ARRAY_RANGE_STEPS.length) % ARRAY_RANGE_STEPS.length;
  indexedRange = { start: 6, count: INDEXED_RANGE_STEPS[indexedRangeStep]! };
  arrayRange = { start: 6, count: ARRAY_RANGE_STEPS[arrayRangeStep]! };
}

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
    window.__a3dCurrentRoutesGeometryDrawRange = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.25,
      shadows: false,
      subject: { height: 1.8, width: 3.2, floorY: -0.9 }
    });
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.012, 0.015, 0.02, 1],
      output: {
        toneMapping: DRAWRANGE_POSTPROCESS_4_0.tonemapping.mode,
        exposure: DRAWRANGE_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    const indexedCube = Geometry.litCube(1.05);
    const arrayQuads = Geometry.wideLineSegments([
      { start: [-1.25, -0.7, 0.18], end: [-0.55, -0.24, 0.18], width: 0.08 },
      { start: [-0.42, -0.72, 0.2], end: [0.32, -0.28, 0.2], width: 0.08 },
      { start: [0.46, -0.7, 0.22], end: [1.18, -0.2, 0.22], width: 0.08 },
      { start: [-0.9, 0.62, 0.12], end: [0.92, 0.62, 0.12], width: 0.045 }
    ]);
    const amber = new PBRMaterial({
      baseColor: [1, 0.64, 0.2, 1],
      metallic: 0.36,
      roughness: 0.28,
      environmentIntensity: 0.56,
      emissiveColor: [0.22, 0.1, 0.02],
      emissiveStrength: 0.35,
      renderState: { cullMode: "none" }
    });
    const cyan = new PBRMaterial({
      baseColor: [0.2, 0.8, 1, 1],
      metallic: 0.28,
      roughness: 0.26,
      environmentIntensity: 0.58,
      emissiveColor: [0.04, 0.16, 0.24],
      emissiveStrength: 0.35,
      renderState: { cullMode: "none" }
    });
    const green = new UnlitMaterial({ color: [0.58, 1, 0.52, 1], renderState: { cullMode: "none" } });
    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;

    window.addEventListener("keydown", (event) => {
      if (event.code === "ArrowUp" || event.code === "Space") {
        event.preventDefault();
        stepDrawRanges(1);
        publish();
      } else if (event.code === "ArrowDown") {
        event.preventDefault();
        stepDrawRanges(-1);
        publish();
      }
    });
    canvas.addEventListener("click", () => {
      stepDrawRanges(1);
      publish();
    });

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

        const yaw = Math.sin(now / 1100) * 0.28;
        const diagnostics = renderer.render({
          collectedLights: lightingRig.collectedLights,
          environmentLighting: {
            color: [0.56, 0.66, 0.84],
            intensity: 1.24,
            proceduralMap: {
              skyColor: [0.58, 0.72, 0.96],
              horizonColor: [0.3, 0.38, 0.5],
              groundColor: [0.08, 0.1, 0.14],
              specularColor: [1, 0.96, 0.9],
              intensity: 1.2,
              specularIntensity: 1.3
            }
          },
          cameraPolicy: "auto-frame",
          cameraPosition: [0, 0, 4.4],
          cameraFrameBounds: { min: [-1.9, -1.15, -1], max: [1.9, 1.15, 1] },
          cameraFrameOptions: { yawRadians: -0.32 + Math.sin(now / 1700) * 0.22, pitchRadians: -0.14, paddingRatio: 0.12 },
          renderItems: [
            {
              geometry: indexedCube,
              material: amber,
              drawRange: indexedRange,
              modelMatrix: multiply(translation(-0.78, 0.16, 0), scale(1.06, 1.06, 1.06)),
              label: "indexed-cube-draw-range"
            },
            {
              geometry: indexedCube,
              material: cyan,
              drawRange: { start: 18, count: 18 },
              modelMatrix: multiply(translation(0.62 + yaw * 0.14, 0.1, 0.05), scale(0.92, 0.92, 0.92)),
              label: "second-indexed-range"
            },
            {
              geometry: arrayQuads,
              material: green,
              drawRange: arrayRange,
              modelMatrix: translation(0, 0, 0),
              label: "array-point-draw-range"
            }
          ],
          postprocess: DRAWRANGE_POSTPROCESS_OPTIONS
        });
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps
        }, indexedCube.indexBuffer?.count ?? 0, arrayQuads.indexBuffer?.count ?? arrayQuads.vertexBuffer.vertexCount);
        window.__a3dCurrentRoutesGeometryDrawRange = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = createRuntime(startedAt, "error", { error: formatError(error) }, indexedCube.indexBuffer?.count ?? 0, arrayQuads.indexBuffer?.count ?? arrayQuads.vertexBuffer.vertexCount);
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesGeometryDrawRangeRuntime["status"],
  patch: Partial<Omit<CurrentRoutesGeometryDrawRangeRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "indexedRangeStart" | "indexedRangeCount" | "arrayRangeStart" | "arrayRangeCount" | "usesIndexedRange" | "usesArrayRange">> = {},
  indexedTotalCount = 0,
  arrayTotalCount = 0
): CurrentRoutesGeometryDrawRangeRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    indexedRangeStart: indexedRange.start,
    indexedRangeCount: indexedRange.count,
    indexedTotalCount: indexedTotalCount || patch.indexedTotalCount || 0,
    arrayRangeStart: arrayRange.start,
    arrayRangeCount: arrayRange.count,
    arrayTotalCount: arrayTotalCount || patch.arrayTotalCount || 0,
    usesIndexedRange: true,
    usesArrayRange: true,
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

function renderUi(root: HTMLElement, runtime: CurrentRoutesGeometryDrawRangeRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>CurrentRoutes Geometry DrawRange</h1>
        <p>Indexed and array draw ranges routed through A3D render commands.</p>
        <p>Change draw ranges with ↑/↓, Space, or a click on the viewport.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Indexed start", runtime.indexedRangeStart)}
      ${metric("Indexed count", `${runtime.indexedRangeCount}/${runtime.indexedTotalCount}`)}
      ${metric("Array start", runtime.arrayRangeStart)}
      ${metric("Array count", `${runtime.arrayRangeCount}/${runtime.arrayTotalCount}`)}
      ${metric("Range path", runtime.usesIndexedRange && runtime.usesArrayRange ? "indexed + array" : "missing")}
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

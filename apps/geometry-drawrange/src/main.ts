import {
  Geometry,
  RenderDeviceError,
  UnlitMaterial,
  type RenderItemDrawRange
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";

declare global {
  interface Window {
    __g3dV8GeometryDrawRange?: V8GeometryDrawRangeRuntime;
  }
}

interface V8GeometryDrawRangeRuntime {
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
  readonly renderer: "g3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "geometry-drawrange" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const INDEXED_RANGE: RenderItemDrawRange = { start: 6, count: 24 };
const ARRAY_RANGE: RenderItemDrawRange = { start: 6, count: 6 };

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
    window.__g3dV8GeometryDrawRange = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await G3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.012, 0.015, 0.02, 1]
    });
    const indexedCube = Geometry.cube(1.05);
    const arrayQuads = Geometry.wideLineSegments([
      { start: [-1.25, -0.7, 0.18], end: [-0.55, -0.24, 0.18], width: 0.08 },
      { start: [-0.42, -0.72, 0.2], end: [0.32, -0.28, 0.2], width: 0.08 },
      { start: [0.46, -0.7, 0.22], end: [1.18, -0.2, 0.22], width: 0.08 },
      { start: [-0.9, 0.62, 0.12], end: [0.92, 0.62, 0.12], width: 0.045 }
    ]);
    const amber = new UnlitMaterial({ color: [1, 0.62, 0.18, 1], renderState: { cullMode: "none" } });
    const cyan = new UnlitMaterial({ color: [0.18, 0.78, 1, 1], renderState: { cullMode: "none" } });
    const green = new UnlitMaterial({ color: [0.55, 1, 0.48, 1], renderState: { cullMode: "none" } });
    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;

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
          cameraPolicy: "auto-frame",
          cameraPosition: [0, 0, 4.4],
          cameraFrameBounds: { min: [-1.9, -1.15, -1], max: [1.9, 1.15, 1] },
          cameraFrameOptions: { yawRadians: -0.32 + Math.sin(now / 1700) * 0.22, pitchRadians: -0.14, paddingRatio: 0.12 },
          renderItems: [
            {
              geometry: indexedCube,
              material: amber,
              drawRange: INDEXED_RANGE,
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
              drawRange: ARRAY_RANGE,
              modelMatrix: translation(0, 0, 0),
              label: "array-point-draw-range"
            }
          ],
          postprocess: { fxaa: true }
        });
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps
        }, indexedCube.indexBuffer?.count ?? 0, arrayQuads.indexBuffer?.count ?? arrayQuads.vertexBuffer.vertexCount);
        window.__g3dV8GeometryDrawRange = runtime;
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
  status: V8GeometryDrawRangeRuntime["status"],
  patch: Partial<Omit<V8GeometryDrawRangeRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "indexedRangeStart" | "indexedRangeCount" | "arrayRangeStart" | "arrayRangeCount" | "usesIndexedRange" | "usesArrayRange">> = {},
  indexedTotalCount = 0,
  arrayTotalCount = 0
): V8GeometryDrawRangeRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    indexedRangeStart: INDEXED_RANGE.start,
    indexedRangeCount: INDEXED_RANGE.count,
    indexedTotalCount: indexedTotalCount || patch.indexedTotalCount || 0,
    arrayRangeStart: ARRAY_RANGE.start,
    arrayRangeCount: ARRAY_RANGE.count,
    arrayTotalCount: arrayTotalCount || patch.arrayTotalCount || 0,
    usesIndexedRange: true,
    usesArrayRange: true,
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

function renderUi(root: HTMLElement, runtime: V8GeometryDrawRangeRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Geometry DrawRange</h1>
        <p>Indexed and array draw ranges routed through G3D render commands.</p>
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

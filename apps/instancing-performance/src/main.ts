import {
  Geometry,
  InstancedPBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, Scene } from "@aura3d/scene";

declare global {
  interface Window {
    __a3dV8InstancingPerformance?: V8InstancingPerformanceRuntime;
  }
}

interface V8InstancingPerformanceRuntime {
  readonly appId: "instancing-performance";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly instanceCount: number;
  readonly instanceAttributeBuffers: number;
  readonly instanceAttributeBytes: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly sceneRenderableCount: number;
  readonly publicSceneInstancedMesh: boolean;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "instancing-performance" as const;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 2560;
const INSTANCE_COLUMNS = 64;
const INSTANCE_ROWS = 64;
const INSTANCE_COUNT = INSTANCE_COLUMNS * INSTANCE_ROWS;
const INSTANCE_MATRIX_STRIDE_BYTES = 64;
const INSTANCE_COLOR_STRIDE_BYTES = 16;
const BOUNDS: CameraFrameBounds = { min: [-4.9, -3.15, -1.35], max: [4.9, 3.15, 1.35] };

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  let renderSize = syncCanvasRenderSize(canvas);

  const startedAt = performance.now();
  let runtime = createRuntime(startedAt, "ready");
  const publish = (): void => {
    window.__a3dV8InstancingPerformance = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      backend: "webgl2",
      antialias: true,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const resources = createResources();

    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;

    const render = (now: number): void => {
      try {
        const nextSize = syncCanvasRenderSize(canvas);
        if (nextSize.width !== renderSize.width || nextSize.height !== renderSize.height) {
          renderSize = nextSize;
          renderer.resize(renderSize.width, renderSize.height);
        }
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        writeInstanceMatrices(resources.instanceTransforms, now / 1000);
        const frame = computePerspectiveCameraFrame(BOUNDS, renderSize, {
          yawRadians: -0.24,
          pitchRadians: -0.16,
          paddingRatio: 0.12,
          fovYRadians: 0.56,
          nearPadding: 0.16,
          farPadding: 2.8
        });
        const diagnostics = renderer.render({
          source: createSource(resources, frame.cameraPosition),
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          }
        });
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          instanceAttributeBuffers: 2,
          instanceAttributeBytes: resources.instanceTransforms.byteLength + resources.instanceColors.byteLength,
          sceneRenderableCount: resources.scene.collectRenderables().length,
          publicSceneInstancedMesh: resources.instancedMesh.isInstancedMesh === true
        });
        window.__a3dV8InstancingPerformance = runtime;
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

interface InstancingResources {
  readonly scene: Scene;
  readonly instancedMesh: ReturnType<Scene["createInstancedMesh"]>;
  readonly geometry: Geometry;
  readonly material: InstancedPBRMaterial;
  readonly instanceTransforms: Float32Array;
  readonly instanceColors: Float32Array;
}

function createResources(): InstancingResources {
  const scene = new Scene();
  const instanceTransforms = new Float32Array(INSTANCE_COUNT * 16);
  const instanceColors = createInstanceColors();
  writeInstanceMatrices(instanceTransforms, 0);
  const instancedMesh = scene.createInstancedMesh({
    name: "public-scene-instanced-mesh-grid",
    renderable: {
      geometry: "geometry:instanced-cube",
      material: "material:instanced-pbr",
      instanceTransforms,
      instanceColors,
      castShadow: false,
      receiveShadow: false
    }
  });
  scene.root.addChild(instancedMesh);
  return {
    scene,
    instancedMesh,
    geometry: Geometry.litCube(1),
    material: new InstancedPBRMaterial({
      name: "v8-instancing-public-scene-pbr",
      baseColor: [1, 1, 1, 1],
      roughness: 0.48,
      metallic: 0.05,
      environmentIntensity: 0.58
    }),
    instanceTransforms,
    instanceColors
  };
}

function createSource(resources: InstancingResources, cameraPosition: readonly [number, number, number]): RenderSource {
  return {
    scene: resources.scene,
    geometryLibrary: { "geometry:instanced-cube": resources.geometry },
    materialLibrary: { "material:instanced-pbr": resources.material },
    collectedLights: createLights(),
    cameraPolicy: "require",
    cameraPosition,
    environmentLighting: {
      color: [0.78, 0.82, 0.9],
      intensity: 0.42,
      proceduralMap: {
        skyColor: [0.08, 0.15, 0.26],
        horizonColor: [0.48, 0.62, 0.78],
        groundColor: [0.05, 0.055, 0.065],
        specularColor: [0.9, 0.94, 1],
        intensity: 0.5,
        specularIntensity: 0.86
      }
    },
    frustumCulling: false,
    postprocess: false
  };
}

function syncCanvasRenderSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : FALLBACK_WIDTH;
  const cssHeight = rect.height > 0 ? rect.height : FALLBACK_HEIGHT;
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, MAX_RENDER_EDGE / Math.max(cssWidth * pixelRatio, cssHeight * pixelRatio));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio * edgeScale));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio * edgeScale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function createInstanceColors(): Float32Array {
  const data = new Float32Array(INSTANCE_COUNT * 4);
  let cursor = 0;
  for (let row = 0; row < INSTANCE_ROWS; row += 1) {
    for (let column = 0; column < INSTANCE_COLUMNS; column += 1) {
      const hue = (column / INSTANCE_COLUMNS + row / INSTANCE_ROWS) % 1;
      const color = palette(hue);
      data[cursor] = color[0];
      data[cursor + 1] = color[1];
      data[cursor + 2] = color[2];
      data[cursor + 3] = 1;
      cursor += 4;
    }
  }
  return data;
}

function writeInstanceMatrices(data: Float32Array, time: number): void {
  const xStep = 8.4 / Math.max(1, INSTANCE_COLUMNS - 1);
  const yStep = 5.2 / Math.max(1, INSTANCE_ROWS - 1);
  const scale = Math.min(xStep, yStep) * 0.34;
  let cursor = 0;
  for (let row = 0; row < INSTANCE_ROWS; row += 1) {
    for (let column = 0; column < INSTANCE_COLUMNS; column += 1) {
      const x = -4.2 + column * xStep;
      const y = -2.6 + row * yStep;
      const z = Math.sin(time * 1.4 + column * 0.18 + row * 0.12) * 0.34;
      writeScaleTranslation(data, cursor, scale, x, y, z);
      cursor += 16;
    }
  }
}

function writeScaleTranslation(data: Float32Array, offset: number, scale: number, x: number, y: number, z: number): void {
  data[offset] = scale;
  data[offset + 1] = 0;
  data[offset + 2] = 0;
  data[offset + 3] = 0;
  data[offset + 4] = 0;
  data[offset + 5] = scale;
  data[offset + 6] = 0;
  data[offset + 7] = 0;
  data[offset + 8] = 0;
  data[offset + 9] = 0;
  data[offset + 10] = scale;
  data[offset + 11] = 0;
  data[offset + 12] = x;
  data[offset + 13] = y;
  data[offset + 14] = z;
  data[offset + 15] = 1;
}

function palette(t: number): readonly [number, number, number] {
  return [
    0.52 + 0.42 * Math.cos(Math.PI * 2 * (t + 0)),
    0.52 + 0.42 * Math.cos(Math.PI * 2 * (t + 0.33)),
    0.52 + 0.42 * Math.cos(Math.PI * 2 * (t + 0.67))
  ];
}

function createRuntime(
  startedAt: number,
  status: V8InstancingPerformanceRuntime["status"],
  patch: Partial<Omit<V8InstancingPerformanceRuntime, "appId" | "status" | "renderer" | "elapsedMs">> = {}
): V8InstancingPerformanceRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    instanceCount: INSTANCE_COUNT,
    instanceAttributeBuffers: patch.instanceAttributeBuffers ?? 0,
    instanceAttributeBytes: patch.instanceAttributeBytes ?? INSTANCE_COUNT * (INSTANCE_MATRIX_STRIDE_BYTES + INSTANCE_COLOR_STRIDE_BYTES),
    vertexCount: 24,
    indexCount: 36,
    sceneRenderableCount: patch.sceneRenderableCount ?? 0,
    publicSceneInstancedMesh: patch.publicSceneInstancedMesh ?? false,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-instancing-key");
  key.intensity = 3.1;
  key.color = [1, 0.94, 0.86];
  const fill = new DirectionalLight("v8-instancing-fill");
  fill.intensity = 1.2;
  fill.color = [0.52, 0.68, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [3.4, 4.4, 3.2], direction: [-0.52, -0.72, -0.42], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-3.2, 2.2, 2.2], direction: [0.62, -0.36, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function renderUi(root: HTMLElement, runtime: V8InstancingPerformanceRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Instancing Performance</h1>
        <p>Public Scene.createInstancedMesh rendered through A3DRenderer with per-instance matrix and color attributes.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Instances", runtime.instanceCount)}
      ${metric("Instance buffers", runtime.instanceAttributeBuffers)}
      ${metric("Instance bytes", runtime.instanceAttributeBytes)}
      ${metric("Scene renderables", runtime.sceneRenderableCount)}
      ${metric("InstancedMesh API", runtime.publicSceneInstancedMesh ? "yes" : "no")}
      ${metric("Vertices", runtime.vertexCount)}
      ${metric("Indices", runtime.indexCount)}
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
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

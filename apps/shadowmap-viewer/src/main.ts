import { DirectionalLight } from "@galileo3d/scene";
import {
  Geometry,
  PBRMaterial,
  ShadowMap,
  ShadowPass,
  UnlitMaterial
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";

declare global {
  interface Window {
    __g3dV8ShadowmapViewer?: V8ShadowmapViewerRuntime;
  }
}

interface V8ShadowmapViewerRuntime {
  readonly appId: "shadowmap-viewer";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly shadowRendered: boolean;
  readonly shadowTextureKind: string;
  readonly shadowTextureLabel: string;
  readonly shadowMapSize: number;
  readonly casterCount: number;
  readonly skippedTransparentCasters: number;
  readonly depthMin: number;
  readonly depthMax: number;
  readonly depthNonDefaultPixels: number;
  readonly pcfSamples: number;
  readonly pcfRadius: number;
  readonly elapsedMs: number;
  readonly renderer: "g3d-webgl2";
  readonly error?: string;
}

const APP_ID = "shadowmap-viewer" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const SHADOW_SIZE = 128;

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const startedAt = performance.now();
  let runtime = createRuntime("ready", "Ready", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;
  let latestDepth: Float32Array | null = null;

  const publish = (): void => {
    window.__g3dV8ShadowmapViewer = runtime;
    renderUi(root, runtime);
    if (latestDepth) drawDepthPreview(root, latestDepth, SHADOW_SIZE, SHADOW_SIZE);
  };
  publish();

  try {
    const renderer = await G3DRenderer.create({ canvas, width: WIDTH, height: HEIGHT, backend: "webgl2" });
    const device = renderer.device;
    const light = new DirectionalLight("shadowmap-viewer-light");
    light.castsShadow = true;
    light.intensity = 2;
    const shadowMap = new ShadowMap({
      size: SHADOW_SIZE,
      bias: 0.0015,
      filter: "pcf",
      pcfRadius: 1.5,
      pcfSamples: 9,
      label: "shadowmap-viewer-depth"
    });
    const transparentMaterial = new UnlitMaterial({
      color: [1, 1, 1, 0.35],
      renderState: { blend: true, depthWrite: false }
    });
    const visibleCube = Geometry.litCube(0.9);
    const visibleFloor = Geometry.litCube(1);
    const amber = new PBRMaterial({
      name: "shadowmap-amber-caster",
      baseColor: [0.95, 0.62, 0.24, 1],
      metallic: 0.05,
      roughness: 0.34,
      environmentIntensity: 0.45
    });
    const cyan = new PBRMaterial({
      name: "shadowmap-cyan-caster",
      baseColor: [0.2, 0.72, 1, 1],
      metallic: 0.08,
      roughness: 0.28,
      environmentIntensity: 0.55
    });
    const matteFloor = new PBRMaterial({
      name: "shadowmap-matte-floor",
      baseColor: [0.64, 0.68, 0.74, 1],
      metallic: 0,
      roughness: 0.72,
      environmentIntensity: 0.25
    });
    const pass = new ShadowPass({
      light,
      shadowMap,
      viewProjectionMatrix: createViewerShadowMatrix(),
      casters: [
        {
          geometry: Geometry.litCube(0.9),
          modelMatrix: translationMatrix(-0.35, 0, 0),
          label: "viewer-shadow-caster-left"
        },
        {
          geometry: Geometry.litCube(0.55),
          modelMatrix: translationMatrix(0.46, 0.24, -0.18),
          label: "viewer-shadow-caster-right"
        },
        {
          geometry: Geometry.litCube(0.35),
          material: transparentMaterial,
          modelMatrix: translationMatrix(0.2, -0.32, 0.08),
          label: "viewer-transparent-skipped-caster"
        }
      ]
    });

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.max(0, (now - lastNow) / 1000);
        lastNow = now;
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        const result = pass.execute({ device, width: WIDTH, height: HEIGHT });
        const target = pass.getRenderTarget();
        if (!target) throw new Error("ShadowPass did not create a render target.");
        device.setRenderTarget(target);
        latestDepth = device.readDepthPixels(0, 0, target.width, target.height);
        device.setRenderTarget(null);
        renderer.render({
          clearColor: [0.02, 0.024, 0.03, 1],
          environmentLighting: {
            color: [0.56, 0.62, 0.76],
            intensity: 0.9,
            proceduralMap: {
              skyColor: [0.55, 0.68, 0.9],
              horizonColor: [0.92, 0.78, 0.54],
              groundColor: [0.12, 0.13, 0.15],
              specularColor: [1, 0.92, 0.72],
              intensity: 0.7,
              specularIntensity: 0.9
            }
          },
          cameraPosition: [0, 0, 5.2],
          cameraFrameBounds: { min: [-1.8, -1.1, -1], max: [1.8, 1.2, 1] },
          cameraFrameOptions: { yawRadians: Math.sin(now / 1800) * 0.18 - 0.24, pitchRadians: -0.12, paddingRatio: 0.16 },
          renderItems: [
            {
              geometry: visibleFloor,
              material: matteFloor,
              modelMatrix: multiply(translationMatrix(0, -0.78, 0), scaleMatrix(3.25, 0.08, 1.9)),
              label: "shadowmap-visible-floor"
            },
            {
              geometry: visibleCube,
              material: amber,
              modelMatrix: multiply(translationMatrix(-0.46, -0.1, 0), rotationY(now / 1100)),
              label: "shadowmap-visible-caster-left"
            },
            {
              geometry: visibleCube,
              material: cyan,
              modelMatrix: multiply(translationMatrix(0.62, 0.02, -0.18), multiply(rotationY(-now / 1300), scaleMatrix(0.72, 0.72, 0.72))),
              label: "shadowmap-visible-caster-right"
            }
          ],
          postprocess: { fxaa: true, toneMapping: { exposure: 1.05, gamma: 1, operator: "reinhard", inputColorSpace: "linear", outputColorSpace: "srgb" } }
        });
        const stats = summarizeDepth(latestDepth);
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          shadowRendered: result.rendered,
          shadowTextureKind: result.shadowTextureKind ?? "none",
          shadowTextureLabel: result.shadowTextureLabel ?? "none",
          shadowMapSize: shadowMap.size,
          casterCount: result.casterCount,
          skippedTransparentCasters: result.skippedTransparentCasters,
          depthMin: stats.min,
          depthMax: stats.max,
          depthNonDefaultPixels: stats.nonDefaultPixels,
          pcfSamples: shadowMap.filterKernel.samples.length,
          pcfRadius: shadowMap.filterKernel.radius
        });
        window.__g3dV8ShadowmapViewer = runtime;
        if (frameCount === 1 || now - lastUi > 220 || delta === 0) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function summarizeDepth(depth: Float32Array): { readonly min: number; readonly max: number; readonly nonDefaultPixels: number } {
  let min = 1;
  let max = 0;
  let nonDefaultPixels = 0;
  for (const value of depth) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (value < 0.999) nonDefaultPixels += 1;
  }
  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    nonDefaultPixels
  };
}

function createViewerShadowMatrix(): Float32Array {
  return new Float32Array([
    0.72, 0, 0, 0,
    0, 0.72, 0, 0,
    0, 0, 0.72, 0,
    0, 0, 0, 1
  ]);
}

function translationMatrix(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function scaleMatrix(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

function rotationY(radians: number): Float32Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
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

function createRuntime(
  status: V8ShadowmapViewerRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8ShadowmapViewerRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): V8ShadowmapViewerRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    shadowRendered: patch.shadowRendered ?? false,
    shadowTextureKind: patch.shadowTextureKind ?? "none",
    shadowTextureLabel: patch.shadowTextureLabel ?? "none",
    shadowMapSize: patch.shadowMapSize ?? SHADOW_SIZE,
    casterCount: patch.casterCount ?? 0,
    skippedTransparentCasters: patch.skippedTransparentCasters ?? 0,
    depthMin: patch.depthMin ?? 1,
    depthMax: patch.depthMax ?? 1,
    depthNonDefaultPixels: patch.depthNonDefaultPixels ?? 0,
    pcfSamples: patch.pcfSamples ?? 0,
    pcfRadius: patch.pcfRadius ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "g3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8ShadowmapViewerRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 Shadowmap Viewer</h1>
          <p>Renderer ShadowPass depth texture readback and diagnostic preview.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("rendered", runtime.shadowRendered ? "yes" : "no")}
        ${metric("texture", runtime.shadowTextureKind)}
        ${metric("size", runtime.shadowMapSize)}
        ${metric("casters", runtime.casterCount)}
        ${metric("skipped transparent", runtime.skippedTransparentCasters)}
        ${metric("depth min", runtime.depthMin.toFixed(4))}
        ${metric("depth max", runtime.depthMax.toFixed(4))}
        ${metric("non-default px", runtime.depthNonDefaultPixels)}
        ${metric("pcf", `${runtime.pcfSamples} @ ${runtime.pcfRadius.toFixed(1)}`)}
      </div>
      <canvas id="shadow-preview" class="shadow-preview" width="${SHADOW_SIZE}" height="${SHADOW_SIZE}"></canvas>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : escapeHtml(runtime.shadowTextureLabel)}</p>
    </section>
  `;
}

function drawDepthPreview(root: HTMLElement, depth: Float32Array, width: number, height: number): void {
  const preview = root.querySelector("#shadow-preview");
  if (!(preview instanceof HTMLCanvasElement)) return;
  const context = preview.getContext("2d");
  if (!context) return;
  const image = context.createImageData(width, height);
  for (let index = 0; index < depth.length; index += 1) {
    const value = Math.max(0, Math.min(255, Math.round((1 - depth[index]!) * 255)));
    const byte = index * 4;
    image.data[byte] = value;
    image.data[byte + 1] = value;
    image.data[byte + 2] = value;
    image.data[byte + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();

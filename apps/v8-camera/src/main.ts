import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { DirectionalLight, composeMat4, quatFromEuler } from "@galileo3d/scene";

declare global {
  interface Window {
    __g3dV8Camera?: V8CameraRuntime;
  }
}

type CameraMode = "hero" | "top" | "detail";

interface V8CameraRuntime {
  readonly appId: "v8-camera";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly activeCamera: CameraMode;
  readonly helperCameraCount: number;
  readonly frustumHelpers: number;
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "v8-camera" as const;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 1920;
const BOUNDS: CameraFrameBounds = { min: [-2.1, -0.8, -1.8], max: [2.1, 1.8, 1.8] };

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }

  let renderSize = syncCanvasRenderSize(canvas);
  const startedAt = performance.now();
  let mode: CameraMode = "hero";
  let frameCount = 0;
  let lastNow = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsLast = performance.now();
  let runtime: V8CameraRuntime = {
    appId: APP_ID,
    status: "loading",
    statusLabel: "Loading",
    frameCount: 0,
    drawCalls: 0,
    fps: 0,
    activeCamera: mode,
    helperCameraCount: 3,
    frustumHelpers: 3,
    elapsedMs: 0
  };

  const publish = (patch: Partial<V8CameraRuntime>): void => {
    runtime = { ...runtime, ...patch, elapsedMs: Math.round(performance.now() - startedAt) };
    window.__g3dV8Camera = runtime;
    renderUi(root, runtime, mode, (next) => {
      mode = next;
      publish({ activeCamera: mode });
    });
  };

  drawFallback(canvas);
  publish({});

  try {
    const renderer = await G3DRenderer.create({
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const resources = createResources();
    publish({ status: "ready", statusLabel: "Renderer ready" });

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        const time = now / 1000;
        const nextSize = syncCanvasRenderSize(canvas);
        if (nextSize.width !== renderSize.width || nextSize.height !== renderSize.height) {
          renderSize = nextSize;
          renderer.resize(renderSize.width, renderSize.height);
        }
        frameCount += 1;
        fpsFrames += 1;
        if (now - fpsLast >= 500) {
          fps = fpsFrames * 1000 / (now - fpsLast);
          fpsFrames = 0;
          fpsLast = now;
        }
        const frame = computePerspectiveCameraFrame(BOUNDS, renderSize, cameraOptions(mode, time));
        const source: RenderSource = {
          collectRenderItems: () => createItems(resources, time, mode),
          collectedLights: createLights(),
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
          cameraFrameBounds: BOUNDS,
          environmentLighting: {
            color: [0.72, 0.78, 0.9],
            intensity: 0.32,
            proceduralMap: {
              skyColor: [0.08, 0.16, 0.28],
              horizonColor: [0.38, 0.56, 0.72],
              groundColor: [0.04, 0.05, 0.07],
              specularColor: [0.88, 0.94, 1],
              intensity: 0.42,
              specularIntensity: 0.74
            }
          },
          frustumCulling: false,
          postprocess: false
        };
        const result = renderer.renderFrame({
          source,
          camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix },
          metadata: {
            assetId: APP_ID,
            assetName: "V8 Camera",
            assetUri: "/apps/v8-camera/",
            meshCount: 18,
            primitiveCount: 18,
            materialCount: 8,
            textureCount: 0,
            imageCount: 0,
            animationCount: 1,
            skinCount: 0,
            morphTargetCount: 0,
            extensionsUsed: ["G3D_camera_helpers", "G3D_camera_presets"]
          }
        });
        runtime = {
          appId: APP_ID,
          status: frameCount === 1 ? "ready" : "running",
          statusLabel: frameCount === 1 ? "Ready" : "Running",
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          activeCamera: mode,
          helperCameraCount: 3,
          frustumHelpers: 3,
          elapsedMs: Math.round(performance.now() - startedAt)
        };
        window.__g3dV8Camera = runtime;
        if (frameCount === 1 || frameCount % 12 === 0 || delta === 0) {
          renderUi(root, runtime, mode, (next) => {
            mode = next;
            publish({ activeCamera: mode });
          });
        }
        requestAnimationFrame(render);
      } catch (error) {
        publish({ status: "error", statusLabel: "Error", error: formatError(error) });
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    publish({ status: "error", statusLabel: "Error", error: formatError(error) });
  }
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

interface CameraResources {
  readonly cube: Geometry;
  readonly sphere: Geometry;
  readonly cylinder: Geometry;
  readonly floor: PBRMaterial;
  readonly body: PBRMaterial;
  readonly glass: PBRMaterial;
  readonly gold: PBRMaterial;
  readonly blue: PBRMaterial;
  readonly red: PBRMaterial;
  readonly line: PBRMaterial;
  readonly dark: PBRMaterial;
}

function createResources(): CameraResources {
  return {
    cube: Geometry.litCube(1),
    sphere: Geometry.uvSphere(0.5, 48, 24),
    cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 40 }),
    floor: new PBRMaterial({ name: "camera-floor", baseColor: [0.055, 0.063, 0.075, 1], roughness: 0.62, metallic: 0.04 }),
    body: new PBRMaterial({ name: "camera-body", baseColor: [0.55, 0.58, 0.62, 1], roughness: 0.24, metallic: 0.45 }),
    glass: new PBRMaterial({ name: "camera-glass", baseColor: [0.22, 0.44, 0.78, 1], roughness: 0.08, metallic: 0.03, clearcoatFactor: 0.85 }),
    gold: new PBRMaterial({ name: "camera-gold", baseColor: [1, 0.62, 0.18, 1], roughness: 0.2, metallic: 0.6 }),
    blue: new PBRMaterial({ name: "camera-blue", baseColor: [0.07, 0.38, 0.86, 1], roughness: 0.28, clearcoatFactor: 0.3 }),
    red: new PBRMaterial({ name: "camera-red", baseColor: [0.9, 0.14, 0.1, 1], roughness: 0.28, clearcoatFactor: 0.3 }),
    line: new PBRMaterial({ name: "camera-line", baseColor: [0.2, 0.9, 1, 1], roughness: 0.2, emissiveColor: [0.02, 0.32, 0.42], emissiveStrength: 1.8 }),
    dark: new PBRMaterial({ name: "camera-dark", baseColor: [0.025, 0.032, 0.045, 1], roughness: 0.5, metallic: 0.1 })
  };
}

function createItems(resources: CameraResources, time: number, mode: CameraMode): readonly RenderItem[] {
  const spin = time * 0.9;
  const activeOffset = mode === "hero" ? -0.65 : mode === "top" ? 0 : 0.65;
  return [
    { label: "camera-floor", geometry: resources.cube, material: resources.floor, modelMatrix: composeMat4([0, -0.72, 0], [0, 0, 0, 1], [4.6, 0.045, 3.2]) },
    { label: "camera-back-wall", geometry: resources.cube, material: resources.dark, modelMatrix: composeMat4([0, 0.28, -1.55], [0, 0, 0, 1], [4.6, 2.1, 0.04]) },
    { label: "camera-orbit-target", geometry: resources.sphere, material: resources.glass, modelMatrix: composeMat4([0, 0.1 + Math.sin(time * 1.2) * 0.12, 0], quatFromEuler(0, spin, 0), [0.78, 0.78, 0.78]) },
    { label: "camera-target-core", geometry: resources.cylinder, material: resources.gold, modelMatrix: composeMat4([0, 0.1, 0], quatFromEuler(Math.PI / 2, 0, spin), [0.16, 0.78, 0.16]) },
    { label: "camera-rig-hero-body", geometry: resources.cube, material: mode === "hero" ? resources.gold : resources.body, modelMatrix: composeMat4([-1.35, 0.35, 0.95], quatFromEuler(0.12, -0.55, 0), [0.3, 0.2, 0.2]) },
    { label: "camera-rig-top-body", geometry: resources.cube, material: mode === "top" ? resources.gold : resources.body, modelMatrix: composeMat4([0, 1.05, 1.1], quatFromEuler(-0.9, 0, 0), [0.3, 0.2, 0.2]) },
    { label: "camera-rig-detail-body", geometry: resources.cube, material: mode === "detail" ? resources.gold : resources.body, modelMatrix: composeMat4([1.35, 0.28, 0.88], quatFromEuler(0.18, 0.58, 0), [0.3, 0.2, 0.2]) },
    { label: "camera-frustum-hero", geometry: resources.cube, material: resources.line, modelMatrix: composeMat4([-0.88, 0.18, 0.48], quatFromEuler(0.12, -0.55, 0), [0.66, 0.4, 0.025]) },
    { label: "camera-frustum-top", geometry: resources.cube, material: resources.line, modelMatrix: composeMat4([0, 0.58, 0.56], quatFromEuler(-0.9, 0, 0), [0.68, 0.42, 0.025]) },
    { label: "camera-frustum-detail", geometry: resources.cube, material: resources.line, modelMatrix: composeMat4([0.88, 0.16, 0.44], quatFromEuler(0.18, 0.58, 0), [0.66, 0.4, 0.025]) },
    { label: "camera-focus-a", geometry: resources.sphere, material: resources.blue, modelMatrix: composeMat4([-0.8, -0.34, -0.3], [0, 0, 0, 1], [0.22, 0.22, 0.22]) },
    { label: "camera-focus-b", geometry: resources.sphere, material: resources.red, modelMatrix: composeMat4([0.8, -0.34, -0.3], [0, 0, 0, 1], [0.22, 0.22, 0.22]) },
    { label: "camera-active-marker", geometry: resources.cylinder, material: resources.gold, modelMatrix: composeMat4([activeOffset, -0.48, 0.72], quatFromEuler(Math.PI / 2, 0, 0), [0.07, 0.38, 0.07]) }
  ];
}

function cameraOptions(mode: CameraMode, time: number): Parameters<typeof computePerspectiveCameraFrame>[2] {
  if (mode === "top") {
    return { yawRadians: 0.04, pitchRadians: -0.88, paddingRatio: 0.1, fovYRadians: 0.62, nearPadding: 0.16, farPadding: 2.4 };
  }
  if (mode === "detail") {
    return { yawRadians: 0.58 + Math.sin(time * 0.3) * 0.06, pitchRadians: -0.08, paddingRatio: 0.2, fovYRadians: 0.38, nearPadding: 0.12, farPadding: 1.8 };
  }
  return { yawRadians: -0.46 + Math.sin(time * 0.25) * 0.05, pitchRadians: -0.18, paddingRatio: 0.08, fovYRadians: 0.54, nearPadding: 0.16, farPadding: 2.4 };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-camera-key");
  key.intensity = 3.8;
  key.color = [1, 0.94, 0.84];
  const rim = new DirectionalLight("v8-camera-rim");
  rim.intensity = 1.9;
  rim.color = [0.55, 0.72, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.1, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.2, 2.1, -1.7], direction: [0.58, -0.36, 0.73], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function renderUi(root: HTMLElement, runtime: V8CameraRuntime, mode: CameraMode, onMode: (mode: CameraMode) => void): void {
  root.innerHTML = `
    <section class="panel">
      <p id="runtime-state" class="runtime-pill is-${runtime.status}">${runtime.statusLabel}</p>
      <h1>V8 Camera</h1>
      <p>G3D-only camera/frustum route for webgl_camera parity work.</p>
      <dl>
        <dt>Frames</dt><dd>${runtime.frameCount}</dd>
        <dt>Draw calls</dt><dd>${runtime.drawCalls}</dd>
        <dt>FPS</dt><dd>${runtime.fps.toFixed(1)}</dd>
        <dt>Active camera</dt><dd>${runtime.activeCamera}</dd>
        <dt>Frustum helpers</dt><dd>${runtime.frustumHelpers}</dd>
      </dl>
      <div class="camera-controls">
        ${button("hero", mode)}
        ${button("top", mode)}
        ${button("detail", mode)}
      </div>
      ${runtime.error ? `<pre class="runtime-error">${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
  root.querySelectorAll<HTMLButtonElement>("[data-camera-mode]").forEach((buttonElement) => {
    buttonElement.addEventListener("click", () => {
      const next = buttonElement.dataset.cameraMode;
      if (next === "hero" || next === "top" || next === "detail") onMode(next);
    });
  });
}

function button(mode: CameraMode, active: CameraMode): string {
  return `<button type="button" data-camera-mode="${mode}" class="${mode === active ? "is-active" : ""}">${mode}</button>`;
}

function drawFallback(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.006, 0.008, 0.012, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

import { TrackballControls } from "@aura3d/controls";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  createLightingRig,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesControlsTrackball?: CurrentRoutesControlsTrackballRuntime;
  }
}

interface CurrentRoutesControlsTrackballRuntime {
  readonly appId: "controls-trackball";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly positionZ: number;
  readonly rotateEnabled: boolean;
  readonly panEnabled: boolean;
  readonly zoomEnabled: boolean;
  readonly trackballRollApplied: boolean;
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

const APP_ID = "controls-trackball" as const;
const WIDTH = 1280;
const HEIGHT = 720;

const TRACKBALL_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.15 },
  bloom: { enabled: true, intensity: 0.18, threshold: 0.82 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const TRACKBALL_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: TRACKBALL_POSTPROCESS_4_0.tonemapping.mode,
    exposure: TRACKBALL_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: TRACKBALL_POSTPROCESS_4_0.bloom.intensity,
    threshold: TRACKBALL_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.06,
    saturation: 1.05,
    vignette: TRACKBALL_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: TRACKBALL_POSTPROCESS_4_0.fxaa.enabled
};

function composeTransform(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number, rollZ: number): Float32Array {
  const c = Math.cos(rollZ);
  const s = Math.sin(rollZ);
  return new Float32Array([
    c * sx, s * sx, 0, 0,
    -s * sy, c * sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}

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

  const publish = (): void => {
    window.__a3dCurrentRoutesControlsTrackball = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const controls = new TrackballControls();
    controls.rotate(0.35, -0.16);
    controls.pan(0.08, -0.04);
    controls.dolly(0.86);
    controls.roll(0.22);
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.3,
      shadows: false,
      subject: { height: 1.6, width: 2.1, floorY: -0.9 }
    });
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.008, 0.01, 0.014, 1],
      output: {
        toneMapping: TRACKBALL_POSTPROCESS_4_0.tonemapping.mode,
        exposure: TRACKBALL_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    const geometry = Geometry.litCube(1.15);
    const satelliteGeometry = Geometry.litCube(0.42);
    const material = new PBRMaterial({
      baseColor: [0.34, 0.58, 0.88, 1],
      roughness: 0.26,
      metallic: 0.42,
      environmentIntensity: 0.58
    });
    const copperAccentMaterial = new PBRMaterial({
      baseColor: [0.94, 0.56, 0.24, 1],
      roughness: 0.24,
      metallic: 0.64,
      environmentIntensity: 0.62
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
        controls.rotate(0.004, 0.0015);
        controls.roll(0.0025);
        const roll = controls.state.rotation.z;
        const result = renderer.render({
          collectedLights: lightingRig.collectedLights,
          environmentLighting: {
            color: [0.54, 0.64, 0.82],
            intensity: 1.28,
            proceduralMap: {
              skyColor: [0.58, 0.72, 0.96],
              horizonColor: [0.3, 0.38, 0.52],
              groundColor: [0.08, 0.1, 0.14],
              specularColor: [1, 0.96, 0.9],
              intensity: 1.25,
              specularIntensity: 1.35
            }
          },
          cameraPosition: [controls.state.target.x, controls.state.target.y, Math.max(2.7, controls.state.position.z)],
          cameraFrameBounds: { min: [-1.35, -1.15, -1.05], max: [1.35, 1.15, 1.05] },
          cameraFrameOptions: {
            yawRadians: controls.state.rotation.y,
            pitchRadians: controls.state.rotation.x,
            paddingRatio: 0.2
          },
          renderItems: [
            {
              geometry,
              material,
              modelMatrix: composeTransform(0, 0, 0, 1, 1, 1, roll * 0.35),
              label: "trackball-control-cube"
            },
            {
              geometry: satelliteGeometry,
              material: copperAccentMaterial,
              modelMatrix: composeTransform(-0.92, 0.42, 0.18, 1, 1, 1, -roll * 0.5),
              label: "trackball-accent-left"
            },
            {
              geometry: satelliteGeometry,
              material: copperAccentMaterial,
              modelMatrix: composeTransform(0.92, -0.42, -0.18, 1, 1, 1, roll * 0.5),
              label: "trackball-accent-right"
            }
          ],
          postprocess: TRACKBALL_POSTPROCESS_OPTIONS
        });
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.drawCalls,
          fps,
          rotationX: controls.state.rotation.x,
          rotationY: controls.state.rotation.y,
          rotationZ: controls.state.rotation.z,
          targetX: controls.state.target.x,
          targetY: controls.state.target.y,
          positionZ: controls.state.position.z,
          rotateEnabled: controls.enableRotate,
          panEnabled: controls.enablePan,
          zoomEnabled: controls.enableZoom,
          trackballRollApplied: Math.abs(controls.state.rotation.z) > 0.2
        });
        window.__a3dCurrentRoutesControlsTrackball = runtime;
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

function createRuntime(
  status: CurrentRoutesControlsTrackballRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesControlsTrackballRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesControlsTrackballRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    rotationX: patch.rotationX ?? 0,
    rotationY: patch.rotationY ?? 0,
    rotationZ: patch.rotationZ ?? 0,
    targetX: patch.targetX ?? 0,
    targetY: patch.targetY ?? 0,
    positionZ: patch.positionZ ?? 5,
    rotateEnabled: patch.rotateEnabled ?? true,
    panEnabled: patch.panEnabled ?? true,
    zoomEnabled: patch.zoomEnabled ?? true,
    trackballRollApplied: patch.trackballRollApplied ?? false,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesControlsTrackballRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>CurrentRoutes Controls Trackball</h1>
          <p>Public TrackballControls driving camera orbit, pan, dolly, and roll state.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("rotation x", runtime.rotationX.toFixed(3))}
        ${metric("rotation y", runtime.rotationY.toFixed(3))}
        ${metric("roll z", runtime.rotationZ.toFixed(3))}
        ${metric("target", `${runtime.targetX.toFixed(2)}, ${runtime.targetY.toFixed(2)}`)}
        ${metric("position z", runtime.positionZ.toFixed(2))}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Roll applied: ${runtime.trackballRollApplied ? "yes" : "no"}. Controls enabled: rotate ${runtime.rotateEnabled ? "yes" : "no"}, pan ${runtime.panEnabled ? "yes" : "no"}, zoom ${runtime.zoomEnabled ? "yes" : "no"}.`}</p>
    </section>
  `;
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

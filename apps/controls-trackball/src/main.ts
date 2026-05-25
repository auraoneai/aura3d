import { TrackballControls } from "@galileo3d/controls";
import { Geometry, PBRMaterial } from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";

declare global {
  interface Window {
    __g3dV8ControlsTrackball?: V8ControlsTrackballRuntime;
  }
}

interface V8ControlsTrackballRuntime {
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
  readonly renderer: "g3d-webgl2";
  readonly error?: string;
}

const APP_ID = "controls-trackball" as const;
const WIDTH = 1280;
const HEIGHT = 720;

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
    window.__g3dV8ControlsTrackball = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const controls = new TrackballControls();
    controls.rotate(0.35, -0.16);
    controls.pan(0.08, -0.04);
    controls.dolly(0.86);
    controls.roll(0.22);
    const renderer = await G3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.008, 0.01, 0.014, 1]
    });
    const geometry = Geometry.litCube(1.15);
    const material = new PBRMaterial({
      baseColor: [0.36, 0.52, 0.78, 1],
      roughness: 0.42,
      metallic: 0.08,
      environmentIntensity: 0.22
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
        const result = renderer.render({
          environmentLighting: {
            color: [0.44, 0.52, 0.68],
            intensity: 1.15
          },
          cameraPosition: [controls.state.target.x, controls.state.target.y, Math.max(2.7, controls.state.position.z)],
          cameraFrameBounds: { min: [-1.05, -1.05, -1.05], max: [1.05, 1.05, 1.05] },
          cameraFrameOptions: {
            yawRadians: controls.state.rotation.y,
            pitchRadians: controls.state.rotation.x,
            paddingRatio: 0.2
          },
          renderItems: [{
            geometry,
            material,
            label: "trackball-control-cube"
          }]
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
        window.__g3dV8ControlsTrackball = runtime;
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
  status: V8ControlsTrackballRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8ControlsTrackballRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): V8ControlsTrackballRuntime {
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
    renderer: "g3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8ControlsTrackballRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 Controls Trackball</h1>
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

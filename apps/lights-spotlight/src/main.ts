import { Scene, SpotLight } from "@galileo3d/scene";
import {
  Geometry,
  LightCollector,
  PBRMaterial
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";

declare global {
  interface Window {
    __g3dV8LightsSpotlight?: V8LightsSpotlightRuntime;
  }
}

interface V8LightsSpotlightRuntime {
  readonly appId: "lights-spotlight";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly collectedLightCount: number;
  readonly spotLightCount: number;
  readonly spotAngle: number;
  readonly spotPenumbra: number;
  readonly spotRange: number;
  readonly spotCastsShadow: boolean;
  readonly rendererShadowRequested: boolean;
  readonly firstLightKind: string;
  readonly elapsedMs: number;
  readonly renderer: "g3d-webgl2";
  readonly error?: string;
}

const APP_ID = "lights-spotlight" as const;
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
    window.__g3dV8LightsSpotlight = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const scene = createSpotScene();
    const spot = scene.collectLights().find((light): light is SpotLight => light instanceof SpotLight);
    if (!spot) throw new Error("Spot light scene did not contain a SpotLight.");
    const lights = new LightCollector().collect(scene);
    const renderer = await G3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.008, 0.01, 0.014, 1]
    });
    const geometry = Geometry.litCube(1.1);
    const material = new PBRMaterial({
      baseColor: [0.62, 0.64, 0.66, 1],
      roughness: 0.34,
      metallic: 0.04,
      environmentIntensity: 0
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
        const yaw = Math.sin(now / 900) * 0.2;
        const result = renderer.render({
          scene,
          collectedLights: lights,
          environmentLighting: false,
          cameraPosition: [0, 0, 4],
          cameraFrameBounds: { min: [-1.1, -1.1, -1.1], max: [1.1, 1.1, 1.1] },
          cameraFrameOptions: { yawRadians: yaw, pitchRadians: -0.08, paddingRatio: 0.22 },
          shadow: {
            enabled: true,
            light: spot,
            size: 256,
            strength: 0.28,
            bias: 0.0015,
            filter: "pcf"
          },
          renderItems: [{
            geometry,
            material,
            label: "spotlight-lit-cube"
          }]
        });
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.drawCalls,
          fps,
          collectedLightCount: lights.length,
          spotLightCount: lights.filter((light) => light.kind === "spot").length,
          spotAngle: spot.angle,
          spotPenumbra: spot.penumbra,
          spotRange: spot.range,
          spotCastsShadow: spot.castsShadow,
          rendererShadowRequested: true,
          firstLightKind: lights[0]?.kind ?? "none"
        });
        window.__g3dV8LightsSpotlight = runtime;
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

function createSpotScene(): Scene {
  const scene = new Scene();
  const spot = scene.createLight("spot", "v8-spotlight-key") as SpotLight;
  spot.intensity = 4.2;
  spot.color = [1, 0.72, 0.42];
  spot.transform.setPosition(0, 0, 2.4);
  spot.angle = Math.PI / 5;
  spot.penumbra = 0.32;
  spot.range = 6;
  spot.castsShadow = true;
  scene.root.addChild(spot);
  return scene;
}

function createRuntime(
  status: V8LightsSpotlightRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8LightsSpotlightRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): V8LightsSpotlightRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    collectedLightCount: patch.collectedLightCount ?? 0,
    spotLightCount: patch.spotLightCount ?? 0,
    spotAngle: patch.spotAngle ?? 0,
    spotPenumbra: patch.spotPenumbra ?? 0,
    spotRange: patch.spotRange ?? 0,
    spotCastsShadow: patch.spotCastsShadow ?? false,
    rendererShadowRequested: patch.rendererShadowRequested ?? false,
    firstLightKind: patch.firstLightKind ?? "none",
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "g3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8LightsSpotlightRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 Lights Spotlight</h1>
          <p>Scene SpotLight collected and rendered by G3D WebGL2 lighting.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("lights", runtime.collectedLightCount)}
        ${metric("spot lights", runtime.spotLightCount)}
        ${metric("angle", runtime.spotAngle.toFixed(3))}
        ${metric("penumbra", runtime.spotPenumbra.toFixed(2))}
        ${metric("range", runtime.spotRange.toFixed(1))}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `First light: ${escapeHtml(runtime.firstLightKind)}. Shadow request: ${runtime.rendererShadowRequested ? "yes" : "no"}.`}</p>
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

import { G3DRenderer } from "@galileo3d/engine/v9";
import { InputSnapshot, OrbitControls, createSceneCameraControlAdapter } from "@galileo3d/input";
import { Geometry, RenderDeviceError, UnlitMaterial } from "@galileo3d/rendering";
import { Renderable, Scene } from "@galileo3d/scene";

declare global {
  interface Window {
    __g3dV8OrbitControls?: V8OrbitControlsRuntime;
  }
}

interface V8OrbitControlsRuntime {
  readonly appId: "v8-controls-orbit";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly distance: number;
  readonly polar: number;
  readonly azimuth: number;
  readonly cameraPosition: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly rotateSamples: number;
  readonly panSamples: number;
  readonly wheelSamples: number;
  readonly renderer: "g3d-webgl2";
  readonly controls: "public-input-OrbitControls";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "v8-controls-orbit" as const;
const WIDTH = 1280;
const HEIGHT = 720;

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
    window.__g3dV8OrbitControls = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const scene = createScene();
    const camera = scene.collectCameras()[0];
    if (!camera) throw new Error("Orbit controls route requires a camera.");
    camera.setViewport({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    const controls = new OrbitControls(createSceneCameraControlAdapter(camera), {
      target: { x: 0, y: 0, z: -4.8 },
      distance: 5.4,
      minDistance: 2,
      maxDistance: 12,
      maxPolar: Math.PI - 0.001,
      rotateSpeed: 2 * Math.PI / HEIGHT,
      panSpeed: 0.0018,
      zoomSpeed: 1
    });
    const geometryLibrary = { "geometry:cube": Geometry.litCube(1) };
    const materialLibrary = {
      "material:amber": new UnlitMaterial({ color: [0.95, 0.58, 0.18, 1] }),
      "material:cyan": new UnlitMaterial({ color: [0.3, 0.82, 1, 1] }),
      "material:floor": new UnlitMaterial({ color: [0.18, 0.21, 0.25, 1] })
    };
    const renderer = await G3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.014, 0.017, 0.022, 1]
    });

    let frameCount = 0;
    let rotateSamples = 0;
    let panSamples = 0;
    let wheelSamples = 0;
    let pointer: { readonly x: number; readonly y: number; readonly button: number } | undefined;
    const buttonState = new Map<number, { down: boolean; pressed: boolean; released: boolean }>();

    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointer = { x: event.clientX, y: event.clientY, button: event.button };
      buttonState.set(event.button, { down: true, pressed: true, released: false });
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!pointer) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer = { x: event.clientX, y: event.clientY, button: pointer.button };
      const keys = new Set<string>();
      if (event.shiftKey) keys.add("ShiftLeft");
      controls.update(new InputSnapshot({ pointer: { deltaX: dx, deltaY: dy, buttons: new Map(buttonState) }, keys }));
      if (event.shiftKey || pointer.button === 2) panSamples += 1;
      else rotateSamples += 1;
    });
    const release = (event: PointerEvent): void => {
      buttonState.set(event.button, { down: false, pressed: false, released: true });
      pointer = undefined;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      controls.update(new InputSnapshot({ pointer: { wheelY: event.deltaY } }));
      wheelSamples += 1;
    }, { passive: false });

    const render = (): void => {
      try {
        frameCount += 1;
        scene.updateWorldTransforms();
        const diagnostics = renderer.render({
          scene,
          geometryLibrary,
          materialLibrary,
          cameraPolicy: "require",
          frustumCulling: true,
          postprocess: { fxaa: true }
        });
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          distance: controls.getDistance(),
          polar: controls.getPolarAngle(),
          azimuth: controls.getAzimuthalAngle(),
          cameraPosition: [...camera.transform.position] as [number, number, number],
          target: [controls.target.x, controls.target.y, controls.target.z],
          rotateSamples,
          panSamples,
          wheelSamples
        });
        window.__g3dV8OrbitControls = runtime;
        if (frameCount === 1 || frameCount % 15 === 0) publish();
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

function createScene(): Scene {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "orbit-camera", fovYRadians: 0.72, aspect: WIDTH / HEIGHT, near: 0.1, far: 40 });
  scene.root.addChild(camera);
  const floor = scene.createNode("orbit-floor");
  floor.transform.setPosition(0, -1.25, -5);
  floor.transform.setScale(5.8, 0.08, 3.6);
  scene.root.addChild(floor);
  scene.addRenderable(floor, new Renderable({ geometry: "geometry:cube", material: "material:floor" }));
  [
    ["orbit-cube-a", [-1.4, -0.25, -5.2], "material:amber"],
    ["orbit-cube-b", [0, 0.25, -4.7], "material:cyan"],
    ["orbit-cube-c", [1.35, -0.1, -5.5], "material:amber"]
  ].forEach(([name, position, material]) => {
    const node = scene.createNode(name as string);
    const [x, y, z] = position as [number, number, number];
    node.transform.setPosition(x, y, z);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:cube", material: material as string }));
  });
  return scene;
}

function createRuntime(
  startedAt: number,
  status: V8OrbitControlsRuntime["status"],
  patch: Partial<Omit<V8OrbitControlsRuntime, "appId" | "status" | "renderer" | "controls" | "elapsedMs">> = {}
): V8OrbitControlsRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    distance: patch.distance ?? 0,
    polar: patch.polar ?? 0,
    azimuth: patch.azimuth ?? 0,
    cameraPosition: patch.cameraPosition ?? [0, 0, 0],
    target: patch.target ?? [0, 0, 0],
    rotateSamples: patch.rotateSamples ?? 0,
    panSamples: patch.panSamples ?? 0,
    wheelSamples: patch.wheelSamples ?? 0,
    renderer: "g3d-webgl2",
    controls: "public-input-OrbitControls",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8OrbitControlsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Orbit Controls</h1>
        <p>Public input OrbitControls driving a G3D scene camera.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("Distance", runtime.distance.toFixed(3))}
      ${metric("Polar", runtime.polar.toFixed(3))}
      ${metric("Azimuth", runtime.azimuth.toFixed(3))}
      ${metric("Rotate samples", runtime.rotateSamples)}
      ${metric("Pan samples", runtime.panSamples)}
      ${metric("Wheel samples", runtime.wheelSamples)}
      ${metric("Controls", runtime.controls)}
      ${metric("Renderer", runtime.renderer)}
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

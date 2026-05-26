import { TransformControls } from "@aura3d/controls";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { Geometry, RenderDeviceError, UnlitMaterial } from "@aura3d/rendering";
import { Renderable, Scene, quatFromEuler } from "@aura3d/scene";

declare global {
  interface Window {
    __a3dV8TransformControls?: V8TransformControlsRuntime;
  }
}

interface V8TransformControlsRuntime {
  readonly appId: "controls-transform";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly mode: string;
  readonly attached: boolean;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly translateSamples: number;
  readonly rotateSamples: number;
  readonly scaleSamples: number;
  readonly renderer: "a3d-webgl2";
  readonly controls: "public-controls-TransformControls";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "controls-transform" as const;
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
    window.__a3dV8TransformControls = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const scene = createScene();
    const target = scene.findByName("transform-target")[0];
    const camera = scene.collectCameras()[0];
    if (!target || !camera) throw new Error("Transform controls route requires target and camera.");
    camera.setViewport({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    const object = {
      position: { x: 0, y: 0, z: -5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    const controls = new TransformControls();
    controls.attach(object);
    let translateSamples = 0;
    let rotateSamples = 0;
    let scaleSamples = 0;
    const applyMode = (mode: "translate" | "rotate" | "scale", delta: { x: number; y: number; z: number }): void => {
      controls.setMode(mode);
      controls.apply(delta);
      if (mode === "translate") translateSamples += 1;
      if (mode === "rotate") rotateSamples += 1;
      if (mode === "scale") scaleSamples += 1;
      syncTarget(target, object);
    };

    root.addEventListener("click", (event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement)) return;
      if (element.id === "translate-x") applyMode("translate", { x: 0.25, y: 0, z: 0 });
      if (element.id === "translate-y") applyMode("translate", { x: 0, y: 0.25, z: 0 });
      if (element.id === "rotate-y") applyMode("rotate", { x: 0, y: 0.25, z: 0 });
      if (element.id === "scale-up") applyMode("scale", { x: 0.15, y: 0.15, z: 0.15 });
    });

    const renderer = await A3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.014, 0.017, 0.022, 1]
    });
    const geometryLibrary = { "geometry:cube": Geometry.litCube(1) };
    const materialLibrary = {
      "material:target": new UnlitMaterial({ color: [0.95, 0.58, 0.18, 1] }),
      "material:floor": new UnlitMaterial({ color: [0.18, 0.21, 0.25, 1] })
    };

    const render = (): void => {
      try {
        const diagnostics = renderer.render({
          scene,
          geometryLibrary,
          materialLibrary,
          cameraPolicy: "require",
          frustumCulling: true,
          postprocess: { fxaa: true }
        });
        runtime = createRuntime(startedAt, runtime.frameCount === 0 ? "ready" : "running", {
          frameCount: runtime.frameCount + 1,
          drawCalls: diagnostics.drawCalls,
          mode: controls.mode,
          attached: controls.object !== null,
          position: [object.position.x, object.position.y, object.position.z],
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
          translateSamples,
          rotateSamples,
          scaleSamples
        });
        window.__a3dV8TransformControls = runtime;
        if (runtime.frameCount === 1 || runtime.frameCount % 15 === 0) publish();
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
  const camera = scene.createPerspectiveCamera({ name: "transform-camera", fovYRadians: 0.72, aspect: WIDTH / HEIGHT, near: 0.1, far: 40 });
  camera.transform.setPosition(0, 1.4, 2.8);
  camera.transform.setRotation(...quatFromEuler(-0.22, 0, 0));
  scene.root.addChild(camera);
  const floor = scene.createNode("transform-floor");
  floor.transform.setPosition(0, -1.05, -5);
  floor.transform.setScale(5.2, 0.08, 3.2);
  scene.root.addChild(floor);
  scene.addRenderable(floor, new Renderable({ geometry: "geometry:cube", material: "material:floor" }));
  const target = scene.createNode("transform-target");
  target.transform.setPosition(0, 0, -5);
  scene.root.addChild(target);
  scene.addRenderable(target, new Renderable({ geometry: "geometry:cube", material: "material:target" }));
  return scene;
}

function syncTarget(target: ReturnType<Scene["createNode"]>, object: {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number };
  readonly scale: { readonly x: number; readonly y: number; readonly z: number };
}): void {
  target.transform.setPosition(object.position.x, object.position.y, object.position.z);
  target.transform.setRotation(...quatFromEuler(object.rotation.x, object.rotation.y, object.rotation.z));
  target.transform.setScale(object.scale.x, object.scale.y, object.scale.z);
}

function createRuntime(
  startedAt: number,
  status: V8TransformControlsRuntime["status"],
  patch: Partial<Omit<V8TransformControlsRuntime, "appId" | "status" | "renderer" | "controls" | "elapsedMs">> = {}
): V8TransformControlsRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    mode: patch.mode ?? "translate",
    attached: patch.attached ?? false,
    position: patch.position ?? [0, 0, -5],
    rotation: patch.rotation ?? [0, 0, 0],
    scale: patch.scale ?? [1, 1, 1],
    translateSamples: patch.translateSamples ?? 0,
    rotateSamples: patch.rotateSamples ?? 0,
    scaleSamples: patch.scaleSamples ?? 0,
    renderer: "a3d-webgl2",
    controls: "public-controls-TransformControls",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8TransformControlsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Transform Controls</h1>
        <p>Public TransformControls applying translate, rotate, and scale to a A3D scene object.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="button-row">
      <button id="translate-x" type="button">Translate X</button>
      <button id="translate-y" type="button">Translate Y</button>
      <button id="rotate-y" type="button">Rotate Y</button>
      <button id="scale-up" type="button">Scale Up</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("Mode", runtime.mode)}
      ${metric("Attached", runtime.attached ? "yes" : "no")}
      ${metric("Position", runtime.position.map((value) => value.toFixed(2)).join(", "))}
      ${metric("Rotation", runtime.rotation.map((value) => value.toFixed(2)).join(", "))}
      ${metric("Scale", runtime.scale.map((value) => value.toFixed(2)).join(", "))}
      ${metric("Translate samples", runtime.translateSamples)}
      ${metric("Rotate samples", runtime.rotateSamples)}
      ${metric("Scale samples", runtime.scaleSamples)}
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

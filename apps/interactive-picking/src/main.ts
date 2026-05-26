import { pickingRayFromCamera } from "@aura3d/input";
import { Ray, Vector3 } from "@aura3d/math";
import {
  Geometry,
  RenderDeviceError,
  UnlitMaterial,
  pickSceneRenderableHits,
  pickSceneRenderables
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { Renderable, Scene, type SceneNode } from "@aura3d/scene";

declare global {
  interface Window {
    __a3dV8InteractivePicking?: V8InteractivePickingRuntime;
  }
}

interface V8InteractivePickingRuntime {
  readonly appId: "interactive-picking";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly cubeCount: number;
  readonly pointCount: number;
  readonly cubePickHits: number;
  readonly pointPickHits: number;
  readonly pointerPickHits: number;
  readonly nearestCubeId: string;
  readonly nearestPointIndex: number;
  readonly lastPointerHit: string;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "interactive-picking" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const CUBE_POSITIONS = [
  [-1.8, 0.7, -5.2],
  [-0.75, 0.2, -4.45],
  [0, 0.62, -5.9],
  [0.82, -0.1, -4.8],
  [1.72, 0.48, -5.35],
  [-1.22, -0.82, -5.6],
  [0.34, -0.94, -4.9],
  [1.46, -0.78, -5.95]
] as const;
const POINT_POSITIONS = [
  [-2.28, -1.24, -4.6],
  [-1.62, 1.36, -5.15],
  [-0.32, -1.38, -4.3],
  [0.62, 1.28, -4.72],
  [1.26, 1.14, -5.44],
  [2.06, -1.22, -4.95]
] as const;

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
    window.__a3dV8InteractivePicking = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const { scene, cubeNodes } = createScene();
    const camera = scene.collectCameras()[0];
    if (!camera) throw new Error("Interactive picking route requires a camera.");
    camera.setViewport({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    const geometryLibrary = {
      "geometry:cube": Geometry.cube(0.46),
      "geometry:points": Geometry.points(POINT_POSITIONS)
    };
    const materialLibrary = {
      "material:amber": new UnlitMaterial({ color: [0.95, 0.58, 0.18, 1] }),
      "material:cyan": new UnlitMaterial({ color: [0.3, 0.82, 1, 1] }),
      "material:point": new UnlitMaterial({ color: [0.88, 0.96, 0.62, 1] })
    };
    const renderer = await A3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.014, 0.017, 0.022, 1]
    });

    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let pointerPickHits = 0;
    let lastPointerHit = "none";
    let lastUi = 0;
    let lastDiagnosticPick = 0;
    let cachedCubePickHits = 0;
    let cachedPointPickHits = 0;
    let cachedNearestCubeId = "none";
    let cachedNearestPointIndex = -1;
    const centerCubeRay = new Ray(new Vector3(0, 0, 0), new Vector3(-0.75, 0.2, -4.45));
    const pointRay = new Ray(new Vector3(0, 0, 0), new Vector3(0.62, 1.28, -4.72));

    canvas.addEventListener("pointermove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const ray = pickingRayFromCamera(camera, ((event.clientX - rect.left) / Math.max(1, rect.width)) * WIDTH, ((event.clientY - rect.top) / Math.max(1, rect.height)) * HEIGHT, camera.viewport);
      const hit = pickSceneRenderables({ scene, geometryLibrary }, ray, { pointRadius: 0.18 });
      if (hit) {
        pointerPickHits += 1;
        lastPointerHit = hit.pointIndex === undefined ? hit.node.name : `${hit.node.name}#${hit.pointIndex}`;
      }
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

        animateCubes(cubeNodes, now);
        if (frameCount === 1 || now - lastDiagnosticPick > 180) {
          const cubeHit = pickSceneRenderables({ scene, geometryLibrary }, centerCubeRay);
          const pointHits = pickSceneRenderableHits({ scene, geometryLibrary }, pointRay, { pointRadius: 0.18 });
          cachedCubePickHits = cubeHit ? 1 : 0;
          cachedPointPickHits = pointHits.length;
          cachedNearestCubeId = cubeHit?.node.name ?? "miss";
          cachedNearestPointIndex = pointHits[0]?.pointIndex ?? -1;
          lastDiagnosticPick = now;
        }
        const diagnostics = renderer.render({
          scene,
          geometryLibrary,
          materialLibrary,
          cameraPolicy: "require",
          frustumCulling: true,
          postprocess: false
        });

        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          cubePickHits: cachedCubePickHits,
          pointPickHits: cachedPointPickHits,
          pointerPickHits,
          nearestCubeId: cachedNearestCubeId,
          nearestPointIndex: cachedNearestPointIndex,
          lastPointerHit
        });
        window.__a3dV8InteractivePicking = runtime;
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

function createScene(): { readonly scene: Scene; readonly cubeNodes: readonly SceneNode[] } {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "main-camera", fovYRadians: 0.72, aspect: WIDTH / HEIGHT, near: 0.1, far: 30 });
  scene.root.addChild(camera);
  const cubeNodes: SceneNode[] = [];
  CUBE_POSITIONS.forEach((position, index) => {
    const node = scene.createNode(`cube-${index + 1}`);
    node.transform.setPosition(position[0], position[1], position[2]);
    scene.root.addChild(node);
    cubeNodes.push(node);
    scene.addRenderable(node, new Renderable({
      geometry: "geometry:cube",
      material: index % 2 === 0 ? "material:amber" : "material:cyan"
    }));
  });
  const points = scene.createNode("point-cloud");
  scene.root.addChild(points);
  scene.addRenderable(points, new Renderable({ geometry: "geometry:points", material: "material:point" }));
  return { scene, cubeNodes };
}

function animateCubes(cubeNodes: readonly SceneNode[], now: number): void {
  for (let index = 0; index < CUBE_POSITIONS.length; index += 1) {
    const position = CUBE_POSITIONS[index]!;
    const node = cubeNodes[index];
    if (!node) continue;
    if (!position) continue;
    node.transform.setPosition(position[0], position[1] + Math.sin(now / 700 + index) * 0.045, position[2]);
  }
}

function createRuntime(
  startedAt: number,
  status: V8InteractivePickingRuntime["status"],
  patch: Partial<Omit<V8InteractivePickingRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "cubeCount" | "pointCount">> = {}
): V8InteractivePickingRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    cubeCount: CUBE_POSITIONS.length,
    pointCount: POINT_POSITIONS.length,
    cubePickHits: patch.cubePickHits ?? 0,
    pointPickHits: patch.pointPickHits ?? 0,
    pointerPickHits: patch.pointerPickHits ?? 0,
    nearestCubeId: patch.nearestCubeId ?? "none",
    nearestPointIndex: patch.nearestPointIndex ?? -1,
    lastPointerHit: patch.lastPointerHit ?? "none",
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8InteractivePickingRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Interactive Picking</h1>
        <p>Scene ray picking for transformed cubes and thresholded point clouds.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Cubes", runtime.cubeCount)}
      ${metric("Points", runtime.pointCount)}
      ${metric("Cube hits", runtime.cubePickHits)}
      ${metric("Point hits", runtime.pointPickHits)}
      ${metric("Nearest cube", runtime.nearestCubeId)}
      ${metric("Nearest point", runtime.nearestPointIndex)}
      ${metric("Pointer hits", runtime.pointerPickHits)}
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

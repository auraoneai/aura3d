import { pickingRayFromCamera } from "@aura3d/input";
import { Ray, Vector3 } from "@aura3d/math";
import {
  Geometry,
  PBRMaterial,
  RenderDeviceError,
  Renderer,
  UnlitMaterial,
  createLightingRig,
  pickSceneRenderableHits,
  pickSceneRenderables,
  type RenderMaterial,
  type RendererPostProcessOptions
} from "@aura3d/rendering";
import { Renderable, Scene, type SceneNode } from "@aura3d/scene";

declare global {
  interface Window {
    __a3dCurrentRoutesInteractivePicking?: CurrentRoutesInteractivePickingRuntime;
  }
}

interface CurrentRoutesInteractivePickingRuntime {
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

const PICKING_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.15 },
  bloom: { enabled: true, intensity: 0.2, threshold: 0.8 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.22 }
} as const;

const PICKING_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: PICKING_POSTPROCESS_4_0.tonemapping.mode,
    exposure: PICKING_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: PICKING_POSTPROCESS_4_0.bloom.intensity,
    threshold: PICKING_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.06,
    saturation: 1.05,
    vignette: PICKING_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: PICKING_POSTPROCESS_4_0.fxaa.enabled
};

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
    window.__a3dCurrentRoutesInteractivePicking = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const { scene, cubeNodes } = createScene();
    const camera = scene.collectCameras()[0];
    if (!camera) throw new Error("Interactive picking route requires a camera.");
    camera.setViewport({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.35,
      shadows: false,
      subject: { height: 2.6, width: 4.2, floorY: -1.4 }
    });
    const geometryLibrary = {
      "geometry:cube": Geometry.litCube(0.46),
      "geometry:points": Geometry.points(POINT_POSITIONS)
    };
    const amberMaterial = new PBRMaterial({
      baseColor: [0.96, 0.58, 0.18, 1],
      metallic: 0.34,
      roughness: 0.28,
      environmentIntensity: 0.58,
      emissiveColor: [0.18, 0.08, 0.01],
      emissiveStrength: 0.32
    });
    const cyanMaterial = new PBRMaterial({
      baseColor: [0.24, 0.8, 1, 1],
      metallic: 0.28,
      roughness: 0.26,
      environmentIntensity: 0.6,
      emissiveColor: [0.02, 0.14, 0.22],
      emissiveStrength: 0.32
    });
    const highlightedAmberMaterial = new PBRMaterial({
      baseColor: [1, 0.78, 0.32, 1],
      metallic: 0.42,
      roughness: 0.18,
      environmentIntensity: 0.72,
      emissiveColor: [1, 0.64, 0.18],
      emissiveStrength: 1.25
    });
    const highlightedCyanMaterial = new PBRMaterial({
      baseColor: [0.48, 0.92, 1, 1],
      metallic: 0.38,
      roughness: 0.18,
      environmentIntensity: 0.72,
      emissiveColor: [0.22, 0.84, 1],
      emissiveStrength: 1.25
    });
    const pointMaterial = new UnlitMaterial({ color: [0.92, 0.98, 0.68, 1] });
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.014, 0.017, 0.022, 1],
      output: {
        toneMapping: PICKING_POSTPROCESS_4_0.tonemapping.mode,
        exposure: PICKING_POSTPROCESS_4_0.tonemapping.exposure
      }
    });

    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let pointerPickHits = 0;
    let lastPointerHit = "none";
    let hoveredCubeId: string | null = null;
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
        hoveredCubeId = hit.pointIndex === undefined ? hit.node.name : null;
        lastPointerHit = hit.pointIndex === undefined ? hit.node.name : `${hit.node.name}#${hit.pointIndex}`;
      } else {
        hoveredCubeId = null;
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
        const activeHighlightId = hoveredCubeId ?? cachedNearestCubeId;
        const materialLibrary: Record<string, RenderMaterial> = {
          "material:amber": amberMaterial,
          "material:cyan": cyanMaterial,
          "material:point": pointMaterial
        };
        for (let index = 0; index < CUBE_POSITIONS.length; index += 1) {
          const cubeName = `cube-${index + 1}`;
          const isAmber = index % 2 === 0;
          const isHighlighted = cubeName === activeHighlightId;
          materialLibrary[`material:${cubeName}`] = isHighlighted
            ? (isAmber ? highlightedAmberMaterial : highlightedCyanMaterial)
            : (isAmber ? amberMaterial : cyanMaterial);
        }
        const diagnostics = renderer.render({
          scene,
          geometryLibrary,
          materialLibrary,
          collectedLights: lightingRig.collectedLights,
          environmentLighting: {
            color: [0.56, 0.66, 0.84],
            intensity: 1.25,
            proceduralMap: {
              skyColor: [0.58, 0.72, 0.96],
              horizonColor: [0.3, 0.38, 0.52],
              groundColor: [0.08, 0.1, 0.14],
              specularColor: [1, 0.96, 0.9],
              intensity: 1.2,
              specularIntensity: 1.32
            }
          },
          cameraPolicy: "require",
          frustumCulling: true,
          postprocess: PICKING_POSTPROCESS_OPTIONS
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
        window.__a3dCurrentRoutesInteractivePicking = runtime;
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
      material: `material:cube-${index + 1}`
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
  status: CurrentRoutesInteractivePickingRuntime["status"],
  patch: Partial<Omit<CurrentRoutesInteractivePickingRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "cubeCount" | "pointCount">> = {}
): CurrentRoutesInteractivePickingRuntime {
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

function renderUi(root: HTMLElement, runtime: CurrentRoutesInteractivePickingRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>Aura3D 4.0 · Interactive Ray Picking</h1>
        <p>Scene ray picking for transformed 3D cubes and thresholded point clouds.</p>
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

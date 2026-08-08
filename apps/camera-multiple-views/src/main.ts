import { Geometry, PBRMaterial, type RenderItem } from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dCurrentRoutesCameraMultipleViews?: CurrentRoutesCameraMultipleViewsRuntime;
  }
}

interface CurrentRoutesCameraMultipleViewsRuntime {
  readonly appId: "camera-multiple-views";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly elementCount: number;
  readonly viewCount: number;
  readonly cameraCount: number;
  readonly sharedSceneGeometry: boolean;
  readonly distinctCameraViews: boolean;
  readonly viewLabels: readonly string[];
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

type ViewLabel = "hero" | "top" | "detail";

interface ViewRuntime {
  readonly label: ViewLabel;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: A3DRenderer;
  readonly width: number;
  readonly height: number;
  readonly cameraPosition: readonly [number, number, number];
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly paddingRatio: number;
}

const APP_ID = "camera-multiple-views" as const;
const VIEW_LABELS: readonly ViewLabel[] = ["hero", "top", "detail"];

async function run(): Promise<void> {
  const root = document.getElementById("app");
  if (!(root instanceof HTMLElement)) {
    throw new Error(`${APP_ID} requires #app.`);
  }

  const startedAt = performance.now();
  let runtime = createRuntime("ready", "Ready", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesCameraMultipleViews = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const viewports = await createViewports();
    const renderItemSets = viewports.map(() => createSharedRenderItems());

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

        let drawCalls = 0;
        for (let index = 0; index < viewports.length; index += 1) {
          const viewport = viewports[index]!;
          const animatedItems = animateSharedItems(renderItemSets[index]!, now);
          const result = viewport.renderer.render({
            environmentLighting: {
              color: [0.56, 0.62, 0.7],
              intensity: 1.1
            },
            cameraPosition: viewport.cameraPosition,
            cameraFrameBounds: { min: [-2.2, -1.2, -1.4], max: [2.2, 1.4, 1.4] },
            cameraFrameOptions: {
              yawRadians: viewport.yawRadians + Math.sin(now / 1400) * 0.04,
              pitchRadians: viewport.pitchRadians,
              paddingRatio: viewport.paddingRatio
            },
            renderItems: animatedItems
          });
          drawCalls += result.drawCalls;
        }

        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls,
          fps,
          elementCount: viewports.length,
          viewCount: viewports.length,
          cameraCount: viewports.length,
          sharedSceneGeometry: true,
          distinctCameraViews: true,
          viewLabels: viewports.map((viewport) => viewport.label)
        });
        window.__a3dCurrentRoutesCameraMultipleViews = runtime;
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

async function createViewports(): Promise<readonly ViewRuntime[]> {
  const configs: readonly Omit<ViewRuntime, "canvas" | "renderer">[] = [
    {
      label: "hero",
      width: 1280,
      height: 720,
      cameraPosition: [0, 0, 5.2],
      yawRadians: -0.32,
      pitchRadians: -0.12,
      paddingRatio: 0.18
    },
    {
      label: "top",
      width: 640,
      height: 360,
      cameraPosition: [0, 2.4, 5.4],
      yawRadians: 0.04,
      pitchRadians: -0.82,
      paddingRatio: 0.2
    },
    {
      label: "detail",
      width: 640,
      height: 360,
      cameraPosition: [0.8, 0.2, 4.1],
      yawRadians: 0.58,
      pitchRadians: -0.08,
      paddingRatio: 0.3
    }
  ];

  const viewports: ViewRuntime[] = [];
  for (const config of configs) {
    const canvas = document.getElementById(`view-${config.label}`);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`${APP_ID} missing canvas#view-${config.label}.`);
    }
    canvas.width = config.width;
    canvas.height = config.height;
    const renderer = await A3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: config.width,
      height: config.height,
      clearColor: [0.026, 0.032, 0.042, 1]
    });
    viewports.push({ ...config, canvas, renderer });
  }
  return viewports;
}

function createSharedRenderItems(): readonly RenderItem[] {
  const sharedCube = Geometry.litCube(1);
  const floor = Geometry.litCube(1);
  const gold = new PBRMaterial({
    baseColor: [0.76, 0.54, 0.24, 1],
    metallic: 0.18,
    roughness: 0.42,
    environmentIntensity: 0.2
  });
  const blue = new PBRMaterial({
    baseColor: [0.2, 0.5, 0.78, 1],
    metallic: 0.04,
    roughness: 0.36,
    environmentIntensity: 0.24
  });
  const floorMaterial = new PBRMaterial({
    baseColor: [0.72, 0.76, 0.78, 1],
    metallic: 0,
    roughness: 0.68,
    environmentIntensity: 0.12
  });

  return [
    {
      geometry: sharedCube,
      material: gold,
      label: "shared-scene-left",
      modelMatrix: composeMatrix(-1.1, 0.16, 0, 0.82, 1.28, 0.82, -0.18)
    },
    {
      geometry: sharedCube,
      material: blue,
      label: "shared-scene-center",
      modelMatrix: composeMatrix(0.15, 0.42, -0.12, 0.72, 1.8, 0.72, 0.2)
    },
    {
      geometry: sharedCube,
      material: gold,
      label: "shared-scene-right",
      modelMatrix: composeMatrix(1.26, 0.1, 0.2, 0.72, 1.05, 0.72, 0.52)
    },
    {
      geometry: floor,
      material: floorMaterial,
      label: "shared-scene-floor",
      includeInAutoFrame: false,
      modelMatrix: composeMatrix(0, -0.55, 0, 5.4, 0.08, 3.2, 0)
    }
  ];
}

function animateSharedItems(items: readonly RenderItem[], now: number): readonly RenderItem[] {
  const t = now / 1000;
  return items.map((item, index) => {
    if (index === 3) return item;
    const x = index === 0 ? -1.1 : index === 1 ? 0.15 : 1.26;
    const y = index === 1 ? 0.42 : index === 0 ? 0.16 : 0.1;
    const z = index === 2 ? 0.2 : index === 1 ? -0.12 : 0;
    const sx = index === 1 ? 0.72 : index === 0 ? 0.82 : 0.72;
    const sy = index === 1 ? 1.8 : index === 0 ? 1.28 : 1.05;
    const sz = sx;
    return {
      ...item,
      modelMatrix: composeMatrix(x, y + Math.sin(t * 1.6 + index) * 0.05, z, sx, sy, sz, t * 0.35 + index * 0.6)
    };
  });
}

function composeMatrix(
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number
): Float32Array {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    tx, ty, tz, 1
  ]);
}

function createRuntime(
  status: CurrentRoutesCameraMultipleViewsRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesCameraMultipleViewsRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesCameraMultipleViewsRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    elementCount: patch.elementCount ?? 3,
    viewCount: patch.viewCount ?? 3,
    cameraCount: patch.cameraCount ?? 3,
    sharedSceneGeometry: patch.sharedSceneGeometry ?? false,
    distinctCameraViews: patch.distinctCameraViews ?? false,
    viewLabels: patch.viewLabels ?? VIEW_LABELS,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesCameraMultipleViewsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>CurrentRoutes Camera Multiple Views</h1>
          <p>Three independent WebGL elements render one shared A3D scene definition through distinct camera views.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("elements", runtime.elementCount)}
        ${metric("views", runtime.viewCount)}
        ${metric("cameras", runtime.cameraCount)}
        ${metric("shared geometry", runtime.sharedSceneGeometry ? "yes" : "no")}
        ${metric("labels", runtime.viewLabels.join(" / "))}
      </div>
      <p>${runtime.error ? escapeHtml(runtime.error) : `Distinct camera views: ${runtime.distinctCameraViews ? "yes" : "no"}. Renderer: ${runtime.renderer}.`}</p>
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

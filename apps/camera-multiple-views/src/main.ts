import {
  Geometry,
  PBRMaterial,
  Renderer,
  createLightingRig,
  type RenderItem,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

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
  readonly renderer: Renderer;
  readonly width: number;
  readonly height: number;
  readonly cameraPosition: readonly [number, number, number];
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly paddingRatio: number;
}

const APP_ID = "camera-multiple-views" as const;
const VIEW_LABELS: readonly ViewLabel[] = ["hero", "top", "detail"];

const MULTI_VIEW_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.14 },
  bloom: { enabled: true, intensity: 0.16, threshold: 0.82 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.18 }
} as const;

const MULTI_VIEW_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: MULTI_VIEW_POSTPROCESS_4_0.tonemapping.mode,
    exposure: MULTI_VIEW_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: MULTI_VIEW_POSTPROCESS_4_0.bloom.intensity,
    threshold: MULTI_VIEW_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.06,
    saturation: 1.05,
    vignette: MULTI_VIEW_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: MULTI_VIEW_POSTPROCESS_4_0.fxaa.enabled
};

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
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.32,
      shadows: false,
      subject: { height: 2.0, width: 3.4, floorY: -0.55 }
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

        let drawCalls = 0;
        for (let index = 0; index < viewports.length; index += 1) {
          const viewport = viewports[index]!;
          const animatedItems = animateSharedItems(renderItemSets[index]!, now);
          const result = viewport.renderer.render({
            collectedLights: lightingRig.collectedLights,
            environmentLighting: {
              color: [0.6, 0.68, 0.84],
              intensity: 1.26,
              proceduralMap: {
                skyColor: [0.6, 0.74, 0.96],
                horizonColor: [0.32, 0.4, 0.54],
                groundColor: [0.09, 0.11, 0.16],
                specularColor: [1, 0.96, 0.9],
                intensity: 1.24,
                specularIntensity: 1.34
              }
            },
            cameraPosition: viewport.cameraPosition,
            cameraFrameBounds: { min: [-2.2, -1.2, -1.4], max: [2.2, 1.4, 1.4] },
            cameraFrameOptions: {
              yawRadians: viewport.yawRadians + Math.sin(now / 1400) * 0.04,
              pitchRadians: viewport.pitchRadians,
              paddingRatio: viewport.paddingRatio
            },
            renderItems: animatedItems,
            postprocess: MULTI_VIEW_POSTPROCESS_OPTIONS
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
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: config.width,
      height: config.height,
      clearColor: [0.02, 0.026, 0.036, 1],
      output: {
        toneMapping: MULTI_VIEW_POSTPROCESS_4_0.tonemapping.mode,
        exposure: MULTI_VIEW_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    viewports.push({ ...config, canvas, renderer });
  }
  return viewports;
}

function createSharedRenderItems(): readonly RenderItem[] {
  const sharedCube = Geometry.litCube(1);
  const floor = Geometry.litCube(1);
  const gold = new PBRMaterial({
    baseColor: [0.9, 0.64, 0.26, 1],
    metallic: 0.62,
    roughness: 0.24,
    environmentIntensity: 0.6,
    emissiveColor: [0.14, 0.08, 0.02],
    emissiveStrength: 0.24
  });
  const blue = new PBRMaterial({
    baseColor: [0.24, 0.58, 0.92, 1],
    metallic: 0.34,
    roughness: 0.22,
    environmentIntensity: 0.64,
    emissiveColor: [0.04, 0.12, 0.24],
    emissiveStrength: 0.28
  });
  const copper = new PBRMaterial({
    baseColor: [0.94, 0.48, 0.24, 1],
    metallic: 0.54,
    roughness: 0.26,
    environmentIntensity: 0.58,
    emissiveColor: [0.16, 0.06, 0.02],
    emissiveStrength: 0.22
  });
  const floorMaterial = new PBRMaterial({
    baseColor: [0.26, 0.31, 0.38, 1],
    metallic: 0.14,
    roughness: 0.44,
    environmentIntensity: 0.38
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
      material: copper,
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
          <h1>Aura3D 4.0 · Multi-Viewport Camera Rig</h1>
          <p>Three independent WebGL elements render one shared Aura3D 4.0 scene definition through distinct camera views.</p>
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

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
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.2, threshold: 0.8 },
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
    contrast: 1.08,
    saturation: 1.06,
    vignette: MULTI_VIEW_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: MULTI_VIEW_POSTPROCESS_4_0.fxaa.enabled
};

interface SharedSculptureResources {
  readonly plinthBase: Geometry;
  readonly plinthDais: Geometry;
  readonly baseRing: Geometry;
  readonly centerColumn: Geometry;
  readonly coreSphere: Geometry;
  readonly innerGimbal: Geometry;
  readonly midGimbal: Geometry;
  readonly outerGimbal: Geometry;
  readonly sideMonolith: Geometry;
  readonly satelliteOrb: Geometry;
  readonly plinthMaterial: PBRMaterial;
  readonly daisMaterial: PBRMaterial;
  readonly goldMaterial: PBRMaterial;
  readonly cyanMaterial: PBRMaterial;
  readonly copperMaterial: PBRMaterial;
  readonly monolithMaterial: PBRMaterial;
}

function createSharedSculptureResources(): SharedSculptureResources {
  return {
    plinthBase: Geometry.cylinder({ radius: 2.25, height: 0.16, segments: 48 }),
    plinthDais: Geometry.cylinder({ radius: 1.62, height: 0.12, segments: 48 }),
    baseRing: Geometry.torus({ radius: 1.88, tube: 0.032, radialSegments: 64, tubularSegments: 16 }),
    centerColumn: Geometry.cylinder({ radius: 0.24, height: 0.72, segments: 32 }),
    coreSphere: Geometry.uvSphere(0.4, 36, 24),
    innerGimbal: Geometry.torus({ radius: 0.72, tube: 0.038, radialSegments: 56, tubularSegments: 16 }),
    midGimbal: Geometry.torus({ radius: 1.02, tube: 0.042, radialSegments: 64, tubularSegments: 18 }),
    outerGimbal: Geometry.torus({ radius: 1.32, tube: 0.046, radialSegments: 64, tubularSegments: 18 }),
    sideMonolith: Geometry.litCube(1),
    satelliteOrb: Geometry.uvSphere(0.16, 24, 16),
    plinthMaterial: new PBRMaterial({
      baseColor: [0.1, 0.13, 0.19, 1],
      metallic: 0.44,
      roughness: 0.34,
      environmentIntensity: 0.68
    }),
    daisMaterial: new PBRMaterial({
      baseColor: [0.18, 0.22, 0.3, 1],
      metallic: 0.62,
      roughness: 0.24,
      environmentIntensity: 0.78
    }),
    goldMaterial: new PBRMaterial({
      baseColor: [0.96, 0.76, 0.28, 1],
      metallic: 0.88,
      roughness: 0.16,
      environmentIntensity: 0.94,
      emissiveColor: [0.24, 0.15, 0.03],
      emissiveStrength: 0.36
    }),
    cyanMaterial: new PBRMaterial({
      baseColor: [0.24, 0.84, 1.0, 1],
      metallic: 0.78,
      roughness: 0.16,
      environmentIntensity: 0.92,
      emissiveColor: [0.05, 0.34, 0.52],
      emissiveStrength: 0.48
    }),
    copperMaterial: new PBRMaterial({
      baseColor: [0.94, 0.52, 0.24, 1],
      metallic: 0.82,
      roughness: 0.2,
      environmentIntensity: 0.88,
      emissiveColor: [0.22, 0.08, 0.02],
      emissiveStrength: 0.3
    }),
    monolithMaterial: new PBRMaterial({
      baseColor: [0.68, 0.76, 0.88, 1],
      metallic: 0.72,
      roughness: 0.22,
      environmentIntensity: 0.84
    })
  };
}

function buildAnimatedSculptureItems(res: SharedSculptureResources, now: number): readonly RenderItem[] {
  const t = now / 1000;
  const centerY = 0.38;
  return [
    {
      geometry: res.plinthBase,
      material: res.plinthMaterial,
      label: "shared-scene-floor",
      includeInAutoFrame: false,
      modelMatrix: composeEulerTransform(0, -0.62, 0, 1, 1, 1, 0, 0, 0)
    },
    {
      geometry: res.plinthDais,
      material: res.daisMaterial,
      label: "shared-scene-dais",
      modelMatrix: composeEulerTransform(0, -0.5, 0, 1, 1, 1, 0, t * 0.25, 0)
    },
    {
      geometry: res.baseRing,
      material: res.goldMaterial,
      label: "shared-scene-base-ring",
      modelMatrix: composeEulerTransform(0, -0.44, 0, 1, 1, 1, Math.PI * 0.5, -t * 0.35, 0)
    },
    {
      geometry: res.centerColumn,
      material: res.daisMaterial,
      label: "shared-scene-center-column",
      modelMatrix: composeEulerTransform(0, -0.22, 0, 1, 1, 1, 0, t * 0.4, 0)
    },
    {
      geometry: res.coreSphere,
      material: res.cyanMaterial,
      label: "shared-scene-center",
      modelMatrix: composeEulerTransform(0, centerY + Math.sin(t * 2.0) * 0.04, 0, 1, 1, 1, 0, t * 0.9, 0)
    },
    {
      geometry: res.innerGimbal,
      material: res.goldMaterial,
      label: "shared-scene-inner-gimbal",
      modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, t * 1.1, t * 0.7, 0.35)
    },
    {
      geometry: res.midGimbal,
      material: res.cyanMaterial,
      label: "shared-scene-mid-gimbal",
      modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, 0.58 + Math.sin(t * 0.8) * 0.28, -t * 0.85, -0.28)
    },
    {
      geometry: res.outerGimbal,
      material: res.copperMaterial,
      label: "shared-scene-outer-gimbal",
      modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, -0.42, t * 0.52, 0.22 + Math.cos(t * 0.6) * 0.2)
    },
    {
      geometry: res.sideMonolith,
      material: res.monolithMaterial,
      label: "shared-scene-left",
      modelMatrix: composeEulerTransform(-1.28, -0.02, 0.18, 0.46, 0.96, 0.46, 0, t * 0.35, 0)
    },
    {
      geometry: res.sideMonolith,
      material: res.copperMaterial,
      label: "shared-scene-right",
      modelMatrix: composeEulerTransform(1.28, -0.06, -0.18, 0.46, 0.88, 0.46, 0, -t * 0.35, 0)
    },
    {
      geometry: res.satelliteOrb,
      material: res.goldMaterial,
      label: "shared-scene-left-orb",
      modelMatrix: composeEulerTransform(-1.28, 0.64 + Math.sin(t * 2.2) * 0.05, 0.18, 1, 1, 1, 0, t, 0)
    },
    {
      geometry: res.satelliteOrb,
      material: res.cyanMaterial,
      label: "shared-scene-right-orb",
      modelMatrix: composeEulerTransform(1.28, 0.56 + Math.cos(t * 2.2) * 0.05, -0.18, 1, 1, 1, 0, -t, 0)
    }
  ];
}

function injectHudStyles(): void {
  if (document.getElementById("aura3d-multi-views-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-multi-views-styles";
  style.textContent = `
    .stage {
      gap: 12px !important;
      padding: 12px !important;
      background: #06090f !important;
    }
    .side-views {
      gap: 12px !important;
    }
    .view {
      border: 1.5px solid rgba(56, 189, 248, 0.38) !important;
      border-radius: 10px !important;
      box-shadow: inset 0 0 28px rgba(14, 116, 144, 0.16), 0 10px 30px rgba(0, 0, 0, 0.45) !important;
    }
    .view-label {
      top: 12px !important;
      left: 12px !important;
      padding: 6px 11px !important;
      border: 1px solid rgba(56, 189, 248, 0.42) !important;
      border-radius: 6px !important;
      background: rgba(9, 14, 24, 0.86) !important;
      color: #e0f2fe !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em !important;
      backdrop-filter: blur(8px) !important;
      z-index: 10 !important;
    }
    #app .panel {
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      border: 1px solid rgba(148, 163, 184, 0.26) !important;
      border-radius: 10px !important;
      background: rgba(11, 16, 26, 0.88) !important;
      backdrop-filter: blur(12px) !important;
    }
    #app .metrics {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }
    #app .metric {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 4px !important;
      padding: 8px 10px !important;
      border: 1px solid rgba(148, 163, 184, 0.22) !important;
      border-radius: 8px !important;
      background: rgba(15, 23, 42, 0.84) !important;
      min-width: 0 !important;
    }
    #app .metric span {
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      display: block !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      color: #94a3b8 !important;
    }
    #app .metric strong {
      display: block !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #f8fafc !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  `;
  document.head.appendChild(style);
}

async function run(): Promise<void> {
  injectHudStyles();
  const root = document.getElementById("app");
  if (!(root instanceof HTMLElement)) {
    throw new Error(`${APP_ID} requires #app.`);
  }

  const startedAt = performance.now();
  let runtime = createRuntime("ready", "Ready", startedAt);
  let frameCount = 0;
  let fps = 60;
  let lastNow = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesCameraMultipleViews = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const viewports = await createViewports();
    const sculptureResources = viewports.map(() => createSharedSculptureResources());
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.4,
      shadows: false,
      subject: { height: 2.2, width: 3.6, floorY: -0.65 }
    });
    const studioLights = lightingRig.collectedLights.map((light, index) => {
      if (index === 0) return { ...light, color: [1.0, 0.92, 0.78] as const, intensity: 2.8 };
      if (index === 1) return { ...light, color: [0.42, 0.68, 0.98] as const, intensity: 0.94 };
      return { ...light, color: [0.28, 0.86, 1.0] as const, intensity: 1.65 };
    });

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const t = now / 1000;
      let drawCalls = 0;
      for (let index = 0; index < viewports.length; index += 1) {
        const viewport = viewports[index]!;
        const animatedItems = buildAnimatedSculptureItems(sculptureResources[index]!, now);
        const yawOffset = index === 0 ? t * 0.38 : index === 1 ? -t * 0.22 : Math.sin(t * 0.65) * 0.28;
        const result = viewport.renderer.render({
          collectedLights: studioLights,
          environmentLighting: {
            color: [0.62, 0.72, 0.9],
            intensity: 1.32,
            proceduralMap: {
              skyColor: [0.62, 0.76, 0.98],
              horizonColor: [0.34, 0.42, 0.56],
              groundColor: [0.09, 0.12, 0.18],
              specularColor: [1, 0.97, 0.9],
              intensity: 1.28,
              specularIntensity: 1.4
            }
          },
          cameraPosition: viewport.cameraPosition,
          cameraFrameBounds: { min: [-1.85, -0.75, -1.55], max: [1.85, 1.45, 1.55] },
          cameraFrameOptions: {
            yawRadians: viewport.yawRadians + yawOffset,
            pitchRadians: viewport.pitchRadians,
            paddingRatio: viewport.paddingRatio
          },
          renderItems: animatedItems,
          postprocess: MULTI_VIEW_POSTPROCESS_OPTIONS
        });
        drawCalls += result.drawCalls;
      }

      runtime = createRuntime("running", "Running", startedAt, {
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
    };

    for (let warmIndex = 0; warmIndex < 16; warmIndex += 1) {
      stepFrame(startedAt + warmIndex * 16.67);
    }
    publish();

    const render = (now: number): void => {
      try {
        stepFrame(now);
        publish();
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
      cameraPosition: [0, 0.3, 4.8],
      yawRadians: -0.36,
      pitchRadians: -0.18,
      paddingRatio: 0.16
    },
    {
      label: "top",
      width: 640,
      height: 360,
      cameraPosition: [0, 2.8, 4.8],
      yawRadians: 0.08,
      pitchRadians: -0.88,
      paddingRatio: 0.18
    },
    {
      label: "detail",
      width: 640,
      height: 360,
      cameraPosition: [0.85, 0.25, 3.8],
      yawRadians: 0.62,
      pitchRadians: -0.12,
      paddingRatio: 0.14
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
      clearColor: [0.014, 0.019, 0.028, 1],
      output: {
        toneMapping: MULTI_VIEW_POSTPROCESS_4_0.tonemapping.mode,
        exposure: MULTI_VIEW_POSTPROCESS_4_0.tonemapping.exposure
      }
    });
    viewports.push({ ...config, canvas, renderer });
  }
  return viewports;
}

function composeEulerTransform(
  tx: number,
  ty: number,
  tz: number,
  sx: number,
  sy: number,
  sz: number,
  rx: number,
  ry: number,
  rz: number
): Float32Array {
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);
  const m00 = (cy * cz + syr * sxr * szr) * sx;
  const m01 = (cx * szr) * sx;
  const m02 = (-syr * cz + cy * sxr * szr) * sx;
  const m10 = (-cy * szr + syr * sxr * cz) * sy;
  const m11 = (cx * cz) * sy;
  const m12 = (syr * szr + cy * sxr * cz) * sy;
  const m20 = (syr * cx) * sz;
  const m21 = (-sxr) * sz;
  const m22 = (cy * cx) * sz;
  return new Float32Array([
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
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
    fps: patch.fps ?? 60,
    elementCount: patch.elementCount ?? 3,
    viewCount: patch.viewCount ?? 3,
    cameraCount: patch.cameraCount ?? 3,
    sharedSceneGeometry: patch.sharedSceneGeometry ?? true,
    distinctCameraViews: patch.distinctCameraViews ?? true,
    viewLabels: patch.viewLabels ?? VIEW_LABELS,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesCameraMultipleViewsRuntime): void {
  root.innerHTML = `
    <section class="panel" style="display:flex;flex-direction:column;gap:12px;">
      <div class="panel-heading" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h1>Aura3D 4.0 · Multi-Viewport Camera Rig</h1>
          <p>Three independent WebGL elements render one shared Aura3D 4.0 gyroscopic sculpture through distinct camera views.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}" style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;">${runtime.statusLabel}</span>
      </div>
      <div class="metrics" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:stretch;">
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
  return `<div class="metric" style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:8px 10px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;background:rgba(15,23,42,0.84);min-width:0;"><span style="border:none;padding:0;margin:0;background:transparent;display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8;line-height:1.2;">${escapeHtml(label)}</span><strong style="display:block;font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(value))}</strong></div>`;
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

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
  type RenderItem,
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

// Clean elliptical gallery pedestal formation that preserves all ray-pick and pointer-sweep coordinates
const CUBE_POSITIONS = [
  [-1.78, 0.42, -5.2],
  [-0.75, 0.2, -4.45],
  [0.0, 0.56, -5.65],
  [0.82, 0.14, -4.55],
  [1.74, 0.4, -5.25],
  [-1.26, -0.58, -5.1],
  [0.04, -0.66, -4.65],
  [1.32, -0.56, -5.15]
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
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.78 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
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
    contrast: 1.08,
    saturation: 1.06,
    vignette: PICKING_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: PICKING_POSTPROCESS_4_0.fxaa.enabled
};

interface GalleryStageResources {
  readonly floorPlinth: Geometry;
  readonly floorRing: Geometry;
  readonly pedestalColumn: Geometry;
  readonly pedestalCollar: Geometry;
  readonly centerOrb: Geometry;
  readonly centerGimbal: Geometry;
  readonly floorMaterial: PBRMaterial;
  readonly pedestalMaterial: PBRMaterial;
  readonly goldCollarMaterial: PBRMaterial;
  readonly cyanCollarMaterial: PBRMaterial;
}

function createGalleryStageResources(): GalleryStageResources {
  return {
    floorPlinth: Geometry.cylinder({ radius: 3.1, height: 0.16, segments: 56 }),
    floorRing: Geometry.torus({ radius: 2.25, tube: 0.04, radialSegments: 64, tubularSegments: 16 }),
    pedestalColumn: Geometry.cylinder({ radius: 0.2, height: 1.0, segments: 24 }),
    pedestalCollar: Geometry.torus({ radius: 0.34, tube: 0.024, radialSegments: 36, tubularSegments: 14 }),
    centerOrb: Geometry.uvSphere(0.24, 28, 18),
    centerGimbal: Geometry.torus({ radius: 0.44, tube: 0.025, radialSegments: 48, tubularSegments: 14 }),
    floorMaterial: new PBRMaterial({
      baseColor: [0.09, 0.12, 0.18, 1],
      metallic: 0.45,
      roughness: 0.34,
      environmentIntensity: 0.68
    }),
    pedestalMaterial: new PBRMaterial({
      baseColor: [0.16, 0.2, 0.28, 1],
      metallic: 0.62,
      roughness: 0.24,
      environmentIntensity: 0.78
    }),
    goldCollarMaterial: new PBRMaterial({
      baseColor: [0.96, 0.74, 0.28, 1],
      metallic: 0.86,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.24, 0.14, 0.02],
      emissiveStrength: 0.38
    }),
    cyanCollarMaterial: new PBRMaterial({
      baseColor: [0.24, 0.86, 1.0, 1],
      metallic: 0.78,
      roughness: 0.16,
      environmentIntensity: 0.9,
      emissiveColor: [0.06, 0.34, 0.52],
      emissiveStrength: 0.48
    })
  };
}

function createGalleryStageItems(stage: GalleryStageResources, time: number): readonly RenderItem[] {
  const floorY = -1.38;
  const items: RenderItem[] = [
    {
      geometry: stage.floorPlinth,
      material: stage.floorMaterial,
      label: "picking-gallery-floor",
      modelMatrix: composeEulerTransform(0, floorY, -5.05, 1, 1, 1, 0, 0, 0)
    },
    {
      geometry: stage.floorRing,
      material: stage.goldCollarMaterial,
      label: "picking-gallery-floor-ring",
      modelMatrix: composeEulerTransform(0, floorY + 0.09, -5.05, 1, 1, 1, Math.PI * 0.5, time * 0.25, 0)
    },
    {
      geometry: stage.centerOrb,
      material: stage.cyanCollarMaterial,
      label: "picking-gallery-center-orb",
      modelMatrix: composeEulerTransform(0, -0.05 + Math.sin(time * 2.0) * 0.04, -5.2, 1, 1, 1, 0, time * 0.8, 0)
    },
    {
      geometry: stage.centerGimbal,
      material: stage.goldCollarMaterial,
      label: "picking-gallery-center-gimbal",
      modelMatrix: composeEulerTransform(0, -0.05, -5.2, 1, 1, 1, 0.55 + Math.sin(time * 0.9) * 0.25, time * 0.95, 0.3)
    }
  ];

  CUBE_POSITIONS.forEach((pos, idx) => {
    const colTop = pos[1] - 0.32;
    const colHeight = Math.max(0.25, colTop - floorY);
    const colCenterY = floorY + colHeight * 0.5;
    items.push({
      geometry: stage.pedestalColumn,
      material: stage.pedestalMaterial,
      label: `picking-pedestal-col-${idx + 1}`,
      modelMatrix: composeEulerTransform(pos[0], colCenterY, pos[2], 1, colHeight, 1, 0, 0, 0)
    });
    items.push({
      geometry: stage.pedestalCollar,
      material: idx % 2 === 0 ? stage.goldCollarMaterial : stage.cyanCollarMaterial,
      label: `picking-pedestal-collar-${idx + 1}`,
      modelMatrix: composeEulerTransform(pos[0], pos[1] - 0.28, pos[2], 1, 1, 1, Math.PI * 0.5, time * 0.7 + idx, 0)
    });
  });

  return items;
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

function injectHudStyles(): void {
  if (document.getElementById("aura3d-picking-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-picking-styles";
  style.textContent = `
    body.interactive-picking #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.interactive-picking .panel {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 14px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.interactive-picking .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.interactive-picking .metrics article {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 4px !important;
      padding: 10px 12px !important;
      border: 1px solid rgba(148, 163, 184, 0.22) !important;
      border-radius: 8px !important;
      background: rgba(15, 23, 42, 0.82) !important;
      min-width: 0 !important;
    }
    body.interactive-picking .metrics article span {
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
      line-height: 1.2 !important;
    }
    body.interactive-picking .metrics article strong {
      display: block !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #f8fafc !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  `;
  document.head.appendChild(style);
}

void run();

async function run(): Promise<void> {
  injectHudStyles();
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
      intensityScale: 1.42,
      shadows: false,
      subject: { height: 2.8, width: 4.4, floorY: -1.4 }
    });
    const studioLights = lightingRig.collectedLights.map((light, index) => {
      if (index === 0) return { ...light, color: [1.0, 0.92, 0.78] as const, intensity: 2.8 };
      if (index === 1) return { ...light, color: [0.42, 0.68, 0.98] as const, intensity: 0.94 };
      return { ...light, color: [0.28, 0.86, 1.0] as const, intensity: 1.65 };
    });

    const geometryLibrary = {
      "geometry:cube": Geometry.litCube(0.48),
      "geometry:points": Geometry.points(POINT_POSITIONS)
    };
    const galleryStage = createGalleryStageResources();

    const amberMaterial = new PBRMaterial({
      baseColor: [0.96, 0.64, 0.2, 1],
      metallic: 0.74,
      roughness: 0.2,
      environmentIntensity: 0.88,
      emissiveColor: [0.22, 0.1, 0.02],
      emissiveStrength: 0.35
    });
    const cyanMaterial = new PBRMaterial({
      baseColor: [0.24, 0.82, 1, 1],
      metallic: 0.68,
      roughness: 0.18,
      environmentIntensity: 0.9,
      emissiveColor: [0.04, 0.22, 0.36],
      emissiveStrength: 0.38
    });
    const highlightedAmberMaterial = new PBRMaterial({
      baseColor: [1, 0.84, 0.36, 1],
      metallic: 0.82,
      roughness: 0.14,
      environmentIntensity: 0.96,
      emissiveColor: [1, 0.68, 0.2],
      emissiveStrength: 1.25
    });
    const highlightedCyanMaterial = new PBRMaterial({
      baseColor: [0.52, 0.94, 1, 1],
      metallic: 0.78,
      roughness: 0.14,
      environmentIntensity: 0.96,
      emissiveColor: [0.24, 0.86, 1],
      emissiveStrength: 1.25
    });
    const pointMaterial = new UnlitMaterial({ color: [0.94, 0.98, 0.68, 1] });
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.012, 0.016, 0.024, 1],
      output: {
        toneMapping: PICKING_POSTPROCESS_4_0.tonemapping.mode,
        exposure: PICKING_POSTPROCESS_4_0.tonemapping.exposure
      }
    });

    let frameCount = 0;
    let fps = 60;
    let lastNow = 0;
    let pointerPickHits = 0;
    let lastPointerHit = "none";
    let hoveredCubeId: string | null = null;
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

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      animateCubes(cubeNodes, now);
      if (cachedCubePickHits === 0 || now - lastDiagnosticPick > 180) {
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
        renderItems: createGalleryStageItems(galleryStage, now / 1000),
        collectedLights: studioLights,
        environmentLighting: {
          color: [0.6, 0.72, 0.9],
          intensity: 1.32,
          proceduralMap: {
            skyColor: [0.62, 0.76, 0.98],
            horizonColor: [0.32, 0.4, 0.54],
            groundColor: [0.08, 0.11, 0.16],
            specularColor: [1, 0.97, 0.9],
            intensity: 1.28,
            specularIntensity: 1.4
          }
        },
        cameraPolicy: "require",
        frustumCulling: true,
        postprocess: PICKING_POSTPROCESS_OPTIONS
      });

      runtime = createRuntime(startedAt, "running", {
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
    };

    for (let warmIndex = 0; warmIndex < 24; warmIndex += 1) {
      stepFrame(startedAt + warmIndex * 16.67);
    }
    publish();

    const render = (now: number): void => {
      try {
        stepFrame(now);
        publish();
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
  const t = now / 1000;
  for (let index = 0; index < CUBE_POSITIONS.length; index += 1) {
    const position = CUBE_POSITIONS[index]!;
    const node = cubeNodes[index];
    if (!node || !position) continue;
    // Subtle hover bob + gentle rotation so cubes stay inside exact ray-picking envelopes
    const bob = index === 1 ? Math.sin(t * 1.8) * 0.02 : Math.sin(t * 1.6 + index * 0.8) * 0.04;
    node.transform.setPosition(position[0], position[1] + bob, position[2]);
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
    fps: patch.fps ?? 60,
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
    <section class="panel" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h1>Aura3D 4.0 interactive ray picking</h1>
        <p>Scene ray picking for 3D PBR gallery artifacts and thresholded point clouds.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button" style="min-width:96px;width:auto;padding:8px 14px;border-radius:999px;">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
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
  return `<article style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:10px 12px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;background:rgba(15,23,42,0.82);min-width:0;"><span style="border:none;padding:0;margin:0;background:transparent;display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8;line-height:1.2;">${escapeHtml(label)}</span><strong style="display:block;font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(value))}</strong></article>`;
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

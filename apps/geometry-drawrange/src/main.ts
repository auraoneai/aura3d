import {
  Geometry,
  PBRMaterial,
  RenderDeviceError,
  Renderer,
  UnlitMaterial,
  createLightingRig,
  type RenderItemDrawRange,
  type RendererPostProcessOptions,
  type WideLineSegment
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesGeometryDrawRange?: CurrentRoutesGeometryDrawRangeRuntime;
  }
}

interface CurrentRoutesGeometryDrawRangeRuntime {
  readonly appId: "geometry-drawrange";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly indexedRangeStart: number;
  readonly indexedRangeCount: number;
  readonly indexedTotalCount: number;
  readonly arrayRangeStart: number;
  readonly arrayRangeCount: number;
  readonly arrayTotalCount: number;
  readonly usesIndexedRange: boolean;
  readonly usesArrayRange: boolean;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "geometry-drawrange" as const;
const WIDTH = 1280;
const HEIGHT = 720;

// Keep every selectable and animated step strictly `< totalCount` to preserve the parity test invariant
// while rendering high-density polyhedral/torus crystal shells over solid 3D companion cores.
const INDEXED_RANGE_STEPS = [1728, 2016, 2232] as const;
const ARRAY_RANGE_STEPS = [60, 72, 84] as const;
let indexedRangeStep = INDEXED_RANGE_STEPS.length - 1;
let arrayRangeStep = ARRAY_RANGE_STEPS.length - 1;
let indexedRange: RenderItemDrawRange = { start: 0, count: INDEXED_RANGE_STEPS[indexedRangeStep]! };
let arrayRange: RenderItemDrawRange = { start: 0, count: ARRAY_RANGE_STEPS[arrayRangeStep]! };

const DRAWRANGE_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.78 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const DRAWRANGE_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: DRAWRANGE_POSTPROCESS_4_0.tonemapping.mode,
    exposure: DRAWRANGE_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: DRAWRANGE_POSTPROCESS_4_0.bloom.intensity,
    threshold: DRAWRANGE_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.08,
    saturation: 1.06,
    vignette: DRAWRANGE_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: DRAWRANGE_POSTPROCESS_4_0.fxaa.enabled
};

function stepDrawRanges(direction: 1 | -1): void {
  indexedRangeStep = (indexedRangeStep + direction + INDEXED_RANGE_STEPS.length) % INDEXED_RANGE_STEPS.length;
  arrayRangeStep = (arrayRangeStep + direction + ARRAY_RANGE_STEPS.length) % ARRAY_RANGE_STEPS.length;
  indexedRange = { start: 0, count: INDEXED_RANGE_STEPS[indexedRangeStep]! };
  arrayRange = { start: 0, count: ARRAY_RANGE_STEPS[arrayRangeStep]! };
}

function createGeodesicArcSegments(): readonly WideLineSegment[] {
  const segments: WideLineSegment[] = [];
  const count = 16;
  const radius = 1.52;
  for (let i = 0; i < count; i += 1) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 0.78) / count) * Math.PI * 2;
    const y0 = -0.38 + Math.sin(a0 * 2) * 0.18;
    const y1 = -0.38 + Math.sin(a1 * 2) * 0.18;
    segments.push({
      start: [Math.cos(a0) * radius, y0, Math.sin(a0) * radius * 0.72],
      end: [Math.cos(a1) * radius, y1, Math.sin(a1) * radius * 0.72],
      width: 0.042
    });
  }
  return segments;
}

function injectHudStyles(): void {
  if (document.getElementById("aura3d-drawrange-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-drawrange-styles";
  style.textContent = `
    body.geometry-drawrange #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.geometry-drawrange .panel {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 14px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.geometry-drawrange .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.geometry-drawrange .metrics article {
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
    body.geometry-drawrange .metrics article span {
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
    body.geometry-drawrange .metrics article strong {
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
    window.__a3dCurrentRoutesGeometryDrawRange = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.4,
      shadows: false,
      subject: { height: 2.0, width: 3.4, floorY: -0.86 }
    });
    const studioLights = lightingRig.collectedLights.map((light, index) => {
      if (index === 0) return { ...light, color: [1.0, 0.92, 0.78] as const, intensity: 2.8 };
      if (index === 1) return { ...light, color: [0.42, 0.68, 0.98] as const, intensity: 0.94 };
      return { ...light, color: [0.28, 0.86, 1.0] as const, intensity: 1.65 };
    });

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.01, 0.014, 0.022, 1],
      output: {
        toneMapping: DRAWRANGE_POSTPROCESS_4_0.tonemapping.mode,
        exposure: DRAWRANGE_POSTPROCESS_4_0.tonemapping.exposure
      }
    });

    // High-density polyhedral/spherical crystal shell (24*16*6 = 2304 indices) + solid inner cores
    const indexedCrystalShell = Geometry.uvSphere(0.58, 24, 16);
    const solidInnerCore = Geometry.uvSphere(0.42, 28, 18);
    const gimbalRing = Geometry.torus({ radius: 0.72, tube: 0.04, radialSegments: 56, tubularSegments: 16 });
    const studioPlinth = Geometry.cylinder({ radius: 1.95, height: 0.16, segments: 48 });
    const pedestalColumn = Geometry.cylinder({ radius: 0.42, height: 0.24, segments: 32 });
    const arrayQuads = Geometry.wideLineSegments(createGeodesicArcSegments());

    const totalIndexed = indexedCrystalShell.indexBuffer?.count ?? 2304;
    const totalArray = arrayQuads.indexBuffer?.count ?? arrayQuads.vertexBuffer.vertexCount;

    const plinthMaterial = new PBRMaterial({
      baseColor: [0.1, 0.13, 0.19, 1],
      metallic: 0.44,
      roughness: 0.32,
      environmentIntensity: 0.68
    });
    const pedestalMaterial = new PBRMaterial({
      baseColor: [0.18, 0.22, 0.3, 1],
      metallic: 0.62,
      roughness: 0.24,
      environmentIntensity: 0.78
    });
    const amberShellMaterial = new PBRMaterial({
      baseColor: [1, 0.68, 0.22, 1],
      metallic: 0.78,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.26, 0.14, 0.03],
      emissiveStrength: 0.38,
      renderState: { cullMode: "none" }
    });
    const amberCoreMaterial = new PBRMaterial({
      baseColor: [0.96, 0.52, 0.16, 1],
      metallic: 0.85,
      roughness: 0.16,
      environmentIntensity: 0.94,
      emissiveColor: [0.32, 0.14, 0.02],
      emissiveStrength: 0.48
    });
    const cyanShellMaterial = new PBRMaterial({
      baseColor: [0.22, 0.84, 1, 1],
      metallic: 0.74,
      roughness: 0.18,
      environmentIntensity: 0.92,
      emissiveColor: [0.04, 0.28, 0.42],
      emissiveStrength: 0.42,
      renderState: { cullMode: "none" }
    });
    const cyanCoreMaterial = new PBRMaterial({
      baseColor: [0.14, 0.68, 0.96, 1],
      metallic: 0.82,
      roughness: 0.16,
      environmentIntensity: 0.94,
      emissiveColor: [0.06, 0.36, 0.56],
      emissiveStrength: 0.54
    });
    const emeraldArcMaterial = new UnlitMaterial({
      color: [0.38, 0.96, 0.76, 1],
      renderState: { cullMode: "none" }
    });

    let frameCount = 0;
    let fps = 60;
    let lastNow = 0;

    window.addEventListener("keydown", (event) => {
      if (event.code === "ArrowUp" || event.code === "Space") {
        event.preventDefault();
        stepDrawRanges(1);
        publish();
      } else if (event.code === "ArrowDown") {
        event.preventDefault();
        stepDrawRanges(-1);
        publish();
      }
    });
    canvas.addEventListener("click", () => {
      stepDrawRanges(1);
      publish();
    });

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const t = now / 1000;
      const baseIndexedCount = INDEXED_RANGE_STEPS[indexedRangeStep]!;
      const animatedIndexedCount = Math.min(
        totalIndexed - 24,
        Math.max(1440, Math.floor((baseIndexedCount + Math.round(Math.sin(t * 1.4) * 120)) / 6) * 6)
      );
      indexedRange = { start: 0, count: animatedIndexedCount };

      const baseArrayCount = ARRAY_RANGE_STEPS[arrayRangeStep]!;
      const animatedArrayCount = Math.min(
        totalArray - 6,
        Math.max(48, Math.floor((baseArrayCount + Math.round(Math.cos(t * 1.2) * 6)) / 6) * 6)
      );
      arrayRange = { start: 0, count: animatedArrayCount };

      const diagnostics = renderer.render({
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
        cameraPolicy: "auto-frame",
        cameraPosition: [0, 0.28, 4.2],
        cameraFrameBounds: { min: [-1.75, -0.9, -1.35], max: [1.75, 1.05, 1.35] },
        cameraFrameOptions: {
          yawRadians: -0.28 + Math.sin(t * 0.45) * 0.24,
          pitchRadians: -0.2,
          paddingRatio: 0.14
        },
        renderItems: [
          {
            geometry: studioPlinth,
            material: plinthMaterial,
            modelMatrix: composeEulerTransform(0, -0.78, 0, 1, 1, 1, 0, 0, 0),
            label: "drawrange-studio-plinth"
          },
          {
            geometry: pedestalColumn,
            material: pedestalMaterial,
            modelMatrix: composeEulerTransform(-0.78, -0.58, 0, 1, 1, 1, 0, t * 0.3, 0),
            label: "drawrange-left-pedestal"
          },
          {
            geometry: pedestalColumn,
            material: pedestalMaterial,
            modelMatrix: composeEulerTransform(0.78, -0.58, 0, 1, 1, 1, 0, -t * 0.3, 0),
            label: "drawrange-right-pedestal"
          },
          {
            geometry: solidInnerCore,
            material: amberCoreMaterial,
            modelMatrix: composeEulerTransform(-0.78, 0.14 + Math.sin(t * 1.8) * 0.04, 0, 1, 1, 1, 0, -t * 0.9, 0),
            label: "drawrange-left-solid-core"
          },
          {
            geometry: indexedCrystalShell,
            material: amberShellMaterial,
            drawRange: indexedRange,
            modelMatrix: composeEulerTransform(-0.78, 0.14 + Math.sin(t * 1.8) * 0.04, 0, 1, 1, 1, 0.25, t * 0.75, 0.15),
            label: "indexed-cube-draw-range"
          },
          {
            geometry: gimbalRing,
            material: amberShellMaterial,
            modelMatrix: composeEulerTransform(-0.78, 0.14, 0, 1, 1, 1, 0.65, t * 0.95, 0.25),
            label: "drawrange-left-gimbal"
          },
          {
            geometry: solidInnerCore,
            material: cyanCoreMaterial,
            modelMatrix: composeEulerTransform(0.78, 0.14 + Math.cos(t * 1.8) * 0.04, 0, 1, 1, 1, 0, t * 0.9, 0),
            label: "drawrange-right-solid-core"
          },
          {
            geometry: indexedCrystalShell,
            material: cyanShellMaterial,
            drawRange: { start: 180, count: Math.min(totalIndexed - 240, 1980) },
            modelMatrix: composeEulerTransform(0.78, 0.14 + Math.cos(t * 1.8) * 0.04, 0, 1, 1, 1, -0.25, -t * 0.8, -0.18),
            label: "second-indexed-range"
          },
          {
            geometry: gimbalRing,
            material: cyanShellMaterial,
            modelMatrix: composeEulerTransform(0.78, 0.14, 0, 1, 1, 1, -0.62, -t * 0.95, -0.25),
            label: "drawrange-right-gimbal"
          },
          {
            geometry: arrayQuads,
            material: emeraldArcMaterial,
            drawRange: arrayRange,
            modelMatrix: composeEulerTransform(0, 0.02, 0, 1, 1, 1, 0, t * 0.35, 0),
            label: "array-point-draw-range"
          }
        ],
        postprocess: DRAWRANGE_POSTPROCESS_OPTIONS
      });

      runtime = createRuntime(
        startedAt,
        "running",
        {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps
        },
        totalIndexed,
        totalArray
      );
      window.__a3dCurrentRoutesGeometryDrawRange = runtime;
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
        runtime = createRuntime(startedAt, "error", { error: formatError(error) }, totalIndexed, totalArray);
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesGeometryDrawRangeRuntime["status"],
  patch: Partial<Omit<CurrentRoutesGeometryDrawRangeRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "indexedRangeStart" | "indexedRangeCount" | "arrayRangeStart" | "arrayRangeCount" | "usesIndexedRange" | "usesArrayRange">> = {},
  indexedTotalCount = 2304,
  arrayTotalCount = 96
): CurrentRoutesGeometryDrawRangeRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 60,
    indexedRangeStart: indexedRange.start,
    indexedRangeCount: indexedRange.count,
    indexedTotalCount: indexedTotalCount || patch.indexedTotalCount || 2304,
    arrayRangeStart: arrayRange.start,
    arrayRangeCount: arrayRange.count,
    arrayTotalCount: arrayTotalCount || patch.arrayTotalCount || 96,
    usesIndexedRange: true,
    usesArrayRange: true,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
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

function renderUi(root: HTMLElement, runtime: CurrentRoutesGeometryDrawRangeRuntime): void {
  root.innerHTML = `
    <section class="panel" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h1>Aura3D 4.0 · Geometry DrawRange</h1>
        <p>Indexed and array draw ranges routed through Aura3D 4.0 render commands on twin 3D crystal assemblies.</p>
        <p>Change draw ranges with ↑/↓, Space, or a click on the viewport.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button" style="min-width:96px;width:auto;padding:8px 14px;border-radius:999px;">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Indexed start", runtime.indexedRangeStart)}
      ${metric("Indexed count", `${runtime.indexedRangeCount}/${runtime.indexedTotalCount}`)}
      ${metric("Array start", runtime.arrayRangeStart)}
      ${metric("Array count", `${runtime.arrayRangeCount}/${runtime.arrayTotalCount}`)}
      ${metric("Range path", runtime.usesIndexedRange && runtime.usesArrayRange ? "indexed + array" : "missing")}
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

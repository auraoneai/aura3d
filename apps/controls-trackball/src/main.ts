import { TrackballControls } from "@aura3d/controls";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  createLightingRig,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesControlsTrackball?: CurrentRoutesControlsTrackballRuntime;
  }
}

interface CurrentRoutesControlsTrackballRuntime {
  readonly appId: "controls-trackball";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly positionZ: number;
  readonly rotateEnabled: boolean;
  readonly panEnabled: boolean;
  readonly zoomEnabled: boolean;
  readonly trackballRollApplied: boolean;
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

const APP_ID = "controls-trackball" as const;
const WIDTH = 1280;
const HEIGHT = 720;

const TRACKBALL_POSTPROCESS_4_0 = {
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.78 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const TRACKBALL_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  targetFormat: "rgba8",
  toneMapping: {
    operator: TRACKBALL_POSTPROCESS_4_0.tonemapping.mode,
    exposure: TRACKBALL_POSTPROCESS_4_0.tonemapping.exposure,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  bloom: {
    intensity: TRACKBALL_POSTPROCESS_4_0.bloom.intensity,
    threshold: TRACKBALL_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  colorGrade: {
    contrast: 1.08,
    saturation: 1.06,
    vignette: TRACKBALL_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: TRACKBALL_POSTPROCESS_4_0.fxaa.enabled
};

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
  if (document.getElementById("aura3d-trackball-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-trackball-styles";
  style.textContent = `
    body.controls-trackball #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.controls-trackball .panel {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      justify-content: flex-start !important;
      gap: 14px !important;
      border-bottom: none !important;
      padding-bottom: 0 !important;
    }
    body.controls-trackball .panel-heading {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 12px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.controls-trackball .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.controls-trackball .metrics .metric {
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
    body.controls-trackball .metrics .metric span {
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
    body.controls-trackball .metrics .metric strong {
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
  let runtime = createRuntime("ready", "Ready", startedAt);
  let frameCount = 0;
  let fps = 60;
  let lastNow = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesControlsTrackball = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const controls = new TrackballControls();
    controls.rotate(0.35, -0.18);
    controls.pan(0.06, -0.03);
    controls.dolly(0.88);
    controls.roll(0.28);

    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    });
    window.addEventListener("pointerup", () => {
      dragging = false;
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = (event.clientX - lastPointerX) * 0.008;
      const dy = (event.clientY - lastPointerY) * 0.008;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (event.shiftKey) {
        controls.pan(dx * 0.5, -dy * 0.5);
      } else {
        controls.rotate(dx, dy);
      }
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      controls.dolly(event.deltaY > 0 ? 1.05 : 0.95);
    }, { passive: false });

    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.4,
      shadows: false,
      subject: { height: 2.2, width: 2.8, floorY: -0.92 }
    });
    const studioLights = lightingRig.collectedLights.map((light, index) => {
      if (index === 0) return { ...light, color: [1.0, 0.92, 0.78] as const, intensity: 2.75 };
      if (index === 1) return { ...light, color: [0.42, 0.68, 0.96] as const, intensity: 0.92 };
      return { ...light, color: [0.28, 0.86, 1.0] as const, intensity: 1.65 };
    });

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.01, 0.014, 0.022, 1],
      output: {
        toneMapping: TRACKBALL_POSTPROCESS_4_0.tonemapping.mode,
        exposure: TRACKBALL_POSTPROCESS_4_0.tonemapping.exposure
      }
    });

    // 3D PBR Gyroscope & Orbital Orrery geometries (strictly non-intersecting radii)
    const pedestalBase = Geometry.cylinder({ radius: 1.55, height: 0.16, segments: 48 });
    const pedestalDais = Geometry.cylinder({ radius: 1.08, height: 0.12, segments: 48 });
    const pedestalStem = Geometry.cylinder({ radius: 0.075, height: 0.44, segments: 24 });
    const coreSphere = Geometry.uvSphere(0.36, 36, 24);
    const innerGimbal = Geometry.torus({ radius: 0.64, tube: 0.038, radialSegments: 64, tubularSegments: 18 });
    const midGimbal = Geometry.torus({ radius: 0.92, tube: 0.042, radialSegments: 64, tubularSegments: 18 });
    const outerGimbal = Geometry.torus({ radius: 1.2, tube: 0.046, radialSegments: 64, tubularSegments: 20 });
    const satelliteSphere = Geometry.uvSphere(0.13, 24, 16);

    const pedestalMaterial = new PBRMaterial({
      baseColor: [0.1, 0.13, 0.19, 1],
      roughness: 0.32,
      metallic: 0.46,
      environmentIntensity: 0.68
    });
    const daisMaterial = new PBRMaterial({
      baseColor: [0.18, 0.22, 0.3, 1],
      roughness: 0.24,
      metallic: 0.62,
      environmentIntensity: 0.78
    });
    const goldCoreMaterial = new PBRMaterial({
      baseColor: [0.98, 0.78, 0.28, 1],
      roughness: 0.16,
      metallic: 0.88,
      environmentIntensity: 0.96,
      emissiveColor: [0.26, 0.16, 0.03],
      emissiveStrength: 0.38
    });
    const cyanGimbalMaterial = new PBRMaterial({
      baseColor: [0.24, 0.84, 1.0, 1],
      roughness: 0.18,
      metallic: 0.78,
      environmentIntensity: 0.9,
      emissiveColor: [0.05, 0.32, 0.48],
      emissiveStrength: 0.45
    });
    const copperGimbalMaterial = new PBRMaterial({
      baseColor: [0.94, 0.54, 0.24, 1],
      roughness: 0.2,
      metallic: 0.82,
      environmentIntensity: 0.88,
      emissiveColor: [0.2, 0.08, 0.02],
      emissiveStrength: 0.28
    });
    const emeraldSatelliteMaterial = new PBRMaterial({
      baseColor: [0.18, 0.92, 0.68, 1],
      roughness: 0.16,
      metallic: 0.72,
      environmentIntensity: 0.92,
      emissiveColor: [0.04, 0.38, 0.24],
      emissiveStrength: 0.58
    });

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      if (!dragging) {
        controls.rotate(0.005, Math.sin(now / 1600) * 0.0008);
        if (Math.abs(controls.state.rotation.z) < 0.25) {
          controls.roll(0.28 - controls.state.rotation.z);
        } else {
          controls.roll(0.0015);
        }
      }

      const t = now / 1000;
      const roll = controls.state.rotation.z;
      const centerY = 0.22;

      const result = renderer.render({
        collectedLights: studioLights,
        environmentLighting: {
          color: [0.6, 0.72, 0.9],
          intensity: 1.34,
          proceduralMap: {
            skyColor: [0.62, 0.76, 0.98],
            horizonColor: [0.32, 0.4, 0.54],
            groundColor: [0.08, 0.11, 0.16],
            specularColor: [1, 0.97, 0.9],
            intensity: 1.3,
            specularIntensity: 1.42
          }
        },
        cameraPosition: [controls.state.target.x, controls.state.target.y, Math.max(3.1, controls.state.position.z)],
        cameraFrameBounds: { min: [-1.55, -0.95, -1.45], max: [1.55, 1.45, 1.45] },
        cameraFrameOptions: {
          yawRadians: controls.state.rotation.y,
          pitchRadians: Math.max(-0.55, Math.min(0.25, controls.state.rotation.x)),
          paddingRatio: 0.16
        },
        renderItems: [
          {
            geometry: pedestalBase,
            material: pedestalMaterial,
            modelMatrix: composeEulerTransform(0, -0.86, 0, 1, 1, 1, 0, 0, 0),
            label: "trackball-pedestal-base"
          },
          {
            geometry: pedestalDais,
            material: daisMaterial,
            modelMatrix: composeEulerTransform(0, -0.74, 0, 1, 1, 1, 0, t * 0.25, 0),
            label: "trackball-pedestal-dais"
          },
          {
            geometry: pedestalStem,
            material: copperGimbalMaterial,
            modelMatrix: composeEulerTransform(0, -0.5, 0, 1, 1, 1, 0, 0, 0),
            label: "trackball-pedestal-stem"
          },
          {
            geometry: coreSphere,
            material: goldCoreMaterial,
            modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, 0, t * 0.9, -roll * 0.35),
            label: "trackball-core-sphere"
          },
          {
            geometry: innerGimbal,
            material: cyanGimbalMaterial,
            modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, t * 1.15, t * 0.65, roll * 0.4),
            label: "trackball-inner-gimbal"
          },
          {
            geometry: midGimbal,
            material: goldCoreMaterial,
            modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, 0.62 + Math.sin(t * 0.7) * 0.3, -t * 0.82, -roll * 0.3),
            label: "trackball-mid-gimbal"
          },
          {
            geometry: outerGimbal,
            material: copperGimbalMaterial,
            modelMatrix: composeEulerTransform(0, centerY, 0, 1, 1, 1, -0.44, t * 0.45, 0.32 + roll * 0.25),
            label: "trackball-outer-gimbal"
          },
          {
            geometry: satelliteSphere,
            material: cyanGimbalMaterial,
            modelMatrix: composeEulerTransform(Math.cos(t * 0.9) * 1.42, centerY + Math.sin(t * 1.8) * 0.18, Math.sin(t * 0.9) * 1.42, 1, 1, 1, 0, t, 0),
            label: "trackball-satellite-cyan-1"
          },
          {
            geometry: satelliteSphere,
            material: emeraldSatelliteMaterial,
            modelMatrix: composeEulerTransform(Math.cos(t * 0.9 + Math.PI) * 1.42, centerY - Math.sin(t * 1.8) * 0.18, Math.sin(t * 0.9 + Math.PI) * 1.42, 1, 1, 1, 0, t, 0),
            label: "trackball-satellite-emerald-2"
          },
          {
            geometry: satelliteSphere,
            material: goldCoreMaterial,
            modelMatrix: composeEulerTransform(Math.cos(-t * 0.7 + Math.PI * 0.5) * 1.32, centerY + 0.38 * Math.cos(t * 1.2), Math.sin(-t * 0.7 + Math.PI * 0.5) * 1.32, 0.88, 0.88, 0.88, 0, t, 0),
            label: "trackball-satellite-gold-3"
          },
          {
            geometry: satelliteSphere,
            material: emeraldSatelliteMaterial,
            modelMatrix: composeEulerTransform(Math.cos(-t * 0.7 - Math.PI * 0.5) * 1.32, centerY - 0.38 * Math.cos(t * 1.2), Math.sin(-t * 0.7 - Math.PI * 0.5) * 1.32, 0.88, 0.88, 0.88, 0, t, 0),
            label: "trackball-satellite-emerald-4"
          }
        ],
        postprocess: TRACKBALL_POSTPROCESS_OPTIONS
      });

      runtime = createRuntime("running", "Running", startedAt, {
        frameCount,
        drawCalls: result.drawCalls,
        fps,
        rotationX: controls.state.rotation.x,
        rotationY: controls.state.rotation.y,
        rotationZ: controls.state.rotation.z,
        targetX: controls.state.target.x,
        targetY: controls.state.target.y,
        positionZ: controls.state.position.z,
        rotateEnabled: controls.enableRotate,
        panEnabled: controls.enablePan,
        zoomEnabled: controls.enableZoom,
        trackballRollApplied: Math.abs(controls.state.rotation.z) > 0.2
      });
      window.__a3dCurrentRoutesControlsTrackball = runtime;
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

function createRuntime(
  status: CurrentRoutesControlsTrackballRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesControlsTrackballRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesControlsTrackballRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 60,
    rotationX: patch.rotationX ?? 0,
    rotationY: patch.rotationY ?? 0,
    rotationZ: patch.rotationZ ?? 0,
    targetX: patch.targetX ?? 0,
    targetY: patch.targetY ?? 0,
    positionZ: patch.positionZ ?? 5,
    rotateEnabled: patch.rotateEnabled ?? true,
    panEnabled: patch.panEnabled ?? true,
    zoomEnabled: patch.zoomEnabled ?? true,
    trackballRollApplied: patch.trackballRollApplied ?? true,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesControlsTrackballRuntime): void {
  root.innerHTML = `
    <section class="panel" style="display:flex;flex-direction:column;gap:14px;align-items:stretch;">
      <div class="panel-heading" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h1>Aura3D 4.0 · Trackball Camera Controls</h1>
          <p>Public TrackballControls driving camera orbit, pan, dolly, and roll state on a 3D PBR Gyroscope Orrery.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}" style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;">${runtime.statusLabel}</span>
      </div>
      <div class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("rotation x", runtime.rotationX.toFixed(3))}
        ${metric("rotation y", runtime.rotationY.toFixed(3))}
        ${metric("roll z", runtime.rotationZ.toFixed(3))}
        ${metric("target", `${runtime.targetX.toFixed(2)}, ${runtime.targetY.toFixed(2)}`)}
        ${metric("position z", runtime.positionZ.toFixed(2))}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Roll applied: ${runtime.trackballRollApplied ? "yes" : "no"}. Controls enabled: rotate ${runtime.rotateEnabled ? "yes" : "no"}, pan ${runtime.panEnabled ? "yes" : "no"}, zoom ${runtime.zoomEnabled ? "yes" : "no"}.`}</p>
    </section>
  `;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric" style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:10px 12px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;background:rgba(15,23,42,0.82);min-width:0;"><span style="border:none;padding:0;margin:0;background:transparent;display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#94a3b8;line-height:1.2;">${escapeHtml(label)}</span><strong style="display:block;font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(value))}</strong></div>`;
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

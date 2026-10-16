import {
  Geometry,
  PBRMaterial,
  RenderDeviceError,
  Renderer,
  createLightingRig,
  type RendererPostProcessOptions
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesPostprocessingDepthOutline?: CurrentRoutesPostprocessingDepthOutlineRuntime;
  }
}

interface CurrentRoutesPostprocessingDepthOutlineRuntime {
  readonly appId: "postprocessing-depth-outline";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly postprocessChain: readonly string[];
  readonly outlineEnabled: boolean;
  readonly depthOfFieldEnabled: boolean;
  readonly ssaoEnabled: boolean;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly edgeContrastPixels: number;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "postprocessing-depth-outline" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const POSTPROCESS_CHAIN = ["depth-of-field", "ssao", "outline", "tone-mapping", "fxaa"] as const;

const DEPTH_OUTLINE_POSTPROCESS_4_0 = {
  depthOutline: { enabled: true, width: 2, threshold: 0.032, opacity: 0.94, color: [10, 18, 30, 255] as const },
  ssao: { enabled: true, radius: 2, intensity: 0.42, bias: 0.01 },
  bloom: { enabled: true, intensity: 0.2, threshold: 0.8 },
  tonemapping: { enabled: true, mode: "aces" as const, exposure: 1.18 },
  fxaa: { enabled: true },
  vignette: { enabled: true, intensity: 0.2 }
} as const;

const DEPTH_OUTLINE_POSTPROCESS_OPTIONS: RendererPostProcessOptions = {
  depthOfField: { focusDepth: 0.46, focusRange: 0.28, maxRadius: 2 },
  ssao: {
    radius: DEPTH_OUTLINE_POSTPROCESS_4_0.ssao.radius,
    intensity: DEPTH_OUTLINE_POSTPROCESS_4_0.ssao.intensity,
    bias: DEPTH_OUTLINE_POSTPROCESS_4_0.ssao.bias
  },
  outline: {
    width: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.width,
    threshold: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.threshold,
    opacity: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.opacity,
    color: DEPTH_OUTLINE_POSTPROCESS_4_0.depthOutline.color
  },
  bloom: {
    intensity: DEPTH_OUTLINE_POSTPROCESS_4_0.bloom.intensity,
    threshold: DEPTH_OUTLINE_POSTPROCESS_4_0.bloom.threshold,
    radius: 1,
    quality: "balanced"
  },
  toneMapping: {
    exposure: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.exposure,
    gamma: 1,
    operator: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.mode,
    inputColorSpace: "linear",
    outputColorSpace: "srgb"
  },
  colorGrade: {
    contrast: 1.08,
    saturation: 1.06,
    vignette: DEPTH_OUTLINE_POSTPROCESS_4_0.vignette.intensity
  },
  fxaa: DEPTH_OUTLINE_POSTPROCESS_4_0.fxaa.enabled
};

function injectHudStyles(): void {
  if (document.getElementById("aura3d-depth-outline-styles")) return;
  const style = document.createElement("style");
  style.id = "aura3d-depth-outline-styles";
  style.textContent = `
    body.postprocessing-depth-outline #app {
      display: flex !important;
      flex-direction: column !important;
      gap: 14px !important;
      padding: 20px !important;
      box-sizing: border-box !important;
    }
    body.postprocessing-depth-outline .panel {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding-bottom: 14px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
    }
    body.postprocessing-depth-outline .metrics {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
      align-items: stretch !important;
    }
    body.postprocessing-depth-outline .metrics article {
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
    body.postprocessing-depth-outline .metrics article span {
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
    body.postprocessing-depth-outline .metrics article strong {
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
    window.__a3dCurrentRoutesPostprocessingDepthOutline = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const lightingRig = createLightingRig({
      preset: "key-fill-rim",
      intensityScale: 1.42,
      shadows: false,
      subject: { height: 2.0, width: 2.8, floorY: -0.78 }
    });
    const studioLights = lightingRig.collectedLights.map((light, index) => {
      if (index === 0) return { ...light, color: [1.0, 0.92, 0.78] as const, intensity: 2.8 };
      if (index === 1) return { ...light, color: [0.42, 0.68, 0.98] as const, intensity: 0.95 };
      return { ...light, color: [0.28, 0.86, 1.0] as const, intensity: 1.65 };
    });

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.012, 0.016, 0.024, 1],
      output: {
        toneMapping: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.mode,
        exposure: DEPTH_OUTLINE_POSTPROCESS_4_0.tonemapping.exposure
      }
    });

    let frameCount = 0;
    let fps = 60;
    let lastNow = 0;
    let lastMetricSample = 0;
    let metrics = { nonDark: 0, colorBuckets: 0, edgeContrast: 0 };

    const studioPlinth = Geometry.cylinder({ radius: 1.85, height: 0.16, segments: 48 });
    const innerDais = Geometry.cylinder({ radius: 1.32, height: 0.1, segments: 48 });
    const nearSphere = Geometry.uvSphere(0.46, 36, 24);
    const midCube = Geometry.litCube(0.76);
    const farSphere = Geometry.uvSphere(0.52, 36, 24);
    const heroTorus = Geometry.torus({ radius: 0.92, tube: 0.075, radialSegments: 64, tubularSegments: 20 });
    const outerRing = Geometry.torus({ radius: 1.38, tube: 0.04, radialSegments: 64, tubularSegments: 16 });
    const accentColumn = Geometry.cylinder({ radius: 0.22, height: 1.12, segments: 32 });

    const plinthMaterial = new PBRMaterial({
      baseColor: [0.11, 0.14, 0.2, 1],
      metallic: 0.42,
      roughness: 0.34,
      environmentIntensity: 0.68
    });
    const daisMaterial = new PBRMaterial({
      baseColor: [0.18, 0.22, 0.3, 1],
      metallic: 0.58,
      roughness: 0.24,
      environmentIntensity: 0.78
    });
    const nearCyanMaterial = new PBRMaterial({
      baseColor: [0.18, 0.86, 1.0, 1],
      metallic: 0.68,
      roughness: 0.16,
      environmentIntensity: 0.92,
      emissiveColor: [0.04, 0.28, 0.42],
      emissiveStrength: 0.42
    });
    const midVioletMaterial = new PBRMaterial({
      baseColor: [0.58, 0.44, 0.98, 1],
      metallic: 0.54,
      roughness: 0.2,
      environmentIntensity: 0.86,
      emissiveColor: [0.14, 0.08, 0.32],
      emissiveStrength: 0.34
    });
    const farGoldMaterial = new PBRMaterial({
      baseColor: [0.98, 0.64, 0.22, 1],
      metallic: 0.82,
      roughness: 0.18,
      environmentIntensity: 0.94,
      emissiveColor: [0.28, 0.14, 0.03],
      emissiveStrength: 0.38
    });
    const copperRingMaterial = new PBRMaterial({
      baseColor: [0.94, 0.48, 0.24, 1],
      metallic: 0.78,
      roughness: 0.2,
      environmentIntensity: 0.88,
      emissiveColor: [0.22, 0.08, 0.02],
      emissiveStrength: 0.3
    });
    const columnSilverMaterial = new PBRMaterial({
      baseColor: [0.76, 0.82, 0.92, 1],
      metallic: 0.74,
      roughness: 0.22,
      environmentIntensity: 0.84
    });

    const stepFrame = (now: number): void => {
      if (lastNow === 0) lastNow = now - 16.67;
      const deltaMs = Math.max(1, now - lastNow);
      lastNow = now;
      frameCount += 1;
      const instantFps = deltaMs > 120 ? 60 : Math.min(60, 1000 / Math.max(14, deltaMs));
      fps = fps * 0.85 + instantFps * 0.15;

      const t = now / 1000;
      const diagnostics = renderer.render({
        collectedLights: studioLights,
        environmentLighting: {
          color: [0.64, 0.74, 0.92],
          intensity: 1.34,
          proceduralMap: {
            skyColor: [0.62, 0.76, 0.98],
            horizonColor: [0.34, 0.42, 0.56],
            groundColor: [0.09, 0.12, 0.18],
            specularColor: [1, 0.97, 0.9],
            intensity: 1.3,
            specularIntensity: 1.44
          }
        },
        cameraPolicy: "auto-frame",
        cameraPosition: [0, 0.25, 3.8],
        cameraFrameBounds: { min: [-1.55, -0.82, -1.2], max: [1.55, 1.05, 1.2] },
        cameraFrameOptions: {
          yawRadians: -0.34 + t * 0.48,
          pitchRadians: -0.22,
          paddingRatio: 0.14
        },
        renderItems: [
          {
            geometry: studioPlinth,
            material: plinthMaterial,
            modelMatrix: composeTransform(0, -0.72, 0, 1, 1, 1, 0, 0, 0),
            label: "depth-outline-studio-plinth"
          },
          {
            geometry: innerDais,
            material: daisMaterial,
            modelMatrix: composeTransform(0, -0.6, 0, 1, 1, 1, 0, t * 0.3, 0),
            label: "depth-outline-inner-dais"
          },
          {
            geometry: heroTorus,
            material: farGoldMaterial,
            modelMatrix: composeTransform(0, 0.14, 0, 1, 1, 1, 0.48 + Math.sin(t * 0.9) * 0.22, t * 0.7, 0.2),
            label: "depth-outline-hero-torus"
          },
          {
            geometry: outerRing,
            material: copperRingMaterial,
            modelMatrix: composeTransform(0, 0.12, 0, 1, 1, 1, -0.65 + Math.cos(t * 0.75) * 0.2, -t * 0.55, -0.3),
            label: "depth-outline-outer-ring"
          },
          {
            geometry: nearSphere,
            material: nearCyanMaterial,
            modelMatrix: composeTransform(-0.56 + Math.sin(t * 1.1) * 0.1, 0.16 + Math.cos(t * 1.4) * 0.08, -0.42, 1, 1, 1, 0, t, 0),
            label: "depth-outline-near-cyan"
          },
          {
            geometry: midCube,
            material: midVioletMaterial,
            modelMatrix: composeTransform(0.02, 0.04 + Math.sin(t * 1.3) * 0.06, 0.02, 0.92, 0.92, 0.92, 0.25, t * 0.85, 0.18),
            label: "depth-outline-mid-violet"
          },
          {
            geometry: farSphere,
            material: farGoldMaterial,
            modelMatrix: composeTransform(0.58, -0.06 + Math.sin(t * 1.2 + 1.2) * 0.08, 0.42, 0.94, 0.94, 0.94, 0, -t * 0.6, 0),
            label: "depth-outline-far-orange"
          },
          {
            geometry: accentColumn,
            material: columnSilverMaterial,
            modelMatrix: composeTransform(-0.88, -0.04, 0.48, 1, 1, 1, 0, t * 0.4, 0),
            label: "depth-outline-column-left"
          },
          {
            geometry: accentColumn,
            material: columnSilverMaterial,
            modelMatrix: composeTransform(0.88, -0.04, -0.48, 1, 1, 1, 0, -t * 0.4, 0),
            label: "depth-outline-column-right"
          }
        ],
        postprocess: DEPTH_OUTLINE_POSTPROCESS_OPTIONS
      });

      if (metrics.nonDark === 0 || now - lastMetricSample >= 1200) {
        const pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
        metrics = pixelMetrics(pixels, WIDTH, HEIGHT);
        lastMetricSample = now;
      }

      runtime = createRuntime(startedAt, "running", {
        frameCount,
        drawCalls: diagnostics.drawCalls,
        fps,
        outputNonDarkPixels: metrics.nonDark,
        outputColorBuckets: metrics.colorBuckets,
        edgeContrastPixels: metrics.edgeContrast
      });
      window.__a3dCurrentRoutesPostprocessingDepthOutline = runtime;
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

function pixelMetrics(pixels: Uint8Array, width: number, height: number): { readonly nonDark: number; readonly colorBuckets: number; readonly edgeContrast: number } {
  let nonDark = 0;
  let edgeContrast = 0;
  const buckets = new Set<string>();
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (luma > 18) nonDark += 1;
      buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      if (x + 4 < width) {
        const neighbor = (y * width + x + 4) * 4;
        const nr = pixels[neighbor] ?? 0;
        const ng = pixels[neighbor + 1] ?? 0;
        const nb = pixels[neighbor + 2] ?? 0;
        if (Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb) > 55) edgeContrast += 1;
      }
    }
  }
  return { nonDark, colorBuckets: buckets.size, edgeContrast };
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesPostprocessingDepthOutlineRuntime["status"],
  patch: Partial<Omit<CurrentRoutesPostprocessingDepthOutlineRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "postprocessChain" | "outlineEnabled" | "depthOfFieldEnabled" | "ssaoEnabled">> = {}
): CurrentRoutesPostprocessingDepthOutlineRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 60,
    postprocessChain: POSTPROCESS_CHAIN,
    outlineEnabled: true,
    depthOfFieldEnabled: true,
    ssaoEnabled: true,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    edgeContrastPixels: patch.edgeContrastPixels ?? 0,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function composeTransform(
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

function renderUi(root: HTMLElement, runtime: CurrentRoutesPostprocessingDepthOutlineRuntime): void {
  root.innerHTML = `
    <section class="panel" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <h1>Aura3D 4.0 · Depth Outline Post-Processing</h1>
        <p>Renderer-owned depth-of-field, SSAO, outline, tone mapping, and FXAA on 3D PBR meshes.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button" style="min-width:96px;width:auto;padding:8px 14px;border-radius:999px;">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Depth of field", runtime.depthOfFieldEnabled ? "on" : "off")}
      ${metric("SSAO", runtime.ssaoEnabled ? "on" : "off")}
      ${metric("Outline", runtime.outlineEnabled ? "on" : "off")}
      ${metric("Non-dark", runtime.outputNonDarkPixels)}
      ${metric("Buckets", runtime.outputColorBuckets)}
      ${metric("Edges", runtime.edgeContrastPixels)}
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

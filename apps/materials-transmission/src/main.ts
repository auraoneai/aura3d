import {
  Geometry,
  PBRMaterial,
  RenderDeviceError,
  UnlitMaterial,
  type CollectedLight
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dV8MaterialsTransmission?: V8MaterialsTransmissionRuntime;
  }
}

interface V8MaterialsTransmissionRuntime {
  readonly appId: "materials-transmission";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly transmissionFactor: number;
  readonly ior: number;
  readonly volumeThicknessFactor: number;
  readonly attenuationBlueBias: number;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "materials-transmission" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const TRANSMISSION_FACTOR = 0.92;
const IOR = 1.52;
const VOLUME_THICKNESS = 0.72;
const ATTENUATION_COLOR = [0.58, 0.82, 1] as const;

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
    window.__a3dV8MaterialsTransmission = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.012, 0.014, 0.018, 1]
    });
    const sphere = Geometry.uvSphere(0.46, 48, 24);
    const backdrop = Geometry.triangle();
    const glass = new PBRMaterial({
      name: "transmission-blue-glass",
      baseColor: [0.72, 0.9, 1, 0.68],
      roughness: 0.08,
      metallic: 0,
      clearcoatFactor: 0.72,
      clearcoatRoughnessFactor: 0.04,
      transmissionFactor: TRANSMISSION_FACTOR,
      transmissionFallbackEnergy: 0.22,
      volumeThicknessFactor: VOLUME_THICKNESS,
      volumeAttenuationDistance: 1.7,
      volumeAttenuationColor: ATTENUATION_COLOR,
      transmissionParallaxStrength: 0.48,
      transmissionBounceCount: 2,
      transmissionCausticStrength: 0.28,
      ior: IOR,
      specularFactor: 1,
      renderState: { blend: true, depthWrite: false }
    });
    const warm = new UnlitMaterial({ color: [1, 0.64, 0.24, 1], renderState: { cullMode: "none" } });
    const cool = new UnlitMaterial({ color: [0.18, 0.5, 1, 1], renderState: { cullMode: "none" } });
    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = 0;
    let lastUi = 0;
    let lastMetricSample = 0;
    let metrics = { nonDark: 0, colorBuckets: 0 };

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
        const diagnostics = renderer.render({
          cameraPolicy: "auto-frame",
          cameraPosition: [0, 0, 4.2],
          cameraFrameBounds: { min: [-1.6, -1, -1], max: [1.6, 1, 1] },
          cameraFrameOptions: { yawRadians: -0.26 + Math.sin(now / 1800) * 0.16, pitchRadians: -0.1, paddingRatio: 0.14 },
          renderItems: [
            {
              geometry: backdrop,
              material: warm,
              modelMatrix: multiply(translation(-0.6, -0.1, -0.22), scale(1.45, 1.45, 1)),
              label: "warm-refracted-backdrop"
            },
            {
              geometry: backdrop,
              material: cool,
              modelMatrix: multiply(translation(0.58, 0.22, -0.18), scale(1.02, 1.02, 1)),
              label: "cool-refracted-backdrop"
            },
            {
              geometry: sphere,
              material: glass,
              modelMatrix: multiply(translation(Math.sin(now / 1200) * 0.06, 0.02, 0.05), scale(1.25, 1.25, 1.25)),
              label: "physical-transmission-sphere"
            }
          ],
          collectedLights: createLights(),
          environmentLighting: {
            color: [0.84, 0.9, 1],
            intensity: 0.58,
            proceduralMap: {
              skyColor: [0.55, 0.72, 1],
              horizonColor: [1, 0.82, 0.56],
              groundColor: [0.08, 0.09, 0.12],
              specularColor: [1, 0.94, 0.82],
              intensity: 0.8,
              specularIntensity: 1.15
            }
          },
          postprocess: { toneMapping: { exposure: 1.1, gamma: 1, operator: "reinhard", inputColorSpace: "linear", outputColorSpace: "srgb" }, fxaa: true }
        });
        if (frameCount <= 2 || now - lastMetricSample > 500) {
          metrics = pixelMetrics(renderer.device.readPixels(0, 0, WIDTH, HEIGHT), WIDTH, HEIGHT);
          lastMetricSample = now;
        }
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          outputNonDarkPixels: metrics.nonDark,
          outputColorBuckets: metrics.colorBuckets
        });
        window.__a3dV8MaterialsTransmission = runtime;
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

function createLights(): readonly CollectedLight[] {
  return [
    {
      kind: "directional",
      color: [1, 0.92, 0.78],
      intensity: 2.1,
      position: [2.6, 2.8, 2.2],
      direction: [-0.52, -0.62, -0.58],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff
    },
    {
      kind: "directional",
      color: [0.48, 0.64, 1],
      intensity: 0.8,
      position: [-2, 1.6, 1.2],
      direction: [0.58, -0.24, -0.78],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff
    }
  ];
}

function pixelMetrics(pixels: Uint8Array, width: number, height: number): { readonly nonDark: number; readonly colorBuckets: number } {
  let nonDark = 0;
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
    }
  }
  return { nonDark, colorBuckets: buckets.size };
}

function createRuntime(
  startedAt: number,
  status: V8MaterialsTransmissionRuntime["status"],
  patch: Partial<Omit<V8MaterialsTransmissionRuntime, "appId" | "status" | "renderer" | "elapsedMs" | "transmissionFactor" | "ior" | "volumeThicknessFactor" | "attenuationBlueBias">> = {}
): V8MaterialsTransmissionRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    transmissionFactor: TRANSMISSION_FACTOR,
    ior: IOR,
    volumeThicknessFactor: VOLUME_THICKNESS,
    attenuationBlueBias: ATTENUATION_COLOR[2] - ATTENUATION_COLOR[0],
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function scale(x: number, y: number, z: number): Float32Array {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

function multiply(left: Float32Array, right: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return output;
}

function renderUi(root: HTMLElement, runtime: V8MaterialsTransmissionRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Materials Transmission</h1>
        <p>PBR transmission, IOR, volume attenuation, clearcoat, tone mapping, and FXAA.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Transmission", runtime.transmissionFactor.toFixed(2))}
      ${metric("IOR", runtime.ior.toFixed(2))}
      ${metric("Thickness", runtime.volumeThicknessFactor.toFixed(2))}
      ${metric("Blue bias", runtime.attenuationBlueBias.toFixed(2))}
      ${metric("Non-dark", runtime.outputNonDarkPixels)}
      ${metric("Buckets", runtime.outputColorBuckets)}
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

import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __a3dCurrentRoutesPostprocessingBloom?: CurrentRoutesPostprocessingBloomRuntime;
  }
}

interface CurrentRoutesPostprocessingBloomRuntime {
  readonly appId: "postprocessing-bloom";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly postprocessChain: readonly string[];
  readonly bloomEnabled: boolean;
  readonly preset: "neon-night";
  readonly outputNonDarkPixels: number;
  readonly outputBrightPixels: number;
  readonly renderer: string;
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "postprocessing-bloom" as const;
// §6.8 neon-night preset chain (emissiveStrengthRange [3,8] drives bloom v2).
const POSTPROCESS_CHAIN = [
  "ambient-occlusion",
  "bloom-v2",
  "color-grade",
  "vignette",
  "film-grain",
  "chromatic-aberration",
  "aces",
  "fxaa"
] as const;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = 1280;
  canvas.height = 720;

  const startedAt = performance.now();
  let runtime = createRuntime(startedAt, "ready");
  const publish = (): void => {
    window.__a3dCurrentRoutesPostprocessingBloom = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const app = createAuraApp(canvas, {
      diagnostics: { overlay: false, performancePanel: false },
      output: { preset: "neon-night" },
      scene: scene()
        .background("#04060c")
        .add(primitives.plane({
          name: "dark studio floor",
          material: material.pbr({ color: "#0b0e14", roughness: 0.9, metallic: 0.05 })
        }).position(0, -0.02, 0).rotate(-Math.PI / 2, 0, 0).scale([7, 7, 1]))
        .add(primitives.box({
          name: "back wall panel",
          material: material.pbr({ color: "#0a0d16", roughness: 0.85, metallic: 0.1 })
        }).position(0, 1.35, -1.65).scale([7, 2.9, 0.12]))
        // HDR emissive neon fixtures — intensities inside neon-night's [3,8].
        .add(primitives.torus({
          name: "magenta neon ring",
          material: material.emissive({ color: "#1a0412", emissive: "#ff2ea6", emissiveIntensity: 6.5 })
        }).position(-1.55, 1.6, -1.5).scale(0.62))
        .add(primitives.torus({
          name: "cyan neon ring",
          material: material.emissive({ color: "#021014", emissive: "#22d3ee", emissiveIntensity: 5.2 })
        }).position(0, 1.62, -1.5).scale(0.62))
        .add(primitives.torus({
          name: "amber neon ring",
          material: material.emissive({ color: "#170e02", emissive: "#f59e0b", emissiveIntensity: 4.1 })
        }).position(1.55, 1.6, -1.5).scale(0.62))
        .add(primitives.box({
          name: "violet neon bar left",
          material: material.emissive({ color: "#12041c", emissive: "#a855f7", emissiveIntensity: 7.4 })
        }).position(-2.6, 0.9, -1.45).scale([0.05, 1.6, 0.05]))
        .add(primitives.box({
          name: "teal neon bar right",
          material: material.emissive({ color: "#041414", emissive: "#2dd4bf", emissiveIntensity: 3.4 })
        }).position(2.6, 0.9, -1.45).scale([0.05, 1.6, 0.05]))
        .add(primitives.sphere({
          name: "dim steel sphere",
          material: material.pbr({ color: "#2a3140", roughness: 0.32, metallic: 0.85 })
        }).position(0, 0.42, 0.4).scale(0.42))
        .add(lights.ambient({ intensity: 0.06, color: "#334155" }))
        .add(lights.directional({ position: [-2, 4, 3], intensity: 0.35, color: "#94a3b8" }))
        .add(lights.point({ position: [-1.55, 1.7, -0.9], intensity: 1.4, color: "#ff2ea6" }))
        .add(lights.point({ position: [1.55, 1.7, -0.9], intensity: 1.2, color: "#f59e0b" }))
        .camera(camera.perspective({ position: [0, 1.35, 4.6], target: [0, 1.15, -1.2], fov: 46 }))
    });

    let frameCount = 0;
    let fps = 0;
    let fpsFrames = 0;
    let fpsFrom = performance.now();
    let lastUi = 0;
    let lastMetricSample = 0;
    let metrics = { nonDark: 0, bright: 0 };
    let sampling = false;

    app.onFrame(async ({ dt }) => {
      frameCount += 1;
      fpsFrames += 1;
      const now = performance.now();
      if (now - fpsFrom >= 500) {
        fps = fpsFrames * 1000 / (now - fpsFrom);
        fpsFrames = 0;
        fpsFrom = now;
      }
      if (!sampling && now - lastMetricSample > 500) {
        sampling = true;
        lastMetricSample = now;
        try {
          metrics = await samplePixels(app);
        } catch {
          // capture is best-effort evidence — never fail the frame on it.
        } finally {
          sampling = false;
        }
      }
      if (now - lastUi > 220) {
        const diagnostics = app.diagnostics();
        runtime = createRuntime(startedAt, frameCount <= 2 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          outputNonDarkPixels: metrics.nonDark,
          outputBrightPixels: metrics.bright,
          renderer: diagnostics.renderer?.runtime.backend ?? "a3d-webgl2"
        });
        publish();
        lastUi = now;
      }
      void dt;
    });
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

type BloomApp = ReturnType<typeof createAuraApp>;

async function samplePixels(app: BloomApp): Promise<{ readonly nonDark: number; readonly bright: number }> {
  const bitmap = await app.output.capture({ type: "image-bitmap" });
  if (!(bitmap instanceof ImageBitmap)) return { nonDark: 0, bright: 0 };
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const ctx = probe.getContext("2d");
  if (!ctx) return { nonDark: 0, bright: 0 };
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
  let nonDark = 0;
  let bright = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = (pixels[index] ?? 0) * 0.2126 + (pixels[index + 1] ?? 0) * 0.7152 + (pixels[index + 2] ?? 0) * 0.0722;
    if (luma > 18) nonDark += 1;
    if (luma > 120) bright += 1;
  }
  return { nonDark, bright };
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesPostprocessingBloomRuntime["status"],
  patch: Partial<Omit<CurrentRoutesPostprocessingBloomRuntime, "appId" | "status" | "postprocessChain" | "bloomEnabled" | "preset" | "elapsedMs">> = {}
): CurrentRoutesPostprocessingBloomRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    postprocessChain: POSTPROCESS_CHAIN,
    bloomEnabled: true,
    preset: "neon-night",
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputBrightPixels: patch.outputBrightPixels ?? 0,
    renderer: patch.renderer ?? "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesPostprocessingBloomRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>CurrentRoutes Postprocessing Bloom</h1>
        <p>HDR emissive neon scene on the <code>neon-night</code> preset — bloom v2, ACES, FXAA.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.status)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Preset", runtime.preset)}
      ${metric("Bloom", runtime.bloomEnabled ? "enabled" : "off")}
      ${metric("Non-dark pixels", runtime.outputNonDarkPixels)}
      ${metric("Bright pixels", runtime.outputBrightPixels)}
      ${metric("Chain", runtime.postprocessChain.join(" / "))}
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
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

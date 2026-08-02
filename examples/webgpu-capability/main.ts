import { RenderDeviceError, createRenderDevice, type RenderDeviceDiagnostics } from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_WEBGPU_CAPABILITY__?: WebGPUCapabilityState;
  }
}

interface WebGPUCapabilityState {
  readonly status: "ready";
  readonly renderer: "webgpu" | "unavailable";
  readonly visualClaim: "webgpu-capability-probe";
  readonly availability: "available" | "not-exposed" | "adapter-missing" | "device-error";
  readonly hasNavigatorGpu: boolean;
  readonly adapterName?: string;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly canvasFrame: { readonly width: number; readonly height: number };
  readonly centerPixel: readonly number[];
  readonly gracefulFallback: boolean;
  readonly computeBoundary: {
    readonly computeParticlesClaimed: false;
    readonly computeUseCaseClaimed: false;
    readonly fallbackPath: "cpu-webgl2-particles";
    readonly requiredEvidence: "real-webgpu-compute-browser-run";
  };
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
}

const canvasWidth = 960;
const canvasHeight = 540;

if (typeof document !== "undefined") {
  void run();
}

async function run(): Promise<void> {
  installStyles();
  const shell = createShell();
  const context = require2d(shell.canvas);
  const state = await probeWebGPU(shell.canvas, context);
  window.__AURA3D_WEBGPU_CAPABILITY__ = state;
  shell.status.textContent = JSON.stringify(state, null, 2);
}

async function probeWebGPU(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): Promise<WebGPUCapabilityState> {
  const hasNavigatorGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
  const baseState = {
    status: "ready" as const,
    visualClaim: "webgpu-capability-probe" as const,
    hasNavigatorGpu,
    canvasFrame: { width: canvas.width, height: canvas.height },
    knownLimits: [
      "This example validates WebGPU availability and failure handling only.",
      "It does not claim full WebGPU renderer parity with WebGL2.",
      "It does not claim WebGPU compute particles or another compute-backed runtime feature.",
      "When a browser exposes WebGPU but returns no adapter, the page stays usable and records the unsupported case."
    ],
    computeBoundary: {
      computeParticlesClaimed: false,
      computeUseCaseClaimed: false,
      fallbackPath: "cpu-webgl2-particles" as const,
      requiredEvidence: "real-webgpu-compute-browser-run" as const
    }
  };

  if (!hasNavigatorGpu) {
    drawUnavailable(context, canvas, "navigator.gpu is not exposed");
    return {
      ...baseState,
      renderer: "unavailable",
      availability: "not-exposed",
      centerPixel: readCanvasPixel(context, canvas),
      gracefulFallback: true,
      errors: ["navigator.gpu is not exposed by this browser/runtime"]
    };
  }

  try {
    const device = await createRenderDevice({ backend: "webgpu", canvas });
    device.beginFrame(canvas.width, canvas.height);
    device.clear([0.02, 0.09, 0.11, 1]);
    device.endFrame();
    const diagnostics = device.getDiagnostics();
    const centerPixel = Array.from(device.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1));
    drawAvailable(context, canvas, device.info.renderer);
    device.dispose();
    return {
      ...baseState,
      renderer: "webgpu",
      availability: "available",
      adapterName: device.info.renderer,
      diagnostics,
      centerPixel,
      gracefulFallback: false,
      errors: []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof RenderDeviceError ? error.code : "";
    const availability = code === "WEBGPU_ADAPTER_MISSING" ? "adapter-missing" : "device-error";
    drawUnavailable(context, canvas, message);
    return {
      ...baseState,
      renderer: "unavailable",
      availability,
      centerPixel: readCanvasPixel(context, canvas),
      gracefulFallback: true,
      errors: [message]
    };
  }
}

function createShell(): { readonly canvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="webgpu-capability-canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
    <section>
      <h1>WebGPU Capability Probe</h1>
      <pre data-testid="webgpu-capability-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("[data-testid='webgpu-capability-status']")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0b1116; color: #eef4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { display: block; width: 100%; height: min(72vh, 620px); background: #101920; }
    section { display: grid; grid-template-columns: minmax(12rem, 0.45fr) minmax(20rem, 1fr); gap: 1rem; padding: 1rem 1.25rem; border-top: 1px solid #26343e; background: #121b22; }
    h1 { margin: 0; font-size: 1rem; line-height: 1.3; }
    pre { margin: 0; overflow: auto; color: #bfe8c8; font-size: 0.8125rem; line-height: 1.45; }
    @media (max-width: 760px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D canvas context is required for WebGPU capability fallback presentation.");
  }
  return context;
}

function drawUnavailable(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, reason: string): void {
  drawBase(context, canvas);
  context.fillStyle = "#f2c94c";
  context.fillRect(126, 130, 708, 160);
  context.fillStyle = "#111820";
  context.font = "700 42px ui-sans-serif, system-ui, sans-serif";
  context.fillText("WebGPU unavailable", 164, 204);
  context.font = "20px ui-sans-serif, system-ui, sans-serif";
  context.fillText(clampText(reason, 64), 166, 250);
  context.fillStyle = "#5fd0ff";
  context.fillRect(126, 334, 220, 58);
  context.fillStyle = "#111820";
  context.font = "700 20px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Graceful fallback", 150, 370);
}

function drawAvailable(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, adapterName: string): void {
  drawBase(context, canvas);
  context.fillStyle = "#51d88a";
  context.fillRect(126, 130, 708, 160);
  context.fillStyle = "#0c1511";
  context.font = "700 42px ui-sans-serif, system-ui, sans-serif";
  context.fillText("WebGPU adapter ready", 164, 204);
  context.font = "20px ui-sans-serif, system-ui, sans-serif";
  context.fillText(clampText(adapterName, 64), 166, 250);
}

function drawBase(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#0d151c");
  gradient.addColorStop(1, "#13242b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#263d48";
  context.lineWidth = 2;
  for (let x = 40; x < canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 44; y < canvas.height; y += 80) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
}

function readCanvasPixel(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): readonly number[] {
  return Array.from(context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

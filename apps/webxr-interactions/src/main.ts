import { WebXRSessionController, type A3DXRFrameLike, type A3DXRSessionLike, type A3DXRSessionMode, type A3DXRSystemLike } from "@aura3d/input";

declare global {
  interface Window {
    __a3dV8WebXRInteractions?: V8WebXRInteractionsRuntime;
  }
}

interface V8WebXRInteractionsRuntime {
  readonly appId: "webxr-interactions";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly xrSessionStarted: boolean;
  readonly xrModeCount: number;
  readonly controllerCount: number;
  readonly triggerPressedCount: number;
  readonly ballShots: number;
  readonly draggedObjects: number;
  readonly arCones: number;
  readonly hitTestCount: number;
  readonly referenceSpaces: number;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly evidenceMode: "injected-webxr-session";
  readonly realDeviceClaimed: false;
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "webxr-interactions" as const;
const SIZE = 720;
const BASE_SIZE = 260;

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }

  const startedAt = performance.now();
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let runtime = createRuntime("ready", "Ready", startedAt);

  const publish = (): void => {
    window.__a3dV8WebXRInteractions = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const modes: readonly A3DXRSessionMode[] = ["immersive-vr", "immersive-ar", "inline"];
    const samples = [];
    for (const mode of modes) {
      const controller = new WebXRSessionController({
        xr: createInjectedXR(mode),
        mode,
        requiredFeatures: mode === "immersive-ar" ? ["hit-test"] : ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking"],
        referenceSpace: mode === "immersive-ar" ? "viewer" : "local-floor"
      });
      const start = await controller.start();
      const sample = controller.sampleFrame(createFrame(), "route-hit-test-source");
      await controller.end();
      samples.push({ mode, start, sample });
    }

    const vrSample = samples.find((item) => item.mode === "immersive-vr")!.sample;
    const arSample = samples.find((item) => item.mode === "immersive-ar")!.sample;
    const ballShots = vrSample.controllers.filter((controller) => controller.triggerPressed).length;
    const draggedObjects = vrSample.controllers.filter((controller) => controller.squeezePressed || controller.primaryValue > 0.5).length;
    const arCones = arSample.hitTestCount;
    let pixelStats = drawPreview(canvas, ballShots, draggedObjects, arCones, 0);

    const render = (now: number): void => {
      frameCount += 1;
      fpsFrames += 1;
      if (fpsFrom === 0) fpsFrom = now;
      if (now - fpsFrom >= 500) {
        fps = fpsFrames * 1000 / (now - fpsFrom);
        fpsFrames = 0;
        fpsFrom = now;
      }
      if (frameCount === 1 || frameCount % 2 === 0) {
        pixelStats = drawPreview(canvas, ballShots, draggedObjects, arCones, now / 1000);
      }
      runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
        frameCount,
        drawCalls: ballShots + draggedObjects + arCones,
        fps,
        xrSessionStarted: samples.every((item) => item.start.started),
        xrModeCount: samples.length,
        controllerCount: Math.max(...samples.map((item) => item.sample.controllerCount)),
        triggerPressedCount: ballShots,
        ballShots,
        draggedObjects,
        arCones,
        hitTestCount: arSample.hitTestCount,
        referenceSpaces: new Set(samples.map((item) => item.start.referenceSpace)).size,
        outputNonDarkPixels: pixelStats.nonDark,
        outputColorBuckets: pixelStats.buckets
      });
      window.__a3dV8WebXRInteractions = runtime;
      if (frameCount === 1 || frameCount % 12 === 0) publish();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createInjectedXR(mode: A3DXRSessionMode): A3DXRSystemLike {
  return {
    async isSessionSupported(requestedMode) {
      return requestedMode === mode;
    },
    async requestSession(requestedMode) {
      if (requestedMode !== mode) throw new Error(`Injected XR runtime only supports ${mode}.`);
      return createSession(mode);
    }
  };
}

function createSession(mode: A3DXRSessionMode): A3DXRSessionLike {
  return {
    inputSources: mode === "immersive-ar" ? [rightController()] : [leftController(), rightController()],
    async requestReferenceSpace(type) {
      return { type };
    },
    requestAnimationFrame(callback) {
      callback(performance.now(), createFrame());
      return 1;
    },
    async end() {}
  };
}

function leftController() {
  return {
    handedness: "left" as const,
    targetRayMode: "tracked-pointer" as const,
    profiles: ["generic-trigger-squeeze"],
    gamepad: {
      buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0 }],
      axes: [-0.2, 0.35]
    }
  };
}

function rightController() {
  return {
    handedness: "right" as const,
    targetRayMode: "tracked-pointer" as const,
    profiles: ["generic-trigger-squeeze"],
    gamepad: {
      buttons: [{ pressed: true, value: 0.86 }, { pressed: true, value: 1 }],
      axes: [0.28, -0.18]
    }
  };
}

function createFrame(): A3DXRFrameLike {
  return {
    getHitTestResults() {
      return [
        { position: [-0.38, 0, -0.8], normal: [0, 1, 0] },
        { position: [0.04, 0, -0.72], normal: [0, 1, 0] },
        { position: [0.44, 0, -0.88], normal: [0, 1, 0] }
      ];
    }
  };
}

function drawPreview(canvas: HTMLCanvasElement, ballShots: number, draggedObjects: number, arCones: number, time: number): { readonly nonDark: number; readonly buckets: number } {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D preview context unavailable.");
  const gradient = context.createLinearGradient(0, 0, SIZE, SIZE);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(1, "#05070b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, SIZE, SIZE);
  context.save();
  context.scale(SIZE / BASE_SIZE, SIZE / BASE_SIZE);
  context.strokeStyle = "rgba(148, 163, 184, 0.26)";
  context.lineWidth = 2;
  context.strokeRect(34, 36, 192, 156);
  drawController(context, 74 + Math.sin(time * 2) * 4, 176, "#60a5fa", ballShots, time);
  drawController(context, 186 + Math.cos(time * 2.2) * 4, 176, "#f59e0b", draggedObjects, time + 0.4);
  for (let index = 0; index < arCones; index += 1) {
    drawCone(context, 82 + index * 48, 94 + Math.sin(time * 2.4 + index) * 5, index % 2 === 0 ? "#67e8f9" : "#fde68a");
  }
  context.fillStyle = "rgba(255, 255, 255, 0.16)";
  context.beginPath();
  context.arc(BASE_SIZE / 2, 118 + Math.sin(time * 1.5) * 5, 22, 0, Math.PI * 2);
  context.fill();
  context.restore();
  return analyzePixels(context.getImageData(0, 0, SIZE, SIZE).data);
}

function drawController(context: CanvasRenderingContext2D, x: number, y: number, color: string, beams: number, time: number): void {
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x - 9, y - 22, 18, 44, 8);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 2;
  for (let index = 0; index < beams; index += 1) {
    context.beginPath();
    context.moveTo(x, y - 18);
    context.lineTo(BASE_SIZE / 2 + (index - 0.5) * 28 + Math.sin(time * 3 + index) * 8, 108 - index * 8);
    context.stroke();
  }
}

function drawCone(context: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x, y - 24);
  context.lineTo(x - 17, y + 20);
  context.lineTo(x + 17, y + 20);
  context.closePath();
  context.fill();
}

function analyzePixels(pixels: Uint8ClampedArray): { readonly nonDark: number; readonly buckets: number } {
  const buckets = new Set<string>();
  let nonDark = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if (r + g + b > 42) nonDark += 1;
    buckets.add(`${Math.floor(r / 32)}:${Math.floor(g / 32)}:${Math.floor(b / 32)}`);
  }
  return { nonDark, buckets: buckets.size };
}

function createRuntime(
  status: V8WebXRInteractionsRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8WebXRInteractionsRuntime, "appId" | "status" | "statusLabel" | "evidenceMode" | "realDeviceClaimed" | "elapsedMs">> = {}
): V8WebXRInteractionsRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    xrSessionStarted: patch.xrSessionStarted ?? false,
    xrModeCount: patch.xrModeCount ?? 0,
    controllerCount: patch.controllerCount ?? 0,
    triggerPressedCount: patch.triggerPressedCount ?? 0,
    ballShots: patch.ballShots ?? 0,
    draggedObjects: patch.draggedObjects ?? 0,
    arCones: patch.arCones ?? 0,
    hitTestCount: patch.hitTestCount ?? 0,
    referenceSpaces: patch.referenceSpaces ?? 0,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    evidenceMode: "injected-webxr-session",
    realDeviceClaimed: false,
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8WebXRInteractionsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 WebXR Interactions</h1>
          <p>Public WebXR session controller for VR controller input, dragging, and AR hit-test placement using injected session evidence.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("modes", runtime.xrModeCount)}
        ${metric("controllers", runtime.controllerCount)}
        ${metric("ball shots", runtime.ballShots)}
        ${metric("dragged", runtime.draggedObjects)}
        ${metric("AR cones", runtime.arCones)}
        ${metric("hit tests", runtime.hitTestCount)}
        ${metric("real device", String(runtime.realDeviceClaimed))}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Evidence mode: ${runtime.evidenceMode}. Real headset/browser XR is still a release blocker.`}</p>
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

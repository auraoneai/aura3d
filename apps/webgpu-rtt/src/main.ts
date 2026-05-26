import {
  createRenderDevice,
  runWebGPURenderToTextureProof,
  type WebGPUAdapterLike,
  type WebGPUBufferDescriptorLike,
  type WebGPUBufferLike,
  type WebGPUDeviceLike,
  type WebGPULike
} from "@aura3d/rendering";

declare global {
  interface Window {
    __a3dCurrentRoutesWebGPURtt?: CurrentRoutesWebGPURttRuntime;
  }
}

interface CurrentRoutesWebGPURttRuntime {
  readonly appId: "webgpu-rtt";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly renderTargetWidth: number;
  readonly renderTargetHeight: number;
  readonly renderTargetFormat: "rgba8";
  readonly hasDepthTexture: boolean;
  readonly targetPixel: readonly number[];
  readonly presentedPixel: readonly number[];
  readonly readbackMatchesPresentation: boolean;
  readonly disposedRenderTargets: number;
  readonly disposedTextures: number;
  readonly renderer: "a3d-webgpu";
  readonly evidenceMode: "injected-webgpu-device";
  readonly elapsedMs: number;
  readonly error?: string;
}

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
}

const APP_ID = "webgpu-rtt" as const;
const SIZE = 512;

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
    window.__a3dCurrentRoutesWebGPURtt = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createRouteWebGPU() });
    const proof = runWebGPURenderToTextureProof(device, {
      width: SIZE,
      height: SIZE,
      label: "webgpu-rtt"
    });
    device.dispose();
    drawPreview(canvas, proof.targetPixels, proof.width, proof.height, 0);

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
        drawPreview(canvas, proof.targetPixels, proof.width, proof.height, now / 1000);
      }
      runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
        frameCount,
        drawCalls: proof.drawCalls,
        fps,
        renderTargetWidth: proof.width,
        renderTargetHeight: proof.height,
        renderTargetFormat: proof.renderTargetFormat,
        hasDepthTexture: proof.hasDepthTexture,
        targetPixel: proof.targetPixel,
        presentedPixel: proof.presentedPixel,
        readbackMatchesPresentation: proof.readbackMatchesPresentation,
        disposedRenderTargets: proof.disposedRenderTargets,
        disposedTextures: proof.disposedTextures
      });
      window.__a3dCurrentRoutesWebGPURtt = runtime;
      if (frameCount === 1 || frameCount % 12 === 0) publish();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createRouteWebGPU(): WebGPULike {
  const device = createRouteWebGPUDevice();
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "webgpu-rtt-adapter",
        info: { vendor: "aura3d-route" },
        async requestDevice() {
          return device;
        }
      };
    }
  };
}

function createRouteWebGPUDevice(): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const target = buffer as FakeWebGPUBuffer;
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(source, offset);
      },
      submit() {}
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        destroy() {
          this.data = new Uint8Array(0);
        }
      };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    createTexture(descriptor) {
      return {
        label: descriptor.label,
        format: descriptor.format,
        createView() {
          return { label: descriptor.label };
        },
        destroy() {}
      };
    },
    destroy() {}
  };
}

function drawPreview(canvas: HTMLCanvasElement, pixels: Uint8Array, width: number, height: number, time: number): void {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D preview context unavailable.");
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  const sweep = (Math.sin(time * 1.8) * 0.5 + 0.5) * width;
  const gradient = context.createRadialGradient(sweep, height * 0.45, 4, sweep, height * 0.45, width * 0.42);
  gradient.addColorStop(0, "rgba(125, 211, 252, 0.42)");
  gradient.addColorStop(0.48, "rgba(96, 165, 250, 0.14)");
  gradient.addColorStop(1, "rgba(96, 165, 250, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255, 255, 255, 0.24)";
  context.lineWidth = Math.max(1, width / 180);
  context.strokeRect(width * 0.12, height * 0.12, width * 0.76, height * 0.76);
}

function createRuntime(
  status: CurrentRoutesWebGPURttRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesWebGPURttRuntime, "appId" | "status" | "statusLabel" | "renderer" | "evidenceMode" | "elapsedMs">> = {}
): CurrentRoutesWebGPURttRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    renderTargetWidth: patch.renderTargetWidth ?? SIZE,
    renderTargetHeight: patch.renderTargetHeight ?? SIZE,
    renderTargetFormat: patch.renderTargetFormat ?? "rgba8",
    hasDepthTexture: patch.hasDepthTexture ?? false,
    targetPixel: patch.targetPixel ?? [],
    presentedPixel: patch.presentedPixel ?? [],
    readbackMatchesPresentation: patch.readbackMatchesPresentation ?? false,
    disposedRenderTargets: patch.disposedRenderTargets ?? 0,
    disposedTextures: patch.disposedTextures ?? 0,
    renderer: "a3d-webgpu",
    evidenceMode: "injected-webgpu-device",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesWebGPURttRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>CurrentRoutes WebGPU RTT</h1>
          <p>Public WebGPU render device creates an offscreen render target, draws into it, reads it back, presents it, and disposes resources.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("target", `${runtime.renderTargetWidth} x ${runtime.renderTargetHeight}`)}
        ${metric("format", runtime.renderTargetFormat)}
        ${metric("depth texture", runtime.hasDepthTexture ? "yes" : "no")}
        ${metric("readback", runtime.readbackMatchesPresentation ? "matches" : "mismatch")}
        ${metric("disposed", `${runtime.disposedRenderTargets} targets / ${runtime.disposedTextures} textures`)}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Evidence mode: ${runtime.evidenceMode}. Center pixel: ${runtime.targetPixel.join(", ")}.`}</p>
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

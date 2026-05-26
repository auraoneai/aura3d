import {
  Geometry,
  InstancedPBRMaterial,
  type WebGPUAdapterLike,
  type WebGPUBufferDescriptorLike,
  type WebGPUBufferLike,
  type WebGPUDeviceLike,
  type WebGPULike,
  type WebGPUSamplerDescriptorLike
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dV8WebGPUInstanceUniform?: V8WebGPUInstanceUniformRuntime;
  }
}

interface V8WebGPUInstanceUniformRuntime {
  readonly appId: "webgpu-instance-uniform";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly instanceCount: number;
  readonly instanceUniformMatrices: number;
  readonly instanceDrawCalls: number;
  readonly nativePbrSubmissions: number;
  readonly nativeInstancedSubmissions: number;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly renderTargetWidth: number;
  readonly renderTargetHeight: number;
  readonly renderer: "a3d-webgpu";
  readonly evidenceMode: "injected-webgpu-device";
  readonly elapsedMs: number;
  readonly error?: string;
}

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
  usage?: "uniform" | "buffer";
}

const APP_ID = "webgpu-instance-uniform" as const;
const SIZE = 640;
const INSTANCE_TRANSFORMS = new Float32Array([
  ...composeMatrix(-0.78, -0.34, 0, 0.45, -0.42),
  ...composeMatrix(-0.24, 0.22, 0, 0.54, 0.22),
  ...composeMatrix(0.34, -0.18, 0, 0.5, -0.08),
  ...composeMatrix(0.82, 0.24, 0, 0.42, 0.36)
]);

function createAnimatedInstanceTransforms(time: number): Float32Array {
  return new Float32Array([
    ...composeMatrix(-0.78, -0.34 + Math.sin(time * 1.8) * 0.08, 0, 0.45, -0.42 + time),
    ...composeMatrix(-0.24, 0.22 + Math.cos(time * 1.5) * 0.06, 0, 0.54, 0.22 - time * 0.8),
    ...composeMatrix(0.34, -0.18 + Math.sin(time * 1.3 + 1) * 0.08, 0, 0.5, -0.08 + time * 0.7),
    ...composeMatrix(0.82, 0.24 + Math.cos(time * 1.7 + 0.5) * 0.06, 0, 0.42, 0.36 - time)
  ]);
}

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
    window.__a3dV8WebGPUInstanceUniform = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      backend: "webgpu",
      webgpu: createRouteWebGPU(),
      width: SIZE,
      height: SIZE,
      clearColor: [0.01, 0.012, 0.016, 1]
    });
    const target = renderer.device.createRenderTarget({
      width: SIZE,
      height: SIZE,
      label: "webgpu-instance-uniform-target",
      format: "rgba8",
      depth: "texture"
    });
    const material = new InstancedPBRMaterial({
      name: "webgpu-instanced-uniform-pbr",
      baseColor: [0.36, 0.66, 0.96, 1],
      metallic: 0.18,
      roughness: 0.34,
      environmentIntensity: 0.5,
      emissiveColor: [0.02, 0.04, 0.08],
      emissiveStrength: 0.5
    });
    let diagnostics = renderer.getDiagnostics();
    let pixelStats = { nonDark: 0, buckets: 0 };

    const render = (now: number): void => {
      frameCount += 1;
      fpsFrames += 1;
      if (fpsFrom === 0) fpsFrom = now;
      if (now - fpsFrom >= 500) {
        fps = fpsFrames * 1000 / (now - fpsFrom);
        fpsFrames = 0;
        fpsFrom = now;
      }
      const animatedTransforms = createAnimatedInstanceTransforms(now / 1000);
      diagnostics = renderer.render({
        renderTarget: target,
        environmentLighting: { color: [0.56, 0.62, 0.76], intensity: 1.3 },
        cameraPosition: [0, 0, 5],
        cameraFrameBounds: { min: [-1.45, -1, -1], max: [1.45, 1, 1] },
        cameraFrameOptions: { yawRadians: -0.18 + Math.sin(now / 1800) * 0.18, pitchRadians: -0.12, paddingRatio: 0.16 },
        renderItems: [{
          geometry: Geometry.litCube(1),
          material,
          instanceTransforms: animatedTransforms,
          label: "webgpu-instanced-uniform-cubes"
        }]
      });
      renderer.device.setRenderTarget(target);
      const pixels = renderer.device.readPixels(0, 0, SIZE, SIZE);
      drawPreview(canvas, pixels, SIZE, SIZE);
      pixelStats = analyzePixels(pixels);
      runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
        frameCount,
        drawCalls: diagnostics.drawCalls,
        fps,
        instanceCount: INSTANCE_TRANSFORMS.length / 16,
        instanceUniformMatrices: INSTANCE_TRANSFORMS.length / 16,
        instanceDrawCalls: diagnostics.drawCalls,
        nativePbrSubmissions: diagnostics.nativePbrSubmissions ?? 0,
        nativeInstancedSubmissions: diagnostics.nativeInstancedSubmissions ?? 0,
        outputNonDarkPixels: pixelStats.nonDark,
        outputColorBuckets: pixelStats.buckets,
        renderTargetWidth: SIZE,
        renderTargetHeight: SIZE
      });
      window.__a3dV8WebGPUInstanceUniform = runtime;
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
    getPreferredCanvasFormat() {
      return "bgra8unorm";
    },
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "webgpu-instance-uniform-adapter",
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
      writeTexture() {},
      submit() {}
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        usage: descriptor.usage & 0x0040 ? "uniform" : "buffer",
        destroy() {
          this.data = new Uint8Array(0);
        }
      };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    createRenderPipeline(descriptor) {
      return {
        label: descriptor.label,
        getBindGroupLayout(index: number) {
          return { index, label: descriptor.label };
        }
      };
    },
    createBindGroup(descriptor) {
      return { label: descriptor.label, entries: descriptor.entries };
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
    createSampler(descriptor?: WebGPUSamplerDescriptorLike) {
      return { descriptor: descriptor ?? {} };
    },
    createCommandEncoder() {
      return {
        beginRenderPass() {
          return {
            setPipeline() {},
            setVertexBuffer() {},
            setBindGroup() {},
            setIndexBuffer() {},
            draw() {},
            drawIndexed() {},
            end() {}
          };
        },
        finish() {
          return {};
        }
      };
    },
    destroy() {}
  };
}

function composeMatrix(tx: number, ty: number, tz: number, scale: number, yaw: number): Float32Array {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c * scale, 0, -s * scale, 0,
    0, scale, 0, 0,
    s * scale, 0, c * scale, 0,
    tx, ty, tz, 1
  ]);
}

function drawPreview(canvas: HTMLCanvasElement, pixels: Uint8Array, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D preview context unavailable.");
  context.imageSmoothingEnabled = true;
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
}

function analyzePixels(pixels: Uint8Array): { readonly nonDark: number; readonly buckets: number } {
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
  status: V8WebGPUInstanceUniformRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8WebGPUInstanceUniformRuntime, "appId" | "status" | "statusLabel" | "renderer" | "evidenceMode" | "elapsedMs">> = {}
): V8WebGPUInstanceUniformRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    instanceCount: patch.instanceCount ?? 0,
    instanceUniformMatrices: patch.instanceUniformMatrices ?? 0,
    instanceDrawCalls: patch.instanceDrawCalls ?? 0,
    nativePbrSubmissions: patch.nativePbrSubmissions ?? 0,
    nativeInstancedSubmissions: patch.nativeInstancedSubmissions ?? 0,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    renderTargetWidth: patch.renderTargetWidth ?? 0,
    renderTargetHeight: patch.renderTargetHeight ?? 0,
    renderer: "a3d-webgpu",
    evidenceMode: "injected-webgpu-device",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8WebGPUInstanceUniformRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 WebGPU Instance Uniform</h1>
          <p>Public InstancedPBRMaterial submitted through one WebGPU instanced draw using per-instance uniform matrices.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("instances", runtime.instanceCount)}
        ${metric("uniform matrices", runtime.instanceUniformMatrices)}
        ${metric("native pbr", runtime.nativePbrSubmissions)}
        ${metric("native instanced", runtime.nativeInstancedSubmissions)}
        ${metric("pixels", runtime.outputNonDarkPixels)}
        ${metric("color buckets", runtime.outputColorBuckets)}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Evidence mode: ${runtime.evidenceMode}. Renderer: ${runtime.renderer}.`}</p>
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

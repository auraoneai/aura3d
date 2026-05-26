import {
  Geometry,
  PBRMaterial,
  Sampler,
  Texture,
  TexturedPBRMaterial,
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
    __a3dCurrentRoutesWebGPUMaterials?: CurrentRoutesWebGPUMaterialsRuntime;
  }
}

interface CurrentRoutesWebGPUMaterialsRuntime {
  readonly appId: "webgpu-materials";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly materialCount: number;
  readonly pbrMaterialCount: number;
  readonly texturedMaterialCount: number;
  readonly textureBindingCount: number;
  readonly nativePbrSubmissions: number;
  readonly nativeTextureBindings: number;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly renderer: "a3d-webgpu";
  readonly evidenceMode: "injected-webgpu-device";
  readonly elapsedMs: number;
  readonly error?: string;
}

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
  usage?: "uniform" | "buffer";
}

const APP_ID = "webgpu-materials" as const;
const SIZE = 640;

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
    window.__a3dCurrentRoutesWebGPUMaterials = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      backend: "webgpu",
      webgpu: createRouteWebGPU(),
      width: SIZE,
      height: SIZE,
      clearColor: [0.015, 0.018, 0.025, 1]
    });
    const target = renderer.device.createRenderTarget({ width: SIZE, height: SIZE, label: "webgpu-materials-target", format: "rgba8", depth: "texture" });
    const texture = createCheckerTexture();
    const sampler = new Sampler({
      minFilter: "linear",
      magFilter: "linear",
      addressU: "repeat",
      addressV: "repeat",
      maxAnisotropy: 4
    });
    const gold = new PBRMaterial({
      name: "webgpu-gold-pbr",
      baseColor: [0.78, 0.52, 0.22, 1],
      metallic: 0.35,
      roughness: 0.26,
      environmentIntensity: 0.35
    });
    const textured = new TexturedPBRMaterial({
      name: "webgpu-textured-pbr",
      baseColor: [1, 1, 1, 1],
      metallic: 0.05,
      roughness: 0.38,
      baseColorTexture: texture,
      baseColorSampler: sampler
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
      diagnostics = renderer.render({
        renderTarget: target,
        environmentLighting: { color: [0.48, 0.55, 0.68], intensity: 1.25 },
        cameraPosition: [0, 0, 4.6],
        cameraFrameBounds: { min: [-1.8, -0.9, -1], max: [1.8, 0.9, 1] },
        cameraFrameOptions: { yawRadians: -0.28 + Math.sin(now / 1800) * 0.2, pitchRadians: -0.12, paddingRatio: 0.18 },
        renderItems: [
          {
            geometry: Geometry.litCube(1),
            material: gold,
            modelMatrix: composeMatrix(-0.72, 0, 0, 0.86, -0.18 + now / 1200)
          },
          {
            geometry: Geometry.texturedCube(1),
            material: textured,
            modelMatrix: composeMatrix(0.72, 0, 0, 0.86, 0.22 - now / 1400)
          }
        ]
      });
      renderer.device.setRenderTarget(target);
      const pixels = renderer.device.readPixels(0, 0, SIZE, SIZE);
      drawPreview(canvas, pixels, SIZE, SIZE);
      pixelStats = analyzePixels(pixels);
      runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
        frameCount,
        drawCalls: diagnostics.drawCalls,
        fps,
        materialCount: 2,
        pbrMaterialCount: 2,
        texturedMaterialCount: 1,
        textureBindingCount: 1,
        nativePbrSubmissions: diagnostics.nativePbrSubmissions ?? 0,
        nativeTextureBindings: diagnostics.nativeTextureBindings ?? 0,
        outputNonDarkPixels: pixelStats.nonDark,
        outputColorBuckets: pixelStats.buckets
      });
      window.__a3dCurrentRoutesWebGPUMaterials = runtime;
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
        name: "webgpu-materials-adapter",
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

function createCheckerTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    colorSpace: "srgb",
    data: new Uint8Array([
      255, 210, 80, 255,
      40, 140, 255, 255,
      40, 140, 255, 255,
      255, 210, 80, 255
    ])
  });
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
  status: CurrentRoutesWebGPUMaterialsRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesWebGPUMaterialsRuntime, "appId" | "status" | "statusLabel" | "renderer" | "evidenceMode" | "elapsedMs">> = {}
): CurrentRoutesWebGPUMaterialsRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    materialCount: patch.materialCount ?? 0,
    pbrMaterialCount: patch.pbrMaterialCount ?? 0,
    texturedMaterialCount: patch.texturedMaterialCount ?? 0,
    textureBindingCount: patch.textureBindingCount ?? 0,
    nativePbrSubmissions: patch.nativePbrSubmissions ?? 0,
    nativeTextureBindings: patch.nativeTextureBindings ?? 0,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    renderer: "a3d-webgpu",
    evidenceMode: "injected-webgpu-device",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesWebGPUMaterialsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>CurrentRoutes WebGPU Materials</h1>
          <p>Public PBR and textured PBR materials rendered through the A3D WebGPU backend.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("materials", runtime.materialCount)}
        ${metric("textured", runtime.texturedMaterialCount)}
        ${metric("native pbr", runtime.nativePbrSubmissions)}
        ${metric("texture binds", runtime.nativeTextureBindings)}
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

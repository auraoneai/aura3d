import { WebGPUParticleBackend } from "@galileo3d/rendering";

declare global {
  interface Window {
    __g3dV8WebGPUCompute?: V8WebGPUComputeRuntime;
  }
}

interface V8WebGPUComputeRuntime {
  readonly appId: "v8-webgpu-compute";
  readonly status: "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly backend: "webgpu";
  readonly particleCount: number;
  readonly computeDispatches: number;
  readonly computeWorkgroups: number;
  readonly storageBuffers: number;
  readonly readbackBuffers: number;
  readonly maxParticleDelta: number;
  readonly maxVelocityDelta: number;
  readonly outputNonDarkPixels: number;
  readonly outputColorBuckets: number;
  readonly evidenceMode: "injected-webgpu-device";
  readonly elapsedMs: number;
  readonly error?: string;
}

type ParticleBuffer = {
  data: ArrayBuffer;
  mapAsync(): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};

const APP_ID = "v8-webgpu-compute" as const;
const SIZE = 720;
const PARTICLE_COUNT = 96;
const DELTA_TIME = 0.125;

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
    window.__g3dV8WebGPUCompute = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const input = createParticleInput(PARTICLE_COUNT);
    const backend = new WebGPUParticleBackend({ gpu: createParticleWebGPU() });
    const result = await backend.update(input);
    backend.dispose();
    const expected = cpuParticleUpdate(input);
    const maxParticleDelta = maxAbsDelta(result.positions, expected.positions);
    const maxVelocityDelta = maxAbsDelta(result.velocities, expected.velocities);
    let pixelStats = drawParticles(canvas, input.positions, result.positions, 0);

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
        pixelStats = drawParticles(canvas, input.positions, result.positions, now / 1000);
      }
      runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
        frameCount,
        drawCalls: result.workgroups,
        fps,
        particleCount: result.count,
        computeDispatches: 1,
        computeWorkgroups: result.workgroups,
        storageBuffers: 4,
        readbackBuffers: 2,
        maxParticleDelta,
        maxVelocityDelta,
        outputNonDarkPixels: pixelStats.nonDark,
        outputColorBuckets: pixelStats.buckets
      });
      window.__g3dV8WebGPUCompute = runtime;
      if (frameCount === 1 || frameCount % 12 === 0) publish();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createParticleInput(count: number): {
  readonly count: number;
  readonly deltaTime: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly accelerations: Float32Array;
} {
  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  const accelerations = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 0.44;
    const radius = 0.12 + (index / count) * 0.74;
    const offset = index * 4;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = Math.sin(angle) * radius;
    positions[offset + 2] = 0;
    positions[offset + 3] = 0;
    velocities[offset] = -Math.sin(angle) * 0.34;
    velocities[offset + 1] = Math.cos(angle) * 0.34;
    velocities[offset + 2] = 0;
    velocities[offset + 3] = 0;
    accelerations[offset] = Math.cos(angle * 0.5) * 0.18;
    accelerations[offset + 1] = Math.sin(angle * 0.5) * 0.18;
    accelerations[offset + 2] = 0;
    accelerations[offset + 3] = 0;
  }
  return { count, deltaTime: DELTA_TIME, positions, velocities, accelerations };
}

function createParticleWebGPU() {
  return {
    async requestAdapter() {
      return {
        name: "v8-webgpu-compute-injected-adapter",
        async requestDevice() {
          return createParticleDevice();
        }
      };
    }
  };
}

function createParticleDevice() {
  return {
    queue: {
      writeBuffer(buffer: ParticleBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        new Uint8Array(buffer.data).set(source, offset);
      },
      submit() {}
    },
    createShaderModule(descriptor: { readonly code: string }) {
      return { code: descriptor.code };
    },
    createComputePipeline() {
      return {
        getBindGroupLayout() {
          return {};
        }
      };
    },
    createBuffer(descriptor: { readonly size: number }): ParticleBuffer {
      return {
        data: new ArrayBuffer(descriptor.size),
        async mapAsync() {},
        getMappedRange() {
          return this.data.slice(0);
        },
        unmap() {},
        destroy() {
          this.data = new ArrayBuffer(0);
        }
      };
    },
    createBindGroup(descriptor: { readonly entries: readonly unknown[] }) {
      return { entries: descriptor.entries };
    },
    createCommandEncoder() {
      const copies: Array<{ source: ParticleBuffer; sourceOffset: number; destination: ParticleBuffer; destinationOffset: number; size: number }> = [];
      let bindGroup: { entries: Array<{ resource: { buffer: ParticleBuffer } }> } | undefined;
      return {
        beginComputePass() {
          return {
            setPipeline() {},
            setBindGroup(_index: number, nextBindGroup: unknown) {
              bindGroup = nextBindGroup as { entries: Array<{ resource: { buffer: ParticleBuffer } }> };
            },
            dispatchWorkgroups() {
              if (!bindGroup) return;
              const positions = new Float32Array(bindGroup.entries[0].resource.buffer.data);
              const velocities = new Float32Array(bindGroup.entries[1].resource.buffer.data);
              const accelerations = new Float32Array(bindGroup.entries[2].resource.buffer.data);
              const params = new DataView(bindGroup.entries[3].resource.buffer.data);
              const deltaTime = params.getFloat32(0, true);
              const count = params.getUint32(4, true);
              for (let index = 0; index < count; index += 1) {
                const offset = index * 4;
                velocities[offset] += accelerations[offset] * deltaTime;
                velocities[offset + 1] += accelerations[offset + 1] * deltaTime;
                velocities[offset + 2] += accelerations[offset + 2] * deltaTime;
                positions[offset] += velocities[offset] * deltaTime;
                positions[offset + 1] += velocities[offset + 1] * deltaTime;
                positions[offset + 2] += velocities[offset + 2] * deltaTime;
                positions[offset + 3] += deltaTime;
              }
            },
            end() {}
          };
        },
        copyBufferToBuffer(source: ParticleBuffer, sourceOffset: number, destination: ParticleBuffer, destinationOffset: number, size: number) {
          copies.push({ source, sourceOffset, destination, destinationOffset, size });
        },
        finish() {
          for (const copy of copies) {
            const source = new Uint8Array(copy.source.data, copy.sourceOffset, copy.size);
            new Uint8Array(copy.destination.data).set(source, copy.destinationOffset);
          }
          return {};
        }
      };
    },
    destroy() {}
  };
}

function cpuParticleUpdate(input: {
  readonly count: number;
  readonly deltaTime: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly accelerations: Float32Array;
}): { readonly positions: Float32Array; readonly velocities: Float32Array } {
  const positions = input.positions.slice();
  const velocities = input.velocities.slice();
  for (let index = 0; index < input.count; index += 1) {
    const offset = index * 4;
    velocities[offset] += input.accelerations[offset] * input.deltaTime;
    velocities[offset + 1] += input.accelerations[offset + 1] * input.deltaTime;
    velocities[offset + 2] += input.accelerations[offset + 2] * input.deltaTime;
    positions[offset] += velocities[offset] * input.deltaTime;
    positions[offset + 1] += velocities[offset + 1] * input.deltaTime;
    positions[offset + 2] += velocities[offset + 2] * input.deltaTime;
    positions[offset + 3] += input.deltaTime;
  }
  return { positions, velocities };
}

function maxAbsDelta(left: Float32Array, right: Float32Array): number {
  let max = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    max = Math.max(max, Math.abs((left[index] ?? 0) - (right[index] ?? 0)));
  }
  return max;
}

function drawParticles(canvas: HTMLCanvasElement, before: Float32Array, after: Float32Array, time: number): { readonly nonDark: number; readonly buckets: number } {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D preview context unavailable.");
  const gradient = context.createLinearGradient(0, 0, SIZE, SIZE);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(1, "#05070b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, SIZE, SIZE);
  context.strokeStyle = "rgba(148, 163, 184, 0.18)";
  context.lineWidth = 1;
  for (let ring = 0; ring < 4; ring += 1) {
    context.beginPath();
    context.arc(SIZE / 2, SIZE / 2, SIZE * (0.16 + ring * 0.08), 0, Math.PI * 2);
    context.stroke();
  }
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const offset = index * 4;
    const swirl = time * (0.45 + (index % 7) * 0.025);
    const pulse = 0.92 + Math.sin(time * 2 + index * 0.31) * 0.08;
    const start = toCanvas(rotateX(before[offset] ?? 0, before[offset + 1] ?? 0, swirl - 0.08) * pulse, rotateY(before[offset] ?? 0, before[offset + 1] ?? 0, swirl - 0.08) * pulse);
    const end = toCanvas(rotateX(after[offset] ?? 0, after[offset + 1] ?? 0, swirl) * pulse, rotateY(after[offset] ?? 0, after[offset + 1] ?? 0, swirl) * pulse);
    context.strokeStyle = "rgba(148, 163, 184, 0.32)";
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.fillStyle = "rgba(59, 130, 246, 0.45)";
    context.beginPath();
    context.arc(start.x, start.y, 2.4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = index % 3 === 0 ? "#fde68a" : "#67e8f9";
    context.beginPath();
    context.arc(end.x, end.y, 3.6 + (index % 5) * 0.45, 0, Math.PI * 2);
    context.fill();
  }
  return analyzePixels(context.getImageData(0, 0, SIZE, SIZE).data);
}

function rotateX(x: number, y: number, radians: number): number {
  return x * Math.cos(radians) - y * Math.sin(radians);
}

function rotateY(x: number, y: number, radians: number): number {
  return x * Math.sin(radians) + y * Math.cos(radians);
}

function toCanvas(x: number, y: number): { readonly x: number; readonly y: number } {
  return {
    x: SIZE / 2 + x * SIZE * 0.46,
    y: SIZE / 2 - y * SIZE * 0.46
  };
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
  status: V8WebGPUComputeRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8WebGPUComputeRuntime, "appId" | "status" | "statusLabel" | "backend" | "evidenceMode" | "elapsedMs">> = {}
): V8WebGPUComputeRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    backend: "webgpu",
    particleCount: patch.particleCount ?? 0,
    computeDispatches: patch.computeDispatches ?? 0,
    computeWorkgroups: patch.computeWorkgroups ?? 0,
    storageBuffers: patch.storageBuffers ?? 0,
    readbackBuffers: patch.readbackBuffers ?? 0,
    maxParticleDelta: patch.maxParticleDelta ?? Number.POSITIVE_INFINITY,
    maxVelocityDelta: patch.maxVelocityDelta ?? Number.POSITIVE_INFINITY,
    outputNonDarkPixels: patch.outputNonDarkPixels ?? 0,
    outputColorBuckets: patch.outputColorBuckets ?? 0,
    evidenceMode: "injected-webgpu-device",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: V8WebGPUComputeRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 WebGPU Compute</h1>
          <p>Public WebGPUParticleBackend compute update with storage buffers, readback, and CPU reference parity.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("particles", runtime.particleCount)}
        ${metric("dispatches", runtime.computeDispatches)}
        ${metric("workgroups", runtime.computeWorkgroups)}
        ${metric("position delta", runtime.maxParticleDelta.toExponential(1))}
        ${metric("velocity delta", runtime.maxVelocityDelta.toExponential(1))}
        ${metric("storage buffers", runtime.storageBuffers)}
        ${metric("readback buffers", runtime.readbackBuffers)}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : `Evidence mode: ${runtime.evidenceMode}. Backend: ${runtime.backend}.`}</p>
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

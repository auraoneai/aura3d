const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

const MAP_MODE = {
  READ: 0x0001,
} as const;

const WORKGROUP_SIZE = 64;

export interface GPUParticleBackendCapabilities {
  supported: boolean;
  backend: "webgpu" | "webgl2" | "none";
  reason?: string;
  adapterName?: string;
}

export interface GPUParticleUpdateInput {
  positions: Float32Array;
  velocities: Float32Array;
  accelerations?: Float32Array;
  deltaTime: number;
  count: number;
}

export interface GPUParticleUpdateResult {
  backend: "webgpu";
  count: number;
  workgroups: number;
  positions: Float32Array;
  velocities: Float32Array;
}

export interface GPUParticleSpawnInput {
  positions: Float32Array;
  velocities: Float32Array;
  accelerations?: Float32Array;
  count: number;
}

export interface GPUParticleSpawnResult {
  backend: "webgpu";
  count: number;
  workgroups: number;
  positions: Float32Array;
  velocities: Float32Array;
  accelerations: Float32Array;
}

export interface GPUParticleBackend {
  readonly capabilities: GPUParticleBackendCapabilities;
  initialize(): Promise<void>;
  spawn?(input: GPUParticleSpawnInput): Promise<GPUParticleSpawnResult>;
  update(input: GPUParticleUpdateInput): Promise<GPUParticleUpdateResult>;
  dispose(): void;
}

interface WebGPULike {
  requestAdapter(): Promise<WebGPUAdapterLike | null>;
}

interface WebGPUAdapterLike {
  requestDevice(): Promise<WebGPUDeviceLike>;
  name?: string;
  info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  };
}

interface WebGPUDeviceLike {
  queue: WebGPUQueueLike;
  createShaderModule(descriptor: { code: string; label?: string }): WebGPUShaderModuleLike;
  createComputePipeline(descriptor: { label?: string; layout: "auto"; compute: { module: WebGPUShaderModuleLike; entryPoint: string } }): WebGPUComputePipelineLike;
  createBuffer(descriptor: { label?: string; size: number; usage: number; mappedAtCreation?: boolean }): WebGPUBufferLike;
  createBindGroup(descriptor: { label?: string; layout: unknown; entries: readonly WebGPUBindGroupEntryLike[] }): WebGPUBindGroupLike;
  createCommandEncoder(descriptor?: { label?: string }): WebGPUCommandEncoderLike;
  destroy?(): void;
}

interface WebGPUQueueLike {
  writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void;
  submit(commands: readonly unknown[]): void;
}

interface WebGPUShaderModuleLike {}

interface WebGPUComputePipelineLike {
  getBindGroupLayout(index: number): unknown;
}

interface WebGPUBindGroupLike {}

interface WebGPUBindGroupEntryLike {
  binding: number;
  resource: { buffer: WebGPUBufferLike };
}

interface WebGPUBufferLike {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface WebGPUCommandEncoderLike {
  beginComputePass(descriptor?: { label?: string }): WebGPUComputePassEncoderLike;
  copyBufferToBuffer(source: WebGPUBufferLike, sourceOffset: number, destination: WebGPUBufferLike, destinationOffset: number, size: number): void;
  finish(): unknown;
}

interface WebGPUComputePassEncoderLike {
  setPipeline(pipeline: WebGPUComputePipelineLike): void;
  setBindGroup(index: number, bindGroup: WebGPUBindGroupLike): void;
  dispatchWorkgroups(x: number): void;
  end(): void;
}

export interface WebGPUParticleBackendOptions {
  gpu?: WebGPULike;
  shaderSource?: string;
}

export function detectGPUParticleBackend(globalScope: Pick<typeof globalThis, "navigator"> = globalThis): GPUParticleBackendCapabilities {
  const gpu = readWebGPU(globalScope);

  if (gpu) {
    return { supported: true, backend: "webgpu" };
  }

  return {
    supported: false,
    backend: "none",
    reason: "GPU particle simulation requires WebGPU; CPU particles remain the supported path on this runtime.",
  };
}

export async function queryGPUParticleBackendCapabilities(
  globalScope: Pick<typeof globalThis, "navigator"> = globalThis,
): Promise<GPUParticleBackendCapabilities> {
  const gpu = readWebGPU(globalScope);
  if (!gpu) {
    return detectGPUParticleBackend(globalScope);
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    return {
      supported: false,
      backend: "webgpu",
      reason: "WebGPU exists but no adapter was granted for particle simulation.",
    };
  }

  return {
    supported: true,
    backend: "webgpu",
    adapterName: describeAdapter(adapter),
  };
}

export function createGPUParticleBackend(options: WebGPUParticleBackendOptions = {}): GPUParticleBackend {
  const gpu = options.gpu ?? readWebGPU(globalThis);
  return gpu ? new WebGPUParticleBackend({ ...options, gpu }) : new UnsupportedGPUParticleBackend();
}

export class UnsupportedGPUParticleBackend implements GPUParticleBackend {
  readonly capabilities: GPUParticleBackendCapabilities;

  constructor(capabilities: GPUParticleBackendCapabilities = detectGPUParticleBackend()) {
    this.capabilities = capabilities.supported
      ? {
          supported: false,
          backend: capabilities.backend,
          reason: "GPU particle simulation is not supported by the current runtime configuration.",
        }
      : capabilities;
  }

  async initialize(): Promise<void> {
    throw new Error(this.capabilities.reason ?? "GPU particle simulation is not supported by this runtime.");
  }

  async update(): Promise<GPUParticleUpdateResult> {
    throw new Error(this.capabilities.reason ?? "GPU particle simulation is not supported by this runtime.");
  }

  dispose(): void {
    // No native resources are owned when the backend is unsupported.
  }
}

export class WebGPUParticleBackend implements GPUParticleBackend {
  readonly capabilities: GPUParticleBackendCapabilities = { supported: true, backend: "webgpu" };

  private readonly gpu: WebGPULike;
  private readonly shaderSource: string;
  private adapter: WebGPUAdapterLike | null = null;
  private device: WebGPUDeviceLike | null = null;
  private updatePipeline: WebGPUComputePipelineLike | null = null;
  private spawnPipeline: WebGPUComputePipelineLike | null = null;

  constructor(options: WebGPUParticleBackendOptions = {}) {
    const gpu = options.gpu ?? readWebGPU(globalThis);
    if (!gpu) {
      throw new Error("WebGPUParticleBackend requires a WebGPU-capable runtime or an injected gpu adapter.");
    }

    this.gpu = gpu;
    this.shaderSource = options.shaderSource ?? createDefaultParticleComputeShader();
  }

  async initialize(): Promise<void> {
    if (this.device && this.updatePipeline && this.spawnPipeline) {
      return;
    }

    this.adapter = await this.gpu.requestAdapter();
    if (!this.adapter) {
      throw new Error("WebGPU adapter request failed for particle simulation.");
    }

    this.device = await this.adapter.requestDevice();
    const module = this.device.createShaderModule({
      label: "aura3d-particles-update",
      code: this.shaderSource,
    });
    this.updatePipeline = this.device.createComputePipeline({
      label: "aura3d-particles-update",
      layout: "auto",
      compute: {
        module,
        entryPoint: "main",
      },
    });
    this.spawnPipeline = this.device.createComputePipeline({
      label: "aura3d-particles-spawn",
      layout: "auto",
      compute: {
        module,
        entryPoint: "spawn_main",
      },
    });
  }

  async spawn(input: GPUParticleSpawnInput): Promise<GPUParticleSpawnResult> {
    validateSpawnInput(input);

    if (input.count === 0) {
      return {
        backend: "webgpu",
        count: 0,
        workgroups: 0,
        positions: input.positions.slice(),
        velocities: input.velocities.slice(),
        accelerations: input.accelerations?.slice() ?? new Float32Array(),
      };
    }

    await this.initialize();
    const device = this.requireDevice();
    const pipeline = this.requireSpawnPipeline();
    const byteLength = input.count * 4 * Float32Array.BYTES_PER_ELEMENT;

    const positionBuffer = createStorageBuffer(device, "aura3d-particles-spawn-positions", byteLength);
    const velocityBuffer = createStorageBuffer(device, "aura3d-particles-spawn-velocities", byteLength);
    const accelerationBuffer = createStorageBuffer(device, "aura3d-particles-spawn-accelerations", byteLength);
    const paramsBuffer = device.createBuffer({
      label: "aura3d-particles-spawn-params",
      size: 16,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });
    const positionReadback = createReadbackBuffer(device, "aura3d-particles-spawn-positions-readback", byteLength);
    const velocityReadback = createReadbackBuffer(device, "aura3d-particles-spawn-velocities-readback", byteLength);
    const accelerationReadback = createReadbackBuffer(device, "aura3d-particles-spawn-accelerations-readback", byteLength);

    try {
      device.queue.writeBuffer(positionBuffer, 0, viewParticleSlice(input.positions, input.count));
      device.queue.writeBuffer(velocityBuffer, 0, viewParticleSlice(input.velocities, input.count));
      device.queue.writeBuffer(accelerationBuffer, 0, viewParticleSlice(input.accelerations ?? new Float32Array(input.count * 4), input.count));
      device.queue.writeBuffer(paramsBuffer, 0, createParamsBuffer(0, input.count));

      const bindGroup = device.createBindGroup({
        label: "aura3d-particles-spawn-bind-group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: positionBuffer } },
          { binding: 1, resource: { buffer: velocityBuffer } },
          { binding: 2, resource: { buffer: accelerationBuffer } },
          { binding: 3, resource: { buffer: paramsBuffer } },
        ],
      });
      const commandEncoder = device.createCommandEncoder({ label: "aura3d-particles-spawn-encoder" });
      const computePass = commandEncoder.beginComputePass({ label: "aura3d-particles-spawn-pass" });
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(input.count / WORKGROUP_SIZE);
      computePass.dispatchWorkgroups(workgroups);
      computePass.end();
      commandEncoder.copyBufferToBuffer(positionBuffer, 0, positionReadback, 0, byteLength);
      commandEncoder.copyBufferToBuffer(velocityBuffer, 0, velocityReadback, 0, byteLength);
      commandEncoder.copyBufferToBuffer(accelerationBuffer, 0, accelerationReadback, 0, byteLength);

      device.queue.submit([commandEncoder.finish()]);

      const [positions, velocities, accelerations] = await Promise.all([
        readFloat32Buffer(positionReadback, byteLength),
        readFloat32Buffer(velocityReadback, byteLength),
        readFloat32Buffer(accelerationReadback, byteLength),
      ]);

      return {
        backend: "webgpu",
        count: input.count,
        workgroups,
        positions,
        velocities,
        accelerations,
      };
    } finally {
      positionBuffer.destroy();
      velocityBuffer.destroy();
      accelerationBuffer.destroy();
      paramsBuffer.destroy();
      positionReadback.destroy();
      velocityReadback.destroy();
      accelerationReadback.destroy();
    }
  }

  async update(input: GPUParticleUpdateInput): Promise<GPUParticleUpdateResult> {
    validateUpdateInput(input);

    if (input.count === 0) {
      return {
        backend: "webgpu",
        count: 0,
        workgroups: 0,
        positions: input.positions.slice(),
        velocities: input.velocities.slice(),
      };
    }

    await this.initialize();
    const device = this.requireDevice();
    const pipeline = this.requireUpdatePipeline();
    const byteLength = input.count * 4 * Float32Array.BYTES_PER_ELEMENT;

    const positionBuffer = createStorageBuffer(device, "aura3d-particles-positions", byteLength);
    const velocityBuffer = createStorageBuffer(device, "aura3d-particles-velocities", byteLength);
    const accelerationBuffer = createStorageBuffer(device, "aura3d-particles-accelerations", byteLength);
    const paramsBuffer = device.createBuffer({
      label: "aura3d-particles-params",
      size: 16,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });
    const positionReadback = createReadbackBuffer(device, "aura3d-particles-positions-readback", byteLength);
    const velocityReadback = createReadbackBuffer(device, "aura3d-particles-velocities-readback", byteLength);

    try {
      device.queue.writeBuffer(positionBuffer, 0, viewParticleSlice(input.positions, input.count));
      device.queue.writeBuffer(velocityBuffer, 0, viewParticleSlice(input.velocities, input.count));
      device.queue.writeBuffer(accelerationBuffer, 0, viewParticleSlice(input.accelerations ?? new Float32Array(input.count * 4), input.count));
      device.queue.writeBuffer(paramsBuffer, 0, createParamsBuffer(input.deltaTime, input.count));

      const bindGroup = device.createBindGroup({
        label: "aura3d-particles-update-bind-group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: positionBuffer } },
          { binding: 1, resource: { buffer: velocityBuffer } },
          { binding: 2, resource: { buffer: accelerationBuffer } },
          { binding: 3, resource: { buffer: paramsBuffer } },
        ],
      });
      const commandEncoder = device.createCommandEncoder({ label: "aura3d-particles-update-encoder" });
      const computePass = commandEncoder.beginComputePass({ label: "aura3d-particles-update-pass" });
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(input.count / WORKGROUP_SIZE);
      computePass.dispatchWorkgroups(workgroups);
      computePass.end();
      commandEncoder.copyBufferToBuffer(positionBuffer, 0, positionReadback, 0, byteLength);
      commandEncoder.copyBufferToBuffer(velocityBuffer, 0, velocityReadback, 0, byteLength);

      device.queue.submit([commandEncoder.finish()]);

      const [positions, velocities] = await Promise.all([
        readFloat32Buffer(positionReadback, byteLength),
        readFloat32Buffer(velocityReadback, byteLength),
      ]);

      return {
        backend: "webgpu",
        count: input.count,
        workgroups,
        positions,
        velocities,
      };
    } finally {
      positionBuffer.destroy();
      velocityBuffer.destroy();
      accelerationBuffer.destroy();
      paramsBuffer.destroy();
      positionReadback.destroy();
      velocityReadback.destroy();
    }
  }

  dispose(): void {
    this.updatePipeline = null;
    this.spawnPipeline = null;
    this.adapter = null;
    this.device?.destroy?.();
    this.device = null;
  }

  private requireDevice(): WebGPUDeviceLike {
    if (!this.device) {
      throw new Error("WebGPU particle backend was not initialized.");
    }
    return this.device;
  }

  private requireUpdatePipeline(): WebGPUComputePipelineLike {
    if (!this.updatePipeline) {
      throw new Error("WebGPU particle update compute pipeline was not initialized.");
    }
    return this.updatePipeline;
  }

  private requireSpawnPipeline(): WebGPUComputePipelineLike {
    if (!this.spawnPipeline) {
      throw new Error("WebGPU particle spawn compute pipeline was not initialized.");
    }
    return this.spawnPipeline;
  }
}

function readWebGPU(globalScope: Pick<typeof globalThis, "navigator">): WebGPULike | undefined {
  return (globalScope.navigator as Navigator & { gpu?: WebGPULike } | undefined)?.gpu;
}

function describeAdapter(adapter: WebGPUAdapterLike): string | undefined {
  if (adapter.name) {
    return adapter.name;
  }

  if (!adapter.info) {
    return undefined;
  }

  const parts = [adapter.info.vendor, adapter.info.architecture, adapter.info.device, adapter.info.description].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function validateUpdateInput(input: GPUParticleUpdateInput): void {
  if (!Number.isFinite(input.deltaTime) || input.deltaTime < 0) {
    throw new RangeError("GPU particle deltaTime must be a finite non-negative number.");
  }

  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new RangeError("GPU particle count must be a non-negative integer.");
  }

  const requiredFloats = input.count * 4;
  if (input.positions.length < requiredFloats || input.velocities.length < requiredFloats) {
    throw new RangeError("GPU particle positions and velocities must provide vec4 values for each particle.");
  }
  if (input.accelerations && input.accelerations.length < requiredFloats) {
    throw new RangeError("GPU particle accelerations must provide vec4 values for each particle.");
  }
}

function validateSpawnInput(input: GPUParticleSpawnInput): void {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new RangeError("GPU particle spawn count must be a non-negative integer.");
  }

  const requiredFloats = input.count * 4;
  if (input.positions.length < requiredFloats || input.velocities.length < requiredFloats) {
    throw new RangeError("GPU particle spawn positions and velocities must provide vec4 values for each particle.");
  }
  if (input.accelerations && input.accelerations.length < requiredFloats) {
    throw new RangeError("GPU particle spawn accelerations must provide vec4 values for each particle.");
  }
}

function createStorageBuffer(device: WebGPUDeviceLike, label: string, size: number): WebGPUBufferLike {
  return device.createBuffer({
    label,
    size,
    usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC,
  });
}

function createReadbackBuffer(device: WebGPUDeviceLike, label: string, size: number): WebGPUBufferLike {
  return device.createBuffer({
    label,
    size,
    usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST,
  });
}

function viewParticleSlice(values: Float32Array, count: number): Float32Array {
  const floatCount = count * 4;
  return values.byteOffset === 0 && values.length === floatCount ? values : values.slice(0, floatCount);
}

function createParamsBuffer(deltaTime: number, count: number): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setFloat32(0, deltaTime, true);
  view.setUint32(4, count, true);
  return buffer;
}

async function readFloat32Buffer(buffer: WebGPUBufferLike, byteLength: number): Promise<Float32Array> {
  await buffer.mapAsync(MAP_MODE.READ);
  const mapped = buffer.getMappedRange();
  const copy = mapped.slice(0, byteLength);
  buffer.unmap();
  return new Float32Array(copy);
}

function createDefaultParticleComputeShader(): string {
  return `
struct SimParams {
  deltaTime: f32,
  count: u32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> accelerations: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= params.count) {
    return;
  }

  velocities[index].xyz = velocities[index].xyz + accelerations[index].xyz * params.deltaTime;
  positions[index].xyz = positions[index].xyz + velocities[index].xyz * params.deltaTime;
  positions[index].w = positions[index].w + params.deltaTime;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn spawn_main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= params.count) {
    return;
  }

  positions[index] = positions[index];
  velocities[index] = velocities[index];
}
`;
}

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
  /**
   * Optional A4 effect set (wind, curl turbulence, analytic planes,
   * heightfield ground, sub-emitters, life curves, lighting, trails).
   * Absent = the proven legacy advection path, bit-identical to before.
   * Honor the velocities.w contract: when effects.lifeCurves is set, the w
   * component of each velocity vec4 carries that particle's lifetime so the
   * kernel can evaluate normalized age on GPU.
   */
  effects?: GPUParticleEffectsInput;
  /**
   * Current per-particle color/size snapshot (count * 8 floats: rgba, then
   * size in the fifth lane) uploaded as the lighting/curve base when
   * effects request life curves or lighting. Omit when effects is absent.
   */
  baseAttributes?: Float32Array;
  /**
   * Previous trail ring (count * depth * 4 floats, newest-first with ages)
   * used to seed the ring so history accumulates across calls. Omit (or pass
   * a short buffer) to start fresh: slot 0 takes the live position/age and
   * older slots start expired. ParticleSystem feeds back the previous
   * result's trailPositions row-per-particle-id for this.
   */
  trailHistory?: Float32Array;
}

export interface GPUParticleUpdateResult {
  backend: "webgpu";
  count: number;
  workgroups: number;
  positions: Float32Array;
  velocities: Float32Array;
  /** Per-particle child-spawn counts; present only when effects requested sub-emitters. */
  spawnRequests?: Uint32Array;
  /**
   * GPU-evaluated size/color-over-life: count * 2 vec4 entries
   * (rgba, then size in x). Present only when effects requested life
   * curves or lighting. A compute kill is signaled as positions w = -1.
   */
  attributes?: Float32Array;
  /** GPU trail ring: count * depth vec4 entries (xyz, age), newest first. */
  trailPositions?: Float32Array;
}

/** Effect flag bits for the extended compute uniform. */
export const GPU_PARTICLE_EFFECT_WIND = 0x01;
export const GPU_PARTICLE_EFFECT_TURBULENCE = 0x02;
export const GPU_PARTICLE_EFFECT_PLANES = 0x04;
export const GPU_PARTICLE_EFFECT_HEIGHTFIELD = 0x08;
export const GPU_PARTICLE_EFFECT_SUB_EMITTERS = 0x10;
export const GPU_PARTICLE_EFFECT_LIFE_CURVES = 0x20;
export const GPU_PARTICLE_EFFECT_LIGHTING = 0x40;
export const GPU_PARTICLE_EFFECT_TRAILS = 0x80;
export const GPU_PARTICLE_EFFECT_SIZE_CURVES = 0x100;

export const GPU_PARTICLE_MAX_PLANES = 3;
export const GPU_PARTICLE_MAX_SUB_EMITTERS = 2;
export const GPU_PARTICLE_CURVE_STOPS = 16;
export const GPU_PARTICLE_UNIFORM_BYTE_LENGTH = 272;

export interface GPUParticleWindEffect {
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
  readonly strength: number;
  readonly gustAmplitude: number;
  readonly gustDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly gustFrequency: number;
  readonly gustSpeed: number;
}

export interface GPUParticleTurbulenceEffect {
  readonly strength: number;
  readonly scale: number;
  readonly flowSpeed: number;
  /** Packed curl-noise LUT, resolution^3 vec4 entries. GPU requires resolution 8. */
  readonly lut: Float32Array;
  readonly lutResolution: number;
}

export interface GPUParticlePlaneEffect {
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly constant: number;
  readonly restitution: number;
  readonly killOnContact: boolean;
}

export interface GPUParticleHeightfieldEffect {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float32Array;
  readonly restitution: number;
  readonly killOnContact: boolean;
}

export interface GPUParticleSubEmitterEffect {
  readonly triggerAge: number;
  readonly chance: number;
  readonly childCount: number;
}

export interface GPUParticleLifeCurvesEffect {
  /**
   * stops RGBA entries (stops * 4 floats). Present when a ColorModule is
   * covered; absent sides are never sampled by the kernel.
   */
  readonly colors?: Float32Array;
  /** stops size entries. Present when a SizeModule is covered. */
  readonly sizes?: Float32Array;
  readonly stops: number;
}

export interface GPUParticleLightingEffect {
  readonly ambient: readonly [number, number, number];
  readonly keyDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly diffuseStrength: number;
}

export interface GPUParticleEffectsInput {
  readonly time?: number;
  readonly seed?: number;
  readonly wind?: GPUParticleWindEffect;
  readonly turbulence?: GPUParticleTurbulenceEffect;
  /** Analytic collision planes, applied in order. Max 3. */
  readonly planes?: readonly GPUParticlePlaneEffect[];
  readonly heightfield?: GPUParticleHeightfieldEffect;
  /** Sub-emitter triggers. Max 2. */
  readonly subEmitters?: readonly GPUParticleSubEmitterEffect[];
  readonly lifeCurves?: GPUParticleLifeCurvesEffect;
  readonly lighting?: GPUParticleLightingEffect;
  /** Trail history depth per particle (1..8). Enables the GPU trail ring. */
  readonly trailPointsPerParticle?: number;
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
  /**
   * True when update() honors GPUParticleUpdateInput.effects (the A4
   * extended compute path). Backends without this flag ignore effects, and
   * ParticleSystem keeps their CPU module hooks running instead.
   */
  readonly supportsEffects?: boolean;
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
  effectsShaderSource?: string;
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
  readonly supportsEffects = true;

  private readonly gpu: WebGPULike;
  private readonly shaderSource: string;
  private readonly effectsShaderSource: string;
  private adapter: WebGPUAdapterLike | null = null;
  private device: WebGPUDeviceLike | null = null;
  private updatePipeline: WebGPUComputePipelineLike | null = null;
  private spawnPipeline: WebGPUComputePipelineLike | null = null;
  private effectsPipeline: WebGPUComputePipelineLike | null = null;

  constructor(options: WebGPUParticleBackendOptions = {}) {
    const gpu = options.gpu ?? readWebGPU(globalThis);
    if (!gpu) {
      throw new Error("WebGPUParticleBackend requires a WebGPU-capable runtime or an injected gpu adapter.");
    }

    this.gpu = gpu;
    this.shaderSource = options.shaderSource ?? createDefaultParticleComputeShader();
    this.effectsShaderSource = options.effectsShaderSource ?? createEffectsParticleComputeShader();
  }

  async initialize(): Promise<void> {
    if (this.device && this.updatePipeline && this.spawnPipeline && this.effectsPipeline) {
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
    const effectsModule = this.device.createShaderModule({
      label: "aura3d-particles-effects",
      code: this.effectsShaderSource,
    });
    this.effectsPipeline = this.device.createComputePipeline({
      label: "aura3d-particles-effects",
      layout: "auto",
      compute: {
        module: effectsModule,
        entryPoint: "main",
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

    if (input.effects) {
      return this.updateWithEffects(input, input.effects);
    }

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

  private async updateWithEffects(
    input: GPUParticleUpdateInput,
    effects: GPUParticleEffectsInput,
  ): Promise<GPUParticleUpdateResult> {
    const plan = encodeGPUParticleEffects(effects, input.deltaTime, input.count);

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
    const pipeline = this.requireEffectsPipeline();
    const count = input.count;
    const byteLength = count * 4 * Float32Array.BYTES_PER_ELEMENT;

    const positionBuffer = createStorageBuffer(device, "aura3d-particles-fx-positions", byteLength);
    const velocityBuffer = createStorageBuffer(device, "aura3d-particles-fx-velocities", byteLength);
    const accelerationBuffer = createStorageBuffer(device, "aura3d-particles-fx-accelerations", byteLength);
    const paramsBuffer = device.createBuffer({
      label: "aura3d-particles-fx-params",
      size: GPU_PARTICLE_UNIFORM_BYTE_LENGTH,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });
    const fieldsBuffer = createStorageBuffer(
      device,
      "aura3d-particles-fx-fields",
      Math.max(plan.fieldData.byteLength, 16),
    );
    const spawnByteLength = Math.max(count * Uint32Array.BYTES_PER_ELEMENT, 4);
    const spawnBuffer = createStorageBuffer(device, "aura3d-particles-fx-spawn-requests", spawnByteLength);
    const trailByteLength = Math.max(count * plan.trailDepth * 4 * Float32Array.BYTES_PER_ELEMENT, 16);
    const trailBuffer = createStorageBuffer(device, "aura3d-particles-fx-trail", trailByteLength);
    const attributeByteLength = Math.max(count * 2 * 4 * Float32Array.BYTES_PER_ELEMENT, 16);
    const attributeBuffer = createStorageBuffer(device, "aura3d-particles-fx-attributes", attributeByteLength);
    const baseAttributeBuffer = createStorageBuffer(device, "aura3d-particles-fx-base-attributes", attributeByteLength);
    const positionReadback = createReadbackBuffer(device, "aura3d-particles-fx-positions-readback", byteLength);
    const velocityReadback = createReadbackBuffer(device, "aura3d-particles-fx-velocities-readback", byteLength);
    const spawnReadback = createReadbackBuffer(device, "aura3d-particles-fx-spawn-readback", spawnByteLength);
    const trailReadback = createReadbackBuffer(device, "aura3d-particles-fx-trail-readback", trailByteLength);
    const attributeReadback = createReadbackBuffer(device, "aura3d-particles-fx-attributes-readback", attributeByteLength);

    try {
      device.queue.writeBuffer(positionBuffer, 0, viewParticleSlice(input.positions, count));
      device.queue.writeBuffer(velocityBuffer, 0, viewParticleSlice(input.velocities, count));
      device.queue.writeBuffer(accelerationBuffer, 0, viewParticleSlice(input.accelerations ?? new Float32Array(count * 4), count));
      device.queue.writeBuffer(paramsBuffer, 0, plan.uniform);
      device.queue.writeBuffer(fieldsBuffer, 0, plan.fieldData);
      device.queue.writeBuffer(spawnBuffer, 0, new Uint32Array(count));
      device.queue.writeBuffer(trailBuffer, 0, snapshotTrailHistory(input.trailHistory, input.positions, count, plan.trailDepth));
      device.queue.writeBuffer(attributeBuffer, 0, new Float32Array(Math.max(count * 8, 4)));
      device.queue.writeBuffer(baseAttributeBuffer, 0, createBaseAttributeSnapshot(input.baseAttributes, count));

      const bindGroup = device.createBindGroup({
        label: "aura3d-particles-fx-bind-group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: positionBuffer } },
          { binding: 1, resource: { buffer: velocityBuffer } },
          { binding: 2, resource: { buffer: accelerationBuffer } },
          { binding: 3, resource: { buffer: paramsBuffer } },
          { binding: 4, resource: { buffer: fieldsBuffer } },
          { binding: 5, resource: { buffer: spawnBuffer } },
          { binding: 6, resource: { buffer: trailBuffer } },
          { binding: 7, resource: { buffer: attributeBuffer } },
          { binding: 8, resource: { buffer: baseAttributeBuffer } },
        ],
      });
      const commandEncoder = device.createCommandEncoder({ label: "aura3d-particles-fx-encoder" });
      const computePass = commandEncoder.beginComputePass({ label: "aura3d-particles-fx-pass" });
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      const workgroups = Math.ceil(count / WORKGROUP_SIZE);
      computePass.dispatchWorkgroups(workgroups);
      computePass.end();
      commandEncoder.copyBufferToBuffer(positionBuffer, 0, positionReadback, 0, byteLength);
      commandEncoder.copyBufferToBuffer(velocityBuffer, 0, velocityReadback, 0, byteLength);
      commandEncoder.copyBufferToBuffer(spawnBuffer, 0, spawnReadback, 0, spawnByteLength);
      commandEncoder.copyBufferToBuffer(trailBuffer, 0, trailReadback, 0, trailByteLength);
      commandEncoder.copyBufferToBuffer(attributeBuffer, 0, attributeReadback, 0, attributeByteLength);

      device.queue.submit([commandEncoder.finish()]);

      const [positions, velocities, spawnRequests, trailPositions, attributes] = await Promise.all([
        readFloat32Buffer(positionReadback, byteLength),
        readFloat32Buffer(velocityReadback, byteLength),
        readUint32Buffer(spawnReadback, spawnByteLength),
        readFloat32Buffer(trailReadback, trailByteLength),
        readFloat32Buffer(attributeReadback, attributeByteLength),
      ]);

      const result: GPUParticleUpdateResult = {
        backend: "webgpu",
        count,
        workgroups,
        positions,
        velocities,
      };
      if (plan.captureSpawnRequests) {
        result.spawnRequests = spawnRequests.slice(0, count);
      }
      if (plan.captureAttributes) {
        result.attributes = attributes.slice(0, count * 8);
      }
      if (plan.captureTrails) {
        result.trailPositions = trailPositions.slice(0, count * plan.trailDepth * 4);
      }
      return result;
    } finally {
      positionBuffer.destroy();
      velocityBuffer.destroy();
      accelerationBuffer.destroy();
      paramsBuffer.destroy();
      fieldsBuffer.destroy();
      spawnBuffer.destroy();
      trailBuffer.destroy();
      attributeBuffer.destroy();
      baseAttributeBuffer.destroy();
      positionReadback.destroy();
      velocityReadback.destroy();
      spawnReadback.destroy();
      trailReadback.destroy();
      attributeReadback.destroy();
    }
  }

  dispose(): void {
    this.updatePipeline = null;
    this.spawnPipeline = null;
    this.effectsPipeline = null;
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

  private requireEffectsPipeline(): WebGPUComputePipelineLike {
    if (!this.effectsPipeline) {
      throw new Error("WebGPU particle effects compute pipeline was not initialized.");
    }
    return this.effectsPipeline;
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

async function readUint32Buffer(buffer: WebGPUBufferLike, byteLength: number): Promise<Uint32Array> {
  await buffer.mapAsync(MAP_MODE.READ);
  const mapped = buffer.getMappedRange();
  const copy = mapped.slice(0, byteLength);
  buffer.unmap();
  return new Uint32Array(copy);
}

export interface EncodedGPUParticleEffects {
  readonly uniform: ArrayBuffer;
  readonly flags: number;
  readonly trailDepth: number;
  readonly captureSpawnRequests: boolean;
  readonly captureAttributes: boolean;
  readonly captureTrails: boolean;
  /**
   * Single read-only field buffer (f32 words) shared by binding 4 so the
   * kernel fits the default maxStorageBuffersPerShaderStage limit of 8:
   * [curl LUT (2048 words when TURB, else 4 zero words),
   *  heights (columns*rows when HEIGHT, else 1 zero word),
   *  life curves (128 words: slots 0..15 color RGBA, 16..31 size in x)].
   */
  readonly fieldData: Float32Array;
}

/**
 * Pure encoder for the extended compute uniform. The 272-byte layout is:
 * header (deltaTime f32 @0, count u32 @4, time f32 @8, flags u32 @12),
 * then 16 vec4 slots: wind, windGust, windTurb, fxCounts, 3x(plane, planeMisc),
 * sub0, sub1, height0, height1, light0, light1. Unit-tested byte-for-byte, and
 * mirrored by the fake devices in tests plus the WGSL kernel below.
 */
export function encodeGPUParticleEffects(
  effects: GPUParticleEffectsInput,
  deltaTime: number,
  count: number,
): EncodedGPUParticleEffects {
  const planes = effects.planes ?? [];
  const subEmitters = effects.subEmitters ?? [];
  if (planes.length > GPU_PARTICLE_MAX_PLANES) {
    throw new RangeError(`GPU particle effects support at most ${GPU_PARTICLE_MAX_PLANES} analytic planes.`);
  }
  if (subEmitters.length > GPU_PARTICLE_MAX_SUB_EMITTERS) {
    throw new RangeError(`GPU particle effects support at most ${GPU_PARTICLE_MAX_SUB_EMITTERS} sub-emitters.`);
  }

  let flags = 0;
  if (effects.wind) flags |= GPU_PARTICLE_EFFECT_WIND;
  if (effects.turbulence) flags |= GPU_PARTICLE_EFFECT_TURBULENCE;
  if (planes.length > 0) flags |= GPU_PARTICLE_EFFECT_PLANES;
  if (effects.heightfield) flags |= GPU_PARTICLE_EFFECT_HEIGHTFIELD;
  if (subEmitters.length > 0) flags |= GPU_PARTICLE_EFFECT_SUB_EMITTERS;
  if (effects.lifeCurves) {
    if (effects.lifeCurves.colors) flags |= GPU_PARTICLE_EFFECT_LIFE_CURVES;
    if (effects.lifeCurves.sizes) flags |= GPU_PARTICLE_EFFECT_SIZE_CURVES;
  }
  if (effects.lighting) flags |= GPU_PARTICLE_EFFECT_LIGHTING;

  const trailDepth = effects.trailPointsPerParticle ?? 1;
  if (!Number.isInteger(trailDepth) || trailDepth < 1 || trailDepth > 8) {
    throw new RangeError("GPU particle trailPointsPerParticle must be an integer in [1, 8].");
  }
  const captureTrails = effects.trailPointsPerParticle !== undefined;
  if (captureTrails) flags |= GPU_PARTICLE_EFFECT_TRAILS;

  const turbulence = effects.turbulence;
  if (turbulence) {
    if (turbulence.lutResolution !== 8) {
      throw new RangeError("GPU particle turbulence requires an 8^3 curl-noise LUT (TURBULENCE_LUT_RESOLUTION).");
    }
    if (turbulence.lut.length < 8 ** 3 * 4) {
      throw new RangeError("GPU particle turbulence LUT must hold 8^3 vec4 entries.");
    }
  }

  const curves = effects.lifeCurves;
  if (curves) {
    if (curves.stops !== GPU_PARTICLE_CURVE_STOPS) {
      throw new RangeError(`GPU particle life curves require exactly ${GPU_PARTICLE_CURVE_STOPS} stops.`);
    }
    if (!curves.colors && !curves.sizes) {
      throw new RangeError("GPU particle life curves need at least a color gradient or a size curve.");
    }
    if (curves.colors && curves.colors.length < curves.stops * 4) {
      throw new RangeError("GPU particle color gradient buffer is smaller than the declared stop count.");
    }
    if (curves.sizes && curves.sizes.length < curves.stops) {
      throw new RangeError("GPU particle size curve buffer is smaller than the declared stop count.");
    }
  }

  const heightfield = effects.heightfield;
  if (heightfield) {
    if (!Number.isInteger(heightfield.columns) || heightfield.columns < 2 ||
        !Number.isInteger(heightfield.rows) || heightfield.rows < 2) {
      throw new RangeError("GPU particle heightfield columns and rows must be integers >= 2.");
    }
    if (!Number.isFinite(heightfield.cellSize) || heightfield.cellSize <= 0) {
      throw new RangeError("GPU particle heightfield cellSize must be a finite positive number.");
    }
    if (heightfield.heights.length < heightfield.columns * heightfield.rows) {
      throw new RangeError("GPU particle heightfield heights are smaller than columns*rows.");
    }
  }

  const buffer = new ArrayBuffer(GPU_PARTICLE_UNIFORM_BYTE_LENGTH);
  const view = new DataView(buffer);
  const setF32 = (offset: number, value: number): void => view.setFloat32(offset, value, true);
  const setU32 = (offset: number, value: number): void => view.setUint32(offset, value, true);
  setF32(0, deltaTime);
  setU32(4, count);
  setF32(8, effects.time ?? 0);
  setU32(12, flags);

  const wind = effects.wind;
  setF32(16, (wind?.direction.x ?? 0) * (wind?.strength ?? 0));
  setF32(20, (wind?.direction.y ?? 0) * (wind?.strength ?? 0));
  setF32(24, (wind?.direction.z ?? 0) * (wind?.strength ?? 0));
  setF32(28, wind?.gustAmplitude ?? 0);
  setF32(32, wind?.gustDirection.x ?? 0);
  setF32(36, wind?.gustDirection.y ?? 0);
  setF32(40, wind?.gustDirection.z ?? 0);
  setF32(44, wind?.gustFrequency ?? 0);
  setF32(48, wind?.gustSpeed ?? 0);
  setF32(52, turbulence?.strength ?? 0);
  setF32(56, turbulence?.scale ?? 0);
  setF32(60, turbulence?.flowSpeed ?? 0);
  setF32(64, trailDepth);
  setF32(68, planes.length);
  setF32(72, heightfield ? 1 : 0);
  setF32(76, subEmitters.length);

  for (let index = 0; index < GPU_PARTICLE_MAX_PLANES; index += 1) {
    const plane = planes[index];
    const base = 80 + index * 32;
    setF32(base, plane?.normal.x ?? 0);
    setF32(base + 4, plane?.normal.y ?? 1);
    setF32(base + 8, plane?.normal.z ?? 0);
    setF32(base + 12, plane?.constant ?? 0);
    setF32(base + 16, plane?.restitution ?? 0.5);
    setF32(base + 20, plane?.killOnContact ? 1 : 0);
    setF32(base + 24, 0);
    setF32(base + 28, 0);
  }

  const sub0 = subEmitters[0];
  const sub1 = subEmitters[1];
  setF32(176, sub0?.triggerAge ?? 2);
  setF32(180, sub0?.chance ?? 0);
  setF32(184, sub0?.childCount ?? 0);
  setF32(188, sub1?.triggerAge ?? 2);
  setF32(192, sub1?.chance ?? 0);
  setF32(196, sub1?.childCount ?? 0);
  const lighting = effects.lighting;
  setF32(200, lighting ? 1 : 0);
  setF32(204, lighting?.diffuseStrength ?? 0);

  setF32(208, heightfield?.originX ?? 0);
  setF32(212, heightfield?.originZ ?? 0);
  setF32(216, heightfield?.cellSize ?? 1);
  setF32(220, heightfield?.columns ?? 0);
  setF32(224, heightfield?.rows ?? 0);
  setF32(228, heightfield?.restitution ?? 0.4);
  setF32(232, heightfield?.killOnContact ? 1 : 0);
  setF32(236, lighting?.ambient[0] ?? 0);
  setF32(240, lighting?.ambient[1] ?? 0);
  setF32(244, lighting?.ambient[2] ?? 0);
  setF32(248, lighting?.keyDirection.x ?? 0);
  setF32(252, lighting?.keyDirection.y ?? 1);
  setF32(256, lighting?.keyDirection.z ?? 0);
  setF32(260, effects.seed ?? 0);
  setF32(264, curves ? 1 : 0);
  setF32(268, 0);

  const lutWords = turbulence ? 8 ** 3 * 4 : 4;
  const heightWords = heightfield ? heightfield.columns * heightfield.rows : 1;
  const fieldData = new Float32Array(lutWords + heightWords + 32 * 4);
  if (turbulence) {
    fieldData.set(turbulence.lut.slice(0, 8 ** 3 * 4), 0);
  }
  if (heightfield) {
    fieldData.set(heightfield.heights.slice(0, heightfield.columns * heightfield.rows), lutWords);
  }
  if (curves) {
    const curveBase = lutWords + heightWords;
    for (let stop = 0; stop < GPU_PARTICLE_CURVE_STOPS; stop += 1) {
      fieldData[curveBase + stop * 4] = curves.colors?.[stop * 4] ?? 0;
      fieldData[curveBase + stop * 4 + 1] = curves.colors?.[stop * 4 + 1] ?? 0;
      fieldData[curveBase + stop * 4 + 2] = curves.colors?.[stop * 4 + 2] ?? 0;
      fieldData[curveBase + stop * 4 + 3] = curves.colors?.[stop * 4 + 3] ?? 1;
      fieldData[curveBase + (16 + stop) * 4] = curves.sizes?.[stop] ?? 0;
    }
  }

  return {
    uniform: buffer,
    flags,
    trailDepth,
    captureSpawnRequests: subEmitters.length > 0,
    captureAttributes: Boolean(curves?.colors || curves?.sizes || lighting),
    captureTrails,
    fieldData,
  };
}

/**
 * Snapshot helper for the base-attributes buffer. Missing lanes default to
 * opaque white / size 1 so lighting without a color module stays sane.
 */
export function createBaseAttributeSnapshot(baseAttributes: Float32Array | undefined, count: number): Float32Array {
  const snapshot = new Float32Array(Math.max(count * 8, 4));
  if (!baseAttributes) {
    for (let index = 0; index < count; index += 1) {
      const offset = index * 8;
      snapshot[offset] = 1;
      snapshot[offset + 1] = 1;
      snapshot[offset + 2] = 1;
      snapshot[offset + 3] = 1;
      snapshot[offset + 4] = 1;
    }
    return snapshot;
  }
  snapshot.set(baseAttributes.slice(0, count * 8));
  return snapshot;
}

/**
 * Seed the GPU trail ring from the caller's previous result so history
 * accumulates across calls. A missing or short history starts fresh: slot 0
 * takes the live position/age and older slots carry +Infinity age so
 * decoders drop them until real history exists.
 */
export function snapshotTrailHistory(
  trailHistory: Float32Array | undefined,
  positions: Float32Array,
  count: number,
  depth: number,
): Float32Array {
  const required = count * depth * 4;
  if (trailHistory && trailHistory.length >= required) {
    return trailHistory.slice(0, Math.max(required, 4));
  }
  return createTrailRingInit(positions, count, depth);
}
export function createTrailRingInit(positions: Float32Array, count: number, depth: number): Float32Array {
  const ring = new Float32Array(Math.max(count * depth * 4, 4));
  for (let index = 0; index < count; index += 1) {
    const source = index * 4;
    for (let slot = 0; slot < depth; slot += 1) {
      const target = (index * depth + slot) * 4;
      ring[target] = positions[source] ?? 0;
      ring[target + 1] = positions[source + 1] ?? 0;
      ring[target + 2] = positions[source + 2] ?? 0;
      ring[target + 3] = slot === 0 ? (positions[source + 3] ?? 0) : Number.POSITIVE_INFINITY;
    }
  }
  return ring;
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

/**
 * Extended A4 compute kernel. Header offsets mirror encodeGPUParticleEffects:
 * deltaTime f32 @0, count u32 @4, time f32 @8, flags u32 @12, then 16 vec4
 * slots (wind, windGust, windTurb, fxCounts, 3x plane pairs, sub0, sub1,
 * height0, height1, light0, light1). Kill signaling: positions w = -1.
 */
export function createEffectsParticleComputeShader(): string {
  return `
struct FxParams {
  deltaTime: f32,
  count: u32,
  time: f32,
  flags: u32,
  wind: vec4<f32>,
  windGust: vec4<f32>,
  windTurb: vec4<f32>,
  fxCounts: vec4<f32>,
  plane0: vec4<f32>,
  plane0Misc: vec4<f32>,
  plane1: vec4<f32>,
  plane1Misc: vec4<f32>,
  plane2: vec4<f32>,
  plane2Misc: vec4<f32>,
  sub0: vec4<f32>,
  sub1: vec4<f32>,
  height0: vec4<f32>,
  height1: vec4<f32>,
  light0: vec4<f32>,
  light1: vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> accelerations: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: FxParams;
@group(0) @binding(4) var<storage, read> fieldData: array<f32>;
@group(0) @binding(5) var<storage, read_write> spawnRequests: array<u32>;
@group(0) @binding(6) var<storage, read_write> trailRing: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> attributes: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read> baseAttributes: array<vec4<f32>>;

fn aura_wrap8(value: i32) -> u32 {
  return u32(((value % 8) + 8) % 8);
}

fn aura_heights_base() -> u32 {
  if ((params.flags & 2u) != 0u) {
    return 2048u;
  }
  return 4u;
}

fn aura_curves_base() -> u32 {
  var base = aura_heights_base();
  if ((params.flags & 8u) != 0u) {
    base = base + u32(params.height0.w) * u32(params.height1.x);
  } else {
    base = base + 1u;
  }
  return base;
}

fn aura_lut_at(ix: u32, iy: u32, iz: u32) -> vec4<f32> {
  let o = (ix + iy * 8u + iz * 64u) * 4u;
  return vec4<f32>(fieldData[o], fieldData[o + 1u], fieldData[o + 2u], fieldData[o + 3u]);
}

fn aura_height_raw(index: u32) -> f32 {
  return fieldData[aura_heights_base() + index];
}

fn aura_curve(index: u32) -> vec4<f32> {
  let o = aura_curves_base() + index * 4u;
  return vec4<f32>(fieldData[o], fieldData[o + 1u], fieldData[o + 2u], fieldData[o + 3u]);
}

fn aura_sample_turb(p: vec3<f32>) -> vec3<f32> {
  let g = fract(p) * 8.0 - vec3<f32>(0.5);
  let b = floor(g);
  let f = g - b;
  let x0 = aura_wrap8(i32(b.x));
  let y0 = aura_wrap8(i32(b.y));
  let z0 = aura_wrap8(i32(b.z));
  let x1 = aura_wrap8(i32(b.x) + 1);
  let y1 = aura_wrap8(i32(b.y) + 1);
  let z1 = aura_wrap8(i32(b.z) + 1);
  let c000 = aura_lut_at(x0, y0, z0).xyz;
  let c100 = aura_lut_at(x1, y0, z0).xyz;
  let c010 = aura_lut_at(x0, y1, z0).xyz;
  let c110 = aura_lut_at(x1, y1, z0).xyz;
  let c001 = aura_lut_at(x0, y0, z1).xyz;
  let c101 = aura_lut_at(x1, y0, z1).xyz;
  let c011 = aura_lut_at(x0, y1, z1).xyz;
  let c111 = aura_lut_at(x1, y1, z1).xyz;
  return mix(
    mix(mix(c000, c100, f.x), mix(c010, c110, f.x), f.y),
    mix(mix(c001, c101, f.x), mix(c011, c111, f.x), f.y),
    f.z);
}

fn aura_height_at(x: f32, z: f32) -> f32 {
  let cols = params.height0.w;
  let rows = params.height1.x;
  let fx = clamp((x - params.height0.x) / params.height0.z, 0.0, cols - 1.001);
  let fz = clamp((z - params.height0.y) / params.height0.z, 0.0, rows - 1.001);
  let bx = floor(fx);
  let bz = floor(fz);
  let x0 = u32(bx);
  let z0 = u32(bz);
  let tx = fx - bx;
  let tz = fz - bz;
  let stride = u32(cols);
  let h00 = aura_height_raw(z0 * stride + x0);
  let h10 = aura_height_raw(z0 * stride + x0 + 1u);
  let h01 = aura_height_raw((z0 + 1u) * stride + x0);
  let h11 = aura_height_raw((z0 + 1u) * stride + x0 + 1u);
  return h00 * (1.0 - tx) * (1.0 - tz) + h10 * tx * (1.0 - tz) + h01 * (1.0 - tx) * tz + h11 * tx * tz;
}

fn aura_sample_color(t: f32) -> vec4<f32> {
  let x = clamp(t, 0.0, 1.0) * 15.0;
  let i = u32(floor(x));
  let f = x - floor(x);
  return mix(aura_curve(i), aura_curve(min(i + 1u, 15u)), f);
}

fn aura_sample_size(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0) * 15.0;
  let i = u32(floor(x));
  let f = x - floor(x);
  return mix(aura_curve(16u + i).x, aura_curve(16u + min(i + 1u, 15u)).x, f);
}

fn aura_apply_light(col: vec3<f32>, vel: vec3<f32>) -> vec3<f32> {
  let speed = length(vel);
  var n = vec3<f32>(0.0, 1.0, 0.0);
  if (speed > 0.0001) {
    n = vel / speed;
  }
  let key = vec3<f32>(params.light0.z, params.light0.w, params.light1.x);
  let facing = max(dot(n, key / length(key)), 0.0);
  let ambient = vec3<f32>(params.height1.w, params.light0.x, params.light0.y);
  return col * (ambient + params.sub1.w * facing);
}

fn aura_hash(index: u32, seed: f32) -> f32 {
  return fract(sin(f32(index) * 12.9898 + seed * 78.233) * 43758.5453);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= params.count) {
    return;
  }
  let flags = params.flags;
  let dt = params.deltaTime;
  var pos = positions[index].xyz;
  var age = positions[index].w;
  var vel = velocities[index].xyz;
  let lifetime = max(velocities[index].w, 0.000001);
  var dead = false;

  if ((flags & 1u) != 0u) {
    let along = dot(pos, params.windGust.xyz);
    let gust = 1.0 + params.wind.w * sin(along * params.windGust.w + params.time * params.windTurb.x);
    vel = vel + params.wind.xyz * gust * dt;
  }

  if ((flags & 2u) != 0u) {
    let samplePos = pos * params.windTurb.z + vec3<f32>(params.time * params.windTurb.w, 0.0, 0.0);
    vel = vel + aura_sample_turb(samplePos) * params.windTurb.y * dt;
  }

  vel = vel + accelerations[index].xyz * dt;
  pos = pos + vel * dt;

  if ((flags & 4u) != 0u) {
    let planeCount = u32(params.fxCounts.y);
    if (planeCount >= 1u) {
      let d = dot(params.plane0.xyz, pos) + params.plane0.w;
      if (d < 0.0) {
        if (params.plane0Misc.y > 0.5) {
          dead = true;
        } else {
          pos = pos - params.plane0.xyz * d;
          let vn = dot(vel, params.plane0.xyz);
          if (vn < 0.0) {
            vel = vel + params.plane0.xyz * (-(1.0 + params.plane0Misc.x) * vn);
          }
        }
      }
    }
    if (!dead && planeCount >= 2u) {
      let d = dot(params.plane1.xyz, pos) + params.plane1.w;
      if (d < 0.0) {
        if (params.plane1Misc.y > 0.5) {
          dead = true;
        } else {
          pos = pos - params.plane1.xyz * d;
          let vn = dot(vel, params.plane1.xyz);
          if (vn < 0.0) {
            vel = vel + params.plane1.xyz * (-(1.0 + params.plane1Misc.x) * vn);
          }
        }
      }
    }
    if (!dead && planeCount >= 3u) {
      let d = dot(params.plane2.xyz, pos) + params.plane2.w;
      if (d < 0.0) {
        if (params.plane2Misc.y > 0.5) {
          dead = true;
        } else {
          pos = pos - params.plane2.xyz * d;
          let vn = dot(vel, params.plane2.xyz);
          if (vn < 0.0) {
            vel = vel + params.plane2.xyz * (-(1.0 + params.plane2Misc.x) * vn);
          }
        }
      }
    }
  }

  if (!dead && (flags & 8u) != 0u) {
    let ground = aura_height_at(pos.x, pos.z);
    if (pos.y < ground) {
      if (params.height1.z > 0.5) {
        dead = true;
      } else {
        let e = params.height0.z;
        let dhdx = (aura_height_at(pos.x + e, pos.z) - aura_height_at(pos.x - e, pos.z)) / (2.0 * e);
        let dhdz = (aura_height_at(pos.x, pos.z + e) - aura_height_at(pos.x, pos.z - e)) / (2.0 * e);
        let n = vec3<f32>(-dhdx, 1.0, -dhdz) / length(vec3<f32>(-dhdx, 1.0, -dhdz));
        pos.y = ground;
        let vn = dot(vel, n);
        if (vn < 0.0) {
          vel = vel + n * (-(1.0 + params.height1.y) * vn);
        }
      }
    }
  }

  if (!dead) {
    age = age + dt;
  }

  if (!dead && (flags & 16u) != 0u) {
    let prevAge = age - dt;
    let nPrev = prevAge / lifetime;
    let nNew = age / lifetime;
    let subCount = u32(params.fxCounts.w);
    if (subCount >= 1u && nPrev < params.sub0.x && nNew >= params.sub0.x
        && aura_hash(index, params.light1.y) < params.sub0.y) {
      spawnRequests[index] = u32(params.sub0.z);
    }
    if (subCount >= 2u && nPrev < params.sub0.w && nNew >= params.sub0.w
        && aura_hash(index, params.light1.y + 1.7) < params.sub1.x) {
      spawnRequests[index] = spawnRequests[index] + (u32(params.sub1.y) << 16u);
    }
  }

  if ((flags & 32u) != 0u || (flags & 64u) != 0u || (flags & 256u) != 0u) {
    let t = clamp(age / lifetime, 0.0, 1.0);
    var col = baseAttributes[index * 2u];
    var size = baseAttributes[index * 2u + 1u].x;
    if ((flags & 32u) != 0u) {
      col = aura_sample_color(t);
    }
    if ((flags & 256u) != 0u) {
      size = aura_sample_size(t);
    }
    if ((flags & 64u) != 0u) {
      col = vec4<f32>(aura_apply_light(col.xyz, vel), col.w);
    }
    attributes[index * 2u] = col;
    attributes[index * 2u + 1u] = vec4<f32>(size, 0.0, 1.0, 0.0);
  }

  if ((flags & 128u) != 0u) {
    let k = u32(params.fxCounts.x);
    let base = index * k;
    var s = k - 1u;
    while (s >= 1u) {
      trailRing[base + s] = trailRing[base + s - 1u] + vec4<f32>(0.0, 0.0, 0.0, dt);
      s = s - 1u;
    }
    trailRing[base] = vec4<f32>(pos, age);
  }

  if (dead) {
    age = -1.0;
  }
  positions[index] = vec4<f32>(pos, age);
  velocities[index] = vec4<f32>(vel, lifetime);
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

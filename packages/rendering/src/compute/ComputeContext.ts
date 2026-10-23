import {
  COMPUTE_BUFFER_USAGE,
  COMPUTE_MAP_MODE_READ,
  ComputeError,
  type ComputeBindingSpec,
  type ComputeBindingType,
  type ComputeBufferSpec,
  type ComputeBufferUsage,
  type ComputeDispatchInput,
  type ComputeDispatchResult,
  type ComputeGPUBufferLike,
  type ComputeGPUDeviceLike,
  type ComputePipelineSpec
} from "./types.js";

const DEFAULT_LIMITS = {
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupsPerDimension: 65535,
  maxStorageBuffersPerShaderStage: 8,
  maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  maxBufferSize: 268435456
} as const;

const GLSL_MARKERS = /#version\b|\bvoid\s+main\s*\(|\bgl_FragColor\b|\bprecision\s+(?:highp|mediump|lowp)\b/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BINDING_TYPES: readonly ComputeBindingType[] = ["storage", "read-only-storage", "uniform"];

type Triple = readonly [number, number, number];

const invalid = (message: string): ComputeError => new ComputeError("compute-invalid-spec", message);

const isPositiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;

function normalizeTriple(value: readonly (number | undefined)[], what: string): Triple {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw invalid(`${what} must be [x], [x, y] or [x, y, z]`);
  const [x, y = 1, z = 1] = value as readonly number[];
  for (const [axis, n] of [["x", x], ["y", y], ["z", z]] as const) {
    if (!isPositiveInt(n)) throw invalid(`${what} ${axis} must be a positive integer, got ${String(n)}`);
  }
  return [x, y, z];
}

/** Parse `@compute @workgroup_size(a, b, c) fn <entry>` in either attribute order; null when sizes are not literals. */
function parseWorkgroupSize(wgsl: string, entryPoint: string): Triple | null {
  const patterns = [
    /@compute\s*@workgroup_size\s*\(([^)]*)\)\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /@workgroup_size\s*\(([^)]*)\)\s*@compute\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)/g
  ];
  for (const pattern of patterns) {
    for (const match of wgsl.matchAll(pattern)) {
      if (match[2] !== entryPoint) continue;
      const parts = match[1]!.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
      if (parts.length < 1 || parts.length > 3 || !parts.every((part) => /^\d+u?$/.test(part))) return null;
      const [x, y = "1", z = "1"] = parts.map((part) => part.replace(/u$/, ""));
      return [Number(x), Number(y), Number(z)];
    }
  }
  return null;
}

export class ComputeLimits {
  constructor(private readonly raw: Readonly<Record<string, number>> | undefined) {}
  get(name: keyof typeof DEFAULT_LIMITS): number {
    const value = this.raw?.[name];
    return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_LIMITS[name];
  }
}

export class ComputePipeline {
  readonly id: number;
  readonly entryPoint: string;
  readonly workgroupSize: Triple;
  readonly bindings: readonly ComputeBindingSpec[];
  readonly label: string | undefined;
  private isDisposed = false;

  /** @internal */
  constructor(
    readonly owner: ComputeContext,
    id: number,
    readonly native: { getBindGroupLayout(index: number): unknown },
    spec: { entryPoint: string; workgroupSize: Triple; bindings: readonly ComputeBindingSpec[]; label: string | undefined }
  ) {
    this.id = id;
    this.entryPoint = spec.entryPoint;
    this.workgroupSize = spec.workgroupSize;
    this.bindings = spec.bindings;
    this.label = spec.label;
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  /** Idempotent. WebGPU pipelines have no explicit destroy; this retires the handle. */
  dispose(): void {
    this.isDisposed = true;
  }
}

export class ComputeBuffer {
  readonly size: number;
  readonly usage: ComputeBufferUsage;
  readonly label: string | undefined;
  private isDisposed = false;

  /** @internal */
  constructor(
    readonly owner: ComputeContext,
    readonly native: ComputeGPUBufferLike,
    size: number,
    usage: ComputeBufferUsage,
    label: string | undefined
  ) {
    this.size = size;
    this.usage = usage;
    this.label = label;
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  /** Upload bytes at a 4-byte-aligned offset. */
  write(data: ArrayBufferView | ArrayBuffer, byteOffset = 0): void {
    this.assertLive("write");
    const byteLength = data.byteLength;
    if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset % 4 !== 0) throw invalid(`write offset must be a non-negative multiple of 4, got ${String(byteOffset)}`);
    if (byteLength % 4 !== 0) throw invalid(`write length must be a multiple of 4 bytes, got ${byteLength}`);
    if (byteOffset + byteLength > this.size) throw invalid(`write of ${byteLength} bytes at offset ${byteOffset} exceeds the ${this.size}-byte buffer`);
    this.owner.device.queue.writeBuffer(this.native, byteOffset, data);
  }

  /** Copy the buffer to a staging buffer, map it and return the bytes. Rejects with `compute-read-failed`. */
  async read(): Promise<ArrayBuffer> {
    this.assertLive("read");
    const device = this.owner.device;
    const staging = device.createBuffer({
      label: `${this.label ?? "compute-buffer"}-readback`,
      size: this.size,
      usage: COMPUTE_BUFFER_USAGE.MAP_READ | COMPUTE_BUFFER_USAGE.COPY_DST
    });
    try {
      const encoder = device.createCommandEncoder({ label: "aura3d-compute-readback" });
      encoder.copyBufferToBuffer(this.native, 0, staging, 0, this.size);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(COMPUTE_MAP_MODE_READ);
      const copy = staging.getMappedRange().slice(0);
      staging.unmap();
      return copy;
    } catch (error) {
      throw new ComputeError("compute-read-failed", `compute buffer read failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    } finally {
      staging.destroy();
    }
  }

  /** Idempotent. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.native.destroy();
  }

  private assertLive(operation: string): void {
    if (this.isDisposed) throw new ComputeError("compute-disposed", `compute buffer "${this.label ?? "unnamed"}" is disposed; cannot ${operation}`);
  }
}

export class ComputeContext {
  readonly limits: ComputeLimits;
  private readonly buffers = new Set<ComputeBuffer>();
  private readonly pipelines = new Set<ComputePipeline>();
  private nextPipelineId = 1;
  private isDisposed = false;

  constructor(readonly device: ComputeGPUDeviceLike) {
    for (const method of ["createShaderModule", "createComputePipeline", "createBuffer", "createBindGroup", "createCommandEncoder"] as const) {
      if (typeof (device as unknown as Record<string, unknown>)?.[method] !== "function") {
        throw invalid(`createComputeContext needs a WebGPU GPUDevice; \`${method}\` is missing`);
      }
    }
    if (typeof device.queue?.submit !== "function" || typeof device.queue?.writeBuffer !== "function") {
      throw invalid("createComputeContext needs a WebGPU GPUDevice with a queue that supports submit and writeBuffer");
    }
    this.limits = new ComputeLimits(device.limits);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  createPipeline(spec: ComputePipelineSpec): ComputePipeline {
    this.assertLive();
    if (typeof spec !== "object" || spec === null) throw invalid("createComputePipeline needs a spec object");
    const { wgsl } = spec;
    if (typeof wgsl !== "string" || wgsl.trim().length === 0) {
      throw new ComputeError("compute-wgsl-required", "compute pipelines require WGSL source in `wgsl`; there is no GLSL compute path");
    }
    if (GLSL_MARKERS.test(wgsl)) {
      throw new ComputeError("compute-wgsl-required", "`wgsl` looks like GLSL (#version / void main / precision). Compute pipelines require WGSL with a `@compute` entry point");
    }
    const entryPoint = spec.entryPoint ?? "main";
    if (!IDENTIFIER.test(entryPoint)) throw invalid(`entryPoint "${entryPoint}" is not a valid WGSL identifier`);
    if (!/@compute\b/.test(wgsl)) throw invalid("WGSL has no `@compute` entry point");
    if (!new RegExp(`\\bfn\\s+${entryPoint}\\b`).test(wgsl)) throw invalid(`WGSL has no \`fn ${entryPoint}\`; set \`entryPoint\` to the name of your @compute function`);

    const declared = parseWorkgroupSize(wgsl, entryPoint);
    const requested = spec.workgroupSize === undefined ? undefined : normalizeTriple(spec.workgroupSize, "workgroupSize");
    if (declared && requested && (declared[0] !== requested[0] || declared[1] !== requested[1] || declared[2] !== requested[2])) {
      throw invalid(`workgroupSize [${requested.join(", ")}] does not match the shader's @workgroup_size(${declared.join(", ")})`);
    }
    const workgroupSize: Triple = declared ?? requested ?? [64, 1, 1];
    const [wx, wy, wz] = workgroupSize;
    if (wx > this.limits.get("maxComputeWorkgroupSizeX") || wy > this.limits.get("maxComputeWorkgroupSizeY") || wz > this.limits.get("maxComputeWorkgroupSizeZ")) {
      throw invalid(`workgroup size [${workgroupSize.join(", ")}] exceeds the device limits [${this.limits.get("maxComputeWorkgroupSizeX")}, ${this.limits.get("maxComputeWorkgroupSizeY")}, ${this.limits.get("maxComputeWorkgroupSizeZ")}]`);
    }
    if (wx * wy * wz > this.limits.get("maxComputeInvocationsPerWorkgroup")) {
      throw invalid(`workgroup size ${wx * wy * wz} invocations exceeds maxComputeInvocationsPerWorkgroup ${this.limits.get("maxComputeInvocationsPerWorkgroup")}`);
    }

    const bindings = this.validateBindings(spec.bindings ?? []);
    const module = this.device.createShaderModule({ label: spec.label ?? "aura3d-compute", code: wgsl });
    const native = this.device.createComputePipeline({
      label: spec.label ?? "aura3d-compute",
      layout: "auto",
      compute: { module, entryPoint }
    });
    const pipeline = new ComputePipeline(this, this.nextPipelineId++, native, { entryPoint, workgroupSize, bindings, label: spec.label });
    this.pipelines.add(pipeline);
    return pipeline;
  }

  createBuffer(spec: ComputeBufferSpec): ComputeBuffer {
    this.assertLive();
    if (typeof spec !== "object" || spec === null) throw invalid("computeBuffer needs a spec object");
    const usage = spec.usage ?? "storage";
    if (usage !== "storage" && usage !== "uniform") throw invalid(`buffer usage must be "storage" or "uniform", got ${String(usage)}`);
    const hasData = spec.data !== undefined;
    if (!hasData && spec.size === undefined) throw invalid("computeBuffer needs `size` or `data`");
    const raw = hasData ? spec.data!.byteLength : spec.size!;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) throw invalid(`buffer size must be a positive integer number of bytes, got ${String(raw)}`);
    if (hasData && spec.size !== undefined && spec.size < raw) throw invalid(`size ${spec.size} is smaller than the ${raw}-byte data`);
    const size = Math.ceil(Math.max(raw, spec.size ?? 0) / 4) * 4;
    const bindingLimit = usage === "uniform" ? this.limits.get("maxUniformBufferBindingSize") : this.limits.get("maxStorageBufferBindingSize");
    if (size > bindingLimit) throw invalid(`${usage} buffer of ${size} bytes exceeds the device binding limit ${bindingLimit}`);
    if (size > this.limits.get("maxBufferSize")) throw invalid(`buffer of ${size} bytes exceeds maxBufferSize ${this.limits.get("maxBufferSize")}`);
    const gpuUsage = (usage === "uniform" ? COMPUTE_BUFFER_USAGE.UNIFORM : COMPUTE_BUFFER_USAGE.STORAGE) | COMPUTE_BUFFER_USAGE.COPY_SRC | COMPUTE_BUFFER_USAGE.COPY_DST;
    const native = this.device.createBuffer({ label: spec.label ?? "aura3d-compute-buffer", size, usage: gpuUsage });
    const buffer = new ComputeBuffer(this, native, size, usage, spec.label);
    this.buffers.add(buffer);
    if (hasData) {
      const bytes = spec.data instanceof ArrayBuffer
        ? new Uint8Array(spec.data)
        : new Uint8Array(spec.data!.buffer, spec.data!.byteOffset, spec.data!.byteLength);
      const padded = bytes.byteLength === size ? bytes : (() => { const out = new Uint8Array(size); out.set(bytes); return out; })();
      this.device.queue.writeBuffer(native, 0, padded);
    }
    return buffer;
  }

  /** Encode and submit one compute pass. Resolves nothing: the GPU runs asynchronously; use `read()` or `onIdle()` to wait. */
  dispatch(input: ComputeDispatchInput): ComputeDispatchResult {
    this.assertLive();
    if (typeof input !== "object" || input === null) throw invalid("dispatch needs an input object");
    const pipeline = input.pipeline;
    if (!(pipeline instanceof ComputePipeline) || pipeline.owner !== this) throw invalid("dispatch `pipeline` must come from this compute context");
    if (pipeline.disposed) throw new ComputeError("compute-disposed", "compute pipeline is disposed; cannot dispatch");

    const supplied = new Map<number, ComputeBuffer>();
    const entries: readonly { readonly binding: number; readonly buffer: unknown }[] = Array.isArray(input.bindings)
      ? (input.bindings as readonly { binding: number; buffer: unknown }[])
      : Object.entries(input.bindings as Record<string, unknown>).map(([key, buffer]) => ({ binding: Number(key), buffer }));
    for (const entry of entries) {
      if (!Number.isInteger(entry.binding) || entry.binding < 0) throw invalid(`dispatch binding index must be a non-negative integer, got ${String(entry.binding)}`);
      if (supplied.has(entry.binding)) throw invalid(`dispatch binding ${entry.binding} supplied twice`);
      if (!(entry.buffer instanceof ComputeBuffer) || entry.buffer.owner !== this) throw invalid(`dispatch binding ${entry.binding} must be a computeBuffer from this compute context`);
      if (entry.buffer.disposed) throw new ComputeError("compute-disposed", `compute buffer bound at ${entry.binding} is disposed; cannot dispatch`);
      supplied.set(entry.binding, entry.buffer);
    }
    for (const declared of pipeline.bindings) {
      const buffer = supplied.get(declared.binding);
      if (!buffer) throw invalid(`dispatch is missing a buffer for binding ${declared.binding} (${declared.type})`);
      const wantsUniform = declared.type === "uniform";
      if (wantsUniform !== (buffer.usage === "uniform")) {
        throw invalid(`binding ${declared.binding} is declared "${declared.type}" but the buffer was created with usage "${buffer.usage}"`);
      }
      supplied.delete(declared.binding);
    }
    if (supplied.size > 0) throw invalid(`dispatch supplied undeclared binding(s) ${[...supplied.keys()].join(", ")}; declare them in the pipeline's \`bindings\``);

    const [wx, wy, wz] = pipeline.workgroupSize;
    let groups: Triple;
    if (input.workgroups !== undefined && input.items !== undefined) throw invalid("dispatch takes `workgroups` or `items`, not both");
    if (input.workgroups !== undefined) {
      groups = normalizeTriple(input.workgroups, "workgroups");
    } else if (input.items !== undefined) {
      const [ix, iy, iz] = normalizeTriple(input.items, "items");
      groups = [Math.ceil(ix / wx), Math.ceil(iy / wy), Math.ceil(iz / wz)];
    } else {
      throw invalid("dispatch needs `workgroups` or `items`");
    }
    const maxPerDimension = this.limits.get("maxComputeWorkgroupsPerDimension");
    if (groups.some((count) => count > maxPerDimension)) {
      throw invalid(`workgroup counts [${groups.join(", ")}] exceed maxComputeWorkgroupsPerDimension ${maxPerDimension}`);
    }

    const bindGroup = this.device.createBindGroup({
      label: pipeline.label ?? "aura3d-compute",
      layout: pipeline.native.getBindGroupLayout(0),
      entries: entries.map((entry) => ({ binding: entry.binding, resource: { buffer: (entry.buffer as ComputeBuffer).native } }))
    });
    const encoder = this.device.createCommandEncoder({ label: "aura3d-compute-dispatch" });
    const pass = encoder.beginComputePass({ label: pipeline.label ?? "aura3d-compute" });
    pass.setPipeline(pipeline.native);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(groups[0], groups[1], groups[2]);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return { workgroups: groups, invocations: groups[0] * groups[1] * groups[2] * wx * wy * wz };
  }

  /** Resolves when every submitted compute command has finished (no-op where the device cannot report it). */
  async onIdle(): Promise<void> {
    await this.device.queue.onSubmittedWorkDone?.();
  }

  /** Destroys every buffer this context created. Idempotent. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    for (const buffer of this.buffers) buffer.dispose();
    for (const pipeline of this.pipelines) pipeline.dispose();
    this.buffers.clear();
    this.pipelines.clear();
  }

  private validateBindings(bindings: readonly ComputeBindingSpec[]): readonly ComputeBindingSpec[] {
    if (!Array.isArray(bindings)) throw invalid("`bindings` must be an array of { binding, type }");
    const seen = new Set<number>();
    let storage = 0;
    let uniform = 0;
    for (const entry of bindings) {
      if (typeof entry !== "object" || entry === null || !Number.isInteger(entry.binding) || entry.binding < 0) {
        throw invalid(`each binding needs a non-negative integer \`binding\` index, got ${JSON.stringify(entry)}`);
      }
      if (!BINDING_TYPES.includes(entry.type)) throw invalid(`binding ${entry.binding} type must be one of ${BINDING_TYPES.join(", ")}, got ${String(entry.type)}`);
      if (seen.has(entry.binding)) throw invalid(`binding ${entry.binding} declared twice`);
      seen.add(entry.binding);
      if (entry.type === "uniform") uniform += 1;
      else storage += 1;
    }
    if (storage > this.limits.get("maxStorageBuffersPerShaderStage")) {
      throw invalid(`${storage} storage bindings exceed maxStorageBuffersPerShaderStage ${this.limits.get("maxStorageBuffersPerShaderStage")}`);
    }
    if (uniform > this.limits.get("maxUniformBuffersPerShaderStage")) {
      throw invalid(`${uniform} uniform bindings exceed maxUniformBuffersPerShaderStage ${this.limits.get("maxUniformBuffersPerShaderStage")}`);
    }
    return bindings.map((entry) => ({ binding: entry.binding, type: entry.type }));
  }

  private assertLive(): void {
    if (this.isDisposed) throw new ComputeError("compute-disposed", "compute context is disposed");
  }
}

export function createComputeContext(device: ComputeGPUDeviceLike): ComputeContext {
  return new ComputeContext(device);
}

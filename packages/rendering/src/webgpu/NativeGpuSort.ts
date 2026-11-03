/**
 * Stable bounded WebGPU index sorting for depth-ordered draws and compute.
 *
 * Keys stay on the GPU. Each bitonic-network stage is a separate compute pass,
 * giving storage writes a device-wide ordering point before the next stage.
 * A scratch record includes the input index, making ties stable in either
 * direction. NaNs always follow numeric keys; signed zeroes compare equal.
 *
 * Input and output buffers belong to the caller and must remain alive until
 * `safeToRelease` resolves. The returned indices can also be consumed by a later
 * submission on this same device queue without a CPU wait. A different queue
 * or a replacement device requires its own explicit handoff.
 */

export type NativeGpuSortDirection = "ascending" | "descending";
export type NativeGpuSortErrorCode =
  | "sort-invalid-spec"
  | "sort-unsupported"
  | "sort-disposed"
  | "sort-busy"
  | "sort-device-lost"
  | "sort-shader-failed"
  | "sort-submit-failed"
  | "sort-fence-failed"
  | "sort-cleanup-failed"
  | "sort-aborted";

export class NativeGpuSortError extends Error {
  /** An ambiguous submission may still be using the caller's buffers. */
  readonly safeToRelease?: Promise<void>;

  constructor(readonly code: NativeGpuSortErrorCode, message: string, options?: { readonly cause?: unknown; readonly safeToRelease?: Promise<void> }) {
    super(message);
    this.name = "NativeGpuSortError";
    if (options && "cause" in options) this.cause = options.cause;
    this.safeToRelease = options?.safeToRelease;
  }
}

/** The native GPUBuffer properties used by the sorter. */
export interface NativeGpuSortBuffer {
  readonly size: number;
  readonly usage: number;
  destroy(): void;
}

interface NativeGpuSortOwnedBuffer extends NativeGpuSortBuffer {
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

interface NativeGpuSortPipeline {
  getBindGroupLayout(index: number): unknown;
}

interface NativeGpuSortShaderModule {
  getCompilationInfo?(): Promise<{ readonly messages: readonly {
    readonly type: string;
    readonly message: string;
    readonly lineNum?: number;
    readonly linePos?: number;
  }[] }>;
}

interface NativeGpuSortPass {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

/** Structural native device contract. `createNativeGpuSort` validates this at runtime. */
export interface NativeGpuSortDevice {
  readonly limits?: Readonly<Record<string, number>>;
  readonly lost?: Promise<{ readonly reason?: string; readonly message?: string }>;
  readonly queue: {
    submit(commands: readonly unknown[]): void;
    onSubmittedWorkDone(): Promise<void>;
  };
  createShaderModule(descriptor: { readonly label?: string; readonly code: string }): NativeGpuSortShaderModule;
  createComputePipeline(descriptor: object): NativeGpuSortPipeline;
  createComputePipelineAsync?(descriptor: object): Promise<NativeGpuSortPipeline>;
  createBuffer(descriptor: { readonly label?: string; readonly size: number; readonly usage: number; readonly mappedAtCreation?: boolean }): NativeGpuSortOwnedBuffer;
  createBindGroup(descriptor: object): unknown;
  createCommandEncoder(descriptor?: { readonly label?: string }): {
    beginComputePass(descriptor?: { readonly label?: string }): NativeGpuSortPass;
    finish(): unknown;
  };
  pushErrorScope?(filter: "validation"): void;
  popErrorScope?(): Promise<{ readonly message: string } | null>;
}

export interface NativeGpuSortOptions {
  /** Maximum number of input keys per sort, at most 2^24. Default: 2^20. */
  readonly maxItems?: number;
  /** Maximum simultaneously submitted sorts. Default: 4; maximum: 16. */
  readonly maxConcurrent?: number;
}

export interface NativeGpuSortRequest {
  /** Storage buffer containing contiguous f32 keys, beginning at byte zero. */
  readonly keys: NativeGpuSortBuffer;
  /** Storage buffer receiving contiguous u32 indices, beginning at byte zero. */
  readonly indices: NativeGpuSortBuffer;
  readonly count: number;
  readonly direction?: NativeGpuSortDirection;
  /** Aborting after submission rejects completion only after the GPU is finished. */
  readonly signal?: AbortSignal;
}

export interface NativeGpuSortSubmission {
  readonly indices: NativeGpuSortBuffer;
  readonly count: number;
  readonly direction: NativeGpuSortDirection;
  /** Settles after validation and a successful GPU fence, device loss, or a fence failure. */
  readonly completion: Promise<void>;
  /** Resolves when submitted work is finished or the device is lost, including after a failed fence is retried. */
  readonly safeToRelease: Promise<void>;
}

const STORAGE = 0x0080;
const UNIFORM = 0x0040;
const PARAMETER_SIZE = 32;
const PAIR_SIZE = 16;
const MAX_ITEMS = 2 ** 24;
const DEFAULT_MAX_ITEMS = 2 ** 20;
const DEFAULT_MAX_CONCURRENT = 4;

function error(code: NativeGpuSortErrorCode, message: string, cause?: unknown, safeToRelease?: Promise<void>): NativeGpuSortError {
  const options = cause !== undefined || safeToRelease !== undefined
    ? { ...(cause === undefined ? {} : { cause }), ...(safeToRelease === undefined ? {} : { safeToRelease }) }
    : undefined;
  return new NativeGpuSortError(code, message, options);
}

function errorDetail(cause: unknown): string {
  try { return cause instanceof Error ? String(cause.message) : String(cause); }
  catch { return "unavailable error"; }
}

/** Narrow a native device at the API boundary, including the required completion fence. */
export function assertNativeGpuSortDevice(device: unknown): asserts device is NativeGpuSortDevice {
  if (typeof device !== "object" || device === null) throw error("sort-unsupported", "GPU sorting requires a native WebGPU device");
  const candidate = device as Record<string, unknown>;
  for (const method of ["createShaderModule", "createComputePipeline", "createBuffer", "createBindGroup", "createCommandEncoder"] as const) {
    if (typeof candidate[method] !== "function") throw error("sort-unsupported", `GPU sorting requires native device.${method}()`);
  }
  const queue = candidate.queue as Record<string, unknown> | undefined;
  if (!queue || typeof queue.submit !== "function" || typeof queue.onSubmittedWorkDone !== "function") {
    throw error("sort-unsupported", "GPU sorting requires queue.submit() and queue.onSubmittedWorkDone() for safe resource lifetime");
  }
  if ((typeof candidate.pushErrorScope === "function") !== (typeof candidate.popErrorScope === "function")) {
    throw error("sort-unsupported", "the device must expose both validation error-scope methods or neither");
  }
}

function positiveInteger(value: unknown, name: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw error("sort-invalid-spec", `${name} must be an integer from 1 through ${max}`);
  }
  return value;
}

function deviceLimit(device: NativeGpuSortDevice, name: string, fallback: number): number {
  const value = device.limits?.[name];
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw error("sort-unsupported", `device limit ${name} must be a positive integer`);
  return value;
}

function bufferCheck(buffer: NativeGpuSortBuffer, name: string, requiredBytes: number): void {
  if (typeof buffer !== "object" || buffer === null || !Number.isSafeInteger(buffer.size) || buffer.size < requiredBytes ||
      !Number.isSafeInteger(buffer.usage) || (buffer.usage & STORAGE) === 0 || typeof buffer.destroy !== "function") {
    throw error("sort-invalid-spec", `${name} must be a native STORAGE buffer with at least ${requiredBytes} bytes`);
  }
}

function nextPowerOfTwo(count: number): number {
  let result = 1;
  while (result < count) result *= 2;
  return result;
}

function shader(workgroupSize: number): string {
  return `
struct Pair { key: u32, index: u32, valid: u32, padding: u32, };
struct Params { count: u32, padded: u32, stage_width: u32, distance: u32, descending: u32, p0: u32, p1: u32, p2: u32, };
@group(0) @binding(0) var<storage, read> keys: array<u32>;
@group(0) @binding(1) var<storage, read_write> pairs: array<Pair>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> indices: array<u32>;

fn nan_key(bits: u32) -> bool {
  return ((bits & 0x7f800000u) == 0x7f800000u) && ((bits & 0x007fffffu) != 0u);
}
fn ordered_key(bits: u32) -> u32 {
  if ((bits & 0x80000000u) != 0u) { return ~bits; }
  return bits ^ 0x80000000u;
}
fn after(a: Pair, b: Pair) -> bool {
  if (a.valid != b.valid) { return a.valid == 0u; }
  if (a.valid == 0u) { return a.index > b.index; }
  let an = nan_key(a.key);
  let bn = nan_key(b.key);
  if (an != bn) { return an; }
  if (an || a.key == b.key || ((a.key | b.key) & 0x7fffffffu) == 0u) { return a.index > b.index; }
  if (params.descending != 0u) { return ordered_key(a.key) < ordered_key(b.key); }
  return ordered_key(a.key) > ordered_key(b.key);
}
@compute @workgroup_size(${workgroupSize})
fn initialize(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= params.padded) { return; }
  var pair = Pair(0u, i, 0u, 0u);
  if (i < params.count) { pair = Pair(keys[i], i, 1u, 0u); }
  pairs[i] = pair;
}
@compute @workgroup_size(${workgroupSize})
fn compare_exchange(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= params.padded) { return; }
  let other = i ^ params.distance;
  if (other <= i || other >= params.padded) { return; }
  let a = pairs[i];
  let b = pairs[other];
  let reverse = (i & params.stage_width) != 0u;
  if ((!reverse && after(a, b)) || (reverse && after(b, a))) {
    pairs[i] = b;
    pairs[other] = a;
  }
}
@compute @workgroup_size(${workgroupSize})
fn write_indices(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < params.count) { indices[id.x] = pairs[id.x].index; }
}`;
}

interface PendingSort {
  readonly keys: NativeGpuSortBuffer;
  readonly indices: NativeGpuSortBuffer;
  readonly scratch: NativeGpuSortOwnedBuffer;
  readonly parameters: NativeGpuSortOwnedBuffer;
  readonly signal?: AbortSignal;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
  readonly releasedPromise: Promise<void>;
  readonly resolveReleased: () => void;
  readonly resolveRecoveredFence: () => void;
  readonly submissionReady: Promise<void>;
  readonly cleanupFailure: Promise<never>;
  readonly rejectCleanupFailure: (reason: unknown) => void;
  scratchReleased: boolean;
  parametersReleased: boolean;
  settled: boolean;
  released: boolean;
  fenceRecovered: boolean;
}

// Keep owners reachable while submitted resources need either a fence or a
// device-loss notification, even if callers discard the submission object.
const pendingOwners = new Set<NativeGpuSort>();
// Buffers can be passed to more than one sorter for the same native device.
// Track writes across sorter instances, not just within a single owner.
const pendingByDevice = new WeakMap<NativeGpuSortDevice, Set<PendingSort>>();

/** Device-scoped sorter. Recreate it when the renderer creates a replacement device. */
export class NativeGpuSort {
  readonly maxItems: number;
  readonly maxConcurrent: number;
  readonly workgroupSize: number;
  private readonly uniformAlignment: number;
  private readonly maxStorageBindingSize: number;
  private readonly maxBufferSize: number;
  private readonly maxWorkgroups: number;
  private readonly pending = new Set<PendingSort>();
  private disposed = false;
  private lost: NativeGpuSortError | undefined;
  private initializePipeline!: NativeGpuSortPipeline;
  private comparePipeline!: NativeGpuSortPipeline;
  private outputPipeline!: NativeGpuSortPipeline;

  private constructor(private readonly device: NativeGpuSortDevice, options: NativeGpuSortOptions) {
    this.maxItems = positiveInteger(options.maxItems ?? DEFAULT_MAX_ITEMS, "maxItems", MAX_ITEMS);
    this.maxConcurrent = positiveInteger(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT, "maxConcurrent", 16);
    this.workgroupSize = Math.min(64, deviceLimit(device, "maxComputeWorkgroupSizeX", 256), deviceLimit(device, "maxComputeInvocationsPerWorkgroup", 256));
    this.uniformAlignment = deviceLimit(device, "minUniformBufferOffsetAlignment", 256);
    this.maxStorageBindingSize = deviceLimit(device, "maxStorageBufferBindingSize", 134217728);
    this.maxBufferSize = deviceLimit(device, "maxBufferSize", 268435456);
    this.maxWorkgroups = deviceLimit(device, "maxComputeWorkgroupsPerDimension", 65535);
    if (deviceLimit(device, "maxStorageBuffersPerShaderStage", 8) < 2 || deviceLimit(device, "maxUniformBuffersPerShaderStage", 12) < 1 || deviceLimit(device, "maxUniformBufferBindingSize", 65536) < PARAMETER_SIZE) {
      throw error("sort-unsupported", "device limits do not support two storage buffers and one 32-byte uniform binding");
    }
  }

  /** @internal Use `createNativeGpuSort` to validate and compile before use. */
  static async create(source: unknown, options: NativeGpuSortOptions = {}): Promise<NativeGpuSort> {
    assertNativeGpuSortDevice(source);
    if (typeof options !== "object" || options === null) throw error("sort-invalid-spec", "sort options must be an object");
    const sorter = new NativeGpuSort(source, options);
    try {
      const module = source.createShaderModule({ label: "aura3d-stable-gpu-sort", code: shader(sorter.workgroupSize) });
      if (module.getCompilationInfo) {
        const info = await module.getCompilationInfo();
        const failures = info.messages.filter((message) => message.type === "error");
        if (failures.length) throw new Error(failures.map((message) => `${message.lineNum ?? "?"}:${message.linePos ?? "?"} ${message.message}`).join("; "));
      }
      const descriptor = (entryPoint: string): object => ({ label: `aura3d-sort-${entryPoint}`, layout: "auto", compute: { module, entryPoint } });
      const names = ["initialize", "compare_exchange", "write_indices"] as const;
      if (source.createComputePipelineAsync) {
        [sorter.initializePipeline, sorter.comparePipeline, sorter.outputPipeline] = await Promise.all(
          names.map((name) => source.createComputePipelineAsync!(descriptor(name)))
        );
      } else {
        if (!source.pushErrorScope || !source.popErrorScope) {
          throw new Error("synchronous compute pipeline creation requires validation error scopes");
        }
        source.pushErrorScope("validation");
        let pipelineFailure: { readonly cause: unknown } | undefined;
        try {
          [sorter.initializePipeline, sorter.comparePipeline, sorter.outputPipeline] = names.map((name) => source.createComputePipeline(descriptor(name)));
        } catch (cause) { pipelineFailure = { cause }; }
        const scope = source.popErrorScope();
        const issue = await scope.catch((cause: unknown) => {
          if (pipelineFailure) throw pipelineFailure.cause;
          throw cause;
        });
        if (pipelineFailure) throw pipelineFailure.cause;
        if (issue) throw new Error(issue.message);
      }
    } catch (cause) {
      throw error("sort-shader-failed", `GPU sort shader or pipeline creation failed: ${cause instanceof Error ? cause.message : String(cause)}`, cause);
    }
    if (source.lost) {
      // A device may outlive many temporary sorters. Do not let its unresolved
      // loss promise keep every disposed sorter and its pipelines alive.
      const weakSorter = new WeakRef(sorter);
      void source.lost.then(
        (info) => weakSorter.deref()?.markLost(info.message || info.reason || "native device lost"),
        // A rejected notification does not confirm loss or make submitted work
        // safe to release; retain ownership until a queue fence succeeds.
        () => undefined
      );
    }
    return sorter;
  }

  /** Submit a stable sort. No input keys are read back to the CPU. */
  sort(request: NativeGpuSortRequest): NativeGpuSortSubmission {
    this.assertLive();
    if (typeof request !== "object" || request === null) throw error("sort-invalid-spec", "sort requires a request object");
    const { count, keys, indices, signal } = request;
    if (!Number.isSafeInteger(count) || count < 0 || count > this.maxItems) throw error("sort-invalid-spec", `count must be an integer from 0 through ${this.maxItems}`);
    const direction = request.direction ?? "ascending";
    if (direction !== "ascending" && direction !== "descending") throw error("sort-invalid-spec", `unknown sort direction ${String(direction)}`);
    if (signal?.aborted) throw error("sort-aborted", "GPU sort aborted before submission");
    bufferCheck(keys, "keys", count * 4);
    bufferCheck(indices, "indices", count * 4);
    if (count === 0) return { indices, count, direction, completion: Promise.resolve(), safeToRelease: Promise.resolve() };
    if (this.pending.size >= this.maxConcurrent) throw error("sort-busy", `GPU sort has ${this.maxConcurrent} pending submissions`);
    for (const pending of pendingByDevice.get(this.device) ?? []) {
      if (pending.indices === keys || pending.indices === indices || pending.keys === indices) {
        throw error("sort-busy", "a pending sort is reading or writing one of these buffers; await its completion first");
      }
    }
    const padded = nextPowerOfTwo(count);
    const scratchBytes = padded * PAIR_SIZE;
    const groups = Math.ceil(padded / this.workgroupSize);
    if (scratchBytes > this.maxStorageBindingSize || count * 4 > this.maxStorageBindingSize || scratchBytes > this.maxBufferSize || groups > this.maxWorkgroups) {
      throw error("sort-unsupported", `sort of ${count} keys exceeds the device storage, buffer, or workgroup limits`);
    }

    const stages: { readonly pipeline: NativeGpuSortPipeline; readonly name: string; readonly block: number; readonly stride: number }[] = [
      { pipeline: this.initializePipeline, name: "initialize", block: 0, stride: 0 }
    ];
    for (let block = 2; block <= padded; block *= 2) {
      for (let stride = block / 2; stride >= 1; stride /= 2) stages.push({ pipeline: this.comparePipeline, name: "compare_exchange", block, stride });
    }
    stages.push({ pipeline: this.outputPipeline, name: "write_indices", block: 0, stride: 0 });
    const parameterStride = Math.ceil(PARAMETER_SIZE / this.uniformAlignment) * this.uniformAlignment;
    const parameterBytes = parameterStride * stages.length;
    if (parameterBytes > this.maxBufferSize) throw error("sort-unsupported", `sort parameters need ${parameterBytes} bytes, exceeding the device buffer limit`);

    let scratch: NativeGpuSortOwnedBuffer | undefined;
    let parameters: NativeGpuSortOwnedBuffer | undefined;
    let submissionAttempted = false;
    let scopeOpen = false;
    let validation: Promise<{ readonly message: string } | null> = Promise.resolve(null);
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    let resolveReleased!: () => void;
    let resolveRecoveredFence!: () => void;
    let resolveSubmissionReady!: () => void;
    let rejectCleanupFailure!: (reason: unknown) => void;
    const completion = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const releasedPromise = new Promise<void>((yes) => { resolveReleased = yes; });
    const recoveredFence = new Promise<void>((yes) => { resolveRecoveredFence = yes; });
    const submissionReady = new Promise<void>((yes) => { resolveSubmissionReady = yes; });
    const cleanupFailure = new Promise<never>((_resolve, no) => { rejectCleanupFailure = no; });
    // Ignored submissions still have an observable original completion.
    void completion.catch(() => undefined);
    void cleanupFailure.catch(() => undefined);
    let pending!: PendingSort;
    try {
      if (this.device.pushErrorScope && this.device.popErrorScope) {
        this.device.pushErrorScope("validation");
        scopeOpen = true;
      }
      scratch = this.device.createBuffer({ label: "aura3d-sort-scratch", size: scratchBytes, usage: STORAGE });
      parameters = this.device.createBuffer({ label: "aura3d-sort-parameters", size: parameterBytes, usage: UNIFORM, mappedAtCreation: true });
      const mapped = parameters.getMappedRange();
      if (mapped.byteLength < parameterBytes) throw error("sort-submit-failed", "parameter buffer mapping is smaller than requested");
      const bytes = new DataView(mapped);
      for (let i = 0; i < stages.length; i++) {
        const offset = i * parameterStride;
        const stage = stages[i];
        [count, padded, stage.block, stage.stride, direction === "descending" ? 1 : 0, 0, 0, 0].forEach((value, field) => bytes.setUint32(offset + field * 4, value, true));
      }
      parameters.unmap();
      const encoder = this.device.createCommandEncoder({ label: "aura3d-gpu-sort" });
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const entries: { binding: number; resource: object }[] = [];
        if (stage.name === "initialize") entries.push({ binding: 0, resource: { buffer: keys, size: count * 4 } });
        entries.push({ binding: 1, resource: { buffer: scratch, size: scratchBytes } });
        entries.push({ binding: 2, resource: { buffer: parameters, offset: i * parameterStride, size: PARAMETER_SIZE } });
        if (stage.name === "write_indices") entries.push({ binding: 3, resource: { buffer: indices, size: count * 4 } });
        const bindGroup = this.device.createBindGroup({ label: `aura3d-sort-${stage.name}`, layout: stage.pipeline.getBindGroupLayout(0), entries });
        const pass = encoder.beginComputePass({ label: `aura3d-sort-${stage.name}` });
        pass.setPipeline(stage.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(groups);
        pass.end();
      }
      const command = encoder.finish();
      this.assertLive();
      pending = { keys, indices, scratch, parameters, signal, resolve, reject, releasedPromise, resolveReleased,
        resolveRecoveredFence, submissionReady, cleanupFailure, rejectCleanupFailure,
        scratchReleased: false, parametersReleased: false, settled: false, released: false, fenceRecovered: false };
      this.trackPending(pending);
      submissionAttempted = true;
      try { this.device.queue.submit([command]); }
      finally { resolveSubmissionReady(); }
      if (scopeOpen) {
        scopeOpen = false;
        try { validation = this.device.popErrorScope!(); }
        catch (cause) { validation = Promise.reject(cause); }
      }
    } catch (cause) {
      if (scopeOpen) {
        try { void this.device.popErrorScope!().catch(() => undefined); } catch { /* preserve original failure */ }
      }
      if (!submissionAttempted) { scratch?.destroy(); parameters?.destroy(); }
      if (submissionAttempted) {
        // A throwing submit may already have queued work. Keep the inputs and
        // scratch owned until a later fence or confirmed device loss proves safety.
        const failure = error("sort-submit-failed", `GPU sort submission failed: ${errorDetail(cause)}`, cause, releasedPromise);
        this.rejectPending(pending, failure);
        try { void this.device.queue.onSubmittedWorkDone().then(() => this.releasePending(pending), () => undefined); }
        catch { /* onIdle() or confirmed device loss can still release the buffers. */ }
        throw failure;
      }
      throw error("sort-submit-failed", `GPU sort submission failed: ${errorDetail(cause)}`, cause);
    }

    let fence: Promise<void>;
    try { fence = this.device.queue.onSubmittedWorkDone(); }
    catch (cause) { fence = Promise.reject(cause); }
    void fence.catch((cause: unknown) => {
      if (!pending.released && !pending.fenceRecovered) {
        this.rejectPending(pending, error("sort-fence-failed", "GPU completion fence failed; scratch remains retained until a later successful fence or device loss", cause));
      }
    });
    // A later queue fence can prove the submission safe even if the original
    // fence never settles. Preserve an earlier rejection when it settled first.
    void Promise.allSettled([Promise.race([fence, recoveredFence]), validation]).then(([fenced, scoped]) => {
      if (pending.released) return;
      if (fenced.status === "rejected") {
        // A failed fence does not prove that the GPU stopped using its buffers.
        // Retain them until a later successful onIdle() or device loss.
        const failure = error("sort-fence-failed", "GPU completion fence failed; scratch remains retained until a later successful fence or device loss", fenced.reason);
        if (pending.fenceRecovered) this.releasePending(pending, failure);
        else this.rejectPending(pending, failure);
        return;
      }
      if (scoped.status === "rejected") this.releasePending(pending, error("sort-submit-failed", "GPU validation scope failed", scoped.reason));
      else if (scoped.value) this.releasePending(pending, error("sort-submit-failed", `GPU sort validation failed: ${scoped.value.message}`));
      else if (signal?.aborted) this.releasePending(pending, error("sort-aborted", "GPU sort aborted after submission"));
      else this.releasePending(pending);
    });
    return { indices, count, direction, completion, safeToRelease: releasedPromise };
  }

  /** Wait for submitted work and release any scratch retained after a failed fence. */
  async onIdle(): Promise<void> {
    if (this.lost) throw this.lost;
    const snapshot = [...this.pending];
    if (!snapshot.length) return;
    // A reentrant disposal cannot fence until queue.submit has returned.
    await Promise.all(snapshot.map((pending) => pending.submissionReady));
    if (this.lost) throw this.lost;
    try { await this.device.queue.onSubmittedWorkDone(); }
    catch (cause) { throw error("sort-fence-failed", "GPU completion fence failed; scratch remains retained", cause); }
    const failures: NativeGpuSortError[] = [];
    for (const pending of snapshot) {
      // Normal submissions settle through their own validation scope. A job
      // already rejected by a failed fence can now safely release its memory.
      pending.fenceRecovered = true;
      pending.resolveRecoveredFence();
      if (pending.settled) {
        const failure = this.releasePending(pending);
        if (failure) failures.push(failure);
      }
    }
    if (failures.length) throw error("sort-cleanup-failed", "GPU sort cleanup remains incomplete", new AggregateError(failures));
  }

  /** Reject new work immediately; wait for all owned storage to become safe to release. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (!this.pending.size) return;
    if (this.lost) return this.retryLostCleanup();
    try { await this.onIdle(); }
    catch (cause) {
      if (!this.lost) throw cause;
      return this.retryLostCleanup();
    }
    await Promise.all([...this.pending].map((pending) => Promise.race([pending.releasedPromise, pending.cleanupFailure])));
  }

  private assertLive(): void {
    if (this.lost) throw this.lost;
    if (this.disposed) throw error("sort-disposed", "GPU sorter is disposed");
  }

  private trackPending(pending: PendingSort): void {
    this.pending.add(pending);
    pendingOwners.add(this);
    let devicePending = pendingByDevice.get(this.device);
    if (!devicePending) { devicePending = new Set(); pendingByDevice.set(this.device, devicePending); }
    devicePending.add(pending);
  }

  private rejectPending(pending: PendingSort, cause: NativeGpuSortError): void {
    if (!pending.settled) { pending.settled = true; pending.reject(cause); }
  }

  private releasePending(pending: PendingSort, cause?: NativeGpuSortError): NativeGpuSortError | undefined {
    if (pending.released) return;
    const failures: unknown[] = [];
    if (!pending.scratchReleased) {
      try { pending.scratch.destroy(); pending.scratchReleased = true; }
      catch (failure) { failures.push(failure); }
    }
    if (!pending.parametersReleased) {
      try { pending.parameters.destroy(); pending.parametersReleased = true; }
      catch (failure) { failures.push(failure); }
    }
    if (failures.length) {
      const reasons = cause ? [cause, ...failures] : failures;
      const failure = error("sort-cleanup-failed", "GPU sort buffer cleanup failed; ownership remains retained",
        new AggregateError(reasons), pending.releasedPromise);
      pending.rejectCleanupFailure(failure);
      this.rejectPending(pending, failure);
      return failure;
    }
    pending.released = true;
    this.pending.delete(pending);
    const devicePending = pendingByDevice.get(this.device);
    devicePending?.delete(pending);
    if (devicePending?.size === 0) pendingByDevice.delete(this.device);
    if (this.pending.size === 0) pendingOwners.delete(this);
    pending.resolveReleased();
    if (!pending.settled) {
      pending.settled = true;
      if (cause) pending.reject(cause); else pending.resolve();
    }
  }

  private retryLostCleanup(): void {
    const failures: NativeGpuSortError[] = [];
    for (const pending of [...this.pending]) {
      const failure = this.releasePending(pending, this.lost);
      if (failure) failures.push(failure);
    }
    if (failures.length) throw error("sort-cleanup-failed", "GPU sort loss cleanup remains incomplete", new AggregateError(failures));
  }

  private markLost(message: string): void {
    if (this.lost) return;
    this.lost = error("sort-device-lost", `GPU sort device lost: ${message}`);
    for (const pending of [...this.pending]) this.releasePending(pending, this.lost);
  }
}

/** Compile the native WGSL sort pipelines on the given renderer's active device. */
export async function createNativeGpuSort(device: unknown, options?: NativeGpuSortOptions): Promise<NativeGpuSort> {
  return NativeGpuSort.create(device, options);
}

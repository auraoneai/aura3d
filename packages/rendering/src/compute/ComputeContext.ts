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
  type ComputePipelineSpec,
  type ComputeRenderOwner,
  type ComputeSamplerSpec
} from "./types.js";
import type { RenderBuffer } from "../RenderDevice.js";
import { resourceDisposalInProgress, resourceDisposalPending } from "../ResourceLifecycle.js";
import type { Texture } from "../Texture.js";
import { compileShaderGraph, type ShaderGraphBinding, type ShaderGraphCompileResult, type ShaderGraphDocument, type ShaderGraphValueType } from "../program/ShaderGraphCompiler.js";
import { deriveUniformDataLayout, writeUniformData, type UniformBlockLayout } from "../program/UniformLayout.js";
import { assertWarmupActive, enqueueNativePipelineWarmup } from "../webgpu/NativePipelineWarmup.js";
import { deriveShaderDataLayout, writeShaderData, type ShaderDataLayout, type ShaderDataType, type ShaderDataValue } from "../webgpu/ShaderDataLayout.js";

const DEFAULT_LIMITS = {
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupsPerDimension: 65535,
  maxStorageBuffersPerShaderStage: 8,
  maxUniformBuffersPerShaderStage: 12,
  maxStorageTexturesPerShaderStage: 4,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  maxBufferSize: 268435456,
  maxBindGroups: 4,
  maxBindingsPerBindGroup: 1000
} as const;

const GLSL_MARKERS = /#version\b|\bvoid\s+main\s*\(|\bgl_FragColor\b|\bprecision\s+(?:highp|mediump|lowp)\b/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BINDING_TYPES: readonly ComputeBindingType[] = ["storage", "read-only-storage", "uniform", "storage-texture", "sampled-texture", "sampler"];
const SHARED_STORAGE_USAGE = COMPUTE_BUFFER_USAGE.STORAGE | COMPUTE_BUFFER_USAGE.COPY_SRC | COMPUTE_BUFFER_USAGE.COPY_DST;

type Triple = readonly [number, number, number];

interface PreparedComputePipeline {
  readonly wgsl: string;
  readonly entryPoint: string;
  readonly workgroupSize: Triple;
  readonly bindings: readonly ComputeBindingSpec[];
  readonly label: string | undefined;
  readonly graphResources?: readonly ShaderGraphBinding[];
}

interface ComputeReadback {
  native?: ComputeGPUBufferLike;
  attempted?: boolean;
  failure?: { readonly error: unknown };
}

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
  readonly label: string | undefined;
  readonly #bindingSnapshot: readonly ComputeBindingSpec[];
  readonly #graphResourceSnapshot: readonly ShaderGraphBinding[] | undefined;
  private isDisposed = false;

  /** @internal */
  constructor(
    readonly owner: ComputeContext,
    id: number,
    readonly native: { getBindGroupLayout(index: number): unknown },
    spec: { entryPoint: string; workgroupSize: Triple; bindings: readonly ComputeBindingSpec[]; label: string | undefined; graphResources?: readonly ShaderGraphBinding[] }
  ) {
    this.id = id;
    this.entryPoint = spec.entryPoint;
    this.workgroupSize = spec.workgroupSize;
    this.#bindingSnapshot = spec.bindings;
    this.label = spec.label;
    this.#graphResourceSnapshot = spec.graphResources;
  }

  get bindings(): readonly ComputeBindingSpec[] { return this.#bindingSnapshot; }
  /** Graph metadata is snapshotted so later edits cannot change a live pipeline. */
  get graphResources(): readonly ShaderGraphBinding[] | undefined { return this.#graphResourceSnapshot; }

  get disposed(): boolean {
    return this.isDisposed || this.owner.disposed;
  }

  /**
   * Return the physical WGSL layout for a graph buffer. Uniform aggregates
   * include the compiler's outer `value` struct; storage layouts are runtime
   * arrays containing `elementCount` logical elements.
   */
  getGraphBufferLayout(resourceName: string, elementCount = 1): ShaderDataLayout {
    const resource = this.graphBufferResource(resourceName);
    return graphBufferLayout(resource, elementCount);
  }

  /**
   * Validate, pack and upload logical graph data. A uniform receives one value;
   * storage receives a nonempty array of elements, starting at `firstElement`.
   * Matrices are unpadded column-major values; the layout writer adds padding.
   */
  writeGraphBuffer(resourceName: string, buffer: ComputeBuffer, value: ShaderDataValue, firstElement = 0): void {
    const resource = this.graphBufferResource(resourceName);
    if (!(buffer instanceof ComputeBuffer) || buffer.owner !== this.owner) throw invalid(`compute graph resource ${resourceName} requires a buffer from this compute context`);
    if (buffer.disposed) throw new ComputeError("compute-disposed", `compute buffer for graph resource ${resourceName} is disposed`);
    buffer.validateForDispatch();
    const uniform = resource.kind === "uniform";
    if ((buffer.usage === "uniform") !== uniform) throw invalid(`compute graph resource ${resourceName} requires a ${uniform ? "uniform" : "storage"} buffer`);
    if (!Number.isSafeInteger(firstElement) || firstElement < 0 || (uniform && firstElement !== 0)) {
      throw invalid(`compute graph resource ${resourceName} has an invalid first element`);
    }

    const single = graphBufferLayout(resource, 1);
    let count = 1;
    if (!uniform) {
      if (!value || typeof value !== "object" || value instanceof DataView) {
        throw invalid(`compute graph storage resource ${resourceName} requires a nonempty array of elements`);
      }
      const length = (value as ArrayLike<unknown>).length;
      if (!Number.isSafeInteger(length) || length < 1) throw invalid(`compute graph storage resource ${resourceName} requires a nonempty array of elements`);
      count = length;
    }
    const stride = uniform ? single.size : single.stride!;
    const byteOffset = firstElement * stride;
    const byteLength = count * stride;
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || !Number.isSafeInteger(byteOffset + byteLength) || byteOffset + byteLength > buffer.size) {
      throw invalid(`compute graph resource ${resourceName} write exceeds the ${buffer.size}-byte buffer`);
    }

    let bytes: Uint8Array;
    try {
      if (uniform && resource.dataType !== undefined) {
        bytes = writeUniformData(graphUniformBlock(resource), "wgsl-uniform", { value });
      } else if (uniform && resource.type === "bool") {
        if (value !== true && value !== false && value !== 0 && value !== 1) throw new TypeError("$: expected true, false, 0, or 1");
        bytes = writeShaderData(single, value === true || value === 1 ? 1 : 0);
      } else {
        bytes = writeShaderData(uniform ? single : graphBufferLayout(resource, count), value);
      }
    } catch (error) {
      if (error instanceof ComputeError) throw error;
      throw new ComputeError("compute-invalid-spec", `compute graph resource ${resourceName}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    // Value accessors can run arbitrary code while packing. Recheck both handles
    // before the first queue write, including render-device generation.
    this.owner.assertOwnedPipeline(this);
    buffer.write(bytes, byteOffset);
  }

  private graphBufferResource(name: string): ShaderGraphBinding {
    this.owner.assertOwnedPipeline(this);
    if (!this.graphResources) throw invalid("graph buffer layouts require a graph compute pipeline");
    const resource = this.graphResources.find((entry) => entry.name === name);
    if (!resource || (resource.kind !== "uniform" && resource.kind !== "storage-buffer")) throw invalid(`no compute graph buffer resource named ${String(name)}`);
    return resource;
  }

  /** Idempotent. WebGPU pipelines have no explicit destroy; this retires the handle. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.owner.forgetPipeline(this);
  }
}

/** A device-owned sampler; WebGPU samplers have no explicit native destroy operation. */
export class ComputeSampler {
  private isDisposed = false;
  constructor(readonly owner: ComputeContext, readonly native: unknown, readonly comparison = false, readonly filtering = false) {}
  get disposed(): boolean { return this.isDisposed || this.owner.disposed; }
  dispose(): void { if (!this.isDisposed) { this.isDisposed = true; this.owner.forgetSampler(this); } }
}

export class ComputeBuffer {
  readonly size: number;
  readonly usage: ComputeBufferUsage;
  readonly label: string | undefined;
  private isDisposed = false;
  private disposing = false;
  private disposalComplete = false;
  private disposalAttempted = false;
  private renderDisposalReturned = false;
  private readonly disposalFailures: unknown[] = [];
  private readonly retirementFailures: unknown[] = [];
  private retirementComplete = false;
  private receiptObserved = false;
  private receiptVersion = 0;

  /** @internal */
  constructor(
    readonly owner: ComputeContext,
    readonly native: ComputeGPUBufferLike,
    size: number,
    usage: ComputeBufferUsage,
    label: string | undefined,
    private readonly renderBuffer?: RenderBuffer,
    private readonly ownsRenderBuffer = false,
    private readonly nativeRetirementKnown = true
  ) {
    this.size = size;
    this.usage = usage;
    this.label = label;
  }

  get disposed(): boolean {
    return this.isDisposed || this.renderBuffer?.disposed === true || this.owner.disposed;
  }

  /**
   * Return the same renderer-owned storage allocation for graph bindings.
   * For a compute-created buffer, disposing either handle invalidates both.
   * When this wrapper borrows an existing render buffer, disposing the wrapper
   * does not dispose the caller's render buffer.
   */
  asRenderBuffer(): RenderBuffer {
    this.assertLive("share with rendering");
    if (!this.renderBuffer || this.usage !== "storage") throw invalid("sharing a compute buffer with rendering requires a storage buffer created or borrowed from the mounted native render owner");
    return this.renderBuffer;
  }

  /** Upload bytes at a 4-byte-aligned offset. */
  write(data: ArrayBufferView | ArrayBuffer, byteOffset = 0): void {
    this.assertLive("write");
    const byteLength = data.byteLength;
    if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset % 4 !== 0) throw invalid(`write offset must be a non-negative multiple of 4, got ${String(byteOffset)}`);
    if (byteLength % 4 !== 0) throw invalid(`write length must be a multiple of 4 bytes, got ${byteLength}`);
    if (byteOffset + byteLength > this.size) throw invalid(`write of ${byteLength} bytes at offset ${byteOffset} exceeds the ${this.size}-byte buffer`);
    this.assertLive("write");
    this.owner.writeNativeBuffer(this.native, byteOffset, data);
  }

  /** Copy the buffer to a staging buffer, map it and return the bytes. Rejects with `compute-read-failed`. */
  async read(): Promise<ArrayBuffer> {
    this.assertLive("read");
    const device = this.owner.device;
    const readback = this.owner.beginReadback();
    let staging: ComputeGPUBufferLike;
    try {
      staging = device.createBuffer({
        label: `${this.label ?? "compute-buffer"}-readback`,
        size: this.size,
        usage: COMPUTE_BUFFER_USAGE.MAP_READ | COMPUTE_BUFFER_USAGE.COPY_DST
      });
      readback.native = staging;
    } catch (error) {
      this.owner.finishReadback(readback);
      throw error;
    }
    let readFailure: { readonly error: unknown } | undefined;
    try {
      const encoder = device.createCommandEncoder({ label: "aura3d-compute-readback" });
      this.assertLive("read");
      encoder.copyBufferToBuffer(this.native, 0, staging, 0, this.size);
      this.assertLive("read");
      const command = encoder.finish();
      this.assertLive("read");
      this.owner.submit([command], [{ resource: this.native, mode: "read" }]);
      await staging.mapAsync(COMPUTE_MAP_MODE_READ);
      this.assertLive("complete read");
      const copy = staging.getMappedRange().slice(0);
      staging.unmap();
      return copy;
    } catch (error) {
      const reported = error instanceof ComputeError && error.code === "compute-disposed" ? error
        : new ComputeError("compute-read-failed", `compute buffer read failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      readFailure = { error: reported };
      throw reported;
    } finally {
      try { this.owner.finishReadback(readback); } catch (cleanup) {
        if (readFailure) throw new AggregateError([readFailure.error, cleanup], "Compute read and cleanup failed", { cause: readFailure.error });
        throw cleanup;
      }
    }
  }

  /** Public use closes immediately; failed or fenced cleanup remains owned. */
  dispose(): void {
    if (this.disposalComplete || this.disposing) return;
    if (!this.isDisposed) {
      this.owner.assertOwnedBuffer(this);
      this.isDisposed = true;
    }
    if (this.owner.queueUseInProgress) {
      this.owner.deferBufferRetirement(this);
      this.throwCleanupFailures();
      return;
    }
    this.disposing = true;
    try {
      if (this.renderBuffer && !this.ownsRenderBuffer) {
        // A borrowed wrapper never releases the caller's render buffer.
        this.completeDisposal();
      } else if (this.ownsRenderBuffer) {
        this.disposeOwnedRenderBuffer();
      } else if (!this.disposalAttempted) {
        this.disposalAttempted = true;
        let retirement: Promise<void> | undefined;
        try {
          retirement = this.owner.releaseNativeBuffer(this.native);
        } catch (error) {
          // A structural destroy/retire may have taken effect before throwing.
          // Keep the handle and failure; never invoke that operation twice.
          this.recordFailure(this.disposalFailures, error);
          this.observeRenderRetirement();
          throw error;
        }
        if (retirement) {
          this.observeRetirement(retirement);
          this.observeRenderRetirement();
          if (this.retirementFailures.length) throw this.retirementFailures[0];
        } else {
          this.completeDisposal();
        }
      } else {
        // Observing a later receipt is safe; repeating a structural destroy is not.
        if (this.retirementFailures.length || this.disposalFailures.length) this.observeRenderRetirement();
        if (this.disposalFailures.length) throw this.disposalFailures[0];
        if (this.retirementFailures.length) throw this.retirementFailures[0];
      }
    } catch (error) {
      if (!this.disposalFailures.some((failure) => Object.is(failure, error)) &&
          !this.retirementFailures.some((failure) => Object.is(failure, error))) {
        this.recordFailure(this.disposalFailures, error);
      }
      this.throwCleanupFailures();
      throw error;
    } finally {
      this.disposing = false;
      if (this.disposalComplete) this.owner.forgetBuffer(this);
    }
  }

  /** @internal Closed does not mean a native retirement has completed. */
  get [resourceDisposalPending](): boolean { return this.isDisposed && !this.disposalComplete; }
  /** @internal */
  get [resourceDisposalInProgress](): boolean { return this.disposing; }

  private disposeOwnedRenderBuffer(): void {
    const buffer = this.renderBuffer!;
    // The internal lifecycle marker is a contract for retryable wrapper
    // cleanup. Without it a throwing structural disposer is ambiguous.
    const retryable = typeof (buffer as RenderBuffer & {
      readonly [resourceDisposalPending]?: boolean;
    })[resourceDisposalPending] === "boolean";
    if (!this.disposalAttempted || retryable) {
      if ((buffer as RenderBuffer & { readonly [resourceDisposalInProgress]?: boolean })[resourceDisposalInProgress]) {
        if (!this.receiptObserved) this.observeRenderRetirement();
        if (this.disposalFailures.length) throw this.disposalFailures[0];
        if (this.retirementFailures.length) throw this.retirementFailures[0];
        return;
      }
      this.disposalAttempted = true;
      this.renderDisposalReturned = false;
      try {
        this.owner.releaseOwnedRenderBuffer(buffer);
        this.renderDisposalReturned = true;
      } catch (error) {
        this.recordFailure(this.disposalFailures, error);
        this.observeRenderRetirement();
        throw error;
      }
    }
    this.checkRenderDisposal();
    if (!this.disposalComplete && (!this.receiptObserved || this.retirementFailures.length)) this.observeRenderRetirement();
    if (this.disposalFailures.length) throw this.disposalFailures[0];
    if (this.retirementFailures.length) throw this.retirementFailures[0];
  }

  private checkRenderDisposal(): void {
    if (!this.renderBuffer) return;
    const buffer = this.renderBuffer as RenderBuffer & {
      readonly [resourceDisposalPending]?: boolean;
      readonly [resourceDisposalInProgress]?: boolean;
    };
    if (resourceDisposalPending in buffer) {
      if (!this.renderDisposalReturned && this.disposalFailures.length) return;
      const pending = buffer[resourceDisposalPending];
      const inProgress = buffer[resourceDisposalInProgress];
      if (buffer.disposed !== true || typeof pending !== "boolean" || pending || inProgress === true ||
          (inProgress !== undefined && typeof inProgress !== "boolean")) return;
      // This marker covers both wrapper cleanup and native retirement.
      this.completeDisposal();
    } else if (this.renderDisposalReturned && this.retirementComplete && !this.disposalFailures.length) {
      // A successful structural wrapper call plus a native receipt proves
      // release. Without either receipt, retain the owner rather than guess.
      this.completeDisposal();
    }
  }

  private observeRenderRetirement(): void {
    if (!this.nativeRetirementKnown) return;
    let receipt: Promise<void> | undefined;
    try {
      receipt = this.owner.nativeRetirementReceipt(this.native);
    } catch (error) {
      this.recordFailure(this.retirementFailures, error);
      return;
    }
    if (receipt) this.observeRetirement(receipt);
  }

  private observeRetirement(receipt: Promise<void>): void {
    this.receiptObserved = true;
    const version = ++this.receiptVersion;
    void Promise.resolve(receipt).then(() => {
      if (this.disposalComplete) return;
      this.retirementComplete = true;
      this.retirementFailures.length = 0;
      if (!this.ownsRenderBuffer) {
        this.completeDisposal();
      } else {
        try { this.checkRenderDisposal(); } catch (error) { this.recordFailure(this.disposalFailures, error); }
      }
    }, (error: unknown) => {
      if (!this.disposalComplete && version === this.receiptVersion) this.recordFailure(this.retirementFailures, error);
    });
  }

  private recordFailure(failures: unknown[], error: unknown): void {
    if (!failures.some((failure) => Object.is(failure, error))) failures.push(error);
  }

  private throwCleanupFailures(): void {
    const failures = [...this.disposalFailures, ...this.retirementFailures]
      .filter((failure, index, all) => all.findIndex((entry) => Object.is(entry, failure)) === index);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Compute buffer cleanup failed", { cause: failures[0] });
  }

  private completeDisposal(): void {
    this.disposalComplete = true;
    this.disposalFailures.length = 0;
    this.retirementFailures.length = 0;
    if (!this.disposing) this.owner.forgetBuffer(this);
  }

  private assertLive(operation: string): void {
    if (this.disposed) throw new ComputeError("compute-disposed", `compute buffer "${this.label ?? "unnamed"}" is disposed; cannot ${operation}`);
    this.owner.assertOwnedBuffer(this);
    this.owner.validateNativeBuffer(this.native, this.renderBuffer);
    // Render-owner getters can synchronously retire this wrapper.
    if (this.disposed) throw new ComputeError("compute-disposed", `compute buffer "${this.label ?? "unnamed"}" is disposed; cannot ${operation}`);
  }

  /** @internal */
  validateForDispatch(): void { this.assertLive("dispatch"); }
}

export class ComputeContext {
  readonly limits: ComputeLimits;
  private readonly buffers = new Set<ComputeBuffer>();
  private readonly pipelines = new Set<ComputePipeline>();
  private readonly samplers = new Set<ComputeSampler>();
  private readonly readbacks = new Set<ComputeReadback>();
  private readonly uncertainAllocations = new Set<{ readonly native: ComputeGPUBufferLike; readonly error: unknown }>();
  private readonly deferredBuffers = new Set<ComputeBuffer>();
  private bufferCreationsInProgress = 0;
  private lossSubscriptionsInProgress = 0;
  private queueUsesInProgress = 0;
  private deferredDrainsInProgress = 0;
  private nextPipelineId = 1;
  private isDisposed = false;
  private disposing = false;
  private readonly cleanupListeners = new Set<() => void>();
  private warmupAbortFailure: { readonly error: unknown } | undefined;
  private warmupObserverFailure: { readonly error: unknown; readonly remove?: () => void } | undefined;
  private readonly generation: number | undefined;
  private readonly renderInterop: ComputeRenderOwner["resourceInterop"] | undefined;
  private readonly warmupLifetime = new AbortController();
  private warmupLossObserverInstalled = false;
  private removeWarmupLossObserver: (() => void) | undefined;
  private nativeDeviceLost = false;

  constructor(readonly device: ComputeGPUDeviceLike, private readonly renderOwner?: ComputeRenderOwner) {
    for (const method of ["createShaderModule", "createComputePipeline", "createBuffer", "createBindGroup", "createCommandEncoder"] as const) {
      if (typeof (device as unknown as Record<string, unknown>)?.[method] !== "function") {
        throw invalid(`createComputeContext needs a WebGPU GPUDevice; \`${method}\` is missing`);
      }
    }
    if (typeof device.queue?.submit !== "function" || typeof device.queue?.writeBuffer !== "function") {
      throw invalid("createComputeContext needs a WebGPU GPUDevice with a queue that supports submit and writeBuffer");
    }
    if (renderOwner && (renderOwner.disposed || renderOwner.contextLost || renderOwner.nativeGpuDevice !== device || !Number.isInteger(renderOwner.generation) || renderOwner.generation < 1 ||
      typeof renderOwner.createBuffer !== "function" || typeof renderOwner.getNativeStorageBuffer !== "function" || typeof renderOwner.getNativeTexture !== "function" ||
      !renderOwner.resourceInterop || renderOwner.resourceInterop.disposed || renderOwner.resourceInterop.queue !== device.queue ||
      renderOwner.resourceInterop.generation !== renderOwner.generation ||
      ["register", "assertUsable", "submit", "retire"].some((name) => typeof (renderOwner.resourceInterop as unknown as Record<string, unknown>)[name] !== "function"))) {
      throw invalid("compute render owner must be a live owner of this same native device generation");
    }
    this.generation = renderOwner?.generation;
    this.renderInterop = renderOwner?.resourceInterop;
    this.limits = new ComputeLimits(device.limits);
  }

  get disposed(): boolean {
    return this.isDisposed || this.nativeDeviceLost || this.renderOwnerIsStale();
  }

  createPipeline(spec: ComputePipelineSpec): ComputePipeline {
    const prepared = this.preparePipeline(spec);
    const descriptor = this.nativePipelineDescriptor(prepared);
    this.assertLive();
    const native = this.device.createComputePipeline(descriptor);
    return this.publishPipeline(prepared, native);
  }

  /**
   * Compile one concrete pipeline without encoding or submitting GPU work.
   * The returned handle is the compiled variant to use with `dispatch`.
   * Input metadata is snapshotted before waiting for the per-device compile
   * slot. Cancellation or context disposal rejects the waiter; an already
   * issued native compile remains serialized until the driver settles it.
   *
   * Async compilation and device-loss notification are required. A borrowed
   * render owner should dispose this context when it is retired so a pending
   * waiter can also be cancelled before the native compile finishes.
   */
  async createPipelineAsync(spec: ComputePipelineSpec, options: { readonly signal?: AbortSignal } = {}): Promise<ComputePipeline> {
    const signals = [this.warmupLifetime.signal, options.signal];
    assertWarmupActive(signals);
    this.assertLive();
    const compile = this.device.createComputePipelineAsync;
    if (typeof compile !== "function") throw invalid("compute pipeline warmup requires createComputePipelineAsync");
    this.observeWarmupLoss();
    const prepared = this.preparePipeline(spec);
    assertWarmupActive(signals);
    const native = await enqueueNativePipelineWarmup(this.device, () => {
      this.assertLive();
      assertWarmupActive(signals);
      const descriptor = this.nativePipelineDescriptor(prepared);
      this.assertLive();
      assertWarmupActive(signals);
      return compile.call(this.device, descriptor);
    }, signals);
    assertWarmupActive(signals);
    return this.publishPipeline(prepared, native, signals);
  }

  /** Validate and snapshot the exact same descriptor for sync and async creation. */
  private preparePipeline(spec: ComputePipelineSpec): PreparedComputePipeline {
    this.assertLive();
    if (typeof spec !== "object" || spec === null) throw invalid("createComputePipeline needs a spec object");
    const graph = spec.graph;
    if (graph !== undefined && (spec.wgsl !== undefined || spec.bindings !== undefined || spec.entryPoint !== undefined || spec.workgroupSize !== undefined)) {
      throw invalid("a graph pipeline cannot override WGSL, bindings, entryPoint or workgroupSize");
    }
    const graphInfo = graph === undefined ? undefined : bindingsForGraph(graph);
    const wgsl = graphInfo?.wgsl ?? spec.wgsl;
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
    if (declared && declared.some((size) => !isPositiveInt(size))) throw invalid("shader @workgroup_size must contain positive integers");
    const requested = spec.workgroupSize === undefined ? undefined : normalizeTriple(spec.workgroupSize, "workgroupSize");
    if (declared && requested && (declared[0] !== requested[0] || declared[1] !== requested[1] || declared[2] !== requested[2])) {
      throw invalid(`workgroupSize [${requested.join(", ")}] does not match the shader's @workgroup_size(${declared.join(", ")})`);
    }
    const size: Triple = declared ?? requested ?? [64, 1, 1];
    const workgroupSize: Triple = Object.freeze([size[0], size[1], size[2]] as const);
    const [wx, wy, wz] = workgroupSize;
    if (wx > this.limits.get("maxComputeWorkgroupSizeX") || wy > this.limits.get("maxComputeWorkgroupSizeY") || wz > this.limits.get("maxComputeWorkgroupSizeZ")) {
      throw invalid(`workgroup size [${workgroupSize.join(", ")}] exceeds the device limits [${this.limits.get("maxComputeWorkgroupSizeX")}, ${this.limits.get("maxComputeWorkgroupSizeY")}, ${this.limits.get("maxComputeWorkgroupSizeZ")}]`);
    }
    if (wx * wy * wz > this.limits.get("maxComputeInvocationsPerWorkgroup")) {
      throw invalid(`workgroup size ${wx * wy * wz} invocations exceeds maxComputeInvocationsPerWorkgroup ${this.limits.get("maxComputeInvocationsPerWorkgroup")}`);
    }

    const bindings = this.validateBindings(graphInfo?.bindings ?? spec.bindings ?? []);
    if (graphInfo) {
      for (const binding of bindings) if (binding.minBindingSize !== undefined) {
        const limitName = binding.type === "uniform" ? "maxUniformBufferBindingSize" : "maxStorageBufferBindingSize";
        if (binding.minBindingSize > this.limits.get(limitName) || binding.minBindingSize > this.limits.get("maxBufferSize")) {
          throw invalid(`binding ${binding.group ?? 0}:${binding.binding} minimum size ${binding.minBindingSize} exceeds the device buffer limits`);
        }
      }
    } else validateWgslGroups(wgsl, bindings);
    return { wgsl, entryPoint, workgroupSize, bindings, label: spec.label, ...(graphInfo ? { graphResources: graphInfo.resources } : {}) };
  }

  private nativePipelineDescriptor(prepared: PreparedComputePipeline): object {
    const label = prepared.label ?? "aura3d-compute";
    const module = this.device.createShaderModule({ label, code: prepared.wgsl });
    return {
      label,
      layout: "auto",
      compute: { module, entryPoint: prepared.entryPoint }
    };
  }

  private publishPipeline(
    prepared: PreparedComputePipeline,
    native: { getBindGroupLayout(index: number): unknown },
    signals: readonly (AbortSignal | undefined)[] = []
  ): ComputePipeline {
    this.assertLive();
    assertWarmupActive(signals);
    if (!native || typeof native.getBindGroupLayout !== "function") throw invalid("native compute pipeline is invalid");
    // Structural devices can reenter disposal or cancellation from a getter.
    this.assertLive();
    assertWarmupActive(signals);
    const pipeline = new ComputePipeline(this, this.nextPipelineId++, native, prepared);
    this.pipelines.add(pipeline);
    return pipeline;
  }

  createBuffer(spec: ComputeBufferSpec): ComputeBuffer {
    this.assertLive();
    this.bufferCreationsInProgress++;
    try { return this.createBufferImpl(spec); } finally {
      this.bufferCreationsInProgress--;
      this.notifyCleanupComplete();
    }
  }

  private createBufferImpl(spec: ComputeBufferSpec): ComputeBuffer {
    if (typeof spec !== "object" || spec === null) throw invalid("computeBuffer needs a spec object");
    const usage = spec.usage ?? "storage";
    if (usage !== "storage" && usage !== "uniform") throw invalid(`buffer usage must be "storage" or "uniform", got ${String(usage)}`);
    const hasData = spec.data !== undefined;
    if (!hasData && spec.size === undefined) throw invalid("computeBuffer needs `size` or `data`");
    if (spec.size !== undefined && (!Number.isInteger(spec.size) || spec.size < 1)) throw invalid("buffer size must be a positive integer number of bytes");
    if (hasData && !(spec.data instanceof ArrayBuffer) && !ArrayBuffer.isView(spec.data)) throw invalid("buffer data must be an ArrayBuffer or typed view");
    const raw = hasData ? spec.data!.byteLength : spec.size!;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) throw invalid(`buffer size must be a positive integer number of bytes, got ${String(raw)}`);
    if (hasData && spec.size !== undefined && spec.size < raw) throw invalid(`size ${spec.size} is smaller than the ${raw}-byte data`);
    const size = Math.ceil(Math.max(raw, spec.size ?? 0) / 4) * 4;
    const bindingLimit = usage === "uniform" ? this.limits.get("maxUniformBufferBindingSize") : this.limits.get("maxStorageBufferBindingSize");
    if (size > bindingLimit) throw invalid(`${usage} buffer of ${size} bytes exceeds the device binding limit ${bindingLimit}`);
    if (size > this.limits.get("maxBufferSize")) throw invalid(`buffer of ${size} bytes exceeds maxBufferSize ${this.limits.get("maxBufferSize")}`);
    const gpuUsage = (usage === "uniform" ? COMPUTE_BUFFER_USAGE.UNIFORM : COMPUTE_BUFFER_USAGE.STORAGE) | COMPUTE_BUFFER_USAGE.COPY_SRC | COMPUTE_BUFFER_USAGE.COPY_DST;
    this.assertLive();
    let renderBuffer: RenderBuffer | undefined;
    let native: ComputeGPUBufferLike;
    if (this.renderOwner && usage === "storage") {
      // The renderer owns the allocation and tracks its native lease. This is
      // the exact buffer later supplied to graph storage bindings, so compute
      // and drawing never copy data between allocations or device generations.
      renderBuffer = this.renderOwner.createBuffer("storage", size);
      let shared: ComputeGPUBufferLike | undefined;
      try {
        if (!renderBuffer || renderBuffer.disposed || renderBuffer.usage !== "storage" || renderBuffer.byteLength !== size) {
          throw invalid("render owner returned an invalid storage buffer");
        }
        const handle = this.renderOwner.getNativeStorageBuffer(renderBuffer);
        this.renderOwner.resourceInterop.assertUsable(handle);
        shared = handle as unknown as ComputeGPUBufferLike;
        if (handle.size < size || (handle.usage & SHARED_STORAGE_USAGE) !== SHARED_STORAGE_USAGE) throw invalid("render buffer lacks native storage/copy usage or capacity");
        // Native GPUObject labels are mutable. Preserve the compute label on
        // the shared allocation; structural test devices may omit that field.
        if (spec.label !== undefined && "label" in handle && typeof handle.label === "string") {
          try { (handle as { label: string }).label = spec.label; } catch { /* A device-shaped mock may expose a read-only label. */ }
        }
        native = shared;
      } catch (error) {
        if (renderBuffer && (typeof renderBuffer === "object" || typeof renderBuffer === "function")) {
          // Validation can fail before the native handle is knowable. Retain
          // the unpublished wrapper if its cleanup or receipt is incomplete.
          const cleanup = new ComputeBuffer(this, shared ?? renderBuffer as unknown as ComputeGPUBufferLike,
            size, usage, spec.label, renderBuffer, true, shared !== undefined);
          this.buffers.add(cleanup);
          try { cleanup.dispose(); } catch (failure) {
            throw new AggregateError([error, failure], "Compute buffer creation and cleanup failed", { cause: error });
          }
        }
        throw error;
      }
    } else {
      native = this.device.createBuffer({ label: spec.label ?? "aura3d-compute-buffer", size, usage: gpuUsage });
      try {
        this.renderOwner?.resourceInterop.register(native, () => native.destroy());
      } catch (error) {
        // A failed structural registration can have succeeded or returned an
        // aliased handle. Neither ownership nor a safe destroy is established.
        const uncertain = { native, error };
        this.uncertainAllocations.add(uncertain);
        try {
          const receipt = this.nativeRetirementReceipt(native);
          if (receipt) void Promise.resolve(receipt).then(() => {
            this.uncertainAllocations.delete(uncertain);
            this.notifyCleanupComplete();
          }, () => {});
        } catch { /* Keep the original registration failure and allocation. */ }
        throw error;
      }
    }
    const buffer = new ComputeBuffer(this, native, size, usage, spec.label, renderBuffer, renderBuffer !== undefined);
    this.buffers.add(buffer);
    try {
      this.assertLive();
      if (hasData) {
        const bytes = spec.data instanceof ArrayBuffer
          ? new Uint8Array(spec.data)
          : new Uint8Array(spec.data!.buffer, spec.data!.byteOffset, spec.data!.byteLength);
        const padded = bytes.byteLength === size ? bytes : (() => { const out = new Uint8Array(size); out.set(bytes); return out; })();
        this.writeNativeBuffer(native, 0, padded);
      }
      this.assertLive();
    } catch (error) {
      try { buffer.dispose(); } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Compute buffer creation and cleanup failed", { cause: error });
      }
      throw error;
    }
    return buffer;
  }

  createSampler(spec: ComputeSamplerSpec = {}): ComputeSampler {
    this.assertLive();
    if (!spec || typeof spec !== "object") throw invalid("compute sampler options must be an object");
    if (!this.device.createSampler) throw invalid("compute sampler creation is unavailable on this device");
    for (const address of [spec.addressModeU, spec.addressModeV, spec.addressModeW]) {
      if (address !== undefined && !["clamp-to-edge", "repeat", "mirror-repeat"].includes(address)) throw invalid("invalid compute sampler address mode");
    }
    for (const filter of [spec.magFilter, spec.minFilter, spec.mipmapFilter]) {
      if (filter !== undefined && filter !== "nearest" && filter !== "linear") throw invalid("invalid compute sampler filter");
    }
    if (spec.compare !== undefined && !["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"].includes(spec.compare)) throw invalid("invalid compute sampler comparison");
    const min = spec.lodMinClamp ?? 0;
    const max = spec.lodMaxClamp ?? 32;
    const anisotropy = spec.maxAnisotropy ?? 1;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min || !Number.isInteger(anisotropy) || anisotropy < 1 || anisotropy > 16) throw invalid("invalid compute sampler LOD range or anisotropy");
    if (anisotropy > 1 && (spec.magFilter !== "linear" || spec.minFilter !== "linear" || spec.mipmapFilter !== "linear")) throw invalid("anisotropic compute samplers require linear filters");
    const sampler = new ComputeSampler(this, this.device.createSampler(spec), spec.compare !== undefined,
      spec.magFilter === "linear" || spec.minFilter === "linear" || spec.mipmapFilter === "linear" || anisotropy > 1);
    this.samplers.add(sampler);
    return sampler;
  }

  /** Borrow a renderer-owned storage buffer; disposal never destroys its native allocation. */
  borrowRenderBuffer(buffer: RenderBuffer): ComputeBuffer {
    this.assertLive();
    if (!this.renderOwner) throw invalid("borrowing a render buffer requires a mounted native render owner");
    if (!buffer || buffer.disposed) throw new ComputeError("compute-disposed", "cannot borrow a disposed render buffer");
    const native = this.renderOwner.getNativeStorageBuffer(buffer);
    if (buffer.byteLength % 4 !== 0 || native.size < buffer.byteLength || (native.usage & SHARED_STORAGE_USAGE) !== SHARED_STORAGE_USAGE) throw invalid("render buffer lacks native storage/copy usage or a four-byte-aligned size");
    this.renderOwner.resourceInterop.assertUsable(native);
    const borrowed = new ComputeBuffer(this, native as unknown as ComputeGPUBufferLike, buffer.byteLength, "storage", `render-buffer-${buffer.id}`, buffer);
    this.buffers.add(borrowed);
    return borrowed;
  }

  /** @internal Queue-ordered submissions share the render owner's resource leases. */
  submit(commands: unknown[], accesses: readonly { readonly resource: object; readonly mode: "read" | "write" | "readwrite" }[] = []): void {
    this.assertLive();
    this.withQueueUse(() => {
      const interop = this.renderInterop;
      if (interop) {
        const submit = interop.submit;
        this.assertLive();
        submit.call(interop, commands, accesses);
      } else {
        const queue = this.device.queue;
        const submit = queue.submit;
        this.assertLive();
        submit.call(queue, commands);
      }
    });
  }

  /** @internal Queue writes must finish entering the queue before retirement fences are requested. */
  writeNativeBuffer(native: ComputeGPUBufferLike, offset: number, data: ArrayBufferView | ArrayBuffer): void {
    this.assertLive();
    this.withQueueUse(() => {
      const queue = this.device.queue;
      const write = queue.writeBuffer;
      this.assertLive();
      write.call(queue, native, offset, data);
    });
  }

  /** @internal */
  get queueUseInProgress(): boolean { return this.queueUsesInProgress > 0; }
  /** @internal */
  deferBufferRetirement(buffer: ComputeBuffer): void { this.deferredBuffers.add(buffer); }

  private withQueueUse<T>(operation: () => T): T {
    this.queueUsesInProgress++;
    let failure: { readonly error: unknown } | undefined;
    try { return operation(); } catch (error) {
      failure = { error };
      throw error;
    } finally {
      this.queueUsesInProgress--;
      if (!this.queueUsesInProgress) {
        this.deferredDrainsInProgress++;
        try {
          const errors: unknown[] = [];
          for (const buffer of [...this.deferredBuffers]) {
            this.deferredBuffers.delete(buffer);
            try { buffer.dispose(); } catch (error) { errors.push(error); }
          }
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1) throw new AggregateError(errors, "Deferred compute buffer cleanup failed", { cause: errors[0] });
        } catch (cleanup) {
          if (failure) throw new AggregateError([failure.error, cleanup], "Compute queue operation and cleanup failed", { cause: failure.error });
          throw cleanup;
        } finally {
          this.deferredDrainsInProgress--;
          this.notifyCleanupComplete();
        }
      }
    }
  }

  /** @internal */
  validateNativeBuffer(native: ComputeGPUBufferLike, borrowed?: RenderBuffer): void {
    this.assertLive();
    if (borrowed && (!this.renderOwner || borrowed.disposed || (this.renderOwner.getNativeStorageBuffer(borrowed) as unknown) !== native)) {
      throw new ComputeError("compute-disposed", "borrowed render buffer is no longer available");
    }
    this.renderOwner?.resourceInterop.assertUsable(native);
  }

  /** @internal */
  releaseNativeBuffer(native: ComputeGPUBufferLike): Promise<void> | undefined {
    const interop = this.renderInterop as (ComputeRenderOwner["resourceInterop"] & {
      owns?(resource: object): boolean;
      whenRetired?(resource: object): Promise<void>;
    }) | undefined;
    if (interop) {
      // A concrete interop receipt can establish prior loss cleanup even when
      // retire() would reject an already-removed lease as foreign.
      if (typeof interop.owns === "function" && !interop.owns(native) && typeof interop.whenRetired === "function") {
        const receipt = interop.whenRetired(native);
        if (!receipt || typeof receipt.then !== "function") throw new Error("Compute native retirement did not provide a receipt");
        return receipt;
      }
      const receipt = interop.retire(native);
      if (!receipt || typeof receipt.then !== "function") throw new Error("Compute native retirement did not provide a receipt");
      return receipt;
    }
    native.destroy();
    return undefined;
  }

  /** @internal Optional, failure-reporting receipt; not every structural owner has one. */
  nativeRetirementReceipt(native: ComputeGPUBufferLike): Promise<void> | undefined {
    const interop = this.renderInterop as (ComputeRenderOwner["resourceInterop"] & {
      whenRetired?(resource: object): Promise<void>;
    }) | undefined;
    if (typeof interop?.whenRetired !== "function") return undefined;
    const receipt = interop.whenRetired(native);
    if (!receipt || typeof receipt.then !== "function") throw new Error("Compute native retirement did not provide a receipt");
    return receipt;
  }

  /** @internal Renderer retirement fences submitted compute and draw work. */
  releaseOwnedRenderBuffer(buffer: RenderBuffer): void {
    buffer.dispose();
  }

  /** @internal A read owns its staging buffer until its asynchronous work finishes. */
  beginReadback(): ComputeReadback {
    this.assertLive();
    const readback: ComputeReadback = {};
    this.readbacks.add(readback);
    return readback;
  }

  /** @internal A throwing structural destroy is never repeated without a receipt. */
  finishReadback(readback: ComputeReadback): void {
    if (readback.attempted) {
      if (readback.failure) throw readback.failure.error;
      return;
    }
    readback.attempted = true;
    try {
      readback.native?.destroy();
      this.readbacks.delete(readback);
    } catch (error) {
      readback.failure = { error };
      throw error;
    } finally {
      this.notifyCleanupComplete();
    }
  }

  /** Encode and submit one compute pass. Resolves nothing: the GPU runs asynchronously; use `read()` or `onIdle()` to wait. */
  dispatch(input: ComputeDispatchInput): ComputeDispatchResult {
    this.assertLive();
    // Structural encoders and binding getters may synchronously reenter
    // disposal. Keep referenced buffers alive through encoding and submit.
    return this.withQueueUse(() => this.dispatchImpl(input));
  }

  private dispatchImpl(input: ComputeDispatchInput): ComputeDispatchResult {
    this.assertLive();
    if (typeof input !== "object" || input === null) throw invalid("dispatch needs an input object");
    const pipeline = input.pipeline;
    if (!(pipeline instanceof ComputePipeline) || pipeline.owner !== this) throw invalid("dispatch `pipeline` must come from this compute context");
    if (pipeline.disposed) throw new ComputeError("compute-disposed", "compute pipeline is disposed; cannot dispatch");
    if (!this.pipelines.has(pipeline)) throw invalid("dispatch `pipeline` was not created by this compute context");

    const supplied = new Map<string, unknown>();
    const bindingKey = (group: number, binding: number): string => `${group}:${binding}`;
    type InputEntry = { readonly group: number; readonly binding: number; readonly value: unknown };
    let entries: readonly InputEntry[];
    if (input.graphBindings !== undefined) {
      if (!pipeline.graphResources) throw invalid("graphBindings require a graph compute pipeline");
      if (!input.graphBindings || typeof input.graphBindings !== "object" || Array.isArray(input.graphBindings) || input.bindings !== undefined) throw invalid("graphBindings must be a resource-name map and cannot be combined with bindings");
      const graphValues = input.graphBindings;
      const known = new Set(pipeline.graphResources.map((resource) => resource.name));
      for (const name of Object.keys(graphValues)) if (!known.has(name)) throw invalid(`no compute graph resource named ${name}`);
      const lowered: InputEntry[] = [];
      for (const resource of pipeline.graphResources) {
        // Automatic WebGPU layouts contain statically accessed resources only.
        if (!pipeline.bindings.some((entry) => (entry.group ?? 0) === resource.group && entry.binding === resource.binding)) continue;
        if (!Object.hasOwn(graphValues, resource.name)) throw invalid(`dispatch is missing compute graph resource ${resource.name}`);
        const value = graphValues[resource.name];
        if (resource.samplerBinding !== undefined) {
          if (!value || typeof value !== "object" || !("texture" in value) || !("sampler" in value)) throw invalid(`compute graph resource ${resource.name} requires { texture, sampler }`);
          lowered.push({ group: resource.group, binding: resource.binding, value: value.texture });
          lowered.push({ group: resource.group, binding: resource.samplerBinding, value: value.sampler });
        } else {
          if (resource.kind === "depth2d" && value && typeof value === "object" && "sampler" in value) throw invalid(`compute graph depth resource ${resource.name} does not use a sampler`);
          lowered.push({ group: resource.group, binding: resource.binding, value });
        }
      }
      entries = lowered;
    } else {
      if (pipeline.graphResources) throw invalid("graph compute pipelines require graphBindings by resource name");
      if (!input.bindings || typeof input.bindings !== "object") throw invalid("dispatch bindings must be a map or array");
      entries = Array.isArray(input.bindings)
        ? input.bindings.map((entry) => {
          if (!entry || typeof entry !== "object" || ["buffer", "texture", "sampler"].filter((key) => key in entry).length !== 1) throw invalid("each dispatch binding needs exactly one buffer, texture or sampler");
          return { group: entry.group ?? 0, binding: entry.binding, value: "buffer" in entry ? entry.buffer : "texture" in entry ? entry.texture : entry.sampler };
        })
        : Object.entries(input.bindings as Record<string, unknown>).map(([key, value]) => ({ group: 0, binding: Number(key), value }));
    }
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.group) || entry.group < 0 || !Number.isSafeInteger(entry.binding) || entry.binding < 0) throw invalid(`dispatch group and binding must be non-negative integers, got ${String(entry.group)}:${String(entry.binding)}`);
      const key = bindingKey(entry.group, entry.binding);
      if (supplied.has(key)) throw invalid(`dispatch binding ${key} supplied twice`);
      supplied.set(key, entry.value);
    }
    const nativeBindings = new Map<string, unknown>();
    const accesses: { readonly resource: object; readonly mode: "read" | "write" | "readwrite" }[] = [];
    const nativeAccesses = new Map<object, "read" | "write" | "readwrite">();
    const addAccess = (resource: object, mode: "read" | "write" | "readwrite"): void => {
      const previous = nativeAccesses.get(resource);
      if (previous && (previous !== "read" || mode !== "read")) throw invalid("a compute pass cannot bind the same resource for conflicting access");
      nativeAccesses.set(resource, mode);
      accesses.push({ resource, mode });
    };
    const textureAccesses = new Map<object, Array<{ readonly firstMip: number; readonly lastMip: number; readonly mode: "read" | "write" | "readwrite" }>>();
    for (const declared of pipeline.bindings) {
      const group = declared.group ?? 0;
      const key = bindingKey(group, declared.binding);
      const value = supplied.get(key);
      if (value === undefined) throw invalid(`dispatch is missing a resource for binding ${key} (${declared.type})`);
      if (declared.type === "sampler") {
        if (!(value instanceof ComputeSampler) || value.owner !== this || value.disposed || !this.samplers.has(value)) throw invalid(`binding ${declared.binding} requires a live sampler from this compute context`);
        if (declared.samplerType === "comparison" ? !value.comparison : declared.samplerType !== undefined && value.comparison) throw invalid(`binding ${key} sampler comparison mode does not match ${declared.samplerType}`);
        if (declared.samplerType === "non-filtering" && value.filtering) throw invalid(`binding ${key} requires a non-filtering sampler`);
        nativeBindings.set(key, value.native);
      } else if (declared.type === "storage-texture" || declared.type === "sampled-texture") {
        if (!this.renderOwner) throw invalid("texture bindings require the app's mounted native render owner");
        const texture = textureFromBinding(value);
        if (!texture) throw invalid(`binding ${declared.binding} requires a texture or texture handle`);
        if (texture.disposed) throw new ComputeError("compute-disposed", `texture bound at ${declared.binding} is disposed`);
        const usage = declared.type === "storage-texture" ? "storage" : "sampled";
        if (!texture.usage.includes(usage)) throw invalid(`binding ${declared.binding} texture requires ${usage} usage`);
        if (declared.viewDimension && texture.dimension !== declared.viewDimension) throw invalid(`binding ${key} texture dimension must be ${declared.viewDimension}, got ${texture.dimension}`);
        if (declared.sampleType === "depth" && texture.format !== "depth24") throw invalid(`binding ${key} requires a depth texture`);
        if ((declared.sampleType === "float" || declared.sampleType === "unfilterable-float") && texture.format === "depth24") throw invalid(`binding ${key} requires a color texture, not depth`);
        if (declared.sampleType === "float" && (texture.format === "rgba32f" || texture.format === "r32f") && !this.device.features?.has("float32-filterable")) throw invalid(`binding ${key} requires float32-filterable for ${texture.format}`);
        if (declared.format && declared.format !== texture.format && declared.format !== nativeTextureFormat(texture.format)) throw invalid(`binding ${declared.binding} texture format does not match ${declared.format}`);
        const mip = declared.mipLevel ?? 0;
        if (!Number.isInteger(mip) || mip < 0 || mip >= texture.mipLevelCount) throw invalid(`binding ${declared.binding} texture mip is out of range`);
        const mode = declared.type === "sampled-texture" ? "read" : declared.access ?? "write";
        const singleMip = declared.type === "storage-texture" || declared.mipLevel !== undefined;
        const native = this.renderOwner.getNativeComputeTexture?.(texture, mode, singleMip ? { baseMipLevel: mip, mipLevelCount: 1 } : undefined) ?? this.renderOwner.getNativeTexture(texture);
        this.renderOwner.resourceInterop.assertUsable(native);
        if (native.sampleCount !== undefined && native.sampleCount !== 1) throw invalid(`binding ${key} requires a single-sampled texture`);
        if (native.usage !== undefined && (native.usage & (usage === "storage" ? 0x08 : 0x04)) === 0) throw invalid(`binding ${key} native texture requires ${usage} usage`);
        if (native.mipLevelCount !== undefined && mip >= native.mipLevelCount) throw invalid(`binding ${key} mip is unavailable in the native texture`);
        if (declared.type === "storage-texture" && declared.format && native.format !== undefined && native.format !== nativeTextureFormat(declared.format)) throw invalid(`binding ${key} native texture format does not match ${declared.format}`);
        if (native.format !== undefined && declared.sampleType === "depth" && !native.format.startsWith("depth")) throw invalid(`binding ${key} requires a native depth texture`);
        if (native.format !== undefined && (declared.sampleType === "float" || declared.sampleType === "unfilterable-float") && native.format.startsWith("depth")) throw invalid(`binding ${key} requires a native color texture`);
        if (native.format !== undefined && declared.sampleType === "float" && ["rgba32float", "r32float"].includes(native.format) && !this.device.features?.has("float32-filterable")) throw invalid(`binding ${key} requires float32-filterable for ${native.format}`);
        const firstMip = singleMip ? mip : 0;
        const lastMip = singleMip ? mip : Math.min(texture.mipLevelCount, native.mipLevelCount ?? texture.mipLevelCount) - 1;
        const previous = textureAccesses.get(native) ?? [];
        if (previous.some((access) => firstMip <= access.lastMip && lastMip >= access.firstMip && (access.mode !== "read" || mode !== "read"))) throw invalid(`texture at binding ${declared.binding} has conflicting pass access`);
        previous.push({ firstMip, lastMip, mode });
        textureAccesses.set(native, previous);
        const dimension = texture.dimension === "cube" ? "cube" : texture.dimension === "2d-array" ? "2d-array" : texture.dimension;
        nativeBindings.set(key, native.createView({ dimension, ...(texture.format === "depth24" ? { aspect: "depth-only" as const } : {}), ...(singleMip ? { baseMipLevel: mip, mipLevelCount: 1 } : {}) }));
        accesses.push({ resource: native, mode });
      } else {
        if (!(value instanceof ComputeBuffer) || value.owner !== this) throw invalid(`dispatch binding ${declared.binding} must be a computeBuffer from this compute context`);
        if (value.disposed) throw new ComputeError("compute-disposed", `compute buffer bound at ${declared.binding} is disposed; cannot dispatch`);
        value.validateForDispatch();
        const wantsUniform = declared.type === "uniform";
        if (wantsUniform !== (value.usage === "uniform")) {
          throw invalid(`binding ${declared.binding} is declared "${declared.type}" but the buffer was created with usage "${value.usage}"`);
        }
        if (declared.minBindingSize !== undefined && value.size < declared.minBindingSize) throw invalid(`binding ${key} requires a buffer of at least ${declared.minBindingSize} bytes`);
        nativeBindings.set(key, { buffer: value.native });
        addAccess(value.native, declared.type === "storage" ? "readwrite" : "read");
      }
      supplied.delete(key);
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
    const invocations = groups[0] * groups[1] * groups[2] * wx * wy * wz;
    if (!Number.isSafeInteger(invocations)) throw invalid("dispatch invocation count exceeds safe integer precision");

    const groupsByIndex = new Map<number, Array<{ binding: number; resource: unknown }>>();
    for (const entry of entries) {
      const groupEntries = groupsByIndex.get(entry.group) ?? [];
      groupEntries.push({ binding: entry.binding, resource: nativeBindings.get(bindingKey(entry.group, entry.binding))! });
      groupsByIndex.set(entry.group, groupEntries);
    }
    const bindGroups = [...groupsByIndex].sort(([a], [b]) => a - b).map(([index, groupEntries]) => ({ index, native: this.device.createBindGroup({
      label: pipeline.label ?? "aura3d-compute",
      layout: pipeline.native.getBindGroupLayout(index),
      entries: groupEntries
    }) }));
    const encoder = this.device.createCommandEncoder({ label: "aura3d-compute-dispatch" });
    const pass = encoder.beginComputePass({ label: pipeline.label ?? "aura3d-compute" });
    pass.setPipeline(pipeline.native);
    for (const group of bindGroups) pass.setBindGroup(group.index, group.native);
    pass.dispatchWorkgroups(groups[0], groups[1], groups[2]);
    pass.end();
    this.submit([encoder.finish()], accesses);
    return { workgroups: groups, invocations };
  }

  /** Resolves when every submitted compute command has finished. */
  async onIdle(): Promise<void> {
    this.assertLive();
    if (!this.device.queue.onSubmittedWorkDone) throw invalid("compute queue completion is unavailable");
    await this.device.queue.onSubmittedWorkDone();
    this.assertLive();
  }

  /** Close immediately and retain children until their cleanup is confirmed. */
  dispose(): void {
    if (this.disposing) return;
    const first = !this.isDisposed;
    this.isDisposed = true;
    this.disposing = true;
    const failures: unknown[] = [];
    try {
      if (first) {
        if (!this.warmupAbortFailure) {
          try { this.warmupLifetime.abort(new ComputeError("compute-disposed", "compute context is disposed")); }
          catch (error) { this.warmupAbortFailure = { error }; }
        }
        const remove = this.removeWarmupLossObserver;
        this.removeWarmupLossObserver = undefined;
        if (remove) {
          try { remove(); } catch (error) { this.warmupObserverFailure = { error, remove }; }
        }
      }
      // Unsubscription, too, is structural and may have thrown after acting.
      if (this.warmupAbortFailure) failures.push(this.warmupAbortFailure.error);
      if (this.warmupObserverFailure) failures.push(this.warmupObserverFailure.error);
      for (const allocation of this.uncertainAllocations) failures.push(allocation.error);
      for (const readback of this.readbacks) if (readback.failure) failures.push(readback.failure.error);
      for (const buffer of [...this.buffers]) { try { buffer.dispose(); } catch (error) { failures.push(error); } }
      for (const pipeline of [...this.pipelines]) { try { pipeline.dispose(); } catch (error) { failures.push(error); } }
      for (const sampler of [...this.samplers]) { try { sampler.dispose(); } catch (error) { failures.push(error); } }
    } finally {
      this.disposing = false;
      this.notifyCleanupComplete();
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, `Compute resource cleanup failed (${failures.length} errors)`, { cause: failures[0] });
  }

  /** @internal Retained by a surface until every child has a release receipt. */
  get cleanupPending(): boolean {
    if (!this.isDisposed && !this.nativeDeviceLost) {
      return this.uncertainAllocations.size > 0 || this.warmupAbortFailure !== undefined || this.warmupObserverFailure !== undefined ||
        [...this.readbacks].some((readback) => readback.failure !== undefined) ||
        [...this.buffers].some((buffer) => buffer[resourceDisposalPending]);
    }
    return this.disposing || this.buffers.size > 0 || this.pipelines.size > 0 ||
      this.samplers.size > 0 || this.readbacks.size > 0 || this.bufferCreationsInProgress > 0 ||
      this.lossSubscriptionsInProgress > 0 || this.queueUsesInProgress > 0 || this.deferredDrainsInProgress > 0 || this.deferredBuffers.size > 0 ||
      this.uncertainAllocations.size > 0 || this.warmupAbortFailure !== undefined || this.warmupObserverFailure !== undefined ||
      (!this.isDisposed && this.removeWarmupLossObserver !== undefined);
  }

  /** @internal */
  get [resourceDisposalPending](): boolean { return this.cleanupPending; }
  /** @internal */
  get [resourceDisposalInProgress](): boolean { return this.disposing; }

  /** @internal Register before disposing so synchronous and fenced cleanup are both observed. */
  onCleanupComplete(listener: () => void): void {
    if (this.isDisposed && !this.cleanupPending) listener();
    else this.cleanupListeners.add(listener);
  }

  private notifyCleanupComplete(): void {
    if (!this.isDisposed || this.cleanupPending) return;
    for (const listener of this.cleanupListeners) {
      this.cleanupListeners.delete(listener);
      try { listener(); } catch { /* Notify the other owners as well. */ }
    }
  }

  /** @internal Drop retired wrappers without retaining them for the context lifetime. */
  forgetBuffer(buffer: ComputeBuffer): void { this.buffers.delete(buffer); this.notifyCleanupComplete(); }
  /** @internal Reject wrappers constructed outside this context, even if they claim its owner. */
  assertOwnedBuffer(buffer: ComputeBuffer): void {
    if (!this.buffers.has(buffer)) throw invalid("compute buffer was not created or borrowed by this compute context");
  }
  /** @internal Reject foreign, fabricated, retired, and device-generation-stale pipelines. */
  assertOwnedPipeline(pipeline: ComputePipeline): void {
    this.assertLive();
    if (pipeline.owner !== this) throw invalid("compute pipeline must come from this compute context");
    if (pipeline.disposed) throw new ComputeError("compute-disposed", "compute pipeline is disposed");
    if (!this.pipelines.has(pipeline)) throw invalid("compute pipeline was not created by this compute context");
  }
  /** @internal */
  forgetPipeline(pipeline: ComputePipeline): void { this.pipelines.delete(pipeline); this.notifyCleanupComplete(); }
  /** @internal */
  forgetSampler(sampler: ComputeSampler): void { this.samplers.delete(sampler); this.notifyCleanupComplete(); }

  private validateBindings(bindings: readonly ComputeBindingSpec[]): readonly ComputeBindingSpec[] {
    if (!Array.isArray(bindings)) throw invalid("`bindings` must be an array of { binding, type }");
    const seen = new Set<string>();
    let storage = 0;
    let uniform = 0;
    let storageTextures = 0;
    let sampledTextures = 0;
    let samplers = 0;
    for (const entry of bindings) {
      if (typeof entry !== "object" || entry === null || !Number.isSafeInteger(entry.binding) || entry.binding < 0) {
        throw invalid(`each binding needs a non-negative integer \`binding\` index, got ${JSON.stringify(entry)}`);
      }
      const group = entry.group ?? 0;
      if (!Number.isSafeInteger(group) || group < 0 || group >= this.limits.get("maxBindGroups")) throw invalid(`binding ${entry.binding} group ${String(group)} exceeds maxBindGroups ${this.limits.get("maxBindGroups")}`);
      if (entry.binding >= this.limits.get("maxBindingsPerBindGroup")) throw invalid(`binding ${entry.binding} exceeds maxBindingsPerBindGroup ${this.limits.get("maxBindingsPerBindGroup")}`);
      if (!BINDING_TYPES.includes(entry.type)) throw invalid(`binding ${entry.binding} type must be one of ${BINDING_TYPES.join(", ")}, got ${String(entry.type)}`);
      const key = `${group}:${entry.binding}`;
      if (seen.has(key)) throw invalid(`binding ${key} declared twice`);
      seen.add(key);
      const texture = entry.type === "storage-texture" || entry.type === "sampled-texture";
      if (!texture && (entry.mipLevel !== undefined || entry.access !== undefined || entry.format !== undefined || entry.viewDimension !== undefined || entry.sampleType !== undefined)) throw invalid(`binding ${entry.binding} texture options require a texture binding`);
      if (entry.mipLevel !== undefined && (!Number.isInteger(entry.mipLevel) || entry.mipLevel < 0)) throw invalid(`binding ${entry.binding} mipLevel must be a non-negative integer`);
      if (entry.access !== undefined && (entry.type !== "storage-texture" || !["read", "write", "readwrite"].includes(entry.access))) throw invalid(`binding ${entry.binding} has invalid storage texture access`);
      if (entry.format !== undefined && (typeof entry.format !== "string" || !entry.format)) throw invalid(`binding ${entry.binding} has invalid texture format`);
      if (entry.viewDimension !== undefined && !["2d", "2d-array", "3d", "cube"].includes(entry.viewDimension)) throw invalid(`binding ${entry.binding} has invalid texture viewDimension`);
      if (entry.sampleType !== undefined && (entry.type !== "sampled-texture" || !["float", "unfilterable-float", "depth"].includes(entry.sampleType))) throw invalid(`binding ${entry.binding} has invalid sampled texture sampleType`);
      if (entry.samplerType !== undefined && (entry.type !== "sampler" || !["filtering", "non-filtering", "comparison"].includes(entry.samplerType))) throw invalid(`binding ${entry.binding} has invalid samplerType`);
      if (entry.minBindingSize !== undefined && (texture || entry.type === "sampler" || !Number.isSafeInteger(entry.minBindingSize) || entry.minBindingSize < 1)) throw invalid(`binding ${entry.binding} has invalid minBindingSize`);
      if (entry.type === "uniform") uniform += 1;
      else if (entry.type === "storage-texture") storageTextures += 1;
      else if (entry.type === "sampled-texture") sampledTextures += 1;
      else if (entry.type === "sampler") samplers += 1;
      else storage += 1;
    }
    if (storage > this.limits.get("maxStorageBuffersPerShaderStage")) {
      throw invalid(`${storage} storage bindings exceed maxStorageBuffersPerShaderStage ${this.limits.get("maxStorageBuffersPerShaderStage")}`);
    }
    if (uniform > this.limits.get("maxUniformBuffersPerShaderStage")) {
      throw invalid(`${uniform} uniform bindings exceed maxUniformBuffersPerShaderStage ${this.limits.get("maxUniformBuffersPerShaderStage")}`);
    }
    if (storageTextures > this.limits.get("maxStorageTexturesPerShaderStage")) throw invalid(`${storageTextures} storage textures exceed maxStorageTexturesPerShaderStage ${this.limits.get("maxStorageTexturesPerShaderStage")}`);
    if (sampledTextures > this.limits.get("maxSampledTexturesPerShaderStage")) throw invalid(`${sampledTextures} sampled textures exceed maxSampledTexturesPerShaderStage ${this.limits.get("maxSampledTexturesPerShaderStage")}`);
    if (samplers > this.limits.get("maxSamplersPerShaderStage")) throw invalid(`${samplers} samplers exceed maxSamplersPerShaderStage ${this.limits.get("maxSamplersPerShaderStage")}`);
    return Object.freeze(bindings.map((entry) => Object.freeze({ ...entry })));
  }

  private observeWarmupLoss(): void {
    if (this.warmupObserverFailure) throw this.warmupObserverFailure.error;
    if (this.warmupLossObserverInstalled) return;
    // An unresolved native loss promise must not retain a retired context.
    const context = new WeakRef(this);
    const onLost = (): void => {
      const live = context.deref();
      if (!live || live.isDisposed || live.nativeDeviceLost) return;
      live.nativeDeviceLost = true;
      try { live.warmupLifetime.abort(new ComputeError("compute-disposed", "compute native device is lost")); }
      catch (error) { live.warmupAbortFailure ??= { error }; }
    };
    let observed = false;
    const lost = this.device.lost;
    if (lost && typeof lost.then === "function") {
      void lost.then(onLost, onLost);
      observed = true;
    }
    const owner = this.renderOwner;
    if (owner) {
      this.lossSubscriptionsInProgress++;
      try {
        let subscribe: ComputeRenderOwner["onDeviceLost"];
        try { subscribe = owner.onDeviceLost; } catch (error) {
          this.warmupObserverFailure = { error };
          throw error;
        }
        // A structural getter may dispose the context before returning.
        this.assertLive();
        if (typeof subscribe !== "function") {
          if (!observed) throw invalid("compute pipeline warmup requires GPUDevice.lost or a render owner device-loss notification");
          this.warmupLossObserverInstalled = true;
          return;
        }
        let remove: (() => void) | undefined;
        try {
          remove = subscribe.call(owner, onLost);
        } catch (error) {
          this.warmupObserverFailure = { error };
          throw error;
        }
        if (typeof remove !== "function") {
          const error = invalid("compute render owner must return a device-loss unsubscriber");
          this.warmupObserverFailure = { error };
          throw error;
        }
        this.removeWarmupLossObserver = remove;
        observed = true;
        // A structural owner may synchronously notify or dispose during subscribe.
        if (this.isDisposed) {
          this.removeWarmupLossObserver = undefined;
          try { remove(); } catch (error) {
            this.warmupObserverFailure = { error, remove };
            throw error;
          }
        }
      } finally {
        this.lossSubscriptionsInProgress--;
        this.notifyCleanupComplete();
      }
    }
    if (!observed) throw invalid("compute pipeline warmup requires GPUDevice.lost or a render owner device-loss notification");
    this.warmupLossObserverInstalled = true;
    this.assertLive();
  }

  private renderOwnerIsStale(): boolean {
    const owner = this.renderOwner;
    const interop = this.renderInterop;
    return owner !== undefined && (owner.disposed || owner.contextLost || owner.generation !== this.generation ||
      owner.resourceInterop !== interop || interop === undefined || interop.disposed ||
      interop.generation !== this.generation || interop.queue !== this.device.queue);
  }

  private assertLive(): void {
    if (this.isDisposed) throw new ComputeError("compute-disposed", "compute context is disposed");
    if (this.nativeDeviceLost) throw new ComputeError("compute-disposed", "compute native device is lost");
    if (this.renderOwnerIsStale()) {
      throw new ComputeError("compute-disposed", "compute render device generation is no longer live");
    }
  }
}

function graphUniformBlock(resource: ShaderGraphBinding): UniformBlockLayout {
  if (resource.dataType === undefined) throw invalid(`compute graph resource ${resource.name} has no aggregate uniform schema`);
  return {
    name: "ComputeGraphUniform",
    group: resource.group,
    binding: resource.binding,
    members: [{ name: "value", type: resource.dataType }]
  };
}

function primitiveGraphDataType(type: ShaderGraphValueType | undefined): ShaderDataType {
  switch (type) {
    case "f32": case "i32": case "u32": return type;
    case "bool": return "u32";
    case "vec2": return { kind: "vector", element: "f32", length: 2 };
    case "vec3": return { kind: "vector", element: "f32", length: 3 };
    case "vec4": return { kind: "vector", element: "f32", length: 4 };
    case "uvec3": return { kind: "vector", element: "u32", length: 3 };
    default: throw invalid(`compiled graph has an invalid primitive buffer type ${String(type)}`);
  }
}

/** Derive the exact declared uniform block or storage runtime-array footprint. */
function graphBufferLayout(resource: ShaderGraphBinding, elementCount: number): ShaderDataLayout {
  if (!Number.isSafeInteger(elementCount) || elementCount < 1 || (resource.kind === "uniform" && elementCount !== 1)) {
    throw invalid(`compute graph resource ${resource.name} needs ${resource.kind === "uniform" ? "exactly one value" : "a positive element count"}`);
  }
  try {
    if (resource.kind === "uniform") {
      return resource.dataType === undefined
        ? deriveShaderDataLayout(primitiveGraphDataType(resource.type), "wgsl-uniform")
        : deriveUniformDataLayout(graphUniformBlock(resource), "wgsl-uniform");
    }
    if (resource.kind === "storage-buffer" && resource.dataType !== undefined) {
      return deriveShaderDataLayout({ kind: "array", element: resource.dataType, length: elementCount }, "wgsl-storage");
    }
    throw invalid(`compiled graph resource ${resource.name} has no storage buffer schema`);
  } catch (error) {
    if (error instanceof ComputeError) throw error;
    throw new ComputeError("compute-invalid-spec", `compute graph resource ${resource.name} has an invalid buffer layout: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

function sameGraphDataType(expected: ShaderDataType | undefined, actual: unknown): boolean {
  if (expected === undefined || typeof expected === "string") return actual === expected;
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const value = actual as Record<string, unknown>;
  if (value.kind !== expected.kind) return false;
  switch (expected.kind) {
    case "vector": return value.element === expected.element && value.length === expected.length;
    case "matrix": return value.columns === expected.columns && value.rows === expected.rows;
    case "array": return value.length === expected.length && sameGraphDataType(expected.element, value.element);
    case "struct": {
      if (!Array.isArray(value.fields) || value.fields.length !== expected.fields.length) return false;
      const fields = value.fields;
      return expected.fields.every((field, index) => {
        const item = fields[index];
        return !!item && typeof item === "object" && (item as { name?: unknown }).name === field.name &&
          sameGraphDataType(field.type, (item as { type?: unknown }).type);
      });
    }
  }
}

/** Do not retain caller-owned nested schemas in a live pipeline. */
function snapshotGraphDataType(type: ShaderDataType): ShaderDataType {
  if (typeof type === "string") return type;
  switch (type.kind) {
    case "vector": case "matrix": return Object.freeze({ ...type });
    case "array": return Object.freeze({ ...type, element: snapshotGraphDataType(type.element) });
    case "struct": return Object.freeze({
      ...type,
      fields: Object.freeze(type.fields.map((field) => Object.freeze({ name: field.name, type: snapshotGraphDataType(field.type) })))
    });
  }
}

/**
 * A compile result is mutable and may cross an API boundary. Recompile its
 * canonical graph key with the current compiler before trusting source or
 * schemas; a nominal struct name alone cannot prove its storage layout.
 */
function canonicalComputeGraph(key: unknown, source: string): ShaderGraphCompileResult {
  if (typeof key !== "string") throw invalid("compiled compute graph is missing its canonical graph key");
  let canonical: ShaderGraphCompileResult;
  try {
    canonical = compileShaderGraph(JSON.parse(key) as ShaderGraphDocument, "wgsl");
  } catch (error) {
    throw new ComputeError("compute-invalid-spec", `compiled compute graph has an invalid graph key: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (canonical.stage !== "compute" || canonical.key !== key || canonical.compute !== source) {
    throw invalid("compiled compute graph source disagrees with its canonical graph and WGSL declaration");
  }
  return canonical;
}

/** Turn the compiler's exact bindings into compute bindings without guessing slots. */
function bindingsForGraph(graph: ShaderGraphCompileResult): { readonly wgsl: string; readonly bindings: readonly ComputeBindingSpec[]; readonly resources: readonly ShaderGraphBinding[] } {
  if (!graph || typeof graph !== "object") throw invalid("graph pipeline requires a WGSL compute result from compileShaderGraph");
  const { stage, target, compute: source, bindings: supplied } = graph;
  if (stage !== "compute" || target !== "wgsl" || typeof source !== "string" || !Array.isArray(supplied)) {
    throw invalid("graph pipeline requires a WGSL compute result from compileShaderGraph");
  }
  const candidates = supplied.slice();
  const canonical = canonicalComputeGraph(graph.key, source);
  if (candidates.length !== canonical.bindings.length) throw invalid("compiled compute graph bindings disagree with its WGSL declarations");
  const mainStart = source.indexOf("\nfn main(");
  if (mainStart < 0) throw invalid("compiled compute graph is missing its main entry point");
  const main = source.slice(mainStart);
  const names = new Set<string>();
  const slots = new Set<string>();
  const resources: ShaderGraphBinding[] = [];
  const bindings: ComputeBindingSpec[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== "object" || typeof candidate.name !== "string" || !IDENTIFIER.test(candidate.name) || candidate.shaderName !== `auraGraph_resource_${candidate.name}` || names.has(candidate.name) ||
      !Number.isSafeInteger(candidate.group) || candidate.group < 0 || !Number.isSafeInteger(candidate.binding) || candidate.binding < 0) throw invalid("compiled compute graph has invalid resource binding metadata");
    names.add(candidate.name);
    const sampledColor = candidate.kind === "texture2d" || candidate.kind === "texture3d";
    if (sampledColor ? candidate.samplerBinding !== candidate.binding + 1 : candidate.samplerBinding !== undefined) throw invalid(`compiled graph resource ${candidate.name} has invalid sampler binding metadata`);
    for (const binding of [candidate.binding, ...(candidate.samplerBinding === undefined ? [] : [candidate.samplerBinding])]) {
      const key = `${candidate.group}:${binding}`;
      if (slots.has(key)) throw invalid(`compiled compute graph declares binding ${key} twice`);
      slots.add(key);
    }
    if (!["uniform", "storage-buffer", "storage-texture", "texture2d", "texture3d", "depth2d"].includes(candidate.kind)) throw invalid(`compiled graph resource ${candidate.name} has unsupported kind`);
    if (candidate.access !== undefined && !["read", "write", "read_write"].includes(candidate.access)) throw invalid(`compiled graph resource ${candidate.name} has invalid access`);
    if (candidate.kind === "storage-texture" && !["rgba8unorm", "rgba16float", "rgba32float", "r32float", "r32uint", "r32sint"].includes(candidate.format ?? "")) throw invalid(`compiled graph resource ${candidate.name} has an invalid storage format`);
    const expected = canonical.bindings[index]!;
    const primitiveUniform = expected.kind === "uniform" && ["f32", "i32", "u32", "bool", "vec2", "vec3", "vec4", "uvec3"].includes(expected.type ?? "");
    if (expected.dataType !== undefined && (primitiveUniform || (expected.kind !== "uniform" && expected.kind !== "storage-buffer"))) {
      throw invalid(`compiled graph resource ${candidate.name} has an invalid host schema`);
    }
    if (candidate.name !== expected.name || candidate.kind !== expected.kind || candidate.type !== expected.type ||
      candidate.access !== expected.access || candidate.format !== expected.format || candidate.group !== expected.group ||
      candidate.binding !== expected.binding || candidate.shaderName !== expected.shaderName || candidate.samplerBinding !== expected.samplerBinding ||
      !sameGraphDataType(expected.dataType, candidate.dataType)) {
      throw invalid(`compiled graph resource ${candidate.name} disagrees with its WGSL declaration or host schema`);
    }
    const resource = Object.freeze({ ...expected, ...(expected.dataType === undefined ? {} : { dataType: snapshotGraphDataType(expected.dataType) }) });
    resources.push(resource);
    if (!new RegExp(`\\b${resource.shaderName}\\b`).test(main)) continue;
    const base = { group: resource.group, binding: resource.binding };
    switch (resource.kind) {
      case "uniform":
        bindings.push({ ...base, type: "uniform", minBindingSize: graphBufferLayout(resource, 1).size });
        break;
      case "storage-buffer":
        bindings.push({ ...base, type: resource.access === "read" ? "read-only-storage" : "storage", minBindingSize: graphBufferLayout(resource, 1).size });
        break;
      case "storage-texture":
        bindings.push({ ...base, type: "storage-texture", viewDimension: "2d", format: resource.format,
          access: resource.access === "read_write" ? "readwrite" : resource.access ?? "write" });
        break;
      case "depth2d":
        bindings.push({ ...base, type: "sampled-texture", viewDimension: "2d", sampleType: "depth" });
        break;
      case "texture2d": case "texture3d":
        bindings.push({ ...base, type: "sampled-texture", viewDimension: resource.kind === "texture3d" ? "3d" : "2d", sampleType: "float" });
        bindings.push({ group: resource.group, binding: resource.samplerBinding!, type: "sampler", samplerType: "filtering" });
        break;
    }
  }
  return { wgsl: source, bindings, resources: Object.freeze(resources) };
}

/** Reject group declarations that cannot be addressed by the supplied raw-WGSL binding schema. */
function validateWgslGroups(source: string, bindings: readonly ComputeBindingSpec[]): void {
  // WGSL block comments nest. Ignore comments before reading group attributes.
  let clean = "";
  let depth = 0;
  let lineComment = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!, next = source[index + 1];
    if (lineComment) { if (char === "\n") { lineComment = false; clean += "\n"; } else clean += " "; continue; }
    if (depth > 0) {
      if (char === "/" && next === "*") { depth++; index++; clean += "  "; }
      else if (char === "*" && next === "/") { depth--; index++; clean += "  "; }
      else clean += char === "\n" ? "\n" : " ";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index++; clean += "  "; }
    else if (char === "/" && next === "*") { depth = 1; index++; clean += "  "; }
    else clean += char;
  }
  for (const match of clean.matchAll(/@group\s*\(\s*([^)]*)\s*\)/g)) {
    const expression = match[1]!.trim();
    if (!/^\d+u?$/.test(expression)) throw invalid(`compute WGSL group must use a literal non-negative index, got ${expression}`);
    const group = Number(expression.replace(/u$/, ""));
    if (!Number.isSafeInteger(group) || (group !== 0 && !bindings.some((binding) => (binding.group ?? 0) === group))) throw invalid(`compute WGSL group ${expression} has no declared bindings`);
  }
}

function textureFromBinding(value: unknown): Texture | null {
  const seen = new Set<object>();
  while (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    const object = value as { readonly texture?: unknown; readonly dimension?: unknown; readonly usage?: unknown; readonly mipLevelCount?: unknown };
    if (typeof object.dimension === "string" && Array.isArray(object.usage) && typeof object.mipLevelCount === "number") return value as Texture;
    value = object.texture;
  }
  return null;
}

function nativeTextureFormat(format: string): string {
  return ({ rgba8: "rgba8unorm", rgba16f: "rgba16float", rgba32f: "rgba32float", r32f: "r32float", depth24: "depth24plus-stencil8" } as Readonly<Record<string, string>>)[format] ?? format;
}

export function createComputeContext(device: ComputeGPUDeviceLike, renderOwner?: ComputeRenderOwner): ComputeContext {
  return new ComputeContext(device, renderOwner);
}

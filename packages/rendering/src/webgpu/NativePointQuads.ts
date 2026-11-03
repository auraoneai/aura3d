import { Geometry, type Bounds3 } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { RenderDeviceError, type DrawCommand, type RenderBuffer, type RenderDevice } from "../RenderDevice";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat, type VertexAttributeSemantic } from "../VertexFormat";
import type { RenderItem } from "../contracts/renderItem";
import type { WebGPUNativePointViewport } from "../WebGPUDevice";

export const NATIVE_POINT_CORNER = "custom:a_pointCorner" as const;
export const NATIVE_POINT_CORNER_LOCATION = 3;

const CORNERS = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1] as const;
const VERTICES_PER_POINT = 6;
const GEOMETRY_GET_VERTEX_BUFFER = Geometry.prototype.getVertexBuffer;
const VERTEX_UPLOAD = VertexBuffer.prototype.upload;
const VERTEX_READ = VertexBuffer.prototype.readBytes;
const INDEX_UPLOAD = IndexBuffer.prototype.upload;
const INDEX_READ = IndexBuffer.prototype.assertReadable;
const VERTEX_UPLOAD_ATTEMPT = Object.getOwnPropertyDescriptor(VertexBuffer.prototype, "hasAttemptedUpload")!.get!;
const INDEX_UPLOAD_ATTEMPT = Object.getOwnPropertyDescriptor(IndexBuffer.prototype, "hasAttemptedUpload")!.get!;
const VERTEX_REVISION = Object.getOwnPropertyDescriptor(VertexBuffer.prototype, "revision")!.get!;
const INDEX_REVISION = Object.getOwnPropertyDescriptor(IndexBuffer.prototype, "revision")!.get!;

export interface NativePointSourceRange {
  readonly start: number;
  readonly count: number;
}

/** Limits and retirement must come from the same native device generation. */
export interface NativePointQuadDevice extends RenderDevice {
  getNativePointLimits(): { readonly generation: number; readonly maxBufferSize: number; readonly maxVertexBuffers: number };
  /** On failure, cleanup resolves only after every possibly queued allocation is safe. */
  createNativePointBuffer(bytes: ArrayBufferView):
    | { readonly ok: true; readonly buffer: RenderBuffer; readonly stamp: object }
    | { readonly ok: false; readonly error: unknown; readonly cleanup: Promise<void> };
  assertNativePointBufferStamp(buffer: RenderBuffer, stamp: object): void;
  /** Resolves only after this owned buffer is destroyed or its native device is invalidated. */
  retireNativePointBuffer(buffer: RenderBuffer): Promise<void>;
  /** Fires only after all handles of this native generation are actually invalidated. */
  onNativePointInvalidated(listener: () => void): () => void;
}

export interface NativePointQuadLimits {
  /** Snapshot bytes plus reserved device-owned CPU shadows, across this arena. */
  readonly maxCpuBytes: number;
  /** Aligned native buffer allocations, including all outstanding leases. */
  readonly maxGpuBytes: number;
  readonly maxStreamBytes: number;
}

interface PointSize {
  readonly geometryBytes: number;
  readonly cpuBytes: number;
  readonly gpuBytes: number;
  readonly cornerSlot: number;
}

export type NativePointQuadLeaseState = "prepared" | "uploaded" | "retiring" | "retirement-failed" | "uncertain-upload" | "released";

export interface NativePointQuadLease {
  readonly source: Geometry;
  readonly vertexFormat: VertexFormat;
  readonly vertexCount: number;
  readonly sourceRange: NativePointSourceRange;
  readonly bounds: Bounds3;
  readonly status: NativePointQuadLeaseState;
  readonly whenReleased: Promise<void>;
  readAttribute(vertex: number, semantic: VertexAttributeSemantic): readonly number[];
  upload(): readonly (RenderBuffer | undefined)[];
  release(): Promise<void>;
}

/** Internal forward-only submission context. The viewport must be issued by the same device. */
export interface NativePointQuadSubmission {
  readonly lease: NativePointQuadLease;
  readonly item: RenderItem;
  readonly range: NativePointSourceRange;
  readonly viewport: WebGPUNativePointViewport;
}

interface PointBinding {
  readonly slot: number;
  readonly buffer: RenderBuffer;
  readonly stamp: object;
}

interface PointLeaseProof {
  readonly device: NativePointQuadDevice;
  readonly generation: number;
  readonly source: Geometry;
  readonly range: NativePointSourceRange;
  readonly format: VertexFormat;
  readonly count: number;
  readonly sourceBuffers: readonly VertexBuffer[];
  readonly sourceRevisions: readonly number[];
  readonly sourceIndex: IndexBuffer | null;
  readonly indexRevision: number | null;
  indices: Uint32Array | null;
  readonly sourceFormat: VertexFormat;
  readonly sourceFormatSignature: string;
  snapshot: Geometry | undefined;
  readonly begin: () => void;
  readonly end: () => void;
  bindings: readonly PointBinding[];
  ready: boolean;
}

const POINT_LEASE_PROOFS = new WeakMap<object, PointLeaseProof>();

/**
 * Check an arena-issued lease at the actual native enqueue boundary. This is a
 * geometry/resource check only: it does not certify the shader, clipping,
 * viewport, material or depth passes and does not enable native point draws.
 */
export function assertNativePointQuadSubmission(lease: unknown, device: NativePointQuadDevice, command: DrawCommand, source: Geometry, range: NativePointSourceRange): void {
  const proof = typeof lease === "object" && lease !== null ? POINT_LEASE_PROOFS.get(lease) : undefined;
  if (!proof || !proof.ready || proof.device !== device || proof.generation !== device.generation
    || proof.source !== source || proof.range.start !== range.start || proof.range.count !== range.count || !proof.snapshot) {
    throw new RenderDeviceError("Point quad lease does not match the source, range or device", "WEBGPU_POINT_QUAD_PROOF_INVALID");
  }
  inspectSourceHeader(source, range);
  const sourceBuffers = inspectCpuAuthority(source);
  if (source.vertexBuffer.format !== proof.sourceFormat || formatSignature(proof.sourceFormat) !== proof.sourceFormatSignature
    || source.indexBuffer !== proof.sourceIndex || sourceBuffers.length !== proof.sourceBuffers.length
    || sourceBuffers.some((buffer, i) => buffer !== proof.sourceBuffers[i] || VERTEX_REVISION.call(buffer) !== proof.sourceRevisions[i])
    || (source.indexBuffer && INDEX_REVISION.call(source.indexBuffer) !== proof.indexRevision)) {
    throw new RenderDeviceError("Point source geometry or buffer generation changed", "WEBGPU_POINT_QUAD_SOURCE_STALE");
  }
  // Direct writes to the public CPU views do not bump revisions. Compare each
  // selected index and vertex record against the private expanded snapshot.
  for (let point = 0; point < range.count; point += 1) {
    const index = source.indexBuffer ? source.indexBuffer.data[range.start + point]! : range.start + point;
    if (proof.indices && proof.indices[point] !== index) {
      throw new RenderDeviceError("Point source indices changed", "WEBGPU_POINT_QUAD_SOURCE_STALE");
    }
    for (let i = 0; i < sourceBuffers.length; i += 1) {
      const stream = proof.sourceFormat.streams[i]!;
      const sourceBytes = new Uint8Array(sourceBuffers[i]!.data);
      const snapshotBytes = new Uint8Array(proof.snapshot.getVertexBuffer(stream.slot).data);
      const sourceOffset = index * stream.stride, snapshotOffset = point * VERTICES_PER_POINT * stream.stride;
      if (index >= sourceBuffers[i]!.vertexCount) throw new RenderDeviceError("Point source index is outside a vertex stream", "WEBGPU_POINT_QUAD_SOURCE_STALE");
      for (let byte = 0; byte < stream.stride; byte += 1) {
        if (sourceBytes[sourceOffset + byte] !== snapshotBytes[snapshotOffset + byte]) {
          throw new RenderDeviceError("Point source vertex bytes changed", "WEBGPU_POINT_QUAD_SOURCE_STALE");
        }
      }
    }
  }
  if (command.topology !== "triangles" || command.vertexFormat !== proof.format || command.vertexCount !== proof.count
    || (command.firstVertex !== undefined && command.firstVertex !== 0) || command.indexBuffer !== undefined
    || command.indexType !== undefined || command.indexCount !== undefined || command.firstIndex !== undefined
    || (command.instanceCount !== undefined && command.instanceCount !== 1)
    || (command.instanceAttributes?.length ?? 0) !== 0 || (command.nativeStorageBindings?.length ?? 0) !== 0
    || (command.renderState !== undefined && command.renderState.cullMode !== "none")) {
    throw new RenderDeviceError("Point quad command does not match its snapshot", "WEBGPU_POINT_QUAD_COMMAND_INVALID");
  }
  if (command.vertexBuffer !== proof.bindings.find(binding => binding.slot === 0)?.buffer) {
    throw new RenderDeviceError("Point quad command has a different primary buffer", "WEBGPU_POINT_QUAD_COMMAND_INVALID", { slot: 0 });
  }
  for (const binding of proof.bindings) {
    const actual = command.vertexBuffers?.[binding.slot] ?? (binding.slot === 0 ? command.vertexBuffer : undefined);
    if (actual !== binding.buffer) throw new RenderDeviceError("Point quad command has a different vertex buffer", "WEBGPU_POINT_QUAD_COMMAND_INVALID", { slot: binding.slot });
    device.assertNativePointBufferStamp(binding.buffer, binding.stamp);
  }
  for (let slot = 0; slot < (command.vertexBuffers?.length ?? 0); slot += 1) {
    if (command.vertexBuffers?.[slot] && !proof.bindings.some(binding => binding.slot === slot)) {
      throw new RenderDeviceError("Point quad command has an extra vertex buffer", "WEBGPU_POINT_QUAD_COMMAND_INVALID", { slot });
    }
  }
}

/** Pin an arena-issued lease across encoding and the complete queue attempt. */
export function withNativePointQuadLease<T>(lease: unknown, action: () => T): T {
  const proof = typeof lease === "object" && lease !== null ? POINT_LEASE_PROOFS.get(lease) : undefined;
  if (!proof || !proof.ready) throw new RenderDeviceError("Point quad lease is unavailable", "WEBGPU_POINT_QUAD_PROOF_INVALID");
  proof.begin();
  try { return action(); } finally { proof.end(); }
}

/**
 * A per-device arena for independently owned point snapshots. It is staged:
 * native point draws remain guarded until the renderer has a checked,
 * device-owned submission receipt and matching depth/shadow programs.
 *
 * Until source ownership can be certified across devices, every source
 * vertex and index buffer must never have attempted upload. The source index
 * buffer is read directly and is never uploaded by this arena. Each acquire
 * copies the current CPU bytes, including direct writes without revision marks.
 *
 * CPU and GPU limits reserve worst-case snapshot + device CPU shadow and native
 * buffers at acquire time. Source bytes, JS object overhead, device/driver
 * staging, external references and delayed garbage collection are excluded.
 * Budget remains charged through actual device retirement or invalidation.
 */
export class NativePointQuadArena {
  private readonly leases = new Set<NativePointQuadLeaseImpl>();
  private readonly formats = new WeakMap<VertexFormat, { readonly signature: string; readonly format: VertexFormat }>();
  private readonly generation: number;
  private readonly nativeLimits: ReturnType<NativePointQuadDevice["getNativePointLimits"]>;
  private readonly limits: NativePointQuadLimits;
  private readonly stopInvalidation: () => void;
  private closed = false;
  private invalidated = false;
  private cpuBytes = 0;
  private gpuBytes = 0;

  constructor(private readonly device: NativePointQuadDevice, limits: NativePointQuadLimits) {
    this.limits = { ...limits };
    validateLimits(this.limits);
    const nativeLimits = device.getNativePointLimits();
    if (![nativeLimits.generation, nativeLimits.maxBufferSize, nativeLimits.maxVertexBuffers].every(value => Number.isSafeInteger(value) && value > 0)) {
      throw new RenderDeviceError("Point quad device limits are invalid", "WEBGPU_POINT_QUAD_DEVICE_LIMIT_INVALID");
    }
    this.generation = nativeLimits.generation;
    this.nativeLimits = { ...nativeLimits };
    this.assertDevice();
    this.stopInvalidation = device.onNativePointInvalidated(() => {
      this.invalidated = true;
      for (const lease of [...this.leases]) lease.invalidate();
      if (this.closed) this.stopInvalidation();
    });
  }

  get size(): number { return this.leases.size; }
  get reservedCpuBytes(): number { return this.cpuBytes; }
  get reservedGpuBytes(): number { return this.gpuBytes; }

  acquire(source: Geometry, range: NativePointSourceRange): NativePointQuadLease {
    this.assertOpen();
    inspectSourceHeader(source, range);
    const size = pointSize(source, range, this.limits, this.nativeLimits);
    if (size.cpuBytes > this.limits.maxCpuBytes - this.cpuBytes || size.gpuBytes > this.limits.maxGpuBytes - this.gpuBytes) {
      throw new RenderDeviceError("Point quad arena budget exceeded", "WEBGPU_POINT_QUAD_BUDGET_EXCEEDED", {
        cpuBytes: size.cpuBytes, reservedCpuBytes: this.cpuBytes, maxCpuBytes: this.limits.maxCpuBytes,
        gpuBytes: size.gpuBytes, reservedGpuBytes: this.gpuBytes, maxGpuBytes: this.limits.maxGpuBytes
      });
    }
    const buffers = inspectCpuAuthority(source);
    validateSelectedIndices(source, range, buffers);
    this.cpuBytes += size.cpuBytes;
    this.gpuBytes += size.gpuBytes;
    let geometry: Geometry | undefined;
    try {
      const format = this.pointFormat(source.vertexBuffer.format, size.cornerSlot);
      geometry = createSnapshot(source, range, size.cornerSlot, buffers, format);
      this.assertOpen();
      let lease!: NativePointQuadLeaseImpl;
      const indices = source.indexBuffer ? Uint32Array.from(source.indexBuffer.data.subarray(range.start, range.start + range.count)) : null;
      lease = new NativePointQuadLeaseImpl(this, this.device, this.generation, source, { ...range }, geometry, buffers, indices, () => this.releaseLease(lease, size));
      this.leases.add(lease);
      return lease;
    } catch (error) {
      try { geometry?.dispose(); } catch { /* Preserve the admission failure. */ }
      this.cpuBytes -= size.cpuBytes;
      this.gpuBytes -= size.gpuBytes;
      throw error;
    }
  }

  /** Stop admission and request retirement; unsettled fences leave this promise pending. */
  dispose(): Promise<void> {
    this.closed = true;
    const pending = [...this.leases].map(lease => lease.release());
    if (pending.length === 0) this.stopInvalidation();
    return Promise.all(pending).then(() => { this.stopInvalidation(); });
  }

  private releaseLease(lease: NativePointQuadLeaseImpl, size: PointSize): void {
    if (!this.leases.delete(lease)) return;
    this.cpuBytes -= size.cpuBytes;
    this.gpuBytes -= size.gpuBytes;
    if (this.closed && this.leases.size === 0) this.stopInvalidation();
  }

  private pointFormat(original: VertexFormat, cornerSlot: number): VertexFormat {
    const signature = formatSignature(original);
    const existing = this.formats.get(original);
    if (existing?.signature === signature) return existing.format;
    const format = new VertexFormat([
        ...original.attributes.map(attribute => ({ ...attribute })),
        { semantic: NATIVE_POINT_CORNER, components: 2, offset: 0, bufferSlot: cornerSlot, shaderLocation: NATIVE_POINT_CORNER_LOCATION, shaderName: "a_pointCorner" }
    ], original.stride, [...original.streams.map(stream => ({ ...stream })), { slot: cornerSlot, stride: 8, stepMode: "vertex" }]);
    for (const attribute of format.attributes) Object.freeze(attribute);
    for (const stream of format.streams) Object.freeze(stream);
    Object.freeze(format.attributes);
    Object.freeze(format.streams);
    Object.freeze(format);
    this.formats.set(original, { signature, format });
    return format;
  }

  assertOpen(): void {
    if (this.closed) throw new RenderDeviceError("Point quad arena is disposed", "DISPOSED_RESOURCE");
    if (this.invalidated) throw new RenderDeviceError("Point quad device is invalidated", "CONTEXT_LOST");
    this.assertDevice();
  }

  private assertDevice(): void {
    if (this.device.disposed) throw new RenderDeviceError("Render device is disposed", "DISPOSED_RESOURCE");
    if (this.device.contextLost) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    if (this.device.generation !== this.generation) throw new RenderDeviceError("Point quad device generation changed", "WEBGPU_POINT_QUAD_GENERATION_CHANGED");
  }
}

/**
 * The arena never reuses or mutates a snapshot after acquisition. The renderer
 * must keep its buffers private and must not alter them, encode deferred work
 * after release, or release before every intended submission has been attempted.
 * A CPU upload alone is not a GPU submission or completion receipt.
 */
class NativePointQuadLeaseImpl implements NativePointQuadLease {
  private state: NativePointQuadLeaseState = "prepared";
  private uploading = false;
  private releaseAfterUpload = false;
  private invalidateAfterUpload = false;
  private submissionPins = 0;
  private releaseAfterSubmission = false;
  private invalidateAfterSubmission = false;
  private retirementAttempt?: Promise<void>;
  private readonly released: Promise<void>;
  private resolveReleased!: () => void;
  private uploaded?: readonly (RenderBuffer | undefined)[];
  #geometry: Geometry | undefined;
  #allocatedBuffers: RenderBuffer[] = [];
  #failureCleanup?: Promise<void>;
  readonly #proof: PointLeaseProof;

  constructor(
    private readonly arena: NativePointQuadArena,
    private readonly device: NativePointQuadDevice,
    private readonly generation: number,
    readonly source: Geometry,
    private readonly range: NativePointSourceRange,
    geometry: Geometry,
    sourceBuffers: readonly VertexBuffer[],
    indices: Uint32Array | null,
    private readonly onReleased: () => void
  ) {
    this.#geometry = geometry;
    this.released = new Promise(resolve => { this.resolveReleased = resolve; });
    this.#proof = { device, generation, source, range: Object.freeze({ ...range }), format: geometry.vertexBuffer.format,
      count: geometry.vertexBuffer.vertexCount, sourceBuffers: [...sourceBuffers], sourceRevisions: sourceBuffers.map(buffer => VERTEX_REVISION.call(buffer)),
      sourceIndex: source.indexBuffer, indexRevision: source.indexBuffer ? INDEX_REVISION.call(source.indexBuffer) : null,
      indices, sourceFormat: source.vertexBuffer.format, sourceFormatSignature: formatSignature(source.vertexBuffer.format), snapshot: geometry,
      begin: () => { this.arena.assertOpen(); if (this.state !== "uploaded") throw new RenderDeviceError("Point quad lease is unavailable", "WEBGPU_POINT_QUAD_LEASE_STATE"); this.submissionPins += 1; },
      end: () => { this.submissionPins -= 1; if (this.submissionPins === 0) {
        if (this.invalidateAfterSubmission) this.finish();
        else if (this.releaseAfterSubmission) void this.release().catch(() => undefined);
      } }, bindings: [], ready: false };
    POINT_LEASE_PROOFS.set(this, this.#proof);
  }

  get vertexFormat(): VertexFormat { return this.requireGeometry().vertexBuffer.format; }
  get vertexCount(): number { return this.requireGeometry().vertexBuffer.vertexCount; }
  get sourceRange(): NativePointSourceRange { return { ...this.range }; }
  get bounds(): Bounds3 { return copyBounds(this.requireGeometry().bounds); }
  get status(): NativePointQuadLeaseState { return this.state; }
  /** Settles only after resources are safe to release, including after loss. */
  get whenReleased(): Promise<void> { return this.released; }

  readAttribute(vertex: number, semantic: VertexAttributeSemantic): readonly number[] {
    return this.requireGeometry().getAttributeBuffer(semantic).getAttribute(vertex, semantic);
  }

  /** Upload once; the returned buffers are internal borrowed renderer resources. */
  upload(): readonly (RenderBuffer | undefined)[] {
    if (this.state === "uploaded") return this.uploaded!;
    if (this.state !== "prepared") throw new RenderDeviceError("Point quad lease cannot be uploaded", "WEBGPU_POINT_QUAD_LEASE_STATE");
    this.arena.assertOpen();
    if (this.device.generation !== this.generation) throw new RenderDeviceError("Point quad device generation changed", "WEBGPU_POINT_QUAD_GENERATION_CHANGED");
    this.state = "uncertain-upload";
    this.uploading = true;
    let uncertain = false;
    try {
      const geometry = this.requireGeometry();
      const uploaded: (RenderBuffer | undefined)[] = [];
      const bindings: PointBinding[] = [];
      for (const stream of geometry.vertexBuffer.format.streams) {
        const vertexBuffer = geometry.getVertexBuffer(stream.slot);
        uncertain = true;
        const result = this.device.createNativePointBuffer(new Uint8Array(vertexBuffer.data));
        if (result && result.ok === true && result.buffer && typeof result.buffer === "object"
          && result.stamp && typeof result.stamp === "object") {
          if (this.#allocatedBuffers.includes(result.buffer)) throw new RenderDeviceError("Point quad allocation reused a live buffer", "WEBGPU_POINT_QUAD_ALLOCATION_INVALID");
          this.#allocatedBuffers.push(result.buffer);
          uploaded[stream.slot] = result.buffer;
          bindings.push(Object.freeze({ slot: stream.slot, buffer: result.buffer, stamp: result.stamp }));
          uncertain = false;
          this.device.assertNativePointBufferStamp(result.buffer, result.stamp);
        } else if (result && result.ok === false && result.cleanup && typeof result.cleanup.then === "function") {
          this.#failureCleanup = result.cleanup;
          uncertain = false;
          throw result.error;
        } else {
          throw new RenderDeviceError("Point quad allocation returned an invalid receipt", "WEBGPU_POINT_QUAD_ALLOCATION_INVALID");
        }
        this.arena.assertOpen();
        if (this.releaseAfterUpload) {
          throw new RenderDeviceError("Point quad lease was released during upload", "WEBGPU_POINT_QUAD_LEASE_STATE");
        }
      }
      this.uploading = false;
      if (this.invalidateAfterUpload) {
        this.finish();
        throw new RenderDeviceError("Point quad device was invalidated during upload", "CONTEXT_LOST");
      }
      if (this.isReleased()) throw new RenderDeviceError("Point quad device was invalidated during upload", "CONTEXT_LOST");
      this.uploaded = Object.freeze(uploaded);
      this.#proof.bindings = Object.freeze(bindings);
      this.#proof.ready = true;
      this.state = "uploaded";
      try { this.arena.assertOpen(); }
      catch (error) { void this.release().catch(() => undefined); throw error; }
      return this.uploaded;
    } catch (error) {
      this.uploading = false;
      if (this.invalidateAfterUpload) this.finish();
      else if (!this.isReleased()) {
        if (uncertain) void this.retireKnownBuffers().catch(() => undefined);
        else if (this.state === "uncertain-upload" || this.state === "uploaded") {
          this.state = "uploaded";
          void this.release().catch(() => undefined);
        }
      }
      throw error;
    }
  }

  /** A prepared lease releases immediately; uploaded buffers need device retirement. */
  release(): Promise<void> {
    if (this.state === "released") return this.released;
    if (this.submissionPins > 0) {
      this.releaseAfterSubmission = true;
      this.#proof.ready = false;
      return this.released;
    }
    // A device callback may request release before its allocation receipt has
    // returned. Do not publish or retire an incomplete set of buffers: the
    // upload path will unwind, account for that receipt, and retire it.
    if (this.uploading) {
      this.releaseAfterUpload = true;
      this.#proof.ready = false;
      return this.released;
    }
    if (this.state === "prepared") {
      this.finish();
      return this.released;
    }
    if (this.state === "uncertain-upload") {
      // Known handles are retired, but an unreturned allocation may remain.
      void this.retireKnownBuffers().catch(() => undefined);
      return this.released;
    }
    if (this.state === "retiring") return this.retirementAttempt!;
    this.#proof.ready = false;
    this.state = "retiring";
    const attempt = this.retireKnownBuffers().then(() => { this.finish(); }, error => {
      if (this.state === "released") return;
      this.state = "retirement-failed";
      throw error;
    });
    this.retirementAttempt = attempt;
    return attempt;
  }

  /** Called only by a device-owned, genuine invalidation signal. */
  invalidate(): void {
    if (this.state === "released") return;
    if (this.uploading) this.invalidateAfterUpload = true;
    else if (this.submissionPins > 0) { this.invalidateAfterSubmission = true; this.#proof.ready = false; }
    else this.finish();
  }

  private async retireKnownBuffers(): Promise<void> {
    const buffers = new Set(this.#allocatedBuffers);
    const completions: Promise<void>[] = [];
    for (const buffer of buffers) {
      try { completions.push(this.device.retireNativePointBuffer(buffer)); }
      catch (error) { completions.push(Promise.reject(error)); }
    }
    if (this.#failureCleanup) completions.push(this.#failureCleanup);
    await Promise.all(completions);
  }

  private isReleased(): boolean { return this.state === "released"; }

  private requireGeometry(): Geometry {
    if (!this.#geometry) throw new RenderDeviceError("Point quad lease is released", "DISPOSED_RESOURCE");
    return this.#geometry;
  }

  private finish(): void {
    if (this.state === "released") return;
    this.state = "released";
    this.#proof.ready = false;
    this.#proof.bindings = [];
    this.#proof.indices = null;
    this.#proof.snapshot = undefined;
    const geometry = this.#geometry;
    const buffers = this.#allocatedBuffers;
    this.#geometry = undefined;
    this.uploaded = undefined;
    this.#allocatedBuffers = [];
    this.#failureCleanup = undefined;
    const errors: unknown[] = [];
    try {
      for (const buffer of buffers) {
        try { buffer.dispose(); } catch (error) { errors.push(error); }
      }
      try { geometry?.dispose(); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, "Point quad lease disposal failed");
    }
    finally {
      this.onReleased();
      this.resolveReleased();
    }
  }
}

function validateLimits(limits: NativePointQuadLimits): void {
  if (!limits || [limits.maxCpuBytes, limits.maxGpuBytes, limits.maxStreamBytes].some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new RenderDeviceError("Point quad limits must be positive safe integers", "WEBGPU_POINT_QUAD_LIMIT_INVALID");
  }
}

function inspectSourceHeader(source: Geometry, range: NativePointSourceRange): void {
  if (source.topology !== "points") throw new RenderDeviceError("Point quad expansion requires point topology", "WEBGPU_POINT_QUAD_TOPOLOGY_INVALID");
  const format = source.vertexBuffer.format;
  if (format.attributes.some(attribute => attribute.shaderLocation === NATIVE_POINT_CORNER_LOCATION
    || attribute.semantic === NATIVE_POINT_CORNER || attribute.shaderName === "a_pointCorner")) {
    throw new RenderDeviceError("Point corner attribute collides with the source vertex format", "WEBGPU_POINT_QUAD_ATTRIBUTE_CONFLICT");
  }
  if (format.streams.some(stream => stream.stepMode !== "vertex")) {
    throw new RenderDeviceError("Point quad expansion does not support instance-rate geometry streams", "WEBGPU_POINT_QUAD_INSTANCE_UNSUPPORTED");
  }
  const available = source.indexBuffer?.count ?? source.vertexBuffer.vertexCount;
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.count) || range.start < 0 || range.count <= 0
    || range.start > available || range.count > available - range.start || range.count > Math.floor(0xffffffff / VERTICES_PER_POINT)) {
    throw new RenderDeviceError("Point quad draw range is invalid", "WEBGPU_POINT_QUAD_RANGE_INVALID", { start: range.start, count: range.count, available });
  }
}

function pointSize(source: Geometry, range: NativePointSourceRange, limits: NativePointQuadLimits, native: ReturnType<NativePointQuadDevice["getNativePointLimits"]>): PointSize {
  const streams = source.vertexBuffer.format.streams;
  const vertexCount = range.count * VERTICES_PER_POINT;
  let cornerSlot = 1;
  while (streams.some(stream => stream.slot === cornerSlot)) cornerSlot += 1;
  let maxSlot = cornerSlot;
  for (const stream of streams) maxSlot = Math.max(maxSlot, stream.slot);
  if (maxSlot >= native.maxVertexBuffers) {
    throw new RenderDeviceError("Point quad streams exceed the device slot limit", "WEBGPU_POINT_QUAD_DEVICE_LIMIT_EXCEEDED");
  }
  let geometryBytes = 0;
  let gpuBytes = 0;
  for (const stride of [...streams.map(stream => stream.stride), 8]) {
    if (stride % 4 !== 0) throw new RenderDeviceError("Point quad vertex stride must be four-byte aligned", "WEBGPU_POINT_QUAD_STRIDE_INVALID");
    if (stride > Math.floor(Number.MAX_SAFE_INTEGER / vertexCount)) throw new RenderDeviceError("Point quad stream byte length overflows", "WEBGPU_POINT_QUAD_SIZE_OVERFLOW");
    const bytes = vertexCount * stride;
    if (bytes > limits.maxStreamBytes) throw new RenderDeviceError("Point quad stream exceeds the CPU stream limit", "WEBGPU_POINT_QUAD_STREAM_LIMIT_EXCEEDED");
    if (bytes > native.maxBufferSize) throw new RenderDeviceError("Point quad stream exceeds the device buffer limit", "WEBGPU_POINT_QUAD_DEVICE_LIMIT_EXCEEDED");
    if (bytes > Number.MAX_SAFE_INTEGER - geometryBytes || bytes > Number.MAX_SAFE_INTEGER - gpuBytes) {
      throw new RenderDeviceError("Point quad total byte length overflows", "WEBGPU_POINT_QUAD_SIZE_OVERFLOW");
    }
    geometryBytes += bytes;
    gpuBytes += bytes;
  }
  const indexBytes = source.indexBuffer ? range.count * Uint32Array.BYTES_PER_ELEMENT : 0;
  if (geometryBytes > Math.floor((Number.MAX_SAFE_INTEGER - indexBytes) / 2)) throw new RenderDeviceError("Point quad CPU reservation overflows", "WEBGPU_POINT_QUAD_SIZE_OVERFLOW");
  return { geometryBytes, cpuBytes: geometryBytes * 2 + indexBytes, gpuBytes, cornerSlot };
}

function inspectCpuAuthority(source: Geometry): readonly VertexBuffer[] {
  if (Object.getPrototypeOf(source) !== Geometry.prototype || source.getVertexBuffer !== GEOMETRY_GET_VERTEX_BUFFER) {
    throw new RenderDeviceError("Point source geometry overrides lack CPU authority", "WEBGPU_POINT_QUAD_SOURCE_AUTHORITY_UNAVAILABLE");
  }
  const buffers = source.vertexBuffer.format.streams.map(stream => source.getVertexBuffer(stream.slot));
  for (let i = 0; i < buffers.length; i += 1) {
    const buffer = buffers[i]!;
    if (Object.getPrototypeOf(buffer) !== VertexBuffer.prototype || buffer.upload !== VERTEX_UPLOAD || buffer.readBytes !== VERTEX_READ) {
      throw new RenderDeviceError("Point source vertex buffer overrides lack CPU authority", "WEBGPU_POINT_QUAD_SOURCE_AUTHORITY_UNAVAILABLE");
    }
    buffer.readBytes(0, 0);
    const stride = source.vertexBuffer.format.streams[i]!.stride;
    if (buffer.byteLength !== stride * buffer.vertexCount) {
      throw new RenderDeviceError("Point source stream layout changed after allocation", "WEBGPU_POINT_QUAD_SOURCE_LAYOUT_CHANGED");
    }
    if (VERTEX_UPLOAD_ATTEMPT.call(buffer)) throw new RenderDeviceError("Point source vertex data has attempted upload and lacks CPU authority", "WEBGPU_POINT_QUAD_SOURCE_AUTHORITY_UNAVAILABLE");
  }
  const index = source.indexBuffer;
  if (index) {
    if (Object.getPrototypeOf(index) !== IndexBuffer.prototype || index.upload !== INDEX_UPLOAD || index.assertReadable !== INDEX_READ) {
      throw new RenderDeviceError("Point source index buffer overrides lack CPU authority", "WEBGPU_POINT_QUAD_SOURCE_AUTHORITY_UNAVAILABLE");
    }
    index.assertReadable();
    if (INDEX_UPLOAD_ATTEMPT.call(index)) throw new RenderDeviceError("Point source indices have attempted upload and lack CPU authority", "WEBGPU_POINT_QUAD_SOURCE_AUTHORITY_UNAVAILABLE");
  }
  return buffers;
}

function formatSignature(format: VertexFormat): string {
  return JSON.stringify([format.stride,
    format.attributes.map(attribute => [attribute.semantic, attribute.components, attribute.offset, attribute.type, attribute.normalized,
      attribute.integer, attribute.bufferSlot, attribute.shaderLocation, attribute.shaderName]),
    format.streams.map(stream => [stream.slot, stream.stride, stream.stepMode, stream.divisor])]);
}

function validateSelectedIndices(source: Geometry, range: NativePointSourceRange, buffers: readonly VertexBuffer[]): void {
  for (let i = 0; i < range.count; i += 1) {
    const index = source.indexBuffer ? source.indexBuffer.data[range.start + i]! : range.start + i;
    if (buffers.some(buffer => index >= buffer.vertexCount)) throw new RenderDeviceError("Point index is outside a source vertex stream", "WEBGPU_POINT_QUAD_INDEX_INVALID", { index });
  }
}

function createSnapshot(source: Geometry, range: NativePointSourceRange, cornerSlot: number, sources: readonly VertexBuffer[], format: VertexFormat): Geometry {
  const original = source.vertexBuffer.format;
  const count = range.count * VERTICES_PER_POINT;
  const buffers: VertexBuffer[] = [];
  try {
    for (let i = 0; i < original.streams.length; i += 1) {
      const stream = original.streams[i]!;
      const buffer = new VertexBuffer(format, count, stream.slot);
      buffers.push(buffer);
      const output = new Uint8Array(buffer.data);
      const input = new Uint8Array(sources[i]!.data);
      for (let point = 0; point < range.count; point += 1) {
        const index = source.indexBuffer ? source.indexBuffer.data[range.start + point]! : range.start + point;
        const bytes = input.subarray(index * stream.stride, (index + 1) * stream.stride);
        for (let corner = 0; corner < VERTICES_PER_POINT; corner += 1) output.set(bytes, (point * VERTICES_PER_POINT + corner) * stream.stride);
      }
      buffer.markDirtyRange(0, buffer.byteLength);
    }
    const cornerBuffer = new VertexBuffer(format, count, cornerSlot);
    buffers.push(cornerBuffer);
    const corners = new Float32Array(cornerBuffer.data);
    for (let point = 0; point < range.count; point += 1) corners.set(CORNERS, point * CORNERS.length);
    cornerBuffer.markDirtyRange(0, cornerBuffer.byteLength);
    const primary = buffers.find(buffer => buffer.bufferSlot === 0)!;
    const geometry = new Geometry(primary, null, "triangles", copyBounds(source.bounds), buffers.filter(buffer => buffer !== primary));
    geometry.drawRange = { start: 0, count };
    return geometry;
  } catch (error) {
    for (const buffer of buffers) buffer.dispose();
    throw error;
  }
}

function copyBounds(bounds: Bounds3): Bounds3 { return { min: [...bounds.min], max: [...bounds.max] }; }

import { type IndexType, type RenderBuffer, type RenderDevice, RenderDeviceError } from "./RenderDevice";
import type { WebGL2Buffer } from "./WebGL2Device";
import { webgl2DeviceHost } from "./webgl2/Counters";

function isDeviceBufferLive(device: RenderDevice, buffer: RenderBuffer): boolean {
  // WebGL removes a buffer from its live set as soon as retirement starts,
  // but `disposed` only becomes true after native deletion succeeds.
  const host = webgl2DeviceHost(device);
  return !buffer.disposed && (!host || host.buffers.has(buffer as WebGL2Buffer));
}

interface DeviceIndexBuffer {
  readonly buffer: RenderBuffer;
  readonly generation: number | undefined;
  dirtyStart: number;
  dirtyEnd: number;
}

export class IndexBuffer {
  public readonly type: IndexType;
  public readonly data: Uint16Array | Uint32Array;
  private readonly deviceBuffers = new Map<RenderDevice, DeviceIndexBuffer>();
  private readonly retiringBuffers = new Set<RenderBuffer>();
  private readonly retiringInFlight = new Set<RenderBuffer>();
  private readonly uploadsInFlight = new Set<RenderDevice>();
  /** The most recently uploaded resource, retained for the existing accessor. */
  private gpuBuffer: RenderBuffer | null = null;
  private gpuDevice: RenderDevice | null = null;
  private closed = false;
  private disposing = false;
  private disposalComplete = false;
  private dirtyStart = Number.POSITIVE_INFINITY;
  private dirtyEnd = 0;
  private mutationRevision = 0;
  #uploadAttempted = false;

  constructor(indices: readonly number[] | Uint16Array | Uint32Array, vertexCount?: number, type?: IndexType) {
    if (indices.length === 0) {
      throw new Error("IndexBuffer requires at least one index");
    }
    let maxIndex = 0;
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("IndexBuffer indices must be non-negative integers");
      }
      if (index > 0xffffffff) {
        throw new RangeError("IndexBuffer indices must fit in uint32");
      }
      if (index > maxIndex) maxIndex = index;
    }
    if (vertexCount !== undefined && maxIndex >= vertexCount) {
      throw new RangeError(`Index ${maxIndex} is outside vertex count ${vertexCount}`);
    }
    if (type !== undefined && type !== "uint16" && type !== "uint32") throw new TypeError("Invalid index buffer type");
    if (type === "uint16" && maxIndex > 65535) throw new RangeError("IndexBuffer indices must fit in uint16");
    this.type = type ?? (maxIndex > 65535 ? "uint32" : "uint16");
    this.data = this.type === "uint32" ? Uint32Array.from(indices) : Uint16Array.from(indices);
  }

  get count(): number {
    return this.data.length;
  }

  get byteLength(): number {
    return this.data.byteLength;
  }

  /** Changes when indices are written or the buffer is disposed. */
  get revision(): number {
    return this.mutationRevision;
  }

  get uploadedBuffer(): RenderBuffer | null {
    return this.gpuBuffer && this.gpuDevice && isDeviceBufferLive(this.gpuDevice, this.gpuBuffer) ? this.gpuBuffer : null;
  }

  /** True only after all device allocations have been retired. */
  get disposed(): boolean {
    return this.disposalComplete;
  }

  /** Monotonic even if an upload fails before producing a RenderBuffer. */
  get hasAttemptedUpload(): boolean {
    return this.#uploadAttempted;
  }

  /** Validate CPU access without creating or modifying any device resource. */
  assertReadable(): void {
    this.assertAlive();
  }

  /** Copy CPU indices, preserving their storage width without sharing uploads. */
  clone(): IndexBuffer {
    this.assertAlive();
    return new IndexBuffer(this.data, undefined, this.type);
  }

  /**
   * threejs-parity L2 (SG-05): partial index write — the same-count
   * `handle.setGeometry` path. Writes mark a dirty element range; `upload()`
   * flushes only that range through `device.updateBuffer` instead of
   * re-creating the GPU index buffer.
   */
  setIndices(start: number, values: readonly number[] | Uint16Array | Uint32Array): void {
    this.assertAlive();
    if (!Number.isInteger(start) || start < 0 || start + values.length > this.data.length) {
      throw new RangeError(`Index range [${start}, ${start + values.length}) is outside ${this.data.length} indices`);
    }
    const bytesPer = this.type === "uint32" ? 4 : 2;
    const maxValue = this.type === "uint32" ? 0xffffffff : 0xffff;
    for (const index of values) {
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("IndexBuffer indices must be non-negative integers");
      }
      if (index > maxValue) {
        throw new RangeError(`IndexBuffer indices must fit in ${this.type}`);
      }
    }
    if (values.length === 0) return;
    this.data.set(values as readonly number[], start);
    this.mutationRevision += 1;
    this.markDirty(start * bytesPer, values.length * bytesPer);
  }

  getDirtyRange(): { readonly start: number; readonly end: number } | null {
    let start = this.dirtyStart;
    let end = this.dirtyEnd;
    for (const [device, resource] of this.deviceBuffers) {
      if (!device.disposed && isDeviceBufferLive(device, resource.buffer) && resource.generation === device.generation) {
        start = Math.min(start, resource.dirtyStart);
        end = Math.max(end, resource.dirtyEnd);
      }
    }
    return start < end ? { start, end } : null;
  }

  upload(device: RenderDevice): RenderBuffer {
    this.#uploadAttempted = true;
    this.assertAlive();
    if (device.disposed) throw new RenderDeviceError("Render device is disposed", "DISPOSED_RESOURCE");
    if (device.contextLost) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    if (this.uploadsInFlight.has(device)) throw new RenderDeviceError("Reentrant IndexBuffer upload", "INVALID_OPERATION");
    this.uploadsInFlight.add(device);
    try {
      let resource = this.deviceBuffers.get(device);
      if (!resource || !isDeviceBufferLive(device, resource.buffer) || resource.generation !== device.generation) {
        // Create first so a failed allocation does not discard the previous
        // device resource or any pending writes to other devices.
        const generation = device.generation;
        const buffer = device.createBuffer("index", this.data.byteLength, this.data);
        const host = webgl2DeviceHost(device);
        if (host && !host.buffers.has(buffer as WebGL2Buffer)) {
          // An unverified allocation could belong to another device. Do not
          // adopt or dispose it; a retiring WebGL allocation remains device-owned.
          this.assertUploadDevice(device, generation);
          throw new RenderDeviceError("Device returned an index buffer that is not live and owned by it", "INVALID_RESOURCE", { bufferId: buffer.id });
        }
        try {
          this.assertUploadDevice(device, generation);
        } catch (error) {
          // A callback may close the owner or change generations during creation.
          try { this.retireBuffer(buffer); } catch (cleanup) {
            throw new AggregateError([error, cleanup], "IndexBuffer allocation cleanup failed", { cause: error });
          }
          throw error;
        }
        const previous = resource?.buffer;
        resource = { buffer, generation, dirtyStart: Number.POSITIVE_INFINITY, dirtyEnd: 0 };
        this.deviceBuffers.set(device, resource);
        this.gpuBuffer = buffer;
        this.gpuDevice = device;
        this.clearDirty();
        // Keep a failed old generation separately from the current allocation.
        // It must never be used for upload, but must remain reachable for teardown.
        if (previous && previous !== buffer) this.retireBuffer(previous);
        this.assertUploadedResource(device, resource);
        return buffer;
      }
      if (resource.dirtyStart < resource.dirtyEnd) {
        const bytesPer = this.type === "uint32" ? 4 : 2;
        const start = Math.floor(resource.dirtyStart / bytesPer) * bytesPer;
        const end = Math.min(this.data.byteLength, Math.ceil(resource.dirtyEnd / bytesPer) * bytesPer);
        device.updateBuffer(resource.buffer, start, new Uint8Array(this.data.buffer as ArrayBuffer, this.data.byteOffset + start, end - start));
        this.assertUploadedResource(device, resource);
        resource.dirtyStart = Number.POSITIVE_INFINITY;
        resource.dirtyEnd = 0;
      }
      this.assertUploadedResource(device, resource);
      this.clearDirty();
      this.gpuBuffer = resource.buffer;
      this.gpuDevice = device;
      return resource.buffer;
    } finally {
      this.uploadsInFlight.delete(device);
      this.finishDisposal();
    }
  }

  dispose(): void {
    if (this.disposalComplete || this.disposing) return;
    if (!this.closed) {
      this.closed = true;
      this.mutationRevision += 1;
      for (const { buffer } of this.deviceBuffers.values()) this.retiringBuffers.add(buffer);
      this.deviceBuffers.clear();
      this.gpuBuffer = null;
      this.gpuDevice = null;
    }
    this.disposing = true;
    const errors: unknown[] = [];
    try {
      for (const buffer of [...this.retiringBuffers]) {
        try {
          this.retireBuffer(buffer);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      this.disposing = false;
      this.finishDisposal();
    }
    if (errors.length) throw new AggregateError(errors, "IndexBuffer disposal failed");
  }

  private retireBuffer(buffer: RenderBuffer): void {
    this.retiringBuffers.add(buffer);
    if (this.retiringInFlight.has(buffer)) return;
    if (buffer.disposed) {
      this.retiringBuffers.delete(buffer);
      this.finishDisposal();
      return;
    }
    this.retiringInFlight.add(buffer);
    try {
      buffer.dispose();
      this.retiringBuffers.delete(buffer);
    } catch (error) {
      // A callback may throw after the underlying resource has already retired.
      if (buffer.disposed) this.retiringBuffers.delete(buffer);
      throw error;
    } finally {
      this.retiringInFlight.delete(buffer);
      this.finishDisposal();
    }
  }

  private finishDisposal(): void {
    if (this.closed && !this.disposing && this.deviceBuffers.size === 0 &&
        this.retiringBuffers.size === 0 && this.retiringInFlight.size === 0 && this.uploadsInFlight.size === 0) {
      this.disposalComplete = true;
    }
  }

  private assertUploadDevice(device: RenderDevice, generation: number | undefined): void {
    this.assertAlive();
    if (device.disposed) throw new RenderDeviceError("Render device is disposed", "DISPOSED_RESOURCE");
    if (device.contextLost) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    if (device.generation !== generation) throw new RenderDeviceError("Render device generation changed during index upload", "CONTEXT_LOST");
  }

  private assertUploadedResource(device: RenderDevice, resource: DeviceIndexBuffer): void {
    this.assertUploadDevice(device, resource.generation);
    if (this.deviceBuffers.get(device) !== resource || resource.buffer.disposed) {
      throw new RenderDeviceError("Index buffer resource changed during upload", "DISPOSED_RESOURCE");
    }
    if (!isDeviceBufferLive(device, resource.buffer)) {
      throw new RenderDeviceError("Index buffer is no longer a live resource on this device", "INVALID_RESOURCE", { bufferId: resource.buffer.id });
    }
  }

  private markDirty(start: number, byteLength: number): void {
    this.dirtyStart = Math.min(this.dirtyStart, start);
    this.dirtyEnd = Math.max(this.dirtyEnd, start + byteLength);
    for (const resource of this.deviceBuffers.values()) {
      resource.dirtyStart = Math.min(resource.dirtyStart, start);
      resource.dirtyEnd = Math.max(resource.dirtyEnd, start + byteLength);
    }
  }

  private clearDirty(): void {
    this.dirtyStart = Number.POSITIVE_INFINITY;
    this.dirtyEnd = 0;
  }

  private assertAlive(): void {
    if (this.closed) {
      throw new RenderDeviceError("IndexBuffer is disposed", "DISPOSED_RESOURCE");
    }
  }
}

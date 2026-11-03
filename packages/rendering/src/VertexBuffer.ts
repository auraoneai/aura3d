import { type RenderBuffer, type RenderDevice, RenderDeviceError } from "./RenderDevice";
import { type VertexAttribute, type VertexAttributeSemantic, type VertexAttributeType, VertexFormat, vertexAttributeComponentBytes } from "./VertexFormat";
import type { WebGL2Buffer } from "./WebGL2Device";
import { webgl2DeviceHost } from "./webgl2/Counters";

function isDeviceBufferLive(device: RenderDevice, buffer: RenderBuffer): boolean {
  // WebGL removes a buffer from its live set as soon as retirement starts,
  // but `disposed` only becomes true after native deletion succeeds.
  const host = webgl2DeviceHost(device);
  return !buffer.disposed && (!host || host.buffers.has(buffer as WebGL2Buffer));
}

interface DeviceVertexBuffer {
  readonly buffer: RenderBuffer;
  readonly generation: number | undefined;
  dirtyStart: number;
  dirtyEnd: number;
}
export class VertexBuffer {
  public readonly data: ArrayBuffer;
  /** Legacy float view over complete 4-byte words. Use attribute access for typed layouts. */
  public readonly floats: Float32Array;
  private readonly view: DataView;
  private readonly streamStride: number;
  private readonly deviceBuffers = new Map<RenderDevice, DeviceVertexBuffer>();
  private readonly retiringBuffers = new Set<RenderBuffer>();
  private readonly retiringInFlight = new Set<RenderBuffer>();
  private readonly uploadsInFlight = new Set<RenderDevice>();
  /** The most recently uploaded buffer, retained for the existing accessor. */
  private gpuBuffer: RenderBuffer | null = null;
  private gpuDevice: RenderDevice | null = null;
  private dirtyStart = Number.POSITIVE_INFINITY;
  private dirtyEnd = 0;
  private mutationRevision = 0;
  private closed = false;
  private disposing = false;
  private disposalComplete = false;
  #uploadAttempted = false;

  constructor(
    public readonly format: VertexFormat,
    public readonly vertexCount: number,
    /** Format stream stored here; `vertexCount` is the record count for this slot. */
    public readonly bufferSlot = 0
  ) {
    if (vertexCount <= 0 || !Number.isSafeInteger(vertexCount)) {
      throw new Error("VertexBuffer vertexCount must be a positive integer");
    }
    const stream = format.streams.find((candidate) => candidate.slot === bufferSlot);
    if (!stream) throw new Error(`Vertex format does not contain buffer slot ${bufferSlot}`);
    this.streamStride = stream.stride;
    const byteLength = stream.stride * vertexCount;
    if (!Number.isSafeInteger(byteLength)) throw new RangeError("VertexBuffer byteLength exceeds the safe integer range");
    this.data = new ArrayBuffer(byteLength);
    this.floats = new Float32Array(this.data, 0, Math.floor(this.data.byteLength / Float32Array.BYTES_PER_ELEMENT));
    this.view = new DataView(this.data);
    this.dirtyStart = 0;
    this.dirtyEnd = this.data.byteLength;
  }

  get byteLength(): number {
    return this.data.byteLength;
  }

  /** Changes when CPU bytes are written or an externally written range is marked dirty. */
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

  setAttribute(vertexIndex: number, semantic: VertexAttributeSemantic, values: readonly number[]): void {
    this.assertAlive();
    this.assertVertexIndex(vertexIndex);
    const attribute = this.format.getAttribute(semantic);
    this.assertAttributeSlot(attribute);
    if (values.length !== attribute.components) {
      throw new Error(`Semantic ${semantic} requires ${attribute.components} values, got ${values.length}`);
    }
    // Validate the complete vector before writing, so rejected updates do not
    // leave a partially changed vertex (or an untracked dirty range).
    for (const value of values) validateComponent(attribute.type, semantic, value);
    const byteOffset = vertexIndex * this.streamStride + attribute.offset;
    const componentBytes = vertexAttributeComponentBytes(attribute.type);
    for (let i = 0; i < values.length; i += 1) {
      writeComponent(this.view, byteOffset + i * componentBytes, attribute.type, values[i]!);
    }
    this.markDirty(byteOffset, attribute.byteLength);
  }

  getAttribute(vertexIndex: number, semantic: VertexAttributeSemantic): readonly number[] {
    this.assertAlive();
    this.assertVertexIndex(vertexIndex);
    const attribute = this.format.getAttribute(semantic);
    this.assertAttributeSlot(attribute);
    const byteOffset = vertexIndex * this.streamStride + attribute.offset;
    const componentBytes = vertexAttributeComponentBytes(attribute.type);
    return Array.from({ length: attribute.components }, (_, i) => readComponent(this.view, byteOffset + i * componentBytes, attribute.type));
  }

  /** Return the shader-visible numeric values while preserving raw getAttribute semantics. */
  getDecodedAttribute(vertexIndex: number, semantic: VertexAttributeSemantic): readonly number[] {
    const values = this.getAttribute(vertexIndex, semantic);
    const attribute = this.format.getAttribute(semantic);
    if (!attribute.normalized || attribute.type === "float32") return values;
    const [min, max] = integerRange(attribute.type);
    return values.map((value) => min < 0 ? Math.max(value / max, -1) : value / max);
  }

  /** Copy exactly the requested bytes, independent of the backing view's element type. */
  readBytes(byteOffset = 0, byteLength = this.byteLength - byteOffset): Uint8Array {
    this.assertAlive();
    this.assertByteRange(byteOffset, byteLength);
    return new Uint8Array(this.data, byteOffset, byteLength).slice();
  }

  /** Write the view's bytes, including its byteOffset and byteLength, without numeric conversion. */
  writeBytes(byteOffset: number, data: ArrayBufferView): void {
    this.assertAlive();
    this.assertByteRange(byteOffset, data.byteLength);
    if (data.byteLength === 0) return;
    const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    new Uint8Array(this.data, byteOffset, data.byteLength).set(source);
    this.markDirty(byteOffset, data.byteLength);
  }

  /** Notify uploads after direct writes through the legacy `data` or `floats` views. */
  markDirtyRange(byteOffset: number, byteLength: number): void {
    this.assertAlive();
    this.assertByteRange(byteOffset, byteLength);
    if (byteLength > 0) this.markDirty(byteOffset, byteLength);
  }

  upload(device: RenderDevice): RenderBuffer {
    this.#uploadAttempted = true;
    this.assertAlive();
    if (device.disposed) throw new RenderDeviceError("Render device is disposed", "DISPOSED_RESOURCE");
    if (device.contextLost) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    if (this.uploadsInFlight.has(device)) throw new RenderDeviceError("Reentrant VertexBuffer upload", "INVALID_OPERATION");
    this.uploadsInFlight.add(device);
    try {
      let resource = this.deviceBuffers.get(device);
      if (!resource || !isDeviceBufferLive(device, resource.buffer) || resource.generation !== device.generation) {
        // Allocate first: on failure the previous resource and dirty state remain
        // available for a retry. Each device receives its own buffer and snapshot.
        const generation = device.generation;
        const buffer = device.createBuffer("vertex", this.byteLength, new Uint8Array(this.data));
        const host = webgl2DeviceHost(device);
        if (host && !host.buffers.has(buffer as WebGL2Buffer)) {
          // An unverified allocation could belong to another device. Do not
          // adopt or dispose it; a retiring WebGL allocation remains device-owned.
          this.assertUploadDevice(device, generation);
          throw new RenderDeviceError("Device returned a vertex buffer that is not live and owned by it", "INVALID_RESOURCE", { bufferId: buffer.id });
        }
        try {
          this.assertUploadDevice(device, generation);
        } catch (error) {
          // A callback may close the owner or change generations during creation.
          try { this.retireBuffer(buffer); } catch (cleanup) {
            throw new AggregateError([error, cleanup], "VertexBuffer allocation cleanup failed", { cause: error });
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
        const start = resource.dirtyStart;
        const end = resource.dirtyEnd;
        // The device owns any backend-specific alignment. Keep the precise range
        // here so unrelated bytes, including native-written neighbors, are intact.
        device.updateBuffer(resource.buffer, start, new Uint8Array(this.data, start, end - start));
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

  dispose(): void {
    if (this.disposalComplete || this.disposing) return;
    if (!this.closed) {
      this.closed = true;
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
    if (errors.length) throw new AggregateError(errors, "VertexBuffer disposal failed");
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
    if (device.generation !== generation) throw new RenderDeviceError("Render device generation changed during vertex upload", "CONTEXT_LOST");
  }

  private assertUploadedResource(device: RenderDevice, resource: DeviceVertexBuffer): void {
    this.assertUploadDevice(device, resource.generation);
    if (this.deviceBuffers.get(device) !== resource || resource.buffer.disposed) {
      throw new RenderDeviceError("Vertex buffer resource changed during upload", "DISPOSED_RESOURCE");
    }
    if (!isDeviceBufferLive(device, resource.buffer)) {
      throw new RenderDeviceError("Vertex buffer is no longer a live resource on this device", "INVALID_RESOURCE", { bufferId: resource.buffer.id });
    }
  }

  private assertVertexIndex(vertexIndex: number): void {
    if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= this.vertexCount) {
      throw new RangeError(`Vertex index ${vertexIndex} is out of range`);
    }
  }

  private assertAttributeSlot(attribute: VertexAttribute): void {
    if (attribute.bufferSlot !== this.bufferSlot) {
      throw new Error(`Semantic ${attribute.semantic} belongs to buffer slot ${attribute.bufferSlot}; VertexBuffer stores slot ${this.bufferSlot}`);
    }
  }

  private assertByteRange(byteOffset: number, byteLength: number): void {
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || byteOffset < 0 || byteLength < 0 || byteOffset > this.byteLength || byteLength > this.byteLength - byteOffset) {
      throw new RangeError(`VertexBuffer byte range [${byteOffset}, ${byteOffset + byteLength}) is out of bounds`);
    }
  }

  private assertAlive(): void {
    if (this.closed) {
      throw new RenderDeviceError("VertexBuffer is disposed", "DISPOSED_RESOURCE");
    }
  }

  private markDirty(start: number, byteLength: number): void {
    this.mutationRevision += 1;
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
}

function validateComponent(type: VertexAttributeType, semantic: VertexAttributeSemantic, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`Semantic ${semantic} values must be finite`);
  if (type === "float32") {
    if (!Number.isFinite(Math.fround(value))) throw new RangeError(`Semantic ${semantic} value is outside the float32 range`);
    return;
  }
  const [min, max] = integerRange(type);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Semantic ${semantic} values must be integers in the ${type} range [${min}, ${max}]`);
  }
}

function integerRange(type: Exclude<VertexAttributeType, "float32">): readonly [number, number] {
  switch (type) {
    case "int8": return [-128, 127];
    case "uint8": return [0, 255];
    case "int16": return [-32768, 32767];
    case "uint16": return [0, 65535];
    case "int32": return [-2147483648, 2147483647];
    case "uint32": return [0, 4294967295];
  }
}

// The CPU API reads and writes the underlying integer values. `normalized`
// affects only conversion by the graphics backend when a vertex is fetched.
function writeComponent(view: DataView, offset: number, type: VertexAttributeType, value: number): void {
  switch (type) {
    case "float32": view.setFloat32(offset, value, true); break;
    case "int8": view.setInt8(offset, value); break;
    case "uint8": view.setUint8(offset, value); break;
    case "int16": view.setInt16(offset, value, true); break;
    case "uint16": view.setUint16(offset, value, true); break;
    case "int32": view.setInt32(offset, value, true); break;
    case "uint32": view.setUint32(offset, value, true); break;
  }
}

function readComponent(view: DataView, offset: number, type: VertexAttributeType): number {
  switch (type) {
    case "float32": return view.getFloat32(offset, true);
    case "int8": return view.getInt8(offset);
    case "uint8": return view.getUint8(offset);
    case "int16": return view.getInt16(offset, true);
    case "uint16": return view.getUint16(offset, true);
    case "int32": return view.getInt32(offset, true);
    case "uint32": return view.getUint32(offset, true);
  }
}

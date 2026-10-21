import { type IndexType, type RenderBuffer, type RenderDevice, RenderDeviceError } from "./RenderDevice";

export class IndexBuffer {
  public readonly type: IndexType;
  public readonly data: Uint16Array | Uint32Array;
  private gpuBuffer: RenderBuffer | null = null;
  private disposed = false;
  private dirtyStart = Number.POSITIVE_INFINITY;
  private dirtyEnd = 0;

  constructor(indices: readonly number[] | Uint16Array | Uint32Array, vertexCount?: number) {
    if (indices.length === 0) {
      throw new Error("IndexBuffer requires at least one index");
    }
    let maxIndex = 0;
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("IndexBuffer indices must be non-negative integers");
      }
      if (index > maxIndex) maxIndex = index;
    }
    if (vertexCount !== undefined && maxIndex >= vertexCount) {
      throw new RangeError(`Index ${maxIndex} is outside vertex count ${vertexCount}`);
    }
    this.type = maxIndex > 65535 ? "uint32" : "uint16";
    this.data = this.type === "uint32" ? Uint32Array.from(indices) : Uint16Array.from(indices);
  }

  get count(): number {
    return this.data.length;
  }

  get byteLength(): number {
    return this.data.byteLength;
  }

  get uploadedBuffer(): RenderBuffer | null {
    return this.gpuBuffer;
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
    let maxIndex = 0;
    for (const index of values) {
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("IndexBuffer indices must be non-negative integers");
      }
      if (index > maxIndex) maxIndex = index;
    }
    this.data.set(values as readonly number[], start);
    this.markDirty(start * bytesPer, values.length * bytesPer);
  }

  getDirtyRange(): { readonly start: number; readonly end: number } | null {
    return this.dirtyStart <= this.dirtyEnd ? { start: this.dirtyStart, end: this.dirtyEnd } : null;
  }

  upload(device: RenderDevice): RenderBuffer {
    this.assertAlive();
    if (!this.gpuBuffer || this.gpuBuffer.disposed) {
      this.gpuBuffer = device.createBuffer("index", this.data.byteLength, this.data);
      this.clearDirty();
      return this.gpuBuffer;
    }
    if (this.dirtyStart <= this.dirtyEnd) {
      const bytesPer = this.type === "uint32" ? 4 : 2;
      const start = Math.floor(this.dirtyStart / bytesPer) * bytesPer;
      const end = Math.min(this.data.byteLength, Math.ceil(this.dirtyEnd / bytesPer) * bytesPer);
      device.updateBuffer(this.gpuBuffer, start, new Uint8Array(this.data.buffer as ArrayBuffer, this.data.byteOffset + start, end - start));
      this.clearDirty();
    }
    return this.gpuBuffer;
  }

  dispose(): void {
    this.gpuBuffer?.dispose();
    this.disposed = true;
  }

  private markDirty(start: number, byteLength: number): void {
    this.dirtyStart = Math.min(this.dirtyStart, start);
    this.dirtyEnd = Math.max(this.dirtyEnd, start + byteLength);
  }

  private clearDirty(): void {
    this.dirtyStart = Number.POSITIVE_INFINITY;
    this.dirtyEnd = 0;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new RenderDeviceError("IndexBuffer is disposed", "DISPOSED_RESOURCE");
    }
  }
}

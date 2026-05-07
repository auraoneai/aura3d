import { type RenderBuffer, type RenderDevice, RenderDeviceError } from "./RenderDevice";
import { type VertexAttributeSemantic, VertexFormat } from "./VertexFormat";

export class VertexBuffer {
  public readonly data: ArrayBuffer;
  public readonly floats: Float32Array;
  private gpuBuffer: RenderBuffer | null = null;
  private dirtyStart = Number.POSITIVE_INFINITY;
  private dirtyEnd = 0;
  private disposed = false;

  constructor(
    public readonly format: VertexFormat,
    public readonly vertexCount: number
  ) {
    if (vertexCount <= 0 || !Number.isInteger(vertexCount)) {
      throw new Error("VertexBuffer vertexCount must be a positive integer");
    }
    this.data = new ArrayBuffer(format.stride * vertexCount);
    this.floats = new Float32Array(this.data);
    this.markDirty(0, this.data.byteLength);
  }

  get byteLength(): number {
    return this.data.byteLength;
  }

  get uploadedBuffer(): RenderBuffer | null {
    return this.gpuBuffer;
  }

  setAttribute(vertexIndex: number, semantic: VertexAttributeSemantic, values: readonly number[]): void {
    this.assertAlive();
    this.assertVertexIndex(vertexIndex);
    const attribute = this.format.getAttribute(semantic);
    if (values.length !== attribute.components) {
      throw new Error(`Semantic ${semantic} requires ${attribute.components} values, got ${values.length}`);
    }
    const byteOffset = vertexIndex * this.format.stride + attribute.offset;
    const floatOffset = byteOffset / 4;
    for (let i = 0; i < values.length; i += 1) {
      this.floats[floatOffset + i] = values[i] ?? 0;
    }
    this.markDirty(byteOffset, attribute.byteLength);
  }

  getAttribute(vertexIndex: number, semantic: VertexAttributeSemantic): readonly number[] {
    this.assertAlive();
    this.assertVertexIndex(vertexIndex);
    const attribute = this.format.getAttribute(semantic);
    const byteOffset = vertexIndex * this.format.stride + attribute.offset;
    const floatOffset = byteOffset / 4;
    return Array.from(this.floats.slice(floatOffset, floatOffset + attribute.components));
  }

  upload(device: RenderDevice): RenderBuffer {
    this.assertAlive();
    if (!this.gpuBuffer || this.gpuBuffer.disposed) {
      this.gpuBuffer = device.createBuffer("vertex", this.byteLength, new Uint8Array(this.data));
      this.clearDirty();
      return this.gpuBuffer;
    }
    if (this.isDirty()) {
      const start = alignDown(this.dirtyStart, 4);
      const end = alignUp(this.dirtyEnd, 4);
      device.updateBuffer(this.gpuBuffer, start, new Uint8Array(this.data, start, end - start));
      this.clearDirty();
    }
    return this.gpuBuffer;
  }

  getDirtyRange(): { readonly start: number; readonly end: number } | null {
    if (!this.isDirty()) {
      return null;
    }
    return { start: this.dirtyStart, end: this.dirtyEnd };
  }

  dispose(): void {
    this.gpuBuffer?.dispose();
    this.disposed = true;
  }

  private assertVertexIndex(vertexIndex: number): void {
    if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= this.vertexCount) {
      throw new RangeError(`Vertex index ${vertexIndex} is out of range`);
    }
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new RenderDeviceError("VertexBuffer is disposed", "DISPOSED_RESOURCE");
    }
  }

  private markDirty(start: number, byteLength: number): void {
    this.dirtyStart = Math.min(this.dirtyStart, start);
    this.dirtyEnd = Math.max(this.dirtyEnd, start + byteLength);
  }

  private isDirty(): boolean {
    return this.dirtyStart <= this.dirtyEnd;
  }

  private clearDirty(): void {
    this.dirtyStart = Number.POSITIVE_INFINITY;
    this.dirtyEnd = 0;
  }
}

function alignDown(value: number, alignment: number): number {
  return Math.floor(value / alignment) * alignment;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

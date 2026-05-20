import { type IndexType, type RenderBuffer, type RenderDevice, RenderDeviceError } from "./RenderDevice";

export class IndexBuffer {
  public readonly type: IndexType;
  public readonly data: Uint16Array | Uint32Array;
  private gpuBuffer: RenderBuffer | null = null;
  private disposed = false;

  constructor(indices: readonly number[], vertexCount?: number) {
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
    this.data = this.type === "uint32" ? new Uint32Array(indices) : new Uint16Array(indices);
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

  upload(device: RenderDevice): RenderBuffer {
    this.assertAlive();
    if (!this.gpuBuffer || this.gpuBuffer.disposed) {
      this.gpuBuffer = device.createBuffer("index", this.data.byteLength, this.data);
    }
    return this.gpuBuffer;
  }

  dispose(): void {
    this.gpuBuffer?.dispose();
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new RenderDeviceError("IndexBuffer is disposed", "DISPOSED_RESOURCE");
    }
  }
}

/**
 * C-07 (PRD-01 §7.1) — real `InstanceBuffer` for `instanceBufferSlot.provide`.
 * Persistent per-node buffer (never per-frame `createBuffer`): CPU-side arrays
 * and device buffers grow by doubling up to the constructor `capacity`; writes
 * past capacity throw `INSTANCE_CAPACITY_EXCEEDED`. `version` bumps on every
 * write so consumers upload only on change (`bufferSubData` covers just the
 * written range, not the whole backing store).
 */

import { type RenderBuffer, type RenderDevice } from "../RenderDevice";
import type { InstanceBufferLike } from "../contracts/geometry";

const MIN_CAPACITY = 16;
const pow2Ceil = (value: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, value)));

export class InstanceBuffer implements InstanceBufferLike {
  private matrices: Float32Array;
  private colors: Float32Array | null = null;
  private matrixBuffer: RenderBuffer;
  private colorBuffer: RenderBuffer | null = null;
  private allocated: number;
  public count = 0;
  public version = 0;

  constructor(
    private readonly device: RenderDevice,
    private readonly capacity: number,
    options?: { colors?: boolean }
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`InstanceBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.allocated = Math.min(capacity, MIN_CAPACITY);
    this.matrices = new Float32Array(this.allocated * 16);
    this.matrixBuffer = device.createBuffer("vertex", this.matrices.byteLength);
    if (options?.colors) {
      this.colors = new Float32Array(this.allocated * 4);
      this.colorBuffer = device.createBuffer("vertex", this.colors.byteLength);
    }
  }

  private ensureAllocated(instances: number, withColors: boolean): void {
    if (instances <= this.allocated) return;
    const next = Math.min(this.capacity, pow2Ceil(instances));
    const matrices = new Float32Array(next * 16);
    matrices.set(this.matrices.subarray(0, this.count * 16));
    this.matrices = matrices;
    const oldMatrix = this.matrixBuffer;
    this.matrixBuffer = this.device.createBuffer("vertex", matrices.byteLength);
    // Dispose of the old buffer first so device-side VAOs referencing it are
    // evicted (PRD §7.1) before a same-content buffer takes its place.
    oldMatrix.dispose();
    if (withColors && this.colors && this.colorBuffer && this.colors.length < next * 4) {
      this.growColors(next);
    }
    this.allocated = next;
  }

  private growColors(instances: number): void {
    if (!this.colors || !this.colorBuffer) return;
    const colors = new Float32Array(instances * 4);
    colors.set(this.colors.subarray(0, this.count * 4));
    this.colors = colors;
    const oldColors = this.colorBuffer;
    this.colorBuffer = this.device.createBuffer("vertex", colors.byteLength);
    oldColors.dispose();
  }

  setMatrices(m: Float32Array, count?: number): void {
    const n = count ?? Math.floor(m.length / 16);
    if (n > this.capacity) throw new Error(`INSTANCE_CAPACITY_EXCEEDED:${n}>${this.capacity}`);
    this.ensureAllocated(n, false);
    this.matrices.set(m.subarray(0, n * 16));
    this.device.updateBuffer(this.matrixBuffer, 0, this.matrices.subarray(0, n * 16));
    this.count = n;
    this.version += 1;
  }

  setColors(c: Float32Array): void {
    if (!this.colors || !this.colorBuffer) throw new Error("INSTANCE_COLORS_NOT_ENABLED");
    const n = Math.floor(c.length / 4);
    if (n > this.capacity) throw new Error(`INSTANCE_CAPACITY_EXCEEDED:${n}>${this.capacity}`);
    this.ensureAllocated(n, true);
    if (this.colors.length < n * 4) this.growColors(n);
    this.colors.set(c.subarray(0, n * 4));
    this.device.updateBuffer(this.colorBuffer, 0, this.colors.subarray(0, n * 4));
    this.version += 1;
  }

  bind(): { readonly matrixBuffer: RenderBuffer; readonly colorBuffer?: RenderBuffer } {
    return this.colorBuffer
      ? { matrixBuffer: this.matrixBuffer, colorBuffer: this.colorBuffer }
      : { matrixBuffer: this.matrixBuffer };
  }

  dispose(): void {
    this.matrixBuffer.dispose();
    this.colorBuffer?.dispose();
  }
}

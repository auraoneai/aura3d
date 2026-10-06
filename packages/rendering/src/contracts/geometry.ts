/**
 * C-07 — primitive tessellation and InstanceBuffer (CONTRACTS.md). Provider: PRD 01.
 * AuraPrimitiveOptions.tessellation? / AuraPrimitiveNode.batch?/.static? added in PR 0a (engine side).
 */

import type { RenderBuffer, RenderDevice } from "../RenderDevice";
import { defineContractSlot, type ContractSlot } from "./core";

export interface AuraPrimitiveTessellation { readonly widthSegments?: number; readonly heightSegments?: number; readonly depthSegments?: number; readonly radialSegments?: number; readonly tubularSegments?: number; readonly capSegments?: number; readonly openEnded?: boolean; readonly radiusTop?: number; readonly radiusBottom?: number; readonly tube?: number; }

export interface InstanceBufferLike {
  readonly count: number; readonly version: number;
  setMatrices(m: Float32Array, count?: number): void;
  setColors(c: Float32Array): void;
  bind(): { readonly matrixBuffer: RenderBuffer; readonly colorBuffer?: RenderBuffer };
  dispose(): void;
}

/**
 * PR 0a stub: wraps the per-frame instance upload behaviour used by ForwardPass
 * today — device buffers created up front, data re-uploaded on each set,
 * `version` incremented per write. Capacity is the hard limit: writing past it
 * throws INSTANCE_CAPACITY_EXCEEDED.
 */
class StubInstanceBuffer implements InstanceBufferLike {
  private matrices: Float32Array;
  private colors: Float32Array | null = null;
  private matrixBuffer: RenderBuffer;
  private colorBuffer: RenderBuffer | null = null;
  public count = 0;
  public version = 0;

  constructor(
    private readonly device: RenderDevice,
    private readonly capacity: number,
    options?: { colors?: boolean }
  ) {
    this.matrices = new Float32Array(capacity * 16);
    this.matrixBuffer = device.createBuffer("vertex", this.matrices.byteLength);
    if (options?.colors) {
      this.colors = new Float32Array(capacity * 4);
      this.colorBuffer = device.createBuffer("vertex", this.colors.byteLength);
    }
  }

  setMatrices(m: Float32Array, count?: number): void {
    const n = count ?? Math.floor(m.length / 16);
    if (n > this.capacity) throw new Error(`INSTANCE_CAPACITY_EXCEEDED:${n}>${this.capacity}`);
    this.matrices.set(m.subarray(0, n * 16));
    this.device.updateBuffer(this.matrixBuffer, 0, this.matrices);
    this.count = n;
    this.version += 1;
  }

  setColors(c: Float32Array): void {
    if (!this.colors || !this.colorBuffer) throw new Error("INSTANCE_COLORS_NOT_ENABLED");
    const n = Math.floor(c.length / 4);
    if (n > this.capacity) throw new Error(`INSTANCE_CAPACITY_EXCEEDED:${n}>${this.capacity}`);
    this.colors.set(c.subarray(0, n * 4));
    this.device.updateBuffer(this.colorBuffer, 0, this.colors);
    this.version += 1;
  }

  bind(): { readonly matrixBuffer: RenderBuffer; readonly colorBuffer?: RenderBuffer } {
    return this.colorBuffer ? { matrixBuffer: this.matrixBuffer, colorBuffer: this.colorBuffer } : { matrixBuffer: this.matrixBuffer };
  }

  dispose(): void {
    this.matrixBuffer.dispose();
    this.colorBuffer?.dispose();
  }
}

export const instanceBufferSlot: ContractSlot<(device: RenderDevice, capacity: number, options?: { colors?: boolean }) => InstanceBufferLike> =
  defineContractSlot("C-07", "prd01", "A3D_QR_CORE", (device, capacity, options) => new StubInstanceBuffer(device, capacity, options));

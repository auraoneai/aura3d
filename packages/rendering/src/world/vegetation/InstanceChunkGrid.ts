/**
 * PRD-10 T3.1 §9.3 — instanced-draw chunk grid for world content. Instances
 * are grouped into `cellSize` (32 m) cells, packed once into ONE static vertex
 * buffer (`createBuffer("vertex", …)` at load; kept until scene teardown —
 * bypasses the per-frame allocation and VAO leak of the generic path, V5/V6),
 * and each cell records its byte range so a draw can emulate `firstInstance`
 * via attribute offset `rangeStart * stride`.
 *
 * Two layouts (§9.3):
 * - `compact32` (32 B stride): vec3 position + f32 yawScalePacked + unorm8x4
 *   variation (colorVariation, lodFade, windPhase, reserved) + vec4 extra
 *   unorm8x4, tail-padded to 32 B. Yaw+uniform-scale rebuild the matrix in VS.
 * - `matrix48` (48 B stride): row-major mat3x4 — kits and explicit placements.
 *
 * Per-cell AABB includes the placement extents plus `maxWindSway` when the
 * instances wind-deform (C-26 `a3d_prd10_wind`).
 */
import type { RenderDevice, RenderBuffer } from "../../RenderDevice.js";

/** IEEE-754 half packer — DataView.setFloat16 is too new to assume on CI browsers. */
function writeFloat16(dv: DataView, byteOffset: number, value: number): void {
  const f32 = new Float32Array(1);
  f32[0] = value;
  const b = new DataView(f32.buffer).getUint32(0, true);
  const sign = (b >>> 31) & 1;
  let exp = (b >>> 23) & 0xff;
  let frac = b & 0x7fffff;
  if (exp === 255) {
    dv.setUint16(byteOffset, sign << 15 | (frac ? 0x7e00 : 0x7c00), true); // inf/nan
    return;
  }
  exp = exp - 127 + 15;
  if (exp >= 0x1f) {
    dv.setUint16(byteOffset, sign << 15 | 0x7c00, true); // overflow -> inf
    return;
  }
  if (exp <= 0) {
    // subnormal/zero
    frac = (frac | 0x800000) >> (1 - exp);
    dv.setUint16(byteOffset, sign << 15 | (frac >> 13), true);
    return;
  }
  dv.setUint16(byteOffset, sign << 15 | (exp << 10) | (frac >> 13), true);
}

export type InstanceChunkLayout = "compact32" | "matrix48";

export const INSTANCE_STRIDE_COMPACT32 = 32;
export const INSTANCE_STRIDE_MATRIX48 = 48;

export interface CompactInstance {
  readonly position: readonly [number, number, number];
  readonly yawDeg: number;
  readonly scale: number;
  /** [colorVariation, lodFade, windPhase, reserved] each 0..1. */
  readonly variation: readonly [number, number, number, number];
  readonly extra?: readonly [number, number, number, number];
}

export interface InstanceChunkCell {
  readonly cellX: number;
  readonly cellZ: number;
  /** First instance in the shared buffer (instances are tightly packed). */
  readonly rangeStart: number;
  readonly count: number;
  /** Byte offset into the instance buffer = rangeStart * stride. */
  readonly byteOffset: number;
  /** World AABB, min/max, including wind sway + instance local bounds. */
  readonly aabb: Float32Array; // 6 floats: minX,minY,minZ,maxX,maxY,maxZ
}

export interface InstanceChunkGridSpec {
  readonly layout: InstanceChunkLayout;
  /** World-space cell side; §9.3 default 32 m. */
  readonly cellSize?: number;
  /** Per-instance local Y extent [minY, maxY] * max scale for the AABB. */
  readonly localHeight?: readonly [number, number];
  /** Extra radial/Y margin for wind-deformed instances (metres). */
  readonly maxWindSway?: number;
  readonly instances: readonly CompactInstance[] | readonly Float32Array[]; // matrix48: 12-float rows
}

export class InstanceChunkGrid {
  readonly layout: InstanceChunkLayout;
  readonly cellSize: number;
  readonly stride: number;
  readonly cells: readonly InstanceChunkCell[];
  /** Packed instance bytes (layout-dependent stride). */
  readonly data: ArrayBuffer;
  readonly instanceCount: number;
  private buffer: RenderBuffer | null = null;

  constructor(spec: InstanceChunkGridSpec) {
    this.layout = spec.layout;
    this.cellSize = spec.cellSize ?? 32;
    this.stride = spec.layout === "compact32" ? INSTANCE_STRIDE_COMPACT32 : INSTANCE_STRIDE_MATRIX48;
    const sway = spec.maxWindSway ?? 0;
    const localH = spec.localHeight ?? [0, 0];

    type Key = string;
    const groups = new Map<Key, number[]>();
    const list = spec.instances;
    for (let i = 0; i < list.length; i += 1) {
      const inst = list[i]!;
      const [x, , z] = spec.layout === "compact32"
        ? [(inst as CompactInstance).position[0], 0, (inst as CompactInstance).position[2]]
        : [(inst as Float32Array)[3]!, 0, (inst as Float32Array)[11]!]; // row-major mat3x4 translation
      const key: Key = `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(i);
    }

    const keys = [...groups.keys()].sort();
    this.data = new ArrayBuffer(list.length * this.stride);
    const dv = new DataView(this.data);
    const cells: InstanceChunkCell[] = [];
    let cursor = 0;
    for (const key of keys) {
      const idx = groups.get(key)!;
      const rangeStart = cursor;
      let minX = Infinity; let minY = Infinity; let minZ = Infinity;
      let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
      for (const i of idx) {
        let px: number; let py: number; let pz: number; let scale = 1;
        if (this.layout === "compact32") {
          const inst = list[i] as CompactInstance;
          [px, py, pz] = inst.position;
          scale = inst.scale;
          const off = cursor * this.stride;
          dv.setFloat32(off + 0, px, true);
          dv.setFloat32(off + 4, py, true);
          dv.setFloat32(off + 8, pz, true);
          // yaw packed as unorm16 [0..360) and scale as float16 in one u32.
          const yawU16 = Math.round((((inst.yawDeg % 360) + 360) % 360) / 360 * 65535) & 0xffff;
          dv.setUint16(off + 12, yawU16, true);
          writeFloat16(dv, off + 14, inst.scale);
          for (let k = 0; k < 4; k += 1) {
            dv.setUint8(off + 16 + k, Math.round(Math.min(1, Math.max(0, inst.variation[k] ?? 0)) * 255));
            dv.setUint8(off + 20 + k, Math.round(Math.min(1, Math.max(0, inst.extra?.[k] ?? 0)) * 255));
          }
        } else {
          const m = list[i] as Float32Array; // 12 floats, row-major 3x4
          px = m[3]!; py = m[7]!; pz = m[11]!;
          const off = cursor * this.stride;
          for (let k = 0; k < 12; k += 1) dv.setFloat32(off + k * 4, m[k]!, true);
        }
        minX = Math.min(minX, px - sway); maxX = Math.max(maxX, px + sway);
        minZ = Math.min(minZ, pz - sway); maxZ = Math.max(maxZ, pz + sway);
        minY = Math.min(minY, py + localH[0] * scale); maxY = Math.max(maxY, py + localH[1] * scale);
        cursor += 1;
      }
      const [cx, cz] = key.split(",").map(Number) as [number, number];
      cells.push({
        cellX: cx,
        cellZ: cz,
        rangeStart,
        count: idx.length,
        byteOffset: rangeStart * this.stride,
        aabb: Float32Array.from([minX, minY, minZ, maxX, maxY, maxZ])
      });
    }
    this.cells = cells;
    this.instanceCount = list.length;
  }

  /** Upload once per world item; the returned buffer lives until `dispose()`. */
  upload(device: RenderDevice): RenderBuffer {
    if (!this.buffer) {
      this.buffer = device.createBuffer("vertex", this.data.byteLength, new Uint8Array(this.data));
    }
    return this.buffer;
  }

  /** Cells whose AABB passes a frustum test (plane array: [nx,ny,nz,d]). */
  cull(frustumPlanes: readonly (readonly [number, number, number, number])[]): InstanceChunkCell[] {
    const out: InstanceChunkCell[] = [];
    outer: for (const cell of this.cells) {
      const a = cell.aabb;
      for (const [nx, ny, nz, d] of frustumPlanes) {
        const px = nx >= 0 ? a[3]! : a[0]!;
        const py = ny >= 0 ? a[4]! : a[1]!;
        const pz = nz >= 0 ? a[5]! : a[2]!;
        if (nx * px + ny * py + nz * pz + d < 0) continue outer;
      }
      out.push(cell);
    }
    return out;
  }

  dispose(): void {
    this.buffer?.dispose();
    this.buffer = null;
  }
}

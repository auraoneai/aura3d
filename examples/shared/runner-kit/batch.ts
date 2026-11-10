/**
 * Dynamic mesh batches for runner worlds: every pooled entity kind is one merged `geometry.dynamic` node instead of
 * one node per entity. Road entities live in a scrolling frame — an entity's `z - scroll` never changes, so its
 * vertices are written once when it appears (`scrollFrameZ`) and the batch node is moved by the scroll each frame.
 * Only per-frame movers (particles, streaks) rewrite vertices, and `flush` uploads just the dirty vertex ranges.
 */
import { geometry, type AuraApp } from "@aura3d/engine";
import type { Rgb } from "./look-utils";

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function mergeMeshes(parts: readonly MeshData[]): MeshData {
  const out: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  for (const p of parts) {
    const base = out.positions.length / 3;
    out.positions.push(...p.positions);
    out.normals.push(...p.normals);
    out.uvs.push(...p.uvs);
    for (const i of p.indices) out.indices.push(base + i);
  }
  return out;
}

/** The scrolling-frame write: vertex z for an entity at run-space `z` when the world scroll is `scroll`. */
export const scrollFrameZ = (z: number, scroll: number): number => z - scroll;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

/** Batches are moved by node transforms and their vertices span the whole run, so their culling bounds are unbounded by default. */
export const OPEN_BOUNDS = { min: [-1e5, -1e4, -1e7] as [number, number, number], max: [1e5, 1e4, 1e7] as [number, number, number] };

/** Tight corridor frustum bounds for scrolling lane runners whose active segment pool stays within [-420, 60] m of scroll. */
export const CORRIDOR_BOUNDS = { min: [-48, -24, -420] as [number, number, number], max: [48, 64, 60] as [number, number, number] };

export interface BatchBounds {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

/**
 * `max` copies of one template mesh in one `geometry.dynamic` node. `place` writes one instance (optionally from another
 * template with the same vertex count and indices), `collapse` folds it to a point, and `flush` uploads only the vertex
 * range written since the last flush.
 */
export class Batch {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tones: Float32Array | null;
  readonly vertsPer: number;
  readonly mesh: MeshData;
  /** Instances written since the last flush (positions/normals) and instances whose tone changed. */
  private readonly dirty: Uint8Array;
  private readonly toneDirty: Uint8Array;
  private anyDirty = false;
  private anyToneDirty = false;
  /** Vertex uploads issued by `flush` so far (for tests and upload budgets). */
  uploadedVertices = 0;

  constructor(
    private readonly template: MeshData,
    readonly max: number,
    tone: Rgb | readonly number[] | null = null,
    private readonly bounds: BatchBounds = OPEN_BOUNDS
  ) {
    this.vertsPer = template.positions.length / 3;
    this.dirty = new Uint8Array(max);
    this.toneDirty = new Uint8Array(max);
    const merged = mergeMeshes(Array.from({ length: max }, () => template));
    this.mesh = merged;
    this.positions = new Float32Array(merged.positions.length);
    this.normals = Float32Array.from(merged.normals);
    if (tone) {
      this.tones = new Float32Array(merged.positions.length);
      const perVertex = tone.length === this.vertsPer * 3;
      for (let i = 0; i < max; i++) {
        for (let v = 0; v < this.vertsPer; v++) {
          const k = (i * this.vertsPer + v) * 3;
          this.tones[k] = perVertex ? (tone[v * 3] as number) : (tone[0] as number);
          this.tones[k + 1] = perVertex ? (tone[v * 3 + 1] as number) : (tone[1] as number);
          this.tones[k + 2] = perVertex ? (tone[v * 3 + 2] as number) : (tone[2] as number);
        }
      }
    } else this.tones = null;
  }

  private mark(i: number): void {
    this.dirty[i] = 1;
    this.anyDirty = true;
  }

  /** Each run of consecutive flagged instances, as [first, count]; clears the flags. */
  private static runs(flags: Uint8Array): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < flags.length; i++) {
      if (!flags[i]) continue;
      let j = i;
      while (j + 1 < flags.length && flags[j + 1]) j++;
      out.push([i, j - i + 1]);
      flags.fill(0, i, j + 1);
      i = j;
    }
    return out;
  }

  /** Place instance `i` at (x, y, z) with yaw about Y and per-axis scale. */
  place(i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, from: MeshData = this.template): void {
    const t = from, c = Math.cos(yaw), s = Math.sin(yaw), base = i * this.vertsPer * 3;
    for (let v = 0; v < this.vertsPer; v++) {
      const k = v * 3;
      const lx = (t.positions[k] as number) * sx, ly = (t.positions[k + 1] as number) * sy, lz = (t.positions[k + 2] as number) * sz;
      this.positions[base + k] = x + lx * c + lz * s;
      this.positions[base + k + 1] = y + ly;
      this.positions[base + k + 2] = z - lx * s + lz * c;
      const nx = (t.normals[k] as number) / sx, ny = (t.normals[k + 1] as number) / sy, nz = (t.normals[k + 2] as number) / sz;
      const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
      this.normals[base + k] = (nx * c + nz * s) * inv;
      this.normals[base + k + 1] = ny * inv;
      this.normals[base + k + 2] = (-nx * s + nz * c) * inv;
    }
    this.mark(i);
  }

  /** Fold instance `i` to a point (nothing draws). */
  collapse(i: number): void {
    this.positions.fill(0, i * this.vertsPer * 3, (i + 1) * this.vertsPer * 3);
    this.mark(i);
  }

  setTone(i: number, rgb: Rgb): void {
    if (!this.tones) return;
    for (let v = 0; v < this.vertsPer; v++) {
      const k = (i * this.vertsPer + v) * 3;
      this.tones[k] = rgb[0]; this.tones[k + 1] = rgb[1]; this.tones[k + 2] = rgb[2];
    }
    this.toneDirty[i] = 1;
    this.anyToneDirty = true;
  }

  geometry() {
    return geometry.dynamic({
      positions: this.positions.slice(), normals: this.normals.slice(), uvs: f32(this.mesh.uvs), indices: Uint32Array.from(this.mesh.indices), bounds: this.bounds,
      ...(this.tones ? { attributes: { tone: { itemSize: 3, data: this.tones.slice() } } } : {})
    });
  }

  /** Upload each run of instances written since the last flush. `normals: false` for unlit batches. */
  flush(h: NodeHandle, normals = true): void {
    const span = this.vertsPer * 3;
    if (this.anyDirty) {
      for (const [first, count] of Batch.runs(this.dirty)) {
        const from = first * span, to = (first + count) * span, offset = first * this.vertsPer;
        h.updateAttribute?.("position", { array: this.positions.subarray(from, to), offset, skipBoundsRefresh: true });
        if (normals) h.updateAttribute?.("normal", { array: this.normals.subarray(from, to), offset, skipBoundsRefresh: true });
        this.uploadedVertices += count * this.vertsPer;
      }
      this.anyDirty = false;
    }
    if (this.tones && this.anyToneDirty) {
      for (const [first, count] of Batch.runs(this.toneDirty)) {
        h.updateAttribute?.("tone", { array: this.tones.subarray(first * span, (first + count) * span), offset: first * this.vertsPer, skipBoundsRefresh: true });
      }
      this.anyToneDirty = false;
    }
  }
}

/**
 * Stable pool slots for objects that come and go (segments, entities): an object keeps its slot for its life.
 * Each frame: `retain(live, gone)` first (frees the slots of objects that left, so a full pool can take the newcomers),
 * then `use(item)` for each live object.
 */
export class Slots<T extends object> {
  private readonly slot = new Map<T, number>();
  private readonly free: number[];

  constructor(readonly size: number) {
    this.free = Array.from({ length: size }, (_, i) => size - 1 - i);
  }

  /** The object's slot and whether it was just assigned (`-1` when the pool is full). */
  use(item: T): { slot: number; fresh: boolean } {
    const known = this.slot.get(item);
    if (known !== undefined) return { slot: known, fresh: false };
    const next = this.free.pop();
    if (next === undefined) return { slot: -1, fresh: false };
    this.slot.set(item, next);
    return { slot: next, fresh: true };
  }

  /** Release every object not in `live`; `gone` gets each freed slot. */
  retain(live: Iterable<T>, gone: (slot: number) => void): void {
    const keep = new Set(live);
    for (const [item, s] of this.slot) {
      if (keep.has(item)) continue;
      this.slot.delete(item);
      this.free.push(s);
      gone(s);
    }
  }
}
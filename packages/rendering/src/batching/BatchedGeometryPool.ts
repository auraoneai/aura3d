/**
 * PRD 11 Phase 3 (§6.6 layer 3) — `BatchedGeometryPool` packs many same-layout
 * `Geometry` objects into one shared vertex arena and one shared index arena so
 * a `WEBGL_multi_draw` call (or the `u_drawId` uniform-loop fallback) can issue
 * every member draw against a single buffer pair. Index values are rebased by
 * each member's `baseVertex` so a packed index stream addresses the arena
 * directly; `firstIndex` is the element offset into the shared index buffer.
 *
 * The pool is a pure CPU structure until `upload(device)` materializes the
 * arenas once per build — buffers are never re-uploaded per frame.
 */

import { Geometry } from "../Geometry";
import type { Bounds3 } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import type { RenderBuffer, RenderDevice } from "../RenderDevice";
import { VertexBuffer } from "../VertexBuffer";
import type { VertexFormat } from "../VertexFormat";

export interface PackedGeometryEntry {
  readonly geometry: Geometry;
  /**
   * Stable insertion-order id (0, 1, 2, …). BatchedMesh/instancing lanes use
   * this as the draw-data `geometryId` — the meta texel carries it so the
   * shader can select per-geometry behavior without a second texture.
   */
  readonly geometryId: number;
  /** First element index of this member inside the shared index arena. */
  readonly firstIndex: number;
  readonly indexCount: number;
  /** Vertex offset applied to every packed index (and used as `firstVertex` when unindexed). */
  readonly baseVertex: number;
  readonly vertexCount: number;
  /** Element type after unification — `uint32` when any member needed it. */
  readonly indexType: "uint16" | "uint32";
}

export class BatchedGeometryPool {
  private vertexFloats: number[] = [];
  private indexData: number[] = [];
  private entries = new Map<Geometry, PackedGeometryEntry>();
  private totalVertices = 0;
  private format: VertexFormat | null = null;
  private vertexArena: RenderBuffer | null = null;
  private indexArena: RenderBuffer | null = null;
  private dirty = false;
  /** Set when any packed member needed 32-bit indices. */
  private needsUint32 = false;
  /** Device that performed the last `upload`, for context-restore rebuild. */
  private lastDevice: RenderDevice | null = null;
  private restoreRegistered = false;

  /**
   * Appends `geometry` to the arenas. Every member must share the vertex
   * format and indexed/non-indexed shape — the planner groups by
   * `vertexLayoutKey` before calling this.
   */
  pack(geometry: Geometry): PackedGeometryEntry {
    const existing = this.entries.get(geometry);
    if (existing) return existing;
    const floats = geometry.vertexBuffer.floats;
    const strideFloats = Math.max(1, geometry.vertexBuffer.format.stride >> 2);
    if (this.format === null) this.format = geometry.vertexBuffer.format;
    const baseVertex = this.totalVertices;
    const vertexBase = this.vertexFloats.length;
    for (let i = 0; i < geometry.vertexBuffer.vertexCount * strideFloats; i += 1) {
      this.vertexFloats.push(floats[i] ?? 0);
    }
    void vertexBase;
    let entry: PackedGeometryEntry;
    if (geometry.indexBuffer) {
      const data = geometry.indexBuffer.data;
      if (geometry.indexBuffer.type === "uint32" || baseVertex + geometry.vertexBuffer.vertexCount > 0xffff) {
        this.needsUint32 = true;
      }
      const firstIndex = this.indexData.length;
      for (let i = 0; i < data.length; i += 1) {
        this.indexData.push(data[i]! + baseVertex);
      }
      entry = {
        geometry, geometryId: this.entries.size, firstIndex, indexCount: data.length,
        baseVertex, vertexCount: geometry.vertexBuffer.vertexCount,
        indexType: "uint16" // final type resolved at upload (needsUint32 upgrades all)
      };
    } else {
      entry = {
        geometry, geometryId: this.entries.size, firstIndex: -1, indexCount: 0,
        baseVertex, vertexCount: geometry.vertexBuffer.vertexCount,
        indexType: "uint16"
      };
    }
    this.entries.set(geometry, entry);
    this.totalVertices += geometry.vertexBuffer.vertexCount;
    this.dirty = true;
    this.materialized = null; // arena contents changed — rematerialize on next asGeometry
    return entry;
  }

  entryFor(geometry: Geometry): PackedGeometryEntry | undefined {
    const entry = this.entries.get(geometry);
    return entry
      ? { ...entry, indexType: this.needsUint32 ? "uint32" : entry.indexType }
      : undefined;
  }

  /** Packed members in insertion order (geometryId === list index). */
  geometries(): readonly Geometry[] {
    return [...this.entries.keys()];
  }

  /**
   * Materialize the shared arenas as a single `Geometry` — the shape a
   * `RenderItem.geometry` needs. Member draws select their slice with
   * `drawRange` (`firstIndex`/`indexCount` in the shared index arena, or
   * `baseVertex`/`vertexCount` for unindexed members). Cached until the next
   * `pack`; bounds default to the union of member bounds.
   */
  asGeometry(bounds?: Bounds3): Geometry {
    if (this.materialized && this.materializedBounds === bounds) return this.materialized;
    if (!this.format || this.totalVertices === 0) {
      throw new Error("BatchedGeometryPool.asGeometry: pool has no packed geometry");
    }
    const vertices = new VertexBuffer(this.format, this.totalVertices);
    vertices.floats.set(this.vertexFloats);
    const indexBuffer = this.indexData.length > 0 ? new IndexBuffer(this.indexData) : null;
    this.materialized = new Geometry(vertices, indexBuffer, this.topologyOf() ?? "triangles", bounds ?? this.unionBounds());
    this.materializedBounds = bounds;
    return this.materialized;
  }

  private materialized: Geometry | null = null;
  private materializedBounds: Bounds3 | undefined;

  private topologyOf(): Geometry["topology"] | undefined {
    for (const geometry of this.entries.keys()) return geometry.topology;
    return undefined;
  }

  private unionBounds(): Bounds3 {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const geometry of this.entries.keys()) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], geometry.bounds.min[axis]!);
        max[axis] = Math.max(max[axis], geometry.bounds.max[axis]!);
      }
    }
    return { min, max };
  }

  /** One upload per build; subsequent calls return the live arenas. */
  upload(device: RenderDevice): { vertexBuffer: RenderBuffer; indexBuffer: RenderBuffer | null; indexType: "uint16" | "uint32" } {
    this.lastDevice = device;
    if (!this.dirty && this.vertexArena) {
      return { vertexBuffer: this.vertexArena, indexBuffer: this.indexArena, indexType: this.needsUint32 ? "uint32" : "uint16" };
    }
    this.vertexArena?.dispose();
    this.indexArena?.dispose();
    const vertexData = new Float32Array(this.vertexFloats);
    this.vertexArena = device.createBuffer("vertex", vertexData.byteLength, vertexData);
    if (this.indexData.length > 0) {
      const indexData = this.needsUint32 ? new Uint32Array(this.indexData) : new Uint16Array(this.indexData);
      this.indexArena = device.createBuffer("index", indexData.byteLength, indexData);
    } else {
      this.indexArena = null;
    }
    this.dirty = false;
    return { vertexBuffer: this.vertexArena, indexBuffer: this.indexArena, indexType: this.needsUint32 ? "uint32" : "uint16" };
  }

  /**
   * PRD 11 Phase 5 (§6.9): register with the C-29 `ResourceRegistry` once.
   * The CPU-side `vertexFloats`/`indexData` arrays are the retained source —
   * rebuild marks the arenas dirty and re-uploads on the last device.
   */
  registerForRestore(registry: { register<T extends object>(handle: T, descriptor: { kind: string; rebuild: () => Promise<void> | void }): T }): void {
    if (this.restoreRegistered) return;
    this.restoreRegistered = true;
    registry.register(this, {
      kind: "a3d-prd11-geometry-pool",
      rebuild: () => {
        if (!this.lastDevice) return;
        this.dirty = true;
        this.upload(this.lastDevice);
      }
    });
  }

  get vertexFormat(): VertexFormat | null {
    return this.format;
  }

  stats(): { geometries: number; vertexFloats: number; indexElements: number } {
    return { geometries: this.entries.size, vertexFloats: this.vertexFloats.length, indexElements: this.indexData.length };
  }

  dispose(): void {
    this.vertexArena?.dispose();
    this.indexArena?.dispose();
    this.vertexArena = null;
    this.indexArena = null;
    this.vertexFloats = [];
    this.indexData = [];
    this.entries.clear();
    this.totalVertices = 0;
    this.needsUint32 = false;
    this.format = null;
    this.dirty = false;
    this.materialized?.dispose();
    this.materialized = null;
  }
}

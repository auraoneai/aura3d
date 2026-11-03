/**
 * PRD 11 Phase 3 (§6.6 layer 3) — `BatchedGeometryPool` packs many same-layout
 * `Geometry` objects into one shared vertex arena and one shared index arena so
 * a `WEBGL_multi_draw` call (or the `u_drawId` uniform-loop fallback) can issue
 * every member draw against a single buffer pair. Index values are rebased by
 * each member's `baseVertex` so a packed index stream addresses the arena
 * directly; `firstIndex` is the element offset into the shared index buffer.
 *
 * The pool is a pure CPU structure until `upload(device)` materializes the
 * arenas once per device and content generation — buffers are never
 * re-uploaded per frame or shared between devices.
 */

import { Geometry } from "../Geometry";
import type { Bounds3 } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { RenderDeviceError, type RenderBuffer, type RenderDevice } from "../RenderDevice";
import { VertexBuffer } from "../VertexBuffer";
import type { VertexFormat } from "../VertexFormat";
import type { ResourceRegistryRegistration } from "../contracts/rendererFactory";
import { vertexFormatKey } from "./ContentKeys";

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

/** Lifetime/provenance only: retaining a generation never authorizes a draw. */
export interface PackedGeometryLease {
  readonly geometry: Geometry;
  readonly generation: number;
  /** False after release, mutation, or pool retirement. */
  isCurrent(): boolean;
  /** Call after backend work completes; retry if deferred cleanup throws. */
  release(): void;
}

interface PackedSourceSnapshot {
  readonly vertexBuffer: VertexBuffer;
  readonly vertexRevision: number;
  readonly vertexBytes: Uint8Array;
  readonly indexBuffer: IndexBuffer | null;
  readonly indexRevision: number | undefined;
  readonly indexBytes: Uint8Array | null;
  readonly layoutKey: string;
  readonly topology: Geometry["topology"];
}

interface PoolLifetime {
  leases: number;
  retired: boolean;
  releasing: boolean;
  readonly buffers: Set<RenderBuffer>;
  readonly geometries: Set<Geometry>;
}

interface DeviceArena {
  readonly vertexBuffer: RenderBuffer;
  readonly indexBuffer: RenderBuffer | null;
  readonly deviceGeneration: number | undefined;
  readonly contentGeneration: number;
  readonly indexType: "uint16" | "uint32";
  needsUpload: boolean;
}

interface DeviceRestoreHandle {
  readonly handle: object;
  readonly token: { active: boolean };
}

interface PackedLeaseSnapshot {
  readonly owner: BatchedGeometryPool;
  readonly geometry: Geometry;
  readonly vertex: VertexBuffer;
  readonly vertexRevision: number;
  readonly vertexCount: number;
  readonly vertexBytes: Uint8Array;
  readonly layoutKey: string;
  readonly index: IndexBuffer | null;
  readonly indexRevision: number | undefined;
  readonly indexType: IndexBuffer["type"] | undefined;
  readonly indexBytes: Uint8Array | null;
  readonly topology: Geometry["topology"];
  readonly bounds: Bounds3;
  readonly drawRange: { readonly start: number; readonly count: number } | undefined;
}

const leaseSnapshots = new WeakMap<PackedGeometryLease, PackedLeaseSnapshot>();

function newPoolLifetime(): PoolLifetime {
  return { leases: 0, retired: false, releasing: false, buffers: new Set(), geometries: new Set() };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function releaseRetiredResources(lifetime: PoolLifetime): void {
  if (lifetime.leases !== 0) return;
  const errors: unknown[] = [];
  for (const buffer of [...lifetime.buffers]) {
    // Delete before calling out so reentrant cleanup cannot dispose it twice.
    if (!lifetime.buffers.delete(buffer) || buffer.disposed) continue;
    try { buffer.dispose(); } catch (error) {
      errors.push(error);
      if (!buffer.disposed) lifetime.buffers.add(buffer);
    }
  }
  if (lifetime.retired) {
    for (const geometry of [...lifetime.geometries]) {
      if (!lifetime.geometries.delete(geometry) || geometry.disposed) continue;
      try { geometry.dispose(); } catch (error) {
        errors.push(error);
        if (!geometry.disposed) lifetime.geometries.add(geometry);
      }
    }
  }
  if (errors.length) throw new AggregateError(errors, "Packed geometry lease cleanup failed");
}

export class BatchedGeometryPool {
  private vertexChunks: Uint8Array[] = [];
  private vertexByteLength = 0;
  private indexData: number[] = [];
  private entries = new Map<Geometry, PackedGeometryEntry>();
  private readonly sourceSnapshots = new Map<Geometry, PackedSourceSnapshot>();
  private contentGeneration = 0;
  private lifetime = newPoolLifetime();
  private readonly retiredLifetimes = new Set<PoolLifetime>();
  private readonly materializationRecords = new WeakMap<Geometry, PackedLeaseSnapshot>();
  private totalVertices = 0;
  private format: VertexFormat | null = null;
  private readonly arenas = new Map<RenderDevice, DeviceArena>();
  /** Set when any packed member needed 32-bit indices. */
  private needsUint32 = false;
  /** Device that performed the last explicit `upload`, for batch migration. */
  private lastDevice: RenderDevice | null = null;
  private restoreRegistered = false;
  private restoreRegistry: ResourceRegistryRegistration | null = null;
  private restoreToken: { active: boolean } | null = null;
  private restorePrimary: { device?: RenderDevice } | null = null;
  private restorePrimaryHandle: object | null = null;
  private readonly restoreHandles = new Map<RenderDevice, DeviceRestoreHandle>();
  private readonly pendingUnregistrations = new Map<ResourceRegistryRegistration, Set<object>>();
  private restoreOwnership: { device?: RenderDevice; hint?: RenderDevice } = {};
  private packingTransactionActive = false;
  private restoreRegistrationActive = false;
  private disposalActive = false;

  /** Keep a failed group build from changing a caller-owned pool. */
  withPackingTransaction<T>(build: () => T): T {
    this.assertMutable();
    if (this.packingTransactionActive) throw new Error("BatchedGeometryPool already has an active packing transaction");
    const snapshot = {
      chunkCount: this.vertexChunks.length,
      vertexByteLength: this.vertexByteLength,
      indexCount: this.indexData.length,
      geometries: new Set(this.entries.keys()),
      contentGeneration: this.contentGeneration,
      totalVertices: this.totalVertices,
      format: this.format,
      needsUint32: this.needsUint32,
      materialized: this.materialized,
      materializedBounds: this.materializedBounds
    };
    this.packingTransactionActive = true;
    try {
      return build();
    } catch (error) {
      this.vertexChunks.length = snapshot.chunkCount;
      this.vertexByteLength = snapshot.vertexByteLength;
      this.indexData.length = snapshot.indexCount;
      for (const geometry of this.entries.keys()) {
        if (!snapshot.geometries.has(geometry)) {
          this.entries.delete(geometry);
          this.sourceSnapshots.delete(geometry);
        }
      }
      this.contentGeneration = snapshot.contentGeneration;
      this.totalVertices = snapshot.totalVertices;
      this.format = snapshot.format;
      this.needsUint32 = snapshot.needsUint32;
      this.materialized = snapshot.materialized;
      this.materializedBounds = snapshot.materializedBounds;
      throw error;
    } finally {
      this.packingTransactionActive = false;
    }
  }

  private assertMutable(): void {
    if (this.disposalActive) throw new Error("BatchedGeometryPool cannot mutate during disposal");
    if (this.restoreRegistrationActive) throw new Error("BatchedGeometryPool cannot mutate during restore registration");
  }

  private assertOutsidePackingTransaction(): void {
    this.assertMutable();
    if (this.packingTransactionActive) throw new Error("BatchedGeometryPool cannot materialize, upload, or dispose during a packing transaction");
  }

  /**
   * Appends `geometry` to the arenas. Every member must share the vertex
   * format and indexed/non-indexed shape — the planner groups by
   * `vertexLayoutKey` before calling this.
  */
  pack(geometry: Geometry): PackedGeometryEntry {
    this.assertMutable();
    const existing = this.entries.get(geometry);
    if (existing) return existing;
    const { vertexBuffer } = geometry;
    const format = vertexBuffer.format;
    const stream = format.streams[0];
    if (format.streams.length !== 1 || stream?.slot !== 0 || stream.stepMode !== "vertex" || vertexBuffer.bufferSlot !== 0) {
      throw new Error("BatchedGeometryPool supports a single per-vertex slot 0 stream");
    }
    if (this.format && vertexFormatKey(this.format) !== vertexFormatKey(format)) {
      throw new Error("BatchedGeometryPool requires identical vertex layouts");
    }
    const first = this.entries.keys().next().value;
    if (first && (first.topology !== geometry.topology || Boolean(first.indexBuffer) !== Boolean(geometry.indexBuffer))) {
      throw new Error("BatchedGeometryPool requires matching topology and indexing");
    }
    // Keep each source byte, including non-float data, padding and NaN payloads.
    // Snapshot before storing so subsequent source edits do not mutate the pool.
    const bytes = vertexBuffer.readBytes();
    const indexBuffer = geometry.indexBuffer;
    indexBuffer?.assertReadable();
    const indexBytes = indexBuffer ? new Uint8Array(indexBuffer.data.buffer, indexBuffer.data.byteOffset, indexBuffer.data.byteLength).slice() : null;
    const sourceSnapshot: PackedSourceSnapshot = {
      vertexBuffer, vertexRevision: vertexBuffer.revision, vertexBytes: bytes,
      indexBuffer, indexRevision: indexBuffer?.revision, indexBytes,
      layoutKey: vertexFormatKey(format), topology: geometry.topology
    };
    if (this.format === null) this.format = format;
    const baseVertex = this.totalVertices;
    this.vertexChunks.push(bytes);
    this.vertexByteLength += bytes.byteLength;
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
    this.sourceSnapshots.set(geometry, sourceSnapshot);
    this.contentGeneration += 1;
    this.totalVertices += geometry.vertexBuffer.vertexCount;
    this.materialized = null; // arena contents changed — rematerialize on next asGeometry
    return entry;
  }

  entryFor(geometry: Geometry): PackedGeometryEntry | undefined {
    const entry = this.entries.get(geometry);
    return entry
      ? { ...entry, indexType: this.needsUint32 ? "uint32" : entry.indexType }
      : undefined;
  }

  /** Detect stale retained CPU bytes; a match alone does not prove GPU residency. */
  sourceMatchesPacked(geometry: Geometry): boolean {
    const snapshot = this.sourceSnapshots.get(geometry);
    if (!snapshot) return false;
    try {
      const vertex = geometry.vertexBuffer;
      const index = geometry.indexBuffer;
      if (vertex !== snapshot.vertexBuffer || vertex.revision !== snapshot.vertexRevision ||
          index !== snapshot.indexBuffer || index?.revision !== snapshot.indexRevision ||
          geometry.topology !== snapshot.topology || vertexFormatKey(vertex.format) !== snapshot.layoutKey ||
          !sameBytes(vertex.readBytes(), snapshot.vertexBytes)) return false;
      if (index) {
        index.assertReadable();
        return snapshot.indexBytes !== null && sameBytes(
          new Uint8Array(index.data.buffer, index.data.byteOffset, index.data.byteLength), snapshot.indexBytes
        );
      }
      return snapshot.indexBytes === null;
    } catch {
      return false;
    }
  }

  /** Translate an already-clamped source element range into the packed arena. */
  translateSourceRange(geometry: Geometry, range: { readonly start: number; readonly count: number }): { readonly start: number; readonly count: number } {
    const entry = this.entries.get(geometry);
    if (!entry) throw new Error("Geometry is not in the packed pool");
    const available = entry.firstIndex >= 0 ? entry.indexCount : entry.vertexCount;
    if (!Number.isSafeInteger(range.start) || range.start < 0 || !Number.isSafeInteger(range.count) || range.count < 0 ||
        range.start > available || range.count > available - range.start) {
      throw new RangeError("Source draw range exceeds the packed geometry");
    }
    return Object.freeze({ start: (entry.firstIndex >= 0 ? entry.firstIndex : entry.baseVertex) + range.start, count: range.count });
  }

  /** Retain a materialized generation until the owner has finished all backend work. */
  retainGeneration(bounds?: Bounds3): PackedGeometryLease {
    const geometry = this.asGeometry(bounds);
    const lifetime = this.lifetime;
    const generation = this.contentGeneration;
    const snapshot = this.materializationRecords.get(geometry)!;
    let released = false;
    lifetime.leases += 1;
    const lease: PackedGeometryLease = Object.freeze({
      geometry,
      generation,
      isCurrent: () => !released && this.lifetime === lifetime && this.contentGeneration === generation,
      release: () => {
        if (!released) {
          released = true;
          leaseSnapshots.delete(lease);
          lifetime.leases -= 1;
        }
        // A prior cleanup may have thrown before actually disposing a buffer.
        // Retrying release must not decrement the lease count a second time.
        this.releaseLifetime(lifetime);
      }
    });
    leaseSnapshots.set(lease, snapshot);
    return lease;
  }

  private releaseLifetime(lifetime: PoolLifetime): void {
    // A disposer may release the same lease (or dispose the pool) recursively.
    // Keep the lifetime discoverable until the outer cleanup has settled.
    if (lifetime.releasing) return;
    lifetime.releasing = true;
    try {
      releaseRetiredResources(lifetime);
    } finally {
      lifetime.releasing = false;
      if (lifetime.retired && lifetime.leases === 0 && lifetime.buffers.size === 0 && lifetime.geometries.size === 0) {
        this.retiredLifetimes.delete(lifetime);
      }
    }
  }

  /** Detect edits to a leased CPU materialization; this is not a device-residency proof. */
  packedGeometryMatches(lease: PackedGeometryLease): boolean {
    const snapshot = leaseSnapshots.get(lease);
    if (!snapshot || snapshot.owner !== this || !lease.isCurrent()) return false;
    try {
      const geometry = snapshot.geometry;
      const vertex = geometry.vertexBuffer;
      const index = geometry.indexBuffer;
      const range = geometry.drawRange;
      if (vertex !== snapshot.vertex || vertex.revision !== snapshot.vertexRevision || vertex.vertexCount !== snapshot.vertexCount ||
          vertexFormatKey(vertex.format) !== snapshot.layoutKey || !sameBytes(vertex.readBytes(), snapshot.vertexBytes) ||
          index !== snapshot.index || index?.revision !== snapshot.indexRevision || index?.type !== snapshot.indexType ||
          geometry.topology !== snapshot.topology ||
          [0, 1, 2].some((axis) => !Object.is(geometry.bounds.min[axis], snapshot.bounds.min[axis]) ||
            !Object.is(geometry.bounds.max[axis], snapshot.bounds.max[axis])) ||
          (range ? !snapshot.drawRange || range.start !== snapshot.drawRange.start || range.count !== snapshot.drawRange.count : snapshot.drawRange !== undefined)) return false;
      if (index) {
        index.assertReadable();
        return snapshot.indexBytes !== null && sameBytes(
          new Uint8Array(index.data.buffer, index.data.byteOffset, index.data.byteLength), snapshot.indexBytes
        );
      }
      return snapshot.indexBytes === null;
    } catch {
      return false;
    }
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
    this.assertOutsidePackingTransaction();
    if (this.materialized && this.materializedBounds === bounds) return this.materialized;
    if (!this.format || this.totalVertices === 0) {
      throw new Error("BatchedGeometryPool.asGeometry: pool has no packed geometry");
    }
    const vertices = new VertexBuffer(this.format, this.totalVertices);
    const vertexBytes = this.vertexData();
    new Uint8Array(vertices.data).set(vertexBytes);
    const indexBuffer = this.indexData.length > 0 ? new IndexBuffer(this.indexData) : null;
    this.materialized = new Geometry(vertices, indexBuffer, this.topologyOf() ?? "triangles", bounds ?? this.unionBounds());
    this.materializationRecords.set(this.materialized, {
      owner: this, geometry: this.materialized,
      vertex: vertices, vertexRevision: vertices.revision, vertexCount: vertices.vertexCount,
      vertexBytes, layoutKey: vertexFormatKey(vertices.format), index: indexBuffer,
      indexRevision: indexBuffer?.revision, indexType: indexBuffer?.type, topology: this.materialized.topology,
      indexBytes: indexBuffer ? new Uint8Array(indexBuffer.data.buffer, indexBuffer.data.byteOffset, indexBuffer.data.byteLength).slice() : null,
      bounds: { min: [...this.materialized.bounds.min] as [number, number, number], max: [...this.materialized.bounds.max] as [number, number, number] },
      drawRange: undefined
    });
    // A previously returned geometry can still be referenced by an in-flight
    // draw after a later pack or bounds change. Keep ownership of every
    // materialization until the pool itself is retired.
    this.materializedGeometries.add(this.materialized);
    this.materializedBounds = bounds;
    return this.materialized;
  }

  private materialized: Geometry | null = null;
  private readonly materializedGeometries = new Set<Geometry>();
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

  /** One upload per device and content generation; subsequent calls return its live arenas. */
  upload(device: RenderDevice): { vertexBuffer: RenderBuffer; indexBuffer: RenderBuffer | null; indexType: "uint16" | "uint32" } {
    return this.uploadForDevice(device, true);
  }

  private uploadForDevice(
    device: RenderDevice,
    claimDevice: boolean
  ): { vertexBuffer: RenderBuffer; indexBuffer: RenderBuffer | null; indexType: "uint16" | "uint32" } {
    this.assertOutsidePackingTransaction();
    if (device.disposed) throw new RenderDeviceError("Render device is disposed", "DISPOSED_RESOURCE");
    if (device.contextLost) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    const previous = this.arenas.get(device);
    if (previous && !previous.needsUpload && previous.contentGeneration === this.contentGeneration &&
        previous.deviceGeneration === device.generation && !previous.vertexBuffer.disposed &&
        (!this.indexData.length || (previous.indexBuffer && !previous.indexBuffer.disposed))) {
      if (claimDevice) {
        this.lastDevice = device;
        this.restoreOwnership.device = device;
      }
      return { vertexBuffer: previous.vertexBuffer, indexBuffer: previous.indexBuffer, indexType: previous.indexType };
    }
    const vertexData = this.vertexData();
    const nextVertex = device.createBuffer("vertex", vertexData.byteLength, vertexData);
    let nextIndex: RenderBuffer | null = null;
    try {
      if (this.indexData.length > 0) {
        const indexData = this.needsUint32 ? new Uint32Array(this.indexData) : new Uint16Array(this.indexData);
        nextIndex = device.createBuffer("index", indexData.byteLength, indexData);
      }
      const registry = this.restoreRegistry;
      const token = this.restoreToken;
      if (registry && token && this.restorePrimary) {
        if (!this.restorePrimary.device) {
          this.restorePrimary.device = device;
        } else if (this.restorePrimary.device !== device && !this.restoreHandles.has(device)) {
          const handle = this.withRestoreRegistration(() => this.registerDeviceRestore(registry, device, token));
          this.restoreHandles.set(device, handle);
        }
      }
    } catch (error) {
      for (const buffer of [nextVertex, nextIndex]) {
        if (!buffer) continue;
        try { buffer.dispose(); } catch { if (!buffer.disposed) this.lifetime.buffers.add(buffer); }
      }
      throw error;
    }
    const indexType = this.needsUint32 ? "uint32" : "uint16";
    this.arenas.set(device, {
      vertexBuffer: nextVertex, indexBuffer: nextIndex, indexType,
      deviceGeneration: device.generation, contentGeneration: this.contentGeneration, needsUpload: false
    });
    const errors: unknown[] = [];
    for (const buffer of [previous?.vertexBuffer, previous?.indexBuffer]) {
      if (!buffer) continue;
      if (this.lifetime.leases) this.lifetime.buffers.add(buffer);
      else {
        try { buffer.dispose(); } catch (error) {
          if (!buffer.disposed) this.lifetime.buffers.add(buffer);
          errors.push(error);
        }
      }
    }
    if (errors.length) throw new AggregateError(errors, "Packed geometry arena retirement failed");
    if (claimDevice) {
      this.lastDevice = device;
      this.restoreOwnership.device = device;
    }
    return { vertexBuffer: nextVertex, indexBuffer: nextIndex, indexType };
  }

  private vertexData(): Uint8Array {
    const bytes = new Uint8Array(this.vertexByteLength);
    let offset = 0;
    for (const chunk of this.vertexChunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private withRestoreRegistration<T>(register: () => T): T {
    this.assertMutable();
    this.restoreRegistrationActive = true;
    try {
      return register();
    } finally {
      this.restoreRegistrationActive = false;
    }
  }

  private retainUnregistration(registry: ResourceRegistryRegistration, handle: object): void {
    let handles = this.pendingUnregistrations.get(registry);
    if (!handles) {
      handles = new Set();
      this.pendingUnregistrations.set(registry, handles);
    }
    handles.add(handle);
  }

  private unregisterRestoreHandle(registry: ResourceRegistryRegistration, handle: object): void {
    const pending = this.pendingUnregistrations.get(registry);
    const retrying = pending?.has(handle) === true;
    pending?.delete(handle);
    if (pending?.size === 0) this.pendingUnregistrations.delete(registry);
    try {
      const unregister = registry.unregister;
      if (unregister) unregister.call(registry, handle);
      else if (retrying) throw new Error("BatchedGeometryPool unregister retry is unavailable");
    } catch (error) {
      this.retainUnregistration(registry, handle);
      throw error;
    }
  }

  /**
   * PRD 11 Phase 5 (§6.9): register with the C-29 `ResourceRegistry` once.
   * The CPU-side vertex bytes and `indexData` arrays are the retained source.
   * Each resident device gets its own restore entry and arena generation.
   */
  registerForRestore(registry: ResourceRegistryRegistration, device?: RenderDevice): void {
    this.assertMutable();
    if (this.restoreRegistered) {
      this.restoreOwnership.hint ??= device;
      return;
    }
    this.withRestoreRegistration(() => {
      // A failed unregister may still own the pool's usual registry key. Retry
      // it first; if it remains pending, use a fresh key for the new lifetime
      // so a later retry cannot unregister the new device's callback.
      if (this.pendingUnregistrations.get(registry)?.has(this)) {
        try { this.unregisterRestoreHandle(registry, this); } catch { /* keep the old callback inert and retry later */ }
      }
      const primaryHandle = this.pendingUnregistrations.get(registry)?.has(this) ? {} : this;
      const token = { active: true };
      const ownership = this.restoreOwnership;
      const previousHint = ownership.hint;
      const primary: { device?: RenderDevice } = { device: this.lastDevice ?? undefined };
      const handles = new Map<RenderDevice, DeviceRestoreHandle>();
      ownership.hint = device;
      try {
        registry.register(primaryHandle, {
          kind: "a3d-prd11-geometry-pool",
          get device() { return primary.device ?? ownership.hint; },
          rebuild: () => {
            if (!token.active) return;
            if (primary.device) this.rebuildDeviceArena(primary.device);
          }
        });
        for (const residentDevice of this.arenas.keys()) {
          if (residentDevice !== primary.device) {
            handles.set(residentDevice, this.registerDeviceRestore(registry, residentDevice, token));
          }
        }
      } catch (error) {
        token.active = false;
        ownership.hint = previousHint;
        for (const { token: handleToken } of handles.values()) handleToken.active = false;
        for (const { handle } of handles.values()) {
          try { this.unregisterRestoreHandle(registry, handle); } catch { /* preserve registration error */ }
        }
        try { this.unregisterRestoreHandle(registry, primaryHandle); } catch { /* preserve registration error */ }
        throw error;
      }
      this.restoreRegistry = registry;
      this.restoreRegistered = true;
      this.restoreToken = token;
      this.restorePrimary = primary;
      this.restorePrimaryHandle = primaryHandle;
      for (const [residentDevice, handle] of handles) this.restoreHandles.set(residentDevice, handle);
    });
  }

  private registerDeviceRestore(
    registry: ResourceRegistryRegistration,
    device: RenderDevice,
    lifetimeToken: { active: boolean }
  ): DeviceRestoreHandle {
    const handle = {};
    const token = { active: true };
    try {
      registry.register(handle, {
        kind: "a3d-prd11-geometry-pool",
        device,
        rebuild: () => {
          if (lifetimeToken.active && token.active) this.rebuildDeviceArena(device);
        }
      });
    } catch (error) {
      token.active = false;
      try { this.unregisterRestoreHandle(registry, handle); } catch { /* preserve registration error */ }
      throw error;
    }
    return { handle, token };
  }

  private rebuildDeviceArena(device: RenderDevice): void {
    const arena = this.arenas.get(device);
    if (!arena) return;
    // A synchronous registry callback must not dirty a live arena before
    // upload rejects reentry into registration or disposal.
    this.assertMutable();
    arena.needsUpload = true;
    // Restoring one resident device is not a migration of the batch owner.
    this.uploadForDevice(device, false);
  }

  /** Follow explicit batch migration without changing per-device restore registrations. */
  restoreDeviceOwner(fallback?: RenderDevice): () => RenderDevice | undefined {
    const ownership = this.restoreOwnership;
    return () => ownership.device ?? fallback ?? ownership.hint;
  }

  get vertexFormat(): VertexFormat | null {
    return this.format;
  }

  stats(): { geometries: number; vertexFloats: number; indexElements: number } {
    return { geometries: this.entries.size, vertexFloats: Math.floor(this.vertexByteLength / 4), indexElements: this.indexData.length };
  }

  dispose(): void {
    // External unregister/dispose hooks can call back into the pool.
    if (this.disposalActive) return;
    this.assertOutsidePackingTransaction();
    this.disposalActive = true;
    try {
      const registry = this.restoreRegistry;
      const primaryHandle = this.restorePrimaryHandle;
      if (this.restoreToken) this.restoreToken.active = false;
      const handles = [...this.restoreHandles.values()];
      for (const handle of handles) handle.token.active = false;
      this.restoreHandles.clear();
      this.restoreRegistry = null;
      this.restoreRegistered = false;
      this.restoreToken = null;
      this.restorePrimary = null;
      this.restorePrimaryHandle = null;
      this.restoreOwnership = {};
      const unregisterWork = new Map<ResourceRegistryRegistration, Set<object>>();
      for (const [pendingRegistry, pendingHandles] of this.pendingUnregistrations) {
        unregisterWork.set(pendingRegistry, new Set(pendingHandles));
      }
      if (registry) {
        const currentHandles = unregisterWork.get(registry) ?? new Set<object>();
        if (primaryHandle) currentHandles.add(primaryHandle);
        for (const { handle } of handles) currentHandles.add(handle);
        if (currentHandles.size) unregisterWork.set(registry, currentHandles);
      }

      const errors: unknown[] = [];
      for (const [pendingRegistry, pendingHandles] of unregisterWork) {
        for (const handle of pendingHandles) {
          try { this.unregisterRestoreHandle(pendingRegistry, handle); } catch (error) { errors.push(error); }
        }
      }
      const lifetime = this.lifetime;
      this.lifetime = newPoolLifetime();
      lifetime.retired = true;
      this.retiredLifetimes.add(lifetime);
      for (const arena of this.arenas.values()) {
        lifetime.buffers.add(arena.vertexBuffer);
        if (arena.indexBuffer) lifetime.buffers.add(arena.indexBuffer);
      }
      this.arenas.clear();
      this.vertexChunks = [];
      this.vertexByteLength = 0;
      this.indexData = [];
      this.entries.clear();
      this.sourceSnapshots.clear();
      this.contentGeneration += 1;
      this.totalVertices = 0;
      this.needsUint32 = false;
      this.format = null;
      this.lastDevice = null;
      for (const geometry of this.materializedGeometries) lifetime.geometries.add(geometry);
      this.materializedGeometries.clear();
      this.materialized = null;
      this.materializedBounds = undefined;
      for (const retired of [...this.retiredLifetimes]) {
        try { this.releaseLifetime(retired); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, "BatchedGeometryPool disposal failed");
    } finally {
      this.disposalActive = false;
    }
  }
}

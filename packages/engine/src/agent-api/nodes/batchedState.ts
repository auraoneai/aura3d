// L5 leaf split (cyclic-init guard) — same pattern as `environmentSourcesState.ts`.
//
// `BatchedMeshState` and its registry must stay OUT of `batched.ts`'s import
// subtree: `instances.ts` → `instancedMesh.ts` sit inside `builder.ts`'s own
// module-eval path (`builder → physics → primitives → instances`), so any
// eval-time dependency they take on `builder.ts` (e.g. `class X extends
// AuraNodeBuilder`) is a `Cannot access 'AuraNodeBuilder' before
// initialization` crash in the packed dist. This module imports only
// `@aura3d/rendering`, `./types.js` types and `../colorUtils.js` — all
// acyclic. The two pieces that need cyclic modules (geometry resolution via
// `compiler/primitives.ts`, node-instance seeding via `sceneMath.ts`) are
// injected by `batched.ts` at module eval; `instancedMesh.ts` registers its
// factory the same way.

import { BatchedGeometryPool, DrawDataTexture, Geometry } from "@aura3d/rendering";
import type { Bounds3, PackedGeometryEntry } from "@aura3d/rendering";
import type { AuraBatchedNode, AuraBuiltinPrimitive, AuraColor, AuraMaterialSpec, AuraPrimitiveNode } from "./types.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

export type AuraBatchedGeometryInput = Geometry | AuraBuiltinPrimitive | AuraCustomGeometrySpec;

export type AuraBatchedMeshMode = "auto" | "multi-draw" | "loop" | "instanced";

let nextBatchedId = 1;

/** Allocate the fallback state id for authored (non-builder) batched nodes. */
export function allocBatchedStateId(): string {
  return `batched-${nextBatchedId++}`;
}

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Shared identity row — also used by the batched emit path for the node-model slot. */
export const batchedIdentityMatrix = IDENTITY_MATRIX;

/* ------------------------------------------------------------------ */
/* Injected cyclic dependencies                                        */
/* ------------------------------------------------------------------ */

/**
 * `Geometry` inputs pass through untouched; builtin-primitive names and
 * `AuraCustomGeometrySpec`s need `createProductionPrimitiveGeometry` from
 * `compiler/primitives.ts`, which sits inside the import cycle this leaf
 * exists to break — so the resolver is registered by `batched.ts` (and
 * `instancedMesh.ts`) at module eval instead of imported here.
 */
export type BatchedGeometryResolver = (input: AuraBatchedGeometryInput) => Geometry;

let batchedGeometryResolver: BatchedGeometryResolver | undefined;

export function registerBatchedGeometryResolver(fn: BatchedGeometryResolver): void {
  batchedGeometryResolver = fn;
}

function resolveBatchedGeometry(input: AuraBatchedGeometryInput): Geometry {
  if (input instanceof Geometry) return input;
  if (batchedGeometryResolver === undefined) {
    throw new Error("aura3d: batched geometry resolver not registered — import the engine entry before building batched/instanced nodes.");
  }
  return batchedGeometryResolver(input);
}

/**
 * Seeding `node.instances` into a materialized state needs `createModelMatrix`
 * (`sceneMath.ts` → `nodes/scene` → builder subtree — cyclic). `batched.ts`
 * registers the real seeder; authored nodes with no `instances` never need it.
 */
export type BatchedNodeSeeder = (node: AuraBatchedNode, state: BatchedMeshState) => void;

let batchedNodeSeeder: BatchedNodeSeeder | undefined;

export function registerBatchedNodeSeeder(fn: BatchedNodeSeeder): void {
  batchedNodeSeeder = fn;
}

/**
 * `setColorAt` accepts authored `AuraColor`s — `colorToRgba` lives in
 * `colorUtils.ts`, which reaches `GameRuntime`/compiler modules (cyclic).
 * Same injection pattern as the geometry resolver above.
 */
export type BatchedColorConverter = (color: AuraColor) => readonly [number, number, number, number];

let batchedColorConverter: BatchedColorConverter | undefined;

export function registerBatchedColorConverter(fn: BatchedColorConverter): void {
  batchedColorConverter = fn;
}

/**
 * `instances.mesh` delegates to `instancedMesh()` without `instances.ts`
 * statically importing `instancedMesh.ts` (that edge is what closed the
 * builder→physics→primitives→instances→instancedMesh→builder cycle).
 */
export type InstancedMeshFactory = (
  geometry: AuraBatchedGeometryInput,
  material: AuraMaterialSpec | undefined,
  count: number
) => import("./instancedMesh.js").AuraInstancedMeshHandle;

let instancedMeshFactoryImpl: InstancedMeshFactory | undefined;

export function registerInstancedMeshFactory(fn: InstancedMeshFactory): void {
  instancedMeshFactoryImpl = fn;
}

export function instancedMeshFactory(): InstancedMeshFactory {
  if (instancedMeshFactoryImpl === undefined) {
    throw new Error("aura3d: instances.mesh unavailable — the instancedMesh module was not loaded; import the engine entry.");
  }
  return instancedMeshFactoryImpl;
}

/* ------------------------------------------------------------------ */
/* Dense instance state                                                */
/* ------------------------------------------------------------------ */

/**
 * The live record behind a `batched.mesh`/`instances.mesh` handle. Retained
 * per `AuraBatchedNode.batchedId` so builder clones (which spread-copy the
 * node) keep pointing at the same store.
 */
export class BatchedMeshState {
  readonly id: string;
  readonly capacity: number;
  /** `instanced` (instances.mesh): all `capacity` slots live at creation; `count` is a draw bound. */
  readonly instanced: boolean;
  readonly mode: AuraBatchedMeshMode;
  readonly maxVertices?: number;
  readonly maxIndices?: number;
  /** Flat mat4s, column-major — exactly the `InstanceBufferLike.setMatrices` layout. */
  readonly matrices: Float32Array;
  /** Flat rgba quads — exactly the `InstanceBufferLike.setColors` layout. */
  readonly colors: Float32Array;
  private readonly geometryIds: Int32Array;
  private readonly alive: Uint8Array;
  private readonly visible: Uint8Array;
  private readonly geometryInputs: AuraBatchedGeometryInput[] = [];
  /** Resolved geometries (parallel to `geometryInputs`); `pool` indexes into it. */
  readonly geometries: Geometry[] = [];
  private liveCount = 0;
  /** Instanced-mesh draw bound (three.js `InstancedMesh.count`); ignored for batched. */
  private instancedCount: number;
  /** Bumped by every write — the handler keys per-frame re-packing on it. */
  version = 0;
  private structureVersion = 0;
  private pool: BatchedGeometryPool | null = null;
  private pooledStructure = -1;
  private pooledGeometry: Geometry | null = null;
  private drawData: DrawDataTexture | null = null;
  private boundsCache: Bounds3 | null = null;
  private materialCache = new WeakMap<object, unknown>();

  constructor(options: {
    readonly id: string;
    readonly capacity: number;
    readonly instanced?: boolean;
    readonly mode?: AuraBatchedMeshMode;
    readonly maxVertices?: number;
    readonly maxIndices?: number;
  }) {
    if (!Number.isInteger(options.capacity) || options.capacity <= 0) {
      throw new RangeError(`batched capacity must be a positive integer, got ${options.capacity}.`);
    }
    this.id = options.id;
    this.capacity = options.capacity;
    this.instanced = options.instanced ?? false;
    this.mode = options.mode ?? "auto";
    this.maxVertices = options.maxVertices;
    this.maxIndices = options.maxIndices;
    this.matrices = new Float32Array(options.capacity * 16);
    this.colors = new Float32Array(options.capacity * 4);
    this.geometryIds = new Int32Array(options.capacity);
    this.alive = new Uint8Array(options.capacity);
    this.visible = new Uint8Array(options.capacity);
    this.instancedCount = this.instanced ? options.capacity : 0;
    for (let i = 0; i < options.capacity; i += 1) {
      this.matrices.set(IDENTITY_MATRIX, i * 16);
      this.colors.set([1, 1, 1, 1], i * 4);
      if (this.instanced) {
        this.alive[i] = 1;
        this.visible[i] = 1;
      }
    }
    if (this.instanced) this.liveCount = options.capacity;
  }

  /** Slot count the node draws: `liveCount` for batched, `instancedCount` for instances.mesh. */
  get count(): number {
    return this.instanced ? this.instancedCount : this.liveCount;
  }

  get poolRevision(): number {
    return this.structureVersion;
  }

  get disposed(): boolean {
    return this.alive.length === 0;
  }

  isAlive(index: number): boolean {
    return this.alive[index] === 1;
  }

  isVisible(index: number): boolean {
    return this.alive[index] === 1 && this.visible[index] === 1;
  }

  geometryIdAt(index: number): number {
    return this.geometryIds[index] ?? -1;
  }

  /** Live, visible slot indices in submission order (draw rows in packed mode). */
  liveSlots(): number[] {
    const limit = this.instanced ? this.instancedCount : this.capacity;
    const out: number[] = [];
    for (let i = 0; i < limit; i += 1) {
      if (this.alive[i] === 1 && this.visible[i] === 1) out.push(i);
    }
    return out;
  }

  /* ---- geometry pool ---- */

  addGeometry(input: AuraBatchedGeometryInput): number {
    const geometry = resolveBatchedGeometry(input);
    const vertices = this.geometries.reduce((n, g) => n + g.vertexBuffer.vertexCount, 0);
    const indices = this.geometries.reduce((n, g) => n + (g.indexBuffer?.count ?? 0), 0);
    if (this.maxVertices !== undefined && vertices + geometry.vertexBuffer.vertexCount > this.maxVertices) {
      throw new RangeError(`batched.mesh "${this.id}": adding geometry would exceed maxVertices ${this.maxVertices}.`);
    }
    if (this.maxIndices !== undefined && indices + (geometry.indexBuffer?.count ?? 0) > this.maxIndices) {
      throw new RangeError(`batched.mesh "${this.id}": adding geometry would exceed maxIndices ${this.maxIndices}.`);
    }
    this.geometryInputs.push(input);
    this.geometries.push(geometry);
    this.structureVersion += 1;
    this.boundsCache = null;
    this.version += 1;
    return this.geometries.length - 1;
  }

  /* ---- instance ops ---- */

  private requireSlot(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.capacity) {
      throw new RangeError(`instance index ${index} out of capacity ${this.capacity}.`);
    }
  }

  addInstance(geometryId: number): number {
    if (this.instanced) throw new RangeError("instances.mesh allocates all slots at creation; use setMatrixAt.");
    if (geometryId < 0 || geometryId >= this.geometries.length) {
      throw new RangeError(`geometryId ${geometryId} is not a registered batched geometry.`);
    }
    let slot = -1;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.alive[i] === 0) { slot = i; break; }
    }
    if (slot === -1) {
      throw new RangeError(`batched.mesh "${this.id}" is at maxInstances ${this.capacity}.`);
    }
    this.alive[slot] = 1;
    this.visible[slot] = 1;
    this.geometryIds[slot] = geometryId;
    this.matrices.set(IDENTITY_MATRIX, slot * 16);
    this.colors.set([1, 1, 1, 1], slot * 4);
    this.liveCount += 1;
    this.version += 1;
    this.boundsCache = null;
    return slot;
  }

  deleteInstance(index: number): void {
    this.requireSlot(index);
    if (this.alive[index] === 1) {
      this.alive[index] = 0;
      this.liveCount -= 1;
      this.version += 1;
      this.boundsCache = null;
    }
  }

  setMatrixAt(index: number, matrix: Float32Array | readonly number[] | { readonly elements: ArrayLike<number> }): void {
    this.requireSlot(index);
    const src = "elements" in (matrix as { elements?: unknown }) ? (matrix as { elements: ArrayLike<number> }).elements : matrix as ArrayLike<number>;
    if (src.length < 16) throw new RangeError(`setMatrixAt expects 16 floats, got ${src.length}.`);
    for (let i = 0; i < 16; i += 1) this.matrices[index * 16 + i] = Number(src[i]);
    if (this.alive[index] === 0) { this.alive[index] = 1; this.visible[index] = 1; this.liveCount += 1; }
    this.version += 1;
    this.boundsCache = null;
  }

  getMatrixAt(index: number, out?: Float32Array | number[]): Float32Array | number[] {
    this.requireSlot(index);
    const target = out ?? new Float32Array(16);
    for (let i = 0; i < 16; i += 1) target[i] = this.matrices[index * 16 + i]!;
    return target;
  }

  setColorAt(index: number, color: AuraColor | readonly number[]): void {
    this.requireSlot(index);
    const rgba = Array.isArray(color)
      ? ([color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1] as const)
      : batchedColorConverter === undefined
        ? (() => { throw new Error("aura3d: batched color converter not registered — import the engine entry before setting authored colors."); })()
        : batchedColorConverter(color as AuraColor);
    this.colors.set(rgba, index * 4);
    this.version += 1;
  }

  getColorAt(index: number, out?: number[]): number[] {
    this.requireSlot(index);
    const target = out ?? [0, 0, 0, 0];
    for (let i = 0; i < 4; i += 1) target[i] = this.colors[index * 4 + i]!;
    return target;
  }

  setVisibleAt(index: number, visible: boolean): void {
    this.requireSlot(index);
    this.visible[index] = visible ? 1 : 0;
    this.version += 1;
  }

  /** three.js `InstancedMesh.count` setter — clamps the instanced draw bound. */
  setCount(count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`count ${count} exceeds capacity ${this.capacity}.`);
    }
    this.instancedCount = count;
    this.version += 1;
    this.boundsCache = null;
  }

  /**
   * L5-01 dense write — the `setInstanceTransforms` C-37 seam for batched /
   * instanced-mesh nodes. Contiguous copy into the same flat arrays the
   * renderer uploads through `InstanceBufferLike.setMatrices/setColors` — no
   * matrix→spec decomposition. `colors` is rgb triples (C-37 contract).
   */
  writeInstanceMatrices(matrices: Float32Array, count: number, colors?: Float32Array): void {
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`INSTANCE_CAPACITY_EXCEEDED: count ${count} exceeds capacity ${this.capacity} (or is not a valid count).`);
    }
    if (matrices.length < 16 * count) {
      throw new RangeError(`setInstanceTransforms expects matrices.length >= ${16 * count}, got ${matrices.length}.`);
    }
    if (colors !== undefined && colors.length < 3 * count) {
      throw new RangeError(`setInstanceTransforms expects colors.length >= ${3 * count}, got ${colors.length}.`);
    }
    this.matrices.set(matrices.subarray(0, count * 16), 0);
    for (let i = 0; i < count; i += 1) {
      if (this.alive[i] === 0) { this.alive[i] = 1; this.visible[i] = 1; this.liveCount += 1; }
    }
    if (colors !== undefined) {
      for (let i = 0; i < count; i += 1) {
        this.colors[i * 4] = colors[i * 3]!;
        this.colors[i * 4 + 1] = colors[i * 3 + 1]!;
        this.colors[i * 4 + 2] = colors[i * 3 + 2]!;
      }
    }
    // Capacity survives a small count (matches C-37 stub semantics): slots
    // past `count` hide instead of dropping — instanced meshes flag them
    // invisible (slots stay allocated), batched pools free them.
    for (let i = count; i < this.capacity; i += 1) {
      if (this.alive[i] === 1) {
        if (this.instanced) {
          this.visible[i] = 0;
        } else {
          this.alive[i] = 0;
          this.liveCount -= 1;
        }
      }
    }
    this.version += 1;
    this.boundsCache = null;
  }

  /* ---- packed resources (multi-draw route) ---- */

  /** Shared vertex/index arenas for all registered geometries; rebuilt on structure change. */
  packedPool(): BatchedGeometryPool {
    if (this.pool === null || this.pooledStructure !== this.structureVersion) {
      this.pool?.dispose();
      this.pool = new BatchedGeometryPool();
      for (const geometry of this.geometries) this.pool.pack(geometry);
      this.pooledStructure = this.structureVersion;
      this.pooledGeometry = null;
    }
    return this.pool;
  }

  /** The single `Geometry` view over the packed arenas (per-instance slices via drawRange). */
  packedGeometry(): { geometry: Geometry; entries: readonly PackedGeometryEntry[] } {
    const pool = this.packedPool();
    if (this.pooledGeometry === null) {
      this.pooledGeometry = pool.asGeometry(this.boundingBox());
    }
    const entries = this.geometries.map((g) => pool.entryFor(g)!);
    return { geometry: this.pooledGeometry, entries };
  }

  /** Per-node draw-data texture (one row per draw). */
  packedDrawData(): DrawDataTexture {
    if (this.drawData === null) this.drawData = new DrawDataTexture(Math.max(1, this.capacity));
    return this.drawData;
  }

  /** Cache a material per spec object so every update does not reallocate. */
  materialFor<T>(spec: object, build: () => T): T {
    let material = this.materialCache.get(spec) as T | undefined;
    if (material === undefined) {
      material = build();
      this.materialCache.set(spec, material);
    }
    return material;
  }

  /**
   * Union of per-geometry bounds transformed by each live instance matrix —
   * the conservative whole-mesh bound used for pooled-geometry culling and
   * `computeBoundingSphere`.
   */
  boundingBox(): Bounds3 {
    if (this.boundsCache) return this.boundsCache;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const slots = this.liveSlots();
    for (const slot of slots) {
      const geometry = this.geometries[this.geometryIds[slot] ?? 0];
      if (!geometry) continue;
      const m = this.matrices;
      const o = slot * 16;
      const { min: gMin, max: gMax } = geometry.bounds;
      for (let cx = 0; cx < 8; cx += 1) {
        const x = (cx & 1) ? gMax[0] : gMin[0];
        const y = (cx & 2) ? gMax[1] : gMin[1];
        const z = (cx & 4) ? gMax[2] : gMin[2];
        const wx = m[o]! * x + m[o + 4]! * y + m[o + 8]! * z + m[o + 12]!;
        const wy = m[o + 1]! * x + m[o + 5]! * y + m[o + 9]! * z + m[o + 13]!;
        const wz = m[o + 2]! * x + m[o + 6]! * y + m[o + 10]! * z + m[o + 14]!;
        if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
        if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
        if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
      }
    }
    if (!slots.length || !Number.isFinite(min[0])) {
      this.boundsCache = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
    } else {
      this.boundsCache = { min, max };
    }
    return this.boundsCache;
  }

  dispose(): void {
    this.pool?.dispose();
    this.pool = null;
    this.pooledGeometry = null;
    this.drawData?.dispose();
    this.drawData = null;
  }
}

/* ---- state registry ---- */

const batchedStates = new Map<string, BatchedMeshState>();

export function batchedStateFor(id: string | undefined): BatchedMeshState | undefined {
  return id === undefined ? undefined : batchedStates.get(id);
}

export function registerBatchedState(state: BatchedMeshState): void {
  batchedStates.set(state.id, state);
}

/** Node → state resolution: `batchedId` wins, else `runtime.id`, else materialize from authored fields. */
export function batchedStateForNode(node: AuraBatchedNode): BatchedMeshState {
  const id = node.batchedId ?? node.runtime?.id;
  const existing = batchedStateFor(id);
  if (existing) return existing;
  // Authored (non-builder) batched node: materialize a state from the node's
  // declarative fields so the kind still renders through the same path.
  const state = new BatchedMeshState({
    id: id ?? allocBatchedStateId(),
    capacity: node.maxInstances,
    ...(node.maxVertices !== undefined ? { maxVertices: node.maxVertices } : {}),
    ...(node.maxIndices !== undefined ? { maxIndices: node.maxIndices } : {}),
    ...(node.multiDraw !== undefined ? { mode: node.multiDraw } : {})
  });
  for (const input of node.geometries ?? []) state.addGeometry(input);
  if (!state.geometries.length) state.addGeometry("box");
  if (node.instances?.length) {
    if (batchedNodeSeeder === undefined) {
      throw new Error("aura3d: batched node seeder not registered — import the engine entry before compiling authored batched nodes.");
    }
    batchedNodeSeeder(node, state);
  }
  registerBatchedState(state);
  return state;
}

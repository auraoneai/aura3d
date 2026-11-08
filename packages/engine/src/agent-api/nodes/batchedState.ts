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

import { BatchedGeometryPool, DrawDataTexture, Geometry, PackedLoopProducerState, registerPackedLoopProducerSnapshot } from "@aura3d/rendering";
import type { Bounds3, PackedGeometryEntry } from "@aura3d/rendering";
import type { AuraBatchedNode, AuraBuiltinPrimitive, AuraColor, AuraMaterialSpec, AuraPrimitiveNode } from "./types.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

export type AuraBatchedGeometryInput = Geometry | AuraBuiltinPrimitive | AuraCustomGeometrySpec;

export type AuraBatchedMeshMode = "auto" | "multi-draw" | "loop" | "instanced";

/** 5.4: plain-data copy of a `BatchedMeshState` sent to a render worker (see `BatchedMeshState.toWorkerSnapshot`). */
export interface BatchedMeshStateSnapshot {
  readonly kind: "aura-worker-batched-state";
  readonly id: string;
  readonly capacity: number;
  readonly instanced: boolean;
  readonly mode: AuraBatchedMeshMode;
  readonly maxVertices?: number;
  readonly maxIndices?: number;
  readonly geometries: readonly (AuraBuiltinPrimitive | AuraCustomGeometrySpec)[];
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
  readonly geometryIds: Int32Array;
  readonly alive: Uint8Array;
  readonly visible: Uint8Array;
  readonly count: number;
}

/**
 * Member identity has two layers (5.0 contract, BatchedMesh parity):
 * - A numeric target is the dense public instance index returned by
 *   `addInstance`. `deleteInstance` frees it and a later `addInstance` may
 *   return the same index for a new member.
 * - The lifetime ID carried by a query hit (`batchMemberId`) or captured loop
 *   member (`batchMemberLifetimeId`) is scoped to this batch state and is
 *   never reused, so a hit or reference object passed back to a mutation is
 *   rejected once the member it named has been deleted, even if its index
 *   was recycled. Object references also carry state identity, so they can be
 *   checked against a replacement state with the same batch ID.
 */
export interface AuraBatchedMemberReference {
  readonly batchId?: string;
  readonly batchMemberId?: string | number;
  /** Query-time slot, or the slot captured by a reference created from one. */
  readonly batchMemberSlot?: number;
  /** Compatibility alias for the member's lifetime identity. */
  readonly batchMemberLifetimeId?: number;
  /** Opaque state identity carried by query hits; identity does not survive serialization. */
  readonly batchStateToken?: object;
  /** Packed-loop members identify their captured lifetime by this owner-specific key. */
  readonly temporalObjectKey?: object;
}

export type AuraBatchedMemberTarget = string | number | AuraBatchedMemberReference;

export type BatchedLoopNodeMetadata = Pick<AuraBatchedNode, "renderOrder" | "frustumCulled" | "layers" | "userData"> & {
  readonly castShadow?: boolean;
};

/** CPU inputs captured for one logical member; this record does not authorize a packed draw. */
export interface BatchedLoopMemberSnapshot {
  readonly batchId: string;
  readonly stateVersion: number;
  readonly nodeId?: string;
  /** Public instance index returned by addInstance (reusable after deleteInstance). */
  readonly batchMemberId: number;
  /** Dense storage slot; equal to the public instance index. */
  readonly batchMemberSlot: number;
  /** Never-reused lifetime identity, matching the query hit `batchMemberId`. */
  readonly batchMemberLifetimeId: number;
  /** Stable for this mount and live slot lifetime; replaced on slot reuse. */
  readonly temporalObjectKey: object;
  readonly geometryId: number;
  /** Dense, frame-local order; distinct from the slot and lifetime ID. */
  readonly drawIndex: number;
  readonly sourceGeometry: Geometry;
  readonly sourceRange: { readonly start: number; readonly count: number };
  /** The authored range is kept separately from its effective clamped range. */
  readonly sourceDrawRange: { readonly start: number; readonly count: number } | undefined;
  readonly sourceBounds: Bounds3;
  readonly worldBounds: Bounds3;
  readonly localMatrix: readonly number[];
  readonly modelMatrix: readonly number[];
  readonly color: readonly [number, number, number, number];
  readonly castShadow: boolean;
  readonly renderOrder?: number;
  readonly frustumCulled?: boolean;
  readonly layerMask?: number;
  /** Retains the authored node's userData identity. */
  readonly userData?: Record<string, unknown>;
  readonly topology: Geometry["topology"];
  readonly streams: readonly { readonly slot: number; readonly buffer: Geometry["vertexBuffer"]; readonly revision: number }[];
  readonly indexBuffer: Geometry["indexBuffer"];
  readonly indexRevision?: number;
}

function copyLoopBounds(bounds: Bounds3): Bounds3 {
  return Object.freeze({
    min: Object.freeze([bounds.min[0], bounds.min[1], bounds.min[2]] as const),
    max: Object.freeze([bounds.max[0], bounds.max[1], bounds.max[2]] as const)
  });
}

function loopWorldBounds(bounds: Bounds3, model: readonly number[]): Bounds3 {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner += 1) {
    const x = corner & 1 ? bounds.max[0] : bounds.min[0];
    const y = corner & 2 ? bounds.max[1] : bounds.min[1];
    const z = corner & 4 ? bounds.max[2] : bounds.min[2];
    for (let axis = 0; axis < 3; axis += 1) {
      const value = model[axis]! * x + model[axis + 4]! * y + model[axis + 8]! * z + model[axis + 12]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return copyLoopBounds({ min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] });
}

function loopSourceRange(geometry: Geometry, range: Geometry["drawRange"]): { readonly start: number; readonly count: number } {
  const available = geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount;
  if (range && (!Number.isSafeInteger(range.start) || range.start < 0 ||
      !(range.count === Infinity || (Number.isSafeInteger(range.count) && range.count >= 0)))) {
    throw new RangeError("BATCH_LOOP_DRAW_RANGE_INVALID: source drawRange must contain non-negative integer values.");
  }
  const start = Math.min(available, range?.start ?? 0);
  const end = Math.min(available, start + (range?.count ?? available));
  return Object.freeze({ start, count: end - start });
}

let nextBatchedId = 1;

// A registry ID can be rebound to a different state. Keep its issued ID
// ranges so a stale numeric ID cannot address a successor with the same ID.
const nextMemberIdByBatch = new Map<string, number>();

function reserveMemberIds(batchId: string, count: number): number {
  const start = nextMemberIdByBatch.get(batchId) ?? 0;
  const last = start + count - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(last)) {
    throw new RangeError("BATCH_MEMBER_ID_EXHAUSTED: no safe member identities remain.");
  }
  nextMemberIdByBatch.set(batchId, last + 1);
  return start;
}

/** Allocate a batch ID that has not already belonged to an authored or registered state. */
export function allocBatchedStateId(): string {
  let id: string;
  do {
    id = `batched-${nextBatchedId++}`;
  } while (nextMemberIdByBatch.has(id));
  return id;
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
  /** Distinguishes replacement states that happen to share the same registry ID. */
  readonly memberReferenceToken: object = Object.freeze({});
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
  private readonly slotLifetimes: Array<object | undefined>;
  // A state's first lifetime IDs occupy a reserved range; the first state
  // for an ID remains compatible with its initial slot numbers.
  private readonly slotEverAllocated: Uint8Array;
  private readonly queryMemberIds: Array<number | undefined>;
  private readonly queryMemberSlots = new Map<number, number>();
  private readonly loopMemberIds = new WeakMap<object, number>();
  private readonly firstQueryMemberId: number;
  private readonly defaultLoopOwner = {};
  private readonly loopProducer: PackedLoopProducerState;
  private readonly geometryInputs: AuraBatchedGeometryInput[] = [];
  /** Resolved geometries (parallel to `geometryInputs`); `pool` indexes into it. */
  readonly geometries: Geometry[] = [];
  private liveCount = 0;
  /** Instanced-mesh draw bound (three.js `InstancedMesh.count`); ignored for batched. */
  private instancedCount: number;
  /** Bumped by every write, including asynchronous material changes. */
  get version(): number { return this.loopProducer.version; }
  set version(version: number) { this.loopProducer.setVersion(version); }
  private structureVersion = 0;
  private pool: BatchedGeometryPool | null = null;
  private pooledStructure = -1;
  private pooledGeometry: Geometry | null = null;
  private drawData: DrawDataTexture | null = null;
  private boundsCache: Bounds3 | null = null;
  private materialCache = new WeakMap<object, unknown>();
  private isDisposed = false;
  /** Textured-material upgrade owned by this state (see batched.ts `batchedTexturedMaterial`). */
  textureUpgrade: unknown = undefined;
  private readonly disposers: Array<() => void> = [];

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
    this.loopProducer = new PackedLoopProducerState(this.id, options.capacity, this.geometries, options.capacity);
    this.matrices = this.loopProducer.matrices;
    this.colors = this.loopProducer.colors;
    this.geometryIds = this.loopProducer.geometryIds;
    this.alive = this.loopProducer.alive;
    this.visible = this.loopProducer.visible;
    this.slotLifetimes = this.loopProducer.slotLifetimes;
    this.slotEverAllocated = new Uint8Array(options.capacity);
    this.queryMemberIds = new Array(options.capacity);
    this.firstQueryMemberId = reserveMemberIds(this.id, options.capacity);
    this.instancedCount = this.instanced ? options.capacity : 0;
    for (let i = 0; i < options.capacity; i += 1) {
      this.matrices.set(IDENTITY_MATRIX, i * 16);
      this.colors.set([1, 1, 1, 1], i * 4);
      if (this.instanced) {
        this.alive[i] = 1;
        this.visible[i] = 1;
        this.slotLifetimes[i] = Object.freeze({});
        this.allocateQueryMemberId(i);
      }
    }
    if (this.instanced) this.liveCount = options.capacity;
  }

  /**
   * 5.4 worker transfer: a plain-data copy of this state (geometry inputs, slot liveness, matrices, colours, visibility),
   * so a render worker can rebuild the same instances. `undefined` when a geometry input is a live `Geometry` (GPU-side
   * buffers do not cross realms) or the state is disposed.
   */
  toWorkerSnapshot(): BatchedMeshStateSnapshot | undefined {
    if (this.isDisposed || this.geometryInputs.some((input) => input instanceof Geometry)) return undefined;
    return {
      kind: "aura-worker-batched-state", id: this.id, capacity: this.capacity, instanced: this.instanced, mode: this.mode,
      ...(this.maxVertices !== undefined ? { maxVertices: this.maxVertices } : {}),
      ...(this.maxIndices !== undefined ? { maxIndices: this.maxIndices } : {}),
      geometries: this.geometryInputs.map((input) => (typeof input === "string" ? input : structuredClone(input))) as (AuraBuiltinPrimitive | AuraCustomGeometrySpec)[],
      matrices: this.matrices.slice(), colors: this.colors.slice(), geometryIds: this.geometryIds.slice(),
      alive: this.alive.slice(), visible: this.visible.slice(), count: this.count
    };
  }

  /** Rebuilds a state from {@link toWorkerSnapshot} (same id, slots, matrices, colours and visibility). */
  static fromWorkerSnapshot(snapshot: BatchedMeshStateSnapshot): BatchedMeshState {
    const state = new BatchedMeshState({
      id: snapshot.id, capacity: snapshot.capacity, instanced: snapshot.instanced, mode: snapshot.mode,
      ...(snapshot.maxVertices !== undefined ? { maxVertices: snapshot.maxVertices } : {}),
      ...(snapshot.maxIndices !== undefined ? { maxIndices: snapshot.maxIndices } : {})
    });
    try {
      for (const input of snapshot.geometries) state.addGeometry(input);
      if (!snapshot.instanced) {
        // Slots are allocated lowest-free first: fill up to the last live slot, then free the gaps.
        let last = -1;
        for (let slot = 0; slot < snapshot.capacity; slot += 1) if (snapshot.alive[slot] === 1) last = slot;
        for (let slot = 0; slot <= last; slot += 1) state.addInstance(snapshot.alive[slot] === 1 ? snapshot.geometryIds[slot]! : 0);
        for (let slot = 0; slot <= last; slot += 1) if (snapshot.alive[slot] !== 1) state.deleteInstance(slot);
      } else {
        state.setCount(snapshot.count);
      }
      state.matrices.set(snapshot.matrices.subarray(0, state.matrices.length));
      state.colors.set(snapshot.colors.subarray(0, state.colors.length));
      for (let slot = 0; slot < snapshot.capacity; slot += 1) {
        if (state.alive[slot] === 1 && snapshot.visible[slot] !== 1) state.setVisibleAt(slot, false);
      }
      state.version += 1;
      state.boundsCache = null;
    } catch (error) {
      state.dispose();
      throw error;
    }
    return state;
  }

  /** Slot count the node draws: `liveCount` for batched, `instancedCount` for instances.mesh. */
  get count(): number {
    return this.instanced ? this.instancedCount : this.liveCount;
  }

  get poolRevision(): number {
    return this.structureVersion;
  }

  get disposed(): boolean {
    return this.isDisposed;
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

  /** Identity of the current member lifetime, independent of packed draw order. */
  queryMemberIdAt(index: number): number | undefined {
    return this.alive[index] === 1 ? this.queryMemberIds[index] : undefined;
  }

  /** Capture a live slot as a state- and lifetime-bound mutation target. */
  getMemberReferenceAt(index: number): {
    readonly batchId: string;
    readonly batchMemberId: number;
    readonly batchStateToken: object;
    readonly batchMemberSlot: number;
  } | undefined {
    if (this.instanced || this.slotLifetimes[index] === undefined) return undefined;
    const batchMemberId = this.queryMemberIdAt(index);
    return batchMemberId === undefined ? undefined : Object.freeze({
      batchId: this.id,
      batchMemberId,
      batchStateToken: this.memberReferenceToken,
      batchMemberSlot: index
    });
  }

  /** Resolve a query lifetime ID to its currently live slot, including hidden members. */
  getSlotForMemberId(memberId: string | number | undefined): number | undefined {
    if (this.isDisposed || typeof memberId !== "number") return undefined;
    const slot = this.queryMemberSlots.get(memberId);
    return slot !== undefined && this.alive[slot] === 1 && this.queryMemberIds[slot] === memberId ? slot : undefined;
  }

  /** Recover the captured query identity from packed-loop temporal metadata. */
  getMemberIdForLoopKey(key: object | undefined): number | undefined {
    return key === undefined ? undefined : this.loopMemberIds.get(key);
  }

  private allocateQueryMemberId(index: number): void {
    let memberId: number;
    if (this.slotEverAllocated[index] === 0) {
      this.slotEverAllocated[index] = 1;
      memberId = this.firstQueryMemberId + index;
    } else {
      memberId = reserveMemberIds(this.id, 1);
    }
    this.queryMemberIds[index] = memberId;
    this.queryMemberSlots.set(memberId, index);
  }

  private releaseQueryMemberId(index: number): void {
    const memberId = this.queryMemberIds[index];
    if (memberId !== undefined) this.queryMemberSlots.delete(memberId);
    this.queryMemberIds[index] = undefined;
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

  /**
   * Capture the logical inputs of a future synchronous loop before sorting,
   * callbacks or pool selection. Geometries remain borrowed and mutable;
   * consumers must check the recorded buffers, revisions, range and bounds
   * and retain the chosen packed generation before using a packed slice. The
   * state version is only an invalidation hint: the dense arrays are writable,
   * so consumers also need to compare the captured member values.
   */
  captureLoopMembers(nodeWorld: ArrayLike<number>, nodeId?: string, node?: BatchedLoopNodeMetadata, mountOwner: object = this.defaultLoopOwner,
    readLiveNodeWorld?: () => ArrayLike<number> | undefined): readonly BatchedLoopMemberSnapshot[] {
    if (nodeWorld.length < 16) throw new RangeError("A batched loop node matrix requires 16 values.");
    const nodeMatrix = Array.from({ length: 16 }, (_, index) => nodeWorld[index]!);
    if (!nodeMatrix.every(Number.isFinite)) throw new RangeError("BATCH_LOOP_TRANSFORM_NONFINITE: node matrix must be finite.");
    const nodeMetadata = {
      castShadow: node?.castShadow ?? true,
      ...(node?.renderOrder === undefined ? {} : { renderOrder: node.renderOrder }),
      ...(node?.frustumCulled === undefined ? {} : { frustumCulled: node.frustumCulled }),
      ...(node?.layers === undefined ? {} : { layerMask: node.layers }),
      ...(node?.userData === undefined ? {} : { userData: node.userData })
    };
    const stateVersion = this.version;
    const members: BatchedLoopMemberSnapshot[] = [];
    for (const slot of this.liveSlots()) {
      const geometryId = this.geometryIdAt(slot);
      const geometry = this.geometries[geometryId];
      if (!geometry) continue;
      const lifetime = this.slotLifetimes[slot];
      const batchMemberLifetimeId = this.queryMemberIdAt(slot);
      if (!lifetime || batchMemberLifetimeId === undefined) throw new Error("BATCH_LOOP_STATE_CHANGED: live member has no lifetime identity.");
      const temporalObjectKey = this.loopProducer.temporalKey(slot, mountOwner);
      const model = new Float32Array(16);
      const offset = slot * 16;
      const localMatrix = Object.freeze(Array.from(this.matrices.subarray(offset, offset + 16)));
      if (!localMatrix.every(Number.isFinite)) throw new RangeError("BATCH_LOOP_TRANSFORM_NONFINITE: member matrix must be finite.");
      for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
          model[column * 4 + row] = nodeMatrix[row]! * localMatrix[column * 4]!
            + nodeMatrix[row + 4]! * localMatrix[column * 4 + 1]!
            + nodeMatrix[row + 8]! * localMatrix[column * 4 + 2]!
            + nodeMatrix[row + 12]! * localMatrix[column * 4 + 3]!;
        }
      }
      const modelMatrix = Object.freeze(Array.from(model));
      if (!modelMatrix.every(Number.isFinite)) throw new RangeError("BATCH_LOOP_TRANSFORM_NONFINITE: composed member matrix must be finite in float32.");
      const sourceBounds = copyLoopBounds(geometry.bounds);
      const authoredRange = geometry.drawRange;
      const sourceDrawRange = authoredRange === undefined ? undefined : Object.freeze({ start: authoredRange.start, count: authoredRange.count });
      const sourceRange = loopSourceRange(geometry, sourceDrawRange);
      if (![...sourceBounds.min, ...sourceBounds.max].every(Number.isFinite)) throw new RangeError("BATCH_LOOP_BOUNDS_NONFINITE: source bounds must be finite.");
      const colorOffset = slot * 4;
      const color = Object.freeze([this.colors[colorOffset]!, this.colors[colorOffset + 1]!, this.colors[colorOffset + 2]!, this.colors[colorOffset + 3]!] as const);
      if (!color.every(Number.isFinite)) throw new RangeError("BATCH_LOOP_COLOR_NONFINITE: member color must be finite.");
      const streams = Object.freeze(geometry.vertexBuffer.format.streams.map(({ slot: streamSlot }) => {
        const buffer = geometry.getVertexBuffer(streamSlot);
        return Object.freeze({ slot: streamSlot, buffer, revision: buffer.revision });
      }));
      const indexBuffer = geometry.indexBuffer;
      const worldBounds = loopWorldBounds(sourceBounds, modelMatrix);
      if (![...worldBounds.min, ...worldBounds.max].every(Number.isFinite)) throw new RangeError("BATCH_LOOP_BOUNDS_NONFINITE: world bounds must be finite.");
      members.push(Object.freeze({
        batchId: this.id,
        stateVersion,
        ...(nodeId === undefined ? {} : { nodeId }),
        batchMemberId: slot,
        batchMemberSlot: slot,
        batchMemberLifetimeId,
        temporalObjectKey,
        geometryId,
        drawIndex: members.length,
        sourceGeometry: geometry,
        sourceRange,
        sourceDrawRange,
        sourceBounds,
        worldBounds,
        localMatrix,
        modelMatrix,
        color,
        ...nodeMetadata,
        topology: geometry.topology,
        streams,
        indexBuffer,
        ...(indexBuffer ? { indexRevision: indexBuffer.revision } : {})
      }));
    }
    const stateChanged = (): boolean => {
      const currentSlots = this.liveSlots().filter((slot) => this.geometries[this.geometryIdAt(slot)] !== undefined);
      return this.version !== stateVersion || currentSlots.length !== members.length || members.some((member, index) => {
        const slot = member.batchMemberSlot;
        return currentSlots[index] !== slot || this.geometryIdAt(slot) !== member.geometryId || this.geometries[member.geometryId] !== member.sourceGeometry
          || this.queryMemberIdAt(slot) !== member.batchMemberLifetimeId || this.slotLifetimes[slot] === undefined
          || this.loopProducer.temporalKey(slot, mountOwner) !== member.temporalObjectKey
          || member.localMatrix.some((value, element) => !Object.is(value, this.matrices[slot * 16 + element]))
          || member.color.some((value, element) => !Object.is(value, this.colors[slot * 4 + element]));
      });
    };
    if (stateChanged()) throw new Error("BATCH_LOOP_STATE_CHANGED: batch state changed during member capture.");
    for (const member of members) {
      const geometry = member.sourceGeometry;
      const sourceStreams = [...geometry.vertexBuffer.format.streams];
      const buffers = sourceStreams.map((stream) => geometry.getVertexBuffer(stream.slot));
      const currentDrawRange = geometry.drawRange;
      const range = loopSourceRange(geometry, currentDrawRange);
      if (geometry.topology !== member.topology || geometry.indexBuffer !== member.indexBuffer
        || geometry.indexBuffer?.revision !== member.indexRevision || range.start !== member.sourceRange.start || range.count !== member.sourceRange.count
        || (currentDrawRange === undefined) !== (member.sourceDrawRange === undefined)
        || (currentDrawRange !== undefined && member.sourceDrawRange !== undefined &&
          (!Object.is(currentDrawRange.start, member.sourceDrawRange.start) || !Object.is(currentDrawRange.count, member.sourceDrawRange.count)))
        || geometry.bounds.min.some((value, axis) => !Object.is(value, member.sourceBounds.min[axis]))
        || geometry.bounds.max.some((value, axis) => !Object.is(value, member.sourceBounds.max[axis]))
        || sourceStreams.length !== member.streams.length || geometry.vertexBuffer.format.streams.length !== member.streams.length || sourceStreams.some((stream, index) => {
          const captured = member.streams[index];
          const buffer = buffers[index];
          return !captured || stream.slot !== captured.slot || geometry.vertexBuffer.format.streams[index]?.slot !== captured.slot
            || buffer !== captured.buffer || buffer.revision !== captured.revision;
        })) throw new Error("BATCH_LOOP_SOURCE_CHANGED: source geometry changed during member capture.");
    }
    if (stateChanged()) throw new Error("BATCH_LOOP_STATE_CHANGED: batch state changed during member capture.");
    for (const member of members) {
      registerPackedLoopProducerSnapshot(this.loopProducer, member, mountOwner, nodeWorld, nodeMatrix, readLiveNodeWorld);
      this.loopMemberIds.set(member.temporalObjectKey, member.batchMemberLifetimeId);
    }
    return Object.freeze(members);
  }

  /* ---- geometry pool ---- */

  addGeometry(input: AuraBatchedGeometryInput): number {
    this.assertLive();
    const geometry = resolveBatchedGeometry(input);
    const vertices = this.geometries.reduce((n, g) => n + g.vertexBuffer.vertexCount, 0);
    const indices = this.geometries.reduce((n, g) => n + (g.indexBuffer?.count ?? 0), 0);
    if (this.maxVertices !== undefined && vertices + geometry.vertexBuffer.vertexCount > this.maxVertices) {
      if (!(input instanceof Geometry)) geometry.dispose();
      throw new RangeError(`batched.mesh "${this.id}": adding geometry would exceed maxVertices ${this.maxVertices}.`);
    }
    if (this.maxIndices !== undefined && indices + (geometry.indexBuffer?.count ?? 0) > this.maxIndices) {
      if (!(input instanceof Geometry)) geometry.dispose();
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

  private requireSlot(index: AuraBatchedMemberTarget): number {
    this.assertLive();
    if (typeof index === "number" || typeof index === "string") {
      if (this.instanced) {
        if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < this.capacity) return index;
        throw new RangeError(`instance index ${index} out of capacity ${this.capacity}.`);
      }
      // Numeric targets are the public instance index returned by addInstance.
      if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < this.capacity &&
          this.alive[index] === 1 && this.slotLifetimes[index] !== undefined) return index;
      throw new RangeError(`BATCH_MEMBER_ID_NOT_LIVE: member index ${String(index)} is not live in this batch.`);
    }
    if (this.instanced || index === null || typeof index !== "object") {
      throw new RangeError("BATCH_MEMBER_ID_INVALID: member reference does not belong to this batch.");
    }
    // Read caller-provided fields before resolving the live slot: accessors can
    // themselves mutate the batch. Neither an unscoped ID nor a recycled slot
    // can establish which state or member lifetime was originally captured.
    const { batchId, batchMemberId, batchMemberSlot, batchMemberLifetimeId, batchStateToken, temporalObjectKey } = index;
    if ((batchId !== undefined && batchId !== this.id) ||
        (batchStateToken !== undefined && batchStateToken !== this.memberReferenceToken) ||
        (batchStateToken === undefined && temporalObjectKey === undefined)) {
      throw new RangeError("BATCH_MEMBER_ID_INVALID: member reference does not belong to this batch.");
    }
    const loopMemberId = temporalObjectKey === undefined ? undefined : this.getMemberIdForLoopKey(temporalObjectKey);
    if (temporalObjectKey !== undefined && loopMemberId === undefined) {
      throw new RangeError("BATCH_MEMBER_ID_INVALID: loop member does not belong to this batch.");
    }
    // Query hits name the lifetime in batchMemberId; loop members carry it in
    // batchMemberLifetimeId (or their temporal key) and use batchMemberId for
    // the public instance index. Either way the lifetime decides liveness.
    const slotKeyed = temporalObjectKey !== undefined || batchMemberLifetimeId !== undefined;
    const memberId = loopMemberId ?? batchMemberLifetimeId ?? batchMemberId;
    if (typeof memberId !== "number" ||
        (batchMemberLifetimeId !== undefined && batchMemberLifetimeId !== memberId) ||
        (!slotKeyed && batchMemberId !== undefined && batchMemberId !== memberId)) {
      throw new RangeError("BATCH_MEMBER_ID_INVALID: inconsistent member reference.");
    }
    const slot = this.getSlotForMemberId(memberId);
    if (slot === undefined || this.slotLifetimes[slot] === undefined) {
      throw new RangeError("BATCH_MEMBER_ID_NOT_LIVE: member reference is no longer live.");
    }
    if ((batchMemberSlot !== undefined && batchMemberSlot !== slot) ||
        (slotKeyed && batchMemberId !== undefined && batchMemberId !== slot)) {
      throw new RangeError("BATCH_MEMBER_ID_INVALID: inconsistent member reference.");
    }
    return slot;
  }

  private assertMemberStillLive(index: number, lifetime: object): void {
    if (this.isDisposed || this.alive[index] !== 1 || this.slotLifetimes[index] !== lifetime) {
      throw new RangeError("BATCH_MEMBER_ID_NOT_LIVE: member reference is no longer live.");
    }
  }

  addInstance(geometryId: number): number {
    this.assertLive();
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
    this.allocateQueryMemberId(slot);
    this.alive[slot] = 1;
    this.visible[slot] = 1;
    this.slotLifetimes[slot] = Object.freeze({});
    this.geometryIds[slot] = geometryId;
    this.matrices.set(IDENTITY_MATRIX, slot * 16);
    this.colors.set([1, 1, 1, 1], slot * 4);
    this.liveCount += 1;
    this.version += 1;
    this.boundsCache = null;
    return slot;
  }

  deleteInstance(target: AuraBatchedMemberTarget): void {
    const index = this.requireSlot(target);
    // Instanced meshes have fixed index identities; visibility/count can hide
    // them, but deleting and recreating one would recycle its public index.
    if (this.instanced) throw new RangeError("instances.mesh has fixed slots; use setVisibleAt or setCount.");
    if (this.alive[index] === 1) {
      this.alive[index] = 0;
      this.slotLifetimes[index] = undefined;
      this.releaseQueryMemberId(index);
      this.liveCount -= 1;
      this.version += 1;
      this.boundsCache = null;
    }
  }

  setMatrixAt(target: AuraBatchedMemberTarget, matrix: Float32Array | readonly number[] | { readonly elements: ArrayLike<number> }): void {
    const index = this.requireSlot(target);
    const lifetime = this.instanced ? undefined : this.slotLifetimes[index];
    const src = "elements" in (matrix as { elements?: unknown }) ? (matrix as { elements: ArrayLike<number> }).elements : matrix as ArrayLike<number>;
    if (src.length < 16) throw new RangeError(`setMatrixAt expects 16 floats, got ${src.length}.`);
    if (lifetime === undefined) {
      for (let i = 0; i < 16; i += 1) this.matrices[index * 16 + i] = Number(src[i]);
    } else {
      const values = Array.from({ length: 16 }, (_, i) => Number(src[i]));
      this.assertMemberStillLive(index, lifetime);
      this.matrices.set(values, index * 16);
    }
    if (this.alive[index] === 0) { this.allocateQueryMemberId(index); this.alive[index] = 1; this.visible[index] = 1; this.slotLifetimes[index] = Object.freeze({}); this.liveCount += 1; }
    this.version += 1;
    this.boundsCache = null;
  }

  getMatrixAt(reference: AuraBatchedMemberTarget, out?: Float32Array | number[]): Float32Array | number[] {
    const index = this.requireSlot(reference);
    const lifetime = this.instanced ? undefined : this.slotLifetimes[index];
    const target = out ?? new Float32Array(16);
    if (lifetime === undefined) {
      for (let i = 0; i < 16; i += 1) target[i] = this.matrices[index * 16 + i]!;
      return target;
    }
    const values = this.matrices.slice(index * 16, index * 16 + 16);
    for (let i = 0; i < 16; i += 1) target[i] = values[i]!;
    this.assertMemberStillLive(index, lifetime);
    return target;
  }

  setColorAt(target: AuraBatchedMemberTarget, color: AuraColor | readonly number[]): void {
    const index = this.requireSlot(target);
    const lifetime = this.instanced ? undefined : this.slotLifetimes[index];
    const rgba = Array.isArray(color)
      ? ([color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1] as const)
      : batchedColorConverter === undefined
        ? (() => { throw new Error("aura3d: batched color converter not registered — import the engine entry before setting authored colors."); })()
        : batchedColorConverter(color as AuraColor);
    if (lifetime === undefined) {
      this.colors.set(rgba, index * 4);
    } else {
      const values = new Float32Array(4);
      values.set(rgba);
      this.assertMemberStillLive(index, lifetime);
      this.colors.set(values, index * 4);
    }
    this.version += 1;
  }

  getColorAt(reference: AuraBatchedMemberTarget, out?: number[]): number[] {
    const index = this.requireSlot(reference);
    const lifetime = this.instanced ? undefined : this.slotLifetimes[index];
    const target = out ?? [0, 0, 0, 0];
    if (lifetime === undefined) {
      for (let i = 0; i < 4; i += 1) target[i] = this.colors[index * 4 + i]!;
      return target;
    }
    const values = this.colors.slice(index * 4, index * 4 + 4);
    for (let i = 0; i < 4; i += 1) target[i] = values[i]!;
    this.assertMemberStillLive(index, lifetime);
    return target;
  }

  setVisibleAt(target: AuraBatchedMemberTarget, visible: boolean): void {
    const index = this.requireSlot(target);
    this.visible[index] = visible ? 1 : 0;
    this.version += 1;
    this.boundsCache = null;
  }

  /** three.js `InstancedMesh.count` setter — clamps the instanced draw bound. */
  setCount(count: number): void {
    this.assertLive();
    if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
      throw new RangeError(`count ${count} exceeds capacity ${this.capacity}.`);
    }
    this.instancedCount = count;
    if (this.instanced) this.loopProducer.setDrawLimit(count);
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
    this.assertLive();
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
      if (this.alive[i] === 0) { this.allocateQueryMemberId(i); this.alive[i] = 1; this.visible[i] = 1; this.slotLifetimes[i] = Object.freeze({}); this.liveCount += 1; }
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
          this.slotLifetimes[i] = undefined;
          this.releaseQueryMemberId(i);
          this.liveCount -= 1;
        }
      }
    }
    this.version += 1;
    this.boundsCache = null;
  }

  /* ---- packed resources (multi-draw route) ---- */

  /** Shared arenas for registered geometries; source byte changes require a new generation. */
  packedPool(): BatchedGeometryPool {
    this.assertLive();
    if (this.pool === null || this.pooledStructure !== this.structureVersion || this.geometries.some((geometry) => !this.pool!.sourceMatchesPacked(geometry))) {
      const next = new BatchedGeometryPool();
      const structure = this.structureVersion;
      const sources = [...this.geometries];
      try {
        for (const geometry of sources) next.pack(geometry);
        if (this.isDisposed || this.structureVersion !== structure || this.geometries.length !== sources.length
          || sources.some((geometry, index) => this.geometries[index] !== geometry || !next.sourceMatchesPacked(geometry))) {
          throw new Error("BATCH_LOOP_SOURCE_CHANGED: source geometry changed while building the packed pool.");
        }
      } catch (error) {
        try { next.dispose(); } catch { /* preserve the build failure */ }
        throw error;
      }
      const previous = this.pool;
      this.pool = next;
      this.pooledStructure = structure;
      this.pooledGeometry = null;
      // Leases keep an older materialization alive until backend completion.
      previous?.dispose();
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
    this.assertLive();
    if (this.drawData === null) this.drawData = new DrawDataTexture(Math.max(1, this.capacity));
    return this.drawData;
  }

  /** Cache a material per spec object so every update does not reallocate. */
  materialFor<T>(spec: object, build: () => T): T {
    this.assertLive();
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

  /** Register cleanup that runs once on `dispose()` (decoded textures, textured materials). */
  addDisposer(fn: () => void): void {
    this.assertLive();
    this.disposers.push(fn);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.alive.fill(0);
    this.visible.fill(0);
    this.slotLifetimes.fill(undefined);
    this.queryMemberIds.fill(undefined);
    this.queryMemberSlots.clear();
    this.liveCount = 0;
    this.instancedCount = 0;
    this.loopProducer.retire();
    this.boundsCache = null;
    this.version += 1;
    retireBatchedState(this);
    this.pool?.dispose();
    this.pool = null;
    this.pooledGeometry = null;
    this.drawData?.dispose();
    this.drawData = null;
    for (const fn of this.disposers.splice(0)) fn();
    for (let i = 0; i < this.geometryInputs.length; i += 1) {
      // Geometry passed in by the caller is borrowed; generated geometry is owned.
      if (!(this.geometryInputs[i] instanceof Geometry)) this.geometries[i]?.dispose();
    }
    this.geometryInputs.length = 0;
    this.geometries.length = 0;
    this.materialCache = new WeakMap();
    this.textureUpgrade = undefined;
  }

  private assertLive(): void {
    if (this.isDisposed) throw new Error(`batched.mesh "${this.id}" is disposed.`);
  }
}

/* ---- state registry ---- */

const batchedStates = new Map<string, BatchedMeshState>();
// Authored nodes without an ID still need one stable state across query and
// compile calls, but should not be retained by the string-keyed registry.
const anonymousBatchedStates = new WeakMap<AuraBatchedNode, BatchedMeshState>();
// A disposed builder's node can outlive its state. Retain only its ID so that
// the compiler cannot materialize a new, live batch from that stale node.
const disposedBatchedIds = new Set<string>();
let emptyDisposedState: BatchedMeshState | undefined;

function retireBatchedState(state: BatchedMeshState): void {
  if (batchedStates.get(state.id) !== state) return;
  batchedStates.delete(state.id);
  disposedBatchedIds.add(state.id);
}

function disposedState(): BatchedMeshState {
  if (!emptyDisposedState) {
    emptyDisposedState = new BatchedMeshState({ id: "<disposed>", capacity: 1 });
    emptyDisposedState.dispose();
  }
  return emptyDisposedState;
}

export function batchedStateFor(id: string | undefined): BatchedMeshState | undefined {
  return id === undefined ? undefined : batchedStates.get(id);
}

export function registerBatchedState(state: BatchedMeshState): void {
  if (state.disposed) throw new Error(`batched.mesh "${state.id}" is disposed.`);
  disposedBatchedIds.delete(state.id);
  batchedStates.set(state.id, state);
}

/** Node → state resolution: `batchedId` wins, else `runtime.id`, else materialize from authored fields. */
export function batchedStateForNode(node: AuraBatchedNode): BatchedMeshState {
  const id = node.batchedId ?? node.runtime?.id;
  const existing = id === undefined ? anonymousBatchedStates.get(node) : batchedStateFor(id);
  if (existing) return existing;
  if (id !== undefined && disposedBatchedIds.has(id)) return disposedState();
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
  if (id === undefined) anonymousBatchedStates.set(node, state);
  else registerBatchedState(state);
  return state;
}

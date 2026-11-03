import type { RenderItem } from "../contracts/renderItem";
import type { Bounds3, Geometry } from "../Geometry";
import type { IndexBuffer } from "../IndexBuffer";
import type { VertexBuffer } from "../VertexBuffer";
import type { RenderDevice } from "../RenderDevice";
import type { BatchedGeometryPool, PackedGeometryLease } from "./BatchedGeometryPool";
import { DrawDataTexture, isDrawDataTexture } from "./DrawDataTexture";

// Identity-based provenance is private to this module. An entry only records
// how to recover logical items; its presence never attests that batching or a
// particular device is safe.
const membersByBatch = new WeakMap<RenderItem, readonly RenderItem[]>();
const enginePackedBatchItems = new WeakSet<object>();
const engineBatchInstanceItems = new WeakSet<object>();
const packedLoopMembers = new WeakMap<object, PackedLoopMember>();
// Projection can encounter a logical item before its carrier. Keep a private
// lineage so both transfers can share that projected packet without accepting
// an unrelated item's provenance.
const packedLoopOrigins = new WeakMap<PackedLoopMember, PackedLoopMember>();
// A requested route is provenance only. It never authorizes a physical draw;
// the renderer must independently validate the producer, pass, device and
// resource lifetime at the actual submission point.
const combinedDrawIntentOrigins = new WeakSet<PackedLoopMember>();

/** The dense storage belongs to the producer; these values alone never authorize a draw. */
export interface PackedLoopProducerSnapshot {
  readonly batchId: string;
  readonly stateVersion: number;
  /** Member lifetime identity; older producers may also use this as their slot. */
  readonly batchMemberId: number;
  /** Dense storage slot when different from the member identity. */
  readonly batchMemberSlot?: number;
  readonly temporalObjectKey: object;
  readonly geometryId: number;
  readonly drawIndex: number;
  readonly sourceGeometry: Geometry;
  readonly sourceRange: { readonly start: number; readonly count: number };
  readonly sourceDrawRange: { readonly start: number; readonly count: number } | undefined;
  readonly sourceBounds: Bounds3;
  readonly worldBounds: Bounds3;
  readonly topology: Geometry["topology"];
  readonly streams: readonly { readonly slot: number; readonly buffer: VertexBuffer; readonly revision: number }[];
  readonly indexBuffer: IndexBuffer | null;
  readonly indexRevision?: number;
  readonly localMatrix: readonly number[];
  readonly modelMatrix: readonly number[];
  readonly color: readonly [number, number, number, number];
  readonly castShadow: boolean;
  readonly renderOrder?: number;
  readonly frustumCulled?: boolean;
  readonly layerMask?: number;
  readonly userData?: Record<string, unknown>;
}

interface ProducerRecord {
  readonly id: string;
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
  readonly geometryIds: Int32Array;
  readonly alive: Uint8Array;
  readonly visible: Uint8Array;
  readonly slotLifetimes: Array<object | undefined>;
  readonly geometries: readonly Geometry[];
  readonly temporalKeysByOwner: WeakMap<object, WeakMap<object, object>>;
  version: number;
  mutationEpoch: number;
  limit: number;
  disposed: boolean;
}

interface ProducerSnapshotRecord {
  readonly producer: ProducerRecord;
  readonly owner: object;
  readonly lifetime: object;
  readonly mutationEpoch: number;
  readonly nodeWorld: ArrayLike<number>;
  readonly capturedNodeWorld: readonly number[];
  /** Reading live placement may only invalidate this record; it cannot authorize a draw. */
  readonly readLiveNodeWorld: (() => ArrayLike<number> | undefined) | undefined;
}

const producerRecords = new WeakMap<PackedLoopProducerState, ProducerRecord>();
const producerSnapshots = new WeakMap<PackedLoopProducerSnapshot, ProducerSnapshotRecord>();
const producerByPacket = new WeakMap<PackedLoopMember, PackedLoopProducerSnapshot>();

/**
 * Storage shared with BatchedMeshState. Currentness reads these actual arrays,
 * not a predicate supplied by a caller. The record is provenance, not a
 * certificate that a backend, callbacks, material or runtime node are safe.
 */
export class PackedLoopProducerState {
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
  readonly geometryIds: Int32Array;
  readonly alive: Uint8Array;
  readonly visible: Uint8Array;
  readonly slotLifetimes: Array<object | undefined>;

  constructor(id: string, capacity: number, geometries: readonly Geometry[], limit: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0 || !Number.isSafeInteger(limit) || limit < 0 || limit > capacity) {
      throw new RangeError("Invalid packed loop producer capacity or draw limit");
    }
    this.matrices = new Float32Array(capacity * 16);
    this.colors = new Float32Array(capacity * 4);
    this.geometryIds = new Int32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.visible = new Uint8Array(capacity);
    this.slotLifetimes = Array.from({ length: capacity });
    producerRecords.set(this, { id, matrices: this.matrices, colors: this.colors, geometryIds: this.geometryIds,
      alive: this.alive, visible: this.visible, slotLifetimes: this.slotLifetimes, geometries,
      temporalKeysByOwner: new WeakMap(), version: 0, mutationEpoch: 0, limit, disposed: false });
  }

  get drawLimit(): number { return producerRecords.get(this)!.limit; }
  get version(): number { return producerRecords.get(this)!.version; }

  setVersion(version: number): void {
    const record = producerRecords.get(this)!;
    record.version = version;
    // Never rely on the caller-visible version remaining monotonic: a later
    // write that restores an old version must still invalidate old captures.
    record.mutationEpoch += 1;
  }

  setDrawLimit(limit: number): void {
    const record = producerRecords.get(this)!;
    if (record.disposed || !Number.isSafeInteger(limit) || limit < 0 || limit > record.alive.length) {
      throw new RangeError("Invalid packed loop producer draw limit");
    }
    record.limit = limit;
  }

  temporalKey(slot: number, owner: object): object {
    const record = producerRecords.get(this)!;
    const lifetime = record.slotLifetimes[slot];
    if (record.disposed || !lifetime || record.alive[slot] !== 1) throw new Error("Packed loop member is not live");
    return producerTemporalKey(record, owner, lifetime);
  }

  retire(): void {
    const record = producerRecords.get(this)!;
    record.disposed = true;
    record.limit = 0;
  }
}

function producerTemporalKey(record: ProducerRecord, owner: object, lifetime: object): object {
  let keys = record.temporalKeysByOwner.get(owner);
  if (!keys) { keys = new WeakMap(); record.temporalKeysByOwner.set(owner, keys); }
  let key = keys.get(lifetime);
  if (!key) { key = Object.freeze({}); keys.set(lifetime, key); }
  return key;
}

function sameNumbers(actual: ArrayLike<number> | undefined, expected: ArrayLike<number>): boolean {
  if (actual === undefined || actual.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) if (!Object.is(actual[index], expected[index])) return false;
  return true;
}

function producerSnapshotCurrent(snapshot: PackedLoopProducerSnapshot, checkLiveWorld = true): boolean {
  const binding = producerSnapshots.get(snapshot);
  if (!binding) return false;
  const { producer, owner, lifetime, mutationEpoch, nodeWorld, capturedNodeWorld, readLiveNodeWorld } = binding;
  const slot = snapshot.batchMemberSlot ?? snapshot.batchMemberId;
  try {
    if (checkLiveWorld && readLiveNodeWorld) {
      const current = readLiveNodeWorld();
      if (!current || current.length < 16 || capturedNodeWorld.some((value, index) => !Object.is(value, current[index]))) return false;
    }
    if (producer.disposed || producer.id !== snapshot.batchId || producer.mutationEpoch !== mutationEpoch ||
        producer.version !== snapshot.stateVersion || !Number.isSafeInteger(slot) || slot < 0 || slot >= producer.limit ||
        producer.alive[slot] !== 1 || producer.visible[slot] !== 1 || producer.slotLifetimes[slot] !== lifetime ||
        producer.geometryIds[slot] !== snapshot.geometryId || producer.geometries[snapshot.geometryId] !== snapshot.sourceGeometry ||
        producer.temporalKeysByOwner.get(owner)?.get(lifetime) !== snapshot.temporalObjectKey ||
        (checkLiveWorld && (nodeWorld.length < 16 || capturedNodeWorld.some((value, index) => !Object.is(value, nodeWorld[index]))))) return false;
    let drawIndex = 0;
    for (let index = 0; index < slot; index += 1) {
      if (producer.alive[index] === 1 && producer.visible[index] === 1 && producer.geometries[producer.geometryIds[index]!] !== undefined) drawIndex += 1;
    }
    if (drawIndex !== snapshot.drawIndex || snapshot.localMatrix.length !== 16 || snapshot.modelMatrix.length !== 16 || snapshot.color.length !== 4 ||
        !capturedNodeWorld.every(Number.isFinite) || !snapshot.localMatrix.every(Number.isFinite) ||
        !snapshot.modelMatrix.every(Number.isFinite) || !snapshot.color.every(Number.isFinite)) return false;
    const model = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) {
      model[column * 4 + row] = capturedNodeWorld[row]! * snapshot.localMatrix[column * 4]!
        + capturedNodeWorld[row + 4]! * snapshot.localMatrix[column * 4 + 1]!
        + capturedNodeWorld[row + 8]! * snapshot.localMatrix[column * 4 + 2]!
        + capturedNodeWorld[row + 12]! * snapshot.localMatrix[column * 4 + 3]!;
    }
    if (!sameNumbers(model, snapshot.modelMatrix)) return false;
    return snapshot.localMatrix.every((value, index) => Object.is(value, producer.matrices[slot * 16 + index])) &&
      snapshot.color.every((value, index) => Object.is(value, producer.colors[slot * 4 + index]));
  } catch { return false; }
}

/** Bind an engine-created immutable capture to the storage and slot lifetime that produced it. */
export function registerPackedLoopProducerSnapshot(
  producer: PackedLoopProducerState, snapshot: PackedLoopProducerSnapshot,
  owner: object, nodeWorld: ArrayLike<number>, capturedNodeWorld: readonly number[],
  readLiveNodeWorld?: () => ArrayLike<number> | undefined
): void {
  const record = producerRecords.get(producer);
  const lifetime = record?.slotLifetimes[snapshot.batchMemberSlot ?? snapshot.batchMemberId];
  if (!record || !lifetime || producerSnapshots.has(snapshot) || !Object.isFrozen(snapshot) || capturedNodeWorld.length !== 16) {
    throw new Error("Invalid packed loop producer snapshot");
  }
  producerSnapshots.set(snapshot, { producer: record, owner, lifetime, mutationEpoch: record.mutationEpoch, nodeWorld,
    capturedNodeWorld: Object.freeze([...capturedNodeWorld]), readLiveNodeWorld });
  if (!producerSnapshotCurrent(snapshot, false)) {
    producerSnapshots.delete(snapshot);
    throw new Error("Packed loop producer snapshot does not match its live slot and transform");
  }
  // A caller may mutate the supplied world array during capture. The immutable
  // capture is still useful, but currentness must subsequently return false.
}

type LoopRange = { readonly start: number; readonly count: number };

/** A snapshot and fallback route, never a certificate for packed execution. */
export interface PackedLoopMemberInput {
  readonly logicalItem: RenderItem;
  /** Captured by the producer when it constructs the logical item. */
  readonly logicalMaterial: RenderItem["material"];
  readonly batchId: string;
  readonly stateVersion: number;
  readonly nodeId?: string;
  /** Member lifetime identity for engine-produced packets. */
  readonly batchMemberId: number;
  /** Dense storage slot, separate from the member identity. */
  readonly batchMemberSlot?: number;
  readonly temporalObjectKey?: object;
  readonly geometryId: number;
  readonly drawIndex: number;
  readonly sourceGeometry: Geometry;
  readonly sourceRange: LoopRange;
  /** Authored source/override ranges are retained separately for revalidation. */
  readonly sourceDrawRange: LoopRange | undefined;
  readonly itemDrawRange: LoopRange | undefined;
  readonly sourceBounds: Bounds3;
  readonly worldBounds: Bounds3;
  readonly localMatrix: readonly number[];
  readonly modelMatrix: readonly number[];
  readonly color: readonly [number, number, number, number];
  readonly topology: Geometry["topology"];
  readonly streams: readonly { readonly slot: number; readonly buffer: VertexBuffer; readonly revision: number }[];
  readonly indexBuffer: IndexBuffer | null;
  readonly indexRevision?: number;
  readonly pool: BatchedGeometryPool;
  readonly lease: PackedGeometryLease;
  readonly packedRange: LoopRange;
  /** Only a snapshot registered against actual producer storage can be rechecked. */
  readonly producerSnapshot?: PackedLoopProducerSnapshot;
  /** Requested combined route, recorded privately and never itself a capability. */
  readonly combinedDrawIntent?: boolean;
}

export interface PackedLoopMember extends PackedLoopMemberInput {
  readonly packedGeometry: Geometry;
}

function copyLoopRange(range: LoopRange): LoopRange {
  return Object.freeze({ start: range.start, count: range.count });
}

function copyLoopBounds(bounds: Bounds3): Bounds3 {
  return Object.freeze({
    min: Object.freeze([bounds.min[0], bounds.min[1], bounds.min[2]] as const),
    max: Object.freeze([bounds.max[0], bounds.max[1], bounds.max[2]] as const)
  });
}

/** Attach provenance to the logical item and, when distinct, a carrier. */
export function rememberPackedLoopMember(item: RenderItem, input: PackedLoopMemberInput): PackedLoopMember {
  if (packedLoopMembers.has(item) || (item !== input.logicalItem && packedLoopMembers.has(input.logicalItem))) {
    throw new Error("Packed loop member identity is already associated");
  }
  if (input.combinedDrawIntent === true && input.producerSnapshot === undefined) {
    throw new Error("Combined draw intent requires producer provenance");
  }
  const packet: PackedLoopMember = Object.freeze({
    logicalItem: input.logicalItem,
    logicalMaterial: input.logicalMaterial,
    batchId: input.batchId,
    stateVersion: input.stateVersion,
    ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
    batchMemberId: input.batchMemberId,
    ...(input.batchMemberSlot === undefined ? {} : { batchMemberSlot: input.batchMemberSlot }),
    ...(input.temporalObjectKey === undefined ? {} : { temporalObjectKey: input.temporalObjectKey }),
    geometryId: input.geometryId,
    drawIndex: input.drawIndex,
    sourceGeometry: input.sourceGeometry,
    sourceRange: copyLoopRange(input.sourceRange),
    sourceDrawRange: input.sourceDrawRange && copyLoopRange(input.sourceDrawRange),
    itemDrawRange: input.itemDrawRange && copyLoopRange(input.itemDrawRange),
    sourceBounds: copyLoopBounds(input.sourceBounds),
    worldBounds: copyLoopBounds(input.worldBounds),
    localMatrix: Object.freeze([...input.localMatrix]),
    modelMatrix: Object.freeze([...input.modelMatrix]),
    color: Object.freeze([...input.color] as [number, number, number, number]),
    streams: Object.freeze(input.streams.map((stream) => Object.freeze({ ...stream }))),
    topology: input.topology,
    indexBuffer: input.indexBuffer,
    ...(input.indexRevision === undefined ? {} : { indexRevision: input.indexRevision }),
    pool: input.pool,
    lease: input.lease,
    packedRange: copyLoopRange(input.packedRange),
    packedGeometry: input.lease.geometry
  });
  if (input.producerSnapshot !== undefined) {
    if (!producerSnapshots.has(input.producerSnapshot)) throw new Error("Packed loop producer snapshot is not registered");
    producerByPacket.set(packet, input.producerSnapshot);
  }
  packedLoopOrigins.set(packet, packet);
  if (input.combinedDrawIntent === true) combinedDrawIntentOrigins.add(packet);
  if (item !== input.logicalItem) rememberBatchMembers(item, [input.logicalItem]);
  packedLoopMembers.set(item, packet);
  packedLoopMembers.set(input.logicalItem, packet);
  return packet;
}

/** Identity-only lookup: unknown objects and proxies are never inspected. */
export function packedLoopMemberFor(value: unknown): PackedLoopMember | undefined {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
  return packedLoopMembers.get(value);
}

/** Identity-only route intent; this does not attest currentness or execution safety. */
export function hasCombinedDrawIntent(value: unknown): boolean {
  const packet = packedLoopMemberFor(value);
  return packet !== undefined && combinedDrawIntentOrigins.has(packedLoopOrigins.get(packet) ?? packet);
}

function sameRange(actual: LoopRange | undefined, expected: LoopRange | undefined): boolean {
  return actual === undefined ? expected === undefined : expected !== undefined &&
    Object.is(actual.start, expected.start) && Object.is(actual.count, expected.count);
}

function sameBounds(actual: Bounds3, expected: Bounds3): boolean {
  return sameNumbers(actual.min, expected.min) && sameNumbers(actual.max, expected.max);
}

/**
 * Partial callback-time invalidation check, not permission to issue a packed
 * draw. This reads mutable objects and must only run at the logical draw point
 * after an independent callback/provenance proof. Engine member state and
 * device/native resource agreement need their own validation.
 */
export function packedLoopMemberResourcesMatch(value: unknown): boolean {
  const packet = packedLoopMemberFor(value);
  if (!packet) return false;
  try {
    const source = packet.sourceGeometry;
    const logical = packet.logicalItem;
    if (!packet.pool.sourceMatchesPacked(source) || !packet.pool.packedGeometryMatches(packet.lease) ||
        logical.geometry !== source || logical.material !== packet.logicalMaterial ||
        !sameRange(source.drawRange, packet.sourceDrawRange) || !sameRange(logical.drawRange, packet.itemDrawRange) ||
        source.topology !== packet.topology || source.indexBuffer !== packet.indexBuffer ||
        source.indexBuffer?.revision !== packet.indexRevision ||
        [0, 1, 2].some((axis) => !Object.is(source.bounds.min[axis], packet.sourceBounds.min[axis]) ||
          !Object.is(source.bounds.max[axis], packet.sourceBounds.max[axis]))) return false;
    const matrix = logical.modelMatrix;
    if (!matrix || matrix.length < 16 || packet.modelMatrix.length !== 16 ||
        packet.modelMatrix.some((value, index) => !Object.is(value, matrix[index]))) return false;
    const streams = source.vertexBuffer.format.streams;
    if (streams.length !== packet.streams.length || streams.some((stream, index) => {
      const captured = packet.streams[index];
      return !captured || stream.slot !== captured.slot || source.getVertexBuffer(stream.slot) !== captured.buffer ||
        captured.buffer.revision !== captured.revision;
    })) return false;
    const packedRange = packet.pool.translateSourceRange(source, packet.sourceRange);
    return sameRange(packedRange, packet.packedRange);
  } catch {
    return false;
  }
}

/**
 * Check this packet against the producer's live dense storage and resource
 * generation. This is a currentness check, not permission to draw: callers
 * must separately validate runtime-node placement, callbacks, material,
 * render-pass semantics and native resource ownership at the draw point.
 */
export function packedLoopProducerMemberCurrent(value: unknown): boolean {
  const packet = packedLoopMemberFor(value);
  const snapshot = packet && producerByPacket.get(packet);
  if (!packet || !snapshot || !producerSnapshotCurrent(snapshot)) return false;
  try {
    const logical = packet.logicalItem as RenderItem & { readonly temporalObjectKey?: object };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return packet.batchId === snapshot.batchId && packet.stateVersion === snapshot.stateVersion && packet.batchMemberId === snapshot.batchMemberId &&
      packet.batchMemberSlot === snapshot.batchMemberSlot &&
      packet.geometryId === snapshot.geometryId && packet.drawIndex === snapshot.drawIndex &&
      packet.sourceGeometry === snapshot.sourceGeometry && packet.temporalObjectKey === snapshot.temporalObjectKey &&
      logical.temporalObjectKey === snapshot.temporalObjectKey && logical.castShadow === snapshot.castShadow &&
      logical.renderOrder === snapshot.renderOrder && logical.frustumCulled === snapshot.frustumCulled &&
      logical.layerMask === snapshot.layerMask && logical.userData === snapshot.userData &&
      sameRange(packet.sourceRange, snapshot.sourceRange) && sameRange(packet.sourceDrawRange, snapshot.sourceDrawRange) &&
      sameBounds(packet.sourceBounds, snapshot.sourceBounds) && sameBounds(packet.worldBounds, snapshot.worldBounds) &&
      packet.topology === snapshot.topology && packet.indexBuffer === snapshot.indexBuffer && packet.indexRevision === snapshot.indexRevision &&
      packet.streams.length === snapshot.streams.length && packet.streams.every((stream, index) => {
        const source = snapshot.streams[index];
        return source !== undefined && stream.slot === source.slot && stream.buffer === source.buffer && stream.revision === source.revision;
      }) &&
      sameNumbers(packet.localMatrix, snapshot.localMatrix) && sameNumbers(packet.modelMatrix, snapshot.modelMatrix) &&
      sameNumbers(packet.color, snapshot.color) && sameNumbers(logical.instanceTransforms, identity) &&
      (logical.instanceCount === undefined || logical.instanceCount === 1) &&
      sameNumbers(logical.instanceColors, snapshot.color) && packedLoopMemberResourcesMatch(value);
  } catch { return false; }
}

// A loop still submits every logical draw separately. Only devices made by
// the renderer factory may substitute its packed storage, and only while the
// supported device entry points remain the ones captured at construction.
// This deliberately does not authorize merging draws or bypassing callbacks.
interface LoopDeviceMethods {
  readonly draw: RenderDevice["draw"];
  readonly drawChecked: RenderDevice["drawChecked"];
  readonly createBuffer: RenderDevice["createBuffer"];
  readonly updateBuffer: RenderDevice["updateBuffer"];
  readonly endFrame: RenderDevice["endFrame"];
  readonly wait: RenderDevice["waitForSubmittedWork"];
  readonly onDeviceLost: RenderDevice["onDeviceLost"];
  readonly supportsCompletion?: () => boolean;
}
const loopDevices = new WeakMap<RenderDevice, LoopDeviceMethods>();
const activeLoopFrames = new WeakMap<RenderDevice, PackedLoopFrame>();
// A transferred row texture is single-use, even after retirement. Recreating
// or mutating it while an earlier native submission can sample it is unsafe.
const transferredDrawData = new WeakSet<DrawDataTexture>();
const disposeDrawData = DrawDataTexture.prototype.dispose;

/** Called immediately after the built-in factory creates its device. */
export function registerPackedLoopDevice(device: RenderDevice): void {
  if (device.kind !== "mock" && device.kind !== "webgpu" && device.kind !== "webgl2") return;
  if (device.kind !== "mock" && typeof device.waitForSubmittedWork !== "function") return;
  let supportsCompletion: (() => boolean) | undefined;
  if (device.kind === "webgl2") {
    supportsCompletion = (device as RenderDevice & { readonly supportsSubmittedWorkCompletion?: () => boolean }).supportsSubmittedWorkCompletion;
    try { if (typeof supportsCompletion !== "function" || !supportsCompletion.call(device)) return; } catch { return; }
  }
  if (device.kind === "webgpu") {
    try {
      const native = (device as RenderDevice & { readonly nativeGpuDevice?: { readonly queue?: { readonly onSubmittedWorkDone?: unknown } } }).nativeGpuDevice;
      if (typeof native?.queue?.onSubmittedWorkDone !== "function") return;
    } catch { return; }
  }
  loopDevices.set(device, { draw: device.draw, drawChecked: device.drawChecked, createBuffer: device.createBuffer, updateBuffer: device.updateBuffer,
    endFrame: device.endFrame, wait: device.waitForSubmittedWork, onDeviceLost: device.onDeviceLost,
    ...(supportsCompletion ? { supportsCompletion } : {}) });
}

function loopDeviceMethodsMatch(device: RenderDevice, methods: LoopDeviceMethods): boolean {
  return !device.disposed && !device.contextLost && device.draw === methods.draw && device.drawChecked === methods.drawChecked &&
      device.createBuffer === methods.createBuffer && device.updateBuffer === methods.updateBuffer &&
      device.endFrame === methods.endFrame && device.waitForSubmittedWork === methods.wait && device.onDeviceLost === methods.onDeviceLost &&
      (!methods.supportsCompletion ||
        (device as RenderDevice & { readonly supportsSubmittedWorkCompletion?: () => boolean }).supportsSubmittedWorkCompletion === methods.supportsCompletion);
}

function loopDeviceUnchanged(device: RenderDevice): boolean {
  const methods = loopDevices.get(device);
  if (methods === undefined || !loopDeviceMethodsMatch(device, methods)) return false;
  if (methods.supportsCompletion) {
    try {
      // The capability probe can invoke native hooks that replace a device
      // method. Check the captured methods again before accepting its result.
      return methods.supportsCompletion.call(device) && loopDevices.get(device) === methods && loopDeviceMethodsMatch(device, methods);
    } catch { return false; }
  }
  return true;
}

/** Renderer-owned per-device frame; never exported through the public API. */
export class PackedLoopFrame {
  private readonly retained = new Map<Geometry, PackedGeometryLease>();
  private readonly drawData = new Set<DrawDataTexture>();
  private closed = false;
  private released = false;
  private unsubscribeLoss: (() => void) | undefined;
  private removePending: (() => void) | undefined;

  constructor(private readonly device: RenderDevice, private readonly token: object) {}

  private current(): boolean {
    try {
      if (this.closed || this.released || activeLoopFrames.get(this.device) !== this ||
          this.device.activeFrameToken !== this.token || !loopDeviceUnchanged(this.device)) return false;
      // Completion capability checks may invoke device/native hooks. Those
      // hooks can close the frame, so recheck frame identity afterwards.
      return !this.closed && !this.released && activeLoopFrames.get(this.device) === this &&
        this.device.activeFrameToken === this.token;
    } catch { return false; }
  }

  /**
   * Transfer one fresh row texture to this frame. On success the frame disposes
   * it once at completion/loss/retirement; the caller must not mutate, dispose,
   * or reuse it, including from another frame. This is ownership only, never
   * proof that its bytes or a combined submission are valid.
   */
  retainDrawData(data: DrawDataTexture): boolean {
    if (!isDrawDataTexture(data) || transferredDrawData.has(data) || !this.current() ||
        transferredDrawData.has(data)) return false;
    transferredDrawData.add(data);
    this.drawData.add(data);
    return true;
  }

  /** Ownership/current-frame check only; row and shader validation is separate. */
  ownsDrawData(data: DrawDataTexture): boolean {
    return this.drawData.has(data) && this.current();
  }

  candidate(item: RenderItem): PackedLoopMember | undefined {
    if (!this.current() || !packedLoopProducerMemberCurrent(item)) return undefined;
    const packet = packedLoopMemberFor(item)!;
    if (packet.logicalItem !== item || item.geometry !== packet.sourceGeometry || item.geometry.topology !== "triangles" ||
        item.skinning || item.morphTargets || item.morphWeights || item.shadowGeometry || item.instanceAttributes) return undefined;
    let lease = this.retained.get(packet.packedGeometry);
    if (!lease) {
      try { lease = packet.pool.retainGeneration(); } catch { return undefined; }
      if (lease.geometry !== packet.packedGeometry || lease.generation !== packet.lease.generation || !lease.isCurrent()) {
        lease.release();
        return undefined;
      }
      this.retained.set(packet.packedGeometry, lease);
    }
    return lease.isCurrent() && packedLoopProducerMemberCurrent(item) ? packet : undefined;
  }

  /** Stop choosing packed storage and keep its generation until completion. */
  finish(onPending: (release: () => void) => () => void): void {
    if (this.closed) return;
    this.closed = true;
    if (activeLoopFrames.get(this.device) === this) activeLoopFrames.delete(this.device);
    if ((!this.retained.size && !this.drawData.size) || this.device.kind === "mock" || this.device.contextLost || this.device.disposed) { this.release(); return; }
    const release = (): void => this.release();
    const removePending = onPending(release);
    if (this.released) { removePending(); return; }
    this.removePending = removePending;
    const unsubscribeLoss = this.device.onDeviceLost?.(release);
    if (this.released) { unsubscribeLoss?.(); return; }
    this.unsubscribeLoss = unsubscribeLoss;
    const methods = loopDevices.get(this.device);
    const failed = (): void => {
      // A rejection cannot prove completion. Retain this generation, and use
      // logical draws in subsequent frames until a new device is created.
      if (methods && loopDevices.get(this.device) === methods) loopDevices.delete(this.device);
      if (this.device.contextLost) release();
    };
    try {
      const completion = methods?.wait?.call(this.device);
      if (completion) void completion.then(release, failed).catch(() => undefined);
      else failed();
    } catch { failed(); }
    // A failed/unavailable fence proves no completion. Keep the lease until
    // device loss or renderer disposal, which retires the native buffers.
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    const failures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
    cleanup(() => this.unsubscribeLoss?.());
    this.unsubscribeLoss = undefined;
    cleanup(() => this.removePending?.());
    this.removePending = undefined;
    for (const lease of this.retained.values()) cleanup(() => lease.release());
    this.retained.clear();
    for (const data of this.drawData) cleanup(() => disposeDrawData.call(data));
    this.drawData.clear();
    if (failures.length) throw new AggregateError(failures, "Packed loop frame cleanup failed");
  }
}

export function beginPackedLoopFrame(device: RenderDevice): PackedLoopFrame | undefined {
  // A custom device is a normal fallback, not an object to probe. In
  // particular, its optional frame-token property may be an accessor.
  if (!loopDevices.has(device)) return undefined;
  const token = device.activeFrameToken;
  if (!token || activeLoopFrames.has(device) || !loopDeviceUnchanged(device) ||
      device.activeFrameToken !== token || activeLoopFrames.has(device)) return undefined;
  const frame = new PackedLoopFrame(device, token);
  activeLoopFrames.set(device, frame);
  return frame;
}

/** Rechecked immediately before upload and again before each submission. */
export function packedLoopCandidate(device: RenderDevice, item: RenderItem): PackedLoopMember | undefined {
  return activeLoopFrames.get(device)?.candidate(item);
}

/** Transfer a fresh row texture to the current renderer frame, or retain caller ownership on false. */
export function retainPackedLoopDrawData(device: RenderDevice, data: DrawDataTexture): boolean {
  return activeLoopFrames.get(device)?.retainDrawData(data) ?? false;
}

/** Check active frame ownership immediately before submission; this is not draw admission. */
export function packedLoopDrawDataCurrent(device: RenderDevice, data: DrawDataTexture): boolean {
  return activeLoopFrames.get(device)?.ownsDrawData(data) ?? false;
}

/** Carry provenance across projection/clipping without modifying the original item. */
export function transferPackedLoopMember(source: unknown, target: RenderItem, projectedLogical?: RenderItem): boolean {
  const packet = packedLoopMemberFor(source);
  if (!packet) return false;
  const logicalItem = projectedLogical ?? (source === packet.logicalItem ? target : packet.logicalItem);
  const projectedPacket = logicalItem !== packet.logicalItem ? packedLoopMembers.get(logicalItem) : undefined;
  if (packedLoopMembers.has(target) || (projectedPacket && packedLoopOrigins.get(projectedPacket) !== packedLoopOrigins.get(packet))) {
    throw new Error("Packed loop member target is already associated");
  }
  const transferred = logicalItem === packet.logicalItem ? packet
    : projectedPacket ?? Object.freeze({ ...packet, logicalItem });
  if (transferred !== packet && !projectedPacket) {
    const snapshot = producerByPacket.get(packet);
    if (snapshot) producerByPacket.set(transferred, snapshot);
  }
  if (target !== logicalItem) rememberBatchMembers(target, [logicalItem]);
  if (!projectedPacket && transferred !== packet) packedLoopOrigins.set(transferred, packedLoopOrigins.get(packet)!);
  packedLoopMembers.set(target, transferred);
  if (logicalItem !== packet.logicalItem) packedLoopMembers.set(logicalItem, transferred);
  return true;
}

/**
 * Create a plain packed-item carrier with a producer identity. This brand says
 * only that this factory created the carrier: it does not validate or freeze
 * its fields, nested resources, row contents, or submission behavior.
 */
export function createEnginePackedBatchItem<T extends RenderItem>(fields: T): T {
  const item = { ...fields };
  enginePackedBatchItems.add(item);
  return item;
}

/** Test carrier identity without inspecting its properties or prototype. */
export function isEnginePackedBatchItem(value: unknown): boolean {
  return (typeof value === "object" && value !== null || typeof value === "function")
    && enginePackedBatchItems.has(value);
}

/** Create an origin-marked batched-mesh instance bucket, without attesting safety. */
export function createEngineBatchInstanceItem<T extends RenderItem>(fields: T): T {
  const item = { ...fields };
  engineBatchInstanceItems.add(item);
  return item;
}

/** Identify a factory-created batch bucket without inspecting its fields. */
export function isEngineBatchInstanceItem(value: unknown): boolean {
  return (typeof value === "object" && value !== null || typeof value === "function")
    && engineBatchInstanceItems.has(value);
}

/** Associate a synthesized item with its ordered, original logical members. */
export function rememberBatchMembers(batch: RenderItem, members: readonly RenderItem[]): readonly RenderItem[] {
  const flattened: RenderItem[] = [];
  for (const member of members) {
    const nested = membersByBatch.get(member);
    if (nested) {
      for (const child of nested) flattened.push(child);
    } else {
      flattened.push(member);
    }
  }
  if (flattened.length === 0 || flattened.includes(batch)) {
    throw new Error("A batch must have nonempty, nonrecursive logical members");
  }
  const previous = membersByBatch.get(batch);
  if (previous) {
    if (previous.length !== flattened.length || previous.some((item, index) => item !== flattened[index])) {
      throw new Error("Batch logical members cannot be replaced");
    }
    return previous;
  }
  const recorded = Object.freeze(flattened);
  membersByBatch.set(batch, recorded);
  return recorded;
}

/** Read fallback provenance without inspecting the item or any user metadata. */
export function batchMembersFor(item: RenderItem): readonly RenderItem[] | undefined {
  return membersByBatch.get(item);
}

/** Carry provenance across an engine-created projection or item snapshot. */
export function transferBatchMembers(
  source: RenderItem,
  target: RenderItem,
  project?: (item: RenderItem) => RenderItem
): boolean {
  const members = membersByBatch.get(source);
  if (!members) return false;
  rememberBatchMembers(target, project ? members.map(project) : members);
  return true;
}

/**
 * Recover original members in input order. Call before pass sorting: sorting
 * already-merged draws can place them differently from their logical members.
 */
export function expandLogicalBatchItems(items: readonly RenderItem[]): readonly RenderItem[] {
  if (!items.some((item) => membersByBatch.has(item))) return items;
  const expanded: RenderItem[] = [];
  for (const item of items) {
    const members = membersByBatch.get(item);
    if (members) {
      for (const member of members) expanded.push(member);
    } else {
      expanded.push(item);
    }
  }
  return expanded;
}

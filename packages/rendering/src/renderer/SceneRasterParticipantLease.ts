import { IndexBuffer } from "../IndexBuffer";
import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import { VertexBuffer } from "../VertexBuffer";
import type { TemporalFrameId, TemporalIdentity } from "../contracts/velocity";
import { assertSceneRasterSnapshotCurrent, type SceneRasterSnapshot } from "./SceneRasterSnapshot";

/** A forward item and a shadow caster have independent orderings. */
export type SceneRasterParticipantList = "forward" | "shadow";
export type SceneRasterScalar = string | number | boolean;

declare const participantSlotBrand: unique symbol;
export interface SceneRasterParticipantSlot { readonly [participantSlotBrand]: never }

/**
 * A staged comparison packet only. It does not authorize a draw, prove that a
 * caller supplied the actual renderer inputs, or retain GPU/target resources.
 */
export interface SceneRasterParticipantLease {
  readonly staged: true;
  readonly sealed: boolean;
  addParticipant(list: SceneRasterParticipantList, item: object, geometry: object, material: object, shader: object): SceneRasterParticipantSlot;
  addScalar(slot: SceneRasterParticipantSlot, name: string, value: SceneRasterScalar): void;
  addResource(slot: SceneRasterParticipantSlot, name: string, value: object | null): void;
  addVector(slot: SceneRasterParticipantSlot, name: string, value: Float32Array): void;
  addBuffer(slot: SceneRasterParticipantSlot, name: string, value: VertexBuffer | IndexBuffer): void;
  seal(): void;
  /** Compare two sealed packets and their currently readable source bytes. */
  matches(other: SceneRasterParticipantLease): boolean;
  dispose(): void;
}

export interface SceneRasterParticipantArena {
  readonly retainedBytes: number;
  readonly participantCount: number;
  readonly fieldCount: number;
  createLease(): SceneRasterParticipantLease;
  dispose(): void;
}

type NamedValue =
  | { readonly kind: "scalar"; readonly name: string; readonly value: SceneRasterScalar }
  | { readonly kind: "resource"; readonly name: string; readonly value: object | null }
  | { readonly kind: "vector"; readonly name: string; readonly bytes: Uint8Array; readonly source: Float32Array }
  | { readonly kind: "buffer"; readonly name: string; readonly bytes: Uint8Array; readonly source: BufferSnapshot };
interface Participant {
  readonly slot: SceneRasterParticipantSlot;
  readonly list: SceneRasterParticipantList;
  readonly item: object;
  readonly geometry: object;
  readonly material: object;
  readonly shader: object;
  readonly fields: NamedValue[];
  readonly names: Set<string>;
}
interface BufferSnapshot {
  readonly source: VertexBuffer | IndexBuffer;
  readonly kind: "vertex" | "index";
  readonly data: ArrayBuffer | Uint16Array | Uint32Array;
  readonly formatOrType: object | string;
  readonly vertexCount?: number;
  readonly bufferSlot?: number;
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}
interface LeaseState {
  readonly arena: ArenaState;
  readonly forward: Participant[];
  readonly shadow: Participant[];
  status: "building" | "sealed" | "disposed";
  bytes: number;
  participants: number;
  fields: number;
}
interface ArenaState {
  readonly snapshot: SceneRasterSnapshot;
  readonly owner: object;
  readonly device: RenderDevice;
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
  /** Identity only: the future renderer/target authorities must attest it. */
  readonly target: object | null;
  readonly temporalPlan: object | null;
  readonly maxBytes: number;
  readonly maxBufferBytes: number;
  readonly maxParticipants: number;
  readonly maxFields: number;
  readonly leases: Set<LeaseState>;
  bytes: number;
  participants: number;
  fields: number;
  disposed: boolean;
  mutating: boolean;
}

const slots = new WeakMap<SceneRasterParticipantSlot, { readonly lease: LeaseState; readonly participant: Participant }>();
const leases = new WeakMap<SceneRasterParticipantLease, LeaseState>();
const arenas = new WeakMap<SceneRasterParticipantArena, ArenaState>();
const vertexUploadAttempted = Object.getOwnPropertyDescriptor(VertexBuffer.prototype, "hasAttemptedUpload")!.get!;
const indexUploadAttempted = Object.getOwnPropertyDescriptor(IndexBuffer.prototype, "hasAttemptedUpload")!.get!;
const vertexUpload = VertexBuffer.prototype.upload;
const indexUpload = IndexBuffer.prototype.upload;
const mapSize = Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!;
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const arrayBufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_PARTICIPANTS = 65_536;
const MAX_FIELDS = 262_144;

function invalid(message: string): never { throw new RenderDeviceError(message, "SCENE_RASTER_PARTICIPANT_INVALID"); }
function stale(): never { throw new RenderDeviceError("Scene raster participant packet is stale or disposed", "SCENE_RASTER_PARTICIPANT_STALE"); }

function current(arena: ArenaState): void {
  if (arena.disposed) stale();
  assertSceneRasterSnapshotCurrent(arena.snapshot, arena.owner, arena.device, arena.viewId, arena.frameId);
  if (arena.disposed) stale();
}

function mutate<T>(arena: ArenaState, action: () => T): T {
  if (arena.mutating) return invalid("Participant arena cannot be changed reentrantly");
  arena.mutating = true;
  try { return action(); } finally { arena.mutating = false; }
}

function ownValue(object: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  if (!descriptor || !("value" in descriptor)) return invalid(`Participant buffer ${name} must be an own data property`);
  return descriptor.value as unknown;
}

function isIdentity(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function checkedName(name: string): number {
  if (typeof name !== "string" || name.length === 0 || name.length > 128) return invalid("Participant field names must contain 1 to 128 characters");
  return name.length * 2;
}

/** Native getters reject proxies, detached/shared storage and lookalike objects. */
function arrayBufferLength(value: unknown): number {
  try {
    const length = Reflect.apply(arrayBufferByteLength, value, []) as number;
    if (!Number.isSafeInteger(length) || length <= 0 || (arrayBufferResizable && Reflect.apply(arrayBufferResizable, value, []))) {
      return invalid("Participant data must use a fixed, live ArrayBuffer");
    }
    return length;
  } catch { return invalid("Participant data must use a fixed, live ArrayBuffer"); }
}

function typedBytes(value: unknown, expectedTag: string): { readonly buffer: ArrayBuffer; readonly byteOffset: number; readonly byteLength: number } {
  try {
    if (Reflect.apply(typedArrayTag, value, []) !== expectedTag) return invalid(`Participant data requires ${expectedTag}`);
    const buffer = Reflect.apply(typedArrayBuffer, value, []) as ArrayBuffer;
    const byteOffset = Reflect.apply(typedArrayByteOffset, value, []) as number;
    const byteLength = Reflect.apply(typedArrayByteLength, value, []) as number;
    const length = arrayBufferLength(buffer);
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || byteLength <= 0 || byteOffset < 0 || byteOffset > length - byteLength) {
      return invalid("Participant data has an invalid view range");
    }
    return { buffer, byteOffset, byteLength };
  } catch { return invalid(`Participant data requires a live ${expectedTag}`); }
}

function inspectBuffer(value: VertexBuffer | IndexBuffer): BufferSnapshot {
  let kind: "vertex" | "index";
  let attempted: unknown;
  try { attempted = Reflect.apply(vertexUploadAttempted, value, []); kind = "vertex"; }
  catch {
    try { attempted = Reflect.apply(indexUploadAttempted, value, []); kind = "index"; }
    catch { return invalid("Participant buffer is not a genuine CPU buffer"); }
  }
  const prototype = kind === "vertex" ? VertexBuffer.prototype : IndexBuffer.prototype;
  const expectedUpload = kind === "vertex" ? vertexUpload : indexUpload;
  if (Object.getPrototypeOf(value) !== prototype || Object.getOwnPropertyDescriptor(value, "upload")
    || Object.getOwnPropertyDescriptor(prototype, "upload")?.value !== expectedUpload) {
    return invalid("Participant buffer has an unverified upload implementation");
  }
  let deviceBufferCount: number;
  try { deviceBufferCount = Reflect.apply(mapSize, ownValue(value, "deviceBuffers"), []) as number; }
  catch { return invalid("Participant buffer device state is unavailable"); }
  // `disposed` is a getter that turns true only after device retirement; a
  // buffer whose dispose() was requested is `closed` and already unreadable.
  if (attempted !== false || ownValue(value, "closed") !== false || ownValue(value, "disposalComplete") !== false
    || ownValue(value, "gpuBuffer") !== null || deviceBufferCount !== 0) {
    return invalid("Participant buffer is disposed or has attempted GPU upload");
  }
  const data = ownValue(value, "data");
  if (kind === "vertex") {
    const byteLength = arrayBufferLength(data);
    const format = ownValue(value, "format"), vertexCount = ownValue(value, "vertexCount"), bufferSlot = ownValue(value, "bufferSlot");
    if (!isIdentity(format) || !Number.isSafeInteger(vertexCount) || (vertexCount as number) <= 0 || !Number.isSafeInteger(bufferSlot) || (bufferSlot as number) < 0) {
      return invalid("Participant vertex metadata is invalid");
    }
    return { source: value, kind, data: data as ArrayBuffer, formatOrType: format, vertexCount: vertexCount as number,
      bufferSlot: bufferSlot as number, buffer: data as ArrayBuffer, byteOffset: 0, byteLength };
  }
  const type = ownValue(value, "type");
  if (type !== "uint16" && type !== "uint32") return invalid("Participant index type is invalid");
  const view = typedBytes(data, type === "uint16" ? "Uint16Array" : "Uint32Array");
  return { source: value, kind, data: data as Uint16Array | Uint32Array, formatOrType: type, ...view };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function bufferStillMatches(field: Extract<NamedValue, { kind: "buffer" }>): boolean {
  try {
    const previous = field.source, now = inspectBuffer(previous.source);
    return sameBuffer(previous, now) && sameBytes(field.bytes, new Uint8Array(now.buffer, now.byteOffset, now.byteLength));
  } catch { return false; }
}

function sameBuffer(left: BufferSnapshot, right: BufferSnapshot): boolean {
  return left.source === right.source && left.kind === right.kind && left.data === right.data && left.formatOrType === right.formatOrType
    && left.vertexCount === right.vertexCount && left.bufferSlot === right.bufferSlot && left.buffer === right.buffer
    && left.byteOffset === right.byteOffset && left.byteLength === right.byteLength;
}

function vectorStillMatches(field: Extract<NamedValue, { kind: "vector" }>): boolean {
  try {
    const view = typedBytes(field.source, "Float32Array");
    return sameBytes(field.bytes, new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  } catch { return false; }
}

function fieldMatches(left: NamedValue, right: NamedValue): boolean {
  if (left.name !== right.name || left.kind !== right.kind) return false;
  if (left.kind === "scalar" && right.kind === "scalar") return Object.is(left.value, right.value);
  if (left.kind === "resource" && right.kind === "resource") return left.value === right.value;
  if (left.kind === "vector" && right.kind === "vector") {
    return vectorStillMatches(left) && vectorStillMatches(right) && sameBytes(left.bytes, right.bytes);
  }
  if (left.kind === "buffer" && right.kind === "buffer") return left.source.source === right.source.source
    && bufferStillMatches(left) && bufferStillMatches(right) && sameBytes(left.bytes, right.bytes);
  return false;
}

function listMatches(left: readonly Participant[], right: readonly Participant[]): boolean {
  return left.length === right.length && left.every((a, index) => {
    const b = right[index]!;
    return a.list === b.list && a.item === b.item && a.geometry === b.geometry && a.material === b.material && a.shader === b.shader
      && a.fields.length === b.fields.length && a.fields.every((field, fieldIndex) => fieldMatches(field, b.fields[fieldIndex]!));
  });
}

function release(state: LeaseState): void {
  if (state.status === "disposed") return;
  state.status = "disposed";
  state.arena.bytes -= state.bytes;
  state.arena.participants -= state.participants;
  state.arena.fields -= state.fields;
  for (const participant of [...state.forward, ...state.shadow]) {
    participant.fields.length = 0;
    participant.names.clear();
    slots.delete(participant.slot);
  }
  state.forward.length = 0;
  state.shadow.length = 0;
  state.arena.leases.delete(state);
}

function building(state: LeaseState): void {
  current(state.arena);
  if (state.status !== "building") stale();
}

function addField(state: LeaseState, slot: SceneRasterParticipantSlot, name: string, bytes: number, create: () => NamedValue): void {
  const arena = state.arena;
  mutate(arena, () => {
    building(state);
    const entry = slots.get(slot);
    if (!entry || entry.lease !== state) return invalid("Participant slot belongs to another packet");
    const nameBytes = checkedName(name), cost = nameBytes + bytes;
    if (entry.participant.names.has(name)) return invalid("Participant field names must be unique");
    if (!Number.isSafeInteger(cost) || bytes < 0 || arena.fields >= arena.maxFields || cost > arena.maxBytes - arena.bytes) {
      return invalid("Participant packet exceeds its aggregate budget");
    }
    // Reserve before copying. A device-frame getter must not reenter this
    // arena and allocate an unaccounted second snapshot.
    state.bytes += cost; state.fields += 1; arena.bytes += cost; arena.fields += 1;
    let committed = false;
    try {
      const field = create();
      current(arena);
      if ((field.kind === "buffer" && !bufferStillMatches(field)) || (field.kind === "vector" && !vectorStillMatches(field))) {
        return invalid("Participant data changed while it was copied");
      }
      entry.participant.names.add(name);
      entry.participant.fields.push(field);
      committed = true;
    } finally {
      if (!committed) { state.bytes -= cost; state.fields -= 1; arena.bytes -= cost; arena.fields -= 1; }
    }
  });
}

/**
 * Create a bounded, frame-scoped staging arena. Limits are explicit and apply
 * across all live packets: bytes count copied buffer/vector data and UTF-16
 * field/string contents, not object overhead or caller-owned resources. Buffer
 * snapshots admit only built-in buffers with no tracked upload or device
 * resource. This narrow check is not a native ownership attestation. The arena
 * does not certify target, shader, renderer or resource ownership, does not
 * prevent concurrent edits, and cannot authorize a render submission.
 */
export function createSceneRasterParticipantArena(snapshot: SceneRasterSnapshot, owner: object, device: RenderDevice,
  viewId: TemporalIdentity, frameId: TemporalFrameId, target: object | null, temporalPlan: object | null,
  maxBytes: number, maxBufferBytes: number, maxParticipants: number, maxFields: number): SceneRasterParticipantArena {
  assertSceneRasterSnapshotCurrent(snapshot, owner, device, viewId, frameId);
  if ((target !== null && !isIdentity(target)) || (temporalPlan !== null && !isIdentity(temporalPlan))) return invalid("Participant scope identities are invalid");
  if (![maxBytes, maxBufferBytes, maxParticipants, maxFields].every(Number.isSafeInteger) || maxBytes <= 0 || maxBytes > MAX_TOTAL_BYTES
    || maxBufferBytes <= 0 || maxBufferBytes > maxBytes || maxParticipants <= 0 || maxParticipants > MAX_PARTICIPANTS
    || maxFields <= 0 || maxFields > MAX_FIELDS) return invalid("Participant arena limits are invalid");
  const arena: ArenaState = { snapshot, owner, device, viewId, frameId, target, temporalPlan, maxBytes, maxBufferBytes,
    maxParticipants, maxFields, leases: new Set(), bytes: 0, participants: 0, fields: 0, disposed: false, mutating: false };
  const result: SceneRasterParticipantArena = {
    get retainedBytes() { return arena.bytes; },
    get participantCount() { return arena.participants; },
    get fieldCount() { return arena.fields; },
    createLease() {
      return mutate(arena, () => {
        current(arena);
        if (arena.leases.size >= arena.maxParticipants) return invalid("Participant lease count exceeds its aggregate budget");
        const state: LeaseState = { arena, forward: [], shadow: [], status: "building", bytes: 0, participants: 0, fields: 0 };
        const lease: SceneRasterParticipantLease = {
        staged: true,
        get sealed() { return state.status === "sealed"; },
        addParticipant(list, item, geometry, material, shader) {
          return mutate(arena, () => {
            building(state);
            if ((list !== "forward" && list !== "shadow") || ![item, geometry, material, shader].every(isIdentity)) return invalid("Participant identities or ordering are invalid");
            if (arena.participants >= arena.maxParticipants) return invalid("Participant count exceeds its aggregate budget");
            const slot = Object.freeze({}) as SceneRasterParticipantSlot;
            const participant: Participant = { slot, list, item, geometry, material, shader, fields: [], names: new Set() };
            slots.set(slot, { lease: state, participant });
            (list === "forward" ? state.forward : state.shadow).push(participant);
            state.participants += 1; arena.participants += 1;
            return slot;
          });
        },
        addScalar(slot, name, value) {
          if ((typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number")
            || (typeof value === "number" && !Number.isFinite(value)) || (typeof value === "string" && value.length > 256)) return invalid("Participant scalar is invalid");
          addField(state, slot, name, typeof value === "string" ? value.length * 2 : 0, () => ({ kind: "scalar", name, value }));
        },
        addResource(slot, name, value) {
          if (value !== null && !isIdentity(value)) return invalid("Participant resource identity is invalid");
          addField(state, slot, name, 0, () => ({ kind: "resource", name, value }));
        },
        addVector(slot, name, value) {
          const view = typedBytes(value, "Float32Array");
          if (view.byteLength > arena.maxBufferBytes) return invalid("Participant vector exceeds its per-buffer budget");
          addField(state, slot, name, view.byteLength, () => {
            for (let index = 0; index < view.byteLength / Float32Array.BYTES_PER_ELEMENT; index += 1) {
              if (!Number.isFinite(value[index])) return invalid("Participant vector must be finite");
            }
            return { kind: "vector", name, source: value, bytes: new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice() };
          });
        },
        addBuffer(slot, name, value) {
          const source = inspectBuffer(value);
          if (source.byteLength > arena.maxBufferBytes) return invalid("Participant buffer exceeds its per-buffer budget");
          addField(state, slot, name, source.byteLength, () => {
            if (!sameBuffer(source, inspectBuffer(value))) return invalid("Participant data changed before it was copied");
            return { kind: "buffer", name, source, bytes: new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice() };
          });
        },
        seal() { mutate(arena, () => { building(state); state.status = "sealed"; }); },
        matches(other) {
          current(arena);
          const otherState = leases.get(other);
          if (!otherState || otherState.arena !== arena || state.status !== "sealed" || otherState.status !== "sealed") return false;
          return listMatches(state.forward, otherState.forward) && listMatches(state.shadow, otherState.shadow);
        },
        dispose() { mutate(arena, () => release(state)); }
        };
        leases.set(lease, state); arena.leases.add(state);
        return Object.freeze(lease);
      });
    },
    dispose() {
      mutate(arena, () => {
        if (arena.disposed) return;
        arena.disposed = true;
        for (const lease of [...arena.leases]) release(lease);
      });
    }
  };
  arenas.set(result, arena);
  return Object.freeze(result);
}

/** Compare identities only; this does not prove target or temporal-plan authority. */
export function assertSceneRasterParticipantArenaScope(arena: SceneRasterParticipantArena, snapshot: SceneRasterSnapshot,
  owner: object, device: RenderDevice, viewId: TemporalIdentity, frameId: TemporalFrameId,
  target: object | null, temporalPlan: object | null): void {
  const state = arenas.get(arena);
  if (!state || state.snapshot !== snapshot || state.owner !== owner || state.device !== device || state.viewId !== viewId
    || state.frameId !== frameId || state.target !== target || state.temporalPlan !== temporalPlan) stale();
  current(state);
}

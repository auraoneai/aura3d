/**
 * Staged PRD07 frame data. This module does not connect the renderer, replace
 * the existing ambient stores, or establish replay safety by itself.
 *
 * Trust boundary: a future renderer-owned adapter must supply its actual opaque
 * owner/device identities and current device generation, and revoke scopes on
 * frame end, device loss, restoration, or disposal. This module does not read
 * properties from those identities or authenticate them as real devices.
 * It also does not lock the device against another renderer: a future adapter
 * must coordinate actual frame execution across owners separately.
 * Context registration is opt-in. An adapter selecting managed mode must
 * register every context before use and abort setup failures; an object that
 * was never registered remains on the existing standalone/legacy path.
 *
 * The writer takes primitive scalars, not arbitrary records, arrays, or texture
 * objects. A trusted collector may resolve its inputs before calling it; any
 * accessor used by that collector runs in the collector, not in this module.
 * Every accepted number is copied into module-owned, deeply frozen data.
 *
 * Puddle-noise textures are borrowed from their caller: this frame packet must
 * never dispose them. A later integration may admit one only through a
 * device-owned lease that pins immutable sampleable contents and a verified
 * content revision for the full frame, validates device generation and lease
 * liveness at each use, and revokes on mutation, loss, or disposal. No such
 * authority exists here; every non-null texture is rejected without inspection.
 * A future lease must also keep backing resources alive through the GPU
 * completion fence, not merely until CPU-side frame submission ends. Revoking
 * it prevents future submissions but cannot retract work already submitted.
 *
 * Revocation prevents subsequent resolutions and publications. Previously
 * resolved immutable values cannot be recalled, so a consumer must resolve
 * the packet again at every selection/bind, including after an asynchronous
 * yield, and must not cache resolved data across revocation boundaries.
 */

import type { Prd07ForwardFogState } from "../atmosphere/fogUniformStore";
import { A3D_MAX_FOG_VOLUMES, type Prd07FogVolume } from "../atmosphere/FogVolumes";

declare const scopeBrand: unique symbol;
declare const frameBrand: unique symbol;
declare const packetBrand: unique symbol;
declare const bindingBrand: unique symbol;

/** Opaque capability issued to the renderer that owns a device generation. */
export type Prd07FrameScope = { readonly [scopeBrand]: true };
/** Opaque capability for a single view/frame transaction. */
export type Prd07FrameToken = { readonly [frameBrand]: true };
/** Opaque handle; contents can be resolved only while its frame is live. */
export type Prd07FramePacket = { readonly [packetBrand]: true };
/** Renderer-owned binding shared by all context objects in one frame. */
export type Prd07ManagedFrameBinding = { readonly [bindingBrand]: true };
export type Prd07ViewId = string | number;

export interface Prd07FrameValues {
  readonly fog: Prd07ForwardFogState | null;
  readonly wetness: {
    readonly wetness: number;
    readonly puddleThreshold: number;
    readonly rainRipples: number;
    readonly snowCover: number;
    readonly puddleNoise: null;
  };
}

export interface Prd07FrameWriter {
  /** Start a live fog block. A fog-free frame leaves this unset. */
  beginFog(mode: number, near: number, far: number): void;
  setFogA(a0: number, a1: number, a2: number, a3: number): void;
  setFogB(b0: number, b1: number, b2: number, b3: number): void;
  setFogColor(r: number, g: number, b: number): void;
  setFogAbsorption(r: number, g: number, b: number): void;
  setSunDirection(x: number, y: number, z: number): void;
  setSunColor(r: number, g: number, b: number): void;
  setCameraPosition(x: number, y: number, z: number): void;
  addFogVolume(shape: "box" | "ellipsoid", cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number, density: number): void;
  /** The texture must currently be null; non-null borrowed textures fail closed. */
  setWetness(wetness: number, puddleThreshold: number, rainRipples: number, snowCover: number, puddleNoise: null): void;
  publish(): Prd07FramePacket;
}

/** A producer can fill scalars, but only the frame owner may publish. */
export type Prd07FrameDraft = Omit<Prd07FrameWriter, "publish">;
/** Trusted synchronous app/renderer bridge callback; runs once during collect. */
export type Prd07FrameProducer = (draft: Prd07FrameDraft) => void;

type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];
type Wetness = Prd07FrameValues["wetness"];

interface FogDraft {
  readonly mode: number;
  readonly near: number;
  readonly far: number;
  a?: Vec4;
  b?: Vec4;
  color?: Vec3;
  absorption?: Vec3;
  sunDirection?: Vec3;
  sunColor?: Vec3;
  cameraPosition?: Vec3;
  readonly volumes: Prd07FogVolume[];
}

interface ScopeRecord {
  readonly renderer: object;
  readonly device: object;
  readonly generation: number;
  readonly frames: Map<Prd07ViewId, FrameRecord>;
  live: boolean;
}

interface FrameRecord {
  readonly scope: ScopeRecord;
  readonly view: Prd07ViewId;
  readonly index: number;
  live: boolean;
  writerIssued: boolean;
  producerFailed?: boolean;
  packet?: Prd07FramePacket;
  values?: Prd07FrameValues;
  managedBinding?: Prd07ManagedFrameBinding;
}

interface ManagedBindingRecord {
  readonly scope: Prd07FrameScope;
  readonly frame: Prd07FrameToken;
  readonly frameState: FrameRecord;
  readonly sourceOwner: object;
  readonly producer: Prd07FrameProducer;
  phase: "pending" | "producing" | "ready" | "failed";
}

const scopes = new WeakMap<Prd07FrameScope, ScopeRecord>();
const frames = new WeakMap<Prd07FrameToken, FrameRecord>();
const packets = new WeakMap<Prd07FramePacket, FrameRecord>();
const scopesByDevice = new WeakMap<object, Set<ScopeRecord>>();
const managedBindings = new WeakMap<Prd07ManagedFrameBinding, ManagedBindingRecord>();
const managedContexts = new WeakMap<object, ManagedBindingRecord>();
const invalidManagedContexts = new WeakSet<object>();

function isOpaqueIdentity(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isView(value: unknown): value is Prd07ViewId {
  return (typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value));
}

function finiteGpuNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function requireNumbers(...values: readonly unknown[]): void {
  if (!values.every(finiteGpuNumber)) throw new TypeError("PRD07_FRAME_NUMBER_INVALID");
}

function vector3(x: number, y: number, z: number): Vec3 {
  requireNumbers(x, y, z);
  return [x, y, z];
}

function vector4(x: number, y: number, z: number, w: number): Vec4 {
  requireNumbers(x, y, z, w);
  return [x, y, z, w];
}

function token<T extends object>(): T {
  return Object.freeze(Object.create(null) as object) as T;
}

function revokeFrame(record: FrameRecord): void {
  record.live = false;
  record.packet = undefined;
  record.values = undefined;
}

function disposeScope(record: ScopeRecord): boolean {
  if (!record.live) return false;
  record.live = false;
  for (const frame of record.frames.values()) revokeFrame(frame);
  record.frames.clear();
  const deviceScopes = scopesByDevice.get(record.device);
  deviceScopes?.delete(record);
  if (deviceScopes?.size === 0) scopesByDevice.delete(record.device);
  return true;
}

/**
 * Called by a trusted renderer adapter, not by a fog/wetness source. `renderer`
 * and `device` are opaque identity tokens; no properties are read from them.
 */
export function createPrd07FrameScope(renderer: object, device: object, generation: number): Prd07FrameScope {
  if (!isOpaqueIdentity(renderer) || !isOpaqueIdentity(device) || !isGeneration(generation)) {
    throw new TypeError("PRD07_FRAME_SCOPE_INVALID");
  }
  const scope = token<Prd07FrameScope>();
  const record: ScopeRecord = { renderer, device, generation, frames: new Map(), live: true };
  scopes.set(scope, record);
  let deviceScopes = scopesByDevice.get(device);
  if (!deviceScopes) {
    deviceScopes = new Set();
    scopesByDevice.set(device, deviceScopes);
  }
  deviceScopes.add(record);
  return scope;
}

/** One live transaction per view; a separate view may have its own packet. */
export function beginPrd07Frame(scope: Prd07FrameScope, renderer: object, device: object, generation: number,
  view: Prd07ViewId, index: number): Prd07FrameToken {
  const record = scopes.get(scope);
  if (!record?.live || record.renderer !== renderer || record.device !== device || record.generation !== generation ||
      !isGeneration(generation) || !isView(view) || !isGeneration(index)) {
    throw new Error("PRD07_FRAME_IDENTITY_INVALID");
  }
  if (record.frames.has(view)) throw new Error("PRD07_FRAME_IN_FLIGHT");
  const frame = token<Prd07FrameToken>();
  const state: FrameRecord = { scope: record, view, index, live: true, writerIssued: false };
  frames.set(frame, state);
  record.frames.set(view, state);
  return frame;
}

/**
 * Bind one live frame to an app source identity and trusted scalar producer.
 * Only the renderer/app bridge can establish that the owner and producer are
 * authentic; arbitrary source callbacks must not be promoted into this role.
 */
export function createPrd07ManagedFrameBinding(scope: Prd07FrameScope, frame: Prd07FrameToken,
  renderer: object, device: object, generation: number, view: Prd07ViewId, index: number,
  sourceOwner: object, producer: Prd07FrameProducer): Prd07ManagedFrameBinding {
  const scopeState = scopes.get(scope), frameState = frames.get(frame);
  if (!scopeState?.live || !frameState?.live || frameState.scope !== scopeState ||
      scopeState.renderer !== renderer || scopeState.device !== device || scopeState.generation !== generation ||
      frameState.view !== view || frameState.index !== index || scopeState.frames.get(view) !== frameState ||
      !isOpaqueIdentity(sourceOwner) || typeof producer !== "function" || frameState.writerIssued || frameState.managedBinding) {
    throw new Error("PRD07_MANAGED_BINDING_INVALID");
  }
  const binding = token<Prd07ManagedFrameBinding>();
  frameState.managedBinding = binding;
  managedBindings.set(binding, { scope, frame, frameState, sourceOwner, producer, phase: "pending" });
  return binding;
}

/**
 * Register each renderer-created context object with the same frame binding.
 * Contexts are opaque keys: neither registration nor lookup reads properties on
 * them. The trusted renderer must keep its actual context identity fields
 * stable and pass the source-owner identity it chose for this frame.
 */
export function registerPrd07ManagedFrameContext(context: object, binding: Prd07ManagedFrameBinding, sourceOwner: object,
  renderer: object, device: object, generation: number, view: Prd07ViewId, index: number): void {
  const record = managedBindings.get(binding);
  if (!isOpaqueIdentity(context)) throw new Error("PRD07_MANAGED_CONTEXT_INVALID");
  if (invalidManagedContexts.has(context)) throw new Error("PRD07_MANAGED_CONTEXT_INVALID");
  if (!record || !record.frameState.live || !record.frameState.scope.live ||
      record.sourceOwner !== sourceOwner || record.frameState.managedBinding !== binding ||
      record.frameState.scope.renderer !== renderer || record.frameState.scope.device !== device ||
      record.frameState.scope.generation !== generation || record.frameState.view !== view || record.frameState.index !== index) {
    invalidManagedContexts.add(context);
    throw new Error("PRD07_MANAGED_CONTEXT_INVALID");
  }
  const existing = managedContexts.get(context);
  if (existing && existing !== record) {
    invalidManagedContexts.add(context);
    throw new Error("PRD07_MANAGED_CONTEXT_ALREADY_BOUND");
  }
  managedContexts.set(context, record);
}

/** Identity-only membership check; revoked registrations remain tombstoned. */
export function hasPrd07ManagedFrameContext(context: object): boolean {
  return isOpaqueIdentity(context) && (managedContexts.has(context) || invalidManagedContexts.has(context));
}

function managedRecord(context: object): ManagedBindingRecord {
  if (isOpaqueIdentity(context) && invalidManagedContexts.has(context)) throw new Error("PRD07_MANAGED_CONTEXT_INVALID");
  const record = isOpaqueIdentity(context) ? managedContexts.get(context) : undefined;
  if (!record) throw new Error("PRD07_MANAGED_CONTEXT_REQUIRED");
  if (!record.frameState.live || !record.frameState.scope.live || !record.frameState.managedBinding) {
    throw new Error("PRD07_MANAGED_FRAME_REVOKED");
  }
  return record;
}

/**
 * Invoke the trusted producer at most once during collect. A thrown producer or
 * failed publication poisons this frame; later reads never fall back globally.
 */
export function producePrd07ManagedFrame(context: object): Prd07FrameValues {
  const record = managedRecord(context);
  if (record.phase === "ready") return requirePrd07ManagedFrame(context);
  if (record.phase !== "pending") throw new Error("PRD07_MANAGED_PRODUCER_UNAVAILABLE");
  record.phase = "producing";
  try {
    const writer = createPrd07FrameWriter(record.frame);
    const { publish, ...draft } = writer;
    const result: unknown = record.producer(Object.freeze(draft));
    if (result !== undefined) throw new Error("PRD07_MANAGED_PRODUCER_SYNCHRONOUS_REQUIRED");
    publish();
    record.phase = "ready";
    return requirePrd07ManagedFrame(context);
  } catch (error) {
    record.phase = "failed";
    record.frameState.producerFailed = true;
    throw error;
  }
}

/** Read only a published, live packet; never call the producer or use globals. */
export function requirePrd07ManagedFrame(context: object): Prd07FrameValues {
  const record = managedRecord(context);
  const frameState = record.frameState, scopeState = frameState.scope;
  const packet = frameState.packet;
  if (record.phase !== "ready" || !packet) throw new Error("PRD07_MANAGED_FRAME_UNAVAILABLE");
  const values = resolvePrd07FramePacket(packet, record.scope, record.frame, scopeState.renderer,
    scopeState.device, scopeState.generation, frameState.view, frameState.index);
  if (!values) throw new Error("PRD07_MANAGED_FRAME_REVOKED");
  return values;
}

/** Revoke a frame without disposing any borrowed caller-owned resource. */
export function endPrd07Frame(frame: Prd07FrameToken): boolean {
  const state = frames.get(frame);
  if (!state?.live) return false;
  revokeFrame(state);
  if (state.scope.frames.get(state.view) === state) state.scope.frames.delete(state.view);
  return true;
}

/** Revoke one renderer scope and all of its live frame capabilities. */
export function disposePrd07FrameScope(scope: Prd07FrameScope): boolean {
  const record = scopes.get(scope);
  return record ? disposeScope(record) : false;
}

/** Device loss/disposal must revoke every renderer scope using that device. */
export function revokePrd07Device(device: object): number {
  if (!isOpaqueIdentity(device)) return 0;
  const deviceScopes = scopesByDevice.get(device);
  if (!deviceScopes) return 0;
  let revoked = 0;
  for (const scope of [...deviceScopes]) if (disposeScope(scope)) revoked += 1;
  return revoked;
}

/** Revoke a retired generation without disturbing a newer restored scope. */
export function revokePrd07DeviceGeneration(device: object, generation: number): number {
  if (!isOpaqueIdentity(device) || !isGeneration(generation)) return 0;
  const deviceScopes = scopesByDevice.get(device);
  if (!deviceScopes) return 0;
  let revoked = 0;
  for (const scope of [...deviceScopes]) {
    if (scope.generation === generation && disposeScope(scope)) revoked += 1;
  }
  return revoked;
}

/** Create a single-use writer for the exact live frame capability. */
export function createPrd07FrameWriter(frame: Prd07FrameToken): Prd07FrameWriter {
  const state = frames.get(frame);
  if (!state?.live || !state.scope.live || state.writerIssued) throw new Error("PRD07_FRAME_WRITER_UNAVAILABLE");
  state.writerIssued = true;
  let fog: FogDraft | null = null;
  let wetness: Wetness | undefined;
  const writable = () => {
    if (!state.live || !state.scope.live || state.packet || state.producerFailed) throw new Error("PRD07_FRAME_WRITER_CLOSED");
  };
  const liveFog = () => {
    writable();
    if (!fog) throw new Error("PRD07_FRAME_FOG_NOT_STARTED");
    return fog;
  };
  return Object.freeze({
    beginFog(mode: number, near: number, far: number) {
      writable();
      if (fog) throw new Error("PRD07_FRAME_FOG_ALREADY_STARTED");
      requireNumbers(mode, near, far);
      if (!Number.isInteger(mode) || mode < 1 || mode > 6) throw new RangeError("PRD07_FRAME_FOG_MODE_INVALID");
      fog = { mode, near, far, volumes: [] };
    },
    setFogA(a0: number, a1: number, a2: number, a3: number) { liveFog().a = vector4(a0, a1, a2, a3); },
    setFogB(b0: number, b1: number, b2: number, b3: number) { liveFog().b = vector4(b0, b1, b2, b3); },
    setFogColor(r: number, g: number, b: number) { liveFog().color = vector3(r, g, b); },
    setFogAbsorption(r: number, g: number, b: number) { liveFog().absorption = vector3(r, g, b); },
    setSunDirection(x: number, y: number, z: number) { liveFog().sunDirection = vector3(x, y, z); },
    setSunColor(r: number, g: number, b: number) { liveFog().sunColor = vector3(r, g, b); },
    setCameraPosition(x: number, y: number, z: number) { liveFog().cameraPosition = vector3(x, y, z); },
    addFogVolume(shape: "box" | "ellipsoid", cx: number, cy: number, cz: number,
      hx: number, hy: number, hz: number, density: number) {
      const draft = liveFog();
      if (shape !== "box" && shape !== "ellipsoid") throw new TypeError("PRD07_FRAME_VOLUME_SHAPE_INVALID");
      requireNumbers(cx, cy, cz, hx, hy, hz, density);
      if (hx <= 0 || hy <= 0 || hz <= 0 || density < 0 || draft.volumes.length >= A3D_MAX_FOG_VOLUMES) {
        throw new RangeError("PRD07_FRAME_VOLUME_INVALID");
      }
      draft.volumes.push({ shape, center: [cx, cy, cz], halfSize: [hx, hy, hz], density });
    },
    setWetness(value: number, threshold: number, ripples: number, snow: number, puddleNoise: null) {
      writable();
      if (puddleNoise !== null) throw new Error("PRD07_PUDDLE_TEXTURE_UNVERIFIED");
      requireNumbers(value, threshold, ripples, snow);
      if (value < 0 || value > 1 || threshold < 0 || threshold > 1 || ripples < 0 || snow < 0 || snow > 1) {
        throw new RangeError("PRD07_FRAME_WETNESS_INVALID");
      }
      wetness = { wetness: value, puddleThreshold: threshold, rainRipples: ripples, snowCover: snow, puddleNoise: null };
    },
    publish() {
      writable();
      if (!wetness) throw new Error("PRD07_FRAME_WETNESS_REQUIRED");
      let frozenFog: Prd07ForwardFogState | null = null;
      if (fog) {
        if (!fog.a || !fog.b || !fog.color || !fog.absorption || !fog.sunDirection || !fog.sunColor || !fog.cameraPosition) {
          throw new Error("PRD07_FRAME_FOG_INCOMPLETE");
        }
        const volumes = Object.freeze(fog.volumes.map((volume) => Object.freeze({
          shape: volume.shape,
          center: Object.freeze([...volume.center]) as Vec3,
          halfSize: Object.freeze([...volume.halfSize]) as Vec3,
          density: volume.density
        })));
        frozenFog = Object.freeze({
          uniforms: Object.freeze({
            fogA: Object.freeze([...fog.a]) as Vec4,
            fogB: Object.freeze([...fog.b]) as Vec4,
            fogColor: Object.freeze([...fog.color]) as Vec3,
            fogAbsorption: Object.freeze([...fog.absorption]) as Vec3,
            fogMode: fog.mode, fogNear: fog.near, fogFar: fog.far
          }),
          volumes,
          sunDirection: Object.freeze([...fog.sunDirection]) as Vec3,
          sunColor: Object.freeze([...fog.sunColor]) as Vec3,
          cameraPosition: Object.freeze([...fog.cameraPosition]) as Vec3
        });
      }
      const packet = token<Prd07FramePacket>();
      state.values = Object.freeze({ fog: frozenFog, wetness: Object.freeze({ ...wetness }) });
      state.packet = packet;
      packets.set(packet, state);
      return packet;
    }
  });
}

/**
 * Resolve only for the exact live frame and its verified current identity.
 * Pass current values from the trusted renderer, never a caller-authored record.
 */
export function resolvePrd07FramePacket(packet: Prd07FramePacket, scope: Prd07FrameScope, frame: Prd07FrameToken,
  renderer: object, device: object, generation: number, view: Prd07ViewId, index: number): Prd07FrameValues | undefined {
  const scopeState = scopes.get(scope);
  const frameState = frames.get(frame);
  if (!scopeState?.live || !frameState?.live || frameState.scope !== scopeState || packets.get(packet) !== frameState ||
      frameState.packet !== packet || scopeState.renderer !== renderer || scopeState.device !== device ||
      scopeState.generation !== generation || frameState.view !== view || frameState.index !== index ||
      scopeState.frames.get(view) !== frameState) return undefined;
  return frameState.values;
}

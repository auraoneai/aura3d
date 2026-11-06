/**
 * Internal handoff from the app mount to its renderer. This is deliberately
 * absent from the public rendering barrel: a RenderSource cannot opt itself
 * into managed PRD07 state. The engine supplies the actual app authority only
 * after mounting its renderer and checking the owner and canvas identities.
 *
 * The adapter lease coordinates participating renderer operations. Production
 * app frames additionally run under the PRD02 shared-device probe/frame lock.
 * Neither boundary controls raw graphics contexts or direct device calls made
 * outside those APIs; those operations must not overlap an app-managed frame.
 */
import type { RenderDevice } from "../RenderDevice";
import type { QrFlags } from "../contracts/core";
import type { FrameCamera, FrameContributorContext } from "../contracts/frameGraph";
import type { ForwardEnvironmentFogOptions } from "../ForwardPass";
import {
  PRD07_FOG_DEFAULTS, packLegacy, packV2, parseFogColor, resolvePrd07FogSpec,
  skyHorizonRadiance, type Prd07FogSpec, type Vec3
} from "../atmosphere/HeightFog";
import { evaluateSky, skyFrame } from "../atmosphere/SkyEval";
import { A3D_MAX_FOG_VOLUMES } from "../atmosphere/FogVolumes";
import {
  acquirePrd07DeviceLease, assertPrd07DeviceLease, assertPrd07DeviceLeaseAvailable, createPrd07ManagedAdapterMount,
  releasePrd07DeviceLease, revokePrd07AdapterMount, waitForPrd07DeviceLeaseRelease, type Prd07AdapterMount, type Prd07DeviceLease
} from "./Prd07FrameAdapter";
import {
  beginPrd07Frame, createPrd07FrameScope, createPrd07ManagedFrameBinding,
  disposePrd07FrameScope, endPrd07Frame, producePrd07ManagedFrame, registerPrd07ManagedFrameContext,
  type Prd07FrameDraft, type Prd07FrameScope, type Prd07FrameToken,
  type Prd07ManagedFrameBinding, type Prd07ViewId
} from "./Prd07FrameState";

interface SnapshotVolume {
  readonly shape: "box" | "ellipsoid";
  readonly center: Vec3;
  readonly halfSize: Vec3;
  readonly density: number;
}

/** The engine copies these scalar values on app mutation, before rendering. */
export interface Prd07RendererSnapshot {
  readonly fog: Prd07FogSpec | null;
  readonly fogVolumes: readonly SnapshotVolume[];
  readonly skyForFog: unknown;
  readonly wetness: {
    readonly wetness: number;
    readonly puddleThreshold: number;
    readonly rainRipples: number;
    readonly snowCover: number;
    readonly puddleNoise: null;
  };
}

/** Supplied only by the app's private mount closure, never read from a source. */
export interface Prd07RendererAuthority {
  readonly owner: object;
  readonly canvas: object;
  readonly overlay: object;
  isLive(): boolean;
  capture(): Prd07RendererSnapshot | null;
  isCurrent(snapshot: Prd07RendererSnapshot): boolean;
  onRevoke(listener: () => void): () => void;
}

interface Mount {
  readonly renderer: object;
  readonly device: RenderDevice;
  readonly generation: number;
  readonly authority: Prd07RendererAuthority;
  readonly adapter: Prd07AdapterMount;
  readonly scope: Prd07FrameScope;
  readonly revokeWaiters: Set<() => void>;
  live: boolean;
  offAuthority: () => void;
  offLoss: () => void;
}

export interface Prd07RendererOperation {
  readonly mount: Mount;
  readonly lease: Prd07DeviceLease;
  readonly snapshot: Prd07RendererSnapshot;
  closed: boolean;
}

export interface Prd07RendererView {
  readonly operation: Prd07RendererOperation;
  readonly frame: Prd07FrameToken;
  readonly view: Prd07ViewId;
  readonly index: number;
  binding?: Prd07ManagedFrameBinding;
  closed: boolean;
}

const mounts = new WeakMap<object, Mount>();
// A detached managed renderer must fail closed, never resume the legacy path.
const revokedRenderers = new WeakSet<object>();
const activeOperations = new WeakMap<object, Prd07RendererOperation>();
// A canvas may have several managed renderers backed by distinct devices.
// Queue production async work by the real canvas before taking device locks;
// the adapter lease remains the final fail-fast guard for every operation.
const canvasFrameTails = new WeakMap<object, Promise<void>>();
// A one-shot internal handoff allows probe faces and the following main draw
// to use the same operation without making reentrant public calls its owner.
const borrowedOperations = new WeakMap<object, Prd07RendererOperation>();
const contextViews = new WeakMap<object, Prd07RendererView>();

function generation(device: RenderDevice): number { return device.generation ?? 0; }

function revoke(mount: Mount): void {
  if (!mount.live) return;
  mount.live = false;
  for (const notify of mount.revokeWaiters) notify();
  mount.revokeWaiters.clear();
  revokedRenderers.add(mount.renderer);
  if (mounts.get(mount.renderer) === mount) mounts.delete(mount.renderer);
  const offAuthority = mount.offAuthority, offLoss = mount.offLoss;
  mount.offAuthority = () => {};
  mount.offLoss = () => {};
  const errors: unknown[] = [];
  for (const release of [() => disposePrd07FrameScope(mount.scope), () => revokePrd07AdapterMount(mount.adapter), offAuthority, offLoss]) {
    try { release(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "PRD07 renderer authority cleanup failed.");
}

/** Install the app's already-authenticated, private mount authority. */
export function bindPrd07RendererAuthority(renderer: object, device: RenderDevice, owner: object, canvas: object,
  authority: Prd07RendererAuthority): () => void {
  if (mounts.has(renderer) || revokedRenderers.has(renderer) || authority.owner !== owner || authority.canvas !== canvas ||
      !authority.overlay || !authority.isLive() || device.disposed || device.contextLost) {
    throw new Error("PRD07_RENDERER_MOUNT_INVALID");
  }
  const currentGeneration = generation(device);
  const adapter = createPrd07ManagedAdapterMount(renderer, device, currentGeneration, owner, canvas, authority.overlay);
  let scope: Prd07FrameScope;
  try { scope = createPrd07FrameScope(renderer, device, currentGeneration); }
  catch (error) { revokePrd07AdapterMount(adapter); throw error; }
  const mount: Mount = { renderer, device, generation: currentGeneration, authority, adapter, scope, revokeWaiters: new Set(),
    live: true, offAuthority: () => {}, offLoss: () => {} };
  mounts.set(renderer, mount);
  try {
    const offAuthority = authority.onRevoke(() => revoke(mount));
    if (mount.live) mount.offAuthority = offAuthority; else offAuthority();
    const offLoss = device.onDeviceLost?.(() => revoke(mount)) ?? (() => {});
    if (mount.live) mount.offLoss = offLoss; else offLoss();
    if (!mount.live || !authority.isLive() || device.disposed || device.contextLost || generation(device) !== currentGeneration) {
      throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
    }
  } catch (error) {
    try { revoke(mount); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "PRD07 renderer mount and cleanup failed."); }
    throw error;
  }
  return () => revoke(mount);
}

/** Direct renderer disposal revokes the app mount even before its owner unwinds. */
export function disposePrd07RendererAuthority(renderer: object): void {
  const mount = mounts.get(renderer);
  if (mount) revoke(mount);
}

/** Reject synchronous overlap before preparing a production frame. */
export function assertPrd07RendererLeaseAvailable(renderer: object): void {
  const mount = mounts.get(renderer);
  if (!mount) {
    if (revokedRenderers.has(renderer)) throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
    return;
  }
  const { device, authority } = mount;
  if (!mount.live || !authority.isLive() || device.disposed || device.contextLost || generation(device) !== mount.generation) {
    throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
  }
  assertPrd07DeviceLeaseAvailable(mount.adapter, renderer, device, mount.generation, authority.owner, authority.canvas, authority.overlay);
}

/** Serialize managed async production operations even when device wrappers differ. */
export async function withPrd07RendererCanvasLock<T>(renderer: object, run: () => Promise<T>): Promise<T> {
  const mount = mounts.get(renderer);
  if (!mount) {
    if (revokedRenderers.has(renderer)) throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
    return run();
  }
  const canvas = mount.authority.canvas;
  const previous = canvasFrameTails.get(canvas);
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  // A cancelled waiter may finish before its predecessor. Its tail still
  // retains that predecessor so a later app cannot overtake active work.
  const tail = previous ? previous.then(() => finished) : finished;
  canvasFrameTails.set(canvas, tail);
  void tail.then(() => { if (canvasFrameTails.get(canvas) === tail) canvasFrameTails.delete(canvas); });
  const waitWhileLive = (pending: Promise<void>): Promise<void> => new Promise((resolve, reject) => {
    const onRevoke = (): void => {
      mount.revokeWaiters.delete(onRevoke);
      reject(new Error("PRD07_RENDERER_MOUNT_REVOKED"));
    };
    mount.revokeWaiters.add(onRevoke);
    void pending.then(() => {
      mount.revokeWaiters.delete(onRevoke);
      if (!mount.live || mounts.get(renderer) !== mount) reject(new Error("PRD07_RENDERER_MOUNT_REVOKED"));
      else resolve();
    }, (error: unknown) => { mount.revokeWaiters.delete(onRevoke); reject(error); });
    if (!mount.live || mounts.get(renderer) !== mount) onRevoke();
  });
  try {
    if (previous) await waitWhileLive(previous);
    for (;;) {
      // A queued operation owns no device resources and must not resume after
      // its exact mount has been detached, lost, or replaced.
      if (!mount.live || mounts.get(renderer) !== mount) throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
      const { device, authority } = mount;
      const pending = waitForPrd07DeviceLeaseRelease(mount.adapter, renderer, device, mount.generation,
        authority.owner, authority.canvas, authority.overlay);
      if (!pending) break;
      await waitWhileLive(pending);
    }
    return await run();
  } finally {
    finish();
  }
}

/** Capture one immutable app revision for an entire renderer operation. */
export function beginPrd07RendererOperation(renderer: object): Prd07RendererOperation | undefined {
  const mount = mounts.get(renderer);
  if (!mount) {
    if (revokedRenderers.has(renderer)) throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
    return undefined;
  }
  if (!mount.live || activeOperations.has(renderer) || !mount.authority.isLive() || mount.device.disposed ||
      mount.device.contextLost || generation(mount.device) !== mount.generation) throw new Error("PRD07_RENDERER_MOUNT_REVOKED");
  const { authority, device } = mount;
  const lease = acquirePrd07DeviceLease(mount.adapter, renderer, device, mount.generation,
    authority.owner, authority.canvas, authority.overlay);
  try {
    const snapshot = authority.capture();
    if (!snapshot || !authority.isCurrent(snapshot)) throw new Error("PRD07_ATMOSPHERE_SNAPSHOT_STALE");
    const operation: Prd07RendererOperation = { mount, lease, snapshot, closed: false };
    activeOperations.set(renderer, operation);
    assertPrd07RendererOperation(operation);
    return operation;
  } catch (error) {
    activeOperations.delete(renderer);
    releasePrd07DeviceLease(lease);
    throw error;
  }
}

/** Pass an active app operation to exactly one immediately invoked renderer call. */
export function withBorrowedPrd07RendererOperation<T>(renderer: object, operation: Prd07RendererOperation | undefined, run: () => T): T {
  if (!operation) return run();
  assertPrd07RendererOperation(operation);
  if (operation.mount.renderer !== renderer || borrowedOperations.has(renderer)) throw new Error("PRD07_RENDERER_OPERATION_BUSY");
  borrowedOperations.set(renderer, operation);
  try { return run(); }
  finally { if (borrowedOperations.get(renderer) === operation) borrowedOperations.delete(renderer); }
}

/** Claim a one-shot handoff or start an independently owned operation. */
export function takePrd07RendererOperation(renderer: object): { readonly operation: Prd07RendererOperation | undefined; readonly owned: boolean } {
  const operation = borrowedOperations.get(renderer);
  if (operation) {
    borrowedOperations.delete(renderer);
    assertPrd07RendererOperation(operation);
    return { operation, owned: false };
  }
  return { operation: beginPrd07RendererOperation(renderer), owned: true };
}

/** Revalidate after any yield and before every managed packet consumption. */
export function assertPrd07RendererOperation(operation: Prd07RendererOperation): void {
  const { mount, lease, snapshot } = operation;
  const { renderer, device, authority } = mount;
  if (operation.closed || !mount.live || activeOperations.get(renderer) !== operation || device.disposed || device.contextLost ||
      generation(device) !== mount.generation || !authority.isLive()) throw new Error("PRD07_RENDERER_OPERATION_REVOKED");
  assertPrd07DeviceLease(lease, mount.adapter, renderer, device, mount.generation,
    authority.owner, authority.canvas, authority.overlay);
  if (!authority.isCurrent(snapshot)) throw new Error("PRD07_ATMOSPHERE_SNAPSHOT_STALE");
}

export function endPrd07RendererOperation(operation: Prd07RendererOperation | undefined): void {
  if (!operation || operation.closed) return;
  operation.closed = true;
  if (activeOperations.get(operation.mount.renderer) === operation) activeOperations.delete(operation.mount.renderer);
  releasePrd07DeviceLease(operation.lease);
}

export function beginPrd07RendererView(operation: Prd07RendererOperation | undefined,
  view: Prd07ViewId, index: number): Prd07RendererView | undefined {
  if (!operation) return undefined;
  assertPrd07RendererOperation(operation);
  const { mount } = operation;
  const frame = beginPrd07Frame(mount.scope, mount.renderer, mount.device, mount.generation, view, index);
  return { operation, frame, view, index, closed: false };
}

export function endPrd07RendererView(view: Prd07RendererView | undefined): void {
  if (!view || view.closed) return;
  view.closed = true;
  endPrd07Frame(view.frame);
}

function cameraValues(camera: FrameCamera | null): { position: Vec3; forward: Vec3 } {
  return { position: camera?.position ?? [0, 0, 0],
    forward: camera ? [-camera.viewMatrix[2]!, -camera.viewMatrix[6]!, -camera.viewMatrix[10]!] : [0, 0, -1] };
}

function writeSnapshot(draft: Prd07FrameDraft, snapshot: Prd07RendererSnapshot, camera: FrameCamera | null, flags: QrFlags): void {
  const wet = snapshot.wetness;
  draft.setWetness(wet.wetness, wet.puddleThreshold, wet.rainRipples, wet.snowCover, wet.puddleNoise);
  if (!snapshot.fog) return;
  const { position, forward } = cameraValues(camera);
  const resolved = resolvePrd07FogSpec(snapshot.fog);
  const color = resolved.color === "sky"
    ? skyHorizonRadiance(snapshot.skyForFog, Math.atan2(forward[0], forward[2])) ?? PRD07_FOG_DEFAULTS.fallbackColor
    : parseFogColor(resolved.color, PRD07_FOG_DEFAULTS.fallbackColor);
  const generated = flags.values.A3D_QR_CORE_GENERATOR !== undefined ? flags.on("A3D_QR_CORE_GENERATOR") : flags.on("A3D_QR_CORE");
  const packed = packV2(resolved, { fogColor: color, cameraY: position[1], parity: !generated });
  let sunDirection: Vec3 = [0, 1, 0], sunColor: Vec3 = [1, 1, 1];
  if (snapshot.skyForFog) {
    try {
      const sky = skyFrame(snapshot.skyForFog as Parameters<typeof skyFrame>[0]);
      sunDirection = sky.preetham?.sunDirection ?? sky.gradient?.sunDirection ?? sunDirection;
      const radiance = evaluateSky(sky, sunDirection);
      sunColor = [Math.min(radiance[0], 8), Math.min(radiance[1], 8), Math.min(radiance[2], 8)];
    } catch { /* Keep the same unit fallback as the legacy fog collector. */ }
  }
  draft.beginFog(packed.fogMode, packed.fogNear, packed.fogFar);
  draft.setFogA(...packed.fogA);
  draft.setFogB(...packed.fogB);
  draft.setFogColor(...packed.fogColor);
  draft.setFogAbsorption(...packed.fogAbsorption);
  draft.setSunDirection(...sunDirection);
  draft.setSunColor(...sunColor);
  draft.setCameraPosition(...position);
  for (const volume of snapshot.fogVolumes.slice(0, A3D_MAX_FOG_VOLUMES)) {
    draft.addFogVolume(volume.shape, ...volume.center, ...volume.halfSize, volume.density);
  }
}

/** Prepare the packet before either sync or async generated-program warmup. */
export function preparePrd07RendererView(view: Prd07RendererView | undefined, camera: FrameCamera | null, flags: QrFlags): void {
  if (!view) return;
  assertPrd07RendererOperation(view.operation);
  if (view.closed || view.binding) throw new Error("PRD07_RENDERER_VIEW_INVALID");
  const { mount, snapshot } = view.operation;
  view.binding = createPrd07ManagedFrameBinding(mount.scope, view.frame, mount.renderer, mount.device,
    mount.generation, view.view, view.index, mount.authority.owner, (draft) => writeSnapshot(draft, snapshot, camera, flags));
}

/** Register every fresh FrameGraph context; registration is never source-driven. */
export function registerPrd07RendererContext(view: Prd07RendererView | undefined, context: FrameContributorContext): void {
  if (!view) return;
  assertPrd07RendererOperation(view.operation);
  if (view.closed || !view.binding) throw new Error("PRD07_RENDERER_VIEW_INVALID");
  const { mount } = view.operation;
  registerPrd07ManagedFrameContext(context, view.binding, mount.authority.owner, mount.renderer, mount.device,
    mount.generation, view.view, view.index);
  contextViews.set(context, view);
}

export function producePrd07RendererContext(view: Prd07RendererView | undefined, context: FrameContributorContext): void {
  if (!view) return;
  assertPrd07RendererOperation(view.operation);
  producePrd07ManagedFrame(context);
}

/** Extra immutable values required by background/froxel fog consumers. */
export function prd07RendererContextSnapshot(context: FrameContributorContext): Prd07RendererSnapshot | undefined {
  const view = contextViews.get(context);
  if (!view) return undefined;
  if (view.closed) throw new Error("PRD07_RENDERER_VIEW_REVOKED");
  assertPrd07RendererOperation(view.operation);
  return view.operation.snapshot;
}

/** Legacy fog draws use the same captured revision and per-view camera. */
export function prd07RendererLegacyFog(view: Prd07RendererView | undefined, camera: FrameCamera | null): ForwardEnvironmentFogOptions | false | undefined {
  if (!view) return undefined;
  assertPrd07RendererOperation(view.operation);
  const snapshot = view.operation.snapshot;
  if (!snapshot.fog) return false;
  const { position, forward } = cameraValues(camera);
  const spec = resolvePrd07FogSpec(snapshot.fog);
  const packed = packLegacy(spec, position[1]);
  const color = spec.color === "sky"
    ? skyHorizonRadiance(snapshot.skyForFog, Math.atan2(forward[0], forward[2])) ?? PRD07_FOG_DEFAULTS.fallbackColor
    : parseFogColor(spec.color, PRD07_FOG_DEFAULTS.fallbackColor);
  return { mode: packed.mode, color: [color[0], color[1], color[2]], near: packed.near, far: packed.far,
    density: packed.density, heightFalloff: packed.heightFalloff, heightReference: packed.heightReference, maxOpacity: packed.maxOpacity };
}

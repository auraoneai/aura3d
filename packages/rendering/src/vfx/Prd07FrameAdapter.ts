/**
 * PRD07 mount identities and cooperative device-frame leases.
 *
 * The internal app-managed renderer bridge uses these capabilities after the
 * private app-mount handoff establishes its app, canvas, bridge, renderer,
 * device and generation. Creating a mount here does not by itself authenticate
 * those identities. The renderer must never derive authority from a render
 * source, a property on it, or a callback on it. There is deliberately no
 * producer/callback registration API here.
 *
 * The lease serializes only participants which acquire and check it. It is not
 * a lock on public device methods, raw graphics contexts, or third-party code.
 * Such uncoordinated work is outside the managed rendering contract. No identity
 * properties are read in this module; the trusted handoff supplies the actual
 * identities and rechecks the device's live generation/loss state after every
 * await.
 *
 * Revocation invalidates a lease immediately, but does not free its device
 * slot or its renderer/app/canvas/overlay reservations. Only the original
 * operation's finally may release them after all of its work has stopped. This
 * prevents a revoked, suspended operation from racing a replacement even if
 * the replacement has a different device. Leases protect CPU-side frame construction; any
 * borrowed GPU resource still needs separate retention through completion.
 */

declare const mountBrand: unique symbol;
declare const leaseBrand: unique symbol;

export type Prd07AdapterMount = { readonly [mountBrand]: true };
export type Prd07DeviceLease = { readonly [leaseBrand]: true };

interface MountRecord {
  readonly renderer: object;
  readonly device: object;
  readonly generation: number;
  readonly owner: object;
  readonly canvas: object;
  readonly overlay: object;
  readonly managed: boolean;
  live: boolean;
}

interface LeaseRecord {
  readonly mount: MountRecord;
  released: boolean;
  waiters?: Set<() => void>;
}

const mounts = new WeakMap<Prd07AdapterMount, MountRecord>();
const mountsByRenderer = new WeakMap<object, MountRecord>();
const mountsByCanvas = new WeakMap<object, Set<MountRecord>>();
const mountsByOverlay = new WeakMap<object, MountRecord>();
const mountsByDevice = new WeakMap<object, Set<MountRecord>>();
const leases = new WeakMap<Prd07DeviceLease, LeaseRecord>();
const heldDevices = new WeakMap<object, LeaseRecord>();
const heldRenderers = new WeakMap<object, LeaseRecord>();
const heldOwners = new WeakMap<object, LeaseRecord>();
const heldCanvases = new WeakMap<object, LeaseRecord>();
const heldOverlays = new WeakMap<object, LeaseRecord>();
const busyErrors = new WeakSet<object>();

function isIdentity(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function token<T extends object>(): T {
  return Object.freeze(Object.create(null) as object) as T;
}

function retire(record: MountRecord): boolean {
  if (!record.live) return false;
  record.live = false;
  if (mountsByRenderer.get(record.renderer) === record) mountsByRenderer.delete(record.renderer);
  const canvasMounts = mountsByCanvas.get(record.canvas);
  canvasMounts?.delete(record);
  if (canvasMounts?.size === 0) mountsByCanvas.delete(record.canvas);
  if (mountsByOverlay.get(record.overlay) === record) mountsByOverlay.delete(record.overlay);
  const deviceMounts = mountsByDevice.get(record.device);
  deviceMounts?.delete(record);
  if (deviceMounts?.size === 0) mountsByDevice.delete(record.device);
  return true;
}

function requireMount(mount: Prd07AdapterMount, renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): MountRecord {
  const record = mounts.get(mount);
  if (!record?.live || record.renderer !== renderer || record.device !== device || record.generation !== generation ||
      record.owner !== owner || record.canvas !== canvas || record.overlay !== overlay ||
      mountsByRenderer.get(renderer) !== record || !mountsByCanvas.get(canvas)?.has(record) || mountsByOverlay.get(overlay) !== record) {
    throw new Error("PRD07_ADAPTER_MOUNT_INVALID");
  }
  return record;
}

/**
 * Trusted app-mount handoff only. This records identities; it does not prove
 * that the arguments belong together. One live renderer/canvas/overlay may
 * belong to only one mount, while distinct mounts may share a device.
 */
export function createPrd07AdapterMount(renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): Prd07AdapterMount {
  return createMount(renderer, device, generation, owner, canvas, overlay, false);
}

/**
 * Internal renderer bridge handoff only, after the app authority is sealed.
 * Managed mounts can share a canvas with other managed owners, never with an
 * exclusive legacy mount. This function records identities; it does not
 * authenticate an authority or inspect any render source.
 */
export function createPrd07ManagedAdapterMount(renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): Prd07AdapterMount {
  return createMount(renderer, device, generation, owner, canvas, overlay, true);
}

function createMount(renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object, managed: boolean): Prd07AdapterMount {
  if (!isIdentity(renderer) || !isIdentity(device) || !isGeneration(generation) ||
      !isIdentity(owner) || !isIdentity(canvas) || !isIdentity(overlay)) {
    throw new TypeError("PRD07_ADAPTER_MOUNT_ARGUMENT_INVALID");
  }
  const existing = mountsByCanvas.get(canvas);
  if (mountsByRenderer.has(renderer) || mountsByOverlay.has(overlay) ||
      (existing && (!managed || [...existing].some((entry) => !entry.managed || entry.owner === owner)))) {
    throw new Error("PRD07_ADAPTER_MOUNT_IN_USE");
  }
  const mount = token<Prd07AdapterMount>();
  const record: MountRecord = { renderer, device, generation, owner, canvas, overlay, managed, live: true };
  mounts.set(mount, record);
  mountsByRenderer.set(renderer, record);
  const canvasMounts = existing ?? new Set<MountRecord>();
  canvasMounts.add(record);
  if (!existing) mountsByCanvas.set(canvas, canvasMounts);
  mountsByOverlay.set(overlay, record);
  let deviceMounts = mountsByDevice.get(device);
  if (!deviceMounts) mountsByDevice.set(device, (deviceMounts = new Set()));
  deviceMounts.add(record);
  return mount;
}

/** Validate the original private mount and the actual current identities. */
export function assertPrd07AdapterMount(mount: Prd07AdapterMount, renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): void {
  requireMount(mount, renderer, device, generation, owner, canvas, overlay);
}

function heldLease(record: MountRecord): LeaseRecord | undefined {
  return heldDevices.get(record.device) ?? heldRenderers.get(record.renderer) ?? heldOwners.get(record.owner) ??
    heldCanvases.get(record.canvas) ?? heldOverlays.get(record.overlay);
}

/** Recognize only adapter-issued contention, not an arbitrary source error. */
export function isPrd07DeviceLeaseBusy(error: unknown): boolean {
  return isIdentity(error) && busyErrors.has(error);
}

function assertLeaseAvailable(record: MountRecord): void {
  if (heldLease(record)) {
    const error = new Error("PRD07_DEVICE_LEASE_BUSY");
    busyErrors.add(error);
    throw error;
  }
}

/** Preflight a synchronous managed frame before it prepares or submits work. */
export function assertPrd07DeviceLeaseAvailable(mount: Prd07AdapterMount, renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): void {
  assertLeaseAvailable(requireMount(mount, renderer, device, generation, owner, canvas, overlay));
}

/** A waiter follows the actual holder, including after the holder is revoked. */
export function waitForPrd07DeviceLeaseRelease(mount: Prd07AdapterMount, renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): Promise<void> | undefined {
  const record = requireMount(mount, renderer, device, generation, owner, canvas, overlay);
  const held = heldLease(record);
  if (!held) return undefined;
  return new Promise((resolve) => {
    (held.waiters ??= new Set()).add(resolve);
  });
}

/**
 * Fail fast on all overlap, including reentry by the same renderer. Nested
 * operations must reuse their owner's existing lease rather than reacquire it.
 */
export function acquirePrd07DeviceLease(mount: Prd07AdapterMount, renderer: object, device: object, generation: number,
  owner: object, canvas: object, overlay: object): Prd07DeviceLease {
  const record = requireMount(mount, renderer, device, generation, owner, canvas, overlay);
  assertLeaseAvailable(record);
  const lease = token<Prd07DeviceLease>();
  const entry: LeaseRecord = { mount: record, released: false };
  leases.set(lease, entry);
  heldDevices.set(device, entry);
  heldRenderers.set(renderer, entry);
  heldOwners.set(owner, entry);
  heldCanvases.set(canvas, entry);
  heldOverlays.set(overlay, entry);
  return lease;
}

/** Recheck before using a lease, especially after any asynchronous yield. */
export function assertPrd07DeviceLease(lease: Prd07DeviceLease, mount: Prd07AdapterMount,
  renderer: object, device: object, generation: number, owner: object, canvas: object, overlay: object): void {
  const record = requireMount(mount, renderer, device, generation, owner, canvas, overlay);
  const entry = leases.get(lease);
  if (!entry || entry.mount !== record || entry.released || heldDevices.get(device) !== entry ||
      heldRenderers.get(renderer) !== entry || heldOwners.get(owner) !== entry ||
      heldCanvases.get(canvas) !== entry || heldOverlays.get(overlay) !== entry) {
    throw new Error("PRD07_DEVICE_LEASE_INVALID");
  }
}

/** Release only this exact lease. A revoked lease remains releasable. */
export function releasePrd07DeviceLease(lease: Prd07DeviceLease): boolean {
  const entry = leases.get(lease);
  if (!entry || entry.released) return false;
  entry.released = true;
  if (heldDevices.get(entry.mount.device) === entry) heldDevices.delete(entry.mount.device);
  if (heldRenderers.get(entry.mount.renderer) === entry) heldRenderers.delete(entry.mount.renderer);
  if (heldOwners.get(entry.mount.owner) === entry) heldOwners.delete(entry.mount.owner);
  if (heldCanvases.get(entry.mount.canvas) === entry) heldCanvases.delete(entry.mount.canvas);
  if (heldOverlays.get(entry.mount.overlay) === entry) heldOverlays.delete(entry.mount.overlay);
  for (const resolve of entry.waiters ?? []) resolve();
  entry.waiters?.clear();
  return true;
}

/** Revoke a mount on detach, renderer disposal, replacement, or app disposal. */
export function revokePrd07AdapterMount(mount: Prd07AdapterMount): boolean {
  const record = mounts.get(mount);
  return record ? retire(record) : false;
}

/** A late loss notification for an old generation must not retire a new one. */
export function revokePrd07AdapterDeviceGeneration(device: object, generation: number): number {
  if (!isIdentity(device) || !isGeneration(generation)) return 0;
  const deviceMounts = mountsByDevice.get(device);
  if (!deviceMounts) return 0;
  let count = 0;
  for (const record of [...deviceMounts]) {
    if (record.generation === generation && retire(record)) count++;
  }
  return count;
}

/** Revoke every live mount on a disposed or lost device. */
export function revokePrd07AdapterDevice(device: object): number {
  if (!isIdentity(device)) return 0;
  const deviceMounts = mountsByDevice.get(device);
  if (!deviceMounts) return 0;
  let count = 0;
  for (const record of [...deviceMounts]) if (retire(record)) count++;
  return count;
}

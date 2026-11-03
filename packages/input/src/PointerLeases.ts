/**
 * The capture methods are optional so browser elements and headless event
 * targets can share the same coordinator without requiring a DOM element.
 */
export interface PointerCaptureTargetLike {
  setPointerCapture?(pointerId: number): void;
  hasPointerCapture?(pointerId: number): boolean;
  releasePointerCapture?(pointerId: number): void;
}

export interface TouchActionStyleLike {
  touchAction: string;
  getPropertyPriority?(property: string): string;
  setProperty?(property: string, value: string, priority?: string): void;
}

export interface TouchActionTargetLike {
  readonly style?: TouchActionStyleLike | null;
}

interface TouchActionLease {
  readonly owners: Set<object>;
  previous: string;
  priority: string;
  // Optional fields keep leases made by the first version-1 coordinator usable.
  style?: TouchActionStyleLike;
  styleInitialized?: boolean;
  ownerTokens?: Map<object, object>;
  writing?: boolean;
}

interface CaptureOwner {
  // Owners of an older capture must not invalidate a reentrant new capture.
  attempt: number | undefined;
}

interface PointerCaptureLease {
  readonly owners: Set<object>;
  ownedCapture: boolean;
  attempt: number;
  ownerStates?: Map<object, CaptureOwner>;
  revision?: number;
  requests?: number;
  pendingRelease?: { release: boolean; beforeRelease?: () => void };
  releasing?: boolean;
}

interface PointerLeaseCoordinator {
  readonly version: 1;
  readonly touchActionLeases: WeakMap<TouchActionTargetLike, TouchActionLease>;
  readonly pointerCaptureLeases: WeakMap<PointerCaptureTargetLike, Map<number, PointerCaptureLease>>;
}

// This key and the version-1 fields are a protocol between independently
// evaluated bundles in the same realm, not a module-local singleton. The
// separate global objects of other realms are intentionally not coordinated.
const pointerLeaseCoordinatorKey = Symbol.for("@aura3d/input/pointer-leases");

function isWeakMap(value: unknown): value is WeakMap<object, unknown> {
  try {
    // Unlike instanceof, this accepts a genuine WeakMap made in another realm.
    WeakMap.prototype.has.call(value, globalThis);
    return true;
  } catch {
    return false;
  }
}

function pointerLeaseCoordinator(create: true): PointerLeaseCoordinator;
function pointerLeaseCoordinator(create: false): PointerLeaseCoordinator | undefined;
function pointerLeaseCoordinator(create: boolean): PointerLeaseCoordinator | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, pointerLeaseCoordinatorKey);
  if (descriptor) {
    const candidate = descriptor.value as Partial<PointerLeaseCoordinator> | undefined;
    if (!("value" in descriptor) || descriptor.enumerable || descriptor.configurable || descriptor.writable ||
      !candidate || !Object.isFrozen(candidate)) {
      throw new Error("@aura3d/input: incompatible pointer lease coordinator");
    }
    // A frozen accessor is still executable and can hand different maps to
    // different bundles. The version-1 protocol uses frozen own data fields.
    const version = Object.getOwnPropertyDescriptor(candidate, "version");
    const touchActions = Object.getOwnPropertyDescriptor(candidate, "touchActionLeases");
    const captures = Object.getOwnPropertyDescriptor(candidate, "pointerCaptureLeases");
    if (!version || !("value" in version) || version.value !== 1 ||
      !touchActions || !("value" in touchActions) || !isWeakMap(touchActions.value) ||
      !captures || !("value" in captures) || !isWeakMap(captures.value)) {
      throw new Error("@aura3d/input: incompatible pointer lease coordinator");
    }
    return candidate as PointerLeaseCoordinator;
  }
  if (!create) return undefined;
  const coordinator: PointerLeaseCoordinator = Object.freeze({
    version: 1,
    touchActionLeases: new WeakMap<TouchActionTargetLike, TouchActionLease>(),
    pointerCaptureLeases: new WeakMap<PointerCaptureTargetLike, Map<number, PointerCaptureLease>>()
  });
  Object.defineProperty(globalThis, pointerLeaseCoordinatorKey, {
    value: coordinator,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return coordinator;
}

function touchActionPriority(style: TouchActionStyleLike): string {
  return style.getPropertyPriority?.("touch-action") ?? "";
}

/**
 * Keep the lease installed across potentially reentrant style accessors. An
 * acquire/release from an accessor only changes owners; this transaction then
 * reconciles the final state. Do not restore into a replacement style object.
 */
function reconcileTouchAction(
  element: TouchActionTargetLike,
  lease: TouchActionLease,
  leases: WeakMap<TouchActionTargetLike, TouchActionLease>
): void {
  if (lease.writing) return;
  lease.writing = true;
  try {
    // A hostile accessor can toggle owners forever. Fail instead of hanging.
    for (let pass = 0; pass < 32; pass++) {
      if (leases.get(element) !== lease) return;
      const style = element.style;
      if (leases.get(element) !== lease) return;
      if (!style) {
        if (!lease.owners.size) leases.delete(element);
        return;
      }
      const value = style.touchAction;
      const priority = touchActionPriority(style);
      if (leases.get(element) !== lease) return;
      if (element.style !== style) continue;
      if (leases.get(element) !== lease) return;

      if (!lease.owners.size) {
        // The first owner may have released from a getter before we saved or
        // changed anything. There is then no baseline to restore.
        if (lease.styleInitialized === false) {
          leases.delete(element);
          return;
        }
        // A legacy version-1 lease has no style field. Its current style is
        // the only style identity that version could have recorded.
        if ((!lease.style || lease.style === style) && value === "none" && priority === "") {
          if (lease.priority && style.setProperty) style.setProperty("touch-action", lease.previous, lease.priority);
          else style.touchAction = lease.previous;
        }
        if (leases.get(element) !== lease) return;
        if (lease.owners.size) continue;
        leases.delete(element);
        return;
      }

      if (!lease.style && lease.styleInitialized !== false && value === "none" && priority === "") {
        // The first version-1 implementation had already saved this baseline.
        lease.style = style;
      } else if (lease.style !== style || value !== "none" || priority !== "") {
        // This may be an externally edited value or a new style object. Make
        // it the restoration baseline only when applying a new lease to it.
        lease.style = style;
        lease.previous = value;
        lease.priority = priority;
        lease.styleInitialized = true;
        if (value !== "none" || priority !== "") style.touchAction = "none";
      }
      if (leases.get(element) !== lease) return;
      if (lease.owners.size) return;
      // The setter released the last owner; restore after its write completes.
    }
    throw new Error("@aura3d/input: reentrant touch-action changes did not settle");
  } finally {
    lease.writing = false;
  }
}

export function acquireTouchAction(element: TouchActionTargetLike, owner: object): boolean {
  const style = element.style;
  if (!style) return false;
  const { touchActionLeases } = pointerLeaseCoordinator(true);
  let lease = touchActionLeases.get(element);
  if (lease?.owners.has(owner)) return true;
  if (!lease) {
    lease = { owners: new Set(), previous: "", priority: "", styleInitialized: false };
    touchActionLeases.set(element, lease);
  }
  const tokens = lease.ownerTokens ??= new Map();
  const token = {};
  lease.owners.add(owner);
  tokens.set(owner, token);
  try {
    reconcileTouchAction(element, lease, touchActionLeases);
  } catch (error) {
    if (tokens.get(owner) === token) {
      lease.owners.delete(owner);
      tokens.delete(owner);
    }
    if (!lease.owners.size && touchActionLeases.get(element) === lease) {
      // A custom setter can apply the value and then throw. Best-effort
      // restoration must not mask the original error or overwrite an edit.
      try {
        reconcileTouchAction(element, lease, touchActionLeases);
      } catch {
        if (!lease.owners.size && touchActionLeases.get(element) === lease) touchActionLeases.delete(element);
      }
    }
    throw error;
  }
  return true;
}

export function releaseTouchAction(element: TouchActionTargetLike, owner: object): void {
  const touchActionLeases = pointerLeaseCoordinator(false)?.touchActionLeases;
  if (!touchActionLeases) return;
  const lease = touchActionLeases.get(element);
  if (!lease?.owners.delete(owner)) return;
  lease.ownerTokens?.delete(owner);
  if (lease.owners.size) return;
  try {
    reconcileTouchAction(element, lease, touchActionLeases);
  } catch (error) {
    if (!lease.owners.size && touchActionLeases.get(element) === lease) touchActionLeases.delete(element);
    throw error;
  }
}

function captureOwners(lease: PointerCaptureLease): Map<object, CaptureOwner> {
  const states = lease.ownerStates ??= new Map();
  // Older version-1 bundles can add owners without the optional bookkeeping.
  for (const owner of lease.owners) {
    if (!states.has(owner)) states.set(owner, { attempt: lease.attempt });
  }
  for (const owner of states.keys()) {
    if (!lease.owners.has(owner)) states.delete(owner);
  }
  return states;
}

function hasPointerCapture(element: PointerCaptureTargetLike, pointerId: number): boolean | undefined {
  try { return element.hasPointerCapture?.(pointerId); } catch { return undefined; }
}

function requestPointerCapture(
  element: PointerCaptureTargetLike,
  pointerId: number,
  lease: PointerCaptureLease,
  leases: WeakMap<PointerCaptureTargetLike, Map<number, PointerCaptureLease>>,
  owner?: object,
  ownerState?: CaptureOwner
): void {
  const current = (): boolean => leases.get(element)?.get(pointerId) === lease && lease.owners.size > 0 &&
    (owner === undefined || (lease.owners.has(owner) && lease.ownerStates?.get(owner) === ownerState));
  for (let pass = 0; pass < 32 && current(); pass++) {
    const observedAttempt = lease.attempt;
    const observedRevision = lease.revision;
    const observedOwners = lease.owners.size;
    const captured = hasPointerCapture(element, pointerId);
    if (!current()) return;
    // Another bundle may have changed ownership or requested capture while
    // the query was running, including observing an external capture.
    if (lease.attempt !== observedAttempt || lease.revision !== observedRevision ||
      lease.owners.size !== observedOwners) continue;
    if (captured) {
      for (const state of captureOwners(lease).values()) {
        if (state.attempt === undefined) state.attempt = lease.attempt;
      }
      return;
    }
    const setCapture = element.setPointerCapture;
    if (!current()) return;
    if (lease.attempt !== observedAttempt || lease.revision !== observedRevision ||
      lease.owners.size !== observedOwners) continue;
    if (!setCapture) return;
    const attempt = ++lease.attempt;
    // Without a working capture query we cannot distinguish an external owner.
    // Request capture, but never release something we cannot prove we acquired.
    lease.ownedCapture = captured === false;
    const states = captureOwners(lease);
    for (const state of states.values()) {
      if (state.attempt === undefined) state.attempt = attempt;
    }
    lease.requests = (lease.requests ?? 0) + 1;
    let failed = false;
    let failure: unknown;
    try {
      setCapture.call(element, pointerId);
    } catch (error) {
      if (leases.get(element)?.get(pointerId) === lease && lease.attempt === attempt) {
        lease.ownedCapture = false;
        for (const state of states.values()) {
          if (state.attempt === attempt) state.attempt = undefined;
        }
      }
      failed = true;
      failure = error;
    } finally {
      lease.requests--;
      if (!lease.requests && !lease.owners.size && lease.pendingRelease &&
        leases.get(element)?.get(pointerId) === lease) {
        const pending = lease.pendingRelease;
        lease.pendingRelease = undefined;
        try {
          finishPointerCaptureRelease(element, pointerId, lease, leases, pending.release, pending.beforeRelease);
        } catch (error) {
          if (!failed) { failed = true; failure = error; }
        }
      }
    }
    if (failed) throw failure;
    return;
  }
  if (current()) throw new Error("@aura3d/input: reentrant pointer capture changes did not settle");
}

export function acquirePointerCapture(element: PointerCaptureTargetLike | undefined, pointerId: number, owner: object): void {
  if (!element || !("setPointerCapture" in element)) return;
  const { pointerCaptureLeases } = pointerLeaseCoordinator(true);
  let pointers = pointerCaptureLeases.get(element);
  if (!pointers) {
    pointers = new Map();
    pointerCaptureLeases.set(element, pointers);
  }
  let lease = pointers.get(pointerId);
  if (!lease) {
    lease = { owners: new Set(), ownedCapture: false, attempt: 0 };
    pointers.set(pointerId, lease);
  }
  if (lease.owners.has(owner)) return;
  const states = captureOwners(lease);
  const state: CaptureOwner = { attempt: undefined };
  lease.owners.add(owner);
  states.set(owner, state);
  lease.revision = (lease.revision ?? 0) + 1;
  // Resolve the optional method only after registering the owner: a custom
  // getter may synchronously release this very acquisition.
  let setCapture: PointerCaptureTargetLike["setPointerCapture"];
  try {
    setCapture = element.setPointerCapture;
  } catch (error) {
    if (states.get(owner) === state) {
      states.delete(owner);
      lease.owners.delete(owner);
      lease.revision++;
      if (!lease.owners.size && !lease.releasing && !lease.requests) {
        deleteCaptureLease(element, pointerId, lease, pointerCaptureLeases);
      }
    }
    throw error;
  }
  if (states.get(owner) !== state || pointerCaptureLeases.get(element)?.get(pointerId) !== lease) return;
  if (!setCapture) {
    states.delete(owner);
    lease.owners.delete(owner);
    lease.revision++;
    if (!lease.owners.size && !lease.releasing && !lease.requests) {
      deleteCaptureLease(element, pointerId, lease, pointerCaptureLeases);
    }
    return;
  }
  lease.pendingRelease = undefined;
  requestPointerCapture(element, pointerId, lease, pointerCaptureLeases, owner, state);
}

function deleteCaptureLease(
  element: PointerCaptureTargetLike,
  pointerId: number,
  lease: PointerCaptureLease,
  leases: WeakMap<PointerCaptureTargetLike, Map<number, PointerCaptureLease>>
): void {
  const pointers = leases.get(element);
  if (pointers?.get(pointerId) !== lease) return;
  pointers.delete(pointerId);
  if (!pointers.size) leases.delete(element);
}

export function releasePointerCaptureLease(
  element: PointerCaptureTargetLike | undefined,
  pointerId: number,
  owner: object,
  release: boolean,
  beforeRelease?: () => void
): void {
  if (!element) return;
  const pointerCaptureLeases = pointerLeaseCoordinator(false)?.pointerCaptureLeases;
  if (!pointerCaptureLeases) return;
  const pointers = pointerCaptureLeases.get(element);
  const lease = pointers?.get(pointerId);
  if (!lease?.owners.has(owner)) return;
  const states = captureOwners(lease);
  const ownerState = states.get(owner);
  lease.owners.delete(owner);
  states.delete(owner);
  lease.revision = (lease.revision ?? 0) + 1;
  if (!release && ownerState?.attempt === lease.attempt) lease.ownedCapture = false;
  if (lease.owners.size || lease.releasing) return;
  if (lease.requests) {
    // A synthetic target may release an owner before setPointerCapture has
    // actually taken effect. Finish only after that request returns.
    lease.pendingRelease = { release, beforeRelease };
    return;
  }
  finishPointerCaptureRelease(element, pointerId, lease, pointerCaptureLeases, release, beforeRelease);
}

function finishPointerCaptureRelease(
  element: PointerCaptureTargetLike,
  pointerId: number,
  lease: PointerCaptureLease,
  pointerCaptureLeases: WeakMap<PointerCaptureTargetLike, Map<number, PointerCaptureLease>>,
  release: boolean,
  beforeRelease?: () => void
): void {
  if (!release || !lease.ownedCapture) {
    deleteCaptureLease(element, pointerId, lease, pointerCaptureLeases);
    return;
  }

  lease.releasing = true;
  let invoked = false;
  let failed = false;
  let failure: unknown;
  try {
    const current = (): boolean => pointerCaptureLeases.get(element)?.get(pointerId) === lease &&
      !lease.owners.size && lease.ownedCapture;
    const captured = hasPointerCapture(element, pointerId);
    if (!current() || !captured) return;
    const releaseCapture = element.releasePointerCapture;
    if (!current() || !releaseCapture) return;
    // Notify before the browser call: synthetic targets can dispatch the loss
    // synchronously, including a reentrant press during release.
    beforeRelease?.();
    if (!current() || !hasPointerCapture(element, pointerId) || !current()) return;
    // A press reentered from the native method gets a fresh lease. Its
    // capture is checked again after the method returns.
    deleteCaptureLease(element, pointerId, lease, pointerCaptureLeases);
    invoked = true;
    releaseCapture.call(element, pointerId);
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    lease.releasing = false;
    if (!lease.owners.size) deleteCaptureLease(element, pointerId, lease, pointerCaptureLeases);
    if (invoked) {
      const replacement = pointerCaptureLeases.get(element)?.get(pointerId);
      if (replacement?.owners.size) {
        try {
          requestPointerCapture(element, pointerId, replacement, pointerCaptureLeases);
        } catch (error) {
          if (!failed) { failed = true; failure = error; }
        }
      }
    }
  }
  if (failed) throw failure;
}

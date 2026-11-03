/**
 * evidence/beacon.ts — PRD-09 day-0 (`window.__AURA3D_GAME__`, C-24 §6.4).
 *
 * Installs a FROZEN beacon object that is REPLACED (never mutated) when
 * session state changes, and refreshed at most ~4x/second for the frame
 * counter.
 */

import type { GameBeacon, GameSessionState } from "@aura3d/engine";

export interface BeaconOptions {
  readonly route: string;
  /** Defaults to "playing" for routes that do not use a game session. */
  readonly getState?: () => GameSessionState;
  readonly getFrame?: () => number;
  readonly getFirstFrameAt?: () => number | null;
  /** Live mounted app for audit lanes (beacon.app.scene / app.diagnostics()). */
  readonly getApp?: () => GameBeacon["app"] | undefined;
  readonly getSession?: () => unknown;
  /** Window globals that receive the raw evidence object on every `publishEvidence` (legacy readers such as `__AURA3D_GAME_EVIDENCE__`). */
  readonly evidenceGlobals?: readonly string[];
  readonly win?: { __AURA3D_GAME__?: GameBeacon } & Record<string, unknown>;
}

export interface BeaconHandle {
  refresh(): void;
  /**
   * Publish a route evidence snapshot on the beacon: the beacon fields (route, state, frame, ...) plus the
   * evidence fields, evidence winning on a shared key. Getters on the evidence object stay lazy. The snapshot
   * is also assigned to `evidenceGlobals`. Call once per frame (or per change); each call replaces the beacon.
   */
  publishEvidence(evidence: object): void;
  dispose(): void;
}

type PropertyReference =
  | { readonly owner: BeaconPropertyOwner }
  | { readonly descriptor: PropertyDescriptor | undefined };

interface BeaconPropertyOwner {
  readonly target: Record<string, unknown>;
  readonly name: string;
  readonly order: number;
  readonly mode: "data" | "setter";
  previous: PropertyReference;
  descriptor: PropertyDescriptor;
  value: unknown;
  applied: boolean;
  active: boolean;
}

interface BeaconAlias {
  readonly name: string;
  readonly anchor: PropertyReference;
  property?: BeaconPropertyOwner;
  detached: boolean;
}

const propertyOwners = new WeakMap<object, Map<string, BeaconPropertyOwner>>();
let nextBeaconOrder = 0;

function sameDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.configurable === b.configurable &&
    a.enumerable === b.enumerable &&
    a.writable === b.writable &&
    a.get === b.get &&
    a.set === b.set &&
    Object.is(a.value, b.value) &&
    ("value" in a) === ("value" in b);
}

function currentProperty(target: Record<string, unknown>, name: string): PropertyReference {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  const owners = propertyOwners.get(target);
  const owner = owners?.get(name);
  if (owner?.active && sameDescriptor(descriptor, owner.descriptor)) return { owner };
  if (owner !== undefined) {
    owners!.delete(name);
    if (owners!.size === 0) propertyOwners.delete(target);
  }
  return { descriptor };
}

function containsReference(reference: PropertyReference, anchor: PropertyReference): boolean {
  while ("owner" in anchor && !anchor.owner.active) anchor = anchor.owner.previous;
  while ("owner" in reference) {
    if ("owner" in anchor && reference.owner === anchor.owner) return true;
    reference = reference.owner.previous;
  }
  return !("owner" in anchor) && sameDescriptor(reference.descriptor, anchor.descriptor);
}

function writableDescriptor(descriptor: PropertyDescriptor | undefined, value: unknown): PropertyDescriptor {
  if (descriptor?.configurable === false) {
    if (!("value" in descriptor) || descriptor.writable !== true) {
      throw new TypeError("GAME_BEACON_GLOBAL_UNAVAILABLE_V1: The beacon global cannot be replaced.");
    }
    return { ...descriptor, value };
  }
  return {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value
  };
}

function installProperty(
  target: Record<string, unknown>,
  name: string,
  order: number,
  anchor: PropertyReference,
  value: unknown,
  allowSetter = false
): BeaconPropertyOwner | undefined {
  const current = currentProperty(target, name);
  let previous = current;
  let successor: BeaconPropertyOwner | undefined;
  while ("owner" in previous && previous.owner.order > order) {
    successor = previous.owner;
    previous = successor.previous;
  }
  if (!containsReference(previous, anchor)) return undefined;

  const priorDescriptor = successor?.descriptor ?? ("owner" in current ? current.owner.descriptor : current.descriptor);
  const mode = successor?.mode ??
    (allowSetter && priorDescriptor !== undefined && !("value" in priorDescriptor) && priorDescriptor.set !== undefined
      ? "setter"
      : "data");
  const descriptor = mode === "setter"
    ? priorDescriptor!
    : successor !== undefined
      ? { ...successor.descriptor, value }
      : writableDescriptor(priorDescriptor, value);
  const owner: BeaconPropertyOwner = {
    target, name, order, mode, previous, descriptor, value, applied: mode === "data", active: true
  };
  if (successor !== undefined) {
    successor.previous = { owner };
    return owner;
  }

  if (mode === "data") Object.defineProperty(target, name, descriptor);
  let owners = propertyOwners.get(target);
  if (owners === undefined) {
    owners = new Map();
    propertyOwners.set(target, owners);
  }
  owners.set(name, owner);
  return owner;
}

function updateProperty(owner: BeaconPropertyOwner, value: unknown): void {
  if (!owner.active) return;
  const current = currentProperty(owner.target, owner.name);
  if ("owner" in current && current.owner === owner) {
    if (owner.mode === "setter") {
      owner.descriptor.set!.call(owner.target, value);
      owner.applied = true;
    } else {
      const descriptor = { ...owner.descriptor, value };
      Object.defineProperty(owner.target, owner.name, descriptor);
      owner.descriptor = descriptor;
    }
  }
  owner.value = value;
}

function releaseProperty(owner: BeaconPropertyOwner): void {
  if (!owner.active) return;
  const current = currentProperty(owner.target, owner.name);
  owner.active = false;
  if (!("owner" in current)) return;
  if (current.owner !== owner) {
    let successor = current.owner;
    while ("owner" in successor.previous) {
      if (successor.previous.owner === owner) {
        successor.previous = owner.previous;
        return;
      }
      successor = successor.previous.owner;
    }
    return;
  }

  let previous = owner.previous;
  while ("owner" in previous && !previous.owner.active) previous = previous.owner.previous;
  const owners = propertyOwners.get(owner.target)!;
  if ("owner" in previous) {
    if (previous.owner.mode === "setter") {
      if (owner.applied) {
        previous.owner.descriptor.set!.call(owner.target, previous.owner.value);
        previous.owner.applied = true;
      }
    } else {
      const descriptor = { ...previous.owner.descriptor, value: previous.owner.value };
      Object.defineProperty(owner.target, owner.name, descriptor);
      previous.owner.descriptor = descriptor;
    }
    owners.set(owner.name, previous.owner);
  } else {
    if (previous.descriptor === undefined) {
      if (!Reflect.deleteProperty(owner.target, owner.name)) {
        throw new TypeError("GAME_BEACON_GLOBAL_UNAVAILABLE_V1: The beacon global cannot be removed.");
      }
    } else {
      Object.defineProperty(owner.target, owner.name, previous.descriptor);
    }
    owners.delete(owner.name);
    if (owners.size === 0) propertyOwners.delete(owner.target);
  }
}

const FRAME_REFRESH_MS = 250; // <= 4 Hz

export function installGameBeacon(options: BeaconOptions): BeaconHandle {
  const win: Record<string, unknown> | undefined =
    options.win ?? (typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined);
  if (win === undefined) {
    return { refresh() {}, publishEvidence() {}, dispose() {} };
  }

  const order = ++nextBeaconOrder;
  const primaryAnchor = currentProperty(win, "__AURA3D_GAME__");
  const aliases: BeaconAlias[] = [...new Set(options.evidenceGlobals ?? [])]
    .filter((name) => name !== "__AURA3D_GAME__")
    .map((name) => ({ name, anchor: currentProperty(win, name), detached: false }));
  const sessionStartedAt = Date.now();
  let firstFrameAt: number | null = null;
  let frame = 0;
  const readState = options.getState ?? (() => "playing" as GameSessionState);
  const readFrame = options.getFrame ?? (() => 0);
  const readFirstFrameAt = options.getFirstFrameAt ?? (() => null);
  let evidence: object | null = null;
  let state: GameSessionState = readState();
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const snapshot = (nextState: GameSessionState, nextFrame: number, nextFirstFrameAt: number | null, nextEvidence: object | null) => {
    const app = options.getApp?.();
    if (disposed) return undefined;
    const beacon: Record<string, unknown> = {
      route: options.route, state: nextState, frame: nextFrame, firstFrameAt: nextFirstFrameAt, sessionStartedAt
    };
    if (nextEvidence !== null) {
      const descriptors = Object.getOwnPropertyDescriptors(nextEvidence);
      if (disposed) return undefined;
      Object.defineProperties(beacon, descriptors);
    }
    // Live handles stay reachable for audit lanes but are not enumerable, so JSON.stringify and remote capture serialize the beacon (app.post is circular).
    const hidden = (value: unknown) => ({ value, enumerable: false, writable: false, configurable: false });
    const free = (key: string) => !Object.prototype.hasOwnProperty.call(beacon, key);
    if (app !== undefined && free("app")) Object.defineProperty(beacon, "app", hidden(app));
    if (app !== undefined && free("scene")) {
      const scene = app.scene;
      if (disposed) return undefined;
      Object.defineProperty(beacon, "scene", hidden(scene));
    }
    if (options.getSession !== undefined && free("session")) {
      const session = options.getSession();
      if (disposed) return undefined;
      Object.defineProperty(beacon, "session", hidden(session));
    }
    return Object.freeze(beacon) as unknown as GameBeacon;
  };

  const initialBeacon = snapshot(state, frame, firstFrameAt, evidence);
  const primary = initialBeacon === undefined
    ? undefined
    : installProperty(win, "__AURA3D_GAME__", order, primaryAnchor, initialBeacon);
  if (primary === undefined) {
    throw new Error("GAME_BEACON_GLOBAL_UNAVAILABLE_V1: The beacon global changed during installation.");
  }

  /** Re-publish now — call from session "state" events and first-frame. */
  const refresh = () => {
    if (disposed) return;
    const nextState = readState();
    if (disposed) return;
    const nextFirstFrameAt = readFirstFrameAt();
    if (disposed) return;
    const nextBeacon = snapshot(nextState, frame, nextFirstFrameAt, evidence);
    if (disposed || nextBeacon === undefined) return;
    updateProperty(primary, nextBeacon);
    state = nextState;
    firstFrameAt = nextFirstFrameAt;
  };

  const publishEvidence = (next: object) => {
    if (disposed) return;
    const nextState = readState();
    if (disposed) return;
    const nextFrame = readFrame();
    if (disposed) return;
    const nextFirstFrameAt = readFirstFrameAt();
    if (disposed) return;
    const nextBeacon = snapshot(nextState, nextFrame, nextFirstFrameAt, next);
    if (disposed || nextBeacon === undefined) return;
    const acquired: BeaconAlias[] = [];
    try {
      for (const alias of aliases) {
        if (alias.property !== undefined || alias.detached) continue;
        alias.property = installProperty(win, alias.name, order, alias.anchor, next, true);
        if (alias.property === undefined) alias.detached = true;
        else acquired.push(alias);
      }
      for (const alias of aliases) {
        if (disposed) return;
        if (alias.property !== undefined) updateProperty(alias.property, next);
      }
      if (disposed) return;
      updateProperty(primary, nextBeacon);
    } catch (error) {
      const failures: unknown[] = [error];
      for (const alias of acquired.reverse()) {
        if (alias.property === undefined) continue;
        try {
          releaseProperty(alias.property);
        } catch (cleanupError) {
          failures.push(cleanupError);
        }
        alias.property = undefined;
      }
      if (failures.length > 1) throw new AggregateError(failures, "Beacon publication and cleanup failed.", { cause: error });
      throw error;
    }
    evidence = next;
    state = nextState;
    frame = nextFrame;
    firstFrameAt = nextFirstFrameAt;
  };

  try {
    if (typeof setInterval === "function") {
      timer = setInterval(() => {
        if (disposed) return;
        const next = readFrame();
        if (disposed || next === frame) return;
        const nextBeacon = snapshot(state, next, firstFrameAt, evidence);
        if (disposed || nextBeacon === undefined) return;
        updateProperty(primary, nextBeacon);
        frame = next;
      }, FRAME_REFRESH_MS);
      if (typeof timer === "object" && timer !== null && "unref" in timer) {
        (timer as { unref(): void }).unref();
      }
    }
  } catch (error) {
    if (timer !== null) clearInterval(timer);
    try {
      releaseProperty(primary);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Beacon installation and cleanup failed.", { cause: error });
    }
    throw error;
  }

  return {
    refresh,
    publishEvidence,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      const failures: unknown[] = [];
      for (const alias of aliases) {
        if (alias.property === undefined) continue;
        try {
          releaseProperty(alias.property);
        } catch (error) {
          failures.push(error);
        }
        alias.property = undefined;
      }
      try {
        releaseProperty(primary);
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "Beacon cleanup failed.");
    }
  };
}

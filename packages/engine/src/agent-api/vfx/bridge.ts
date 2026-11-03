// PRD-07 — render-source bridge: publishes the per-app effect feed and
// atmosphere state on the canvas's production-runtime source, so the
// prd07.* frame contributors see them through ctx.source.
// (Workaround for CCR-07-1: FrameContributorContext has no canvas/app pointer.)

import { attachOwnedRootRenderSourceOverlay, attachRootRenderSourceOverlay } from "../RootRuntimeSupport";
import type { ProductionEffectSystem } from "../../production-runtime/effects/ProductionEffectSystem";
import type { AtmosphereRenderSnapshot } from "../../production-runtime/effects/LiveAtmosphere";

export interface VfxBridge {
  readonly detach: () => void;
  readonly attached: boolean;
  /** Exact overlay identity; this alone is not renderer authority. */
  readonly overlay: object | null;
  readonly onDetach: (listener: () => void) => () => void;
}

/** Internal mount handoff issued only for the owning app, canvas and sealed runtime owner. */
export interface Prd07MountAuthority {
  readonly owner: object;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: object;
  isLive(): boolean;
  capture(): AtmosphereRenderSnapshot | null;
  isCurrent(snapshot: AtmosphereRenderSnapshot): boolean;
  onChange(listener: () => void): () => void;
  onRevoke(listener: () => void): () => void;
  noteCamera(x: number, y: number, z: number, fx: number, fy: number, fz: number): void;
}

/** Identity proof for an overlay actually created by this module. */
class OwnedVfxBridge implements VfxBridge {
  readonly #system: ProductionEffectSystem;
  readonly #canvas: HTMLCanvasElement;
  readonly #overlay: object;
  readonly #detach: () => void;
  readonly #attached: () => boolean;
  readonly #onDetach: (listener: () => void) => () => void;
  readonly #bindOwner: ((owner: object) => void) | undefined;
  constructor(system: ProductionEffectSystem, canvas: HTMLCanvasElement, overlay: object, detach: () => void,
    attached: () => boolean, onDetach: (listener: () => void) => () => void, bindOwner?: (owner: object) => void) {
    this.#system = system;
    this.#canvas = canvas;
    this.#overlay = overlay;
    this.#detach = detach;
    this.#attached = attached;
    this.#onDetach = onDetach;
    this.#bindOwner = bindOwner;
  }
  static owns(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement): value is OwnedVfxBridge {
    return typeof value === "object" && value !== null && #system in value && value.#system === system && value.#canvas === canvas;
  }
  static overlayFor(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement): object | null {
    return typeof value === "object" && value !== null && #system in value && value.#system === system &&
      value.#canvas === canvas && value.#attached() ? value.#overlay : null;
  }
  static onOwnedDetach(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement, listener: () => void): () => void {
    if (typeof value !== "object" || value === null || !(#system in value) || value.#system !== system || value.#canvas !== canvas) {
      listener();
      return () => {};
    }
    return value.#onDetach(listener);
  }
  static bindOwner(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement, owner: object): void {
    if (typeof value !== "object" || value === null || !(#system in value) || value.#system !== system ||
        value.#canvas !== canvas || !value.#attached() || !value.#bindOwner) {
      throw new Error("VFX_OVERLAY_OWNER_MISMATCH");
    }
    value.#bindOwner(owner);
  }
  static detachFor(value: unknown, system: ProductionEffectSystem): void {
    if (typeof value === "object" && value !== null && #system in value && value.#system === system) value.#detach();
  }
  get attached(): boolean { return this.#attached(); }
  get overlay(): object { return this.#overlay; }
  detach(): void { this.#detach(); }
  onDetach(listener: () => void): () => void { return this.#onDetach(listener); }
}

const bridgeOwns = OwnedVfxBridge.owns;
const bridgeOverlayFor = OwnedVfxBridge.overlayFor;
const bridgeOnOwnedDetach = OwnedVfxBridge.onOwnedDetach;
const bridgeBindOwner = OwnedVfxBridge.bindOwner;
const bridgeDetachFor = OwnedVfxBridge.detachFor;

/** Does not inspect properties on lookalikes or proxies. */
export function isOwnedVfxBridge(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement): value is VfxBridge {
  return bridgeOwns(value, system, canvas);
}

export function ownedVfxBridgeOverlay(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement): object | null {
  return bridgeOverlayFor(value, system, canvas);
}

export function onOwnedVfxBridgeDetach(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement, listener: () => void): () => void {
  return bridgeOnOwnedDetach(value, system, canvas, listener);
}

/** Bind only an authentic bridge after its system has sealed this app's owner. */
export function bindOwnedVfxBridge(value: unknown, system: ProductionEffectSystem, canvas: HTMLCanvasElement, owner: object): void {
  bridgeBindOwner(value, system, canvas, owner);
}

/** Bypass mutable public methods when revoking a system-owned bridge. */
export function detachOwnedVfxBridge(value: unknown, system: ProductionEffectSystem): void {
  bridgeDetachFor(value, system);
}

/**
 * Standalone integrations retain the exclusive ownerless canvas slot. App
 * integrations use a separate provisional slot until their owner is sealed.
 */
export function attachVfxBridge(canvas: HTMLCanvasElement, system: ProductionEffectSystem): VfxBridge {
  return createVfxBridge(canvas, system, false);
}

export function attachAppVfxBridge(canvas: HTMLCanvasElement, system: ProductionEffectSystem, isSealedOwner: (owner: object) => boolean): VfxBridge {
  return createVfxBridge(canvas, system, true, isSealedOwner);
}

function createVfxBridge(canvas: HTMLCanvasElement, system: ProductionEffectSystem, appOwned: boolean,
  isSealedOwner?: (owner: object) => boolean): VfxBridge {
  let closed = false;
  let detachOverlay: () => void = () => {};
  let bindOverlayOwner: ((owner: object) => void) | undefined;
  let offSystem: () => void = () => {};
  const subscriptions = new Set<() => void>();
  const detachListeners = new Set<() => void>();
  const detach = (): void => {
    if (closed) return;
    closed = true;
    const errors: unknown[] = [];
    const attempt = (cleanup: () => void): void => { try { cleanup(); } catch (error) { errors.push(error); } };
    attempt(detachOverlay);
    attempt(offSystem);
    for (const unsubscribe of [...subscriptions]) attempt(unsubscribe);
    for (const listener of [...detachListeners]) attempt(listener);
    detachListeners.clear();
    if (errors.length) throw new AggregateError(errors, "Failed to detach the app's VFX bridge cleanly.");
  };
  const subscribe = (register: (listener: () => void) => () => void, listener: () => void): (() => void) => {
    if (closed) return () => {};
    const off = register(listener);
    const unsubscribe = (): void => { if (subscriptions.delete(unsubscribe)) off(); };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  };
  const atmosphere = {
    get sky() { return closed ? null : system.atmosphere.state().sky as Record<string, unknown> | null; },
    // Existing live accessors continue to serve the legacy contributors.
    resolveFog: (t: number) => closed ? null : system.atmosphere.resolveFog(t),
    fogVolumes: () => closed ? [] : system.atmosphere.fogVolumes(),
    noteCamera: (position: readonly [number, number, number], forward: readonly [number, number, number]) => {
      if (!closed) system.atmosphere.noteCamera(position, forward);
    },
    clockNow: () => closed ? 0 : system.atmosphere.clockNow(),
    state: () => closed ? { sky: null, fog: null, wetness: 0 } : system.atmosphere.state(),
    onSkyChanged: (listener: () => void) => subscribe((callback) => system.atmosphere.onSkyChanged(callback), listener),
    /** A value copy; the renderer must separately authenticate its source. */
    renderSnapshot: (): AtmosphereRenderSnapshot | null => closed ? null : system.captureAtmosphereSnapshot(),
    isRenderSnapshotCurrent: (snapshot: AtmosphereRenderSnapshot): boolean =>
      !closed && system.captureAtmosphereSnapshot() === snapshot,
    onRenderChange: (listener: () => void): (() => void) =>
      subscribe((callback) => system.atmosphere.onRenderChange(callback), listener),
    /** The trusted frame adapter provides its writer and the one captured value. */
    writePrd07Wetness: (snapshot: AtmosphereRenderSnapshot, writer: {
      setWetness(wetness: number, puddleThreshold: number, rainRipples: number, snowCover: number, puddleNoise: null): void;
    }): void => {
      if (closed || system.captureAtmosphereSnapshot() !== snapshot) throw new Error("PRD07_ATMOSPHERE_SNAPSHOT_STALE");
      const wet = snapshot.wetness;
      writer.setWetness(wet.wetness, wet.puddleThreshold, wet.rainRipples, wet.snowCover, null);
    }
  };
  const source = {
    get vfx() {
      if (closed) return null;
      // Read once per renderer frame (the frame's render-input spread).
      system.noteRenderFrame();
      return {
        feed: (hook: Parameters<ProductionEffectSystem["feed"]>[0]) => { if (!closed) system.feed(hook); },
        afterDraw: (diag: Parameters<ProductionEffectSystem["afterDraw"]>[0]) => { if (!closed) system.afterDraw(diag); },
        lightsFeed: () => closed ? [] : system.collectedLights(),
        ribbonFeed: () => closed ? undefined : system.ribbonFeed(),
        beamFeed: () => closed ? [] : system.beamFeed(),
        meshFeed: () => closed ? [] : system.meshFeed(),
        decalFeed: () => closed ? undefined : system.decalFeed(),
        gpuSimFeed: () => closed ? [] : system.gpuSimFeed()
      };
    },
    // P2-T7: transient pool lights flow into the compiled collectedLights
    // merge (renderInput.ts) — fresh each frame because the getter re-reads.
    get collectedLights() {
      return closed ? [] : system.collectedLights();
    },
    atmosphere
  };
  try {
    if (appOwned) {
      const registration = attachOwnedRootRenderSourceOverlay(canvas, source, system);
      detachOverlay = registration.detach;
      bindOverlayOwner = (owner) => {
        if (!isSealedOwner?.(owner)) throw new Error("VFX_OVERLAY_OWNER_NOT_SEALED");
        registration.bindOwner(owner);
      };
    } else {
      detachOverlay = attachRootRenderSourceOverlay(canvas, source);
    }
  } catch {
    detach();
    system.diagnostics.note(
      "VFX_APP_BINDING_AMBIGUOUS",
      "",
      "the requested prd07 vfx source overlay slot is already occupied"
    );
    return { detach: () => {}, attached: false, overlay: null, onDetach: (listener) => { listener(); return () => {}; } };
  }
  try {
    offSystem = system.onDispose(detach);
    if (!closed) system.noteRenderBridgeAttached();
    return new OwnedVfxBridge(system, canvas, source, detach, () => !closed, (listener) => {
      if (closed) { listener(); return () => {}; }
      detachListeners.add(listener);
      return () => { detachListeners.delete(listener); };
    }, bindOverlayOwner);
  } catch (error) {
    try { detach(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "VFX bridge attachment and cleanup failed.");
    }
    throw error;
  }
}

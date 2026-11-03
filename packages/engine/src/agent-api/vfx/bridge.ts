// PRD-07 — render-source bridge: publishes the per-app effect feed and
// atmosphere state on the canvas's production-runtime source, so the
// prd07.* frame contributors see them through ctx.source.
// (Workaround for CCR-07-1: FrameContributorContext has no canvas/app pointer.)

import { attachOwnedRootRenderSourceOverlay, attachRootRenderSourceOverlay } from "../RootRuntimeSupport";
import { registerStockFrameFeed } from "@aura3d/rendering/contracts";
import { ProductionEffectSystem } from "../../production-runtime/effects/ProductionEffectSystem";
import { LiveAtmosphere, type AtmosphereRenderSnapshot } from "../../production-runtime/effects/LiveAtmosphere";
import { EffectDiagnostics } from "../../production-runtime/effects/EffectDiagnostics";
import { TransientLightPool } from "../../production-runtime/effects/TransientLightPool";
import { RibbonBatch } from "@aura3d/rendering";

// These snapshots are captured from the actual built-ins, not from a source
// supplied by an application. Instance overrides or later prototype changes
// make the otherwise opaque bridge provenance ineligible.
const systemMethods = Object.getOwnPropertyDescriptors(ProductionEffectSystem.prototype);
const atmosphereMethods = Object.getOwnPropertyDescriptors(LiveAtmosphere.prototype);
const diagnosticMethods = Object.getOwnPropertyDescriptors(EffectDiagnostics.prototype);
const lightMethods = Object.getOwnPropertyDescriptors(TransientLightPool.prototype);
const ribbonMethods = Object.getOwnPropertyDescriptors(RibbonBatch.prototype);

function unmodifiedInstance(value: unknown, prototype: object, expected: PropertyDescriptorMap): boolean {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== prototype) return false;
  for (const key of Reflect.ownKeys(expected)) {
    if (key === "constructor") continue;
    const original = Reflect.get(expected, key) as PropertyDescriptor;
    const current = Object.getOwnPropertyDescriptor(prototype, key);
    if (Object.getOwnPropertyDescriptor(value, key) || !current ||
        current.value !== original.value || current.get !== original.get || current.set !== original.set) return false;
  }
  return Reflect.ownKeys(prototype).length === Reflect.ownKeys(expected).length;
}

function emptyOwnMap(value: object, name: string): boolean {
  const map = Object.getOwnPropertyDescriptor(value, name)?.value;
  return Boolean(map instanceof Map && Object.getPrototypeOf(map) === Map.prototype &&
    Reflect.ownKeys(map).length === 0 && Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!.call(map) === 0);
}

function emptyOwnArray(value: object, name: string): boolean {
  const array = Object.getOwnPropertyDescriptor(value, name)?.value;
  return Array.isArray(array) && Object.getPrototypeOf(array) === Array.prototype && array.length === 0;
}

/** Only the empty stock system is certified; active VFX stays fail-closed. */
function emptyStockSystem(system: ProductionEffectSystem): boolean {
  // The system's `atmosphere` is a private field behind a prototype getter
  // (native 5.0). Read it only after the instance and its prototype accessors
  // are verified stock, so the getter cannot be an application substitute.
  if (!unmodifiedInstance(system, ProductionEffectSystem.prototype, systemMethods)) return false;
  // The captured built-in getter brand-checks `#atmosphere`, so a proxy or
  // lookalike throws here (validate callers treat a throw as ineligible).
  const stockGetter = (systemMethods as Record<string, PropertyDescriptor | undefined>)["atmosphere"]?.get;
  const atmosphere = (stockGetter ? stockGetter.call(system) : Object.getOwnPropertyDescriptor(system, "atmosphere")?.value) as LiveAtmosphere | undefined;
  if (!atmosphere) return false;
  const diagnostics = Object.getOwnPropertyDescriptor(system, "diagnostics")?.value;
  const lights = Object.getOwnPropertyDescriptor(system, "transientLights")?.value;
  const ribbons = Object.getOwnPropertyDescriptor(system, "ribbons")?.value;
  if (!unmodifiedInstance(atmosphere, LiveAtmosphere.prototype, atmosphereMethods) ||
      !unmodifiedInstance(diagnostics, EffectDiagnostics.prototype, diagnosticMethods) ||
      !unmodifiedInstance(lights, TransientLightPool.prototype, lightMethods) ||
      !unmodifiedInstance(ribbons, RibbonBatch.prototype, ribbonMethods)) return false;
  for (const name of ["emitters", "volumes", "beams", "meshBatches", "batchHandles", "frameBatchMembers", "decalNodes"]) {
    if (!emptyOwnMap(system, name)) return false;
  }
  if (!emptyOwnMap(ribbons, "trails")) return false;
  return Object.getOwnPropertyDescriptor(atmosphere, "sky")?.value === null &&
    Object.getOwnPropertyDescriptor(atmosphere, "fog")?.value === null &&
    Object.getOwnPropertyDescriptor(atmosphere, "fogTransition")?.value === null &&
    Object.getOwnPropertyDescriptor(atmosphere, "wetness")?.value === 0 &&
    emptyOwnArray(atmosphere, "fogNodes") && emptyOwnArray(atmosphere, "fogVolumeNodes");
}

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
  // 4.7.x selective bloom: the feeds are registered as stock bridge
  // provenance; certification holds only while the system is stock and empty.
  const provenance = {};
  const validate = (): boolean => !closed && emptyStockSystem(system);
  const atmosphereMembers = {
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
  // Stock feeds must be plain data descriptors (no accessors), so `sky` is a
  // value. The registered object keeps its identity until the live sky
  // changes (or the bridge closes), then a fresh one is registered.
  type AtmosphereFeed = typeof atmosphereMembers & { readonly sky: Record<string, unknown> | null };
  let atmosphereFeed: AtmosphereFeed | undefined;
  const currentAtmosphere = (): AtmosphereFeed => {
    const sky = closed ? null : system.atmosphere.state().sky as Record<string, unknown> | null;
    if (!atmosphereFeed || atmosphereFeed.sky !== sky) {
      atmosphereFeed = registerStockFrameFeed({ sky, ...atmosphereMembers }, "atmosphere", provenance, validate);
    }
    return atmosphereFeed;
  };
  const source = {
    get vfx() {
      if (closed) return null;
      // Read once per renderer frame (the frame's render-input spread).
      system.noteRenderFrame();
      return registerStockFrameFeed({
        feed: (hook: Parameters<ProductionEffectSystem["feed"]>[0]) => { if (!closed) system.feed(hook); },
        afterDraw: (diag: Parameters<ProductionEffectSystem["afterDraw"]>[0]) => { if (!closed) system.afterDraw(diag); },
        lightsFeed: () => closed ? [] : system.collectedLights(),
        ribbonFeed: () => closed ? undefined : system.ribbonFeed(),
        beamFeed: () => closed ? [] : system.beamFeed(),
        meshFeed: () => closed ? [] : system.meshFeed(),
        decalFeed: () => closed ? undefined : system.decalFeed(),
        gpuSimFeed: () => closed ? [] : system.gpuSimFeed()
      }, "vfx", provenance, validate);
    },
    // P2-T7: transient pool lights flow into the compiled collectedLights
    // merge (renderInput.ts) — fresh each frame because the getter re-reads.
    get collectedLights() {
      return closed ? [] : system.collectedLights();
    },
    get atmosphere() {
      return currentAtmosphere();
    }
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

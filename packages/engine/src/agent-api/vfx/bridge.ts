// PRD-07 — render-source bridge: publishes the per-app effect feed and
// atmosphere state on the canvas's production-runtime source, so the
// prd07.* frame contributors see them through ctx.source.
// (Workaround for CCR-07-1: FrameContributorContext has no canvas/app pointer.)

import { attachRootRenderSourceOverlay } from "../RootRuntimeSupport";
import { registerStockFrameFeed } from "@aura3d/rendering/contracts";
import { ProductionEffectSystem } from "../../production-runtime/effects/ProductionEffectSystem";
import { LiveAtmosphere } from "../../production-runtime/effects/LiveAtmosphere";
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
function emptyStockSystem(system: ProductionEffectSystem, atmosphere: LiveAtmosphere | undefined): boolean {
  if (!atmosphere) return false;
  const diagnostics = Object.getOwnPropertyDescriptor(system, "diagnostics")?.value;
  const lights = Object.getOwnPropertyDescriptor(system, "transientLights")?.value;
  const ribbons = Object.getOwnPropertyDescriptor(system, "ribbons")?.value;
  if (!unmodifiedInstance(system, ProductionEffectSystem.prototype, systemMethods) ||
      !unmodifiedInstance(atmosphere, LiveAtmosphere.prototype, atmosphereMethods) ||
      Object.getOwnPropertyDescriptor(system, "atmosphere")?.value !== atmosphere ||
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
}

/**
 * Attach the bridge as a source overlay, so it coexists with an app-owned
 * compatibility bridge (attachRootRenderSource) on the same canvas in either
 * order. When a vfx overlay already exists on the canvas (a second app on the
 * same element), the call reports VFX_APP_BINDING_AMBIGUOUS and stays
 * detached — the effects API still functions for API-level calls but nothing
 * reaches the renderer.
 */
export function attachVfxBridge(canvas: HTMLCanvasElement, system: ProductionEffectSystem): VfxBridge {
  const provenance = {};
  const validate = (): boolean => emptyStockSystem(
    system,
    Object.getOwnPropertyDescriptor(system, "atmosphere")?.value as LiveAtmosphere | undefined
  );
  const source = {
    get vfx() {
      // Read once per renderer frame (the frame's render-input spread).
      system.noteRenderFrame();
      return registerStockFrameFeed({
        feed: (hook: Parameters<ProductionEffectSystem["feed"]>[0]) => system.feed(hook),
        afterDraw: (diag: Parameters<ProductionEffectSystem["afterDraw"]>[0]) => system.afterDraw(diag),
        lightsFeed: () => system.collectedLights(),
        ribbonFeed: () => system.ribbonFeed(),
        beamFeed: () => system.beamFeed(),
        meshFeed: () => system.meshFeed(),
        decalFeed: () => system.decalFeed(),
        gpuSimFeed: () => system.gpuSimFeed()
      }, "vfx", provenance, validate);
    },
    // P2-T7: transient pool lights flow into the compiled collectedLights
    // merge (renderInput.ts) — fresh each frame because the getter re-reads.
    get collectedLights() {
      return system.collectedLights();
    },
    get atmosphere() {
      return registerStockFrameFeed({
        sky: system.atmosphere.state().sky as Record<string, unknown> | null,
        // P4 — fog snapshot + clock accessor for the prd07.fog contributor.
        resolveFog: (t: number) => system.atmosphere.resolveFog(t),
        fogVolumes: () => system.atmosphere.fogVolumes(),
        noteCamera: (position: readonly [number, number, number], forward: readonly [number, number, number]) =>
          system.atmosphere.noteCamera(position, forward),
        clockNow: () => system.atmosphere.clockNow(),
        // P3-T6 — live state + sky-change listener for the SkyCaptureAdapter.
        state: () => system.atmosphere.state(),
        onSkyChanged: (listener: () => void) => system.atmosphere.onSkyChanged(listener)
      }, "atmosphere", provenance, validate);
    }
  };
  try {
    const detach = attachRootRenderSourceOverlay(canvas, source);
    system.noteRenderBridgeAttached();
    return { detach, attached: true };
  } catch {
    system.diagnostics.note(
      "VFX_APP_BINDING_AMBIGUOUS",
      "",
      "canvas already has a prd07 vfx source overlay; prd07 effects cannot bind to this app's renderer"
    );
    return { detach: () => {}, attached: false };
  }
}

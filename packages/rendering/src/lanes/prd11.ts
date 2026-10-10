/**
 * Lane prd11 barrel — owned by lane 11 (CONTRACTS.md §3.8).
 *
 * Phase 0 (telemetry): provides the real `frameStatsSlot` impl and registers
 * the `prd11.frameStats` C-01 contributor that measures every rendered frame.
 * All registrations are unconditional; `frameContributors(flags)` and
 * `slot.get(flags)` gate on `A3D_QR_TIERS`, so flag-off rendering is unchanged.
 */

import { frameStatsSlot, renderTargetPoolSlot, type DeviceCounters, type FrameStatsSample } from "../contracts/device";
import { resourceRegistrySlot } from "../contracts/rendererFactory";
import { registerFrameContributor, type FrameContributorContext } from "../contracts/frameGraph";
import type { AuraQualityTierSettings } from "../contracts/quality";
import type { QrFlags } from "../contracts/core";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { RenderDevice } from "../RenderDevice";
import { rendererQrFlags, setRendererQrFlags } from "../renderer/FrameGraph";
import { FrameStats, diffDeviceCounters } from "../quality/FrameStats";
import { gpuTimingBackendForDevice } from "../quality/DeviceProbe";
import { RenderTargetPool } from "../resources/RenderTargetPool";
import { beginPrd11CounterFrame, installPrd11DeviceCounters } from "../webgl2/Counters";
import { batchPlanCacheFor, prd11LatestBatchPlanReport } from "../renderer/CullingBatching";
import { registerPrd11DrawIdShader } from "../batching/shaders/drawId.glsl";
import { registerPrd11InstanceEmissiveShader } from "../batching/shaders/instanceEmissive.glsl";
import { prd11TickQualityControllers } from "../quality/QualityController";
import { sharedResourceRegistry } from "../resources/ResourceRegistry";
import { installDeviceRestoreRebuild } from "../renderer/DeviceLifecycle";

/** Everything the `frame`/`quality`/`renderer.batching` diagnostics sections need, keyed by device. */
export interface Prd11FrameTelemetry {
  readonly device: RenderDevice;
  readonly stats: FrameStats;
  lastSample: FrameStatsSample | null;
  /** Counters at the last completed frame boundary (per-frame fields = that frame's totals). */
  counters: DeviceCounters | null;
  countersDelta: DeviceCounters | null;
  width: number;
  height: number;
  frameIndex: number;
  tier: AuraQualityTierSettings | null;
}

const telemetryByDevice = new WeakMap<RenderDevice, Prd11FrameTelemetry>();
let latestTelemetry: Prd11FrameTelemetry | null = null;

export function prd11TelemetryForDevice(device: RenderDevice): Prd11FrameTelemetry {
  const existing = telemetryByDevice.get(device);
  if (existing) return existing;
  const telemetry: Prd11FrameTelemetry = {
    device,
    stats: new FrameStats(240, gpuTimingBackendForDevice(device) ?? undefined),
    lastSample: null,
    counters: null,
    countersDelta: null,
    width: 0,
    height: 0,
    frameIndex: 0,
    tier: null
  };
  telemetryByDevice.set(device, telemetry);
  return telemetry;
}

/** Telemetry of the device that rendered most recently; `null` before any tier-flagged frame. */
export function prd11LatestTelemetry(): Prd11FrameTelemetry | null {
  return latestTelemetry;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

class FrameStatsEndPass extends BaseRenderPass {
  constructor(private readonly telemetry: Prd11FrameTelemetry) {
    super("prd11.frameStats.end", [], []);
  }

  execute(_ctx: RenderPassContext): void {
    const sample = this.telemetry.stats.end();
    const counters = this.telemetry.device.counters?.() ?? null;
    const previous = this.telemetry.counters;
    this.telemetry.counters = counters;
    this.telemetry.countersDelta = counters && previous ? diffDeviceCounters(previous, counters) : counters;
    this.telemetry.lastSample = sample;
    latestTelemetry = this.telemetry;
  }
}

const endPasses = new WeakMap<Prd11FrameTelemetry, FrameStatsEndPass>();

frameStatsSlot.provide((capacity = 240) => new FrameStats(capacity));

// Phase 2 (§6.8): real C-28 render-target pool — post chains reuse targets
// keyed by (w, h, format, samples, depth); wired into post execution by Q-03-1.
/**
 * T11-POOL (PRD-16 T0-35): one pool per device. `PostResources` calls the slot
 * factory on every acquire/resize/trim/dispose; a fresh pool per call made
 * `release()` hit a foreign pool (ignored) and registered a new pool in the
 * shared registry each time, leaking post targets and pools.
 */
const renderTargetPools = new WeakMap<RenderDevice, RenderTargetPool>();

export function prd11RenderTargetPoolFor(device: RenderDevice): RenderTargetPool {
  const existing = renderTargetPools.get(device);
  if (existing) return existing;
  const pool = new RenderTargetPool(device);
  renderTargetPools.set(device, pool);
  // Phase 5 (§6.9): pool targets die with the GL context — register the pool
  // once so `installDeviceRestoreRebuild` clears it and `acquire` re-creates.
  const registry = sharedResourceRegistry();
  registry.register(pool, {
    kind: "a3d-prd11-rt-pool",
    rebuild: () => pool.rebuildForRestore()
  });
  // The shared registry is module-level: unregister on device dispose so it
  // does not keep the pool (and through it the device) alive.
  const originalDispose = typeof device.dispose === "function" ? device.dispose.bind(device) : null;
  if (originalDispose) {
    device.dispose = (): void => {
      registry.unregister(pool);
      renderTargetPools.delete(device);
      originalDispose();
    };
  }
  return pool;
}

// Phase 2 (§6.8): real C-28 render-target pool — post chains reuse targets
// keyed by (w, h, format, samples, depth); wired into post execution by Q-03-1.
renderTargetPoolSlot.provide(prd11RenderTargetPoolFor);

// Phase 5 (§6.9): real C-29 registry — records creation descriptors + CPU
// sources for eager rebuild after context restore. Consumers observe the real
// impl only under `A3D_QR_WEBGPU`; flag-off stays on the contract stub (IC-0).
resourceRegistrySlot.provide(() => sharedResourceRegistry());

// Phase 3 (§6.6): C-02 chunk/feature registrations for the multi-draw and
// per-instance-emissive paths. Inert until a real program generator consumes
// them; `SHADER_CHUNK_DUPLICATE`-safe via module-local guards.
registerPrd11DrawIdShader();
registerPrd11InstanceEmissiveShader();

registerFrameContributor({
  id: "prd11.frameStats",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  phases: ["collect", "after-output"],
  order: -1000,
  collect(items, ctx: FrameContributorContext) {
    const telemetry = prd11TelemetryForDevice(ctx.device);
    installPrd11DeviceCounters(ctx.device);
    // T11-RESET (PRD-16 T0-35): snapshot, never reset, the host counters here —
    // `collect` runs after `Renderer.beginFrame`, so a device reset would zero
    // lane-01 drawCalls/readbacks mid-frame.
    beginPrd11CounterFrame(ctx.device);
    telemetry.width = ctx.width;
    telemetry.height = ctx.height;
    telemetry.frameIndex = ctx.frameIndex;
    telemetry.tier = ctx.tier;
    telemetry.stats.begin(nowMs());
    latestTelemetry = telemetry;
    return items;
  },
  passes(phase, ctx: FrameContributorContext) {
    if (phase !== "after-output") return [];
    const telemetry = prd11TelemetryForDevice(ctx.device);
    let pass = endPasses.get(telemetry);
    if (!pass) {
      pass = new FrameStatsEndPass(telemetry);
      endPasses.set(telemetry, pass);
    }
    return [pass];
  }
});

/**
 * Phase 3 batching contributor (`prd11.batching`, flag
 * `A3D_QR_TIERS_BATCHING`): content-keyed `BatchPlan` over the collected item
 * list. Late order so items other contributors add during `collect` (LOD,
 * particles) are included. The plan cache keys by device — FrameGraph and
 * contributors are per-device.
 */
registerFrameContributor({
  id: "prd11.batching",
  owner: "prd11",
  flag: "A3D_QR_TIERS_BATCHING",
  phases: ["collect"],
  order: 900,
  collect(items, ctx: FrameContributorContext) {
    return batchPlanCacheFor(ctx.device).apply(items);
  }
});

/**
 * Phase 4 governor contributor (`prd11.governor`, flag
 * `A3D_QR_TIERS_GOVERNOR`): attaches the device probe to each registered
 * `AuraQuality` controller once, then feeds the previous frame's
 * `FrameStatsSample` into `tickFrame` — calibration (§6.4 step 4) and the
 * render-scale/feature governor (§6.5) live entirely inside the controller.
 */
registerFrameContributor({
  id: "prd11.governor",
  owner: "prd11",
  flag: "A3D_QR_TIERS_GOVERNOR",
  phases: ["collect"],
  order: 950,
  collect(items, ctx: FrameContributorContext) {
    const last = prd11TelemetryForDevice(ctx.device).lastSample;
    if (last) {
      prd11TickQualityControllers(ctx.device.probe, last.intervalMs, last.gpuMs);
    } else {
      prd11TickQualityControllers(ctx.device.probe, 0, null);
    }
    return items;
  }
});

/**
 * Engine-side wire (C-38 seam): `createAuraApp` resolves QR flags but owns the
 * call into `renderer/FrameGraph.ts`'s module-level flag store. Lane 11's
 * `quality` app extension (`packages/engine/src/lanes/prd11.ts`) forwards the
 * resolved flags through this helper so `frameContributors(flags)` gates
 * correctly on `A3D_QR_TIERS` for every subsequently mounted FrameGraph.
 */
export function prd11SetRendererQrFlags(flags: QrFlags): void {
  setRendererQrFlags(flags);
}

/** C-31 `renderer.batching` report surface for the engine diagnostics collector. */
export { prd11LatestBatchPlanReport };

/** Phase 4 (§6.4-§6.5): engine `quality` extension instantiates `AuraQuality`
 * and registers it on the lane bus; the diagnostics collector reads the live
 * decision/steps via `prd11LatestQualityDiagnostics`. */
export {
  AuraQuality,
  prd11LatestQualityDiagnostics,
  registerAuraQualityController
} from "../quality/QualityController";
export type { AuraQualityControllerEnv, QualityDiagnostics } from "../quality/QualityController";

/**
 * Phase 5 (§6.9): `prd11.contextRestore` contributor (flag `A3D_QR_TIERS`).
 * First `collect` per device installs `installDeviceRestoreRebuild` on the
 * device's `WebGL2ContextLifecycle` — on `webglcontextrestored` it runs
 * invalidateGpuObjects?.() → `resourceRegistry.rebuild(device)` → C-02
 * `programCache.precompile` (active keys arrive via Q-15-3), and only then do
 * `deviceRestoredListeners`/`app.onDeviceRestored` fire. Flag-off never
 * reaches this contributor, so the carve-out notification path is untouched.
 */
const restoreInstalled = new WeakSet<RenderDevice>();

registerFrameContributor({
  id: "prd11.contextRestore",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  phases: ["collect"],
  order: -990,
  collect(items, ctx: FrameContributorContext) {
    if (!restoreInstalled.has(ctx.device)) {
      restoreInstalled.add(ctx.device);
      installDeviceRestoreRebuild(ctx.device, {
        registry: sharedResourceRegistry(),
        flags: rendererQrFlags()
      });
    }
    return items;
  }
});

/** Phase 5 (§6.9): context-restore surfaces — real C-29 registry, the §6.9
 * memory policy helper, the restore-ordering installer, and the pool's
 * rebuild method for tests/engine diagnostics. */
export { ResourceRegistry, sharedResourceRegistry } from "../resources/ResourceRegistry";
export type { ResourceDescriptor } from "../resources/ResourceRegistry";
export { retainDecodedSourcesForRestore } from "../quality/RetentionPolicy";
export { installDeviceRestoreRebuild } from "../renderer/DeviceLifecycle";
export type { DeviceRestoreRebuildOptions } from "../renderer/DeviceLifecycle";

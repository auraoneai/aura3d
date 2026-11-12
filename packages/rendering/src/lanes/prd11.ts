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
import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import { resourceDisposalPending } from "../ResourceLifecycle";
import { setRendererQrFlags } from "../renderer/FrameGraph";
import { FrameStats, diffDeviceCounters } from "../quality/FrameStats";
import { attachFrameInspectionCancel, commitFrameInspectionView, pauseFrameInspectionRange } from "../quality/FrameInspectionTiming";
import { frameStatsForDevice } from "../quality/DeviceProbe";
import { RenderTargetPool } from "../resources/RenderTargetPool";
import { beginPrd11CounterFrame, installPrd11DeviceCounters, webgl2DeviceHost } from "../webgl2/Counters";
import { prd11BatchingFrameContributor, prd11LatestBatchPlanReport } from "../renderer/CullingBatching";
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
    stats: frameStatsForDevice(device, 240),
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

interface FrameStatsTicket {
  readonly telemetry: Prd11FrameTelemetry;
  readonly handle: object;
  readonly blackboard: object;
  readonly sequence: number;
  inspectionBinding?: object;
}

// A blackboard belongs to one view's frame hooks. A pass must never end the
// latest device-global frame merely because an older view executes late.
const frameTickets = new WeakMap<object, FrameStatsTicket>();
const frameAttempts = new WeakMap<object, object>();
const telemetrySequence = new WeakMap<Prd11FrameTelemetry, number>();
const completedTelemetrySequence = new WeakMap<Prd11FrameTelemetry, number>();

class FrameStatsEndPass extends BaseRenderPass {
  constructor(private readonly ticket: FrameStatsTicket) {
    super("prd11.frameStats.end", [], []);
  }

  execute(_ctx: RenderPassContext): void {
    const { blackboard, telemetry, handle, sequence } = this.ticket;
    if (frameTickets.get(blackboard) !== this.ticket) return;
    frameTickets.delete(blackboard);
    const sample = telemetry.stats.endTracked(handle);
    if (!sample) return;

    // A reentrant collection may have replaced this blackboard's binding.
    // In that case its sample must not be attached to the newer view.
    if (this.ticket.inspectionBinding && !frameTickets.has(blackboard)) {
      commitFrameInspectionView(blackboard, sample, telemetry.stats, this.ticket.inspectionBinding);
    }

    // A newer frame may have completed while a device callback was running.
    // Keep the device-wide diagnostics pointed at the newer completed sample.
    if (sequence <= (completedTelemetrySequence.get(telemetry) ?? 0)) return;
    const counters = telemetry.device.counters?.() ?? null;
    if (sequence <= (completedTelemetrySequence.get(telemetry) ?? 0)) return;
    const previous = telemetry.counters;
    telemetry.counters = counters;
    telemetry.countersDelta = counters && previous ? diffDeviceCounters(previous, counters) : counters;
    telemetry.lastSample = sample;
    completedTelemetrySequence.set(telemetry, sequence);
    latestTelemetry = telemetry;
  }
}

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
const retiredRenderTargetDevices = new WeakSet<RenderDevice>();

interface PoolDisposal {
  readonly pool: RenderTargetPool;
  readonly registry: ReturnType<typeof sharedResourceRegistry>;
  unregistered: boolean;
  disposed: boolean;
  disposing: boolean;
}

interface DeviceDisposalAttempt {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  state: "pending" | "resolved" | "rejected";
  observing: boolean;
}

function deviceDisposalAttempt(): DeviceDisposalAttempt {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  // Most callers use the synchronous disposer without observing this receipt.
  void promise.catch(() => {});
  return { promise, resolve, reject, state: "pending", observing: false };
}

interface DeviceDisposal {
  started: boolean;
  disposing: boolean;
  nativeDisposed: boolean;
  attempt?: DeviceDisposalAttempt;
  finish?: () => void;
  pool?: PoolDisposal;
  restore?: { readonly unsubscribe: () => void; disposed: boolean };
}

const deviceDisposals = new WeakMap<RenderDevice, DeviceDisposal>();

/** One coordinator avoids nested lane wrappers forgetting each other's retries. */
function deviceDisposalFor(device: RenderDevice): DeviceDisposal {
  const existing = deviceDisposals.get(device);
  if (existing) return existing;
  const state: DeviceDisposal = { started: false, disposing: false, nativeDisposed: false };
  const originalDispose = device.dispose.bind(device);
  const nativeWhenDisposed = device.whenDisposed?.bind(device);
  let prototype: object | null = device;
  let descriptor: PropertyDescriptor | undefined;
  while (prototype && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, resourceDisposalPending);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  let nativePendingValue: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
  const nativePending = (): boolean => descriptor?.get
    ? descriptor.get.call(device) === true
    : nativePendingValue === true;
  const cleanupFinished = (): boolean => state.started && !state.disposing && state.nativeDisposed
    && (!state.restore || state.restore.disposed)
    && (!state.pool || (state.pool.unregistered && state.pool.disposed && !state.pool.disposing
      && !state.pool.pool[resourceDisposalPending]))
    && !nativePending();
  const finished = (): boolean => cleanupFinished() && state.attempt?.state === "resolved";
  const finish = (): void => {
    if (finished() && state.pool && renderTargetPools.get(device) === state.pool.pool) {
      renderTargetPools.delete(device);
    }
  };
  state.finish = finish;
  const rejectAttempt = (attempt: DeviceDisposalAttempt, error: unknown): void => {
    if (attempt.state !== "pending") return;
    attempt.state = "rejected";
    attempt.reject(error);
  };
  const resolveAttempt = (attempt: DeviceDisposalAttempt): void => {
    if (attempt.state !== "pending") return;
    if (!cleanupFinished()) throw new RenderDeviceError("Render device disposal is incomplete.", "DISPOSAL_INCOMPLETE");
    attempt.state = "resolved";
    try {
      finish();
      if (state.attempt !== attempt || !finished()) {
        throw new RenderDeviceError("Render device disposal is incomplete.", "DISPOSAL_INCOMPLETE");
      }
    } catch (error) {
      attempt.state = "pending";
      throw error;
    }
    attempt.resolve();
  };
  const observeAttempt = (attempt: DeviceDisposalAttempt): void => {
    if (attempt.state !== "pending" || attempt.observing) return;
    attempt.observing = true;
    try {
      const pending: Promise<void>[] = [];
      if (nativeWhenDisposed) {
        try {
          const receipt = nativeWhenDisposed().catch((error: unknown) => {
            // A native attempt can reject after its synchronous close returned.
            // An explicit retry must be allowed to replace that receipt.
            if (state.attempt === attempt) state.nativeDisposed = false;
            throw error;
          });
          // A later pool receipt getter can throw before Promise.all is wired.
          void receipt.catch(() => {});
          pending.push(receipt);
        } catch (error) {
          state.nativeDisposed = false;
          throw error;
        }
      }
      if (state.pool && (state.pool.disposed || state.pool.disposing)) {
        pending.push(state.pool.pool.whenDisposed());
      }
      void Promise.all(pending).then(() => {
        if (attempt.state !== "pending") return;
        try { resolveAttempt(attempt); } catch (error) { rejectAttempt(attempt, error); }
      }, (error: unknown) => rejectAttempt(attempt, error));
    } catch (error) {
      rejectAttempt(attempt, error);
    }
  };

  // The native receipt alone does not cover the lane's pool, unregister, or
  // restore hook. Preserve each failed attempt until an explicit close retries.
  device.whenDisposed = (): Promise<void> => {
    if (!state.started) {
      return nativeWhenDisposed?.()
        ?? Promise.reject(new RenderDeviceError("Render device disposal has not started.", "DISPOSAL_NOT_STARTED"));
    }
    const attempt = state.attempt;
    if (!attempt) return Promise.reject(new RenderDeviceError("Render device disposal is incomplete.", "DISPOSAL_INCOMPLETE"));
    if (attempt.state === "resolved" && (!finished()
      || (device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] === true)) {
      return Promise.reject(new RenderDeviceError("Render device disposal requires another attempt.", "DISPOSAL_INCOMPLETE"));
    }
    // A later-installed owner may still be unwinding when our synchronous
    // close finishes. Check its composed signal after that stack unwinds.
    return attempt.promise.then(() => {
      if ((device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] === true) {
        throw new RenderDeviceError("Render device disposal is incomplete.", "DISPOSAL_INCOMPLETE");
      }
    });
  };

  // Native devices may mark `disposed` before their work is complete. Compose
  // their completion signal with the lane-owned work so an upstream lifecycle
  // cannot discard the device while a pool or restore hook still needs retry.
  const ownPending = Object.getOwnPropertyDescriptor(device, resourceDisposalPending);
  if (!ownPending || ownPending.configurable) {
    Object.defineProperty(device, resourceDisposalPending, {
      configurable: true,
      enumerable: ownPending?.enumerable ?? false,
      get: () => (state.started && !finished()) || nativePending(),
      ...(descriptor?.set
        ? { set: (value: unknown) => descriptor!.set!.call(device, value) }
        : descriptor && "value" in descriptor && descriptor.writable
          ? { set: (value: unknown) => { nativePendingValue = value; } }
          : {})
    });
  }

  device.dispose = (): void => {
    if (state.disposing || finished()) return;
    if (!state.attempt || state.attempt.state === "rejected" || state.attempt.state === "resolved") {
      state.attempt = deviceDisposalAttempt();
    }
    const attempt = state.attempt;
    state.started = true;
    retiredRenderTargetDevices.add(device);
    state.disposing = true;
    const errors: unknown[] = [];
    try {
      if (state.restore && !state.restore.disposed) {
        try { state.restore.unsubscribe(); state.restore.disposed = true; } catch (error) { errors.push(error); }
      }
      const owned = state.pool;
      if (owned && !owned.unregistered) {
        try { owned.registry.unregister(owned.pool); owned.unregistered = true; } catch (error) { errors.push(error); }
      }
      // Native/particle owners can report new pending work after an earlier
      // successful close. Reopen only that owner, not completed lane cleanup.
      let nativeAttempted = false;
      if (!state.nativeDisposed || nativePending()) {
        nativeAttempted = true;
        try {
          originalDispose();
          // A successful synchronous close may still have fences in flight.
          // finished() separately waits for the native pending receipt.
          state.nativeDisposed = device.disposed;
        } catch (error) {
          // Even when resources finished before the error, WebGPU needs an
          // explicit retry to replace the rejected disposal-attempt receipt.
          state.nativeDisposed = false;
          errors.push(error);
        }
      }
      if (owned && (!owned.disposed || owned.pool[resourceDisposalPending]) && !owned.disposing) {
        try {
          if (nativeAttempted && device.kind === "webgpu" && device.disposed) {
            owned.pool.dispose({ deviceDisposalAttempted: true });
          } else {
            owned.pool.dispose();
          }
        } catch (error) {
          if (error instanceof AggregateError) errors.push(...error.errors);
          else errors.push(error);
        }
      }
    } finally {
      state.disposing = false;
    }
    if (errors.length) {
      const error = new AggregateError(errors, "Render device disposal failed.");
      rejectAttempt(attempt, error);
      throw error;
    }
    try {
      if (cleanupFinished() && (!nativeWhenDisposed || descriptor?.get !== undefined)) {
        // Synchronous devices already have a complete receipt; do not defer
        // their established lifecycle semantics to a microtask. A native
        // device publishing a pending signal (WebGPU) reports false only once
        // no fence-waiting, failed, or uncertain native work remains, so with
        // every lane-owned step also done there is nothing left to await. A
        // later native failure re-raises that signal and reopens this lane.
        resolveAttempt(attempt);
      } else {
        observeAttempt(attempt);
      }
    } catch (error) {
      rejectAttempt(attempt, error);
      throw error;
    }
  };
  deviceDisposals.set(device, state);
  return state;
}

function retainPoolForDevice(device: RenderDevice, pool: RenderTargetPool, registry: ReturnType<typeof sharedResourceRegistry>): void {
  const state = deviceDisposalFor(device);
  const owned: PoolDisposal = { pool, registry, unregistered: false, disposed: false, disposing: false };
  state.pool = owned;
  const dispose = pool.dispose.bind(pool);
  pool.dispose = (options): void => {
    if (owned.disposing) return;
    owned.disposing = true;
    try {
      dispose(options);
      owned.disposed = true;
      // Closing is synchronous, but native ownership may still be fenced.
      void pool.whenDisposed().then(() => state.finish?.(), () => {});
    } finally { owned.disposing = false; }
    state.finish?.();
  };
}

export function prd11RenderTargetPoolFor(device: RenderDevice): RenderTargetPool {
  if (device.disposed || retiredRenderTargetDevices.has(device)) {
    throw new RenderDeviceError("Cannot create a target pool for a disposed device.", "DISPOSED_DEVICE");
  }
  const existing = renderTargetPools.get(device);
  if (existing) return existing;
  const pool = new RenderTargetPool(device);
  renderTargetPools.set(device, pool);
  // Phase 5 (§6.9): pool targets die with the GL context — register the pool
  // once so `installDeviceRestoreRebuild` clears it and `acquire` re-creates.
  const registry = sharedResourceRegistry();
  registry.register(pool, {
    kind: "a3d-prd11-rt-pool",
    device,
    rebuild: () => { if (!retiredRenderTargetDevices.has(device)) pool.rebuildForRestore(); }
  });
  retainPoolForDevice(device, pool, registry);
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
    const blackboard = ctx.blackboard;
    const attempt = {};
    frameAttempts.set(blackboard, attempt);
    const previousTicket = frameTickets.get(blackboard);
    if (previousTicket) {
      frameTickets.delete(blackboard);
      previousTicket.telemetry.stats.cancelTracked(previousTicket.handle);
    }
    // Cancellation can synchronously invoke a new collection on the same
    // blackboard. Let that newer collection retain ownership.
    if (frameAttempts.get(blackboard) !== attempt) return items;
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
    const sequence = (telemetrySequence.get(telemetry) ?? 0) + 1;
    telemetrySequence.set(telemetry, sequence);
    // End the frame's open non-view GPU range first: the view's own query
    // must never overlap it (TIME_ELAPSED queries cannot be nested).
    pauseFrameInspectionRange(blackboard);
    const handle = telemetry.stats.beginTracked(nowMs());
    if (frameAttempts.get(blackboard) !== attempt) {
      telemetry.stats.cancelTracked(handle);
      return items;
    }
    const ticket: FrameStatsTicket = { telemetry, handle, blackboard, sequence };
    frameTickets.set(blackboard, ticket);
    ticket.inspectionBinding = attachFrameInspectionCancel(blackboard, () => {
      if (frameTickets.get(blackboard) !== ticket) return;
      frameTickets.delete(blackboard);
      if (frameAttempts.get(blackboard) === attempt) frameAttempts.delete(blackboard);
      telemetry.stats.cancelTracked(handle);
    });
    latestTelemetry = telemetry;
    return items;
  },
  passes(phase, ctx: FrameContributorContext) {
    if (phase !== "after-output") return [];
    const ticket = frameTickets.get(ctx.blackboard);
    if (!ticket || ticket.telemetry.device !== ctx.device) return [];
    return [new FrameStatsEndPass(ticket)];
  }
});

/**
 * Phase 3 batching contributor (`prd11.batching`, flag
 * `A3D_QR_TIERS_BATCHING`): content-keyed `BatchPlan` over the collected item
 * list. Late order so items other contributors add during `collect` (LOD,
 * particles) are included. The plan cache keys by device — FrameGraph and
 * contributors are per-device.
 */
registerFrameContributor(prd11BatchingFrameContributor);

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
 *
 * @deprecated T11-GLOBALFLAGS: writes the global last-writer-wins store and so
 * arms every app on the page. The engine no longer calls it; renderers take
 * per-device flags through `Renderer.create({ qrFlags })` (T0-28). Kept one
 * release for external callers.
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
export {
  RUNTIME_QUALITY_LADDER,
  RuntimeQualityGovernor,
  bindRuntimeQualityDevice,
  clearRuntimeQualityState,
  ensureRuntimeQualityState,
  runtimeQualityDeviceStateFor,
  runtimeQualityStateFor
} from "../quality/RuntimeQualityGovernor";
export type {
  RuntimeQualityCanvasState,
  RuntimeQualityGovernorOptions,
  RuntimeQualityRung,
  RuntimeQualityRungAllocation,
  RuntimeQualitySample,
  RuntimeQualityStepResult
} from "../quality/RuntimeQualityGovernor";

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
    if (ctx.device.disposed || retiredRenderTargetDevices.has(ctx.device)) return items;
    if (!restoreInstalled.has(ctx.device)) {
      if (!webgl2DeviceHost(ctx.device)?.lifecycle) return items;
      restoreInstalled.add(ctx.device);
      const unsubscribe = installDeviceRestoreRebuild(ctx.device, {
        registry: sharedResourceRegistry(),
        // T11-GLOBALFLAGS: this frame's flags (per device since T0-28), not the global default.
        flags: ctx.flags
      });
      deviceDisposalFor(ctx.device).restore = { unsubscribe, disposed: false };
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

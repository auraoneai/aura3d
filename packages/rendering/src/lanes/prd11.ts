/**
 * Lane prd11 barrel — owned by lane 11 (CONTRACTS.md §3.8).
 *
 * Phase 0 (telemetry): provides the real `frameStatsSlot` impl and registers
 * the `prd11.frameStats` C-01 contributor that measures every rendered frame.
 * All registrations are unconditional; `frameContributors(flags)` and
 * `slot.get(flags)` gate on `A3D_QR_TIERS`, so flag-off rendering is unchanged.
 */

import { frameStatsSlot, type DeviceCounters, type FrameStatsSample } from "../contracts/device";
import { registerFrameContributor, type FrameContributorContext } from "../contracts/frameGraph";
import type { AuraQualityTierSettings } from "../contracts/quality";
import type { QrFlags } from "../contracts/core";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { RenderDevice } from "../RenderDevice";
import { setRendererQrFlags } from "../renderer/FrameGraph";
import { FrameStats, diffDeviceCounters } from "../quality/FrameStats";
import { gpuTimingBackendForDevice } from "../quality/DeviceProbe";
import { installPrd11DeviceCounters } from "../webgl2/Counters";

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

registerFrameContributor({
  id: "prd11.frameStats",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  phases: ["collect", "after-output"],
  order: -1000,
  collect(items, ctx: FrameContributorContext) {
    const telemetry = prd11TelemetryForDevice(ctx.device);
    installPrd11DeviceCounters(ctx.device);
    ctx.device.resetFrameCounters?.();
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
 * Engine-side wire (C-38 seam): `createAuraApp` resolves QR flags but owns the
 * call into `renderer/FrameGraph.ts`'s module-level flag store. Lane 11's
 * `quality` app extension (`packages/engine/src/lanes/prd11.ts`) forwards the
 * resolved flags through this helper so `frameContributors(flags)` gates
 * correctly on `A3D_QR_TIERS` for every subsequently mounted FrameGraph.
 */
export function prd11SetRendererQrFlags(flags: QrFlags): void {
  setRendererQrFlags(flags);
}

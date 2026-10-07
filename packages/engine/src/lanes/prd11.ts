/**
 * Lane prd11 barrel — owned by lane 11 (CONTRACTS.md §3.8).
 *
 * Phase 0 (telemetry): registers the C-31 diagnostics sections `frame`,
 * `quality` and `renderer.batching`. Collectors read the prd11 frame-telemetry
 * registry in `@aura3d/rendering` (populated by the `A3D_QR_TIERS` frame
 * contributor); no collector touches the GPU. Fields that cannot be measured
 * yet are `null` (CONTRACTS §C-31), so the report is schema-valid on any app —
 * including a disposed one — and flag-off reports simply carry nulls.
 */

import { prd11LatestTelemetry, prd11SetRendererQrFlags, type Prd11FrameTelemetry } from "@aura3d/rendering";
import {
  QUALITY_TIERS,
  StubQualityController,
  type AuraQualityTier,
  type AuraQualityTierSettings,
  type DeviceCounters,
  type DeviceProbe
} from "@aura3d/rendering/contracts";
import { registerDiagnosticsSection } from "../contracts/diagnostics";
import { registerAppExtension } from "../contracts/app";
import type { AuraApp, AuraCreateAppOptions } from "../agent-api/index";

interface AuraPercentiles { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number }

/** C-31 `frame` section (PRD 11 §6.10). Fields not measurable in Phase 0 are `null`. */
export interface AuraFrameTimingReport {
  readonly frames: number;
  readonly fps: number | null;
  readonly intervalMs: AuraPercentiles;
  readonly cpuFrameMs: AuraPercentiles;
  readonly cpuSubmitMs: AuraPercentiles;
  readonly gpuMs: AuraPercentiles | null;
  readonly drawCalls: number;
  readonly instances: number | null;
  readonly triangles: number | null;
  readonly programsCompiledSinceReady: number | null;
  readonly readbacksThisFrame: number;
  readonly bufferCreatesThisFrame: number;
  readonly renderTargetsCreatedThisFrame: number;
  readonly liveBuffers: number;
  readonly liveVertexArrays: number;
  readonly textureBytes: number;
  readonly renderTargetBytes: number;
  readonly tier: AuraQualityTier | null;
  readonly renderScale: number | null;
  readonly backingSize: readonly [number, number] | null;
}

/** C-31 `quality` section (PRD 11 §7.2 `AuraQualityDiagnostics`). Governor fields land in Phase 4. */
export interface AuraQualityDiagnosticsReport {
  readonly decision: unknown | null;
  readonly settings: AuraQualityTierSettings | null;
  readonly renderScale: number | null;
  readonly governorSteps: readonly { readonly frame: number; readonly feature: string; readonly from: unknown; readonly to: unknown }[];
  readonly locked: boolean | null;
  readonly probe: DeviceProbe | null;
}

/** C-31 `renderer.batching` section (PRD 11 §9.2 `BatchPlanReport`). The planner lands in Phase 3. */
export interface AuraBatchPlanReport {
  readonly inputItems: number;
  readonly outputDraws: number;
  readonly instancedBatches: number;
  readonly multiDrawBatches: number;
  readonly reasonsNotBatched: Readonly<Record<string, number>>;
  readonly planBuildMs: number;
  readonly planVersion: number;
}

const EMPTY_PERCENTILES: AuraPercentiles = { p50: 0, p95: 0, p99: 0, max: 0 };

function tierNameFor(settings: AuraQualityTierSettings | null): AuraQualityTier | null {
  if (!settings) return null;
  for (const name of Object.keys(QUALITY_TIERS) as AuraQualityTier[]) {
    if (QUALITY_TIERS[name] === settings) return name;
  }
  return null;
}

function emptyCounters(): Pick<DeviceCounters, "drawCalls" | "bufferCreates" | "textureUploads" | "readbacks" | "renderTargetsCreated" | "programCompiles" | "liveBuffers" | "liveVertexArrays" | "textureBytes" | "renderTargetBytes"> {
  return { drawCalls: 0, bufferCreates: 0, textureUploads: 0, readbacks: 0, renderTargetsCreated: 0, programCompiles: 0, liveBuffers: 0, liveVertexArrays: 0, textureBytes: 0, renderTargetBytes: 0 };
}

function frameReport(telemetry: Prd11FrameTelemetry | null, app: AuraApp): AuraFrameTimingReport {
  const stats = telemetry?.stats ?? null;
  const counters = telemetry?.counters ?? emptyCounters();
  const diag = telemetry ? telemetry.device.getDiagnostics() : null;
  const percentiles = (field: "intervalMs" | "cpuFrameMs" | "cpuSubmitMs" | "gpuMs"): AuraPercentiles =>
    stats ? stats.percentiles(field) : EMPTY_PERCENTILES;
  const p50Interval = percentiles("intervalMs").p50;
  const programsCompiled = diag && typeof (diag as { programCompileCount?: number }).programCompileCount === "number"
    ? ((diag as { programCompileCount?: number }).programCompileCount ?? null)
    : null;
  void app;
  return {
    frames: stats?.samples ?? 0,
    fps: stats && stats.samples >= 30 && p50Interval > 0 ? 1000 / p50Interval : null,
    intervalMs: percentiles("intervalMs"),
    cpuFrameMs: percentiles("cpuFrameMs"),
    cpuSubmitMs: percentiles("cpuSubmitMs"),
    gpuMs: stats && stats.percentiles("gpuMs").max > 0 ? percentiles("gpuMs") : null,
    drawCalls: counters.drawCalls,
    instances: null,
    triangles: null,
    programsCompiledSinceReady: programsCompiled,
    readbacksThisFrame: counters.readbacks,
    bufferCreatesThisFrame: counters.bufferCreates,
    renderTargetsCreatedThisFrame: counters.renderTargetsCreated,
    liveBuffers: counters.liveBuffers,
    liveVertexArrays: counters.liveVertexArrays,
    textureBytes: counters.textureBytes,
    renderTargetBytes: counters.renderTargetBytes,
    tier: tierNameFor(telemetry?.tier ?? null),
    renderScale: null,
    backingSize: telemetry && telemetry.width > 0 ? [telemetry.width, telemetry.height] : null
  };
}

registerDiagnosticsSection<AuraFrameTimingReport>({
  id: "prd11.frame",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  key: "frame",
  collect: (app) => frameReport(prd11LatestTelemetry(), app)
});

registerDiagnosticsSection<AuraQualityDiagnosticsReport>({
  id: "prd11.quality",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  key: "quality",
  collect: () => {
    const telemetry = prd11LatestTelemetry();
    return {
      decision: null,
      settings: telemetry?.tier ?? null,
      renderScale: null,
      governorSteps: [],
      locked: null,
      probe: telemetry?.device.probe ?? null
    };
  }
});

registerDiagnosticsSection<AuraBatchPlanReport>({
  id: "prd11.rendererBatching",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  key: "renderer.batching",
  collect: () => ({
    inputItems: 0,
    outputDraws: 0,
    instancedBatches: 0,
    multiDrawBatches: 0,
    reasonsNotBatched: {},
    planBuildMs: 0,
    planVersion: 0
  })
});

/**
 * C-38 `quality` extension (C-27 seam). Phase 0 mounts the PR 0a stub
 * controller — the real governor/controller lands in later phases — and uses
 * the extension's resolved-flags context to forward flags into the renderer's
 * frame-contributor gate (`setRendererQrFlags`), which `createAuraApp`
 * resolves but never wires into `renderer/FrameGraph.ts`.
 *
 * The extension itself is registered unconditionally (flag metadata only);
 * with `A3D_QR_TIERS` off the flags object reports every lane off, so the
 * contributor stays inactive and flag-off rendering is unchanged.
 */
function requestedTierFromRendererOptions(options: AuraCreateAppOptions): AuraQualityTier | "auto" {
  const quality = options.renderer && typeof options.renderer === "object" ? options.renderer.quality : undefined;
  const tier = typeof quality === "string" ? quality
    : quality && typeof quality === "object" && typeof (quality as { tier?: unknown }).tier === "string"
      ? (quality as { tier: string }).tier
      : undefined;
  return tier === "low" || tier === "medium" || tier === "high" || tier === "ultra" ? tier : "auto";
}

registerAppExtension({
  id: "prd11.quality",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  member: "quality",
  create(_app, ctx) {
    prd11SetRendererQrFlags(ctx.flags);
    return new StubQualityController(requestedTierFromRendererOptions(ctx.options));
  }
});

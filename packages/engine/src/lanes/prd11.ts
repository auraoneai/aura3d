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

import {
  AuraQuality,
  prd11LatestBatchPlanReport,
  prd11LatestQualityDiagnostics,
  prd11LatestTelemetry,
  registerAuraQualityController,
  type Prd11FrameTelemetry
} from "@aura3d/rendering";
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
import type { AuraApp } from "../agent-api/index";
import { parseQualityRendererOptions } from "../agent-api/app/rendererOptions";

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

/** C-31 `quality` section (PRD 11 §7.2 `AuraQualityDiagnostics`). */
export interface AuraQualityDiagnosticsReport {
  readonly decision: unknown | null;
  readonly settings: AuraQualityTierSettings | null;
  readonly renderScale: number | null;
  readonly governorSteps: readonly { readonly direction: string; readonly feature: string; readonly from: unknown; readonly to: unknown; readonly frameMsP50: number }[];
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

/**
 * T11-COUNTERS follow-up (Track 0 ready time): `device.getDiagnostics()` walks
 * every live buffer/texture/target, and the `frame` section ran it on every
 * `app.diagnostics()` call — capture harnesses poll that many times per frame.
 * The only field read is the cumulative program-compile count, so one walk per
 * rendered frame is enough.
 */
const diagnosticsMemo = new WeakMap<Prd11FrameTelemetry, { readonly sample: object | null; readonly value: ReturnType<Prd11FrameTelemetry["device"]["getDiagnostics"]> }>();

function memoDiagnostics(telemetry: Prd11FrameTelemetry): ReturnType<Prd11FrameTelemetry["device"]["getDiagnostics"]> {
  // `lastSample` is a fresh object every completed frame (FrameStats.end), so
  // its identity marks the frame; counters like `samples` saturate at capacity.
  const sample = telemetry.lastSample;
  const cached = diagnosticsMemo.get(telemetry);
  if (cached && sample !== null && cached.sample === sample) return cached.value;
  const value = telemetry.device.getDiagnostics();
  diagnosticsMemo.set(telemetry, { sample, value });
  return value;
}

function frameReport(telemetry: Prd11FrameTelemetry | null, app: AuraApp): AuraFrameTimingReport {
  const stats = telemetry?.stats ?? null;
  const counters = telemetry?.counters ?? emptyCounters();
  const diag = telemetry ? memoDiagnostics(telemetry) : null;
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
    const live = prd11LatestQualityDiagnostics();
    return {
      decision: live?.decision ?? null,
      settings: telemetry?.tier ?? (live ? QUALITY_TIERS[live.decision.tier] : null),
      renderScale: live?.renderScale ?? null,
      governorSteps: live?.governorSteps.map((s) => ({
        direction: s.direction,
        feature: s.feature,
        from: s.from,
        to: s.to,
        frameMsP50: s.frameMsP50
      })) ?? [],
      locked: live?.locked ?? null,
      probe: telemetry?.device.probe ?? null
    };
  }
});

registerDiagnosticsSection<AuraBatchPlanReport>({
  id: "prd11.rendererBatching",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  key: "renderer.batching",
  collect: () => prd11LatestBatchPlanReport()
});

/**
 * C-38 `quality` extension (C-27 seam). Phase 0 mounts the PR 0a stub
 * controller — the real governor/controller lands in later phases.
 *
 * T11-GLOBALFLAGS: the extension no longer writes the module-level renderer
 * flag store. Since T0-28 (#914) `createAuraApp` passes the app's flags into
 * `Renderer.create({ qrFlags })`, bound per device, so `frameContributors`
 * gates on this app's `A3D_QR_TIERS` without arming other apps or lanes.
 *
 * The extension itself is registered unconditionally (flag metadata only);
 * with `A3D_QR_TIERS` off the flags object reports every lane off, so the
 * contributor stays inactive and flag-off rendering is unchanged.
 */
const qualityControllerUnregisters = new WeakMap<object, () => void>();

registerAppExtension<"quality">({
  id: "prd11.quality",
  owner: "prd11",
  flag: "A3D_QR_TIERS",
  member: "quality",
  create(_app, ctx) {
    // Wave B RendererOptions: one parser for quality/adaptive/targetFrameRate/
    // batching plus `?aura3d-quality=` / `?aura3d-adaptive=` (every build).
    const renderer = ctx.options.renderer && typeof ctx.options.renderer === "object" ? ctx.options.renderer : undefined;
    let parsed: ReturnType<typeof parseQualityRendererOptions>;
    try {
      // URL overrides apply only with the lane on, so flag-off apps are unchanged.
      const search = ctx.flags.on("A3D_QR_TIERS") ? undefined : null;
      parsed = parseQualityRendererOptions(renderer, search, ctx.options as { readonly performanceQuality?: unknown });
    } catch (error) {
      // Flag-off behaviour stays as before (values were never validated); the
      // strict parse only applies once the lane is on.
      if (ctx.flags.on("A3D_QR_TIERS")) throw error;
      return new StubQualityController("auto");
    }
    if (!ctx.flags.on("A3D_QR_TIERS")) {
      return new StubQualityController(parsed.requested);
    }
    // Deprecation warnings only once the lane is on, so flag-off console output is unchanged.
    for (const warning of parsed.warnings) console.warn(warning);
    const controller = new AuraQuality(parsed.requested, parsed.overrides as Partial<AuraQualityTierSettings> | undefined, {
      adaptive: parsed.adaptive,
      targetFrameRate: parsed.targetFrameRate,
      requestedSource: parsed.requestedSource,
      coarsePointer: typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : false,
      storage: typeof localStorage !== "undefined" ? localStorage : null
    });
    qualityControllerUnregisters.set(controller, registerAuraQualityController(controller, ctx.flags));
    return controller;
  },
  dispose(value) {
    qualityControllerUnregisters.get(value)?.();
  }
});

/**
 * PRD-01 C-31 diagnostics collectors (`lanes/prd01/diagnostics.ts`).
 * Phase 0: sections report observed values where reachable and null otherwise —
 * never constants. `output` reads the C-38 extension's recorded state; the rest
 * stay null until the Phase 2-4 surfaces exist.
 */

import type { AuraApp } from "../../agent-api/index";
import type { AuraOutputSurface } from "../../contracts/output";
import { rendererProgramCachePeek } from "@aura3d/rendering";
import type { DeviceCounters } from "@aura3d/rendering/contracts";

/** The output surface keeps its own state block for the diagnostics section. */
export const PRD01_OUTPUT_STATE = Symbol.for("a3d.prd01.output-state");

export interface Prd01OutputState {
  snapshot(): {
    readonly implementation: "stub" | "real";
    readonly requested: Readonly<Record<string, unknown>>;
    readonly applied: Readonly<Record<string, unknown>>;
    readonly overlay: { readonly mounted: boolean; readonly via: "none" | "dom" };
    readonly rendererErrors: readonly { readonly code: string; readonly message: string }[];
  };
}

export function collectOutput(app: AuraApp): unknown {
  const surface = (app as { output?: AuraOutputSurface & { [PRD01_OUTPUT_STATE]?: Prd01OutputState } }).output;
  const state = surface?.[PRD01_OUTPUT_STATE]?.snapshot();
  if (!state) {
    return {
      implementation: null,
      requested: null,
      applied: null,
      toneMapping: null,
      exposure: null,
      dithering: null,
      overlay: null
    };
  }
  const requested = state.requested;
  const applied = state.applied;
  const exposureApplied = applied.exposure ?? requested.exposure ?? null;
  return {
    implementation: state.implementation,
    requested: requested as Record<string, unknown>,
    applied: applied as Record<string, unknown>,
    // C-05 AuraOutputDiagnostics fields, filled with observed-or-requested
    // values (null where nothing observes them yet).
    toneMapping: (applied.toneMapping ?? requested.toneMapping ?? null) as unknown,
    exposure: { applied: exposureApplied, source: exposureApplied === null ? null : "output" },
    dithering: (applied.dither ?? requested.dither ?? null) as unknown,
    targetFormat: null,
    degraded: null,
    overlay: state.overlay,
    rendererErrors: state.rendererErrors
  };
}

/** Where lane 15 hangs the live `Renderer` for the lane's diagnostics (Q-15-1). */
export const PRD01_RENDERER = Symbol.for("a3d.prd01.renderer");

interface Prd01RendererLike {
  readonly resolutionReport?: {
    readonly pixelRatio: number;
    readonly renderScale: number;
    readonly renderScaleCeiling: number;
    readonly backingWidth: number;
    readonly backingHeight: number;
  };
  readonly renderScale?: number;
  readonly device?: {
    counters?: () => Partial<DeviceCounters>;
  };
  readonly frameStats?: {
    percentiles(field: "cpuSubmitMs" | "cpuFrameMs" | "gpuMs"): {
      readonly p50: number;
      readonly p95: number;
      readonly p99: number;
      readonly max: number;
    };
  };
}

export function collectResolution(app: AuraApp): unknown {
  // §6.9/C-31: pixelRatio/renderScale/ceiling/backing are read off the live
  // renderer (PRD01_RENDERER seam — lane 15 attaches it when wiring the §6.9
  // call sites, request Q-15-1); canvas metrics fall back to screenshot() /
  // app.canvas. Values stay null only where genuinely unobservable.
  const renderer = (app as { [PRD01_RENDERER]?: Prd01RendererLike })[PRD01_RENDERER];
  const report = renderer?.resolutionReport ?? null;

  let canvasWidth: number | null = null;
  let canvasHeight: number | null = null;
  let cssWidth: number | null = null;
  const appCanvas = (app as { canvas?: HTMLCanvasElement }).canvas;
  try {
    const shot = app.screenshot();
    canvasWidth = shot.width > 0 ? shot.width : null;
    canvasHeight = shot.height > 0 ? shot.height : null;
    if (appCanvas && typeof appCanvas.getBoundingClientRect === "function") {
      const rect = appCanvas.getBoundingClientRect();
      cssWidth = rect.width > 0 ? rect.width : null;
    }
  } catch {
    canvasWidth = null;
    canvasHeight = null;
  }
  const devicePixelRatio = typeof globalThis !== "undefined" && "devicePixelRatio" in globalThis
    ? (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? null
    : null;
  const effectivePixelRatio = report?.pixelRatio
    ?? (canvasWidth !== null && cssWidth !== null ? canvasWidth / cssWidth : null);
  return {
    canvas: canvasWidth === null ? null : { width: canvasWidth, height: canvasHeight },
    devicePixelRatio,
    effectivePixelRatio,
    renderScale: report?.renderScale ?? null,
    renderScaleCeiling: report?.renderScaleCeiling ?? null,
    backing: report === null ? null : { width: report.backingWidth, height: report.backingHeight },
    compositeTarget: null,
    msaa: null
  };
}

export function collectPrograms(app: AuraApp): unknown {
  // Phase 6 (C-31): read the live generator cache + C-28 counters off the
  // PRD01_RENDERER seam. Peek (never create) so a stub can't get planted.
  const renderer = (app as { [PRD01_RENDERER]?: Prd01RendererLike })[PRD01_RENDERER];
  const device = renderer?.device;
  const counters = device?.counters?.();
  const cache = device ? rendererProgramCachePeek(device as Parameters<typeof rendererProgramCachePeek>[0]) : undefined;
  if (!cache) {
    return {
      stub: cache === undefined && device === undefined,
      compiled: null,
      pending: null,
      failed: null,
      compileMsTotal: null,
      reused: null,
      active: null,
      cacheKeys: [] as const,
      programs: [] as const,
      deviceProgramCompiles: counters?.programCompiles ?? null
    };
  }
  const stats = cache.stats();
  const introspective = cache as { keys?: () => readonly string[]; reused?: number };
  return {
    stub: false,
    compiled: stats.compiled,
    pending: stats.pending,
    failed: stats.failed,
    compileMsTotal: stats.compileMsTotal,
    reused: introspective.reused ?? null,
    active: stats.compiled,
    compiledSinceReady: stats.compiledSinceReady ?? null,
    cacheKeys: introspective.keys?.() ?? ([] as const),
    programs: introspective.keys?.() ?? ([] as const),
    deviceProgramCompiles: counters?.programCompiles ?? null
  };
}

export function collectFrameAllocations(app: AuraApp): unknown {
  // Phase 6 (C-31/C-28): steady-state deltas on device counters are the lane's
  // zero-creation signal; cpuSubmitMs percentiles come off the C-28 monitor.
  const renderer = (app as { [PRD01_RENDERER]?: Prd01RendererLike })[PRD01_RENDERER];
  const counters = renderer?.device?.counters?.();
  const cpuSubmit = renderer?.frameStats?.percentiles("cpuSubmitMs") ?? null;
  const cpuFrame = renderer?.frameStats?.percentiles("cpuFrameMs") ?? null;
  return {
    stub: renderer === undefined,
    targets: counters?.renderTargetsCreated ?? null,
    passes: null,
    frameBytes: null,
    device: counters ?? null,
    cpuSubmitMs: cpuSubmit,
    cpuFrameMs: cpuFrame
  };
}

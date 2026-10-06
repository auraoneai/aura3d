/**
 * PRD-01 C-31 diagnostics collectors (`lanes/prd01/diagnostics.ts`).
 * Phase 0: sections report observed values where reachable and null otherwise —
 * never constants. `output` reads the C-38 extension's recorded state; the rest
 * stay null until the Phase 2-4 surfaces exist.
 */

import type { AuraApp } from "../../agent-api/index";
import type { AuraOutputSurface } from "../../contracts/output";

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

export function collectPrograms(_app: AuraApp): unknown {
  // The program generator/cache is Phase 3; report the honest empty state.
  return {
    stub: true,
    compiled: null,
    reused: null,
    active: null,
    cacheKeys: [] as const,
    programs: [] as const
  };
}

export function collectFrameAllocations(_app: AuraApp): unknown {
  // Frame-graph allocations land with Phase 3/4; nothing observable yet.
  return {
    stub: true,
    targets: null,
    passes: null,
    frameBytes: null
  };
}

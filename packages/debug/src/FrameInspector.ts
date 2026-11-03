import type { RenderDeviceDiagnostics } from "@aura3d/rendering";

/** A pass reported by the renderer after it was actually submitted. */
export interface InspectedFramePass {
  readonly name: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly drawCalls: number | null;
  readonly cpuTimeMs: number | null;
  readonly gpuTimeMs: number | null;
  readonly status?: "completed" | "failed";
}

/** An actual view-scoped GPU interval, not a pass or a whole-frame duration. */
export interface InspectedGpuViewTiming {
  readonly frameNumber: number;
  readonly coverage: "view-collect-through-after-output";
  readonly wholeFrameGpuTimeMs: null;
  readonly closed: boolean;
  readonly truncated: boolean;
  readonly views: readonly { readonly viewId: string | number; readonly gpuTimeMs: number | null }[];
}

/** Renderer-owned telemetry for the most recent frame. Null timings mean unmeasured. */
export interface FrameInspectionCapture {
  readonly frameNumber: number;
  readonly passes: readonly InspectedFramePass[];
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly cpuTimeMs: number | null;
  readonly gpuTimeMs: number | null;
  /** Delayed, partial-view measurements; they must not be promoted to frame or pass times. */
  readonly gpuViewTiming?: InspectedGpuViewTiming | null;
  /** False when a direct or backend-specific phase could not be observed. */
  readonly complete?: boolean;
}

/** A renderer supplies live device counters and may supply recorded pass telemetry. */
export interface FrameInspectionSource {
  getDiagnostics(): RenderDeviceDiagnostics;
  getFrameInspection?(): FrameInspectionCapture | null;
  getFrameInspectionHistory?(): readonly FrameInspectionCapture[];
  readonly info?: { readonly render: { readonly frame: number } };
}

export interface FrameInspectionSnapshot {
  readonly status: "ready" | "partial" | "error";
  readonly frameNumber: number | null;
  readonly passes: readonly InspectedFramePass[];
  readonly cpuTimeMs: number | null;
  readonly gpuTimeMs: number | null;
  readonly gpuViewTiming: InspectedGpuViewTiming | null;
  /** Recent measured captures, kept separate from the current frame because queries settle later. */
  readonly recentGpuViewTimings: readonly InspectedGpuViewTiming[];
  readonly drawCalls: number | null;
  readonly triangles: number | null;
  readonly resources: {
    readonly buffers: number | null;
    readonly shaders: number | null;
    readonly textures: number | null;
    readonly renderTargets: number | null;
    readonly bufferBytes: number | null;
    readonly textureBytes: number | null;
    readonly approximateGpuMemoryBytes: number | null;
  };
  readonly diagnostics: {
    readonly contextLost: boolean | null;
    readonly lastError: string | null;
    readonly warnings: readonly string[];
  };
}

/**
 * Reads an existing renderer; never starts a frame or reads back pixels.
 * Device counters remain available even on renderers that do not yet expose
 * pass-level instrumentation. Such a snapshot is marked `partial`.
 */
export class FrameInspector {
  constructor(private readonly source: FrameInspectionSource) {}

  capture(): FrameInspectionSnapshot {
    try {
      const frame = this.source.getFrameInspection?.() ?? null;
      const diagnostics = frame?.diagnostics ?? this.source.getDiagnostics();
      const failed = diagnostics.contextLost || diagnostics.lastError !== null || frame?.passes.some((pass) => pass.status === "failed");
      const gpuViewTiming = viewTiming(frame);
      const warnings = (diagnostics.gpuTargetWarnings ?? []).map(redact);
      // History is ordered by capture, not frame number: an unsuccessful render
      // can be retried with the same frame number. Never attach a past query to
      // the latest capture merely because those numbers happen to match.
      const recentGpuViewTimings: InspectedGpuViewTiming[] = [];
      try {
        const history = this.source.getFrameInspectionHistory?.() ?? [];
        for (let i = history.length - 1; i >= 0 && recentGpuViewTimings.length < 4; i -= 1) {
          const timing = viewTiming(history[i]);
          if (timing?.views.some((view) => view.gpuTimeMs !== null)) recentGpuViewTimings.unshift(timing);
        }
      } catch {
        // Failure to observe optional history must not erase the current frame.
        warnings.push("GPU view timing history is unavailable.");
      }
      for (const pass of frame?.passes ?? []) {
        if (pass.status === "failed") warnings.push(`Observed pass "${redact(pass.name)}" failed.`);
      }
      if (gpuViewTiming || recentGpuViewTimings.length > 0) {
        warnings.push("GPU view intervals cover collect through after-output only; they are not whole-frame or per-pass GPU times.");
      }
      if (gpuViewTiming) {
        for (const view of gpuViewTiming.views.slice(0, 8)) {
          warnings.push(`Frame ${gpuViewTiming.frameNumber}, GPU view ${view.viewId}: ${view.gpuTimeMs === null ? "unavailable" : `${view.gpuTimeMs} ms`}.`);
        }
        if (gpuViewTiming.truncated || gpuViewTiming.views.length > 8) warnings.push("The GPU view timing list is incomplete.");
      }
      // The editor's existing inspector renders diagnostic warnings. Include
      // labelled retained observations there without attaching a delayed query
      // to the latest capture; frame numbers can be reused after a failure.
      if (!gpuViewTiming || gpuViewTiming.views.length === 0 || gpuViewTiming.views.some((view) => view.gpuTimeMs === null)) {
        const recent = recentGpuViewTimings[recentGpuViewTimings.length - 1];
        const measuredViews = recent?.views.filter((view) => view.gpuTimeMs !== null) ?? [];
        for (const measured of measuredViews.slice(0, 4)) {
          warnings.push(`Retained GPU view sample (possibly an earlier attempt): frame ${recent!.frameNumber}, view ${measured.viewId}, ${measured.gpuTimeMs} ms (partial interval).`);
        }
        if (recent?.truncated || measuredViews.length > 4) warnings.push("Additional retained GPU view timings are omitted.");
      }
      return {
        status: failed ? "error" : frame?.complete === true
          && (!frame.gpuViewTiming || gpuViewTiming !== null && !gpuViewTiming.truncated) ? "ready" : "partial",
        frameNumber: count(frame?.frameNumber ?? this.source.info?.render.frame),
        passes: (frame?.passes ?? []).map((pass) => ({
          name: redact(pass.name),
          reads: pass.reads.map(redact),
          writes: pass.writes.map(redact),
          drawCalls: count(pass.drawCalls),
          cpuTimeMs: duration(pass.cpuTimeMs),
          gpuTimeMs: duration(pass.gpuTimeMs),
          ...(pass.status ? { status: pass.status } : {})
        })),
        cpuTimeMs: duration(frame?.cpuTimeMs),
        gpuTimeMs: duration(frame?.gpuTimeMs),
        gpuViewTiming,
        recentGpuViewTimings,
        drawCalls: count(diagnostics.drawCalls),
        triangles: count(diagnostics.triangles),
        resources: {
          buffers: count(diagnostics.buffers),
          shaders: count(diagnostics.shaders),
          textures: count(diagnostics.textures),
          renderTargets: count(diagnostics.renderTargets),
          bufferBytes: count(diagnostics.bufferBytes),
          textureBytes: count(diagnostics.textureBytes),
          approximateGpuMemoryBytes: count(diagnostics.approximateGpuMemoryBytes)
        },
        diagnostics: {
          contextLost: diagnostics.contextLost,
          lastError: diagnostics.lastError ? redact(diagnostics.lastError) : null,
          warnings
        }
      };
    } catch (error) {
      return {
        status: "error", frameNumber: null, passes: [], cpuTimeMs: null, gpuTimeMs: null,
        gpuViewTiming: null, recentGpuViewTimings: [],
        drawCalls: null, triangles: null,
        resources: { buffers: null, shaders: null, textures: null, renderTargets: null, bufferBytes: null, textureBytes: null, approximateGpuMemoryBytes: null },
        diagnostics: { contextLost: null, lastError: redact(error instanceof Error ? error.message : "Unable to inspect renderer."), warnings: [] }
      };
    }
  }
}

function viewTiming(frame: FrameInspectionCapture | null | undefined): InspectedGpuViewTiming | null {
  const timing = frame?.gpuViewTiming;
  if (!timing || count(frame?.frameNumber) === null || timing.frameNumber !== frame?.frameNumber
    || timing.coverage !== "view-collect-through-after-output" || timing.wholeFrameGpuTimeMs !== null
    || timing.closed !== true || typeof timing.truncated !== "boolean" || !Array.isArray(timing.views)) return null;
  const views: { viewId: string | number; gpuTimeMs: number | null }[] = [];
  for (const view of timing.views) {
    const id = view?.viewId;
    if (!(typeof id === "string" && id.length > 0) && !(typeof id === "number" && Number.isFinite(id))) return null;
    views.push({ viewId: typeof id === "string" ? redact(id).slice(0, 256) : id, gpuTimeMs: duration(view.gpuTimeMs) });
  }
  return {
    frameNumber: timing.frameNumber,
    coverage: timing.coverage,
    wholeFrameGpuTimeMs: null,
    closed: true,
    truncated: timing.truncated,
    views
  };
}

function count(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function duration(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function redact(value: string): string {
  return value
    .replace(/\b(?:https?|wss?):\/\/[^\s)\]"']+/gi, "[url]")
    .replace(/\b(bearer)\s+[^\s,;]+/gi, "$1 [redacted]")
    .replace(/\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

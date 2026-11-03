import { FrameInspector, type FrameInspectionSnapshot } from "@aura3d/debug";
import type { EditorShell } from "../EditorShell";

export class ProfilerPanel {
  readonly element = document.createElement("section");

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel profiler-panel";
  }

  render(): void {
    const diagnostics = this.shell.runtime.diagnosticsSnapshot();
    const hasFrameTimeSample = diagnostics.hasFrameTimeSample === true
      && Number.isFinite(diagnostics.frameTimeMs)
      && diagnostics.frameTimeMs >= 0;
    const frameTime = hasFrameTimeSample ? `${diagnostics.frameTimeMs.toFixed(2)} ms` : "Unavailable";
    const source = this.shell.viewport?.frameInspectionSource?.();
    const frame = source ? new FrameInspector(source).capture() : null;
    const gpuFrameTime = frame?.gpuTimeMs == null ? "Unavailable" : `${frame.gpuTimeMs} ms`;
    // A failed viewport attempt may leave the editor-runtime counters from the
    // preceding frame. Do not present them as measurements of the failed one.
    const drawCalls = frame?.status === "error" ? "Unavailable" : diagnostics.drawCalls;
    const triangles = frame?.status === "error" ? "Unavailable" : diagnostics.triangleCount ?? 0;
    this.element.innerHTML = `
      <div class="panel-title"><span>Profiler</span></div>
      <dl class="metrics">
        <dt>Frame time (CPU)</dt><dd data-metric="frame-time" data-status="${hasFrameTimeSample ? "measured" : "unavailable"}" title="Elapsed viewport preparation and synchronous render submission; not GPU timing.">${frameTime}</dd>
        <dt>GPU time (whole frame)</dt><dd data-metric="gpu-frame-time">${gpuFrameTime}</dd>
        <dt>Draw calls</dt><dd data-metric="draw-calls">${drawCalls}</dd>
        <dt>Triangles</dt><dd data-metric="triangles">${triangles}</dd>
        <dt>Resources</dt><dd data-metric="resources">${diagnostics.resources?.length ?? 0} tracked</dd>
        <dt>Physics</dt><dd data-metric="physics">${diagnostics.physicsBodies} bodies</dd>
        <dt>Shader diagnostics</dt><dd data-metric="shader-diagnostics">${diagnostics.shaderWarnings.length} warnings</dd>
        <dt>Resource diagnostics</dt><dd data-metric="resource-diagnostics">${diagnostics.resourceWarnings.length} warnings</dd>
        <dt>Mode</dt><dd data-metric="mode">${this.shell.runtime.mode}</dd>
      </dl>
      ${gpuViewTimings(frame)}
      <div class="diagnostics-list" data-role="diagnostics-list">
        ${diagnostics.resources?.map((resource) => `<span data-status="${resource.status}">${resource.kind}: ${resource.label}</span>`).join("") ?? ""}
      </div>
      <div class="plugin-list">
        ${this.shell.plugins.snapshot().panels.map((panel) => `<span>${panel.title}</span>`).join("")}
      </div>
    `;
  }
}

function gpuViewTimings(frame: FrameInspectionSnapshot | null): string {
  const current = frame?.gpuViewTiming;
  const rows = current?.views.slice(0, 8).map((view) =>
    `<span data-status="${view.gpuTimeMs === null ? "unavailable" : "measured"}">Frame ${current.frameNumber}, view ${escapeHtml(String(view.viewId))}: ${view.gpuTimeMs === null ? "Unavailable" : `${view.gpuTimeMs} ms`}</span>`
  ) ?? [];
  if (!rows.length) rows.push("<span>GPU view timing unavailable.</span>");
  const recent = frame?.recentGpuViewTimings[frame.recentGpuViewTimings.length - 1];
  if (recent && (!current || current.views.length === 0 || current.views.some((view) => view.gpuTimeMs === null))) {
    const measured = recent.views.filter((entry) => entry.gpuTimeMs !== null);
    for (const view of measured.slice(0, 8)) {
      rows.push(`<span>Retained capture (possibly an earlier attempt) — frame ${recent.frameNumber}, view ${escapeHtml(String(view.viewId))}: ${view.gpuTimeMs} ms</span>`);
    }
    if (recent.truncated || measured.length > 8) rows.push("<span>Additional retained view timings omitted.</span>");
  }
  if (current?.truncated || (current?.views.length ?? 0) > 8) rows.push("<span>Additional view timings omitted.</span>");
  return `<div class="diagnostics-list" data-role="gpu-view-timings" aria-label="GPU view timings">
    <span>View collect through after-output only; not a whole-frame or per-pass GPU time. Unavailable may mean disabled, unsupported, pending or discarded.</span>
    ${rows.join("")}
  </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

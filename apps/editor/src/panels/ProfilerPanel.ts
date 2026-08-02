import type { EditorShell } from "../EditorShell";

export class ProfilerPanel {
  readonly element = document.createElement("section");
  private startedAt = performance.now();

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel profiler-panel";
  }

  render(): void {
    const elapsed = Math.max(1, performance.now() - this.startedAt);
    const fallbackFrameTime = Math.min(33.3, elapsed / Math.max(1, this.shell.frameCount));
    const diagnostics = this.shell.runtime.diagnosticsSnapshot();
    const frameTime = diagnostics.frameTimeMs || fallbackFrameTime;
    this.element.innerHTML = `
      <div class="panel-title"><span>Profiler</span></div>
      <dl class="metrics">
        <dt>Frame time</dt><dd data-metric="frame-time">${frameTime.toFixed(2)} ms</dd>
        <dt>Draw calls</dt><dd data-metric="draw-calls">${diagnostics.drawCalls}</dd>
        <dt>Triangles</dt><dd data-metric="triangles">${diagnostics.triangleCount ?? 0}</dd>
        <dt>Resources</dt><dd data-metric="resources">${diagnostics.resources?.length ?? 0} tracked</dd>
        <dt>Physics</dt><dd data-metric="physics">${diagnostics.physicsBodies} bodies</dd>
        <dt>Shader diagnostics</dt><dd data-metric="shader-diagnostics">${diagnostics.shaderWarnings.length} warnings</dd>
        <dt>Resource diagnostics</dt><dd data-metric="resource-diagnostics">${diagnostics.resourceWarnings.length} warnings</dd>
        <dt>Mode</dt><dd data-metric="mode">${this.shell.runtime.mode}</dd>
      </dl>
      <div class="diagnostics-list" data-role="diagnostics-list">
        ${diagnostics.resources?.map((resource) => `<span data-status="${resource.status}">${resource.kind}: ${resource.label}</span>`).join("") ?? ""}
      </div>
      <div class="plugin-list">
        ${this.shell.plugins.snapshot().panels.map((panel) => `<span>${panel.title}</span>`).join("")}
      </div>
    `;
  }
}

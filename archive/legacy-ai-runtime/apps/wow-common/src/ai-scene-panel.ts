import type { AuraSceneDiagnostics, AuraSceneIR } from "./ai-scene-runtime.ts";

export interface AIScenePanelState {
  readonly title: string;
  readonly summary: string;
  readonly status: string;
  readonly providerLabel: string;
  readonly scene: AuraSceneIR | null;
  readonly diagnostics: AuraSceneDiagnostics | null;
  readonly patchCount: number;
}

export function renderAIScenePanel(root: HTMLElement, state: AIScenePanelState): void {
  const metrics = state.diagnostics
    ? [
        ["Backend", state.diagnostics.selectedBackend],
        ["Frames", state.diagnostics.frameCount],
        ["Draw calls", state.diagnostics.drawCalls],
        ["Patches", state.patchCount],
        ["Placeholders", state.diagnostics.placeholders.length],
        ["Warnings", state.diagnostics.warnings.length]
      ]
    : [
        ["Backend", "pending"],
        ["Frames", 0],
        ["Draw calls", 0],
        ["Patches", state.patchCount],
        ["Placeholders", 0],
        ["Warnings", 0]
      ];

  root.innerHTML = `
    <section class="prompt-panel" aria-label="${escapeHtml(state.title)} controls">
      <div class="status-row">
        <span class="status-pill">${escapeHtml(state.status)}</span>
        <span class="provider-label">${escapeHtml(state.providerLabel)}</span>
      </div>
      <h1>${escapeHtml(state.title)}</h1>
      <p class="route-summary">${escapeHtml(state.summary)}</p>
      <div class="metric-grid">
        ${metrics.map(([label, value]) => renderMetric(String(label), String(value))).join("")}
      </div>
      <div class="patch-log">${escapeHtml(state.scene?.brief ?? "Generating deterministic mock scene.")}</div>
    </section>
  `;
}

export function renderInspector(root: HTMLElement, scene: AuraSceneIR | null, diagnostics: AuraSceneDiagnostics | null): void {
  root.innerHTML = `
    <aside class="inspector" aria-label="AI scene inspector">
      <section>
        <h2>Generated IR</h2>
        <pre>${escapeHtml(JSON.stringify(scene ?? {}, null, 2))}</pre>
      </section>
      <section>
        <h2>Diagnostics</h2>
        <pre>${escapeHtml(JSON.stringify(diagnostics ?? {}, null, 2))}</pre>
      </section>
    </aside>
  `;
}

function renderMetric(label: string, value: string): string {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

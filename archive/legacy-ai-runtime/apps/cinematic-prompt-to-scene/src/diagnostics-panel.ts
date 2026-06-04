import type { CinematicSceneIR } from "./cinematic-demo-fixtures";
import type { SceneViewportSnapshot } from "./scene-viewport";

export interface DiagnosticsPanelState {
  readonly scene: CinematicSceneIR;
  readonly snapshot: SceneViewportSnapshot;
  readonly error?: string;
}

export function renderDiagnosticsPanel(root: HTMLElement, state: DiagnosticsPanelState): void {
  const open = root.querySelector("details")?.open ?? false;
  root.innerHTML = `
    <details class="panel" ${open ? "open" : ""}>
      <summary>
        <span>Diagnostics</span>
        <strong>${escapeHtml(state.snapshot.status)}</strong>
      </summary>
      <div class="panel-body">
        ${state.error ? `<div class="inline-error">${escapeHtml(state.error)}</div>` : ""}
        <dl class="metrics-grid">
          <div><dt>Backend</dt><dd>${escapeHtml(state.snapshot.renderer)}</dd></div>
          <div><dt>Frames</dt><dd>${state.snapshot.frameCount}</dd></div>
          <div><dt>FPS</dt><dd>${state.snapshot.fps.toFixed(1)}</dd></div>
          <div><dt>Draw calls</dt><dd>${state.snapshot.drawCalls}</dd></div>
          <div><dt>Textures</dt><dd>${state.snapshot.textures}</dd></div>
          <div><dt>Render</dt><dd>${state.snapshot.renderWidth}x${state.snapshot.renderHeight}</dd></div>
        </dl>
        <ul class="diagnostic-list">
          ${state.scene.diagnostics.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          ${state.snapshot.error ? `<li>${escapeHtml(state.snapshot.error)}</li>` : ""}
        </ul>
      </div>
    </details>
  `;
}

export function renderIrPanel(root: HTMLElement, scene: CinematicSceneIR): void {
  const open = root.querySelector("details")?.open ?? false;
  root.innerHTML = `
    <details class="panel ir-panel" ${open ? "open" : ""}>
      <summary>
        <span>Scene IR</span>
        <strong>${escapeHtml(scene.qualityTarget)}</strong>
      </summary>
      <div class="panel-body">
        <pre class="ir-code">${escapeHtml(JSON.stringify(stripHistory(scene), null, 2))}</pre>
      </div>
    </details>
  `;
}

function stripHistory(scene: CinematicSceneIR): unknown {
  return {
    id: scene.id,
    title: scene.title,
    providerMode: scene.providerMode,
    backend: scene.backend,
    prompt: scene.prompt,
    assetId: scene.assetId,
    environmentId: scene.environmentId,
    shot: scene.shot,
    camera: scene.camera,
    atmosphere: scene.atmosphere,
    lighting: scene.lighting,
    materialPreset: scene.materialPreset,
    history: scene.history
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

import type { CinematicSceneIR } from "./cinematic-demo-fixtures";

export interface ExportPanelState {
  readonly screenshotCount: number;
  readonly bundleCount: number;
  readonly lastMessage?: string;
}

export interface ExportPanelHandlers {
  readonly onScreenshot: () => void;
  readonly onBundle: () => void;
}

export function renderExportPanel(
  root: HTMLElement,
  scene: CinematicSceneIR,
  state: ExportPanelState,
  handlers: ExportPanelHandlers
): void {
  const open = root.querySelector("details")?.open ?? true;
  root.innerHTML = `
    <details class="panel" ${open ? "open" : ""}>
      <summary>
        <span>Export</span>
        <strong>${scene.backend}</strong>
      </summary>
      <div class="panel-body">
        <div class="button-grid">
          <button id="capture-screenshot" class="secondary-button" type="button">Capture Screenshot</button>
          <button id="export-bundle" class="secondary-button" type="button">Export Bundle</button>
        </div>
        <p class="fine-print">Screenshots use the WebGL2 drawing buffer. Bundles include prompt, IR, assets, and patch history.</p>
        ${state.lastMessage ? `<div class="success-note">${escapeHtml(state.lastMessage)}</div>` : ""}
        <dl class="metrics-grid compact">
          <div><dt>Screenshots</dt><dd>${state.screenshotCount}</dd></div>
          <div><dt>Bundles</dt><dd>${state.bundleCount}</dd></div>
        </dl>
      </div>
    </details>
  `;

  root.querySelector<HTMLButtonElement>("#capture-screenshot")?.addEventListener("click", handlers.onScreenshot);
  root.querySelector<HTMLButtonElement>("#export-bundle")?.addEventListener("click", handlers.onBundle);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

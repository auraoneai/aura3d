import type { AuraApp, AuraDiagnostics } from "../agent-api/index.js";

export interface AuraDiagnosticsOverlay {
  readonly element: HTMLElement;
  update(diagnostics?: AuraDiagnostics): void;
  dispose(): void;
}

export function createAuraDiagnosticsOverlay(app: AuraApp, host: HTMLElement = document.body): AuraDiagnosticsOverlay {
  const element = document.createElement("section");
  element.className = "aura-diagnostics-overlay";
  element.setAttribute("aria-label", "Aura3D diagnostics");
  element.style.cssText = [
    "position:absolute",
    "right:12px",
    "bottom:12px",
    "z-index:20",
    "font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    "background:rgba(7,11,18,0.86)",
    "color:#f4f7fb",
    "border:1px solid rgba(150,180,220,0.35)",
    "border-radius:8px",
    "padding:10px 12px",
    "min-width:220px"
  ].join(";");
  host.append(element);
  const overlay: AuraDiagnosticsOverlay = {
    element,
    update(diagnostics = app.diagnostics()) {
      element.innerHTML = [
        "<strong>Aura3D diagnostics</strong>",
        `<div>backend: ${escapeHtml(diagnostics.backend)}</div>`,
        `<div>fps: ${diagnostics.fps}</div>`,
        `<div>draw calls: ${diagnostics.drawCalls}</div>`,
        `<div>render size: ${diagnostics.renderSize[0]} x ${diagnostics.renderSize[1]}</div>`,
        `<div>assets: ${diagnostics.assets.length}</div>`,
        diagnostics.errors.length ? `<div>errors: ${diagnostics.errors.length}</div>` : ""
      ].join("");
    },
    dispose() {
      element.remove();
    }
  };
  overlay.update();
  return overlay;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

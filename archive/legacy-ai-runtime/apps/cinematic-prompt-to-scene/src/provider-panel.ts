import { providerModeOptions, type ProviderMode } from "./cinematic-demo-fixtures";

export interface ProviderPanelState {
  readonly mode: ProviderMode;
  readonly isGenerating: boolean;
  readonly lastError?: string;
}

export interface ProviderPanelHandlers {
  readonly onModeChange: (mode: ProviderMode) => void;
}

export function renderProviderPanel(
  root: HTMLElement,
  state: ProviderPanelState,
  handlers: ProviderPanelHandlers
): void {
  const open = root.querySelector("details")?.open ?? true;
  root.innerHTML = `
    <details class="panel" ${open ? "open" : ""}>
      <summary>
        <span>Provider</span>
        <strong>${escapeHtml(labelForMode(state.mode))}</strong>
      </summary>
      <div class="panel-body">
        <label class="field-label" for="provider-mode">Mode</label>
        <select id="provider-mode" class="field-input">
          ${providerModeOptions.map((option) => `
            <option value="${option.mode}" ${option.mode === state.mode ? "selected" : ""}>
              ${escapeHtml(option.label)}
            </option>
          `).join("")}
        </select>
        <p class="fine-print">${escapeHtml(descriptionForMode(state.mode))}</p>
        <div class="provider-truth">
          <span class="truth-pill ${requiresProxy(state.mode) ? "needs-proxy" : ""}">
            ${requiresProxy(state.mode) ? "Server proxy required" : "Runs without keys"}
          </span>
          <span class="truth-pill">Browser keys blocked</span>
          <span class="truth-pill">Last good scene retained</span>
        </div>
        ${state.lastError ? `<div class="inline-error">${escapeHtml(state.lastError)}</div>` : ""}
      </div>
    </details>
  `;

  const select = root.querySelector<HTMLSelectElement>("#provider-mode");
  select?.addEventListener("change", () => {
    handlers.onModeChange(select.value as ProviderMode);
  });
}

function labelForMode(mode: ProviderMode): string {
  return providerModeOptions.find((option) => option.mode === mode)?.label ?? mode;
}

function descriptionForMode(mode: ProviderMode): string {
  return providerModeOptions.find((option) => option.mode === mode)?.description ?? "";
}

function requiresProxy(mode: ProviderMode): boolean {
  return providerModeOptions.find((option) => option.mode === mode)?.requiresProxy ?? false;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

import type { CinematicSceneIR } from "./cinematic-demo-fixtures";
import type { SamplePrompt } from "./sample-prompts";

export interface PatchPanelState {
  readonly prompt: string;
  readonly error?: string;
}

export interface PatchPanelHandlers {
  readonly onPromptChange: (prompt: string) => void;
  readonly onPatch: () => void;
  readonly onSample: (prompt: string) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export function renderPatchPanel(
  root: HTMLElement,
  scene: CinematicSceneIR,
  state: PatchPanelState,
  samples: readonly SamplePrompt[],
  handlers: PatchPanelHandlers
): void {
  const open = root.querySelector("details")?.open ?? true;
  root.innerHTML = `
    <details class="panel" ${open ? "open" : ""}>
      <summary>
        <span>Patch</span>
        <strong>${scene.history.length} applied</strong>
      </summary>
      <div class="panel-body">
        <textarea id="patch-prompt" class="patch-textarea" rows="4">${escapeHtml(state.prompt)}</textarea>
        <div class="prompt-row">
          <select id="sample-patch" class="field-input">
            <option value="">Patch prompts</option>
            ${samples.map((sample) => `<option value="${escapeHtml(sample.prompt)}">${escapeHtml(sample.label)}</option>`).join("")}
          </select>
          <button id="apply-patch" class="primary-button" type="button">Apply Patch</button>
        </div>
        <div class="button-grid">
          <button id="undo-patch" class="secondary-button" type="button" ${scene.history.length === 0 ? "disabled" : ""}>Undo</button>
          <button id="redo-patch" class="secondary-button" type="button" ${scene.future.length === 0 ? "disabled" : ""}>Redo</button>
        </div>
        ${state.error ? `<div class="inline-error">${escapeHtml(state.error)}</div>` : ""}
      </div>
    </details>
  `;

  const textarea = root.querySelector<HTMLTextAreaElement>("#patch-prompt");
  textarea?.addEventListener("input", () => handlers.onPromptChange(textarea.value));
  root.querySelector<HTMLButtonElement>("#apply-patch")?.addEventListener("click", handlers.onPatch);
  root.querySelector<HTMLButtonElement>("#undo-patch")?.addEventListener("click", handlers.onUndo);
  root.querySelector<HTMLButtonElement>("#redo-patch")?.addEventListener("click", handlers.onRedo);
  const sample = root.querySelector<HTMLSelectElement>("#sample-patch");
  sample?.addEventListener("change", () => {
    if (sample.value) handlers.onSample(sample.value);
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

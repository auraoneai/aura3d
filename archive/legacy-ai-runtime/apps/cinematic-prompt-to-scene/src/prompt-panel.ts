import type { SamplePrompt } from "./sample-prompts";

export interface PromptPanelState {
  readonly prompt: string;
  readonly isGenerating: boolean;
  readonly error?: string;
}

export interface PromptPanelHandlers {
  readonly onPromptChange: (prompt: string) => void;
  readonly onGenerate: () => void;
  readonly onSample: (prompt: string) => void;
}

export function renderPromptPanel(
  root: HTMLElement,
  state: PromptPanelState,
  samples: readonly SamplePrompt[],
  handlers: PromptPanelHandlers
): void {
  root.innerHTML = `
    <section class="panel prompt-panel">
      <div class="panel-heading">
        <span>Cinematic Prompt</span>
        <strong>${state.isGenerating ? "Generating" : "Ready"}</strong>
      </div>
      <textarea id="scene-prompt" class="prompt-textarea" rows="7">${escapeHtml(state.prompt)}</textarea>
      <div class="prompt-row">
        <select id="sample-prompt" class="field-input">
          <option value="">Sample prompts</option>
          ${samples.map((sample) => `<option value="${escapeHtml(sample.prompt)}">${escapeHtml(sample.label)}</option>`).join("")}
        </select>
        <button id="generate-scene" class="primary-button" type="button" ${state.isGenerating ? "disabled" : ""}>
          ${state.isGenerating ? "Generating..." : "Generate Scene"}
        </button>
      </div>
      ${state.error ? `<div class="inline-error">${escapeHtml(state.error)}</div>` : ""}
    </section>
  `;

  const textarea = root.querySelector<HTMLTextAreaElement>("#scene-prompt");
  textarea?.addEventListener("input", () => handlers.onPromptChange(textarea.value));
  root.querySelector<HTMLButtonElement>("#generate-scene")?.addEventListener("click", handlers.onGenerate);
  const sample = root.querySelector<HTMLSelectElement>("#sample-prompt");
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

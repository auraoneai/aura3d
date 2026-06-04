export interface TimelinePanelState {
  readonly playing: boolean;
  readonly seconds: number;
  readonly durationSeconds: number;
}

export interface TimelinePanelHandlers {
  readonly onTogglePlay: () => void;
  readonly onScrub: (seconds: number) => void;
}

export function renderTimelinePanel(
  root: HTMLElement,
  state: TimelinePanelState,
  handlers: TimelinePanelHandlers
): void {
  root.innerHTML = `
    <section class="timeline-panel">
      <button id="timeline-toggle" class="icon-button" type="button" aria-label="${state.playing ? "Pause timeline" : "Play timeline"}">
        ${state.playing ? "Pause" : "Play"}
      </button>
      <input
        id="timeline-scrub"
        class="timeline-scrub"
        type="range"
        min="0"
        max="${state.durationSeconds}"
        step="0.01"
        value="${state.seconds.toFixed(2)}"
        aria-label="Scrub timeline"
      >
      <output class="timeline-time">${formatTime(state.seconds)} / ${formatTime(state.durationSeconds)}</output>
    </section>
  `;

  root.querySelector<HTMLButtonElement>("#timeline-toggle")?.addEventListener("click", handlers.onTogglePlay);
  const scrub = root.querySelector<HTMLInputElement>("#timeline-scrub");
  scrub?.addEventListener("input", () => handlers.onScrub(Number(scrub.value)));
}

export function updateTimelinePanel(root: HTMLElement, state: TimelinePanelState): void {
  const button = root.querySelector<HTMLButtonElement>("#timeline-toggle");
  if (button) {
    button.textContent = state.playing ? "Pause" : "Play";
    button.setAttribute("aria-label", state.playing ? "Pause timeline" : "Play timeline");
  }
  const scrub = root.querySelector<HTMLInputElement>("#timeline-scrub");
  if (scrub && document.activeElement !== scrub) {
    scrub.max = String(state.durationSeconds);
    scrub.value = state.seconds.toFixed(2);
  }
  const output = root.querySelector<HTMLOutputElement>(".timeline-time");
  if (output) output.textContent = `${formatTime(state.seconds)} / ${formatTime(state.durationSeconds)}`;
}

function formatTime(value: number): string {
  return `${value.toFixed(1)}s`;
}

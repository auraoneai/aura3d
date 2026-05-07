import type { EditorShell } from "../EditorShell";

type PlaybackState = "playing" | "paused";

export class TimelinePanel {
  readonly element = document.createElement("section");
  private playback: PlaybackState = "paused";
  private scrubTime = 0;
  private loop = true;

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel timeline-panel";
    this.element.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      if (action === "timeline-play") this.playback = "playing";
      if (action === "timeline-pause") this.playback = "paused";
      if (action === "timeline-loop") this.loop = !this.loop;
      if (action) this.render();
    });
    this.element.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.action === "timeline-scrub") {
        this.scrubTime = Number(input.value);
        this.playback = "paused";
        this.render();
      }
    });
  }

  render(): void {
    const selected = this.shell.selectedProjectNode();
    const animationAssets = this.shell.project.assets.filter((asset) => asset.type === "gltf");
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Timeline</span>
        <span class="muted" data-role="timeline-state">${this.playback}</span>
      </div>
      <div class="timeline-controls">
        <button data-action="timeline-play" title="Play">Play</button>
        <button data-action="timeline-pause" title="Pause">Pause</button>
        <button data-action="timeline-loop" title="Loop">${this.loop ? "Loop" : "Once"}</button>
        <label>Time <input data-action="timeline-scrub" type="range" min="0" max="1" step="0.01" value="${this.scrubTime.toFixed(2)}"></label>
      </div>
      <div class="timeline-track-list">
        <div class="timeline-track">
          <strong>Selection</strong>
          <span>${escapeHtml(selected?.name ?? "No selection")}</span>
        </div>
        ${animationAssets.length > 0
          ? animationAssets.map((asset) => `
            <div class="timeline-track" data-asset-id="${escapeHtml(asset.id)}">
              <strong>${escapeHtml(asset.name)}</strong>
              <span>glTF animation source</span>
            </div>
          `).join("")
          : `<p class="muted">Import a glTF asset to preview animation clips.</p>`}
      </div>
    `;
  }

  snapshot(): { readonly playback: PlaybackState; readonly scrubTime: number; readonly loop: boolean; readonly assetCount: number } {
    return {
      playback: this.playback,
      scrubTime: this.scrubTime,
      loop: this.loop,
      assetCount: this.shell.project.assets.filter((asset) => asset.type === "gltf").length
    };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

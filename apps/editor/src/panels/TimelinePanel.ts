import type { EditorShell } from "../EditorShell";
import { TimelineModel, TimelineTrack, type TimelineLoopMode, type TimelineSnapshot } from "@galileo3d/editor-runtime";

type PlaybackState = "playing" | "paused";

export class TimelinePanel {
  readonly element = document.createElement("section");
  private readonly timeline = new TimelineModel({ id: "editor-authoring-timeline", name: "Editor Authoring Timeline", duration: 1, loopMode: "loop", frameRate: 60 });
  private preview: { readonly assetId: string; readonly clipName: string; readonly duration: number } | null = null;

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel timeline-panel";
    this.element.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      if (action === "timeline-play") this.timeline.play();
      if (action === "timeline-pause") this.timeline.pause();
      if (action === "timeline-loop") this.timeline.loopMode = nextLoopMode(this.timeline.loopMode);
      if (action === "timeline-preview-clip") {
        const target = event.target as HTMLElement;
        const assetId = target.dataset.assetId;
        const clipName = target.dataset.clipName;
        const duration = Number(target.dataset.duration ?? 0);
        if (assetId && clipName) {
          this.preview = { assetId, clipName, duration };
          this.timeline.duration = Math.max(0.01, duration);
          this.timeline.seek(0);
          this.timeline.pause();
        }
      }
      if (action) this.render();
    });
    this.element.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.action === "timeline-scrub") {
        this.timeline.setNormalizedTime(Number(input.value));
        this.timeline.pause();
        this.render();
      }
    });
  }

  render(): void {
    const selected = this.shell.selectedProjectNode();
    const animationAssets = this.shell.project.assets.filter((asset) => asset.type === "gltf");
    this.rebuildModel(selected?.name ?? "No selection", animationAssets);
    const snapshot = this.timeline.snapshot();
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Timeline</span>
        <span class="muted" data-role="timeline-state">${snapshot.playback}</span>
      </div>
      <div class="timeline-controls">
        <button data-action="timeline-play" title="Play">Play</button>
        <button data-action="timeline-pause" title="Pause">Pause</button>
        <button data-action="timeline-loop" title="Loop">${snapshot.loopMode}</button>
        <label>Time <input data-action="timeline-scrub" type="range" min="0" max="1" step="0.01" value="${snapshot.normalizedTime.toFixed(2)}"></label>
      </div>
      <div class="timeline-evidence" data-role="timeline-evidence">
        <span>${snapshot.trackCount} tracks</span>
        <span>${snapshot.clipCount} clips</span>
        <span>${snapshot.activeClipCount} active</span>
        <span>${snapshot.evidence.clipEasing ? "easing" : "linear"}</span>
        <span>${snapshot.evidence.clipBlending ? "blend" : "replace"}</span>
        <span>${snapshot.evidence.signalMarkers ? "signals" : "no signals"}</span>
      </div>
      <div class="timeline-track-list">
        <div class="timeline-track">
          <strong>Selection</strong>
          <span>${escapeHtml(selected?.name ?? "No selection")}</span>
        </div>
        ${this.preview
          ? `<div class="timeline-track" data-role="timeline-preview">
              <strong>${escapeHtml(this.preview.clipName)}</strong>
              <span>preview ${snapshot.time.toFixed(2)} / ${this.preview.duration.toFixed(2)}s</span>
            </div>`
          : ""}
        ${animationAssets.length > 0
          ? animationAssets.map((asset) => `
            <div class="timeline-track" data-asset-id="${escapeHtml(asset.id)}">
              <strong>${escapeHtml(asset.name)}</strong>
              <span>${asset.animationClips?.length ?? 0} animation clips</span>
              ${(asset.animationClips ?? []).map((clip) => `
                <button data-action="timeline-preview-clip" data-asset-id="${escapeHtml(asset.id)}" data-clip-name="${escapeHtml(clip.name)}" data-duration="${clip.duration}" title="Preview clip">${escapeHtml(clip.name)}</button>
              `).join("")}
            </div>
          `).join("")
          : `<p class="muted">Import a glTF asset to preview animation clips.</p>`}
      </div>
    `;
  }

  snapshot(): {
    readonly playback: PlaybackState;
    readonly scrubTime: number;
    readonly loop: boolean;
    readonly assetCount: number;
    readonly selectedClipName: string | null;
    readonly selectedClipDuration: number;
    readonly model: TimelineSnapshot;
  } {
    const selected = this.shell.selectedProjectNode();
    this.rebuildModel(selected?.name ?? "No selection", this.shell.project.assets.filter((asset) => asset.type === "gltf"));
    const snapshot = this.timeline.snapshot();
    return {
      playback: snapshot.playback,
      scrubTime: snapshot.normalizedTime,
      loop: snapshot.loopMode !== "none",
      assetCount: this.shell.project.assets.filter((asset) => asset.type === "gltf").length,
      selectedClipName: this.preview?.clipName ?? null,
      selectedClipDuration: this.preview?.duration ?? 0,
      model: snapshot
    };
  }

  private rebuildModel(selectedName: string, animationAssets: readonly {
    readonly id: string;
    readonly name: string;
    readonly animationClips?: readonly { readonly name: string; readonly duration: number }[];
  }[]): void {
    const time = this.timeline.currentTime;
    const wasPlaying = this.timeline.isPlaying;
    const duration = Math.max(1, this.preview?.duration ?? Math.max(...animationAssets.flatMap((asset) => (asset.animationClips ?? []).map((clip) => clip.duration)), 1));
    this.timeline.clearTracks();
    this.timeline.duration = duration;
    this.timeline.addTrack(new TimelineTrack({
      id: "selection-track",
      name: "Selection",
      type: "selection",
      locked: true,
      clips: [{
        id: "selected-node",
        name: selectedName,
        startTime: 0,
        duration,
        blendMode: "replace",
        properties: { selected: selectedName !== "No selection" }
      }]
    }));
    for (const asset of animationAssets) {
      this.timeline.addTrack(new TimelineTrack({
        id: `asset-${asset.id}`,
        name: asset.name,
        type: "animation",
        clips: (asset.animationClips ?? []).map((clip, index) => ({
          id: `${asset.id}-${index}`,
          name: clip.name,
          assetId: asset.id,
          clipName: clip.name,
          startTime: Math.min(index * 0.2, duration - 0.01),
          duration: Math.max(0.01, clip.duration),
          easeInDuration: Math.min(0.15, clip.duration / 4),
          easeOutDuration: Math.min(0.15, clip.duration / 4),
          easeIn: "ease-in-out",
          easeOut: "ease-out",
          speedMultiplier: 1,
          blendMode: index % 2 === 0 ? "mix" : "replace",
          weight: index % 2 === 0 ? 0.86 : 1
        }))
      }));
    }
    this.timeline.addTrack(new TimelineTrack({
      id: "authoring-signals",
      name: "Signals",
      type: "signal",
      locked: true,
      clips: [{
        id: "preview-start-signal",
        name: "Preview Start",
        clipName: "preview-start",
        startTime: 0,
        duration: Math.min(0.05, duration),
        properties: { event: "preview-start" }
      }]
    }));
    this.timeline.addTrack(new TimelineTrack({
      id: "muted-audio-guide",
      name: "Muted Audio Guide",
      type: "audio",
      muted: true,
      clips: [{ id: "guide-beat", name: "Guide Beat", startTime: 0, duration }]
    }));
    this.timeline.seek(Math.min(time, duration));
    if (wasPlaying) this.timeline.play();
  }
}

function nextLoopMode(value: TimelineLoopMode): TimelineLoopMode {
  if (value === "loop") return "pingpong";
  if (value === "pingpong") return "none";
  return "loop";
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

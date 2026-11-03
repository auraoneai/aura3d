import type { EditorShell } from "../EditorShell";
import { createTimelineRuntimeBridge, TimelineModel, TimelineTrack, type TimelineLoopMode, type TimelineSnapshot } from "@aura3d/editor-runtime";

type PlaybackState = "playing" | "paused";
const PREVIEW_TARGET = "editor-viewport";

export class TimelinePanel {
  readonly element = document.createElement("section");
  private readonly timeline = new TimelineModel({ id: "editor-authoring-timeline", name: "Editor Authoring Timeline", duration: 1, loopMode: "loop", frameRate: 60 });
  private readonly bridge = createTimelineRuntimeBridge({
    timeline: this.timeline,
    // The selected preview clip starts at zero at unit speed. Use the exact
    // playhead rather than the rounded snapshot, including at its last key.
    targets: [{
      id: PREVIEW_TARGET,
      applyTimelineAnimation: (application) => this.shell.applyTimelineAnimation({ ...application, assetTime: this.timeline.currentTime })
    }],
    dispatchSignals: false
  });
  private preview: { readonly assetId: string; readonly clipName: string; readonly duration: number } | null = null;
  private modelKey?: string;
  private animationFrame?: number;
  private lastFrameTime?: number;
  private disposed = false;

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel timeline-panel";
    this.element.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;
      if (action === "timeline-play") this.play();
      if (action === "timeline-pause") this.pause();
      if (action === "timeline-loop") this.changeLoopMode();
      if (action === "timeline-preview-clip") {
        const assetId = target.dataset.assetId;
        const clipName = target.dataset.clipName;
        const asset = this.shell.project.assets.find((candidate) => candidate.id === assetId && candidate.type === "gltf");
        const clip = asset?.animationClips?.find((candidate) => candidate.name === clipName);
        if (assetId && clipName && clip && Number.isFinite(clip.duration) && clip.duration >= 0) {
          this.stopPlaybackLoop();
          this.timeline.stop();
          const duration = this.shell.timelineClipDuration(assetId, clipName) ?? clip.duration;
          this.preview = { assetId, clipName, duration };
          this.render();
          this.shell.renderTimelinePreview();
        }
      }
    });
    this.element.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.action === "timeline-scrub") {
        const time = Number(input.value);
        if (!Number.isFinite(time)) return;
        this.timeline.setNormalizedTime(time);
        this.timeline.pause();
        this.stopPlaybackLoop();
        this.applyPreview();
        this.updatePlaybackDisplay();
        this.shell.renderTimelinePreview();
      }
    });
  }

  render(): void {
    if (this.disposed) return;
    const selected = this.shell.selectedProjectNode();
    const animationAssets = this.shell.project.assets.filter((asset) => asset.type === "gltf");
    this.reconcilePreview(animationAssets);
    this.rebuildModel(selected?.name ?? "No selection", animationAssets);
    if (this.timeline.isPlaying && (!this.preview || !this.shell.canPreviewTimelineAsset(this.preview.assetId))) {
      this.timeline.pause();
      this.stopPlaybackLoop();
    }
    this.applyPreview();
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
        <span data-role="timeline-active">${snapshot.activeClipCount} active</span>
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
              <span data-role="timeline-preview-time">preview ${snapshot.time.toFixed(2)} / ${this.preview.duration.toFixed(2)}s</span>
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
    const animationAssets = this.shell.project.assets.filter((asset) => asset.type === "gltf");
    this.reconcilePreview(animationAssets);
    this.rebuildModel(selected?.name ?? "No selection", animationAssets);
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

  /** Reconcile rounded/import-time metadata with the loaded runtime clip. */
  syncLoadedClipDuration(): boolean {
    if (!this.preview || this.disposed) return false;
    const duration = this.shell.timelineClipDuration(this.preview.assetId, this.preview.clipName);
    if (duration === undefined || duration === this.preview.duration) return false;
    this.preview = { ...this.preview, duration };
    this.render();
    return true;
  }

  reset(): void {
    this.stopPlaybackLoop();
    this.timeline.stop();
    this.preview = null;
    this.modelKey = undefined;
    this.shell.clearTimelinePreview();
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
  }

  private play(): void {
    if (!this.preview || !this.shell.canPreviewTimelineAsset(this.preview.assetId)) {
      this.timeline.pause();
      this.stopPlaybackLoop();
      this.shell.reportTimelinePreviewIssue("Select a placed glTF model and one of its clips to preview it.");
      this.updatePlaybackDisplay();
      return;
    }
    if (typeof requestAnimationFrame !== "function") {
      this.shell.reportTimelinePreviewIssue("Animation preview requires requestAnimationFrame.");
      return;
    }
    if (this.timeline.loopMode === "none" && this.timeline.currentTime >= this.timeline.duration) this.timeline.stop();
    this.timeline.play();
    this.applyPreview();
    this.updatePlaybackDisplay();
    this.shell.renderTimelinePreview();
    this.schedulePlaybackFrame();
  }

  private pause(): void {
    this.timeline.pause();
    this.stopPlaybackLoop();
    this.applyPreview();
    this.updatePlaybackDisplay();
    this.shell.renderTimelinePreview();
  }

  private changeLoopMode(): void {
    const time = this.timeline.currentTime;
    const playing = this.timeline.isPlaying;
    const mode = nextLoopMode(this.timeline.loopMode);
    // Reset ping-pong direction while retaining the playhead and playback state.
    this.timeline.stop();
    this.timeline.loopMode = mode;
    this.timeline.seek(time);
    if (playing) this.timeline.play();
    this.applyPreview();
    this.updatePlaybackDisplay();
    this.shell.renderTimelinePreview();
  }

  private schedulePlaybackFrame(): void {
    if (this.disposed || !this.timeline.isPlaying || this.animationFrame !== undefined || typeof requestAnimationFrame !== "function") return;
    this.animationFrame = requestAnimationFrame((timestamp) => {
      this.animationFrame = undefined;
      if (this.disposed || !this.timeline.isPlaying) return;
      if (!this.preview || !this.shell.canPreviewTimelineAsset(this.preview.assetId)) {
        this.timeline.pause();
        this.stopPlaybackLoop();
        this.shell.clearTimelinePreview();
        this.updatePlaybackDisplay();
        this.shell.renderTimelinePreview();
        return;
      }
      const delta = this.lastFrameTime === undefined || !Number.isFinite(timestamp)
        ? 0
        : Math.max(0, (timestamp - this.lastFrameTime) / 1000);
      this.lastFrameTime = Number.isFinite(timestamp) ? timestamp : undefined;
      try {
        this.bridge.step(delta);
        this.shell.renderTimelinePreview();
        if (this.syncLoadedClipDuration()) this.shell.renderTimelinePreview();
        this.updatePlaybackDisplay();
        if (this.timeline.isPlaying) this.schedulePlaybackFrame();
        else this.lastFrameTime = undefined;
      } catch (error) {
        this.timeline.pause();
        this.stopPlaybackLoop();
        this.updatePlaybackDisplay();
        this.shell.reportTimelinePreviewIssue(error instanceof Error ? error.message : "Animation preview failed.");
      }
    });
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.lastFrameTime = undefined;
  }

  private applyPreview(): void {
    if (!this.preview || !this.shell.canPreviewTimelineAsset(this.preview.assetId)) {
      this.shell.clearTimelinePreview();
      return;
    }
    this.bridge.applyCurrent();
  }

  private updatePlaybackDisplay(): void {
    const snapshot = this.timeline.snapshot();
    const state = this.element.querySelector<HTMLElement>('[data-role="timeline-state"]');
    const loop = this.element.querySelector<HTMLButtonElement>('[data-action="timeline-loop"]');
    const scrub = this.element.querySelector<HTMLInputElement>('[data-action="timeline-scrub"]');
    const active = this.element.querySelector<HTMLElement>('[data-role="timeline-active"]');
    const preview = this.element.querySelector<HTMLElement>('[data-role="timeline-preview-time"]');
    if (state) state.textContent = snapshot.playback;
    if (loop) loop.textContent = snapshot.loopMode;
    if (scrub) scrub.value = snapshot.normalizedTime.toFixed(2);
    if (active) active.textContent = `${snapshot.activeClipCount} active`;
    if (preview && this.preview) preview.textContent = `preview ${snapshot.time.toFixed(2)} / ${this.preview.duration.toFixed(2)}s`;
  }

  private reconcilePreview(animationAssets: readonly {
    readonly id: string;
    readonly animationClips?: readonly { readonly name: string; readonly duration: number }[];
  }[]): void {
    if (!this.preview) return;
    const clip = animationAssets.find((asset) => asset.id === this.preview?.assetId)?.animationClips?.find((candidate) => candidate.name === this.preview?.clipName);
    if (!clip || !Number.isFinite(clip.duration) || clip.duration < 0) {
      this.reset();
      return;
    }
    const duration = this.shell.timelineClipDuration(this.preview.assetId, this.preview.clipName) ?? clip.duration;
    if (duration !== this.preview.duration) this.preview = { ...this.preview, duration };
  }

  private rebuildModel(selectedName: string, animationAssets: readonly {
    readonly id: string;
    readonly name: string;
    readonly animationClips?: readonly { readonly name: string; readonly duration: number }[];
  }[]): void {
    const key = JSON.stringify([selectedName, this.preview, animationAssets.map((asset) => [asset.id, asset.name, asset.animationClips])]);
    if (key === this.modelKey) return;
    this.modelKey = key;
    const time = this.timeline.currentTime;
    const wasPlaying = this.timeline.isPlaying;
    const longestClip = animationAssets.reduce((longest, asset) => (asset.animationClips ?? []).reduce(
      (value, clip) => Number.isFinite(clip.duration) ? Math.max(value, clip.duration) : value, longest
    ), 1);
    const duration = this.preview ? Math.max(0.01, this.preview.duration) : longestClip;
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
      const track = new TimelineTrack({
        id: `asset-${asset.id}`,
        name: asset.name,
        type: "animation",
        clips: (asset.animationClips ?? []).map((clip, index) => {
          const selected = this.preview?.assetId === asset.id && this.preview.clipName === clip.name;
          const clipDuration = Number.isFinite(clip.duration) ? Math.max(0.01, clip.duration) : 0.01;
          return {
            id: `${asset.id}-${index}`,
            name: clip.name,
            assetId: asset.id,
            clipName: clip.name,
            startTime: selected ? 0 : Math.min(index * 0.2, duration - 0.01),
            // Timeline clips are end-exclusive; include the final scrubbed pose.
            duration: selected ? duration + Math.max(0.0001, duration * 1e-7) : clipDuration,
            easeInDuration: selected ? 0 : Math.min(0.15, clipDuration / 4),
            easeOutDuration: selected ? 0 : Math.min(0.15, clipDuration / 4),
            easeIn: selected ? "linear" : "ease-in-out",
            easeOut: selected ? "linear" : "ease-out",
            speedMultiplier: 1,
            blendMode: selected ? "replace" : index % 2 === 0 ? "mix" : "replace",
            weight: selected ? 1 : index % 2 === 0 ? 0.86 : 1,
            ...(selected ? { properties: { targetId: PREVIEW_TARGET } } : {})
          };
        })
      });
      if (this.preview) {
        for (const clip of track.clips) {
          clip.enabled = clip.assetId === this.preview.assetId && clip.clipName === this.preview.clipName;
        }
      }
      this.timeline.addTrack(track);
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
    else this.timeline.pause();
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

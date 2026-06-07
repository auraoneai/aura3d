import { TimelineEditorController, type TimelineEditorSnapshot } from "./TimelineEditorController";

export interface TimelineUIOptions {
  readonly document?: Document;
  readonly className?: string;
  readonly onRender?: (snapshot: TimelineEditorSnapshot) => void;
}

export interface TimelineUIRenderResult {
  readonly root: HTMLElement;
  readonly snapshot: TimelineEditorSnapshot;
  dispose(): void;
  render(): TimelineUIRenderResult;
}

export class TimelineUI {
  private readonly documentRef: Document;
  private readonly listeners: (() => void)[] = [];

  constructor(
    private readonly controller: TimelineEditorController,
    private readonly container: HTMLElement,
    private readonly options: TimelineUIOptions = {}
  ) {
    this.documentRef = options.document ?? container.ownerDocument;
  }

  render(): TimelineUIRenderResult {
    this.dispose();
    const snapshot = this.controller.snapshot();
    this.container.replaceChildren();
    this.container.className = this.options.className ?? "aura-timeline";
    this.container.tabIndex = this.container.tabIndex >= 0 ? this.container.tabIndex : 0;

    const toolbar = this.el("div", "aura-timeline__toolbar");
    toolbar.append(
      this.button("Play", () => {
        this.controller.togglePlayback();
        this.render();
      }),
      this.button("Start", () => {
        this.controller.scrubTo(0);
        this.render();
      }),
      this.button("End", () => {
        this.controller.scrubTo(this.controller.timeline.duration);
        this.render();
      })
    );

    const ruler = this.el("div", "aura-timeline__ruler");
    const durationPixels = Math.max(1, this.controller.timeline.duration * snapshot.zoomPixelsPerSecond);
    ruler.style.width = `${durationPixels}px`;
    ruler.append(this.marker("playhead", this.controller.timeline.currentTime));
    for (let second = 0; second <= Math.ceil(this.controller.timeline.duration); second += 1) {
      const tick = this.marker("tick", second);
      tick.textContent = `${second}s`;
      ruler.append(tick);
    }

    const tracks = this.el("div", "aura-timeline__tracks");
    for (const track of this.controller.timeline.tracks) {
      const trackSnapshot = snapshot.tracks.find((candidate) => candidate.id === track.id);
      const lane = this.el("div", "aura-timeline__track");
      lane.dataset.trackId = track.id;
      lane.style.minHeight = `${trackSnapshot?.laneHeight ?? 32}px`;
      const label = this.el("div", "aura-timeline__track-label");
      label.textContent = track.name;
      const clips = this.el("div", "aura-timeline__clips");
      clips.style.width = `${durationPixels}px`;
      for (const clip of track.clips) {
        const clipEl = this.el("button", "aura-timeline__clip") as HTMLButtonElement;
        clipEl.type = "button";
        clipEl.dataset.clipId = clip.id;
        clipEl.textContent = clip.name;
        clipEl.style.left = `${clip.startTime * snapshot.zoomPixelsPerSecond}px`;
        clipEl.style.width = `${Math.max(8, clip.duration * snapshot.zoomPixelsPerSecond)}px`;
        clipEl.style.background = trackSnapshot?.color ?? "#334155";
        if (snapshot.selectedIds.includes(clip.id)) clipEl.dataset.selected = "true";
        const click = (event: MouseEvent): void => {
          this.controller.selectClip(clip.id, event.shiftKey);
          this.render();
        };
        clipEl.addEventListener("click", click);
        this.listeners.push(() => clipEl.removeEventListener("click", click));
        clips.append(clipEl);
      }
      lane.append(label, clips);
      tracks.append(lane);
    }

    const minimap = this.el("div", "aura-timeline__minimap");
    minimap.style.setProperty("--aura-timeline-duration-px", `${durationPixels}px`);
    minimap.textContent = `${snapshot.timeline.clipCount} clips`;

    const keydown = (event: KeyboardEvent): void => {
      if (this.controller.handleKeyboardShortcut(event.key)) {
        event.preventDefault();
        this.render();
      }
    };
    this.container.addEventListener("keydown", keydown);
    this.listeners.push(() => this.container.removeEventListener("keydown", keydown));

    this.container.append(toolbar, ruler, tracks, minimap);
    this.options.onRender?.(snapshot);
    return {
      root: this.container,
      snapshot,
      dispose: () => this.dispose(),
      render: () => this.render()
    };
  }

  dispose(): void {
    for (const dispose of this.listeners.splice(0)) dispose();
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = this.el("button", "aura-timeline__button") as HTMLButtonElement;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    this.listeners.push(() => button.removeEventListener("click", onClick));
    return button;
  }

  private marker(kind: string, time: number): HTMLElement {
    const marker = this.el("div", `aura-timeline__${kind}`);
    marker.style.left = `${time * this.controller.zoomPixelsPerSecond}px`;
    marker.dataset.time = String(time);
    return marker;
  }

  private el(tagName: string, className: string): HTMLElement {
    const element = this.documentRef.createElement(tagName);
    element.className = className;
    return element;
  }
}

export function renderTimelineUI(
  controller: TimelineEditorController,
  container: HTMLElement,
  options: TimelineUIOptions = {}
): TimelineUIRenderResult {
  return new TimelineUI(controller, container, options).render();
}

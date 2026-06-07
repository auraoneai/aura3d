import type { Command } from "./Command";
import { CommandHistory } from "./CommandHistory";
import { Selection, type SelectionId } from "./Selection";
import { TimelineClip, TimelineModel, TimelineTrack, type TimelineClipConfig, type TimelineModelConfig, type TimelineTrackConfig } from "./TimelineModel";
import { createTimelineTrackConfig, timelineTrackKindFromConfig, timelineTrackTypeDefinition, type TimelineEditorTrackKind } from "./TimelineTrackTypes";

export interface TimelineEditorControllerOptions {
  readonly timeline?: TimelineModel;
  readonly history?: CommandHistory;
  readonly selection?: Selection;
  readonly zoomPixelsPerSecond?: number;
  readonly snapEnabled?: boolean;
  readonly snapInterval?: number;
  readonly onPreviewTime?: (time: number, snapshot: TimelineEditorSnapshot) => void;
  readonly routeBinding?: TimelineRoutePlaybackBinding;
}

export interface TimelineRoutePlaybackBinding {
  play?(): void;
  pause?(): void;
  scrub(time: number, snapshot: TimelineEditorSnapshot): void;
  jumpToShot?(shotId: string, time: number, snapshot: TimelineEditorSnapshot): void;
}

export interface TimelineEditorClipboard {
  readonly clips: readonly TimelineClipConfig[];
}

export interface TimelineEditorSnapshot {
  readonly timeline: ReturnType<TimelineModel["snapshot"]>;
  readonly zoomPixelsPerSecond: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly snapEnabled: boolean;
  readonly snapInterval: number;
  readonly selectedIds: readonly SelectionId[];
  readonly clipboardClipCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly tracks: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: TimelineEditorTrackKind;
    readonly laneHeight: number;
    readonly color: string;
    readonly clipIds: readonly string[];
  }[];
  readonly evidence: {
    readonly clipEditing: boolean;
    readonly keyframeReadyTracks: boolean;
    readonly timelineScrubbing: true;
    readonly undoRedo: boolean;
    readonly serialization: true;
  };
}

export class TimelineEditorController {
  readonly timeline: TimelineModel;
  readonly history: CommandHistory;
  readonly selection: Selection;
  private zoomPixelsPerSecondInternal: number;
  private scrollXInternal = 0;
  private scrollYInternal = 0;
  private snapEnabledInternal: boolean;
  private snapIntervalInternal: number;
  private clipboardInternal: TimelineEditorClipboard = { clips: [] };
  private readonly preview?: (time: number, snapshot: TimelineEditorSnapshot) => void;
  private routeBinding?: TimelineRoutePlaybackBinding;

  constructor(options: TimelineEditorControllerOptions = {}) {
    this.timeline = options.timeline ?? new TimelineModel({ duration: 10, frameRate: 30, loopMode: "none" });
    this.history = options.history ?? new CommandHistory();
    this.selection = options.selection ?? new Selection();
    this.zoomPixelsPerSecondInternal = positive(options.zoomPixelsPerSecond ?? 96, "Timeline zoomPixelsPerSecond");
    this.snapEnabledInternal = options.snapEnabled ?? true;
    this.snapIntervalInternal = positive(options.snapInterval ?? (this.timeline.frameRate > 0 ? 1 / this.timeline.frameRate : 1 / 30), "Timeline snapInterval");
    this.preview = options.onPreviewTime;
    this.routeBinding = options.routeBinding;
  }

  get zoomPixelsPerSecond(): number {
    return this.zoomPixelsPerSecondInternal;
  }

  get snapEnabled(): boolean {
    return this.snapEnabledInternal;
  }

  get snapInterval(): number {
    return this.snapIntervalInternal;
  }

  get scrollX(): number {
    return this.scrollXInternal;
  }

  get scrollY(): number {
    return this.scrollYInternal;
  }

  async addTrack(kind: TimelineEditorTrackKind, name?: string, options: Omit<TimelineTrackConfig, "name" | "type"> = {}): Promise<TimelineTrack> {
    const track = new TimelineTrack(createTimelineTrackConfig(kind, name, options));
    await this.history.execute(new AddTrackCommand(this.timeline, track));
    return track;
  }

  async addClip(trackId: string, config: TimelineClipConfig): Promise<TimelineClip> {
    const track = this.requireTrack(trackId);
    const clip = new TimelineClip({ ...config, startTime: this.snapTime(config.startTime) });
    await this.history.execute(new AddClipCommand(track, clip));
    return clip;
  }

  async deleteClip(clipId: string): Promise<void> {
    const match = this.requireClip(clipId);
    await this.history.execute(new RemoveClipCommand(match.track, match.clip));
    this.selection.remove(clipId);
  }

  async moveClip(clipId: string, startTime: number): Promise<TimelineClip> {
    const { clip } = this.requireClip(clipId);
    await this.history.execute(new MoveClipCommand(clip, this.snapTime(startTime)));
    return clip;
  }

  async resizeClip(clipId: string, duration: number, startTime?: number): Promise<TimelineClip> {
    const { clip } = this.requireClip(clipId);
    await this.history.execute(new ResizeClipCommand(clip, positive(duration, "Timeline clip duration"), startTime === undefined ? undefined : this.snapTime(startTime)));
    return clip;
  }

  async splitClip(clipId: string, splitTime: number): Promise<readonly TimelineClip[]> {
    const { track, clip } = this.requireClip(clipId);
    const snapped = this.snapTime(splitTime);
    if (snapped <= clip.startTime || snapped >= clip.endTime) {
      throw new RangeError("Timeline split time must be inside the clip range.");
    }
    const left = new TimelineClip({ ...clip.toConfig(), id: `${clip.id}-a`, duration: snapped - clip.startTime });
    const right = new TimelineClip({
      ...clip.toConfig(),
      id: `${clip.id}-b`,
      startTime: snapped,
      duration: clip.endTime - snapped,
      clipInOffset: clip.clipInOffset + (snapped - clip.startTime) * clip.speedMultiplier
    });
    await this.history.execute(new ReplaceClipsCommand(track, [clip], [left, right], `Split clip ${clip.id}`));
    this.selection.set([left.id, right.id]);
    return [left, right];
  }

  async duplicateClip(clipId: string, timeOffset?: number): Promise<TimelineClip> {
    const { track, clip } = this.requireClip(clipId);
    const offset = timeOffset ?? clip.duration;
    const duplicate = new TimelineClip({
      ...clip.toConfig(),
      id: `${clip.id}-copy-${track.clips.length + 1}`,
      name: `${clip.name} Copy`,
      startTime: this.snapTime(clip.startTime + offset)
    });
    await this.history.execute(new AddClipCommand(track, duplicate));
    this.selection.set([duplicate.id]);
    return duplicate;
  }

  copySelection(): TimelineEditorClipboard {
    const selected = new Set(this.selection.current());
    const clips = this.timeline.tracks.flatMap((track) => track.clips.filter((clip) => selected.has(clip.id)).map((clip) => clip.toConfig()));
    this.clipboardInternal = { clips };
    return this.clipboardInternal;
  }

  async pasteClips(trackId: string, startTime: number): Promise<readonly TimelineClip[]> {
    const track = this.requireTrack(trackId);
    if (this.clipboardInternal.clips.length === 0) return [];
    const earliest = Math.min(...this.clipboardInternal.clips.map((clip) => clip.startTime));
    const pasted = this.clipboardInternal.clips.map((clip, index) => new TimelineClip({
      ...clip,
      id: `${clip.id}-paste-${index + 1}`,
      startTime: this.snapTime(startTime + (clip.startTime - earliest))
    }));
    await this.history.execute(new ReplaceClipsCommand(track, [], pasted, `Paste ${pasted.length} clips`));
    this.selection.set(pasted.map((clip) => clip.id));
    return pasted;
  }

  select(ids: readonly SelectionId[]): void {
    this.selection.set(ids);
  }

  selectClip(clipId: string, additive = false): void {
    this.requireClip(clipId);
    if (additive) this.selection.add(clipId);
    else this.selection.set([clipId]);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  setZoom(pixelsPerSecond: number): void {
    this.zoomPixelsPerSecondInternal = positive(pixelsPerSecond, "Timeline zoomPixelsPerSecond");
  }

  zoomBy(multiplier: number): number {
    this.setZoom(clamp(this.zoomPixelsPerSecondInternal * positive(multiplier, "Timeline zoom multiplier"), 12, 800));
    return this.zoomPixelsPerSecondInternal;
  }

  scrollTo(x: number, y = this.scrollYInternal): void {
    this.scrollXInternal = Math.max(0, finite(x, "Timeline scrollX"));
    this.scrollYInternal = Math.max(0, finite(y, "Timeline scrollY"));
  }

  configureSnap(options: { readonly enabled?: boolean; readonly interval?: number }): void {
    if (options.enabled !== undefined) this.snapEnabledInternal = options.enabled;
    if (options.interval !== undefined) this.snapIntervalInternal = positive(options.interval, "Timeline snapInterval");
  }

  scrubTo(time: number): void {
    this.timeline.seek(this.snapTime(time));
    const snapshot = this.snapshot();
    this.preview?.(this.timeline.currentTime, snapshot);
    this.routeBinding?.scrub(this.timeline.currentTime, snapshot);
  }

  stepFrames(frames: number): void {
    if (!Number.isInteger(frames)) throw new RangeError("Timeline stepFrames expects an integer frame count.");
    const frameDuration = this.timeline.frameRate > 0 ? 1 / this.timeline.frameRate : this.snapIntervalInternal;
    this.timeline.seek(Math.max(0, this.timeline.currentTime + frames * frameDuration));
    this.preview?.(this.timeline.currentTime, this.snapshot());
  }

  togglePlayback(): void {
    if (this.timeline.isPlaying) {
      this.timeline.pause();
      this.routeBinding?.pause?.();
    } else {
      this.timeline.play();
      this.routeBinding?.play?.();
    }
  }

  bindRoutePlayback(binding: TimelineRoutePlaybackBinding | undefined): void {
    this.routeBinding = binding;
  }

  jumpToShot(shotId: string): number {
    const target = this.timeline.tracks
      .filter((track) => timelineTrackKindFromConfig(track.toConfig()) === "shot")
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === shotId || clip.properties.shotId === shotId || clip.name === shotId);
    if (!target) throw new Error(`Timeline shot does not exist: ${shotId}`);
    this.timeline.seek(target.startTime);
    const snapshot = this.snapshot();
    this.preview?.(this.timeline.currentTime, snapshot);
    this.routeBinding?.scrub(this.timeline.currentTime, snapshot);
    this.routeBinding?.jumpToShot?.(shotId, this.timeline.currentTime, snapshot);
    return this.timeline.currentTime;
  }

  handleKeyboardShortcut(key: string): boolean {
    if (key === " " || key === "Space") {
      this.togglePlayback();
      return true;
    }
    if (key === "ArrowLeft") {
      this.stepFrames(-1);
      return true;
    }
    if (key === "ArrowRight") {
      this.stepFrames(1);
      return true;
    }
    if (key === "Home") {
      this.scrubTo(0);
      return true;
    }
    if (key === "End") {
      this.scrubTo(this.timeline.duration);
      return true;
    }
    return false;
  }

  async undo(): Promise<void> {
    await this.history.undo();
  }

  async redo(): Promise<void> {
    await this.history.redo();
  }

  serializeTimeline(): TimelineModelConfig {
    return this.timeline.toConfig();
  }

  snapshot(): TimelineEditorSnapshot {
    return {
      timeline: this.timeline.snapshot(),
      zoomPixelsPerSecond: this.zoomPixelsPerSecondInternal,
      scrollX: this.scrollXInternal,
      scrollY: this.scrollYInternal,
      snapEnabled: this.snapEnabledInternal,
      snapInterval: this.snapIntervalInternal,
      selectedIds: this.selection.current(),
      clipboardClipCount: this.clipboardInternal.clips.length,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      tracks: this.timeline.tracks.map((track) => {
        const kind = timelineTrackKindFromConfig(track.toConfig());
        const definition = timelineTrackTypeDefinition(kind);
        return {
          id: track.id,
          name: track.name,
          kind,
          laneHeight: definition.laneHeight,
          color: definition.color,
          clipIds: track.clips.map((clip) => clip.id)
        };
      }),
      evidence: {
        clipEditing: this.timeline.tracks.some((track) => track.clips.length > 0),
        keyframeReadyTracks: this.timeline.tracks.some((track) => {
          const kind = timelineTrackKindFromConfig(track.toConfig());
          return timelineTrackTypeDefinition(kind).acceptsKeyframes;
        }),
        timelineScrubbing: true,
        undoRedo: this.history.canUndo || this.history.canRedo,
        serialization: true
      }
    };
  }

  private snapTime(time: number): number {
    const value = finite(time, "Timeline time");
    if (!this.snapEnabledInternal) return Math.max(0, value);
    return Math.max(0, Number((Math.round(value / this.snapIntervalInternal) * this.snapIntervalInternal).toFixed(4)));
  }

  private requireTrack(trackId: string): TimelineTrack {
    const track = this.timeline.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(`Timeline track does not exist: ${trackId}`);
    return track;
  }

  private requireClip(clipId: string): { readonly track: TimelineTrack; readonly clip: TimelineClip } {
    for (const track of this.timeline.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) return { track, clip };
    }
    throw new Error(`Timeline clip does not exist: ${clipId}`);
  }
}

class AddTrackCommand implements Command {
  readonly name: string;

  constructor(private readonly timeline: TimelineModel, private readonly track: TimelineTrack) {
    this.name = `Add track ${track.id}`;
  }

  execute(): void {
    if (!this.timeline.tracks.includes(this.track)) {
      this.timeline.addTrack(this.track);
    }
  }

  undo(): void {
    removeItem(this.timeline.tracks as TimelineTrack[], this.track);
  }
}

class AddClipCommand implements Command {
  readonly name: string;

  constructor(private readonly track: TimelineTrack, private readonly clip: TimelineClip) {
    this.name = `Add clip ${clip.id}`;
  }

  execute(): void {
    if (!this.track.clips.includes(this.clip)) {
      this.track.addClip(this.clip);
    }
  }

  undo(): void {
    removeItem(this.track.clips as TimelineClip[], this.clip);
  }
}

class RemoveClipCommand implements Command {
  readonly name: string;

  constructor(private readonly track: TimelineTrack, private readonly clip: TimelineClip) {
    this.name = `Delete clip ${clip.id}`;
  }

  execute(): void {
    removeItem(this.track.clips as TimelineClip[], this.clip);
  }

  undo(): void {
    if (!this.track.clips.includes(this.clip)) {
      this.track.addClip(this.clip, { ignoreLock: true });
    }
  }
}

class MoveClipCommand implements Command {
  readonly name: string;
  private readonly before: number;

  constructor(protected readonly clip: TimelineClip, protected readonly after: number) {
    this.name = `Move clip ${clip.id}`;
    this.before = clip.startTime;
  }

  execute(): void {
    this.clip.startTime = this.after;
  }

  undo(): void {
    this.clip.startTime = this.before;
  }

  canMerge(next: Command): boolean {
    return next instanceof MoveClipCommand && next.targetClip() === this.clip;
  }

  merge(next: Command): Command {
    if (!(next instanceof MoveClipCommand) || next.targetClip() !== this.clip) {
      throw new Error("MoveClipCommand can only merge commands for the same clip.");
    }
    return new MoveClipCommandWithBefore(this.clip, this.before, next.targetStartTime());
  }

  targetClip(): TimelineClip {
    return this.clip;
  }

  targetStartTime(): number {
    return this.after;
  }
}

class MoveClipCommandWithBefore extends MoveClipCommand {
  constructor(clip: TimelineClip, private readonly originalStartTime: number, after: number) {
    super(clip, after);
  }

  override undo(): void {
    this.clip.startTime = this.originalStartTime;
  }
}

class ResizeClipCommand implements Command {
  readonly name: string;
  private readonly beforeStart: number;
  private readonly beforeDuration: number;

  constructor(private readonly clip: TimelineClip, private readonly afterDuration: number, private readonly afterStart?: number) {
    this.name = `Resize clip ${clip.id}`;
    this.beforeStart = clip.startTime;
    this.beforeDuration = clip.duration;
  }

  execute(): void {
    if (this.afterStart !== undefined) this.clip.startTime = this.afterStart;
    this.clip.duration = this.afterDuration;
  }

  undo(): void {
    this.clip.startTime = this.beforeStart;
    this.clip.duration = this.beforeDuration;
  }
}

class ReplaceClipsCommand implements Command {
  readonly name: string;

  constructor(
    private readonly track: TimelineTrack,
    private readonly remove: readonly TimelineClip[],
    private readonly add: readonly TimelineClip[],
    name: string
  ) {
    this.name = name;
  }

  execute(): void {
    const clips = this.track.clips as TimelineClip[];
    for (const clip of this.remove) removeItem(clips, clip);
    for (const clip of this.add) {
      if (!clips.includes(clip)) this.track.addClip(clip, { ignoreLock: true });
    }
  }

  undo(): void {
    const clips = this.track.clips as TimelineClip[];
    for (const clip of this.add) removeItem(clips, clip);
    for (const clip of this.remove) {
      if (!clips.includes(clip)) this.track.addClip(clip, { ignoreLock: true });
    }
  }
}

function removeItem<T>(items: T[], item: T): void {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

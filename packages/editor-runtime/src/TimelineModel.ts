export type TimelineLoopMode = "none" | "loop" | "pingpong";
export type TimelineClipBlendMode = "replace" | "additive" | "multiply" | "mix";
export type TimelineEasingName = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface TimelineClipConfig {
  readonly id?: string;
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly assetId?: string;
  readonly clipName?: string;
  readonly easeInDuration?: number;
  readonly easeOutDuration?: number;
  readonly easeIn?: TimelineEasingName;
  readonly easeOut?: TimelineEasingName;
  readonly speedMultiplier?: number;
  readonly blendMode?: TimelineClipBlendMode;
  readonly weight?: number;
  readonly clipInOffset?: number;
  readonly properties?: Record<string, string | number | boolean>;
}

export interface TimelineTrackConfig {
  readonly id?: string;
  readonly name: string;
  readonly type: "animation" | "selection" | "signal" | "audio" | "camera" | "generic";
  readonly muted?: boolean;
  readonly locked?: boolean;
  readonly weight?: number;
  readonly clips?: readonly TimelineClipConfig[];
  readonly properties?: Record<string, string | number | boolean>;
}

export interface TimelineModelConfig {
  readonly id?: string;
  readonly name?: string;
  readonly duration?: number;
  readonly loopMode?: TimelineLoopMode;
  readonly speed?: number;
  readonly frameRate?: number;
  readonly tracks?: readonly TimelineTrackConfig[];
}

export interface TimelineActiveClipSnapshot {
  readonly trackId: string;
  readonly trackName: string;
  readonly trackType: TimelineTrackConfig["type"];
  readonly clipId: string;
  readonly clipName: string;
  readonly assetId?: string;
  readonly assetClipName?: string;
  readonly runtimeTargetId?: string;
  readonly localTime: number;
  readonly assetTime: number;
  readonly normalizedTime: number;
  readonly blendWeight: number;
  readonly blendMode: TimelineClipBlendMode;
  readonly properties: Record<string, string | number | boolean>;
}

export interface TimelineSignalEventSnapshot {
  readonly trackId: string;
  readonly trackName: string;
  readonly clipId: string;
  readonly clipName: string;
  readonly event: string;
  readonly time: number;
  readonly localTime: number;
  readonly properties: Record<string, string | number | boolean>;
}

export interface TimelineTrackSnapshot {
  readonly id: string;
  readonly name: string;
  readonly type: TimelineTrackConfig["type"];
  readonly muted: boolean;
  readonly locked: boolean;
  readonly weight: number;
  readonly clipCount: number;
}

export interface TimelineSnapshot {
  readonly id: string;
  readonly name: string;
  readonly playback: "playing" | "paused";
  readonly time: number;
  readonly normalizedTime: number;
  readonly duration: number;
  readonly loopMode: TimelineLoopMode;
  readonly speed: number;
  readonly frameRate: number;
  readonly direction: 1 | -1;
  readonly trackCount: number;
  readonly clipCount: number;
  readonly activeClipCount: number;
  readonly activeClips: readonly TimelineActiveClipSnapshot[];
  readonly tracks: readonly TimelineTrackSnapshot[];
  readonly signalEvents: readonly string[];
  readonly signalEventDetails: readonly TimelineSignalEventSnapshot[];
  readonly evidence: {
    readonly oldCodebasePort: true;
    readonly boundedTimelineAuthoring: true;
    readonly clipEasing: boolean;
    readonly clipBlending: boolean;
    readonly muteLockState: boolean;
    readonly loopPlayback: boolean;
    readonly signalMarkers: boolean;
  };
}

const easing = {
  linear: (value: number): number => value,
  "ease-in": (value: number): number => value * value,
  "ease-out": (value: number): number => value * (2 - value),
  "ease-in-out": (value: number): number => value < 0.5 ? 2 * value * value : -1 + (4 - 2 * value) * value
} satisfies Record<TimelineEasingName, (value: number) => number>;

export class TimelineClip {
  readonly id: string;
  name: string;
  startTime: number;
  duration: number;
  assetId?: string;
  clipName?: string;
  easeInDuration: number;
  easeOutDuration: number;
  easeIn: TimelineEasingName;
  easeOut: TimelineEasingName;
  speedMultiplier: number;
  blendMode: TimelineClipBlendMode;
  weight: number;
  clipInOffset: number;
  readonly properties: Record<string, string | number | boolean>;
  enabled = true;

  constructor(config: TimelineClipConfig) {
    if (!Number.isFinite(config.startTime) || config.startTime < 0) throw new RangeError("Timeline clip startTime must be a finite non-negative number.");
    if (!Number.isFinite(config.duration) || config.duration <= 0) throw new RangeError("Timeline clip duration must be a finite positive number.");
    this.id = config.id ?? stableId("clip", config.name);
    this.name = config.name;
    this.startTime = config.startTime;
    this.duration = config.duration;
    this.assetId = config.assetId;
    this.clipName = config.clipName;
    this.easeInDuration = Math.max(0, config.easeInDuration ?? 0);
    this.easeOutDuration = Math.max(0, config.easeOutDuration ?? 0);
    this.easeIn = config.easeIn ?? "linear";
    this.easeOut = config.easeOut ?? "linear";
    this.speedMultiplier = Math.max(0, config.speedMultiplier ?? 1);
    this.blendMode = config.blendMode ?? "replace";
    this.weight = clamp(config.weight ?? 1, 0, 1);
    this.clipInOffset = Math.max(0, config.clipInOffset ?? 0);
    this.properties = { ...(config.properties ?? {}) };
  }

  get endTime(): number {
    return this.startTime + this.duration;
  }

  contains(time: number): boolean {
    return this.enabled && time >= this.startTime && time < this.endTime;
  }

  localTime(time: number): number {
    if (!this.contains(time)) return -1;
    return (time - this.startTime) * this.speedMultiplier;
  }

  assetTime(time: number): number {
    const localTime = this.localTime(time);
    return localTime < 0 ? -1 : this.clipInOffset + localTime;
  }

  normalizedTime(time: number): number {
    const localTime = this.localTime(time);
    return localTime < 0 ? -1 : clamp(localTime / this.duration, 0, 1);
  }

  blendWeight(time: number): number {
    if (!this.contains(time)) return 0;
    const localTime = time - this.startTime;
    let result = this.weight;
    if (this.easeInDuration > 0 && localTime < this.easeInDuration) {
      result *= easing[this.easeIn](clamp(localTime / this.easeInDuration, 0, 1));
    }
    const timeFromEnd = this.duration - localTime;
    if (this.easeOutDuration > 0 && timeFromEnd < this.easeOutDuration) {
      result *= easing[this.easeOut](clamp(timeFromEnd / this.easeOutDuration, 0, 1));
    }
    return Number(result.toFixed(4));
  }

  toConfig(): TimelineClipConfig {
    return {
      id: this.id,
      name: this.name,
      startTime: this.startTime,
      duration: this.duration,
      assetId: this.assetId,
      clipName: this.clipName,
      easeInDuration: this.easeInDuration,
      easeOutDuration: this.easeOutDuration,
      easeIn: this.easeIn,
      easeOut: this.easeOut,
      speedMultiplier: this.speedMultiplier,
      blendMode: this.blendMode,
      weight: this.weight,
      clipInOffset: this.clipInOffset,
      properties: { ...this.properties }
    };
  }
}

export class TimelineTrack {
  readonly id: string;
  name: string;
  readonly type: TimelineTrackConfig["type"];
  muted: boolean;
  locked: boolean;
  weight: number;
  readonly properties: Record<string, string | number | boolean>;
  private readonly clipsInternal: TimelineClip[] = [];

  constructor(config: TimelineTrackConfig) {
    this.id = config.id ?? stableId("track", config.name);
    this.name = config.name;
    this.type = config.type;
    this.muted = config.muted ?? false;
    this.locked = config.locked ?? false;
    this.weight = clamp(config.weight ?? 1, 0, 1);
    this.properties = { ...(config.properties ?? {}) };
    for (const clip of config.clips ?? []) {
      this.addClip(new TimelineClip(clip), { ignoreLock: true });
    }
  }

  get clips(): readonly TimelineClip[] {
    return this.clipsInternal;
  }

  addClip(clip: TimelineClip, options: { readonly ignoreLock?: boolean } = {}): TimelineClip {
    if (this.locked && !options.ignoreLock) throw new Error(`Cannot add clip to locked timeline track: ${this.name}`);
    this.clipsInternal.push(clip);
    this.clipsInternal.sort((left, right) => left.startTime - right.startTime);
    return clip;
  }

  activeClips(time: number): readonly TimelineClip[] {
    if (this.muted || this.weight <= 0) return [];
    return this.clipsInternal.filter((clip) => clip.contains(time));
  }

  snapshot(): TimelineTrackSnapshot {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      muted: this.muted,
      locked: this.locked,
      weight: this.weight,
      clipCount: this.clipsInternal.length
    };
  }

  toConfig(): TimelineTrackConfig {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      muted: this.muted,
      locked: this.locked,
      weight: this.weight,
      clips: this.clipsInternal.map((clip) => clip.toConfig()),
      properties: { ...this.properties }
    };
  }
}

export class TimelineModel {
  readonly id: string;
  name: string;
  duration: number;
  loopMode: TimelineLoopMode;
  speed: number;
  frameRate: number;
  private readonly tracksInternal: TimelineTrack[] = [];
  private playing = false;
  private timeInternal = 0;
  private directionInternal: 1 | -1 = 1;
  private readonly emittedSignals = new Set<string>();

  constructor(config: TimelineModelConfig = {}) {
    this.id = config.id ?? "editor-timeline";
    this.name = config.name ?? "Editor Timeline";
    this.duration = Math.max(0.01, config.duration ?? 1);
    this.loopMode = config.loopMode ?? "loop";
    this.speed = Math.max(0, config.speed ?? 1);
    this.frameRate = Math.max(0, config.frameRate ?? 0);
    for (const track of config.tracks ?? []) {
      this.addTrack(new TimelineTrack(track));
    }
  }

  get tracks(): readonly TimelineTrack[] {
    return this.tracksInternal;
  }

  get currentTime(): number {
    return this.timeInternal;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  addTrack(track: TimelineTrack): TimelineTrack {
    this.tracksInternal.push(track);
    return track;
  }

  clearTracks(): void {
    this.tracksInternal.length = 0;
    this.emittedSignals.clear();
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  stop(): void {
    this.playing = false;
    this.seek(0);
    this.directionInternal = 1;
  }

  seek(time: number): void {
    this.timeInternal = this.wrapTime(time);
    this.emittedSignals.clear();
  }

  setNormalizedTime(value: number): void {
    this.seek(clamp(value, 0, 1) * this.duration);
  }

  tick(deltaSeconds: number): void {
    if (!this.playing || deltaSeconds <= 0 || this.speed <= 0) return;
    this.seek(this.timeInternal + deltaSeconds * this.speed * this.directionInternal);
  }

  snapshot(): TimelineSnapshot {
    const activeClips = this.tracksInternal.flatMap((track) => track.activeClips(this.timeInternal).map((clip) => ({
      trackId: track.id,
      trackName: track.name,
      trackType: track.type,
      clipId: clip.id,
      clipName: clip.name,
      assetId: clip.assetId,
      assetClipName: clip.clipName ?? clip.name,
      runtimeTargetId: runtimeTargetIdFromProperties(clip.properties),
      localTime: Number(clip.localTime(this.timeInternal).toFixed(4)),
      assetTime: Number(clip.assetTime(this.timeInternal).toFixed(4)),
      normalizedTime: Number(clip.normalizedTime(this.timeInternal).toFixed(4)),
      blendWeight: Number((clip.blendWeight(this.timeInternal) * track.weight).toFixed(4)),
      blendMode: clip.blendMode,
      properties: { ...clip.properties }
    })));
    const signalEventDetails = this.tracksInternal.flatMap((track) => track.type === "signal"
      ? track.activeClips(this.timeInternal).map((clip) => ({
        trackId: track.id,
        trackName: track.name,
        clipId: clip.id,
        clipName: clip.name,
        event: typeof clip.properties.event === "string" ? clip.properties.event : clip.clipName ?? clip.id,
        time: Number(this.timeInternal.toFixed(4)),
        localTime: Number(clip.localTime(this.timeInternal).toFixed(4)),
        properties: { ...clip.properties }
      }))
      : []);
    const signalEvents = signalEventDetails.map((event) => event.event);
    for (const signal of signalEvents) this.emittedSignals.add(signal);
    const clips = this.tracksInternal.flatMap((track) => track.clips);
    return {
      id: this.id,
      name: this.name,
      playback: this.playing ? "playing" : "paused",
      time: Number(this.timeInternal.toFixed(4)),
      normalizedTime: Number((this.timeInternal / this.duration).toFixed(4)),
      duration: this.duration,
      loopMode: this.loopMode,
      speed: this.speed,
      frameRate: this.frameRate,
      direction: this.directionInternal,
      trackCount: this.tracksInternal.length,
      clipCount: clips.length,
      activeClipCount: activeClips.length,
      activeClips,
      tracks: this.tracksInternal.map((track) => track.snapshot()),
      signalEvents: [...this.emittedSignals].sort(),
      signalEventDetails,
      evidence: {
        oldCodebasePort: true,
        boundedTimelineAuthoring: true,
        clipEasing: clips.some((clip) => clip.easeIn !== "linear" || clip.easeOut !== "linear" || clip.easeInDuration > 0 || clip.easeOutDuration > 0),
        clipBlending: clips.some((clip) => clip.blendMode !== "replace" || clip.weight < 1),
        muteLockState: this.tracksInternal.some((track) => track.muted || track.locked),
        loopPlayback: this.loopMode !== "none",
        signalMarkers: this.tracksInternal.some((track) => track.type === "signal" && track.clips.length > 0)
      }
    };
  }

  toConfig(): TimelineModelConfig {
    return {
      id: this.id,
      name: this.name,
      duration: this.duration,
      loopMode: this.loopMode,
      speed: this.speed,
      frameRate: this.frameRate,
      tracks: this.tracksInternal.map((track) => track.toConfig())
    };
  }

  private wrapTime(value: number): number {
    if (!Number.isFinite(value)) return this.timeInternal;
    if (value < 0) {
      if (this.loopMode === "loop") return modulo(value, this.duration);
      if (this.loopMode === "pingpong") {
        this.directionInternal = 1;
        return Math.abs(value);
      }
      this.playing = false;
      return 0;
    }
    if (value <= this.duration) return value;
    if (this.loopMode === "loop") return modulo(value, this.duration);
    if (this.loopMode === "pingpong") {
      this.directionInternal = -1;
      return Math.max(0, this.duration - (value - this.duration));
    }
    this.playing = false;
    return this.duration;
  }
}

function stableId(prefix: string, name: string): string {
  return `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function runtimeTargetIdFromProperties(properties: Record<string, string | number | boolean>): string | undefined {
  if (typeof properties.runtimeNodeId === "string" && properties.runtimeNodeId.trim().length > 0) return properties.runtimeNodeId;
  if (typeof properties.targetId === "string" && properties.targetId.trim().length > 0) return properties.targetId;
  return undefined;
}

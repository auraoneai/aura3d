import { TimelineEditorController, type TimelineEditorSnapshot } from "./TimelineEditorController";
import { TimelineModel, type TimelineClipConfig, type TimelineModelConfig, type TimelineTrackConfig } from "./TimelineModel";
import { createTimelineTrackConfig, type TimelineEditorTrackKind } from "./TimelineTrackTypes";

export type NonlinearBinAssetKind = "animation" | "audio" | "camera" | "shot" | "sequence" | "caption" | "viseme";

export interface NonlinearBinAsset {
  readonly id: string;
  readonly name: string;
  readonly kind: NonlinearBinAssetKind;
  readonly assetId?: string | undefined;
  readonly clipName?: string | undefined;
  readonly duration?: number | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
}

export interface NonlinearSequenceConfig {
  readonly id: string;
  readonly name: string;
  readonly timeline?: TimelineModelConfig | undefined;
}

export interface NonlinearSequenceSnapshot {
  readonly id: string;
  readonly name: string;
  readonly trackCount: number;
  readonly clipCount: number;
  readonly duration: number;
}

export interface NonlinearAnimationEditorSnapshot {
  readonly kind: "nonlinear-animation-editor";
  readonly activeSequenceId: string;
  readonly sequenceCount: number;
  readonly binAssetCount: number;
  readonly nestedSequenceClipCount: number;
  readonly totalTrackCount: number;
  readonly totalClipCount: number;
  readonly sequences: readonly NonlinearSequenceSnapshot[];
  readonly activeTimeline: TimelineEditorSnapshot;
  readonly evidence: {
    readonly nonlinearSequences: boolean;
    readonly trimSplitMoveDuplicate: boolean;
    readonly nestedSequences: boolean;
    readonly multiTrackTimeline: boolean;
    readonly serialization: true;
  };
}

export interface NonlinearAnimationEditorState {
  readonly activeSequenceId: string;
  readonly binAssets: readonly NonlinearBinAsset[];
  readonly sequences: readonly NonlinearSequenceConfig[];
}

interface NonlinearSequenceRuntime {
  readonly id: string;
  readonly name: string;
  readonly controller: TimelineEditorController;
}

export class NonlinearAnimationEditor {
  private readonly binAssets = new Map<string, NonlinearBinAsset>();
  private readonly sequences = new Map<string, NonlinearSequenceRuntime>();
  private activeSequenceId: string;

  constructor(state: NonlinearAnimationEditorState) {
    if (state.sequences.length === 0) throw new Error("Nonlinear animation editor requires at least one sequence.");
    for (const asset of state.binAssets) this.addBinAsset(asset);
    for (const sequence of state.sequences) this.createSequence(sequence);
    this.activeSequenceId = nonEmpty(state.activeSequenceId, "Active sequence id");
    this.requireSequence(this.activeSequenceId);
  }

  addBinAsset(asset: NonlinearBinAsset): NonlinearBinAsset {
    const clean = sanitizeBinAsset(asset);
    this.binAssets.set(clean.id, clean);
    return clean;
  }

  createSequence(config: NonlinearSequenceConfig): NonlinearSequenceSnapshot {
    const id = nonEmpty(config.id, "Sequence id");
    const timeline = new TimelineModel({
      id,
      name: config.name,
      duration: 10,
      frameRate: 24,
      loopMode: "none",
      ...config.timeline
    });
    this.sequences.set(id, {
      id,
      name: nonEmpty(config.name, "Sequence name"),
      controller: new TimelineEditorController({ timeline })
    });
    return this.sequenceSnapshot(this.requireSequence(id));
  }

  selectSequence(sequenceId: string): NonlinearAnimationEditorSnapshot {
    this.activeSequenceId = this.requireSequence(sequenceId).id;
    return this.snapshot();
  }

  async addTrack(kind: TimelineEditorTrackKind, name?: string, options: Omit<TimelineTrackConfig, "name" | "type"> = {}): Promise<string> {
    const track = await this.activeSequence().controller.addTrack(kind, name, options);
    return track.id;
  }

  async insertAssetClip(trackId: string, assetId: string, options: Omit<TimelineClipConfig, "name" | "startTime" | "duration" | "assetId" | "clipName"> & {
    readonly id?: string | undefined;
    readonly name?: string | undefined;
    readonly startTime: number;
    readonly duration?: number | undefined;
  }): Promise<string> {
    const asset = this.requireBinAsset(assetId);
    const clip = await this.activeSequence().controller.addClip(trackId, {
      ...options,
      id: options.id ?? `${asset.id}-${Math.round(options.startTime * 1000)}`,
      name: options.name ?? asset.name,
      startTime: options.startTime,
      duration: options.duration ?? asset.duration ?? 1,
      assetId: asset.assetId ?? asset.id,
      clipName: asset.clipName ?? asset.name,
      properties: {
        ...(options.properties ?? {}),
        binAssetId: asset.id,
        binAssetKind: asset.kind
      }
    });
    return clip.id;
  }

  async insertNestedSequence(trackId: string, sequenceId: string, options: Omit<TimelineClipConfig, "name" | "startTime" | "duration"> & {
    readonly id?: string | undefined;
    readonly startTime: number;
    readonly duration?: number | undefined;
  }): Promise<string> {
    const nested = this.requireSequence(sequenceId);
    const clip = await this.activeSequence().controller.addClip(trackId, {
      ...options,
      id: options.id ?? `${sequenceId}-nested-${Math.round(options.startTime * 1000)}`,
      name: nested.name,
      startTime: options.startTime,
      duration: options.duration ?? nested.controller.timeline.duration,
      properties: {
        ...(options.properties ?? {}),
        nestedSequenceId: nested.id
      }
    });
    return clip.id;
  }

  async moveClip(clipId: string, startTime: number): Promise<void> {
    await this.activeSequence().controller.moveClip(clipId, startTime);
  }

  async trimClip(clipId: string, duration: number, startTime?: number): Promise<void> {
    await this.activeSequence().controller.resizeClip(clipId, duration, startTime);
  }

  async splitClip(clipId: string, splitTime: number): Promise<readonly string[]> {
    const clips = await this.activeSequence().controller.splitClip(clipId, splitTime);
    return clips.map((clip) => clip.id);
  }

  async duplicateClip(clipId: string, timeOffset?: number): Promise<string> {
    const clip = await this.activeSequence().controller.duplicateClip(clipId, timeOffset);
    return clip.id;
  }

  serialize(): NonlinearAnimationEditorState {
    return {
      activeSequenceId: this.activeSequenceId,
      binAssets: [...this.binAssets.values()],
      sequences: [...this.sequences.values()].map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
        timeline: sequence.controller.serializeTimeline()
      }))
    };
  }

  snapshot(): NonlinearAnimationEditorSnapshot {
    const sequences = [...this.sequences.values()];
    const active = this.activeSequence();
    const totalTrackCount = sequences.reduce((count, sequence) => count + sequence.controller.timeline.tracks.length, 0);
    const totalClipCount = sequences.reduce((count, sequence) => count + sequence.controller.timeline.tracks.reduce((clipCount, track) => clipCount + track.clips.length, 0), 0);
    const nestedSequenceClipCount = sequences.reduce((count, sequence) =>
      count + sequence.controller.timeline.tracks.reduce((trackCount, track) =>
        trackCount + track.clips.filter((clip) => typeof clip.properties.nestedSequenceId === "string").length, 0), 0);
    return {
      kind: "nonlinear-animation-editor",
      activeSequenceId: active.id,
      sequenceCount: sequences.length,
      binAssetCount: this.binAssets.size,
      nestedSequenceClipCount,
      totalTrackCount,
      totalClipCount,
      sequences: sequences.map((sequence) => this.sequenceSnapshot(sequence)),
      activeTimeline: active.controller.snapshot(),
      evidence: {
        nonlinearSequences: sequences.length > 1,
        trimSplitMoveDuplicate: active.controller.history.canUndo || active.controller.history.canRedo,
        nestedSequences: nestedSequenceClipCount > 0,
        multiTrackTimeline: totalTrackCount > 1,
        serialization: true
      }
    };
  }

  private activeSequence(): NonlinearSequenceRuntime {
    return this.requireSequence(this.activeSequenceId);
  }

  private requireSequence(id: string): NonlinearSequenceRuntime {
    const sequence = this.sequences.get(id);
    if (!sequence) throw new Error(`Unknown nonlinear sequence: ${id}`);
    return sequence;
  }

  private requireBinAsset(id: string): NonlinearBinAsset {
    const asset = this.binAssets.get(id);
    if (!asset) throw new Error(`Unknown nonlinear bin asset: ${id}`);
    return asset;
  }

  private sequenceSnapshot(sequence: NonlinearSequenceRuntime): NonlinearSequenceSnapshot {
    const timeline = sequence.controller.timeline;
    return {
      id: sequence.id,
      name: sequence.name,
      trackCount: timeline.tracks.length,
      clipCount: timeline.tracks.reduce((count, track) => count + track.clips.length, 0),
      duration: timeline.duration
    };
  }
}

export function createNonlinearAnimationEditor(state: NonlinearAnimationEditorState): NonlinearAnimationEditor {
  return new NonlinearAnimationEditor(state);
}

function sanitizeBinAsset(asset: NonlinearBinAsset): NonlinearBinAsset {
  if (asset.duration !== undefined && (!Number.isFinite(asset.duration) || asset.duration <= 0)) {
    throw new Error(`Nonlinear bin asset "${asset.id}" duration must be positive when provided.`);
  }
  return {
    id: nonEmpty(asset.id, "Bin asset id"),
    name: nonEmpty(asset.name, "Bin asset name"),
    kind: asset.kind,
    assetId: asset.assetId,
    clipName: asset.clipName,
    duration: asset.duration,
    metadata: asset.metadata
  };
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be a non-empty string.`);
  return trimmed;
}

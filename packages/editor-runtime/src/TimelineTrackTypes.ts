import type { TimelineTrackConfig } from "./TimelineModel";

export type TimelineEditorTrackKind =
  | "shot"
  | "animation"
  | "audio"
  | "viseme"
  | "camera"
  | "dialogue"
  | "sfx"
  | "caption"
  | "selection"
  | "signal"
  | "generic";

export interface TimelineTrackTypeDefinition {
  readonly kind: TimelineEditorTrackKind;
  readonly timelineType: TimelineTrackConfig["type"];
  readonly label: string;
  readonly laneHeight: number;
  readonly color: string;
  readonly acceptsClips: boolean;
  readonly acceptsKeyframes: boolean;
  readonly waveform: boolean;
  readonly lockedByDefault?: boolean;
}

export const TIMELINE_TRACK_TYPES: readonly TimelineTrackTypeDefinition[] = [
  { kind: "shot", timelineType: "generic", label: "Shots", laneHeight: 36, color: "#2563eb", acceptsClips: true, acceptsKeyframes: false, waveform: false },
  { kind: "animation", timelineType: "animation", label: "Animation", laneHeight: 44, color: "#16a34a", acceptsClips: true, acceptsKeyframes: true, waveform: false },
  { kind: "audio", timelineType: "audio", label: "Audio", laneHeight: 48, color: "#db2777", acceptsClips: true, acceptsKeyframes: false, waveform: true },
  { kind: "viseme", timelineType: "generic", label: "Visemes", laneHeight: 34, color: "#ea580c", acceptsClips: true, acceptsKeyframes: true, waveform: true },
  { kind: "camera", timelineType: "camera", label: "Camera", laneHeight: 40, color: "#7c3aed", acceptsClips: true, acceptsKeyframes: true, waveform: false },
  { kind: "dialogue", timelineType: "audio", label: "Dialogue", laneHeight: 42, color: "#0891b2", acceptsClips: true, acceptsKeyframes: false, waveform: true },
  { kind: "sfx", timelineType: "audio", label: "SFX", laneHeight: 36, color: "#c2410c", acceptsClips: true, acceptsKeyframes: false, waveform: true },
  { kind: "caption", timelineType: "generic", label: "Captions", laneHeight: 32, color: "#475569", acceptsClips: true, acceptsKeyframes: false, waveform: false },
  { kind: "selection", timelineType: "selection", label: "Selection", laneHeight: 32, color: "#64748b", acceptsClips: false, acceptsKeyframes: false, waveform: false },
  { kind: "signal", timelineType: "signal", label: "Signals", laneHeight: 32, color: "#ca8a04", acceptsClips: true, acceptsKeyframes: false, waveform: false },
  { kind: "generic", timelineType: "generic", label: "Generic", laneHeight: 32, color: "#334155", acceptsClips: true, acceptsKeyframes: false, waveform: false }
];

export function timelineTrackTypeDefinition(kind: TimelineEditorTrackKind): TimelineTrackTypeDefinition {
  const definition = TIMELINE_TRACK_TYPES.find((candidate) => candidate.kind === kind);
  if (!definition) {
    throw new Error(`Unknown timeline editor track kind: ${kind}`);
  }
  return definition;
}

export function timelineTrackKindFromConfig(track: Pick<TimelineTrackConfig, "type" | "properties">): TimelineEditorTrackKind {
  const storedKind = track.properties?.auraTrackKind;
  if (typeof storedKind === "string" && TIMELINE_TRACK_TYPES.some((definition) => definition.kind === storedKind)) {
    return storedKind as TimelineEditorTrackKind;
  }
  if (track.type === "animation" || track.type === "audio" || track.type === "camera" || track.type === "selection" || track.type === "signal") {
    return track.type;
  }
  return "generic";
}

export interface CreateTimelineTrackConfigOptions {
  readonly id?: string;
  readonly muted?: boolean;
  readonly locked?: boolean;
  readonly weight?: number;
  readonly properties?: TimelineTrackConfig["properties"];
}

export function createTimelineTrackConfig(
  kind: TimelineEditorTrackKind,
  name = timelineTrackTypeDefinition(kind).label,
  options: CreateTimelineTrackConfigOptions = {}
): TimelineTrackConfig {
  const definition = timelineTrackTypeDefinition(kind);
  return {
    id: options.id,
    name,
    type: definition.timelineType,
    muted: options.muted,
    locked: options.locked ?? definition.lockedByDefault,
    weight: options.weight,
    properties: {
      ...(options.properties ?? {}),
      auraTrackKind: kind,
      laneHeight: definition.laneHeight,
      color: definition.color
    }
  };
}

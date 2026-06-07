import type { AudioClip } from "./AudioClip";
import type { AudioWaveformData } from "./AudioWaveform";

export type AudioTimelineTrackRole = "dialogue" | "music" | "sfx" | "ambient";

export interface AudioTimelineEnvelopePoint {
  readonly time: number;
  readonly value: number;
}

export interface AudioTimelineClipOptions {
  readonly id: string;
  readonly clip?: AudioClip;
  readonly assetId?: string;
  readonly sourceUrl?: string;
  readonly waveform?: AudioWaveformData;
  readonly startTime: number;
  readonly duration?: number;
  readonly trimStart?: number;
  readonly trimEnd?: number;
  readonly volume?: number;
  readonly muted?: boolean;
  readonly loop?: boolean;
  readonly busName?: string;
  readonly envelope?: readonly AudioTimelineEnvelopePoint[];
}

export interface AudioTimelineClip {
  readonly id: string;
  readonly clip?: AudioClip;
  readonly assetId?: string;
  readonly sourceUrl?: string;
  readonly waveform?: AudioWaveformData;
  readonly startTime: number;
  readonly duration: number;
  readonly trimStart: number;
  readonly trimEnd: number;
  readonly sourceDuration: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly loop: boolean;
  readonly busName: string;
  readonly envelope: readonly AudioTimelineEnvelopePoint[];
}

export interface AudioTimelineTrackOptions {
  readonly id: string;
  readonly name?: string;
  readonly role: AudioTimelineTrackRole;
  readonly busName?: string;
  readonly volume?: number;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly clips?: readonly AudioTimelineClipOptions[];
}

export interface AudioTimelineSample {
  readonly trackId: string;
  readonly clipId: string;
  readonly role: AudioTimelineTrackRole;
  readonly busName: string;
  readonly timelineTime: number;
  readonly localTime: number;
  readonly sourceTime: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly clip: AudioTimelineClip;
}

export interface AudioTimelineBusMix {
  readonly busName: string;
  readonly role: AudioTimelineTrackRole | "master";
  readonly volume: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly ducked: boolean;
}

export interface AudioTimelineMixSnapshot {
  readonly time: number;
  readonly activeSamples: readonly AudioTimelineSample[];
  readonly buses: readonly AudioTimelineBusMix[];
  readonly dialogueActive: boolean;
  readonly duckingApplied: boolean;
}

export interface AudioTimelineMixOptions {
  readonly masterVolume?: number;
  readonly duckMusicDuringDialogue?: boolean;
  readonly duckingRatio?: number;
  readonly busVolumes?: Readonly<Record<string, number>>;
  readonly mutedBuses?: readonly string[];
  readonly soloBuses?: readonly string[];
}

export class AudioTimelineTrack {
  readonly id: string;
  readonly name: string;
  readonly role: AudioTimelineTrackRole;
  readonly busName: string;

  volume: number;
  muted: boolean;
  solo: boolean;

  private clipsRef: AudioTimelineClip[] = [];

  constructor(options: AudioTimelineTrackOptions) {
    this.id = nonEmpty(options.id, "Audio timeline track id");
    this.name = options.name ?? options.id;
    this.role = options.role;
    this.busName = options.busName ?? defaultAudioTimelineBusForRole(options.role);
    this.volume = validateVolume(options.volume ?? 1, "Audio timeline track volume");
    this.muted = options.muted ?? false;
    this.solo = options.solo ?? false;

    for (const clip of options.clips ?? []) {
      this.addClip(clip);
    }
  }

  get clips(): readonly AudioTimelineClip[] {
    return [...this.clipsRef].sort(compareTimelineClips);
  }

  addClip(options: AudioTimelineClipOptions): AudioTimelineClip {
    if (this.clipsRef.some((clip) => clip.id === options.id)) {
      throw new Error(`Audio timeline clip already exists: ${options.id}`);
    }
    const clip = createAudioTimelineClip(options, this.busName);
    this.clipsRef.push(clip);
    this.sortClips();
    return clip;
  }

  getClip(id: string): AudioTimelineClip {
    const clip = this.clipsRef.find((entry) => entry.id === id);
    if (!clip) {
      throw new Error(`Unknown audio timeline clip: ${id}`);
    }
    return clip;
  }

  removeClip(id: string): AudioTimelineClip {
    const index = this.clipsRef.findIndex((clip) => clip.id === id);
    if (index < 0) {
      throw new Error(`Unknown audio timeline clip: ${id}`);
    }
    const [removed] = this.clipsRef.splice(index, 1);
    return removed!;
  }

  moveClip(id: string, startTime: number): AudioTimelineClip {
    const clip = this.getClip(id);
    const updated = { ...clip, startTime: validateNonNegative(startTime, "Audio timeline clip startTime") };
    this.replaceClip(updated);
    return updated;
  }

  trimClip(id: string, trimStart: number, trimEnd: number): AudioTimelineClip {
    const clip = this.getClip(id);
    const sourceDuration = clip.sourceDuration;
    const nextTrimStart = validateNonNegative(trimStart, "Audio timeline clip trimStart");
    const nextTrimEnd = validateNonNegative(trimEnd, "Audio timeline clip trimEnd");
    if (nextTrimEnd <= nextTrimStart || nextTrimEnd > sourceDuration) {
      throw new Error("Audio timeline trim range must be inside the source duration");
    }
    const updated = {
      ...clip,
      trimStart: nextTrimStart,
      trimEnd: nextTrimEnd,
      duration: nextTrimEnd - nextTrimStart,
      envelope: clip.envelope.filter((point) => point.time <= nextTrimEnd - nextTrimStart)
    };
    this.replaceClip(updated);
    return updated;
  }

  splitClip(id: string, splitTime: number, rightId = `${id}:split`): readonly [AudioTimelineClip, AudioTimelineClip] {
    const clip = this.getClip(id);
    const split = validateNonNegative(splitTime, "Audio timeline splitTime");
    if (split <= clip.startTime || split >= clip.startTime + clip.duration) {
      throw new Error("Audio timeline splitTime must fall inside the clip");
    }
    if (this.clipsRef.some((entry) => entry.id === rightId)) {
      throw new Error(`Audio timeline clip already exists: ${rightId}`);
    }

    const leftDuration = split - clip.startTime;
    const rightDuration = clip.duration - leftDuration;
    const left = {
      ...clip,
      duration: leftDuration,
      trimEnd: clip.trimStart + leftDuration,
      envelope: clip.envelope.filter((point) => point.time <= leftDuration)
    };
    const right = {
      ...clip,
      id: rightId,
      startTime: split,
      duration: rightDuration,
      trimStart: clip.trimStart + leftDuration,
      envelope: shiftEnvelope(clip.envelope.filter((point) => point.time >= leftDuration), -leftDuration)
    };
    this.replaceClip(left);
    this.clipsRef.push(right);
    this.sortClips();
    return [left, right];
  }

  activeClipsAt(time: number): readonly AudioTimelineClip[] {
    const timelineTime = validateNonNegative(time, "Audio timeline sample time");
    return this.clipsRef.filter((clip) => clipContainsTimelineTime(clip, timelineTime)).sort(compareTimelineClips);
  }

  sampleAt(time: number): readonly AudioTimelineSample[] {
    const timelineTime = validateNonNegative(time, "Audio timeline sample time");
    if (this.muted) return [];
    return this.activeClipsAt(timelineTime)
      .map((clip) => createTimelineSample(this, clip, timelineTime))
      .filter((sample) => !sample.muted && sample.volume > 0);
  }

  private replaceClip(next: AudioTimelineClip): void {
    const index = this.clipsRef.findIndex((clip) => clip.id === next.id);
    if (index < 0) {
      throw new Error(`Unknown audio timeline clip: ${next.id}`);
    }
    this.clipsRef[index] = next;
    this.sortClips();
  }

  private sortClips(): void {
    this.clipsRef.sort(compareTimelineClips);
  }
}

export function defaultAudioTimelineBusForRole(role: AudioTimelineTrackRole): string {
  if (role === "dialogue") return "voice";
  if (role === "sfx") return "sfx";
  return role;
}

export function createAudioTimelineMixSnapshot(
  tracks: readonly AudioTimelineTrack[],
  time: number,
  options: AudioTimelineMixOptions = {}
): AudioTimelineMixSnapshot {
  const soloTracks = tracks.filter((track) => track.solo);
  const candidateTracks = soloTracks.length > 0 ? soloTracks : tracks;
  const activeSamples = candidateTracks.flatMap((track) => track.sampleAt(time));
  const dialogueActive = activeSamples.some((sample) => sample.role === "dialogue" && sample.volume > 0);
  const duckingApplied = dialogueActive && options.duckMusicDuringDialogue !== false;
  const mutedBuses = new Set(options.mutedBuses ?? []);
  const soloBuses = new Set(options.soloBuses ?? []);
  const hasSoloBus = soloBuses.size > 0;
  const busByName = new Map<string, AudioTimelineBusMix>();

  busByName.set("master", {
    busName: "master",
    role: "master",
    volume: validateVolume(options.masterVolume ?? 1, "Audio timeline master volume"),
    muted: mutedBuses.has("master"),
    solo: soloBuses.has("master"),
    ducked: false
  });

  for (const track of tracks) {
    const configuredVolume = options.busVolumes?.[track.busName] ?? track.volume;
    const ducked = duckingApplied && track.role === "music";
    const volume = validateVolume(configuredVolume, `Audio timeline bus ${track.busName} volume`)
      * (ducked ? validateDuckingRatio(options.duckingRatio ?? 0.35) : 1);
    const muted = track.muted || mutedBuses.has(track.busName) || (hasSoloBus && !soloBuses.has(track.busName));
    busByName.set(track.busName, {
      busName: track.busName,
      role: track.role,
      volume,
      muted,
      solo: soloBuses.has(track.busName),
      ducked
    });
  }

  return {
    time: validateNonNegative(time, "Audio timeline mix snapshot time"),
    activeSamples: activeSamples.filter((sample) => {
      const bus = busByName.get(sample.busName);
      return bus ? !bus.muted && bus.volume > 0 : true;
    }),
    buses: [...busByName.values()].sort((a, b) => a.busName.localeCompare(b.busName)),
    dialogueActive,
    duckingApplied
  };
}

function createAudioTimelineClip(options: AudioTimelineClipOptions, fallbackBusName: string): AudioTimelineClip {
  const id = nonEmpty(options.id, "Audio timeline clip id");
  const sourceDuration = validateSourceDuration(options);
  const trimStart = validateNonNegative(options.trimStart ?? 0, "Audio timeline clip trimStart");
  const trimEnd = validateNonNegative(options.trimEnd ?? sourceDuration, "Audio timeline clip trimEnd");
  if (trimEnd <= trimStart || trimEnd > sourceDuration) {
    throw new Error("Audio timeline clip trim range must be inside the source duration");
  }
  const duration = validateNonNegative(options.duration ?? (trimEnd - trimStart), "Audio timeline clip duration");
  if (duration <= 0) {
    throw new Error("Audio timeline clip duration must be greater than zero");
  }
  return {
    id,
    ...(options.clip ? { clip: options.clip } : {}),
    ...(options.assetId ? { assetId: options.assetId } : {}),
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
    ...(options.waveform ? { waveform: options.waveform } : {}),
    startTime: validateNonNegative(options.startTime, "Audio timeline clip startTime"),
    duration,
    trimStart,
    trimEnd,
    sourceDuration,
    volume: validateVolume(options.volume ?? 1, "Audio timeline clip volume"),
    muted: options.muted ?? false,
    loop: options.loop ?? false,
    busName: options.busName ?? fallbackBusName,
    envelope: sortEnvelope(options.envelope ?? [])
  };
}

function validateSourceDuration(options: AudioTimelineClipOptions): number {
  const sourceDuration = options.clip?.duration ?? options.waveform?.duration ?? options.duration;
  if (sourceDuration === undefined) {
    throw new Error("Audio timeline clip requires a clip, waveform, or explicit duration");
  }
  return finitePositive(sourceDuration, "Audio timeline clip source duration");
}

function createTimelineSample(track: AudioTimelineTrack, clip: AudioTimelineClip, timelineTime: number): AudioTimelineSample {
  const localTime = timelineTime - clip.startTime;
  const sourceWindow = clip.trimEnd - clip.trimStart;
  const sourceOffset = clip.loop ? localTime % sourceWindow : Math.min(localTime, sourceWindow);
  const sourceTime = clip.trimStart + sourceOffset;
  return {
    trackId: track.id,
    clipId: clip.id,
    role: track.role,
    busName: clip.busName,
    timelineTime,
    localTime,
    sourceTime,
    volume: track.volume * clip.volume * envelopeValueAt(clip.envelope, localTime),
    muted: track.muted || clip.muted,
    clip
  };
}

function clipContainsTimelineTime(clip: AudioTimelineClip, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}

function envelopeValueAt(envelope: readonly AudioTimelineEnvelopePoint[], time: number): number {
  if (envelope.length === 0) return 1;
  if (time <= envelope[0]!.time) return envelope[0]!.value;
  for (let index = 1; index < envelope.length; index++) {
    const previous = envelope[index - 1]!;
    const next = envelope[index]!;
    if (time <= next.time) {
      const span = next.time - previous.time;
      const alpha = span <= 0 ? 0 : (time - previous.time) / span;
      return previous.value + (next.value - previous.value) * alpha;
    }
  }
  return envelope[envelope.length - 1]!.value;
}

function sortEnvelope(envelope: readonly AudioTimelineEnvelopePoint[]): readonly AudioTimelineEnvelopePoint[] {
  return envelope
    .map((point) => ({
      time: validateNonNegative(point.time, "Audio timeline envelope time"),
      value: validateVolume(point.value, "Audio timeline envelope value")
    }))
    .sort((a, b) => a.time - b.time);
}

function shiftEnvelope(envelope: readonly AudioTimelineEnvelopePoint[], delta: number): readonly AudioTimelineEnvelopePoint[] {
  return sortEnvelope(envelope.map((point) => ({ ...point, time: Math.max(0, point.time + delta) })));
}

function compareTimelineClips(left: AudioTimelineClip, right: AudioTimelineClip): number {
  return left.startTime - right.startTime || left.id.localeCompare(right.id);
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return trimmed;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function validateNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function validateVolume(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function validateDuckingRatio(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Audio timeline duckingRatio must be between 0 and 1");
  }
  return value;
}

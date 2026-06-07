import type { AudioStem, AudioStemManifestArtifact } from "./DialoguePerformance.js";
import { normalizePromptAnimationTime, type PromptAnimationFrameRate, type PromptAnimationSeconds } from "./PromptAnimationContract.js";
import type { EncodedVideoArtifact } from "./FrameEncoder.js";

export type AudioMuxerContainer = "webm" | "mp4";
export type AudioMuxerCodec = "opus" | "aac" | "pcm";

export interface AudioMuxerInputStem extends AudioStem {
  readonly source?: Blob | Uint8Array | ArrayBuffer | string | undefined;
  readonly codec?: AudioMuxerCodec | undefined;
  readonly sampleRate?: number | undefined;
  readonly channels?: number | undefined;
}

export interface AudioMuxPlanTrack {
  readonly stemId: string;
  readonly role: AudioStem["role"];
  readonly path: string;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly gainDb: number;
  readonly ducking: AudioStem["ducking"];
  readonly codec: AudioMuxerCodec;
}

export interface AudioMuxPlan {
  readonly kind: "audio-mux-plan";
  readonly container: AudioMuxerContainer;
  readonly videoDuration: PromptAnimationSeconds;
  readonly frameRate: PromptAnimationFrameRate;
  readonly frameDuration: PromptAnimationSeconds;
  readonly tracks: readonly AudioMuxPlanTrack[];
  readonly maxSyncDriftSeconds: PromptAnimationSeconds;
  readonly maxSyncDriftFrames: number;
}

export interface MuxedVideoArtifact {
  readonly kind: "muxed-video";
  readonly container: AudioMuxerContainer;
  readonly mimeType: string;
  readonly duration: PromptAnimationSeconds;
  readonly video: EncodedVideoArtifact;
  readonly muxPlan: AudioMuxPlan;
  readonly audioTrackCount: number;
  readonly byteLength: number;
  readonly output?: Blob | Uint8Array | string | undefined;
}

export interface AudioMuxerAdapter {
  mux(input: { readonly video: EncodedVideoArtifact; readonly plan: AudioMuxPlan; readonly stems: readonly AudioMuxerInputStem[] }): Promise<Blob | Uint8Array | string | undefined> | Blob | Uint8Array | string | undefined;
}

export interface AudioMuxer {
  createPlan(video: EncodedVideoArtifact, stems: readonly AudioMuxerInputStem[], frameRate?: PromptAnimationFrameRate): AudioMuxPlan;
  mux(video: EncodedVideoArtifact, stems: readonly AudioMuxerInputStem[], frameRate?: PromptAnimationFrameRate): Promise<MuxedVideoArtifact>;
}

export interface CreateAudioMuxerOptions {
  readonly container?: AudioMuxerContainer | undefined;
  readonly audioCodec?: AudioMuxerCodec | undefined;
  readonly adapter?: AudioMuxerAdapter | undefined;
}

export function createAudioMuxer(options: CreateAudioMuxerOptions = {}): AudioMuxer {
  const container = options.container ?? "webm";
  const audioCodec = options.audioCodec ?? (container === "mp4" ? "aac" : "opus");
  const adapter = options.adapter ?? { mux: () => undefined };

  return {
    createPlan(video, stems, frameRate = video.frameRate) {
      return createAudioMuxPlan({ video, stems, frameRate, container, audioCodec });
    },
    async mux(video, stems, frameRate = video.frameRate) {
      const plan = createAudioMuxPlan({ video, stems, frameRate, container, audioCodec });
      const output = await adapter.mux({ video, plan, stems });
      return {
        kind: "muxed-video",
        container,
        mimeType: container === "mp4" ? "video/mp4" : "video/webm",
        duration: Math.max(video.duration, ...plan.tracks.map((track) => track.endTime), 0),
        video,
        muxPlan: plan,
        audioTrackCount: plan.tracks.length,
        byteLength: video.byteLength + estimateAudioByteLength(stems),
        ...(output !== undefined ? { output } : {})
      };
    }
  };
}

export function createAudioMuxPlan(input: {
  readonly video: EncodedVideoArtifact;
  readonly stems: readonly AudioMuxerInputStem[];
  readonly frameRate?: PromptAnimationFrameRate | undefined;
  readonly container?: AudioMuxerContainer | undefined;
  readonly audioCodec?: AudioMuxerCodec | undefined;
}): AudioMuxPlan {
  const frameRate = input.frameRate ?? input.video.frameRate;
  const frameDuration = 1 / frameRate;
  const tracks = input.stems.map((stem): AudioMuxPlanTrack => ({
    stemId: stem.id,
    role: stem.role,
    path: stem.path,
    startTime: normalizePromptAnimationTime(stem.startTime),
    endTime: normalizePromptAnimationTime(stem.startTime + stem.duration),
    gainDb: stem.gainDb ?? 0,
    ducking: stem.ducking ?? "none",
    codec: stem.codec ?? input.audioCodec ?? "opus"
  }));
  const maxSyncDriftSeconds = tracks.length === 0
    ? 0
    : Math.max(...tracks.map((track) => nearestFrameDrift(track.startTime, frameRate)));
  return {
    kind: "audio-mux-plan",
    container: input.container ?? (input.video.container === "mp4" ? "mp4" : "webm"),
    videoDuration: input.video.duration,
    frameRate,
    frameDuration,
    tracks,
    maxSyncDriftSeconds: normalizePromptAnimationTime(maxSyncDriftSeconds),
    maxSyncDriftFrames: Math.round(maxSyncDriftSeconds * frameRate)
  };
}

export function audioStemsFromManifest(manifest: AudioStemManifestArtifact): readonly AudioMuxerInputStem[] {
  return manifest.stems.map((stem) => ({ ...stem }));
}

function nearestFrameDrift(time: PromptAnimationSeconds, frameRate: PromptAnimationFrameRate): PromptAnimationSeconds {
  const frame = Math.round(time * frameRate);
  return Math.abs(time - frame / frameRate);
}

function estimateAudioByteLength(stems: readonly AudioMuxerInputStem[]): number {
  return stems.reduce((sum, stem) => {
    if (stem.source instanceof Uint8Array) return sum + stem.source.byteLength;
    if (stem.source instanceof ArrayBuffer) return sum + stem.source.byteLength;
    if (typeof Blob !== "undefined" && stem.source instanceof Blob) return sum + stem.source.size;
    if (typeof stem.source === "string") return sum + stem.source.length;
    return sum + Math.round(Math.max(0, stem.duration) * 16_000);
  }, 0);
}

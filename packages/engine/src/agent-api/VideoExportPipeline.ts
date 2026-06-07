import type { CartoonRenderOutputPackageMetadata, CartoonRenderQueueArtifact, CartoonRenderQueueItem } from "./CartoonRenderQueue.js";
import { createFrameEncoder, type EncodedVideoArtifact, type FrameEncoder, type FrameEncoderAdapter, type FrameEncoderCodec } from "./FrameEncoder.js";
import { audioStemsFromManifest, createAudioMuxer, type AudioMuxer, type AudioMuxerInputStem, type MuxedVideoArtifact } from "./AudioMuxer.js";
import { createRenderProgressTracker, type RenderProgressSnapshot, type RenderProgressTracker } from "./RenderProgressTracker.js";
import type { AudioStemManifestArtifact } from "./DialoguePerformance.js";
import { normalizePromptAnimationTime, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface VideoExportFrameCapture {
  readonly item: CartoonRenderQueueItem;
  readonly image?: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | Blob | Uint8Array | string | undefined;
}

export interface VideoExportRuntime {
  seek?(time: PromptAnimationSeconds, item: CartoonRenderQueueItem): Promise<void> | void;
  step?(dt: PromptAnimationSeconds, item: CartoonRenderQueueItem): Promise<void> | void;
  captureFrame(item: CartoonRenderQueueItem): Promise<VideoExportFrameCapture> | VideoExportFrameCapture;
}

export interface VideoExportPlan {
  readonly kind: "video-export-plan";
  readonly episodeId: string;
  readonly route: string;
  readonly frameRate: number;
  readonly duration: PromptAnimationSeconds;
  readonly frameCount: number;
  readonly outputPath: string;
  readonly outputMimeType: string;
  readonly codec: FrameEncoderCodec;
  readonly audioStemCount: number;
  readonly captionOutputCount: number;
  readonly thumbnailOutputPath?: string | undefined;
  readonly evidenceOutputPath?: string | undefined;
}

export interface VideoExportResult {
  readonly kind: "video-export-result";
  readonly plan: VideoExportPlan;
  readonly encodedVideo: EncodedVideoArtifact;
  readonly muxedVideo: MuxedVideoArtifact;
  readonly progress: RenderProgressSnapshot;
  readonly checksum: string;
  readonly renderTimeMs: number;
}

export interface CreateVideoExportPipelineOptions {
  readonly renderQueue: CartoonRenderQueueArtifact;
  readonly outputPackage: CartoonRenderOutputPackageMetadata;
  readonly runtime: VideoExportRuntime;
  readonly audioStems?: readonly AudioMuxerInputStem[] | AudioStemManifestArtifact | undefined;
  readonly codec?: FrameEncoderCodec | undefined;
  readonly encoder?: FrameEncoder | undefined;
  readonly encoderAdapter?: FrameEncoderAdapter | undefined;
  readonly muxer?: AudioMuxer | undefined;
  readonly progress?: RenderProgressTracker | undefined;
  readonly now?: (() => number) | undefined;
}

export interface VideoExportPipeline {
  readonly plan: VideoExportPlan;
  readonly progress: RenderProgressTracker;
  render(): Promise<VideoExportResult>;
  cancel(message?: string): RenderProgressSnapshot;
}

export function createVideoExportPlan(input: {
  readonly renderQueue: CartoonRenderQueueArtifact;
  readonly outputPackage: CartoonRenderOutputPackageMetadata;
  readonly audioStems?: readonly AudioMuxerInputStem[] | AudioStemManifestArtifact | undefined;
  readonly codec?: FrameEncoderCodec | undefined;
}): VideoExportPlan {
  const videoOutput = input.outputPackage.outputs.webm ?? input.outputPackage.outputs.mp4;
  const codec = input.codec ?? (videoOutput?.codec as FrameEncoderCodec | undefined) ?? (videoOutput?.kind === "mp4" ? "h264" : "vp9");
  const audioStems = normalizeAudioStemInput(input.audioStems);
  return {
    kind: "video-export-plan",
    episodeId: input.renderQueue.episodeId,
    route: input.renderQueue.route,
    frameRate: input.renderQueue.frameRate,
    duration: input.outputPackage.duration,
    frameCount: input.renderQueue.items.length,
    outputPath: videoOutput?.path ?? "dist/render/episode.webm",
    outputMimeType: videoOutput?.mimeType ?? (codec === "h264" ? "video/mp4" : "video/webm"),
    codec,
    audioStemCount: audioStems.length,
    captionOutputCount: input.outputPackage.outputs.captions.length,
    ...(input.outputPackage.outputs.thumbnail?.path ? { thumbnailOutputPath: input.outputPackage.outputs.thumbnail.path } : {}),
    ...(input.outputPackage.outputs.evidenceJson?.path ? { evidenceOutputPath: input.outputPackage.outputs.evidenceJson.path } : {})
  };
}

export function createVideoExportPipeline(options: CreateVideoExportPipelineOptions): VideoExportPipeline {
  const now = options.now ?? defaultNow;
  const plan = createVideoExportPlan(options);
  const encoder = options.encoder ?? createFrameEncoder({
    codec: plan.codec,
    frameRate: options.renderQueue.frameRate,
    viewport: options.renderQueue.viewport,
    adapter: options.encoderAdapter
  });
  const muxer = options.muxer ?? createAudioMuxer({ container: plan.codec === "h264" ? "mp4" : "webm" });
  const progress = options.progress ?? createRenderProgressTracker({ totalFrames: options.renderQueue.items.length, now });
  const audioStems = normalizeAudioStemInput(options.audioStems);
  let cancelled = false;

  return {
    plan,
    progress,
    async render() {
      const startedAt = now();
      progress.start(`Rendering ${plan.frameCount} frames.`);
      for (const item of options.renderQueue.items) {
        if (cancelled || progress.snapshot().cancelled) break;
        await options.runtime.seek?.(item.time, item);
        await options.runtime.step?.(1 / options.renderQueue.frameRate, item);
        const capture = await options.runtime.captureFrame(item);
        await encoder.encodeFrame({
          frame: item.frame,
          time: item.time,
          viewport: item.viewport,
          image: capture.image,
          durationMs: 1000 / options.renderQueue.frameRate
        });
        progress.advance({ frame: item.frame, time: item.time });
      }

      if (cancelled || progress.snapshot().cancelled) {
        const encodedVideo = encoder.snapshot();
        const muxedVideo = await muxer.mux(encodedVideo, audioStems, options.renderQueue.frameRate);
        return createVideoExportResult(plan, encodedVideo, muxedVideo, progress.snapshot(), startedAt, now());
      }

      const encodedVideo = await encoder.finalize();
      const muxedVideo = await muxer.mux(encodedVideo, audioStems, options.renderQueue.frameRate);
      progress.complete("Render export complete.");
      return createVideoExportResult(plan, encodedVideo, muxedVideo, progress.snapshot(), startedAt, now());
    },
    cancel(message) {
      cancelled = true;
      return progress.cancel(message);
    }
  };
}

export function normalizeAudioStemInput(input?: readonly AudioMuxerInputStem[] | AudioStemManifestArtifact | undefined): readonly AudioMuxerInputStem[] {
  if (!input) return [];
  if (isAudioStemManifestArtifact(input)) return audioStemsFromManifest(input);
  return input;
}

function isAudioStemManifestArtifact(input: readonly AudioMuxerInputStem[] | AudioStemManifestArtifact): input is AudioStemManifestArtifact {
  return !Array.isArray(input) && Array.isArray((input as AudioStemManifestArtifact).stems);
}

function createVideoExportResult(
  plan: VideoExportPlan,
  encodedVideo: EncodedVideoArtifact,
  muxedVideo: MuxedVideoArtifact,
  progress: RenderProgressSnapshot,
  startedAt: number,
  endedAt: number
): VideoExportResult {
  const checksumSource = `${plan.episodeId}:${encodedVideo.frameCount}:${muxedVideo.byteLength}:${normalizePromptAnimationTime(muxedVideo.duration)}`;
  return {
    kind: "video-export-result",
    plan,
    encodedVideo,
    muxedVideo,
    progress,
    checksum: deterministicChecksum(checksumSource),
    renderTimeMs: Math.max(0, endedAt - startedAt)
  };
}

function deterministicChecksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function defaultNow(): number {
  return typeof globalThis.performance === "undefined" ? Date.now() : globalThis.performance.now();
}

import {
  defaultFrameEncoderMimeType,
  type EncodedVideoArtifact,
  type EncodedVideoChunk,
  type FrameEncoderAdapter,
  type FrameEncoderCodec,
  type FrameEncoderFrame
} from "./FrameEncoder.js";
import { normalizePromptAnimationTime } from "./PromptAnimationContract.js";

export interface MediaRecorderFrameEncoderCapability {
  readonly kind: "media-recorder-frame-encoder-capability";
  readonly supported: boolean;
  readonly mimeType: string;
  readonly codec: FrameEncoderCodec;
  readonly reason?: string | undefined;
}

export interface CreateMediaRecorderFrameEncoderAdapterOptions {
  readonly codec?: FrameEncoderCodec | undefined;
  readonly mimeType?: string | undefined;
  readonly recorderSupported?: boolean | undefined;
  readonly outputFactory?: ((summary: FrameEncoderAdapterSummary, frames: readonly FrameEncoderFrame[]) => Blob | Uint8Array | string | undefined) | undefined;
}

export function probeMediaRecorderFrameEncoder(codec: FrameEncoderCodec = "vp9", mimeType = defaultFrameEncoderMimeType(codec)): MediaRecorderFrameEncoderCapability {
  const mediaRecorder = (globalThis as unknown as { MediaRecorder?: { isTypeSupported?(mimeType: string): boolean } }).MediaRecorder;
  if (!mediaRecorder) {
    return { kind: "media-recorder-frame-encoder-capability", supported: false, mimeType, codec, reason: "MediaRecorder is unavailable in this runtime." };
  }
  const supported = mediaRecorder.isTypeSupported?.(mimeType) ?? true;
  return {
    kind: "media-recorder-frame-encoder-capability",
    supported,
    mimeType,
    codec,
    ...(supported ? {} : { reason: `MediaRecorder does not support ${mimeType}.` })
  };
}

export function createMediaRecorderFrameEncoderAdapter(options: CreateMediaRecorderFrameEncoderAdapterOptions = {}): FrameEncoderAdapter {
  const frames: FrameEncoderFrame[] = [];
  const codec = options.codec ?? "vp9";
  const capability = {
    ...probeMediaRecorderFrameEncoder(codec, options.mimeType),
    ...(options.recorderSupported !== undefined ? { supported: options.recorderSupported } : {})
  };
  // Honest labeling: this adapter only yields a real playable video when the caller
  // injects a real `outputFactory`. Without one, finalize() returns a metadata
  // summary blob (NOT a playable video), so it must be reported as proof-only /
  // memory-summary rather than claiming encoded-video.
  const hasRealOutput = typeof options.outputFactory === "function";
  return {
    kind: "media-recorder-frame-encoder",
    proofOnly: !hasRealOutput,
    outputMode: !capability.supported ? "unsupported" : hasRealOutput ? "encoded-video" : "memory-summary",
    capability,
    encode(frame) {
      if (!capability.supported) throw new Error(capability.reason ?? "MediaRecorder frame encoder is unsupported.");
      frames.push(frame);
      return createMediaRecorderChunk(frame);
    },
    finalize(summary) {
      if (!capability.supported) throw new Error(capability.reason ?? "MediaRecorder frame encoder is unsupported.");
      return options.outputFactory?.(summary, frames) ?? mediaRecorderSummaryBlob(summary);
    },
    reset() {
      frames.length = 0;
    }
  };
}

function createMediaRecorderChunk(frame: FrameEncoderFrame): EncodedVideoChunk {
  return {
    frame: frame.frame,
    time: normalizePromptAnimationTime(frame.time),
    byteLength: mediaFrameByteLength(frame),
    keyFrame: frame.frame === 0 || frame.frame % 60 === 0,
    durationMs: frame.durationMs ?? 1000 / 30
  };
}

type FrameEncoderAdapterSummary = Omit<EncodedVideoArtifact, "kind" | "output" | "outputMode" | "proofOnly" | "playable" | "unsupportedReason">;

function mediaRecorderSummaryBlob(summary: FrameEncoderAdapterSummary): Blob | Uint8Array | string {
  const payload = JSON.stringify({
    encoder: "media-recorder",
    codec: summary.codec,
    mimeType: summary.mimeType,
    frameCount: summary.frameCount,
    duration: summary.duration,
    byteLength: summary.byteLength
  });
  return typeof Blob === "undefined" ? payload : new Blob([payload], { type: summary.mimeType });
}

function mediaFrameByteLength(frame: FrameEncoderFrame): number {
  if (frame.image instanceof Uint8Array) return frame.image.byteLength;
  if (typeof Blob !== "undefined" && frame.image instanceof Blob) return frame.image.size;
  if (typeof frame.image === "string") return frame.image.length;
  return Math.max(1, Math.round(frame.viewport.width * frame.viewport.height * 0.08));
}

import {
  type EncodedVideoArtifact,
  type EncodedVideoChunk,
  type FrameEncoderAdapter,
  type FrameEncoderCodec,
  type FrameEncoderFrame,
  type FrameEncoderOutputMode
} from "./FrameEncoder.js";
import { normalizePromptAnimationTime } from "./PromptAnimationContract.js";

export interface WebCodecsFrameEncoderCapability {
  readonly kind: "webcodecs-frame-encoder-capability";
  readonly supported: boolean;
  readonly codec: FrameEncoderCodec;
  readonly supportedCodecs: readonly FrameEncoderCodec[];
  readonly supportedContainers: readonly ("mp4" | "webm")[];
  readonly canProducePlayableFile: boolean;
  readonly requiresExternalMuxer: boolean;
  readonly reason?: string | undefined;
}

export interface CreateWebCodecsFrameEncoderAdapterOptions {
  readonly codec?: FrameEncoderCodec | undefined;
  readonly supported?: boolean | undefined;
  readonly outputMode?: Extract<FrameEncoderOutputMode, "encoded-video" | "encoded-chunks"> | undefined;
  readonly playableOutput?: boolean | undefined;
  readonly outputFactory?: ((summary: Omit<EncodedVideoArtifact, "kind" | "output" | "outputMode" | "proofOnly" | "playable" | "unsupportedReason">, chunks: readonly EncodedVideoChunk[]) => Blob | Uint8Array | string | undefined) | undefined;
}

export function probeWebCodecsFrameEncoder(codec: FrameEncoderCodec = "h264"): WebCodecsFrameEncoderCapability {
  const hasVideoEncoder = Boolean((globalThis as unknown as { VideoEncoder?: unknown }).VideoEncoder);
  const supportedCodecs: readonly FrameEncoderCodec[] = ["h264", "vp9"];
  if (!hasVideoEncoder) {
    return {
      kind: "webcodecs-frame-encoder-capability",
      supported: false,
      codec,
      supportedCodecs: [],
      supportedContainers: [],
      canProducePlayableFile: false,
      requiresExternalMuxer: true,
      reason: "VideoEncoder is unavailable in this runtime."
    };
  }
  if (!supportedCodecs.includes(codec)) {
    return {
      kind: "webcodecs-frame-encoder-capability",
      supported: false,
      codec,
      supportedCodecs,
      supportedContainers: ["mp4", "webm"],
      canProducePlayableFile: false,
      requiresExternalMuxer: true,
      reason: `WebCodecs adapter does not declare support for codec "${codec}".`
    };
  }
  return {
    kind: "webcodecs-frame-encoder-capability",
    supported: true,
    codec,
    supportedCodecs,
    supportedContainers: codec === "h264" ? ["mp4"] : ["webm"],
    canProducePlayableFile: false,
    requiresExternalMuxer: true,
    reason: "WebCodecs encodes video chunks; a real MP4/WebM container writer is required for playable file output."
  };
}

export function createWebCodecsFrameEncoderAdapter(options: CreateWebCodecsFrameEncoderAdapterOptions = {}): FrameEncoderAdapter {
  const codec = options.codec ?? "h264";
  const outputMode = options.outputMode ?? (options.playableOutput ? "encoded-video" : "encoded-chunks");
  const capability = {
    ...probeWebCodecsFrameEncoder(codec),
    ...(options.supported !== undefined ? {
      supported: options.supported,
      supportedCodecs: options.supported ? ["h264", "vp9"] as const : [] as const,
      supportedContainers: options.supported ? (codec === "h264" ? ["mp4"] as const : ["webm"] as const) : [] as const
    } : {}),
    ...(options.playableOutput !== undefined ? {
      canProducePlayableFile: options.playableOutput,
      requiresExternalMuxer: !options.playableOutput
    } : {})
  };
  const chunks: EncodedVideoChunk[] = [];
  return {
    kind: "webcodecs-frame-encoder",
    proofOnly: false,
    outputMode: capability.supported ? outputMode : "unsupported",
    capability,
    encode(frame) {
      if (!capability.supported) throw new Error(capability.reason ?? "WebCodecs frame encoder is unsupported.");
      const chunk = {
        frame: frame.frame,
        time: normalizePromptAnimationTime(frame.time),
        byteLength: webCodecsFrameByteLength(frame),
        keyFrame: frame.frame === 0 || frame.frame % 60 === 0,
        durationMs: frame.durationMs ?? 1000 / 30
      };
      chunks.push(chunk);
      return chunk;
    },
    finalize(summary) {
      if (!capability.supported) throw new Error(capability.reason ?? "WebCodecs frame encoder is unsupported.");
      return options.outputFactory?.(summary, chunks);
    },
    reset() {
      chunks.length = 0;
    }
  };
}

function webCodecsFrameByteLength(frame: FrameEncoderFrame): number {
  if (frame.image instanceof Uint8Array) return frame.image.byteLength;
  if (typeof Blob !== "undefined" && frame.image instanceof Blob) return frame.image.size;
  if (typeof frame.image === "string") return frame.image.length;
  return Math.max(1, Math.round(frame.viewport.width * frame.viewport.height * 0.075));
}

import type { CartoonViewport } from "./CartoonRenderQueue.js";
import { normalizePromptAnimationTime, type PromptAnimationFrameRate, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export type FrameEncoderCodec = "vp9" | "vp8" | "h264" | "av1" | "png-sequence";
export type FrameEncoderContainer = "webm" | "mp4" | "png-sequence";
export type FrameEncoderStatus = "idle" | "encoding" | "finalized";

export interface FrameEncoderFrame {
  readonly frame: number;
  readonly time: PromptAnimationSeconds;
  readonly viewport: CartoonViewport;
  readonly image?: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | Blob | Uint8Array | string | undefined;
  readonly durationMs?: number | undefined;
}

export interface EncodedVideoChunk {
  readonly frame: number;
  readonly time: PromptAnimationSeconds;
  readonly byteLength: number;
  readonly keyFrame: boolean;
  readonly durationMs: number;
}

export interface EncodedVideoArtifact {
  readonly kind: "encoded-video";
  readonly codec: FrameEncoderCodec;
  readonly container: FrameEncoderContainer;
  readonly mimeType: string;
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: CartoonViewport;
  readonly frameCount: number;
  readonly duration: PromptAnimationSeconds;
  readonly byteLength: number;
  readonly chunks: readonly EncodedVideoChunk[];
  readonly output?: Blob | Uint8Array | string | undefined;
}

export interface FrameEncoderAdapter {
  encode(frame: FrameEncoderFrame): Promise<EncodedVideoChunk> | EncodedVideoChunk;
  finalize(summary: Omit<EncodedVideoArtifact, "kind" | "output">): Promise<Blob | Uint8Array | string | undefined> | Blob | Uint8Array | string | undefined;
  reset?(): void;
}

export interface FrameEncoder {
  readonly codec: FrameEncoderCodec;
  readonly container: FrameEncoderContainer;
  readonly mimeType: string;
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: CartoonViewport;
  encodeFrame(frame: FrameEncoderFrame): Promise<EncodedVideoChunk>;
  finalize(): Promise<EncodedVideoArtifact>;
  reset(): void;
  snapshot(): EncodedVideoArtifact;
}

export interface CreateFrameEncoderOptions {
  readonly codec?: FrameEncoderCodec | undefined;
  readonly container?: FrameEncoderContainer | undefined;
  readonly mimeType?: string | undefined;
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: CartoonViewport;
  readonly adapter?: FrameEncoderAdapter | undefined;
}

export function createFrameEncoder(options: CreateFrameEncoderOptions): FrameEncoder {
  const codec = options.codec ?? "vp9";
  const container = options.container ?? defaultContainerForCodec(codec);
  const mimeType = options.mimeType ?? defaultFrameEncoderMimeType(codec, container);
  const adapter = options.adapter ?? createInMemoryFrameEncoderAdapter();
  let status: FrameEncoderStatus = "idle";
  let chunks: EncodedVideoChunk[] = [];
  let output: Blob | Uint8Array | string | undefined;

  const snapshot = (): EncodedVideoArtifact => {
    const duration = chunks.length === 0 ? 0 : normalizePromptAnimationTime(chunks.reduce((sum, chunk) => sum + chunk.durationMs, 0) / 1000);
    return {
      kind: "encoded-video",
      codec,
      container,
      mimeType,
      frameRate: options.frameRate,
      viewport: options.viewport,
      frameCount: chunks.length,
      duration,
      byteLength: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
      chunks,
      ...(output !== undefined ? { output } : {})
    };
  };

  return {
    codec,
    container,
    mimeType,
    frameRate: options.frameRate,
    viewport: options.viewport,
    async encodeFrame(frame) {
      if (status === "finalized") throw new Error("FrameEncoder cannot encode after finalize(). Call reset() first.");
      status = "encoding";
      const chunk = await adapter.encode({
        ...frame,
        durationMs: frame.durationMs ?? 1000 / options.frameRate,
        time: normalizePromptAnimationTime(frame.time)
      });
      chunks = [...chunks, chunk];
      return chunk;
    },
    async finalize() {
      const summary = snapshot();
      output = await adapter.finalize({
        codec,
        container,
        mimeType,
        frameRate: options.frameRate,
        viewport: options.viewport,
        frameCount: summary.frameCount,
        duration: summary.duration,
        byteLength: summary.byteLength,
        chunks: summary.chunks
      });
      status = "finalized";
      return snapshot();
    },
    reset() {
      status = "idle";
      chunks = [];
      output = undefined;
      adapter.reset?.();
    },
    snapshot
  };
}

export function createInMemoryFrameEncoderAdapter(): FrameEncoderAdapter {
  return {
    encode(frame) {
      return {
        frame: frame.frame,
        time: normalizePromptAnimationTime(frame.time),
        byteLength: estimateFrameByteLength(frame),
        keyFrame: frame.frame === 0 || frame.frame % 60 === 0,
        durationMs: frame.durationMs ?? 1000 / 30
      };
    },
    finalize() {
      return undefined;
    }
  };
}

export function defaultContainerForCodec(codec: FrameEncoderCodec): FrameEncoderContainer {
  if (codec === "h264") return "mp4";
  if (codec === "png-sequence") return "png-sequence";
  return "webm";
}

export function defaultFrameEncoderMimeType(codec: FrameEncoderCodec, container = defaultContainerForCodec(codec)): string {
  if (container === "mp4") return codec === "h264" ? "video/mp4; codecs=avc1.42E01E" : "video/mp4";
  if (container === "png-sequence") return "image/png";
  return `video/webm; codecs=${codec}`;
}

export function supportsFrameEncoderCodec(codec: FrameEncoderCodec): boolean {
  if (codec === "png-sequence") return true;
  const mediaRecorder = (globalThis as unknown as { MediaRecorder?: { isTypeSupported?(mimeType: string): boolean } }).MediaRecorder;
  if (mediaRecorder?.isTypeSupported?.(defaultFrameEncoderMimeType(codec))) return true;
  const videoEncoder = (globalThis as unknown as { VideoEncoder?: unknown }).VideoEncoder;
  return Boolean(videoEncoder && (codec === "h264" || codec === "vp9" || codec === "vp8" || codec === "av1"));
}

function estimateFrameByteLength(frame: FrameEncoderFrame): number {
  if (frame.image instanceof Uint8Array) return frame.image.byteLength;
  if (typeof Blob !== "undefined" && frame.image instanceof Blob) return frame.image.size;
  if (typeof frame.image === "string") return frame.image.length;
  return Math.max(1, Math.round(frame.viewport.width * frame.viewport.height * 0.12));
}

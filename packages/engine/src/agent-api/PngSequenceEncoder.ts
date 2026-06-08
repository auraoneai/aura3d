import type { AnimationViewport } from "./AnimationRenderQueue.js";
import type { FrameEncoderAdapter, FrameEncoderFrame } from "./FrameEncoder.js";
import { normalizePromptAnimationTime, type PromptAnimationFrameRate } from "./PromptAnimationContract.js";

export interface PngSequenceFrameArtifact {
  readonly frame: number;
  readonly time: number;
  readonly path: string;
  readonly byteLength: number;
  readonly checksum: string;
}

export interface PngSequenceManifest {
  readonly kind: "png-sequence-manifest";
  readonly proofOnly: boolean;
  readonly publishScopedFallback: boolean;
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: AnimationViewport;
  readonly frameCount: number;
  readonly frames: readonly PngSequenceFrameArtifact[];
}

export interface CreatePngSequenceEncoderAdapterOptions {
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: AnimationViewport;
  readonly directory?: string | undefined;
  readonly publishScopedFallback?: boolean | undefined;
  readonly writeFrame?: ((path: string, frame: FrameEncoderFrame) => void | Promise<void>) | undefined;
}

export function createPngSequenceEncoderAdapter(options: CreatePngSequenceEncoderAdapterOptions): FrameEncoderAdapter {
  const frames: PngSequenceFrameArtifact[] = [];
  const directory = options.directory ?? "frames";
  return {
    kind: "png-sequence-encoder",
    proofOnly: options.publishScopedFallback !== true,
    outputMode: "png-sequence",
    capability: {
      supported: true,
      reason: options.publishScopedFallback === true
        ? "PNG sequence fallback is explicitly scoped as acceptable output for this package."
        : "PNG sequence output is proof-only unless the release explicitly scopes it as publish fallback."
    },
    async encode(frame) {
      const path = `${directory}/frame-${String(frame.frame).padStart(4, "0")}.png`;
      await options.writeFrame?.(path, frame);
      const byteLength = pngFrameByteLength(frame);
      frames.push({
        frame: frame.frame,
        time: normalizePromptAnimationTime(frame.time),
        path,
        byteLength,
        checksum: pngSequenceChecksum(`${path}:${byteLength}:${frame.time}`)
      });
      return {
        frame: frame.frame,
        time: normalizePromptAnimationTime(frame.time),
        byteLength,
        keyFrame: true,
        durationMs: frame.durationMs ?? 1000 / options.frameRate
      };
    },
    finalize() {
      return JSON.stringify(createPngSequenceManifest({
        frameRate: options.frameRate,
        viewport: options.viewport,
        frames,
        publishScopedFallback: options.publishScopedFallback ?? false
      }));
    },
    reset() {
      frames.length = 0;
    }
  };
}

export function createPngSequenceManifest(input: {
  readonly frameRate: PromptAnimationFrameRate;
  readonly viewport: AnimationViewport;
  readonly frames: readonly PngSequenceFrameArtifact[];
  readonly publishScopedFallback?: boolean | undefined;
}): PngSequenceManifest {
  return {
    kind: "png-sequence-manifest",
    proofOnly: input.publishScopedFallback !== true,
    publishScopedFallback: input.publishScopedFallback === true,
    frameRate: input.frameRate,
    viewport: input.viewport,
    frameCount: input.frames.length,
    frames: input.frames
  };
}

function pngFrameByteLength(frame: FrameEncoderFrame): number {
  if (frame.image instanceof Uint8Array) return frame.image.byteLength;
  if (typeof Blob !== "undefined" && frame.image instanceof Blob) return frame.image.size;
  if (typeof frame.image === "string") return frame.image.length;
  return Math.max(1, Math.round(frame.viewport.width * frame.viewport.height * 0.16));
}

function pngSequenceChecksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pngseq-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

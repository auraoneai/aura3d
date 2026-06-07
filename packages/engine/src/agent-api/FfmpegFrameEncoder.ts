import {
  defaultContainerForCodec,
  defaultFrameEncoderMimeType,
  type EncodedVideoArtifact,
  type EncodedVideoChunk,
  type FrameEncoderAdapter,
  type FrameEncoderCodec,
  type FrameEncoderContainer,
  type FrameEncoderFrame
} from "./FrameEncoder.js";
import { normalizePromptAnimationTime, type PromptAnimationFrameRate } from "./PromptAnimationContract.js";

/**
 * FfmpegFrameEncoder
 * -------------------
 * This is the FIRST FrameEncoderAdapter that produces a genuinely playable video
 * file. Every other adapter in this package is honest about being proof-only:
 *  - createInMemoryFrameEncoderAdapter() records frame metadata only.
 *  - createMediaRecorderFrameEncoderAdapter() returns a JSON metadata summary blob.
 *  - createWebCodecsFrameEncoderAdapter() returns container-less encoded chunks.
 *  - createPngSequenceEncoderAdapter() writes a PNG manifest, not a video.
 *
 * This adapter actually shells out to a real `ffmpeg` binary (via node's
 * child_process) to mux the buffered frames into a `.webm` (libvpx-vp9) or
 * `.mp4` (libx264) file, then reads that file back and returns its bytes as a
 * Uint8Array. The result is a real, playable container.
 *
 * Honesty / limitations:
 *  - This adapter only works in a Node-like runtime that has `ffmpeg` on PATH.
 *    There is NO pure-JS fallback. If ffmpeg is unavailable, probeFfmpeg()
 *    reports supported:false and the adapter degrades to proofOnly:true /
 *    outputMode:"unsupported" rather than pretending to encode.
 *  - It prefers PNG-encoded frame bytes (each FrameEncoderFrame.image as a
 *    Uint8Array of PNG file bytes, or a string path/data-URL to a PNG). PNG is
 *    self-describing (ffmpeg infers dimensions), so this is the robust path.
 *  - Raw RGBA buffers are ALSO accepted, but only when every frame is raw RGBA
 *    of the configured viewport size: ffmpeg is then told `-f rawvideo -pix_fmt
 *    rgba -s WxH`. Mixing PNG and raw RGBA in one run is rejected.
 *  - Frames are buffered in memory until finalize(); this is not a streaming
 *    encoder.
 */

export type FfmpegFrameInputFormat = "png" | "rawvideo";

export interface FfmpegRunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Injectable seam used to invoke ffmpeg. The default implementation spawns the
 * real binary, but tests provide a fake that records the args and writes a
 * stand-in output file. Implementations must write the encoded video to
 * `outputPath` (the bytes read back are whatever lands there).
 */
export type RunFfmpeg = (input: {
  readonly args: readonly string[];
  readonly ffmpegPath: string;
  readonly inputFormat: FfmpegFrameInputFormat;
  readonly framePaths: readonly string[];
  readonly outputPath: string;
}) => Promise<FfmpegRunResult> | FfmpegRunResult;

export interface FfmpegCapability {
  readonly kind: "ffmpeg-frame-encoder-capability";
  readonly supported: boolean;
  readonly ffmpegPath: string;
  readonly codec: FrameEncoderCodec;
  readonly container: FrameEncoderContainer;
  readonly reason?: string | undefined;
}

export interface CreateFfmpegFrameEncoderAdapterOptions {
  readonly codec?: FrameEncoderCodec | undefined;
  readonly container?: FrameEncoderContainer | undefined;
  readonly frameRate?: PromptAnimationFrameRate | undefined;
  /** Path/name of the ffmpeg binary. Defaults to "ffmpeg" (resolved via PATH). */
  readonly ffmpegPath?: string | undefined;
  /** Directory used to stage frame files + the encoded output. Defaults to an OS temp dir. */
  readonly workingDirectory?: string | undefined;
  /** Force the capability decision instead of probing PATH (mostly for tests). */
  readonly supported?: boolean | undefined;
  /** Extra ffmpeg arguments appended before the output path (e.g. ["-crf", "30"]). */
  readonly extraArgs?: readonly string[] | undefined;
  /** Test seam: invoke ffmpeg. Defaults to a real child_process spawn. */
  readonly runFfmpeg?: RunFfmpeg | undefined;
  /** Test seam: filesystem operations. Defaults to node:fs/promises + node:os/node:path. */
  readonly fileSystem?: FfmpegFileSystem | undefined;
}

/** Minimal filesystem surface this adapter needs; injectable for tests. */
export interface FfmpegFileSystem {
  mkdtemp(prefix: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  rm(path: string): Promise<void>;
  join(...parts: string[]): string;
  tmpdir(): string;
}

const VP9_CODEC = "libvpx-vp9";
const H264_CODEC = "libx264";

/**
 * Probe whether a usable `ffmpeg` binary exists on PATH (or at `ffmpegPath`).
 * Runs `ffmpeg -version` and treats a zero exit code as supported. In a non-Node
 * runtime (no child_process) this resolves to supported:false.
 */
export async function probeFfmpeg(
  ffmpegPath = "ffmpeg",
  codec: FrameEncoderCodec = "vp9",
  container: FrameEncoderContainer = defaultContainerForCodec(codec)
): Promise<FfmpegCapability> {
  const base = { kind: "ffmpeg-frame-encoder-capability" as const, ffmpegPath, codec, container };
  if (codec === "png-sequence" || container === "png-sequence") {
    return { ...base, supported: false, reason: "FfmpegFrameEncoder encodes video containers, not png-sequence output." };
  }
  let childProcess: typeof import("node:child_process") | undefined;
  try {
    childProcess = await import("node:child_process");
  } catch {
    return { ...base, supported: false, reason: "node:child_process is unavailable; ffmpeg can only run in a Node-like runtime." };
  }
  return await new Promise<FfmpegCapability>((resolve) => {
    let settled = false;
    const finish = (cap: FfmpegCapability): void => {
      if (settled) return;
      settled = true;
      resolve(cap);
    };
    try {
      const child = childProcess.spawn(ffmpegPath, ["-version"], { stdio: "ignore" });
      child.on("error", () => finish({ ...base, supported: false, reason: `ffmpeg binary "${ffmpegPath}" was not found on PATH.` }));
      child.on("close", (code) => {
        if (code === 0) finish({ ...base, supported: true });
        else finish({ ...base, supported: false, reason: `"${ffmpegPath} -version" exited with code ${code ?? "null"}.` });
      });
    } catch {
      finish({ ...base, supported: false, reason: `Failed to spawn ffmpeg binary "${ffmpegPath}".` });
    }
  });
}

/**
 * Create a FrameEncoderAdapter backed by a real ffmpeg process.
 *
 * Because capability detection is async (it spawns `ffmpeg -version`) while the
 * FrameEncoderAdapter surface is synchronous, this returns a Promise of the
 * adapter. The probe result is baked into the returned adapter's `capability`,
 * `proofOnly`, and `outputMode`.
 */
export async function createFfmpegFrameEncoderAdapter(
  options: CreateFfmpegFrameEncoderAdapterOptions = {}
): Promise<FrameEncoderAdapter> {
  const codec = options.codec ?? "vp9";
  const container = options.container ?? defaultContainerForCodec(codec);
  const frameRate = options.frameRate ?? 30;
  const ffmpegPath = options.ffmpegPath ?? "ffmpeg";
  const mimeType = defaultFrameEncoderMimeType(codec, container);

  // A caller-injected runFfmpeg implies the encoder is usable without probing PATH.
  const probed = options.supported !== undefined
    ? { kind: "ffmpeg-frame-encoder-capability" as const, supported: options.supported, ffmpegPath, codec, container, ...(options.supported ? {} : { reason: "ffmpeg support was explicitly disabled." }) }
    : options.runFfmpeg
      ? { kind: "ffmpeg-frame-encoder-capability" as const, supported: true, ffmpegPath, codec, container }
      : await probeFfmpeg(ffmpegPath, codec, container);

  const capability = {
    supported: probed.supported,
    reason: probed.reason,
    supportedCodecs: ["vp9", "h264"] as const,
    supportedContainers: ["webm", "mp4"] as const,
    canProducePlayableFile: probed.supported,
    requiresExternalMuxer: true
  };

  const frames: FrameEncoderFrame[] = [];

  const adapter: FrameEncoderAdapter = {
    kind: "ffmpeg-frame-encoder",
    // Honest: a real playable file is only produced when ffmpeg is available.
    proofOnly: !probed.supported,
    outputMode: probed.supported ? "encoded-video" : "unsupported",
    capability,
    encode(frame: FrameEncoderFrame): EncodedVideoChunk {
      if (!probed.supported) throw new Error(probed.reason ?? "ffmpeg is unavailable; cannot encode video.");
      frames.push(frame);
      return {
        frame: frame.frame,
        time: normalizePromptAnimationTime(frame.time),
        byteLength: ffmpegFrameByteLength(frame),
        keyFrame: frame.frame === 0 || frame.frame % 60 === 0,
        durationMs: frame.durationMs ?? 1000 / frameRate
      };
    },
    async finalize(
      summary: Omit<EncodedVideoArtifact, "kind" | "output" | "outputMode" | "proofOnly" | "playable" | "unsupportedReason">
    ): Promise<Uint8Array | undefined> {
      if (!probed.supported) throw new Error(probed.reason ?? "ffmpeg is unavailable; cannot encode video.");
      if (frames.length === 0) throw new Error("FfmpegFrameEncoder.finalize() called with no buffered frames.");

      const inputFormat = resolveInputFormat(frames);
      const fs = options.fileSystem ?? (await defaultFileSystem());
      const work = options.workingDirectory ?? (await fs.mkdtemp(fs.join(fs.tmpdir(), "aura3d-ffmpeg-")));
      if (options.workingDirectory) {
        await fs.mkdir(work);
      }

      const outputPath = fs.join(work, `aura3d-output.${container === "mp4" ? "mp4" : "webm"}`);
      const framePaths: string[] = [];
      let inputPath: string;
      try {
        if (inputFormat === "png") {
          // PNG frames are self-describing, so ffmpeg's image2 demuxer reads them
          // as a numbered sequence via the frame-%06d.png pattern.
          for (let index = 0; index < frames.length; index += 1) {
            const framePath = fs.join(work, `frame-${String(index).padStart(6, "0")}.png`);
            await fs.writeFile(framePath, frameBytes(frames[index]!));
            framePaths.push(framePath);
          }
          inputPath = fs.join(work, "frame-%06d.png");
        } else {
          // Raw RGBA cannot use the image2 sequence demuxer (rawvideo has no
          // per-file pattern support), so concatenate every frame into one
          // contiguous rawvideo stream fed as a single -i input.
          const single = fs.join(work, "frames.raw");
          await fs.writeFile(single, concatRawFrames(frames));
          framePaths.push(single);
          inputPath = single;
        }

        const args = buildFfmpegArgs({
          frameRate: summary.frameRate || frameRate,
          codec,
          container,
          inputFormat,
          inputPattern: inputPath,
          outputPath,
          viewport: { width: summary.viewport.width, height: summary.viewport.height },
          extraArgs: options.extraArgs ?? []
        });

        const runner = options.runFfmpeg ?? defaultRunFfmpeg(ffmpegPath);
        const result = await runner({ args, ffmpegPath, inputFormat, framePaths, outputPath });
        if (result.code !== 0) {
          throw new Error(`ffmpeg exited with code ${result.code}: ${result.stderr.slice(0, 2000)}`);
        }

        return await fs.readFile(outputPath);
      } finally {
        // Best-effort cleanup of the staged frames + output.
        for (const framePath of framePaths) {
          await fs.rm(framePath).catch(() => undefined);
        }
        await fs.rm(outputPath).catch(() => undefined);
        if (!options.workingDirectory) {
          await fs.rm(work).catch(() => undefined);
        }
      }
    },
    reset(): void {
      frames.length = 0;
    }
  };

  return adapter;
}

/**
 * Build the ffmpeg argument vector. Exported so tests (and curious humans) can
 * assert exactly what would be run.
 *
 * webm/vp9 example:
 *   ffmpeg -y -framerate 30 -i frame-%06d.png \
 *     -c:v libvpx-vp9 -pix_fmt yuv420p -b:v 0 -crf 32 out.webm
 * mp4/h264 example:
 *   ffmpeg -y -framerate 30 -i frame-%06d.png \
 *     -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4
 * raw rgba input adds `-f rawvideo -pixel_format rgba -video_size WxH` before
 * `-i`, and `inputPattern` is a single concatenated .raw file (not a %06d
 * pattern, which rawvideo does not support).
 */
export function buildFfmpegArgs(input: {
  readonly frameRate: PromptAnimationFrameRate;
  readonly codec: FrameEncoderCodec;
  readonly container: FrameEncoderContainer;
  readonly inputFormat: FfmpegFrameInputFormat;
  /** PNG: a frame-%06d.png image2 pattern. rawvideo: a single concatenated .raw file path. */
  readonly inputPattern: string;
  readonly outputPath: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly extraArgs: readonly string[];
}): string[] {
  const videoCodec = input.codec === "h264" ? H264_CODEC : VP9_CODEC;
  const args: string[] = ["-y", "-framerate", String(input.frameRate)];

  if (input.inputFormat === "rawvideo") {
    args.push("-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${input.viewport.width}x${input.viewport.height}`);
  }

  args.push("-i", input.inputPattern, "-c:v", videoCodec, "-pix_fmt", "yuv420p");

  if (input.codec === "h264") {
    // +faststart relocates the moov atom for streaming-friendly playback.
    args.push("-movflags", "+faststart");
  } else {
    // VP9: constant-quality with unconstrained bitrate ceiling.
    args.push("-b:v", "0", "-crf", "32");
  }

  args.push(...input.extraArgs, input.outputPath);
  return args;
}

function resolveInputFormat(frames: readonly FrameEncoderFrame[]): FfmpegFrameInputFormat {
  // PNG bytes start with the 8-byte signature 89 50 4E 47 0D 0A 1A 0A.
  let sawPng = false;
  let sawRaw = false;
  for (const frame of frames) {
    if (typeof frame.image === "string") {
      sawPng = true;
      continue;
    }
    if (frame.image instanceof Uint8Array) {
      if (looksLikePng(frame.image)) sawPng = true;
      else sawRaw = true;
      continue;
    }
    if (typeof Blob !== "undefined" && frame.image instanceof Blob) {
      throw new Error("FfmpegFrameEncoder requires PNG bytes (Uint8Array) or raw RGBA buffers; Blob frames are not supported in the Node ffmpeg path.");
    }
    throw new Error("FfmpegFrameEncoder requires each frame.image to be PNG bytes (Uint8Array), a raw RGBA Uint8Array, or a PNG path/data-URL string.");
  }
  if (sawPng && sawRaw) {
    throw new Error("FfmpegFrameEncoder received a mix of PNG and raw RGBA frames; provide a single consistent input format.");
  }
  return sawRaw ? "rawvideo" : "png";
}

function frameBytes(frame: FrameEncoderFrame): Uint8Array | string {
  if (frame.image instanceof Uint8Array) return frame.image;
  if (typeof frame.image === "string") {
    // A data: URL carries base64 PNG bytes; decode it. A bare path string can't
    // be read here (we don't know the caller's fs), so we surface that clearly.
    const dataUrlMatch = /^data:[^;]*;base64,(.*)$/s.exec(frame.image);
    if (dataUrlMatch) {
      return base64ToBytes(dataUrlMatch[1]!);
    }
    throw new Error("FfmpegFrameEncoder string frames must be base64 data URLs; pass PNG bytes as Uint8Array for file-based frames.");
  }
  throw new Error("FfmpegFrameEncoder.frameBytes: unsupported frame image type.");
}

function concatRawFrames(frames: readonly FrameEncoderFrame[]): Uint8Array {
  const buffers = frames.map((frame) => {
    if (!(frame.image instanceof Uint8Array)) {
      throw new Error("FfmpegFrameEncoder rawvideo path requires every frame.image to be a raw RGBA Uint8Array.");
    }
    return frame.image;
  });
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buffer of buffers) {
    out.set(buffer, offset);
    offset += buffer.byteLength;
  }
  return out;
}

function looksLikePng(bytes: Uint8Array): boolean {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function base64ToBytes(base64: string): Uint8Array {
  const globalAtob = (globalThis as unknown as { atob?: (data: string) => string }).atob;
  if (typeof globalAtob === "function") {
    const binary = globalAtob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  const bufferCtor = (globalThis as unknown as { Buffer?: { from(data: string, encoding: string): Uint8Array } }).Buffer;
  if (bufferCtor) return Uint8Array.from(bufferCtor.from(base64, "base64"));
  throw new Error("No base64 decoder (atob/Buffer) is available in this runtime.");
}

function ffmpegFrameByteLength(frame: FrameEncoderFrame): number {
  if (frame.image instanceof Uint8Array) return frame.image.byteLength;
  if (typeof Blob !== "undefined" && frame.image instanceof Blob) return frame.image.size;
  if (typeof frame.image === "string") return frame.image.length;
  return Math.max(1, Math.round(frame.viewport.width * frame.viewport.height * 0.1));
}

function defaultRunFfmpeg(defaultFfmpegPath: string): RunFfmpeg {
  return async ({ args, ffmpegPath }) => {
    const childProcess = await import("node:child_process");
    return await new Promise<FfmpegRunResult>((resolve, reject) => {
      const child = childProcess.spawn(ffmpegPath || defaultFfmpegPath, args);
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
      child.on("error", (error: Error) => reject(error));
      child.on("close", (code: number | null) => resolve({ code: code ?? -1, stdout, stderr }));
    });
  };
}

async function defaultFileSystem(): Promise<FfmpegFileSystem> {
  const [fsPromises, os, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:os"),
    import("node:path")
  ]);
  return {
    mkdtemp: (prefix) => fsPromises.mkdtemp(prefix),
    mkdir: async (dir) => { await fsPromises.mkdir(dir, { recursive: true }); },
    writeFile: (file, data) => fsPromises.writeFile(file, data),
    readFile: async (file) => new Uint8Array(await fsPromises.readFile(file)),
    rm: async (target) => { await fsPromises.rm(target, { force: true, recursive: true }); },
    join: (...parts) => path.join(...parts),
    tmpdir: () => os.tmpdir()
  };
}

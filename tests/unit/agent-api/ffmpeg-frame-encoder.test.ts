import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  createFfmpegFrameEncoderAdapter,
  probeFfmpeg,
  type FfmpegFileSystem,
  type FfmpegRunResult,
  type FrameEncoderFrame,
  type RunFfmpeg
} from "../../../packages/engine/src";

const VIEWPORT = { width: 16, height: 16 };

// 8-byte PNG signature, enough for the adapter's PNG detection heuristic.
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngFrame(frame: number): FrameEncoderFrame {
  return {
    frame,
    time: frame / 30,
    viewport: VIEWPORT,
    image: new Uint8Array([...PNG_SIGNATURE, frame, 1, 2, 3])
  };
}

/** In-memory fake filesystem so unit tests never touch disk. */
function fakeFileSystem(): { fs: FfmpegFileSystem; files: Map<string, Uint8Array | string>; writes: string[] } {
  const files = new Map<string, Uint8Array | string>();
  const writes: string[] = [];
  const fs: FfmpegFileSystem = {
    async mkdtemp(prefix) { return `${prefix}fake`; },
    async mkdir() { /* no-op */ },
    async writeFile(path, data) { files.set(path, data); writes.push(path); },
    async readFile(path) {
      const value = files.get(path);
      if (value === undefined) throw new Error(`fake fs: missing ${path}`);
      return value instanceof Uint8Array ? value : new TextEncoder().encode(value);
    },
    async rm(path) { files.delete(path); },
    join(...parts) { return parts.join("/"); },
    tmpdir() { return "/tmp"; }
  };
  return { fs, files, writes };
}

function ffmpegOnPath(): boolean {
  try {
    return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

describe("FfmpegFrameEncoder", () => {
  it("calls ffmpeg with sane webm/vp9 args and returns the produced bytes", async () => {
    const { fs, files } = fakeFileSystem();
    const recordedArgs: string[][] = [];
    const fakeWebm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x99]);

    const runFfmpeg: RunFfmpeg = async ({ args, outputPath, framePaths, inputFormat }): Promise<FfmpegRunResult> => {
      recordedArgs.push([...args]);
      expect(inputFormat).toBe("png");
      expect(framePaths).toHaveLength(2);
      // Simulate ffmpeg writing a real container to outputPath.
      files.set(outputPath, fakeWebm);
      return { code: 0, stdout: "", stderr: "" };
    };

    const adapter = await createFfmpegFrameEncoderAdapter({
      codec: "vp9",
      frameRate: 30,
      fileSystem: fs,
      runFfmpeg,
      workingDirectory: "/work"
    });

    expect(adapter.kind).toBe("ffmpeg-frame-encoder");
    expect(adapter.proofOnly).toBe(false);
    expect(adapter.outputMode).toBe("encoded-video");
    expect(adapter.capability).toMatchObject({ supported: true, canProducePlayableFile: true, requiresExternalMuxer: true });

    adapter.encode(pngFrame(0));
    adapter.encode(pngFrame(1));

    const output = await adapter.finalize({
      codec: "vp9",
      container: "webm",
      mimeType: "video/webm",
      frameRate: 30,
      viewport: VIEWPORT,
      frameCount: 2,
      duration: 2 / 30,
      byteLength: 16,
      chunks: []
    });

    expect(output).toBeInstanceOf(Uint8Array);
    expect(Array.from(output as Uint8Array)).toEqual(Array.from(fakeWebm));

    const args = recordedArgs[0]!;
    expect(args).toContain("-framerate");
    expect(args).toContain("30");
    expect(args).toContain("-c:v");
    expect(args).toContain("libvpx-vp9");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
    expect(args[args.length - 1]).toMatch(/\.webm$/);
  });

  it("uses libx264 + rawvideo flags for an mp4 from raw RGBA frames", async () => {
    const { fs } = fakeFileSystem();
    const rgba = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4).fill(200);
    let captured: string[] = [];

    const runFfmpeg: RunFfmpeg = async ({ args, outputPath, inputFormat }) => {
      captured = [...args];
      expect(inputFormat).toBe("rawvideo");
      fs.writeFile(outputPath, new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]));
      return { code: 0, stdout: "", stderr: "" };
    };

    const adapter = await createFfmpegFrameEncoderAdapter({
      codec: "h264",
      container: "mp4",
      fileSystem: fs,
      runFfmpeg,
      workingDirectory: "/work"
    });

    adapter.encode({ frame: 0, time: 0, viewport: VIEWPORT, image: rgba });

    const out = await adapter.finalize({
      codec: "h264", container: "mp4", mimeType: "video/mp4", frameRate: 24,
      viewport: VIEWPORT, frameCount: 1, duration: 1 / 24, byteLength: rgba.byteLength, chunks: []
    });

    expect(out).toBeInstanceOf(Uint8Array);
    expect(captured).toContain("libx264");
    expect(captured).toContain("-f");
    expect(captured).toContain("rawvideo");
    expect(captured).toContain("-pixel_format");
    expect(captured).toContain("rgba");
    expect(captured).toContain("-video_size");
    expect(captured).toContain(`${VIEWPORT.width}x${VIEWPORT.height}`);
    expect(captured).toContain("+faststart");
  });

  it("buildFfmpegArgs produces the documented vp9 vector", () => {
    const args = buildFfmpegArgs({
      frameRate: 30, codec: "vp9", container: "webm", inputFormat: "png",
      inputPattern: "/work/frame-%06d.png", outputPath: "/work/out.webm",
      viewport: VIEWPORT, extraArgs: ["-crf", "40"]
    });
    expect(args).toEqual([
      "-y", "-framerate", "30", "-i", "/work/frame-%06d.png",
      "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "0", "-crf", "32",
      "-crf", "40", "/work/out.webm"
    ]);
  });

  it("is proof-only / unsupported when ffmpeg is explicitly unavailable", async () => {
    const adapter = await createFfmpegFrameEncoderAdapter({ supported: false });
    expect(adapter.proofOnly).toBe(true);
    expect(adapter.outputMode).toBe("unsupported");
    expect(adapter.capability).toMatchObject({ supported: false, canProducePlayableFile: false });
    expect(() => adapter.encode(pngFrame(0))).toThrow();
  });

  it("probeFfmpeg reports unsupported for a bogus binary path", async () => {
    const cap = await probeFfmpeg("definitely-not-a-real-ffmpeg-binary-xyz");
    expect(cap.supported).toBe(false);
    expect(cap.reason).toBeTruthy();
  });

  const realFfmpeg = ffmpegOnPath();
  it.runIf(realFfmpeg)("encodes solid-color RGBA frames to a real webm starting with EBML magic", async () => {
    const w = 32;
    const h = 32;
    const adapter = await createFfmpegFrameEncoderAdapter({ codec: "vp9", frameRate: 10 });
    expect(adapter.proofOnly).toBe(false);

    for (let frame = 0; frame < 6; frame += 1) {
      const rgba = new Uint8Array(w * h * 4);
      for (let pixel = 0; pixel < w * h; pixel += 1) {
        rgba[pixel * 4] = frame % 2 === 0 ? 255 : 0;
        rgba[pixel * 4 + 1] = 64;
        rgba[pixel * 4 + 2] = frame % 2 === 0 ? 0 : 255;
        rgba[pixel * 4 + 3] = 255;
      }
      adapter.encode({ frame, time: frame / 10, viewport: { width: w, height: h }, image: rgba });
    }

    const output = await adapter.finalize({
      codec: "vp9", container: "webm", mimeType: "video/webm", frameRate: 10,
      viewport: { width: w, height: h }, frameCount: 6, duration: 0.6, byteLength: 0, chunks: []
    });

    const bytes = output as Uint8Array;
    expect(bytes.byteLength).toBeGreaterThan(64);
    // WebM/Matroska EBML magic: 0x1A 0x45 0xDF 0xA3.
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  }, 60_000);
});

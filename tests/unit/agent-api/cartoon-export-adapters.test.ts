import { describe, expect, it } from "vitest";
import {
  createBrowserFrameCaptureAdapter,
  createInMemoryFrameEncoderAdapter,
  createMediaRecorderFrameEncoderAdapter,
  createPngSequenceEncoderAdapter,
  createPngSequenceManifest,
  createVideoExportPipeline,
  createWebCodecsFrameEncoderAdapter,
  probeMediaRecorderFrameEncoder,
  probeWebCodecsFrameEncoder,
  type CartoonRenderOutputPackageMetadata,
  type CartoonRenderQueueArtifact,
  type FrameEncoderAdapter
} from "../../../packages/engine/src";

const generatedAt = "2026-06-06T00:00:00.000Z";

function renderQueue(): CartoonRenderQueueArtifact {
  return {
    artifact: "render-queue",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "moon-garden-001",
    generatedAt,
    route: "/cartoon-studio",
    language: "en",
    frameRate: 30,
    viewport: { width: 320, height: 180 },
    captureTimes: [0, 1 / 30],
    outputs: [{ id: "webm", kind: "webm", path: "dist/episode.webm", mimeType: "video/webm" }],
    evidenceTargets: [],
    items: [
      {
        id: "frame-0",
        route: "/cartoon-studio",
        language: "en",
        time: 0,
        frame: 0,
        viewport: { width: 320, height: 180 },
        outputIds: ["webm"],
        evidenceTargetIds: []
      },
      {
        id: "frame-1",
        route: "/cartoon-studio",
        language: "en",
        time: 1 / 30,
        frame: 1,
        viewport: { width: 320, height: 180 },
        outputIds: ["webm"],
        evidenceTargetIds: []
      }
    ]
  };
}

function outputPackage(): CartoonRenderOutputPackageMetadata {
  return {
    artifact: "render-output-package",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "moon-garden-001",
    generatedAt,
    packageId: "moon-garden-review-package",
    route: "/cartoon-studio",
    language: "en",
    frameRate: 30,
    duration: 1,
    viewport: { width: 320, height: 180 },
    outputs: {
      webm: { id: "webm", kind: "webm", path: "dist/episode.webm", mimeType: "video/webm", codec: "vp9" },
      captions: [{ id: "captions-vtt", kind: "caption-vtt", path: "dist/captions.vtt" }],
      thumbnail: { id: "thumbnail", kind: "thumbnail", path: "dist/thumbnail.png" }
    },
    requiredOutputKinds: ["webm", "caption-vtt", "thumbnail", "evidence-json"],
    youtubeDraft: {
      title: "Moon Garden Helpers",
      description: "A short Aura3D cartoon package.",
      tags: ["Aura3D", "cartoon"],
      madeForKids: true,
      defaultLanguage: "en",
      privacyStatus: "private"
    },
    thumbnailCapture: {
      id: "thumbnail-capture",
      source: "same-aura3d-scene-state",
      outputId: "thumbnail",
      outputPath: "dist/thumbnail.png",
      route: "/cartoon-studio",
      time: 0.5,
      auraVoiceTimestamp: 0.5,
      frame: 15,
      sourceSceneStateId: "scene-state-15",
      deterministicSeed: "moon-garden-001"
    },
    reviewPackagePaths: {
      video: ["dist/episode.webm"],
      captions: ["dist/captions.vtt"],
      thumbnail: "dist/thumbnail.png",
      evidence: "dist/route-proof.json",
      youtubeDraftMetadata: "dist/metadata.json"
    }
  };
}

function mp4OutputPackage(): CartoonRenderOutputPackageMetadata {
  return {
    ...outputPackage(),
    outputs: {
      mp4: { id: "mp4", kind: "mp4", path: "dist/episode.mp4", mimeType: "video/mp4", codec: "h264" },
      captions: [{ id: "captions-vtt", kind: "caption-vtt", path: "dist/captions.vtt" }],
      thumbnail: { id: "thumbnail", kind: "thumbnail", path: "dist/thumbnail.png" }
    },
    requiredOutputKinds: ["mp4", "caption-vtt", "thumbnail", "evidence-json"],
    reviewPackagePaths: {
      ...outputPackage().reviewPackagePaths,
      video: ["dist/episode.mp4"]
    }
  };
}

function runtime() {
  return {
    seek: () => undefined,
    step: () => undefined,
    captureFrame: (item: CartoonRenderQueueArtifact["items"][number]) => ({
      item,
      image: new Uint8Array([item.frame + 1, 2, 3, 4])
    })
  };
}

function realEncodedAdapter(): FrameEncoderAdapter {
  return {
    kind: "test-real-encoder",
    proofOnly: false,
    outputMode: "encoded-video",
    capability: { supported: true },
    encode(frame) {
      return {
        frame: frame.frame,
        time: frame.time,
        byteLength: 128 + frame.frame,
        keyFrame: frame.frame === 0,
        durationMs: frame.durationMs ?? 1000 / 30
      };
    },
    finalize(summary) {
      return new Uint8Array(Math.max(1, summary.frameCount * 16));
    }
  };
}

describe("cartoon video export adapters", () => {
  it("marks the in-memory encoder as proof-only and rejects it for publish exports", async () => {
    const adapter = createInMemoryFrameEncoderAdapter();

    expect(adapter).toMatchObject({
      kind: "in-memory-frame-encoder",
      proofOnly: true,
      outputMode: "memory-summary"
    });

    const pipeline = createVideoExportPipeline({
      renderQueue: renderQueue(),
      outputPackage: outputPackage(),
      runtime: runtime(),
      encoderAdapter: adapter,
      readinessMode: "publish"
    });

    await expect(pipeline.render()).rejects.toThrow(/proof-only/i);
  });

  it("allows publish exports only when a real adapter returns an encoded artifact", async () => {
    const result = await createVideoExportPipeline({
      renderQueue: renderQueue(),
      outputPackage: outputPackage(),
      runtime: runtime(),
      encoderAdapter: realEncodedAdapter(),
      readinessMode: "publish",
      now: (() => {
        let time = 0;
        return () => time += 16;
      })()
    }).render();

    expect(result.encodedVideo.output).toBeInstanceOf(Uint8Array);
    expect(result.encodedVideo.frameCount).toBe(2);
    expect(result.output).toMatchObject({
      encodedOutputMode: "encoded-video",
      playableEncodedOutput: true
    });
    expect(result.progress.status).toBe("completed");
  });

  it("labels MediaRecorder and WebCodecs adapters with capability metadata", async () => {
    const mediaProbe = probeMediaRecorderFrameEncoder("vp9");
    const webCodecsProbe = probeWebCodecsFrameEncoder("h264");

    expect(mediaProbe).toMatchObject({ supported: false });
    expect(webCodecsProbe).toMatchObject({ supported: false });

    const mediaAdapter = createMediaRecorderFrameEncoderAdapter({ recorderSupported: true });
    const webCodecsAdapter = createWebCodecsFrameEncoderAdapter({ supported: true });

    expect(mediaAdapter).toMatchObject({ kind: "media-recorder-frame-encoder", proofOnly: false, outputMode: "encoded-video" });
    expect(webCodecsAdapter).toMatchObject({ kind: "webcodecs-frame-encoder", proofOnly: false, outputMode: "encoded-chunks" });
    expect(webCodecsAdapter.capability).toMatchObject({
      codec: "h264",
      supported: true,
      supportedCodecs: ["h264", "vp9"],
      supportedContainers: ["mp4"],
      canProducePlayableFile: false,
      requiresExternalMuxer: true
    });

    const chunk = await mediaAdapter.encode({
      frame: 0,
      time: 0,
      viewport: { width: 320, height: 180 },
      image: new Uint8Array([1, 2, 3]),
      durationMs: 33.333
    });
    expect(chunk.byteLength).toBeGreaterThan(0);
    const output = await Promise.resolve(mediaAdapter.finalize({
      codec: "vp9",
      container: "webm",
      mimeType: "video/webm",
      frameRate: 30,
      viewport: { width: 320, height: 180 },
      frameCount: 1,
      duration: 1 / 30,
      byteLength: chunk.byteLength,
      chunks: [chunk]
    }));
    expect(output).toBeTruthy();
  });

  it("does not treat WebCodecs chunks as a playable MP4 without a container writer", async () => {
    const adapter = createWebCodecsFrameEncoderAdapter({
      supported: true,
      outputFactory: () => new Uint8Array([1, 2, 3, 4])
    });

    await expect(createVideoExportPipeline({
      renderQueue: renderQueue(),
      outputPackage: mp4OutputPackage(),
      runtime: runtime(),
      codec: "h264",
      encoderAdapter: adapter,
      readinessMode: "publish"
    }).render()).rejects.toThrow(/playable encoded output artifact; encoded-chunks output is not publish-ready/i);
  });

  it("allows MP4 publish only through an explicitly playable encoder/container adapter", async () => {
    const adapter = createWebCodecsFrameEncoderAdapter({
      supported: true,
      playableOutput: true,
      outputMode: "encoded-video",
      outputFactory: (summary) => new Uint8Array(Math.max(8, summary.frameCount * 4))
    });

    const result = await createVideoExportPipeline({
      renderQueue: renderQueue(),
      outputPackage: mp4OutputPackage(),
      runtime: runtime(),
      codec: "h264",
      encoderAdapter: adapter,
      readinessMode: "publish",
      now: (() => {
        let time = 0;
        return () => time += 16;
      })()
    }).render();

    expect(result.plan).toMatchObject({
      outputPath: "dist/episode.mp4",
      outputMimeType: "video/mp4",
      codec: "h264"
    });
    expect(result.encodedVideo).toMatchObject({
      container: "mp4",
      outputMode: "encoded-video",
      playable: true
    });
    expect(result.output).toMatchObject({
      path: "dist/episode.mp4",
      mimeType: "video/mp4",
      hasEncodedOutput: true,
      playableEncodedOutput: true
    });
  });

  it("keeps PNG sequence fallback explicit unless configured as a scoped publish fallback", async () => {
    const proofFallback = createPngSequenceEncoderAdapter({ directory: "dist/frames", frameRate: 30, viewport: { width: 320, height: 180 } });
    const publishFallback = createPngSequenceEncoderAdapter({
      directory: "dist/frames",
      frameRate: 30,
      viewport: { width: 320, height: 180 },
      publishScopedFallback: true
    });

    expect(proofFallback).toMatchObject({ kind: "png-sequence-encoder", proofOnly: true, outputMode: "png-sequence" });
    expect(publishFallback).toMatchObject({ kind: "png-sequence-encoder", proofOnly: false, outputMode: "png-sequence" });

    const manifest = createPngSequenceManifest({
      frameRate: 30,
      viewport: { width: 320, height: 180 },
      frames: [],
      publishScopedFallback: false
    });
    expect(manifest).toMatchObject({ proofOnly: true, publishScopedFallback: false });
  });

  it("captures browser frames at explicit route time instead of using a still-image shortcut", async () => {
    let navigatedUrl = "";
    let evaluatedTime: unknown;
    const adapter = createBrowserFrameCaptureAdapter({
      page: {
        async goto(url) {
          navigatedUrl = url;
        },
        async setViewportSize() {},
        async waitForSelector() {},
        async evaluate<T>(fn: (...args: unknown[]) => T | Promise<T>, value: unknown): Promise<T> {
          evaluatedTime = value;
          return await fn(value);
        },
        locator() {
          return {
            first() {
              return {
                async screenshot() {
                  return new Uint8Array([7, 8, 9]);
                }
              };
            }
          };
        }
      }
    });

    const item = renderQueue().items[1]!;
    const capture = await adapter.capture({
      route: item.route,
      item,
      viewport: item.viewport
    });

    expect(navigatedUrl).toContain("auraFrameTime=0.033");
    expect(evaluatedTime).toBe(item.time);
    expect(capture.image).toBeInstanceOf(Uint8Array);
  });
});

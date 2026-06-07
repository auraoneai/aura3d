import { describe, expect, it } from "vitest";
import {
  createAudioDrivenVisemeTrack,
  createAudioMuxer,
  createCameraPathFromPreset,
  createEpisodeStructure,
  createFrameEncoder,
  createPublishPackage,
  createRenderProgressTracker,
  createSceneSequencer,
  createShotTimeline,
  createThumbnailArtifact,
  createVisemeTimelineTrack,
  exportCaptionTrackSrt,
  sampleCameraPath,
  sampleSceneSequencer,
  sampleVisemeTimelineTrack,
  type CaptionTrackArtifact,
  type CartoonRenderOutputPackageMetadata,
  type EncodedVideoArtifact
} from "../../../packages/engine/src/agent-api/index";

describe("Aura3D 1.0.7 agent-api production artifacts", () => {
  it("encodes frame summaries, muxes audio stems, and tracks render progress", async () => {
    const progress = createRenderProgressTracker({ totalFrames: 2, now: fixedNow([0, 16, 32, 48]) });
    expect(progress.start().progress).toBe(0);
    expect(progress.advance({ frame: 0, time: 0 }).completedFrames).toBe(1);

    const encoder = createFrameEncoder({
      frameRate: 24,
      viewport: { width: 1280, height: 720 },
      codec: "vp9"
    });
    await encoder.encodeFrame({ frame: 0, time: 0, viewport: { width: 1280, height: 720 }, image: new Uint8Array([1, 2, 3]) });
    await encoder.encodeFrame({ frame: 1, time: 1 / 24, viewport: { width: 1280, height: 720 }, image: new Uint8Array([4, 5]) });
    const encoded = await encoder.finalize();
    expect(encoded.frameCount).toBe(2);
    expect(encoded.byteLength).toBe(5);

    const muxed = await createAudioMuxer().mux(encoded, [
      { id: "voice", role: "dialogue", path: "line.wav", startTime: 0, duration: 1, source: new Uint8Array([9]) }
    ]);
    expect(muxed.audioTrackCount).toBe(1);
    expect(muxed.muxPlan.maxSyncDriftFrames).toBe(0);
  });

  it("analyzes audio into visemes and allows manual timeline overrides", () => {
    const track = createAudioDrivenVisemeTrack({
      episodeId: "episode",
      characterId: "hero",
      language: "en",
      frameRate: 10,
      sampleRate: 10,
      samples: new Float32Array([0, 0, 0.7, 0.75, 0.1, 0])
    });
    expect(track.cues.length).toBeGreaterThan(1);
    expect(track.cues.every((cue) => cue.id && cue.mouthOpenness >= 0 && cue.weight >= 0)).toBe(true);

    const timeline = createVisemeTimelineTrack({
      episodeId: "episode",
      language: "en",
      frameRate: 10,
      sourceTrack: track,
      manualEdits: [
        {
          id: "manual-open",
          cue: {
            id: "manual-open-cue",
            characterId: "hero",
            startTime: 0.2,
            endTime: 0.4,
            visemeId: "aa",
            mouthOpenness: 1,
            weight: 1
          }
        }
      ]
    });
    expect(sampleVisemeTimelineTrack(timeline, 0.25, "hero").visemeId).toBe("aa");
  });

  it("samples sequenced scenes, camera paths, captions, thumbnails, and publishing readiness", async () => {
    const timeline = createShotTimeline({
      episodeId: "episode",
      frameRate: 24,
      shots: [
        {
          id: "shot-1",
          shotId: "shot-1",
          sceneId: "scene-1",
          startTime: 0,
          endTime: 1,
          transitionOut: "fade",
          camera: { move: "static" },
          characters: [{ characterId: "hero", action: "speak" }],
          captureTimes: [0, 0.5, 1]
        },
        {
          id: "shot-2",
          shotId: "shot-2",
          sceneId: "scene-1",
          startTime: 1,
          endTime: 2,
          camera: { move: "static" },
          characters: [{ characterId: "hero", action: "idle" }],
          captureTimes: [1.5, 2]
        }
      ]
    });
    const episode = createEpisodeStructure({
      episodeId: "episode",
      title: "Moon Garden",
      metadata: { title: "Moon Garden", runtime: 2, characterIds: ["hero"] },
      acts: [
        {
          actId: "act-1",
          title: "Act 1",
          startTime: 0,
          endTime: 2,
          scenes: [
            {
              sceneId: "scene-1",
              title: "Garden",
              startTime: 0,
              endTime: 2,
              characterIds: ["hero"],
              shotRefs: [
                { shotId: "shot-1", startTime: 0, endTime: 1 },
                { shotId: "shot-2", startTime: 1, endTime: 2 }
              ]
            }
          ]
        }
      ]
    });
    const sequencer = createSceneSequencer({ episode, timeline });
    expect(sampleSceneSequencer(sequencer, 1.01).shot?.shotId).toBe("shot-2");

    const cameraPath = createCameraPathFromPreset({ id: "camera", presetId: "close-up", startTime: 0, endTime: 1 });
    expect(sampleCameraPath(cameraPath, 0.5).fov).toBe(32);

    const captions: CaptionTrackArtifact = {
      artifact: "caption-track",
      contractId: "auravoice-aura3d-prompt-animation/v1",
      episodeId: "episode",
      language: "en",
      cues: [{ captionId: "cap-1", text: "Hello moon.", language: "en", startTime: 0, endTime: 1, lineSafe: true }]
    };
    expect(exportCaptionTrackSrt(captions)).toContain("00:00:00,000 --> 00:00:01,000");

    const outputPackage = createOutputPackage();
    expect(createThumbnailArtifact({
      path: outputPackage.outputs.thumbnail!.path,
      viewport: outputPackage.viewport,
      time: outputPackage.thumbnailCapture.time
    }).plan.width).toBe(1920);
    const publishing = createPublishPackage({ outputPackage, captions, video: createMuxedVideo() });
    expect(publishing.ok).toBe(true);
  });
});

function fixedNow(values: readonly number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

function createOutputPackage(): CartoonRenderOutputPackageMetadata {
  return {
    artifact: "render-output-package",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "episode",
    packageId: "package",
    route: "/episode",
    language: "en",
    frameRate: 24,
    duration: 2,
    viewport: { width: 1920, height: 1080 },
    outputs: {
      mp4: { id: "mp4", kind: "mp4", path: "dist/episode.mp4" },
      webm: { id: "webm", kind: "webm", path: "dist/episode.webm" },
      captions: [{ id: "vtt", kind: "caption-vtt", path: "dist/captions.vtt" }],
      thumbnail: { id: "thumb", kind: "thumbnail", path: "dist/thumb.webp" },
      evidenceJson: { id: "evidence", kind: "evidence-json", path: "dist/evidence.json" },
      youtubeMetadata: { id: "youtube", kind: "youtube-metadata", path: "dist/youtube.json" }
    },
    requiredOutputKinds: ["mp4", "webm", "thumbnail", "evidence-json", "youtube-metadata"],
    youtubeDraft: { title: "Moon Garden", defaultLanguage: "en", madeForKids: true },
    thumbnailCapture: {
      id: "thumb-capture",
      source: "same-aura3d-scene-state",
      outputId: "thumb",
      outputPath: "dist/thumb.webp",
      route: "/episode",
      time: 1,
      auraVoiceTimestamp: 1,
      frame: 24,
      sourceSceneStateId: "state",
      deterministicSeed: "seed"
    },
    reviewPackagePaths: {
      video: ["dist/episode.mp4"],
      captions: ["dist/captions.vtt"],
      thumbnail: "dist/thumb.webp",
      evidence: "dist/evidence.json",
      youtubeDraftMetadata: "dist/youtube.json"
    }
  };
}

function createMuxedVideo(): ReturnType<ReturnType<typeof createAudioMuxer>["mux"]> extends Promise<infer TValue> ? TValue : never {
  const encoded: EncodedVideoArtifact = {
    kind: "encoded-video",
    codec: "vp9",
    container: "webm",
    mimeType: "video/webm",
    frameRate: 24,
    viewport: { width: 1920, height: 1080 },
    frameCount: 2,
    duration: 2,
    byteLength: 10,
    chunks: []
  };
  return {
    kind: "muxed-video",
    container: "webm",
    mimeType: "video/webm",
    duration: 2,
    video: encoded,
    muxPlan: {
      kind: "audio-mux-plan",
      container: "webm",
      videoDuration: 2,
      frameRate: 24,
      frameDuration: 1 / 24,
      tracks: [],
      maxSyncDriftSeconds: 0,
      maxSyncDriftFrames: 0
    },
    audioTrackCount: 0,
    byteLength: 10
  };
}

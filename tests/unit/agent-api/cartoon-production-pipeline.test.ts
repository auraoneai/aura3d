import { describe, expect, it } from "vitest";
import {
  AssetLibraryBrowser,
  createAudioDrivenVisemeTrack,
  createAudioMuxer,
  createCameraPathFromPreset,
  createEpisodeStructure,
  createFrameEncoder,
  createPublishPackage,
  createSceneSequencer,
  createShotCompositionGuide,
  createShotTransitionPlan,
  createThumbnailArtifact,
  createVideoExportPipeline,
  createVisemeTimelineTrack,
  createWaveformVisualization,
  defineCaptionTrack,
  defineCartoonAssetManifest,
  exportCaptionTrackSrt,
  exportCaptionTrackVtt,
  sampleCameraPath,
  sampleSceneSequencer,
  sampleShotTransition,
  sampleVisemeTimelineTrack,
  type CartoonRenderOutputPackageMetadata,
  type CartoonRenderQueueArtifact,
  type ShotTimelineArtifact
} from "../../../packages/engine/src";

const generatedAt = "2026-06-06T00:00:00.000Z";

function renderQueue(): CartoonRenderQueueArtifact {
  return {
    artifact: "render-queue",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "episode-1",
    generatedAt,
    route: "/cartoon",
    language: "en",
    frameRate: 30,
    viewport: { width: 320, height: 180 },
    captureTimes: [0, 1 / 30],
    outputs: [{ id: "webm", kind: "webm", path: "dist/episode.webm", mimeType: "video/webm" }],
    evidenceTargets: [],
    items: [
      {
        id: "frame-0",
        route: "/cartoon",
        language: "en",
        time: 0,
        frame: 0,
        viewport: { width: 320, height: 180 },
        outputIds: ["webm"],
        evidenceTargetIds: []
      },
      {
        id: "frame-1",
        route: "/cartoon",
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
    episodeId: "episode-1",
    generatedAt,
    packageId: "package-1",
    route: "/cartoon",
    language: "en",
    frameRate: 30,
    duration: 1,
    viewport: { width: 320, height: 180 },
    outputs: {
      webm: { id: "webm", kind: "webm", path: "dist/episode.webm", mimeType: "video/webm" },
      captions: [{ id: "captions", kind: "caption-vtt", path: "dist/captions.vtt" }],
      thumbnail: { id: "thumbnail", kind: "thumbnail", path: "dist/thumb.png" }
    },
    requiredOutputKinds: ["webm", "caption-vtt", "thumbnail", "youtube-metadata"],
    youtubeDraft: {
      title: "Moon Garden",
      description: "A tiny Aura3D cartoon.",
      tags: ["Aura3D", "cartoon"],
      madeForKids: true,
      defaultLanguage: "en",
      privacyStatus: "private"
    },
    thumbnailCapture: {
      id: "thumb-capture",
      source: "same-aura3d-scene-state",
      outputId: "thumbnail",
      outputPath: "dist/thumb.png",
      route: "/cartoon",
      time: 0.5,
      auraVoiceTimestamp: 0.5,
      frame: 15,
      sourceSceneStateId: "scene-state-15",
      deterministicSeed: "episode-1"
    },
    reviewPackagePaths: {
      video: ["dist/episode.webm"],
      captions: ["dist/captions.vtt"],
      thumbnail: "dist/thumb.png",
      evidence: "dist/evidence.json",
      youtubeDraftMetadata: "dist/youtube.json"
    }
  };
}

function shotTimeline(): ShotTimelineArtifact {
  return {
    artifact: "shot-timeline",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "episode-1",
    generatedAt,
    frameRate: 30,
    duration: 2,
    shots: [
      {
        id: "shot-1",
        shotId: "shot-1",
        sceneId: "garden",
        startTime: 0,
        endTime: 1,
        transitionOut: "fade",
        camera: { move: "static", position: [0, 2, 4], target: [0, 1, 0] },
        characters: [],
        captureTimes: [0, 0.5],
        intent: "Establish the garden."
      },
      {
        id: "shot-2",
        shotId: "shot-2",
        sceneId: "garden",
        startTime: 1,
        endTime: 2,
        transitionIn: "fade",
        camera: { move: "push-in", from: [0, 2, 4], to: [0, 1.8, 2.8], target: [0, 1, 0] },
        characters: [],
        captureTimes: [1.5],
        intent: "Push in on the hero."
      }
    ]
  };
}

describe("cartoon production pipeline APIs", () => {
  it("encodes frames, muxes audio, and assembles a publish package", async () => {
    const queue = renderQueue();
    const outputs = outputPackage();
    const pipeline = createVideoExportPipeline({
      renderQueue: queue,
      outputPackage: outputs,
      runtime: {
        captureFrame: (item) => ({
          item,
          image: new Uint8Array([item.frame, 1, 2, 3])
        })
      },
      audioStems: [{
        id: "music",
        role: "music",
        path: "music.ogg",
        startTime: 0,
        duration: 1,
        source: new Uint8Array([1, 2, 3])
      }],
      now: (() => {
        let time = 0;
        return () => time += 16;
      })()
    });

    const result = await pipeline.render();

    expect(result.plan).toMatchObject({ frameCount: 2, audioStemCount: 1, outputPath: "dist/episode.webm" });
    expect(result.encodedVideo.frameCount).toBe(2);
    expect(result.muxedVideo.audioTrackCount).toBe(1);
    expect(result.progress.status).toBe("completed");

    const captions = defineCaptionTrack({
      artifact: "caption-track",
      contractId: "auravoice-aura3d-prompt-animation/v1",
      episodeId: "episode-1",
      generatedAt,
      language: "en",
      cues: [{
        captionId: "caption-1",
        text: "Hello moon garden.",
        language: "en",
        startTime: 0,
        endTime: 1,
        lineSafe: true
      }]
    });
    const publish = createPublishPackage({ video: result.muxedVideo, captions, outputPackage: outputs });

    expect(exportCaptionTrackVtt(captions)).toContain("WEBVTT");
    expect(exportCaptionTrackSrt(captions)).toContain("00:00:00,000");
    expect(publish.ok).toBe(true);
    expect(publish.thumbnail.plan).toMatchObject({ outputPath: "dist/thumb.png", width: 320, height: 180 });
    expect(publish.youtube).toMatchObject({ title: "Moon Garden", madeForKids: true });
  });

  it("creates waveform, viseme, sequencer, camera, and asset-library evidence", () => {
    const waveform = createWaveformVisualization(
      [
        { min: -0.5, max: 0.6, rms: 0.4 },
        { min: -0.1, max: 0.2, rms: 0.15 }
      ],
      { width: 200, height: 64 }
    );
    expect(waveform.pointCount).toBe(2);

    const visemeTrack = createAudioDrivenVisemeTrack({
      episodeId: "episode-1",
      characterId: "hero",
      language: "en",
      frameRate: 30,
      sampleRate: 30,
      samples: new Float32Array([0, 0.2, 0.7, 0.1])
    });
    const edited = createVisemeTimelineTrack({
      episodeId: "episode-1",
      language: "en",
      frameRate: 30,
      sourceTrack: visemeTrack,
      manualEdits: [{
        id: "edit-1",
        cue: {
          id: "manual-oh",
          characterId: "hero",
          startTime: 0.1,
          endTime: 0.2,
          visemeId: "oh",
          mouthOpenness: 0.8,
          weight: 1
        },
        reason: "Manual waveform correction."
      }]
    });
    expect(edited.manualEdits).toHaveLength(1);
    expect(sampleVisemeTimelineTrack(edited, 0.15, "hero").visemeId).toBe("oh");

    const structure = createEpisodeStructure({
      episodeId: "episode-1",
      metadata: { title: "Moon Garden", runtime: 2, characterIds: ["hero"] },
      acts: [{
        actId: "act-1",
        title: "Act 1",
        startTime: 0,
        endTime: 2,
        scenes: [{
          sceneId: "garden",
          title: "Garden",
          startTime: 0,
          endTime: 2,
          characterIds: ["hero"],
          shotRefs: [{ shotId: "shot-1", startTime: 0, endTime: 1 }, { shotId: "shot-2", startTime: 1, endTime: 2 }]
        }]
      }]
    });
    const sequencer = createSceneSequencer({ timeline: shotTimeline(), episode: structure });
    expect(sampleSceneSequencer(sequencer, 1.2).shot?.shotId).toBe("shot-2");
    expect(sampleShotTransition(createShotTransitionPlan({ timeline: shotTimeline() }), 1)).toMatchObject({ fromOpacity: 0, toOpacity: 1 });

    const camera = createCameraPathFromPreset({ id: "camera", presetId: "close-up", startTime: 0, endTime: 2 });
    expect(sampleCameraPath(camera, 1).fov).toBe(32);
    expect(createShotCompositionGuide("rule-of-thirds").lines).toHaveLength(4);
    expect(createThumbnailArtifact({ path: "thumb.png", viewport: { width: 1280, height: 720 }, time: 1 }).checksum).toMatch(/^thumb-/);

    const browser = new AssetLibraryBrowser(defineCartoonAssetManifest([
      {
        id: "hero",
        kind: "character",
        assetId: "assets.hero",
        style: "rounded cartoon",
        license: "CC0",
        lipSyncReady: true,
        animationClips: ["Idle", "Talk"],
        sourcePage: "https://kenney.nl/assets",
        attribution: "Kenney",
        materialPreview: { materialCount: 2, swatches: ["#f6c177", "#31748f"], celShadingReady: true },
        metadata: { role: "hero", provenanceVerified: true }
      },
      { id: "park", kind: "set", assetId: "assets.park", style: "rounded cartoon", license: "CC0" }
    ]));
    expect(browser.setFilter({ kind: "character", lipSyncReady: true })).toMatchObject({ total: 2, visible: 1 });
    expect(browser.select("hero").selectedId).toBe("hero");
    expect(browser.detail()).toMatchObject({
      kind: "asset-library-detail",
      animationPreview: { clips: ["Idle", "Talk"], previewable: true },
      materialPreview: { materialCount: 2, celShadingReady: true },
      metadata: { license: "CC0", attribution: "Kenney", role: "hero", provenanceVerified: true }
    });
  });

  it("exposes standalone frame encoder and muxer contracts", async () => {
    const encoder = createFrameEncoder({ frameRate: 24, viewport: { width: 64, height: 64 } });
    await encoder.encodeFrame({ frame: 0, time: 0, viewport: { width: 64, height: 64 }, image: "frame" });
    const encoded = await encoder.finalize();
    const muxed = await createAudioMuxer().mux(encoded, [], 24);

    expect(encoded).toMatchObject({ frameCount: 1, container: "webm" });
    expect(muxed).toMatchObject({ audioTrackCount: 0, container: "webm" });
  });
});

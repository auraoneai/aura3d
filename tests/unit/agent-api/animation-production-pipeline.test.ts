import { describe, expect, it } from "vitest";
import {
  AssetLibraryBrowser,
  analyzeAudioVisemes,
  createAnimationDirectorPlan,
  createAnimationPerformance,
  createAnimationPerformanceCoverage,
  createAnimationRenderOutputPackageMetadata,
  createAnimationRenderQueue,
  createAudioDrivenVisemeTrack,
  createAudioMuxer,
  createCameraPathFromPreset,
  createEpisodeStructure,
  createFrameEncoder,
  createPerformanceCaptureSession,
  createPublishPackage,
  createPromptAnimationEpisodePlan,
  createPromptAnimationEpisodeReadiness,
  createPublishingPackage,
  createSceneSequencer,
  createSceneSequencerPlayback,
  createShotCompositionGuide,
  createShotTransitionPlan,
  createThumbnailArtifact,
  createVideoExportPipeline,
  createVisemeTimelineTrack,
  createWaveformVisualization,
  defineCaptionTrack,
  defineAuraAssets,
  defineAnimationAssetManifest,
  exportCaptionTrackSrt,
  exportCaptionTrackVtt,
  sampleCameraPath,
  sampleSceneSequencer,
  sampleShotTransition,
  sampleVisemeTimelineTrack,
  validateAnimationRenderQueue,
  validateAnimationAssetManifest,
  validatePerformanceCaptureCapability,
  validatePromptAnimationEpisodeReadiness,
  type AnimationRenderOutputPackageMetadata,
  type AnimationRenderQueueArtifact,
  type ShotTimelineArtifact
} from "../../../packages/engine/src";

const generatedAt = "2026-06-06T00:00:00.000Z";
const typedAssets = defineAuraAssets({
  miko: { type: "model", format: "glb", url: "/aura-assets/miko.glb" }
});

function renderQueue(): AnimationRenderQueueArtifact {
  return {
    artifact: "render-queue",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "episode-1",
    generatedAt,
    route: "/animation",
    language: "en",
    frameRate: 30,
    viewport: { width: 320, height: 180 },
    captureTimes: [0, 1 / 30],
    outputs: [{ id: "webm", kind: "webm", path: "dist/episode.webm", mimeType: "video/webm" }],
    evidenceTargets: [],
    items: [
      {
        id: "frame-0",
        route: "/animation",
        language: "en",
        time: 0,
        frame: 0,
        viewport: { width: 320, height: 180 },
        outputIds: ["webm"],
        evidenceTargetIds: []
      },
      {
        id: "frame-1",
        route: "/animation",
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

function outputPackage(): AnimationRenderOutputPackageMetadata {
  return {
    artifact: "render-output-package",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "episode-1",
    generatedAt,
    packageId: "package-1",
    route: "/animation",
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
      description: "A tiny Aura3D animation.",
      tags: ["Aura3D", "animation"],
      madeForKids: true,
      defaultLanguage: "en",
      privacyStatus: "private"
    },
    thumbnailCapture: {
      id: "thumb-capture",
      source: "same-aura3d-scene-state",
      outputId: "thumbnail",
      outputPath: "dist/thumb.png",
      route: "/animation",
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

describe("animation production pipeline APIs", () => {
  it("distinguishes source, preview, render, and publish readiness in episode plans", () => {
    const sourceOnly = createPromptAnimationEpisodeReadiness({
      assetMode: "source-only",
      motionMode: "source-only",
      renderOutputMode: "source-only",
      reviewStatus: "not-reviewed",
      publishTarget: "none"
    });
    const publishReady = createPromptAnimationEpisodeReadiness({
      assetMode: "typed-assets",
      motionMode: "performance-driven",
      renderOutputMode: "publish-ready",
      reviewStatus: "approved",
      publishTarget: "youtube"
    });

    expect(sourceOnly).toMatchObject({
      status: "source-only",
      sourceOnlyAcceptedAsPublishProof: false,
      requiresHumanReview: true
    });
    expect(publishReady).toMatchObject({
      status: "publish-ready",
      sourceOnlyAcceptedAsPublishProof: false,
      requiresHumanReview: false
    });
    expect(validatePromptAnimationEpisodeReadiness(sourceOnly)).toEqual([]);
    expect(validatePromptAnimationEpisodeReadiness({
      ...sourceOnly,
      status: "publish-ready"
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "readiness-publish-output-mode" }),
      expect.objectContaining({ code: "readiness-publish-review" }),
      expect.objectContaining({ code: "readiness-publish-assets" }),
      expect.objectContaining({ code: "readiness-publish-motion" })
    ]));
  });

  it("builds director plans with asset slots, motion requirements, render package, and review gates", () => {
    const plan = createAnimationDirectorPlan({
      episodeId: "episode-1",
      title: "Moon Garden",
      prompt: "Two helpers fix moon flowers.",
      language: "en",
      runtime: { duration: 4, frameRate: 24, resolution: { width: 1280, height: 720 }, maxTimingDriftFrames: 1 },
      characters: [
        { id: "miko", name: "Miko", asset: typedAssets.miko },
        { id: "luma", name: "Luma" }
      ],
      locations: [{ id: "garden", name: "Moon Garden" }],
      beats: [{
        id: "beat-1",
        locationId: "garden",
        summary: "Miko explains the glowing flower.",
        visualIntent: "Wide two-shot with a gentle push-in.",
        characters: ["miko", "luma"],
        dialogue: [{ speakerId: "miko", text: "The moon flowers need a tiny spark.", emotion: "curious" }]
      }]
    });

    expect(plan.renderOutputPackage).toMatchObject({ artifact: "render-output-package", packageId: "episode-1:render-package" });
    expect(plan.assetSlots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "miko", kind: "character", readiness: "typed-asset" }),
      expect.objectContaining({ id: "luma", kind: "character", readiness: "primitive-fallback" })
    ]));
    expect(plan.motionRequirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "camera", targetId: "shot-1" }),
      expect.objectContaining({ kind: "mouth", targetId: "miko" })
    ]));
    expect(plan.reviewGates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "encoded-video", required: true, status: "pending" }),
      expect.objectContaining({ id: "human-review", required: true, status: "pending" })
    ]));
  });

  it("creates render queues with frame lists, output targets, thumbnail frame, and evidence frames", () => {
    const episodePlan = createPromptAnimationEpisodePlan({
      episodeId: "episode-1",
      title: "Moon Garden",
      language: "en",
      runtime: { duration: 2, frameRate: 30, resolution: { width: 1280, height: 720 } },
      characters: [],
      locations: []
    });
    const queue = createAnimationRenderQueue({
      episodePlan,
      shotTimeline: shotTimeline(),
      route: "/animation"
    });
    const outputPackageMetadata = createAnimationRenderOutputPackageMetadata({
      episodePlan,
      shotTimeline: shotTimeline(),
      renderQueue: queue
    });

    expect(queue).toMatchObject({
      seekMode: "timeline-time",
      frameList: expect.any(Array),
      outputTargets: expect.arrayContaining([expect.objectContaining({ kind: "webm", path: "dist/render/episode.webm" })]),
      thumbnailFrame: queue.items[0]?.frame,
      evidenceFrames: queue.items.map((item) => item.frame)
    });
    expect(validateAnimationRenderQueue(queue)).toEqual([]);
    expect(outputPackageMetadata.thumbnailCapture.source).toBe("same-aura3d-scene-state");
  });

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
    expect(result.output).toMatchObject({
      path: "dist/episode.webm",
      byteLength: expect.any(Number),
      frameCount: 2,
      duration: expect.any(Number),
      hasEncodedOutput: false,
      hasMuxedOutput: false
    });
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
    expect(exportCaptionTrackVtt(captions)).toContain("caption-1");
    expect(publish.ok).toBe(true);
    expect(publish.thumbnail.plan).toMatchObject({ outputPath: "dist/thumb.png", width: 320, height: 180 });
    expect(publish.youtube).toMatchObject({ title: "Moon Garden", madeForKids: true });

    const publishing = await createPublishingPackage({
      outputPackage: outputs,
      captions,
      videoResult: result,
      thumbnailRuntime: {
        captureThumbnail: () => new Uint8Array([9, 8, 7, 6])
      }
    });

    expect(publishing.readiness).toMatchObject({ status: "pass" });
    expect(publishing.videoByteLength).toBeGreaterThan(0);
    expect(publishing.captions.every((caption) => caption.byteLength > 0 && caption.checksum.startsWith("caption-"))).toBe(true);
    expect(publishing.thumbnail).toMatchObject({ path: "dist/thumb.png", byteLength: 4 });
    expect(publishing.routeProofPath).toBe("dist/render/route-proof.json");
    expect(publishing.provenancePath).toBe("dist/render/asset-provenance.json");
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
    expect(analyzeAudioVisemes({
      episodeId: "episode-1",
      characterId: "hero",
      language: "en",
      frameRate: 30,
      sampleRate: 30,
      samples: new Float32Array([0, 0.2, 0.7, 0.1])
    })).toMatchObject({
      analysisKind: "amplitude-only",
      phonemeAlignmentPresent: false,
      manualCorrectionRecommended: true
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
    const playback = createSceneSequencerPlayback(sequencer);
    expect(playback.play()).toMatchObject({ status: "playing" });
    expect(playback.step(1.25).shot?.shotId).toBe("shot-2");
    expect(playback.pause()).toMatchObject({ status: "paused" });
    expect(playback.scrub(0.2).shot?.shotId).toBe("shot-1");
    expect(playback.jumpToShot("shot-2")).toMatchObject({ shot: expect.objectContaining({ shotId: "shot-2" }) });

    const camera = createCameraPathFromPreset({ id: "camera", presetId: "close-up", startTime: 0, endTime: 2 });
    expect(sampleCameraPath(camera, 1).fov).toBe(32);
    const presetSamples = [
      createCameraPathFromPreset({ id: "static", presetId: "establishing", startTime: 0, endTime: 1 }),
      createCameraPathFromPreset({ id: "push-in", presetId: "close-up", startTime: 0, endTime: 1 }),
      createCameraPathFromPreset({ id: "dolly", presetId: "dolly-zoom", startTime: 0, endTime: 1 }),
      createCameraPathFromPreset({ id: "pan", presetId: "pan", startTime: 0, endTime: 1 }),
      createCameraPathFromPreset({ id: "close-up", presetId: "close-up", startTime: 0, endTime: 1 }),
      createCameraPathFromPreset({ id: "two-shot", presetId: "two-shot", startTime: 0, endTime: 1 })
    ].map((path) => ({ id: path.id, sample: sampleCameraPath(path, 0.5) }));
    expect(presetSamples.map((sample) => sample.id)).toEqual(["static", "push-in", "dolly", "pan", "close-up", "two-shot"]);
    expect(presetSamples.every((entry) => entry.sample.position.length === 3 && entry.sample.target.length === 3)).toBe(true);
    expect(createShotCompositionGuide("rule-of-thirds").lines).toHaveLength(4);
    expect(createThumbnailArtifact({ path: "thumb.png", viewport: { width: 1280, height: 720 }, time: 1 }).checksum).toMatch(/^thumb-/);

    const manifest = defineAnimationAssetManifest([
      {
        id: "hero",
        kind: "character",
        assetId: "assets.hero",
        style: "rounded animation",
        license: "CC0",
        lipSyncReady: true,
        animationClips: ["Idle", "Talk"],
        sourcePage: "https://kenney.nl/assets",
        attribution: "Kenney",
        materialPreview: { materialCount: 2, swatches: ["#f6c177", "#31748f"], celShadingReady: true },
        metadata: { role: "hero", provenanceVerified: true }
      },
      { id: "park", kind: "set", assetId: "assets.park", style: "rounded animation", license: "CC0" }
    ]);
    const browser = new AssetLibraryBrowser(manifest);
    expect(browser.setFilter({ kind: "character", lipSyncReady: true })).toMatchObject({ total: 2, visible: 1 });
    expect(browser.select("hero").selectedId).toBe("hero");
    expect(browser.editorReference()).toMatchObject({
      kind: "aura-asset-ref",
      id: "hero",
      source: "assets.hero",
      license: "CC0",
      category: "character",
      clips: ["Idle", "Talk"],
      lipSyncReady: true
    });
    expect(browser.marketplaceSnapshot()).toMatchObject({
      kind: "asset-library-marketplace-browser",
      sourceCount: 1,
      offlineCatalogOnly: true,
      externalServicesIntegrated: false,
      visibleAssetIds: ["hero"]
    });
    expect(manifest.readiness).toMatchObject({
      characterCount: 1,
      setCount: 1,
      lipSyncReadyCount: 1,
      typedAssetReferenceCount: 2,
      issues: []
    });
    expect(validateAnimationAssetManifest(manifest)).toEqual([]);
    expect(validateAnimationAssetManifest(defineAnimationAssetManifest([
      { id: "bad", kind: "character", assetId: "bad.glb", style: "flat", license: "" }
    ]))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "animation-asset-typed-reference-missing" }),
      expect.objectContaining({ code: "animation-asset-license-missing" }),
      expect.objectContaining({ code: "animation-character-mouth-readiness-missing" })
    ]));
    expect(browser.detail()).toMatchObject({
      kind: "asset-library-detail",
      animationPreview: { clips: ["Idle", "Talk"], previewable: true },
      materialPreview: { materialCount: 2, celShadingReady: true },
      metadata: { license: "CC0", attribution: "Kenney", role: "hero", provenanceVerified: true }
    });
  });

  it("captures manual, webcam, and motion-capture performance as honest source-level contracts", () => {
    expect(validatePerformanceCaptureCapability({
      kind: "webcam",
      available: false,
      permission: "unknown",
      supportedSignals: ["face", "gaze"]
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "performance-capture-source-unavailable" }),
      expect.objectContaining({ code: "performance-capture-permission-required" })
    ]));

    const webcam = createPerformanceCaptureSession({
      id: "webcam-session",
      episodeId: "episode-1",
      characterId: "hero",
      frameRate: 24,
      source: {
        kind: "webcam",
        available: true,
        permission: "granted",
        supportedSignals: ["face", "gaze"],
        provider: "browser-user-media"
      }
    });
    webcam.start();
    webcam.recordSample({
      id: "face-0",
      characterId: "hero",
      time: 0,
      facial: { mouth: "open", eyeOpen: 0.9 },
      gaze: { mode: "camera", intensity: 0.8 },
      confidence: 0.92,
      sourceFrameId: "camera-frame-0"
    });
    const webcamSnapshot = webcam.stop();
    expect(webcamSnapshot).toMatchObject({
      kind: "performance-capture-session",
      source: { kind: "webcam" },
      sampleCount: 1,
      requiresRuntimeDevicePermission: true,
      externalServiceIntegrated: false,
      evidence: { webcamCaptureContract: true, performanceDriven: true }
    });
    expect(webcam.toPerformanceArtifact().cues[0]).toMatchObject({
      characterId: "hero",
      action: "react",
      facial: { mouth: "open" }
    });

    const mocap = createPerformanceCaptureSession({
      id: "mocap-session",
      episodeId: "episode-1",
      characterId: "hero",
      frameRate: 30,
      source: {
        kind: "motion-capture",
        available: true,
        permission: "granted",
        supportedSignals: ["body", "hands"],
        provider: "manual-test-provider"
      }
    });
    mocap.start();
    mocap.recordSample({
      id: "body-0",
      characterId: "hero",
      time: 0,
      body: { posture: "lean-forward", armPose: "waving", energy: 0.7 },
      confidence: 0.88
    });
    expect(mocap.snapshot()).toMatchObject({
      evidence: { motionCaptureContract: true, performanceDriven: true },
      averageConfidence: 0.88
    });
  });

  it("exposes standalone frame encoder and muxer contracts", async () => {
    const encoder = createFrameEncoder({ frameRate: 24, viewport: { width: 64, height: 64 } });
    await encoder.encodeFrame({ frame: 0, time: 0, viewport: { width: 64, height: 64 }, image: "frame" });
    const encoded = await encoder.finalize();
    const muxed = await createAudioMuxer().mux(encoded, [], 24);

    expect(encoded).toMatchObject({ frameCount: 1, container: "webm" });
    expect(muxed).toMatchObject({ audioTrackCount: 0, container: "webm", outputMode: "metadata-only", publishReady: false });

    await expect(createAudioMuxer({ readinessMode: "publish" }).mux(encoded, [{
      id: "dialogue",
      role: "dialogue",
      path: "dialogue.wav",
      startTime: 0,
      duration: 1
    }], 24)).rejects.toThrow(/real muxed output/i);
  });

  it("fails animation performance coverage for static characters", () => {
    const staticPerformance = createAnimationPerformance({
      episodeId: "episode-1",
      frameRate: 24,
      cues: [{
        id: "hero-static",
        characterId: "hero",
        startTime: 0,
        endTime: 1,
        action: "idle"
      }]
    });
    const movingPerformance = createAnimationPerformance({
      episodeId: "episode-1",
      frameRate: 24,
      cues: [{
        id: "hero-wave",
        characterId: "hero",
        startTime: 0,
        endTime: 1,
        action: "wave",
        gestureId: "small-wave"
      }]
    });

    expect(createAnimationPerformanceCoverage(staticPerformance).staticCharacterIds).toEqual(["hero"]);
    expect(createAnimationPerformanceCoverage(staticPerformance).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "performance-character-static" })
    ]));
    expect(createAnimationPerformanceCoverage(movingPerformance).issues).toEqual([]);
  });
});

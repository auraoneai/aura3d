import { describe, expect, it } from "vitest";
import {
  createCloudRenderAdapter,
  createCloudRenderJobRequest,
  createExternalPhonemeAnalyzerAdapter,
  createThumbnailArtifact,
  createYouTubeUploadPackage,
  createYouTubeUploadAdapter,
  validateYouTubeUploadPackage,
  type CartoonEpisodePackageManifest,
  type CartoonRenderOutputPackageMetadata,
  type CartoonRenderQueueArtifact,
  type PublishingPackageArtifact
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
    captureTimes: [0],
    outputs: [{ id: "mp4", kind: "mp4", path: "dist/episode.mp4", mimeType: "video/mp4", codec: "h264" }],
    evidenceTargets: [],
    items: [
      {
        id: "frame-0",
        route: "/cartoon-studio",
        language: "en",
        time: 0,
        frame: 0,
        viewport: { width: 320, height: 180 },
        outputIds: ["mp4"],
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
      mp4: { id: "mp4", kind: "mp4", path: "dist/episode.mp4", mimeType: "video/mp4", codec: "h264" },
      captions: [{ id: "captions-vtt", kind: "caption-vtt", path: "dist/captions.vtt" }],
      thumbnail: { id: "thumbnail", kind: "thumbnail", path: "dist/thumbnail.png", mimeType: "image/png" },
      youtubeMetadata: { id: "youtube", kind: "youtube-metadata", path: "dist/youtube.json", mimeType: "application/json" }
    },
    requiredOutputKinds: ["mp4", "caption-vtt", "thumbnail", "youtube-metadata"],
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
      video: ["dist/episode.mp4"],
      captions: ["dist/captions.vtt"],
      thumbnail: "dist/thumbnail.png",
      evidence: "dist/route-proof.json",
      youtubeDraftMetadata: "dist/youtube.json"
    }
  };
}

function cloudRenderRequest() {
  return createCloudRenderJobRequest({
    provider: "render-farm",
    packageManifest: episodePackageManifest(),
    renderQueue: renderQueue(),
    outputDirectory: "dist/episodes"
  });
}

function publishingPackage(): PublishingPackageArtifact {
  const pkg = outputPackage();
  const thumbnailPlan = {
    kind: "thumbnail-generation-plan" as const,
    episodeId: pkg.episodeId,
    capture: pkg.thumbnailCapture,
    outputPath: "dist/thumbnail.png",
    width: 1280,
    height: 720,
    mimeType: "image/png" as const,
    time: 0.5,
    resizeMode: "cover" as const
  };
  return {
    artifact: "publishing-package",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: pkg.episodeId,
    videoPath: "dist/episode.mp4",
    videoByteLength: 4096,
    captions: [
      {
        kind: "caption-export",
        format: "vtt",
        language: "en",
        cueCount: 1,
        text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello.\n",
        mimeType: "text/vtt",
        byteLength: 50,
        checksum: "caption-test",
        path: "dist/captions.vtt"
      }
    ],
    thumbnailPlan,
    thumbnail: createThumbnailArtifact({
      path: "dist/thumbnail.png",
      viewport: { width: 1280, height: 720 },
      time: 0.5,
      data: new Uint8Array([1, 2, 3, 4]),
      mimeType: "image/png"
    }),
    youtubeMetadata: {
      kind: "youtube-metadata",
      title: "Moon Garden Helpers",
      description: "A short Aura3D cartoon package.",
      tags: ["Aura3D", "cartoon"],
      categoryId: "1",
      defaultLanguage: "en",
      privacyStatus: "private",
      madeForKids: true,
      captionsRequired: true,
      thumbnailPath: "dist/thumbnail.png"
    },
    evidencePath: "dist/evidence.json",
    routeProofPath: "dist/route-proof.json",
    provenancePath: "dist/provenance.json",
    readiness: {
      status: "pass",
      checks: [],
      issues: []
    }
  };
}

function episodePackageManifest(): CartoonEpisodePackageManifest {
  return {
    artifact: "cartoon-episode-package",
    schemaVersion: "aura3d-cartoon-episode-package/v1",
    contractId: "auravoice-aura3d-prompt-animation/v1",
    episodeId: "moon-garden-001",
    packageId: "moon-garden-review-package",
    rootPath: "dist/episode",
    publishTarget: "publish",
    files: [
      { role: "video-mp4", path: "dist/episode.mp4", present: true, byteLength: 4096 },
      { role: "render-manifest-json", path: "render-manifest.json", present: true, byteLength: 1024 }
    ]
  };
}

function phonemeInput() {
  return {
    episodeId: "moon-garden-001",
    characterId: "miko",
    lineId: "line-1",
    language: "en",
    frameRate: 30,
    transcript: "hello moon",
    samples: new Float32Array([0, 0.1, 0.3, 0.2, 0]),
    sampleRate: 5,
    analysisWindowSeconds: 0.2
  };
}

describe("cartoon stretch adapter contracts", () => {
  it("keeps optional external phoneme alignment honest when no provider is configured", async () => {
    const adapter = createExternalPhonemeAnalyzerAdapter({ providerId: "gentle" });
    const result = await adapter.analyze(phonemeInput());

    expect(adapter.capability).toMatchObject({
      supported: false,
      status: "unsupported",
      providerId: "gentle"
    });
    expect(result).toMatchObject({
      ok: false,
      status: "unsupported",
      analysis: {
        analysisKind: "amplitude-only",
        phonemeAlignmentPresent: false,
        manualCorrectionRecommended: true
      }
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "external-phoneme-provider-missing" })
    ]));
  });

  it("accepts an injected external phoneme analyzer without claiming a built-in provider", async () => {
    const adapter = createExternalPhonemeAnalyzerAdapter({
      providerId: "test-phoneme-provider",
      requiresCredentials: true,
      credentialsAvailable: true,
      provider: {
        analyze(input) {
          return {
            kind: "external-phoneme-alignment",
            providerId: "test-phoneme-provider",
            episodeId: input.episodeId,
            characterId: input.characterId,
            lineId: input.lineId,
            language: input.language,
            transcript: input.transcript,
            phonemes: [
              { phoneme: "HH", startTime: 0, endTime: 0.2, confidence: 0.92 },
              { phoneme: "AH", startTime: 0.2, endTime: 0.6, confidence: 0.89 }
            ],
            diagnostics: []
          };
        }
      }
    });

    const result = await adapter.analyze(phonemeInput());

    expect(adapter.capability).toMatchObject({ supported: true, status: "ready", requiresCredentials: true });
    expect(result).toMatchObject({
      ok: true,
      status: "ready",
      analysis: {
        analysisKind: "phoneme-aligned",
        phonemeAlignmentPresent: true,
        manualCorrectionRecommended: false
      },
      alignment: {
        providerId: "test-phoneme-provider",
        phonemes: [
          expect.objectContaining({ phoneme: "HH" }),
          expect.objectContaining({ phoneme: "AH" })
        ]
      }
    });
  });

  it("reports cloud render as unsupported or missing credentials unless a provider is injected", async () => {
    const unsupported = createCloudRenderAdapter({ provider: "render-farm" });
    const unsupportedJob = await unsupported.submit(cloudRenderRequest());

    expect(unsupported.capability).toMatchObject({ supported: false, status: "unsupported" });
    expect(unsupportedJob).toMatchObject({
      kind: "cloud-render-job-result",
      provider: "render-farm",
      status: "unsupported"
    });
    expect(unsupportedJob.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "cloud-render-unconfigured" })
    ]));

    const missingCredentials = createCloudRenderAdapter({
      provider: "render-farm",
      requiresCredentials: true,
      credentialsAvailable: false,
      submit() {
        throw new Error("should not call provider without credentials");
      }
    });
    const missingCredentialJob = await missingCredentials.submit(cloudRenderRequest());
    expect(missingCredentialJob).toMatchObject({ status: "unsupported" });
    expect(missingCredentialJob.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "cloud-render-credentials-missing" })
    ]));

    const ready = createCloudRenderAdapter({
      provider: "render-farm",
      requiresCredentials: true,
      credentialsAvailable: true,
      submit() {
        return {
          kind: "cloud-render-job-result",
          provider: "render-farm",
          jobId: "job-123",
          status: "queued",
          outputUrl: "https://render.example/jobs/job-123",
          diagnostics: []
        };
      }
    });
    const readyJob = await Promise.resolve(ready.submit(cloudRenderRequest()));
    expect(readyJob).toMatchObject({
      status: "queued",
      jobId: "job-123",
      outputUrl: "https://render.example/jobs/job-123"
    });
  });

  it("builds a YouTube upload contract without pretending credentials or real upload exist", async () => {
    const pkg = createYouTubeUploadPackage(publishingPackage());
    expect(validateYouTubeUploadPackage(pkg)).toMatchObject({ status: "pass", diagnostics: [] });

    const unsupported = createYouTubeUploadAdapter({ dryRun: true });
    const unsupportedResult = await unsupported.upload(pkg);

    expect(unsupported.capability).toMatchObject({
      supported: false,
      status: "unsupported",
      requiresCredentials: true
    });
    expect(unsupportedResult).toMatchObject({
      status: "blocked",
      dryRun: true
    });
    expect(unsupportedResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "youtube-upload-unconfigured" })
    ]));

    const missingCredentials = createYouTubeUploadAdapter({
      credentialsAvailable: false,
      upload() {
        throw new Error("should not call provider without credentials");
      }
    });
    const missingCredentialResult = await missingCredentials.upload(pkg);
    expect(missingCredentialResult).toMatchObject({ status: "blocked" });
    expect(missingCredentialResult.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "youtube-upload-credentials-missing" })
    ]));

    const ready = createYouTubeUploadAdapter({
      credentialsAvailable: true,
      dryRun: true,
      upload() {
        return {
          kind: "youtube-upload-result",
          status: "uploaded",
          dryRun: true,
          videoId: "video-123",
          url: "https://studio.youtube.com/video/video-123",
          diagnostics: []
        };
      }
    });
    const readyResult = await Promise.resolve(ready.upload(pkg));
    expect(readyResult).toMatchObject({
      status: "uploaded",
      videoId: "video-123",
      dryRun: true
    });
  });
});
